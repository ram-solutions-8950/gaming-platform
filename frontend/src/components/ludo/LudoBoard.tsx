import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import type { LudoColor, LudoPlayer, LudoToken, LudoTokenStyle } from '../../types/ludo';
import { soundManager } from '../../services/soundManager';

export interface ActiveMoveAnimation {
  id: string;
  playerColor: LudoColor;
  playerId: string;
  tokenIndex: number;
  fromPosition: number;
  toPosition: number;
  isCapture: boolean;
  capturedToken?: { playerId: string; tokenIndex: number };
  isHome: boolean;
}

interface Props {
  players: LudoPlayer[];
  currentTurnColor: LudoColor | null;
  legalTokenIndices: number[];
  onTokenClick: (tokenIndex: number) => void;
  isMyTurn?: boolean;
  tokenStyle?: LudoTokenStyle;
  diceValue?: number | null;
  activeMove?: ActiveMoveAnimation | null;
  onMoveAnimationEnd?: () => void;
}

// The board is drawn in a 1500×1500 viewBox: a 15×15 grid of 100-unit squares.
const CELL = 100;
const COLORS: LudoColor[] = ['RED', 'GREEN', 'YELLOW', 'BLUE'];

const COLOR_HEX: Record<LudoColor, string> = {
  RED: '#E52521',
  GREEN: '#00A651',
  YELLOW: '#FFD600',
  BLUE: '#0084E6',
};

// 52 Common Track Cells in clockwise order (Grid 15x15, [column, row], 0..14)
const TRACK_COORDINATES: Array<[number, number]> = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // 0..4 (top-left start = 0)
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 5..10 (6, 2 = Star 8)
  [7, 0], [8, 0], // 11, 12
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 13..17 (top-right start = 13)
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 18..23 (12, 6 = Star 21)
  [14, 7], [14, 8], // 24, 25
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 26..30 (bottom-right start = 26)
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 31..36 (8, 12 = Star 34)
  [7, 14], [6, 14], // 37, 38
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 39..43 (bottom-left start = 39)
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 44..49 (2, 8 = Star 47)
  [0, 7], [0, 6], // 50, 51
];

// Everything a colour owns sits by its corner of the board: its yard, its start
// square, its home stretch and its home triangle. Corners run clockwise from
// the top-left, where the common track starts.
type Corner = 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft';

interface CornerGeometry {
  yard: [number, number]; // top-left of the 600×600 yard, board units
  sockets: Array<[number, number]>; // yard pedestals, [column, row]
  startTrackIndex: number;
  homePath: Array<[number, number]>; // steps 51..55, [column, row]
  homeTriangle: string;
  homeCentroid: [number, number]; // where finished tokens gather, clear of the centre medallion
  heading: number; // direction out of the start square and into the home stretch (degrees, 0 = right)
}

const CORNER_GEOMETRY: Record<Corner, CornerGeometry> = {
  topLeft: {
    yard: [0, 0],
    sockets: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],
    startTrackIndex: 0,
    homePath: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    homeTriangle: '600,600 750,750 600,900',
    homeCentroid: [650, 750],
    heading: 0,
  },
  topRight: {
    yard: [900, 0],
    sockets: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
    startTrackIndex: 13,
    homePath: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    homeTriangle: '600,600 750,750 900,600',
    homeCentroid: [750, 650],
    heading: 90,
  },
  bottomRight: {
    yard: [900, 900],
    sockets: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
    startTrackIndex: 26,
    homePath: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    homeTriangle: '900,600 750,750 900,900',
    homeCentroid: [850, 750],
    heading: 180,
  },
  bottomLeft: {
    yard: [0, 900],
    sockets: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
    startTrackIndex: 39,
    homePath: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    homeTriangle: '600,900 750,750 900,900',
    homeCentroid: [750, 850],
    heading: 270,
  },
};

// Corner placement matching user's layout:
// Top-Left: RED, Top-Right: GREEN, Bottom-Right: YELLOW, Bottom-Left: BLUE.
// Opposite pairs: RED vs YELLOW, GREEN vs BLUE.
// Side-wise pairs: RED & BLUE (left), GREEN & YELLOW (right), RED & GREEN (top), BLUE & YELLOW (bottom).
const COLOR_CORNER: Record<LudoColor, Corner> = {
  RED: 'topLeft',
  GREEN: 'topRight',
  YELLOW: 'bottomRight',
  BLUE: 'bottomLeft',
};

const byColor = <T,>(pick: (g: CornerGeometry) => T) =>
  Object.fromEntries(COLORS.map((c) => [c, pick(CORNER_GEOMETRY[COLOR_CORNER[c]])])) as Record<LudoColor, T>;

const HOME_PATHS = byColor((g) => g.homePath);
const YARD_COORDINATES = byColor((g) => g.sockets);
const YARD_ORIGINS = byColor((g) => g.yard);
const HOME_TRIANGLE_POINTS = byColor((g) => g.homeTriangle);
const HOME_TRIANGLE_CENTROIDS = byColor((g) => g.homeCentroid);
const START_OFFSETS = byColor((g) => g.startTrackIndex);

// Squares where nobody can be captured: every colour's start square plus the
// four stars (mirrors SAFE_CELLS in backend/app/services/ludo/board.py).
const STAR_TRACK_INDICES = [8, 21, 34, 47];
const SAFE_TRACK_INDICES = new Set([0, 13, 26, 39, ...STAR_TRACK_INDICES]);

const COLOR_HEADING = byColor((g) => g.heading);

// The pawn artwork is drawn ~100 units tall around its own (0, 0) anchor, with
// the crown reaching far above it. Shrink it to fit inside one square and drop
// it so its base stands in the lower part of the square it belongs to.
const PAWN_FIT_SCALE = 0.86;
const PAWN_SETTLE_Y = 18;
// Where the pawn's base meets the board, relative to the square's centre.
const PAWN_GROUND_Y = 32;

// Several pawns on one square shrink and spread out so the group stays inside
// it. Offsets are relative to the square's centre.
const CLUSTER_LAYOUTS: Array<{ scale: number; offsets: Array<[number, number]> }> = [
  { scale: 1, offsets: [[0, 0]] },
  { scale: 0.7, offsets: [[-22, 0], [22, 0]] },
  { scale: 0.6, offsets: [[-22, -12], [22, -12], [0, 16]] },
  { scale: 0.54, offsets: [[-22, -14], [22, -14], [-22, 16], [22, 16]] },
];
// A home triangle narrows towards its tip, so finished pawns stay small.
const HOME_MAX_SCALE = 0.6;

// Walking animation timing (ms per square) and hop height (board units).
const HOP_MS = 140;
const YARD_EXIT_MS = 280;
const HOP_HEIGHT = 30;

const cellCenter = ([gx, gy]: [number, number]): [number, number] => [
  gx * CELL + CELL / 2,
  gy * CELL + CELL / 2,
];

const trackIndexOf = (color: LudoColor, step: number) => (START_OFFSETS[color] + step) % 52;

// A token flagged home is drawn home even if its position lags behind.
const effectiveStep = (token: LudoToken) => (token.is_home ? 56 : token.position);

// Board-space centre of the spot a `color` token occupies at `step`
// (-1 = yard, 0..50 = track, 51..55 = home stretch, 56 = home).
const stepToPoint = (step: number, color: LudoColor, tokenIndex = 0): [number, number] => {
  if (step < 0) return cellCenter(YARD_COORDINATES[color][tokenIndex] ?? YARD_COORDINATES[color][0]);
  if (step >= 56) return HOME_TRIANGLE_CENTROIDS[color];
  if (step > 50) return cellCenter(HOME_PATHS[color][step - 51]);
  return cellCenter(TRACK_COORDINATES[trackIndexOf(color, step)]);
};

const cellKeyOf = (token: LudoToken, color: LudoColor): string => {
  const step = effectiveStep(token);
  if (step < 0) return `yard_${color}_${token.token_index}`;
  if (step >= 56) return `home_${color}`;
  if (step > 50) return `stretch_${color}_${step - 51}`;
  return `track_${trackIndexOf(color, step)}`;
};

const clusterSlot = (count: number, idx: number, isHome: boolean) => {
  let slot: { dx: number; dy: number; scale: number };
  if (count <= CLUSTER_LAYOUTS.length) {
    const layout = CLUSTER_LAYOUTS[Math.max(count, 1) - 1];
    const [dx, dy] = layout.offsets[idx] ?? [0, 0];
    slot = { dx, dy, scale: layout.scale };
  } else {
    // 5+ pawns only happen on a shared safe square in a 4-player game.
    const rows = Math.ceil(count / 3);
    slot = { dx: ((idx % 3) - 1) * 28, dy: (Math.floor(idx / 3) - (rows - 1) / 2) * 30, scale: 0.42 };
  }
  return isHome ? { ...slot, scale: Math.min(slot.scale, HOME_MAX_SCALE) } : slot;
};

// The walking pawn is drawn in its own small <svg> (this viewBox, in pawn-local
// units) that moves as a whole. Its size is 100 × 110 board units, so a
// translate of N% of its own width is N board units.
const WALKER_VIEWBOX = '-50 -60 100 110';
const walkerTransform = (x: number, y: number, lift = 0) =>
  `translate(${x - 50}%, ${((y - lift - 60) / 110) * 100}%)`;

interface StepRipple {
  id: string;
  cx: number;
  cy: number;
}

interface ImpactEffect {
  id: string;
  type: 'CAPTURE' | 'HOME' | 'SAFE';
  cx: number;
  cy: number;
}

// A move being animated: the walking pawn leaves the pawn layer and hops
// through these board points in its own layer (the walker).
interface Walk {
  moveId: string;
  color: LudoColor;
  waypoints: Array<[number, number]>;
  hopMs: number;
}

// -----------------------------------------------------------------
// 3D Luxury Pawn Renderers (Royal Crown, Knight Helm, Arcade Gem)
// -----------------------------------------------------------------
const renderPawnGraphic = (
  style: LudoTokenStyle,
  cx: number,
  cy: number,
  color: LudoColor,
  isLegal: boolean
) => {
  const colorHex = COLOR_HEX[color];
  if (style === 'KNIGHT_HELM') {
    return (
      <g>
        {/* Heavy Armored Gold Pedestal */}
        <ellipse
          cx={cx}
          cy={cy + 14}
          rx="28"
          ry="9.5"
          fill="#fbbf24"
          stroke="#451a03"
          strokeWidth="1.2"
        />
        <ellipse
          cx={cx}
          cy={cy + 10}
          rx="24"
          ry="7"
          fill={colorHex}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
          strokeWidth={isLegal ? 2.5 : 1}
        />
        {/* Rivets on Base */}
        <circle cx={cx - 18} cy={cy + 12} r="1.5" fill="#ffffff" />
        <circle cx={cx + 18} cy={cy + 12} r="1.5" fill="#ffffff" />

        {/* Angular Chiseled Breastplate */}
        <path
          d={`M ${cx - 21},${cy + 10} L ${cx - 23},${cy - 2} L ${cx - 12},${cy - 22} L ${cx - 8},${cy - 28} L ${cx + 8},${cy - 28} L ${cx + 12},${cy - 22} L ${cx + 23},${cy - 2} L ${cx + 21},${cy + 10} Z`}
          fill={colorHex}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.4)'}
          strokeWidth={isLegal ? 2 : 0.8}
        />

        {/* Center Chivalry Shield Badge */}
        <path
          d={`M ${cx},${cy - 16} L ${cx + 7},${cy - 9} L ${cx},${cy + 2} L ${cx - 7},${cy - 9} Z`}
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="0.8"
        />
        <circle cx={cx} cy={cy - 8} r="2.2" fill="#ffffff" />

        {/* Armored Gorget Collar */}
        <ellipse
          cx={cx}
          cy={cy - 28}
          rx="13"
          ry="5"
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="1"
        />

        {/* 3D Greathelm Face */}
        <path
          d={`M ${cx - 16},${cy - 28} C ${cx - 19},${cy - 42} ${cx - 16},${cy - 58} ${cx},${cy - 62} C ${cx + 16},${cy - 58} ${cx + 19},${cy - 42} ${cx + 16},${cy - 28} Z`}
          fill={colorHex}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
          strokeWidth={isLegal ? 3 : 1.2}
        />

        {/* Steel Visor Faceplate */}
        <path
          d={`M ${cx - 14},${cy - 34} L ${cx},${cy - 30} L ${cx + 14},${cy - 34} L ${cx + 11},${cy - 46} L ${cx},${cy - 44} L ${cx - 11},${cy - 46} Z`}
          fill="#090d16"
          stroke="#fbbf24"
          strokeWidth="1.2"
        />

        {/* Radiant Glowing Eye-Slit Visor */}
        <line
          x1={cx - 10}
          y1={cy - 39}
          x2={cx + 10}
          y2={cy - 39}
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1={cx - 9}
          y1={cy - 39}
          x2={cx + 9}
          y2={cy - 39}
          stroke="#fbbf24"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Aerodynamic Golden Plume Battle Crest */}
        <path
          d={`M ${cx - 4},${cy - 60} C ${cx - 2},${cy - 74} ${cx + 15},${cy - 76} ${cx + 18},${cy - 62} C ${cx + 12},${cy - 64} ${cx + 4},${cy - 62} ${cx + 4},${cy - 60} Z`}
          fill="#fbbf24"
          stroke="#78350f"
          strokeWidth="1"
        />
      </g>
    );
  }

  if (style === 'ARCADE_DIAMOND') {
    return (
      <g>
        {/* Floating Anti-Gravity Gyro Base */}
        <ellipse cx={cx} cy={cy + 13} rx="26" ry="8" fill="#fbbf24" stroke="#451a03" />
        <ellipse cx={cx} cy={cy + 10} rx="20" ry="6" fill="#090d16" />
        <ellipse
          cx={cx}
          cy={cy + 10}
          rx="14"
          ry="4"
          fill={colorHex}
        />

        {/* Faceted Prism Pillar Body */}
        <polygon
          points={`${cx - 16},${cy + 9} ${cx - 10},${cy - 26} ${cx + 10},${cy - 26} ${cx + 16},${cy + 9}`}
          fill={colorHex}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.4)'}
          strokeWidth={isLegal ? 2 : 0.8}
        />
        <line
          x1={cx}
          y1={cy - 26}
          x2={cx}
          y2={cy + 9}
          stroke="#ffffff"
          strokeWidth="1.5"
          opacity="0.6"
        />

        {/* Orbiting Neon Energy Gyro Ring */}
        <ellipse
          cx={cx}
          cy={cy - 12}
          rx="23"
          ry="7"
          fill="none"
          stroke="#fef08a"
          strokeWidth="2"
          strokeDasharray="12,5"
          transform={`rotate(-15 ${cx} ${cy - 12})`}
        />

        {/* 3D Brilliant-Cut Diamond Gem Head */}
        {/* Table & Crown */}
        <polygon
          points={`${cx - 12},${cy - 62} ${cx + 12},${cy - 62} ${cx + 18},${cy - 50} ${cx - 18},${cy - 50}`}
          fill={colorHex}
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
        {/* Pavilion point */}
        <polygon
          points={`${cx - 18},${cy - 50} ${cx + 18},${cy - 50} ${cx},${cy - 28}`}
          fill={colorHex}
          stroke="#fbbf24"
          strokeWidth="1.5"
        />
        {/* Refracting Diamond Facets */}
        <polygon
          points={`${cx - 7},${cy - 62} ${cx + 7},${cy - 62} ${cx},${cy - 50}`}
          fill="#ffffff"
          opacity="0.45"
        />
        <polygon
          points={`${cx - 18},${cy - 50} ${cx},${cy - 50} ${cx},${cy - 28}`}
          fill="#000000"
          opacity="0.25"
        />
        <polygon
          points={`${cx + 18},${cy - 50} ${cx},${cy - 50} ${cx},${cy - 28}`}
          fill="#ffffff"
          opacity="0.4"
        />
        {/* Diamond Sparkle Glint */}
        <circle cx={cx - 5} cy={cy - 54} r="3" fill="#ffffff" />
      </g>
    );
  }

  // Default: ROYAL_CROWN (Majestic 3D Royal Luxury Crown Pawn)
  return (
    <g>
      {/* Metallic Heavyweight Base Rim (Outer Gold Trim) */}
      <ellipse
        cx={cx}
        cy={cy + 13}
        rx="27"
        ry="9.5"
        fill="#fbbf24"
        stroke="#451a03"
        strokeWidth="1"
      />

      {/* Inset Shadow Groove */}
      <ellipse cx={cx} cy={cy + 11} rx="24" ry="7.5" fill="#090d16" />

      {/* Pawn Base Top Plate: Rich Jewel Disc */}
      <ellipse
        cx={cx}
        cy={cy + 10}
        rx="22"
        ry="7"
        fill={COLOR_HEX[color]}
        stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
        strokeWidth={isLegal ? 2.8 : 1.2}
      />

      {/* Sculpted Elegant Chalice Pawn Body */}
      <path
        d={`M ${cx - 20},${cy + 10} C ${cx - 18},${cy - 6} ${cx - 10},${cy - 22} ${cx - 7},${cy - 30} L ${cx + 7},${cy - 30} C ${cx + 10},${cy - 22} ${cx + 18},${cy - 6} ${cx + 20},${cy + 10} Z`}
        fill={COLOR_HEX[color]}
        stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isLegal ? 2.5 : 0.8}
      />

      {/* Vertical Cylindrical Specular Sheen */}
      <path
        d={`M ${cx - 14},${cy + 8} C ${cx - 13},${cy - 5} ${cx - 7},${cy - 18} ${cx - 4},${cy - 26} L ${cx},${cy - 26} C ${cx - 3},${cy - 18} ${cx - 9},${cy - 5} ${cx - 9},${cy + 8} Z`}
        fill="#ffffff"
        opacity="0.35"
      />

      {/* Polished Gold Collar Ring */}
      <ellipse
        cx={cx}
        cy={cy - 30}
        rx="12.5"
        ry="4.5"
        fill="#fbbf24"
        stroke="#78350f"
        strokeWidth="1"
      />
      {/* Micro-Diamond Rivets on Collar */}
      <circle cx={cx - 6} cy={cy - 30} r="1.4" fill="#ffffff" />
      <circle cx={cx} cy={cy - 30} r="1.8" fill="#fef08a" />
      <circle cx={cx + 6} cy={cy - 30} r="1.4" fill="#ffffff" />

      {/* Spherical Crown Head */}
      <circle
        cx={cx}
        cy={cy - 48}
        r="19"
        fill={COLOR_HEX[color]}
        stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
        strokeWidth={isLegal ? 3 : 1.2}
      />

      {/* Head Specular Crescent Glint */}
      <ellipse
        cx={cx - 6}
        cy={cy - 54}
        rx="6.5"
        ry="3.5"
        fill="#ffffff"
        opacity="0.6"
        transform={`rotate(-25 ${cx - 6} ${cy - 54})`}
      />
      {/* Pinpoint Sparkle Star */}
      <circle cx={cx - 11} cy={cy - 48} r="2.2" fill="#ffffff" opacity="0.95" />

      {/* Imperial Golden 3-Point Crown */}
      <polygon
        points={`${cx - 14},${cy - 50} ${cx - 12},${cy - 65} ${cx - 5},${cy - 54} ${cx},${cy - 72} ${cx + 5},${cy - 54} ${cx + 12},${cy - 65} ${cx + 14},${cy - 50}`}
        fill="#fbbf24"
        stroke="#78350f"
        strokeWidth="1.2"
      />
      {/* Crown Finials */}
      <circle cx={cx} cy={cy - 73} r="4" fill="#fbbf24" stroke="#78350f" strokeWidth="0.8" />
      <circle cx={cx - 12} cy={cy - 66} r="3" fill="#fbbf24" stroke="#78350f" strokeWidth="0.6" />
      <circle cx={cx + 12} cy={cy - 66} r="3" fill="#fbbf24" stroke="#78350f" strokeWidth="0.6" />

      {/* Center Crown Ruby/Gem Inlay */}
      <circle
        cx={cx}
        cy={cy - 56}
        r="3"
        fill={COLOR_HEX[color]}
        stroke="#fef08a"
        strokeWidth="0.8"
      />
    </g>
  );
};

// Small arrowhead pointing right, centred on (cx, cy); rotate it to point elsewhere.
const arrowPoints = (cx: number, cy: number, size: number) =>
  `${cx - size * 0.5},${cy - size * 0.55} ${cx + size * 0.6},${cy} ${cx - size * 0.5},${cy + size * 0.55}`;

// -----------------------------------------------------------------
// Static board artwork: never changes, so it is built once and React skips it
// on every re-render (including each frame of a walking animation).
// -----------------------------------------------------------------
const renderBoardArt = () => (
  <>
    <defs>
      {/* Board boundary clip path */}
      <clipPath id="ludoBoardClip">
        <rect width="1500" height="1500" rx="28" />
      </clipPath>
    </defs>

    <g clipPath="url(#ludoBoardClip)">
      {/* Board Background: Pure Clean Crisp White */}
      <rect width="1500" height="1500" fill="#ffffff" />

      {/* 4 Large Corner Yards with Simple Pure Colors & Concentric Spot Rings */}
      {(
        [
          { color: 'RED', label: 'Player 2', labelX: 42, labelY: 300, rot: -90 },
          { color: 'GREEN', label: 'Player 3', labelX: 1200, labelY: 42, rot: 0 },
          { color: 'YELLOW', label: 'Player 4', labelX: 1458, labelY: 1200, rot: 90 },
          { color: 'BLUE', label: 'Player 1', labelX: 300, labelY: 1458, rot: 0 },
        ] as const
      ).map((yard) => {
        const [ox, oy] = YARD_ORIGINS[yard.color];
        return (
          <g key={`yard-${yard.color}`}>
            {/* Outer Yard Solid Color */}
            <rect
              x={ox}
              y={oy}
              width="600"
              height="600"
              fill={COLOR_HEX[yard.color]}
              stroke="#333333"
              strokeWidth="2"
            />

            {/* Inner White Box */}
            <rect
              x={ox + 80}
              y={oy + 80}
              width="440"
              height="440"
              fill="#ffffff"
              rx="28"
              stroke="#333333"
              strokeWidth="2"
            />

            {/* 4 Concentric Spot Rings matching classic Ludo Board */}
            {YARD_COORDINATES[yard.color].map((socket, idx) => {
              const [sx, sy] = cellCenter(socket);
              return (
                <g key={`${yard.color}-sock-${idx}`}>
                  <circle cx={sx} cy={sy} r="52" fill="#ffffff" stroke={COLOR_HEX[yard.color]} strokeWidth="12" />
                  <circle cx={sx} cy={sy} r="30" fill="#ffffff" stroke={COLOR_HEX[yard.color]} strokeWidth="6" />
                  <circle cx={sx} cy={sy} r="14" fill={COLOR_HEX[yard.color]} />
                </g>
              );
            })}

            {/* Outer Player Label (Matching the Screenshot) */}
            <text
              x={yard.labelX}
              y={yard.labelY}
              fill="#ffffff"
              fontSize="34"
              fontWeight="900"
              letterSpacing="2"
              textAnchor="middle"
              transform={yard.rot !== 0 ? `rotate(${yard.rot} ${yard.labelX} ${yard.labelY})` : undefined}
              style={{ userSelect: 'none' }}
            >
              {yard.label}
            </text>
          </g>
        );
      })}

      {/* Common Track Grid Cells: Pure white background with crisp grid borders */}
      {TRACK_COORDINATES.map((coord, i) => {
        const [gx, gy] = coord;
        const [cx, cy] = cellCenter(coord);
        const startColor = COLORS.find((c) => START_OFFSETS[c] === i);
        const entryColor = COLORS.find((c) => trackIndexOf(c, 50) === i);
        const isStar = STAR_TRACK_INDICES.includes(i);

        return (
          <g key={`track-${i}`}>
            <rect
              x={gx * CELL}
              y={gy * CELL}
              width={CELL}
              height={CELL}
              fill={startColor ? COLOR_HEX[startColor] : '#ffffff'}
              stroke="#333333"
              strokeWidth="2"
            />
            {isStar && (
              <text x={cx} y={cy + 15} fill="#475569" fontSize="48" textAnchor="middle" fontWeight="bold">
                ☆
              </text>
            )}
            {startColor && (
              <polygon
                points={arrowPoints(cx, cy, 48)}
                fill="#ffffff"
                transform={`rotate(${COLOR_HEADING[startColor]} ${cx} ${cy})`}
              />
            )}
            {entryColor && (
              <polygon
                points={arrowPoints(cx, cy, 38)}
                fill={COLOR_HEX[entryColor]}
                transform={`rotate(${COLOR_HEADING[entryColor]} ${cx} ${cy})`}
              />
            )}
          </g>
        );
      })}

      {/* Home Stretch Paths: 5 Pure Solid Color Squares Leading into Center */}
      {COLORS.map((color) =>
        HOME_PATHS[color].map((coord, i) => {
          const [gx, gy] = coord;
          return (
            <rect
              key={`${color}-h-${i}`}
              x={gx * CELL}
              y={gy * CELL}
              width={CELL}
              height={CELL}
              fill={COLOR_HEX[color]}
              stroke="#333333"
              strokeWidth="2"
            />
          );
        })
      )}

      {/* Center Home Triangles meeting cleanly at the exact center (pure simple colors, no gradients) */}
      {COLORS.map((color) => (
        <polygon
          key={`home-tri-${color}`}
          points={HOME_TRIANGLE_POINTS[color]}
          fill={COLOR_HEX[color]}
          stroke="#333333"
          strokeWidth="2"
        />
      ))}
    </g>

    {/* Board outline */}
    <rect x="1" y="1" width="1498" height="1498" rx="28" fill="none" stroke="#333333" strokeWidth="3" />
  </>
);

// Gradients removed — simple pure colors throughout
const renderPawnDefs = () => <defs />;

const LudoBoardView: React.FC<Props> = ({
  players,
  currentTurnColor,
  legalTokenIndices,
  onTokenClick,
  isMyTurn,
  tokenStyle = 'ROYAL_CROWN',
  diceValue = null,
  activeMove = null,
  onMoveAnimationEnd,
}) => {
  const [hoveredTokenIndex, setHoveredTokenIndex] = useState<number | null>(null);
  const [boardShaking, setBoardShaking] = useState<boolean>(false);
  const [stepRipples, setStepRipples] = useState<StepRipple[]>([]);
  const [impactEffects, setImpactEffects] = useState<ImpactEffect[]>([]);
  const [walk, setWalk] = useState<Walk | null>(null);
  const walkerPawnRef = useRef<SVGSVGElement>(null);
  const walkerShadowRef = useRef<SVGSVGElement>(null);

  const onMoveAnimationEndRef = useRef(onMoveAnimationEnd);
  useEffect(() => {
    onMoveAnimationEndRef.current = onMoveAnimationEnd;
  }, [onMoveAnimationEnd]);

  const boardArt = useMemo(() => renderBoardArt(), []);
  const pawnDefs = useMemo(() => renderPawnDefs(), []);

  // One artwork per colour/highlight, drawn at (0, 0) and positioned by its
  // parent group, so every pawn of a colour shares the same element.
  const pawnArt = useMemo(() => {
    const art: Record<string, React.ReactElement> = {};
    COLORS.forEach((color) => {
      [false, true].forEach((legal) => {
        art[`${color}_${legal}`] = renderPawnGraphic(tokenStyle, 0, 0, color, legal);
      });
    });
    return art;
  }, [tokenStyle]);

  const isWalkingToken = (color: LudoColor, tokenIndex: number) =>
    Boolean(activeMove && activeMove.playerColor === color && activeMove.tokenIndex === tokenIndex);

  // Which tokens share each square, so they can be spread out instead of stacked.
  const cellOccupants = useMemo(() => {
    const map = new Map<string, string[]>();
    players.forEach((player) => {
      player.tokens.forEach((token) => {
        // The walking token has left its square; let the pawns it leaves behind spread back out.
        if (
          activeMove &&
          activeMove.playerColor === player.color &&
          activeMove.tokenIndex === token.token_index
        ) {
          return;
        }
        const key = cellKeyOf(token, player.color);
        const list = map.get(key) ?? [];
        list.push(`${player.id}:${token.token_index}`);
        map.set(key, list);
      });
    });
    return map;
  }, [players, activeMove]);

  const addRipple = (cx: number, cy: number) => {
    const id = `${Date.now()}_${Math.random()}`;
    setStepRipples((prev) => [...prev.slice(-6), { id, cx, cy }]);
    setTimeout(() => {
      setStepRipples((prev) => prev.filter((r) => r.id !== id));
    }, 400);
  };

  const addImpact = (type: ImpactEffect['type'], cx: number, cy: number, durationMs: number) => {
    const id = `${Date.now()}_${type}`;
    setImpactEffects((prev) => [...prev, { id, type, cx, cy }]);
    setTimeout(() => {
      setImpactEffects((prev) => prev.filter((i) => i.id !== id));
    }, durationMs);
  };

  // -----------------------------------------------------------------
  // Walking animation: the token hops square by square along its path.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!activeMove) {
      setWalk(null);
      return;
    }

    const color = activeMove.playerColor;
    const waypoints: Array<[number, number]> = [stepToPoint(activeMove.fromPosition, color, activeMove.tokenIndex)];
    if (activeMove.fromPosition < 0) {
      waypoints.push(stepToPoint(0, color, activeMove.tokenIndex));
    } else {
      for (let s = activeMove.fromPosition + 1; s <= activeMove.toPosition; s++) {
        waypoints.push(stepToPoint(s, color, activeMove.tokenIndex));
      }
    }

    if (waypoints.length < 2) {
      onMoveAnimationEndRef.current?.();
      return;
    }

    setWalk({
      moveId: activeMove.id,
      color,
      waypoints,
      hopMs: activeMove.fromPosition < 0 ? YARD_EXIT_MS : HOP_MS,
    });
  }, [activeMove]);

  // One keyframe animation moves the walker's own layer through the whole path,
  // so the compositor runs the walk: no re-render or repaint per frame, which
  // is what made moves stutter on low-end phones.
  useLayoutEffect(() => {
    const move = activeMove;
    const pawnEl = walkerPawnRef.current;
    const shadowEl = walkerShadowRef.current;
    if (!walk || !move || walk.moveId !== move.id || !pawnEl || !shadowEl) return;

    const { waypoints, hopMs } = walk;
    const hops = waypoints.length - 1;
    const pawnFrames: Keyframe[] = [];
    const shadowFrames: Keyframe[] = [];
    waypoints.forEach(([x, y], i) => {
      // Rise out of each square, peak halfway, drop into the next one; the
      // shadow stays on the board.
      pawnFrames.push({ offset: i / hops, transform: walkerTransform(x, y), easing: 'ease-out' });
      shadowFrames.push({ offset: i / hops, transform: walkerTransform(x, y), easing: 'ease-out' });
      if (i < hops) {
        const [nx, ny] = waypoints[i + 1];
        const mx = (x + nx) / 2;
        const my = (y + ny) / 2;
        pawnFrames.push({ offset: (i + 0.5) / hops, transform: walkerTransform(mx, my, HOP_HEIGHT), easing: 'ease-in' });
        shadowFrames.push({ offset: (i + 0.5) / hops, transform: walkerTransform(mx, my), easing: 'ease-in' });
      }
    });
    const timing: KeyframeAnimationOptions = { duration: hops * hopMs, fill: 'forwards' };
    const pawnAnim = pawnEl.animate(pawnFrames, timing);
    const shadowAnim = shadowEl.animate(shadowFrames, timing);

    const timers: number[] = [];
    soundManager.play('ludo_step');
    for (let i = 1; i < hops; i++) {
      timers.push(
        window.setTimeout(() => {
          addRipple(waypoints[i][0], waypoints[i][1]);
          soundManager.play('ludo_step');
        }, i * hopMs)
      );
    }

    const [x, y] = waypoints[hops];
    pawnAnim.finished
      .then(() => {
        addRipple(x, y);
        if (move.isCapture) {
          soundManager.play('ludo_capture');
          setBoardShaking(true);
          timers.push(window.setTimeout(() => setBoardShaking(false), 420));
          addImpact('CAPTURE', x, y, 600);
          try {
            navigator.vibrate?.([50, 40, 70]);
          } catch {}
        } else if (move.isHome) {
          soundManager.play('ludo_home');
          addImpact('HOME', x, y, 800);
        } else if (
          move.toPosition <= 50 &&
          STAR_TRACK_INDICES.includes(trackIndexOf(walk.color, move.toPosition))
        ) {
          soundManager.play('ludo_safe');
          addImpact('SAFE', x, y, 550);
        } else {
          soundManager.play('ludo_land');
        }
        timers.push(window.setTimeout(() => onMoveAnimationEndRef.current?.(), 140));
      })
      // Cancelled: a newer move or unmount took over.
      .catch(() => {});

    return () => {
      pawnAnim.cancel();
      shadowAnim.cancel();
      timers.forEach((id) => clearTimeout(id));
    };
  }, [walk]);

  // -----------------------------------------------------------------
  // Destination preview for the hovered token, or the only movable one
  // -----------------------------------------------------------------
  const preview = useMemo(() => {
    if (activeMove || !isMyTurn || !currentTurnColor || !diceValue || diceValue < 1) return null;

    const myPlayer = players.find((p) => p.color === currentTurnColor);
    if (!myPlayer) return null;

    let tokenIdx =
      hoveredTokenIndex !== null && legalTokenIndices.includes(hoveredTokenIndex) ? hoveredTokenIndex : null;
    if (tokenIdx === null && legalTokenIndices.length === 1) {
      tokenIdx = legalTokenIndices[0];
    }
    if (tokenIdx === null) return null;

    const token = myPlayer.tokens.find((t) => t.token_index === tokenIdx);
    if (!token || token.is_home || token.position >= 56) return null;

    const targetStep = token.position < 0 ? 0 : token.position + diceValue;
    if (targetStep > 56) return null;

    // Squares crossed on the way (not including the landing square)
    const trail: Array<[number, number]> = [];
    for (let s = Math.max(token.position + 1, 0); s < targetStep; s++) {
      trail.push(stepToPoint(s, currentTurnColor));
    }

    const [x, y] = stepToPoint(targetStep, currentTurnColor, token.token_index);
    const onTrack = targetStep <= 50;
    const targetTrackIdx = onTrack ? trackIndexOf(currentTurnColor, targetStep) : -1;
    const isSafe = onTrack && SAFE_TRACK_INDICES.has(targetTrackIdx);
    const isCapture =
      onTrack &&
      !isSafe &&
      players.some(
        (p) =>
          p.color !== currentTurnColor &&
          p.tokens.some(
            (ot) =>
              !ot.is_home &&
              ot.position >= 0 &&
              ot.position <= 50 &&
              trackIndexOf(p.color, ot.position) === targetTrackIdx
          )
      );

    return {
      color: currentTurnColor,
      x,
      y,
      trail,
      isCapture,
      isSafe,
      isHome: targetStep === 56,
    };
  }, [activeMove, isMyTurn, currentTurnColor, diceValue, hoveredTokenIndex, legalTokenIndices, players]);

  // -----------------------------------------------------------------
  // Token placement: every token's final board position, cluster scale and state
  // -----------------------------------------------------------------
  const isInFlight = Boolean(walk && activeMove && walk.moveId === activeMove.id);
  const renderedTokens = players
    .flatMap((player) =>
      player.tokens.flatMap((token) => {
        const walking = isWalkingToken(player.color, token.token_index);
        // In flight: drawn by the walker layer instead.
        if (walking && isInFlight) return [];
        const isTurnColor = currentTurnColor === player.color;
        const isLegal = Boolean(
          isMyTurn && isTurnColor && !activeMove && legalTokenIndices.includes(token.token_index)
        );

        let x: number;
        let y: number;
        let scale = 1;

        if (walking && activeMove) {
          [x, y] = stepToPoint(activeMove.fromPosition, player.color, token.token_index);
        } else {
          const cellKey = cellKeyOf(token, player.color);
          [x, y] = stepToPoint(effectiveStep(token), player.color, token.token_index);
          if (!cellKey.startsWith('yard_')) {
            const occupants = cellOccupants.get(cellKey) ?? [];
            const slot = clusterSlot(
              occupants.length,
              Math.max(0, occupants.indexOf(`${player.id}:${token.token_index}`)),
              cellKey.startsWith('home_')
            );
            x += slot.dx;
            y += slot.dy;
            scale = slot.scale;
          }
        }

        return [
          {
            key: `tok-${player.id}-${token.token_index}`,
            color: player.color,
            tokenIndex: token.token_index,
            x,
            y,
            scale,
            walking,
            isLegal,
            dimmed: Boolean(isMyTurn && isTurnColor && !activeMove && !isLegal && legalTokenIndices.length > 0),
          },
        ];
      })
    )
    // Paint back-to-front: lower pawns overlap the ones above them, movable
    // pawns sit on top so they are always tappable, and the walker goes last.
    .sort(
      (a, b) =>
        Number(a.walking) - Number(b.walking) || Number(a.isLegal) - Number(b.isLegal) || a.y - b.y
    );

  const legalRings = renderedTokens.filter((t) => t.isLegal);

  return (
    <div
      className={`ludo-board-wrapper relative w-full max-w-[min(90vw,calc(100dvh-var(--safe-top)-var(--safe-bottom)-100px),430px)] aspect-square rounded-2xl p-1.5 sm:p-2 bg-slate-900 border-2 border-amber-500/40 shadow-2xl overflow-hidden flex items-center justify-center shrink-0 ${
        boardShaking ? 'animate-board-impact' : ''
      }`}
    >
      <div className="ludo-board-stage">
        {/* Static board: painted once, never repainted by moving or pulsing pawns */}
        <svg viewBox="0 0 1500 1500" className="w-full h-full select-none rounded-xl" aria-hidden="true">
          {boardArt}
        </svg>

        {/* Under the pawns: pulsing rings on movable pawns and footstep ripples.
            HTML animated with transform/opacity runs on the compositor, so
            neither costs a repaint. */}
        <div className="ludo-board-under" aria-hidden="true">
          {legalRings.map((t) => (
            <span
              key={`ring-${t.key}`}
              className="ludo-legal-ring"
              style={{
                left: `${t.x / 15}%`,
                top: `${(t.y + PAWN_GROUND_Y * t.scale) / 15}%`,
                width: `${(88 * t.scale) / 15}%`,
                height: `${(34 * t.scale) / 15}%`,
              }}
            />
          ))}
          {stepRipples.map((rip) => (
            <span
              key={rip.id}
              className="ludo-step-ripple"
              style={{ left: `${rip.cx / 15}%`, top: `${(rip.cy + PAWN_GROUND_Y) / 15}%` }}
            />
          ))}
        </div>

        {/* Pawns, move preview and effects: a separate layer (see .ludo-board-dynamic),
            so a moving pawn repaints only this, not the ~400 shapes of the board. */}
        <svg viewBox="0 0 1500 1500" className="ludo-board-dynamic select-none">
          {pawnDefs}

          {/* Destination preview: squares crossed, then the landing square */}
          {preview && (
            <g className="pointer-events-none">
              {preview.trail.map(([px, py], i) => (
                <circle
                  key={`trail-${i}`}
                  cx={px}
                  cy={py}
                  r="11"
                  fill={COLOR_HEX[preview.color]}
                  stroke="#ffffff"
                  strokeWidth="4"
                  opacity="0.9"
                />
              ))}

              {preview.isHome ? (
                <polygon
                  points={HOME_TRIANGLE_POINTS[preview.color]}
                  fill="rgba(254, 240, 138, 0.55)"
                  stroke="#fbbf24"
                  strokeWidth="6"
                  className="animate-dest-pulse"
                />
              ) : (
                <g>
                  <rect
                    x={preview.x - 45}
                    y={preview.y - 45}
                    width="90"
                    height="90"
                    rx="14"
                    fill={
                      preview.isCapture
                        ? 'rgba(239, 68, 68, 0.45)'
                        : preview.isSafe
                          ? 'rgba(16, 185, 129, 0.4)'
                          : 'rgba(245, 158, 11, 0.4)'
                    }
                    stroke={preview.isCapture ? '#dc2626' : preview.isSafe ? '#059669' : '#f59e0b'}
                    strokeWidth="6"
                    className="animate-dest-pulse"
                  />
                  {preview.isCapture && (
                    // Crosshair ticks on each edge: reads as a target even at phone size.
                    <g stroke="#dc2626" strokeWidth="8" strokeLinecap="round">
                      <line x1={preview.x} y1={preview.y - 44} x2={preview.x} y2={preview.y - 26} />
                      <line x1={preview.x} y1={preview.y + 26} x2={preview.x} y2={preview.y + 44} />
                      <line x1={preview.x - 44} y1={preview.y} x2={preview.x - 26} y2={preview.y} />
                      <line x1={preview.x + 26} y1={preview.y} x2={preview.x + 44} y2={preview.y} />
                    </g>
                  )}
                </g>
              )}
            </g>
          )}

          {/* Pawns (Tokens) Layer — each drawn in its square's local space
              (origin = where the token stands), then moved and scaled as a whole. */}
          <g>
            {renderedTokens.map((t) => {
              const isHovered = t.isLegal && hoveredTokenIndex === t.tokenIndex;
              return (
                <g
                  key={t.key}
                  transform={`translate(${t.x} ${t.y}) scale(${t.scale})`}
                  opacity={t.dimmed ? 0.5 : 1}
                  pointerEvents={t.isLegal ? 'auto' : 'none'}
                  role={t.isLegal ? 'button' : undefined}
                  aria-label={t.isLegal ? `Move ${t.color.toLowerCase()} token ${t.tokenIndex + 1}` : undefined}
                  style={t.isLegal ? { cursor: 'pointer', touchAction: 'manipulation', filter: 'drop-shadow(0 0 10px #f59e0b)' } : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!t.isLegal) return;
                    setHoveredTokenIndex(null);
                    onTokenClick(t.tokenIndex);
                  }}
                  onPointerEnter={(e) => {
                    // Touch has no hover; a tap moves the token straight away.
                    if (t.isLegal && e.pointerType === 'mouse') setHoveredTokenIndex(t.tokenIndex);
                  }}
                  onPointerLeave={() => {
                    setHoveredTokenIndex((prev) => (prev === t.tokenIndex ? null : prev));
                  }}
                >
                  {/* Ground contact shadow */}
                  <ellipse cx="0" cy={PAWN_GROUND_Y} rx="26" ry="8.5" fill="rgba(2, 6, 23, 0.45)" />

                  <g transform={`translate(0 ${PAWN_SETTLE_Y}) scale(${PAWN_FIT_SCALE * (isHovered ? 1.1 : 1)})`}>
                    {pawnArt[`${t.color}_${t.isLegal}`]}
                  </g>

                  {/* Enlarged touch target covering the whole pawn */}
                  {t.isLegal && <circle cx="0" cy="-6" r="56" fill="none" pointerEvents="all" />}
                </g>
              );
            })}
          </g>

          {/* Landing impacts drawn over the pawns */}
          <g className="pointer-events-none">
            {impactEffects.map((imp) => {
              if (imp.type === 'CAPTURE') {
                return (
                  <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                    <circle cx="0" cy="0" r="30" fill="none" stroke="#ef4444" strokeWidth="8" className="animate-capture-burst" />
                    <circle cx="0" cy="0" r="50" fill="none" stroke="#fbbf24" strokeWidth="4" className="animate-capture-burst" />
                    <text x="0" y="14" fontSize="44" textAnchor="middle">
                      💥
                    </text>
                  </g>
                );
              }
              if (imp.type === 'HOME') {
                return (
                  <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                    <circle cx="0" cy="0" r="40" fill="none" stroke="#fbbf24" strokeWidth="6" className="animate-capture-burst" />
                    <text x="0" y="14" fontSize="44" textAnchor="middle">
                      🌟
                    </text>
                  </g>
                );
              }
              return (
                <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                  <circle cx="0" cy="0" r="30" fill="none" stroke="#10b981" strokeWidth="5" className="animate-capture-burst" />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Over the pawns: a gold arrow bouncing above every pawn that can
            move, so the choice stands out at a glance. Transform-only
            animation, like the rings, so it never repaints the board. */}
        <div className="ludo-board-over" aria-hidden="true">
          {legalRings.map((t) => {
            // On the top row there is no room above the pawn: point up at it from below.
            const below = t.y - 60 * t.scale < 40;
            const top = below ? t.y + (PAWN_GROUND_Y + 8) * t.scale : t.y - 60 * t.scale;
            return (
              <span
                key={`arrow-${t.key}`}
                className={`ludo-legal-arrow ${below ? 'ludo-legal-arrow--below' : ''}`}
                style={{ left: `${t.x / 15}%`, top: `${top / 15}%` }}
              >
                <svg viewBox="0 0 24 20">
                  <path d="M2 2 H22 L12 18 Z" fill="#fbbf24" stroke="#78350f" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </span>
            );
          })}
        </div>

        {/* The walking pawn and its shadow, each its own small layer moved by
            the walk animation (see the useLayoutEffect above). */}
        {walk && isInFlight && (
          <>
            <svg
              ref={walkerShadowRef}
              className="ludo-walker"
              viewBox={WALKER_VIEWBOX}
              style={{ transform: walkerTransform(...walk.waypoints[0]) }}
              aria-hidden="true"
            >
              <ellipse cx="0" cy={PAWN_GROUND_Y} rx="26" ry="8.5" fill="rgba(2, 6, 23, 0.45)" />
            </svg>
            <svg
              ref={walkerPawnRef}
              className="ludo-walker"
              viewBox={WALKER_VIEWBOX}
              style={{ transform: walkerTransform(...walk.waypoints[0]) }}
              aria-hidden="true"
            >
              <g transform={`translate(0 ${PAWN_SETTLE_Y}) scale(${PAWN_FIT_SCALE})`}>
                {pawnArt[`${walk.color}_false`]}
              </g>
            </svg>
          </>
        )}
      </div>
    </div>
  );
};

// Skips re-rendering when the page updates unrelated state (turn timer, chat, …).
export const LudoBoard = React.memo(LudoBoardView);
