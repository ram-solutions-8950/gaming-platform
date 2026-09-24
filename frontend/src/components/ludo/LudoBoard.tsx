import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  RED: '#ef4444',
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  BLUE: '#3b82f6',
};

// 52 Common Track Cells in clockwise order (Grid 15x15, [column, row], 0..14)
const TRACK_COORDINATES: Array<[number, number]> = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], // 0..4 (Red Start = 0)
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], // 5..10 (6, 2 = Star 8)
  [7, 0], [8, 0], // 11, 12
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], // 13..17 (Green Start = 13)
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], // 18..23 (12, 6 = Star 21)
  [14, 7], [14, 8], // 24, 25
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], // 26..30 (Yellow Start = 26)
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], // 31..36 (8, 12 = Star 34)
  [7, 14], [6, 14], // 37, 38
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], // 39..43 (Blue Start = 39)
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], // 44..49 (2, 8 = Star 47)
  [0, 7], [0, 6], // 50, 51
];

// Private Home Paths (Steps 51..55)
const HOME_PATHS: Record<LudoColor, Array<[number, number]>> = {
  RED: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  GREEN: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  YELLOW: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  BLUE: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

// Yard Pedestals (4 for each color) — the centres of the sockets drawn in each yard
const YARD_COORDINATES: Record<LudoColor, Array<[number, number]>> = {
  RED: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],
  GREEN: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  YELLOW: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  BLUE: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
};

// Centre home triangles (board units). Finished tokens gather on the centroid of
// their colour's triangle, clear of the centre medallion.
const HOME_TRIANGLE_POINTS: Record<LudoColor, string> = {
  RED: '600,600 750,750 600,900',
  GREEN: '600,600 750,750 900,600',
  YELLOW: '900,600 750,750 900,900',
  BLUE: '600,900 750,750 900,900',
};
const HOME_TRIANGLE_CENTROIDS: Record<LudoColor, [number, number]> = {
  RED: [650, 750],
  GREEN: [750, 650],
  YELLOW: [850, 750],
  BLUE: [750, 850],
};

const START_OFFSETS: Record<LudoColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
};

// Squares where nobody can be captured: every colour's start square plus the
// four stars (mirrors SAFE_CELLS in backend/app/services/ludo/board.py).
const STAR_TRACK_INDICES = [8, 21, 34, 47];
const SAFE_TRACK_INDICES = new Set([0, 13, 26, 39, ...STAR_TRACK_INDICES]);

// Direction each colour travels out of its start square, which is also the
// direction it turns into its home stretch (degrees, 0 = pointing right).
const COLOR_HEADING: Record<LudoColor, number> = {
  RED: 0,
  GREEN: 90,
  YELLOW: 180,
  BLUE: 270,
};

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

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

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

// Where the walking token is on the current animation frame.
interface WalkFrame {
  moveId: string;
  x: number;
  y: number;
  lift: number;
}

// -----------------------------------------------------------------
// 3D Luxury Pawn Renderers (Royal Crown, Knight Helm, Arcade Gem)
// -----------------------------------------------------------------
const renderPawnGraphic = (
  style: LudoTokenStyle,
  cx: number,
  cy: number,
  colorKey: string,
  isLegal: boolean
) => {
  if (style === 'KNIGHT_HELM') {
    return (
      <g>
        {/* Heavy Armored Gold Pedestal */}
        <ellipse
          cx={cx}
          cy={cy + 14}
          rx="28"
          ry="9.5"
          fill="url(#goldCollar)"
          stroke="#451a03"
          strokeWidth="1.2"
        />
        <ellipse
          cx={cx}
          cy={cy + 10}
          rx="24"
          ry="7"
          fill={`url(#${colorKey}HeadGrad)`}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
          strokeWidth={isLegal ? 2.5 : 1}
        />
        {/* Rivets on Base */}
        <circle cx={cx - 18} cy={cy + 12} r="1.5" fill="#ffffff" />
        <circle cx={cx + 18} cy={cy + 12} r="1.5" fill="#ffffff" />

        {/* Angular Chiseled Breastplate */}
        <path
          d={`M ${cx - 21},${cy + 10} L ${cx - 23},${cy - 2} L ${cx - 12},${cy - 22} L ${cx - 8},${cy - 28} L ${cx + 8},${cy - 28} L ${cx + 12},${cy - 22} L ${cx + 23},${cy - 2} L ${cx + 21},${cy + 10} Z`}
          fill={`url(#${colorKey}HeadGrad)`}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.4)'}
          strokeWidth={isLegal ? 2 : 0.8}
        />

        {/* Center Chivalry Shield Badge */}
        <path
          d={`M ${cx},${cy - 16} L ${cx + 7},${cy - 9} L ${cx},${cy + 2} L ${cx - 7},${cy - 9} Z`}
          fill="url(#goldCollar)"
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
          fill="url(#goldCollar)"
          stroke="#78350f"
          strokeWidth="1"
        />

        {/* 3D Greathelm Face */}
        <path
          d={`M ${cx - 16},${cy - 28} C ${cx - 19},${cy - 42} ${cx - 16},${cy - 58} ${cx},${cy - 62} C ${cx + 16},${cy - 58} ${cx + 19},${cy - 42} ${cx + 16},${cy - 28} Z`}
          fill={`url(#${colorKey}HeadGrad)`}
          stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
          strokeWidth={isLegal ? 3 : 1.2}
        />

        {/* Steel Visor Faceplate */}
        <path
          d={`M ${cx - 14},${cy - 34} L ${cx},${cy - 30} L ${cx + 14},${cy - 34} L ${cx + 11},${cy - 46} L ${cx},${cy - 44} L ${cx - 11},${cy - 46} Z`}
          fill="#090d16"
          stroke="url(#goldCollar)"
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
          fill="url(#goldCollar)"
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
        <ellipse cx={cx} cy={cy + 13} rx="26" ry="8" fill="url(#goldCollar)" stroke="#451a03" />
        <ellipse cx={cx} cy={cy + 10} rx="20" ry="6" fill="#090d16" />
        <ellipse
          cx={cx}
          cy={cy + 10}
          rx="14"
          ry="4"
          fill={`url(#${colorKey}HeadGrad)`}
        />

        {/* Faceted Prism Pillar Body */}
        <polygon
          points={`${cx - 16},${cy + 9} ${cx - 10},${cy - 26} ${cx + 10},${cy - 26} ${cx + 16},${cy + 9}`}
          fill={`url(#${colorKey}HeadGrad)`}
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
          fill={`url(#${colorKey}HeadGrad)`}
          stroke="url(#goldCollar)"
          strokeWidth="1.5"
        />
        {/* Pavilion point */}
        <polygon
          points={`${cx - 18},${cy - 50} ${cx + 18},${cy - 50} ${cx},${cy - 28}`}
          fill={`url(#${colorKey}HeadGrad)`}
          stroke="url(#goldCollar)"
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
        <text
          x={cx}
          y={cy - 46}
          fontSize="14"
          fill="#ffffff"
          textAnchor="middle"
          filter="drop-shadow(0 0 4px #fff)"
        >
          ✦
        </text>
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
        fill="url(#goldCollar)"
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
        fill={`url(#${colorKey}HeadGrad)`}
        stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.7)'}
        strokeWidth={isLegal ? 2.8 : 1.2}
      />

      {/* Sculpted Elegant Chalice Pawn Body */}
      <path
        d={`M ${cx - 20},${cy + 10} C ${cx - 18},${cy - 6} ${cx - 10},${cy - 22} ${cx - 7},${cy - 30} L ${cx + 7},${cy - 30} C ${cx + 10},${cy - 22} ${cx + 18},${cy - 6} ${cx + 20},${cy + 10} Z`}
        fill={`url(#${colorKey}HeadGrad)`}
        stroke={isLegal ? '#fef08a' : 'rgba(255,255,255,0.4)'}
        strokeWidth={isLegal ? 2.5 : 0.8}
      />

      {/* Vertical Cylindrical Specular Sheen */}
      <path
        d={`M ${cx - 14},${cy + 8} C ${cx - 13},${cy - 5} ${cx - 7},${cy - 18} ${cx - 4},${cy - 26} L ${cx},${cy - 26} C ${cx - 3},${cy - 18} ${cx - 9},${cy - 5} ${cx - 9},${cy + 8} Z`}
        fill="#ffffff"
        opacity="0.45"
      />

      {/* Embossed Golden Crown Insignia on Body */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize="15"
        fontWeight="900"
        fill="#fef08a"
        stroke="#b45309"
        strokeWidth="0.8"
        filter="drop-shadow(0 1px 2px rgba(0,0,0,0.8))"
      >
        👑
      </text>

      {/* Polished Gold Collar Ring */}
      <ellipse
        cx={cx}
        cy={cy - 30}
        rx="12.5"
        ry="4.5"
        fill="url(#goldCollar)"
        stroke="#78350f"
        strokeWidth="1"
      />
      {/* Micro-Diamond Rivets on Collar */}
      <circle cx={cx - 6} cy={cy - 30} r="1.4" fill="#ffffff" />
      <circle cx={cx} cy={cy - 30} r="1.8" fill="#fef08a" />
      <circle cx={cx + 6} cy={cy - 30} r="1.4" fill="#ffffff" />

      {/* Spherical 3D High-Gloss Crown Head */}
      <circle
        cx={cx}
        cy={cy - 48}
        r="19"
        fill={`url(#${colorKey}HeadGrad)`}
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
        opacity="0.85"
        transform={`rotate(-25 ${cx - 6} ${cy - 54})`}
      />
      {/* Pinpoint Sparkle Star */}
      <circle cx={cx - 11} cy={cy - 48} r="2.2" fill="#ffffff" opacity="0.95" />

      {/* Imperial Golden 3-Point Crown */}
      <polygon
        points={`${cx - 14},${cy - 50} ${cx - 12},${cy - 65} ${cx - 5},${cy - 54} ${cx},${cy - 72} ${cx + 5},${cy - 54} ${cx + 12},${cy - 65} ${cx + 14},${cy - 50}`}
        fill="url(#goldCollar)"
        stroke="#78350f"
        strokeWidth="1.2"
        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
      />
      {/* Crown Finials: Spheres & Star */}
      <circle cx={cx} cy={cy - 73} r="4" fill="url(#goldCollar)" stroke="#78350f" strokeWidth="0.8" />
      <text x={cx} y={cy - 71} fontSize="7" fill="#ffffff" textAnchor="middle" fontWeight="bold">
        ★
      </text>
      <circle cx={cx - 12} cy={cy - 66} r="3" fill="url(#goldCollar)" stroke="#78350f" strokeWidth="0.6" />
      <circle cx={cx + 12} cy={cy - 66} r="3" fill="url(#goldCollar)" stroke="#78350f" strokeWidth="0.6" />

      {/* Center Crown Ruby/Gem Inlay */}
      <circle
        cx={cx}
        cy={cy - 56}
        r="3"
        fill={`url(#${colorKey}HeadGrad)`}
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
      {/* 3D Pawn Drop Shadow Filter */}
      <filter id="pawnDropShadow" x="-50%" y="-40%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
        <feOffset dx="0" dy="8" result="offsetblur" />
        <feFlood floodColor="#000000" floodOpacity="0.55" />
        <feComposite in2="offsetblur" operator="in" />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Active Legal Token Glow Filter */}
      <filter id="goldLegalGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="blur" />
        <feFlood floodColor="#f59e0b" floodOpacity="0.95" result="goldColor" />
        <feComposite in="goldColor" in2="blur" operator="in" result="goldGlow" />
        <feMerge>
          <feMergeNode in="goldGlow" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* Rounded board outline; the yards are square and get their outer corner from this. */}
      <clipPath id="ludoBoardClip">
        <rect width="1500" height="1500" rx="28" />
      </clipPath>

      {/* Yard Background Depth Gradients */}
      <radialGradient id="yardRedGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ef4444" />
        <stop offset="70%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#991b1b" />
      </radialGradient>
      <radialGradient id="yardGreenGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="70%" stopColor="#059669" />
        <stop offset="100%" stopColor="#064e3b" />
      </radialGradient>
      <radialGradient id="yardYellowGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="70%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#78350f" />
      </radialGradient>
      <radialGradient id="yardBlueGrad" cx="30%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="70%" stopColor="#2563eb" />
        <stop offset="100%" stopColor="#1e3a8a" />
      </radialGradient>

      {/* Luxury Yard Tray Gradient */}
      <linearGradient id="yardTrayGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#f8fafc" />
        <stop offset="100%" stopColor="#e2e8f0" />
      </linearGradient>

      {/* Metallic Polished Gold Collar Ring */}
      <linearGradient id="goldCollar" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#78350f" />
        <stop offset="25%" stopColor="#f59e0b" />
        <stop offset="50%" stopColor="#fef08a" />
        <stop offset="75%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#451a03" />
      </linearGradient>

      {/* 3D Translucent Jewel Glass Shading: Red (Ruby) */}
      <radialGradient id="redHeadGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="18%" stopColor="#fca5a5" />
        <stop offset="45%" stopColor="#e11d48" />
        <stop offset="75%" stopColor="#9f1239" />
        <stop offset="100%" stopColor="#4c0519" />
      </radialGradient>

      {/* 3D Translucent Jewel Glass Shading: Green (Emerald) */}
      <radialGradient id="greenHeadGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="18%" stopColor="#a7f3d0" />
        <stop offset="45%" stopColor="#059669" />
        <stop offset="75%" stopColor="#065f46" />
        <stop offset="100%" stopColor="#022c22" />
      </radialGradient>

      {/* 3D Translucent Jewel Glass Shading: Yellow (Topaz/Amber) */}
      <radialGradient id="yellowHeadGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="18%" stopColor="#fef08a" />
        <stop offset="45%" stopColor="#d97706" />
        <stop offset="75%" stopColor="#b45309" />
        <stop offset="100%" stopColor="#451a03" />
      </radialGradient>

      {/* 3D Translucent Jewel Glass Shading: Blue (Sapphire) */}
      <radialGradient id="blueHeadGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="18%" stopColor="#bfdbfe" />
        <stop offset="45%" stopColor="#2563eb" />
        <stop offset="75%" stopColor="#1e40af" />
        <stop offset="100%" stopColor="#0f172a" />
      </radialGradient>
    </defs>

    <g clipPath="url(#ludoBoardClip)">
      {/* Board Background: Crisp Clean White */}
      <rect width="1500" height="1500" fill="#ffffff" />

      {/* 4 Large Corner Yards with Clean Trays & Pedestals */}
      {(
        [
          { color: 'RED', x: 0, y: 0, grad: 'yardRedGrad', socketFill: '#fee2e2', socketRing: '#fca5a5' },
          { color: 'GREEN', x: 900, y: 0, grad: 'yardGreenGrad', socketFill: '#d1fae5', socketRing: '#86efac' },
          { color: 'YELLOW', x: 900, y: 900, grad: 'yardYellowGrad', socketFill: '#fef3c7', socketRing: '#fde047' },
          { color: 'BLUE', x: 0, y: 900, grad: 'yardBlueGrad', socketFill: '#dbeafe', socketRing: '#93c5fd' },
        ] as const
      ).map((yard) => (
        <g key={`yard-${yard.color}`}>
          <rect x={yard.x} y={yard.y} width="600" height="600" fill={`url(#${yard.grad})`} />
          <rect
            x={yard.x + 85}
            y={yard.y + 85}
            width="430"
            height="430"
            fill="url(#yardTrayGrad)"
            rx="36"
            stroke={COLOR_HEX[yard.color]}
            strokeWidth="3.5"
          />
          {YARD_COORDINATES[yard.color].map((socket, idx) => {
            const [sx, sy] = cellCenter(socket);
            return (
              <g key={`${yard.color}-sock-${idx}`}>
                <circle cx={sx} cy={sy} r="54" fill={yard.socketFill} stroke={COLOR_HEX[yard.color]} strokeWidth="4" />
                <circle cx={sx} cy={sy} r="44" fill="#ffffff" stroke={yard.socketRing} strokeWidth="2" />
                <text x={sx} y={sy + 9} fontSize="26" textAnchor="middle" fill={COLOR_HEX[yard.color]} opacity="0.65">
                  ★
                </text>
              </g>
            );
          })}
        </g>
      ))}

      {/* Common Track Grid Cells */}
      {TRACK_COORDINATES.map((coord, i) => {
        const [gx, gy] = coord;
        const [cx, cy] = cellCenter(coord);
        const startColor = COLORS.find((c) => START_OFFSETS[c] === i);
        // The square each colour leaves the common track from (its step 50).
        const entryColor = COLORS.find((c) => trackIndexOf(c, 50) === i);
        const isStar = STAR_TRACK_INDICES.includes(i);

        return (
          <g key={`track-${i}`}>
            <rect
              x={gx * CELL}
              y={gy * CELL}
              width={CELL}
              height={CELL}
              fill={startColor ? COLOR_HEX[startColor] : isStar ? '#fef3c7' : '#ffffff'}
              stroke="#94a3b8"
              strokeWidth="2.5"
            />
            {isStar && (
              <g>
                <circle cx={cx} cy={cy} r="36" fill="none" stroke="#d97706" strokeWidth="2" strokeDasharray="6,4" opacity="0.8" />
                <circle cx={cx} cy={cy} r="28" fill="#fef3c7" stroke="#f59e0b" strokeWidth="2.5" />
                <text x={cx} y={cy + 14} fill="#b45309" fontSize="40" textAnchor="middle" fontWeight="bold">
                  ★
                </text>
              </g>
            )}
            {startColor && (
              <polygon
                points={arrowPoints(cx, cy, 52)}
                fill="#ffffff"
                opacity="0.95"
                transform={`rotate(${COLOR_HEADING[startColor]} ${cx} ${cy})`}
              />
            )}
            {entryColor && (
              <polygon
                points={arrowPoints(cx, cy, 44)}
                fill={COLOR_HEX[entryColor]}
                opacity="0.9"
                transform={`rotate(${COLOR_HEADING[entryColor]} ${cx} ${cy})`}
              />
            )}
          </g>
        );
      })}

      {/* Home Stretch Paths with Step Numbers */}
      {COLORS.map((color) =>
        HOME_PATHS[color].map((coord, i) => {
          const [gx, gy] = coord;
          const [cx, cy] = cellCenter(coord);
          return (
            <g key={`${color}-h-${i}`}>
              <rect
                x={gx * CELL}
                y={gy * CELL}
                width={CELL}
                height={CELL}
                fill={COLOR_HEX[color]}
                stroke="#ffffff"
                strokeWidth="2.5"
                opacity="0.95"
              />
              <text x={cx} y={cy + 12} fill="#ffffff" opacity="0.85" fontSize="32" fontWeight="900" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          );
        })
      )}

      {/* Center Home Triangles */}
      {COLORS.map((color) => (
        <polygon
          key={`home-tri-${color}`}
          points={HOME_TRIANGLE_POINTS[color]}
          fill={COLOR_HEX[color]}
          stroke="#ffffff"
          strokeWidth="2.5"
        />
      ))}

      {/* Center Golden Medallion — small enough to leave each triangle's
          centroid free for the tokens that finish there. */}
      <g>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={`ray-${deg}`}
            x1="750"
            y1="694"
            x2="750"
            y2="684"
            stroke="#fef3c7"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.85"
            transform={`rotate(${deg} 750 750)`}
          />
        ))}
        <circle cx="750" cy="750" r="48" fill="#ffffff" stroke="url(#goldCollar)" strokeWidth="5" />
        <circle cx="750" cy="750" r="39" fill="#fef3c7" stroke="#fbbf24" strokeWidth="1.5" opacity="0.95" />
        <text x="750" y="764" fontSize="38" textAnchor="middle">
          👑
        </text>
      </g>
    </g>

    {/* Board outline, drawn over the clipped content */}
    <rect x="1.5" y="1.5" width="1497" height="1497" rx="27" fill="none" stroke="#94a3b8" strokeWidth="3" />
  </>
);

export const LudoBoard: React.FC<Props> = ({
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
  const [walkFrame, setWalkFrame] = useState<WalkFrame | null>(null);

  const onMoveAnimationEndRef = useRef(onMoveAnimationEnd);
  useEffect(() => {
    onMoveAnimationEndRef.current = onMoveAnimationEnd;
  }, [onMoveAnimationEnd]);

  const boardArt = useMemo(() => renderBoardArt(), []);

  // One artwork per colour/highlight, drawn at (0, 0) and positioned by its
  // parent group, so every pawn of a colour shares the same element.
  const pawnArt = useMemo(() => {
    const art: Record<string, React.ReactElement> = {};
    COLORS.forEach((color) => {
      [false, true].forEach((legal) => {
        art[`${color}_${legal}`] = renderPawnGraphic(tokenStyle, 0, 0, color.toLowerCase(), legal);
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
  // Walking animation: the token glides square by square with a small hop,
  // driven by requestAnimationFrame so every frame lands exactly on the path.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!activeMove) {
      setWalkFrame(null);
      return;
    }

    const move = activeMove;
    const color = move.playerColor;
    const waypoints: Array<[number, number]> = [stepToPoint(move.fromPosition, color, move.tokenIndex)];
    if (move.fromPosition < 0) {
      waypoints.push(stepToPoint(0, color, move.tokenIndex));
    } else {
      for (let s = move.fromPosition + 1; s <= move.toPosition; s++) {
        waypoints.push(stepToPoint(s, color, move.tokenIndex));
      }
    }

    if (waypoints.length < 2) {
      onMoveAnimationEndRef.current?.();
      return;
    }

    const hopMs = move.fromPosition < 0 ? YARD_EXIT_MS : HOP_MS;
    const timers: number[] = [];
    let hop = 0;
    let hopStart = performance.now();
    let raf = 0;

    const land = (x: number, y: number) => {
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
        STAR_TRACK_INDICES.includes(trackIndexOf(color, move.toPosition))
      ) {
        soundManager.play('ludo_safe');
        addImpact('SAFE', x, y, 550);
      } else {
        soundManager.play('ludo_land');
      }

      timers.push(
        window.setTimeout(() => {
          setWalkFrame(null);
          onMoveAnimationEndRef.current?.();
        }, 140)
      );
    };

    const tick = (now: number) => {
      const [x0, y0] = waypoints[hop];
      const [x1, y1] = waypoints[hop + 1];
      const t = Math.min(1, Math.max(0, (now - hopStart) / hopMs));
      const eased = easeInOut(t);
      setWalkFrame({
        moveId: move.id,
        x: x0 + (x1 - x0) * eased,
        y: y0 + (y1 - y0) * eased,
        lift: 4 * t * (1 - t) * HOP_HEIGHT,
      });

      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }

      hop += 1;
      hopStart = now;
      addRipple(x1, y1);
      if (hop < waypoints.length - 1) {
        soundManager.play('ludo_step');
        raf = requestAnimationFrame(tick);
      } else {
        land(x1, y1);
      }
    };

    soundManager.play('ludo_step');
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
    };
  }, [activeMove]);

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
  const renderedTokens = players
    .flatMap((player) =>
      player.tokens.map((token) => {
        const walking = isWalkingToken(player.color, token.token_index);
        const isTurnColor = currentTurnColor === player.color;
        const isLegal = Boolean(
          isMyTurn && isTurnColor && !activeMove && legalTokenIndices.includes(token.token_index)
        );

        let x: number;
        let y: number;
        let scale = 1;
        let lift = 0;

        if (walking && activeMove) {
          if (walkFrame && walkFrame.moveId === activeMove.id) {
            ({ x, y, lift } = walkFrame);
          } else {
            [x, y] = stepToPoint(activeMove.fromPosition, player.color, token.token_index);
          }
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

        return {
          key: `tok-${player.id}-${token.token_index}`,
          color: player.color,
          tokenIndex: token.token_index,
          x,
          y,
          scale,
          lift,
          walking,
          isLegal,
          dimmed: Boolean(isMyTurn && isTurnColor && !activeMove && !isLegal && legalTokenIndices.length > 0),
        };
      })
    )
    // Paint back-to-front: lower pawns overlap the ones above them, movable
    // pawns sit on top so they are always tappable, and the walker goes last.
    .sort(
      (a, b) =>
        Number(a.walking) - Number(b.walking) || Number(a.isLegal) - Number(b.isLegal) || a.y - b.y
    );

  return (
    <div
      className={`ludo-board-wrapper relative w-full max-w-[min(90vw,calc(100dvh-var(--safe-top)-var(--safe-bottom)-100px),430px)] aspect-square rounded-2xl p-1.5 sm:p-2 bg-slate-900 border-2 border-amber-500/40 shadow-2xl overflow-hidden flex items-center justify-center shrink-0 ${
        boardShaking ? 'animate-board-impact' : ''
      }`}
    >
      <svg viewBox="0 0 1500 1500" className="w-full h-full select-none rounded-xl drop-shadow-lg">
        {boardArt}

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

        {/* Footstep ripples under the pawns */}
        <g className="pointer-events-none">
          {stepRipples.map((rip) => (
            <circle
              key={rip.id}
              cx={rip.cx}
              cy={rip.cy + PAWN_GROUND_Y - 10}
              r="20"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="4"
              className="animate-step-ripple"
            />
          ))}
        </g>

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
                style={t.isLegal ? { cursor: 'pointer', touchAction: 'manipulation' } : undefined}
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
                {/* Pulsing ring on the ground marks a token that can move */}
                {t.isLegal && (
                  <ellipse
                    className="ludo-legal-ring"
                    cx="0"
                    cy={PAWN_GROUND_Y}
                    rx="44"
                    ry="17"
                    fill="rgba(251, 191, 36, 0.35)"
                    stroke="#fbbf24"
                    strokeWidth="5"
                  />
                )}

                {/* Ground contact shadow; stays on the board while the pawn hops */}
                <ellipse
                  cx="0"
                  cy={PAWN_GROUND_Y}
                  rx={26 - t.lift * 0.25}
                  ry={8.5 - t.lift * 0.08}
                  fill="rgba(2, 6, 23, 0.45)"
                />

                <g className={t.isLegal ? 'ludo-pawn-bob' : undefined}>
                  <g
                    transform={`translate(0 ${PAWN_SETTLE_Y - t.lift}) scale(${PAWN_FIT_SCALE * (isHovered ? 1.1 : 1)})`}
                    filter={t.isLegal ? 'url(#goldLegalGlow)' : 'url(#pawnDropShadow)'}
                  >
                    {pawnArt[`${t.color}_${t.isLegal}`]}
                  </g>
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
    </div>
  );
};
