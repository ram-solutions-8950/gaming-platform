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

// 52 Common Track Cells in clockwise order (Grid 15x15, 0..14)
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

// Yard Pedestals (4 for each color)
const YARD_COORDINATES: Record<LudoColor, Array<[number, number]>> = {
  RED: [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]],
  GREEN: [[10.5, 1.5], [12.5, 1.5], [10.5, 3.5], [12.5, 3.5]],
  YELLOW: [[10.5, 10.5], [12.5, 10.5], [10.5, 12.5], [12.5, 12.5]],
  BLUE: [[1.5, 10.5], [3.5, 10.5], [1.5, 12.5], [3.5, 12.5]],
};

// Home Center Target
const HOME_CENTERS: Record<LudoColor, [number, number]> = {
  RED: [6.5, 7],
  GREEN: [7, 6.5],
  YELLOW: [7.5, 7],
  BLUE: [7, 7.5],
};

// The pawn artwork is drawn ~107 units tall around its anchor point, with the
// crown reaching far above it — in a 100-unit cell that left every token sitting
// a quarter-cell high and poking into the row above, so a board with several
// tokens out looked scattered. Shrink the art to fit inside one cell and drop it
// back onto the cell it belongs to, keeping a slight lift for the 3D look.
const PAWN_FIT_SCALE = 0.86;
const PAWN_SETTLE_Y = 18;

const START_OFFSETS: Record<LudoColor, number> = {
  RED: 0,
  GREEN: 13,
  YELLOW: 26,
  BLUE: 39,
};

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

  // Step-by-step animated token position state
  const [animatedTokenState, setAnimatedTokenState] = useState<{
    playerColor: LudoColor;
    tokenIndex: number;
    cx: number;
    cy: number;
    hopY: number;
  } | null>(null);

  // Convert step number to board (cx, cy)
  const getStepCoordinates = (step: number, color: LudoColor, tokenIdx: number = 0): [number, number] => {
    let gx = 0;
    let gy = 0;
    if (step === -1) {
      [gx, gy] = YARD_COORDINATES[color][tokenIdx];
    } else if (step >= 56) {
      [gx, gy] = HOME_CENTERS[color];
    } else if (step > 50) {
      const stretchIdx = step - 51;
      [gx, gy] = HOME_PATHS[color][stretchIdx];
    } else {
      const trackIndex = (START_OFFSETS[color] + step) % 52;
      [gx, gy] = TRACK_COORDINATES[trackIndex];
    }
    return [gx * 100 + 50, gy * 100 + 50];
  };

  const getTokenCoords = (token: LudoToken, color: LudoColor): [number, number] => {
    return getStepCoordinates(token.position, color, token.token_index);
  };

  // Multiple Tokens Clustering: Prevent visual overlap
  const cellOccupants = useMemo(() => {
    const map = new Map<string, Array<{ playerId: string; tokenIndex: number }>>();

    players.forEach((player) => {
      player.tokens.forEach((token) => {
        let cellKey = '';
        if (token.position === -1) {
          cellKey = `yard_${player.color}_${token.token_index}`;
        } else if (token.position >= 56 || token.is_home) {
          cellKey = `home_${player.color}`;
        } else if (token.position > 50) {
          cellKey = `stretch_${player.color}_${token.position - 51}`;
        } else {
          const trackIdx = (START_OFFSETS[player.color] + token.position) % 52;
          cellKey = `track_${trackIdx}`;
        }
        if (!map.has(cellKey)) {
          map.set(cellKey, []);
        }
        map.get(cellKey)!.push({ playerId: player.id, tokenIndex: token.token_index });
      });
    });

    return map;
  }, [players]);

  const getClusterOffset = (
    cellKey: string,
    playerId: string,
    tokenIndex: number
  ): { dx: number; dy: number; scale: number } => {
    if (cellKey.startsWith('yard_')) {
      return { dx: 0, dy: 0, scale: 1.0 };
    }

    const occupants = cellOccupants.get(cellKey) || [];
    const count = occupants.length;
    if (count <= 1) {
      return { dx: 0, dy: 0, scale: 1.0 };
    }

    const idx = occupants.findIndex(
      (item) => item.playerId === playerId && item.tokenIndex === tokenIndex
    );
    const safeIdx = idx >= 0 ? idx : 0;

    if (count === 2) {
      const offsets = [
        { dx: -16, dy: -12 },
        { dx: 16, dy: 12 },
      ];
      return { ...offsets[safeIdx % 2], scale: 0.88 };
    }
    if (count === 3) {
      const offsets = [
        { dx: -18, dy: -14 },
        { dx: 18, dy: -14 },
        { dx: 0, dy: 16 },
      ];
      return { ...offsets[safeIdx % 3], scale: 0.8 };
    }
    const offsets = [
      { dx: -18, dy: -18 },
      { dx: 18, dy: -18 },
      { dx: -18, dy: 18 },
      { dx: 18, dy: 18 },
    ];
    return { ...offsets[safeIdx % 4], scale: 0.74 };
  };

  // Home counter progress for all 4 players
  const homeCounts = useMemo(() => {
    const counts: Record<LudoColor, number> = { RED: 0, GREEN: 0, YELLOW: 0, BLUE: 0 };
    players.forEach((p) => {
      counts[p.color] = p.tokens.filter((t) => t.is_home || t.position >= 56).length;
    });
    return counts;
  }, [players]);

  // -----------------------------------------------------------------
  // Step-by-Step Hop Walking Animation Controller
  // -----------------------------------------------------------------
  const animTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!activeMove) {
      setAnimatedTokenState(null);
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
      return;
    }

    // Build waypoints for the animated path
    const waypoints: Array<[number, number]> = [];
    if (activeMove.fromPosition === -1) {
      // Out of yard directly to start cell (step 0)
      const yardPos = getStepCoordinates(-1, activeMove.playerColor, activeMove.tokenIndex);
      const startPos = getStepCoordinates(0, activeMove.playerColor, activeMove.tokenIndex);
      waypoints.push(yardPos, startPos);
    } else {
      // Sequential track cells from fromPosition + 1 up to toPosition
      for (let s = activeMove.fromPosition + 1; s <= activeMove.toPosition; s++) {
        waypoints.push(getStepCoordinates(s, activeMove.playerColor, activeMove.tokenIndex));
      }
    }

    if (waypoints.length === 0) {
      onMoveAnimationEnd?.();
      return;
    }

    let currentIndex = 0;
    const stepDuration = 115; // ms per step for snappy, fluid hop

    const advanceStep = () => {
      const [wx, wy] = waypoints[currentIndex];
      setAnimatedTokenState({
        playerColor: activeMove.playerColor,
        tokenIndex: activeMove.tokenIndex,
        cx: wx,
        cy: wy,
        hopY: -22, // Parabolic hop height
      });

      // Play hop step sound
      soundManager.play('ludo_step');

      // Add footstep ripple
      const ripId = `${Date.now()}_${Math.random()}`;
      setStepRipples((prev) => [...prev.slice(-6), { id: ripId, cx: wx, cy: wy }]);
      setTimeout(() => {
        setStepRipples((prev) => prev.filter((r) => r.id !== ripId));
      }, 400);

      // Brief hop landing squash
      setTimeout(() => {
        setAnimatedTokenState((prev) => (prev ? { ...prev, hopY: 0 } : null));
      }, 50);

      currentIndex++;
      if (currentIndex >= waypoints.length) {
        // Arrived at final destination!
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;

        // Trigger landing impact FX
        if (activeMove.isCapture) {
          soundManager.play('ludo_capture');
          setBoardShaking(true);
          setTimeout(() => setBoardShaking(false), 420);
          const impId = `${Date.now()}_cap`;
          setImpactEffects((prev) => [...prev, { id: impId, type: 'CAPTURE', cx: wx, cy: wy }]);
          setTimeout(() => {
            setImpactEffects((prev) => prev.filter((i) => i.id !== impId));
          }, 600);
          try {
            navigator.vibrate?.([50, 40, 70]);
          } catch {}
        } else if (activeMove.isHome) {
          soundManager.play('ludo_home');
          const impId = `${Date.now()}_home`;
          setImpactEffects((prev) => [...prev, { id: impId, type: 'HOME', cx: wx, cy: wy }]);
          setTimeout(() => {
            setImpactEffects((prev) => prev.filter((i) => i.id !== impId));
          }, 800);
        } else {
          // Check if safe star
          const isSafe =
            activeMove.toPosition <= 50 &&
            [8, 21, 34, 47].includes((START_OFFSETS[activeMove.playerColor] + activeMove.toPosition) % 52);
          if (isSafe) {
            soundManager.play('ludo_safe');
            const impId = `${Date.now()}_safe`;
            setImpactEffects((prev) => [...prev, { id: impId, type: 'SAFE', cx: wx, cy: wy }]);
            setTimeout(() => {
              setImpactEffects((prev) => prev.filter((i) => i.id !== impId));
            }, 550);
          } else {
            soundManager.play('ludo_land');
          }
        }

        setTimeout(() => {
          setAnimatedTokenState(null);
          onMoveAnimationEnd?.();
        }, 120);
      }
    };

    advanceStep();
    animTimerRef.current = setInterval(advanceStep, stepDuration);

    return () => {
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
    };
  }, [activeMove, onMoveAnimationEnd]);

  // -----------------------------------------------------------------
  // Tactical Destination Preview & Target Highlighting
  // -----------------------------------------------------------------
  const previewInfo = useMemo(() => {
    if (!isMyTurn || !currentTurnColor || !diceValue || diceValue < 1) return null;

    const myPlayer = players.find((p) => p.color === currentTurnColor);
    if (!myPlayer) return null;

    // Use hovered token, or if only 1 legal token, preview it automatically
    let targetTokenIdx = hoveredTokenIndex;
    if (targetTokenIdx === null && legalTokenIndices.length === 1) {
      targetTokenIdx = legalTokenIndices[0];
    }
    if (targetTokenIdx === null || !legalTokenIndices.includes(targetTokenIdx)) return null;

    const token = myPlayer.tokens.find((t) => t.token_index === targetTokenIdx);
    if (!token || token.is_home || token.position >= 56) return null;

    const targetStep = token.position === -1 ? 0 : token.position + diceValue;
    if (targetStep > 56) return null;

    const [targetCx, targetCy] = getStepCoordinates(targetStep, currentTurnColor, token.token_index);

    // Check if target is a capture
    let isCapture = false;
    if (targetStep <= 50) {
      const targetTrackIdx = (START_OFFSETS[currentTurnColor] + targetStep) % 52;
      const isSafeStar = [8, 21, 34, 47].includes(targetTrackIdx);
      if (!isSafeStar) {
        // Is any opponent on this track cell?
        players.forEach((p) => {
          if (p.color !== currentTurnColor) {
            p.tokens.forEach((ot) => {
              if (ot.position >= 0 && ot.position <= 50) {
                const oppTrackIdx = (START_OFFSETS[p.color] + ot.position) % 52;
                if (oppTrackIdx === targetTrackIdx) {
                  isCapture = true;
                }
              }
            });
          }
        });
      }
    }

    const isSafeStar =
      targetStep <= 50 &&
      [8, 21, 34, 47].includes((START_OFFSETS[currentTurnColor] + targetStep) % 52);
    const isHome = targetStep === 56;

    return {
      tokenIndex: targetTokenIdx,
      targetStep,
      targetCx,
      targetCy,
      isCapture,
      isSafeStar,
      isHome,
    };
  }, [isMyTurn, currentTurnColor, diceValue, hoveredTokenIndex, legalTokenIndices, players]);

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

  return (
    <div
      className={`ludo-board-wrapper relative w-full max-w-[min(90vw,calc(100dvh-var(--safe-top)-var(--safe-bottom)-100px),430px)] aspect-square rounded-2xl p-2 sm:p-2.5 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 shadow-2xl border border-amber-500/30 overflow-hidden flex items-center justify-center shrink-0 ${
        boardShaking ? 'animate-board-impact' : ''
      }`}
    >
      <svg viewBox="0 0 1500 1500" className="w-full h-full select-none rounded-xl drop-shadow-lg">
        <defs>
          {/* 3D Pawn Drop Shadow Filter */}
          <filter id="pawnDropShadow" x="-50%" y="-40%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
            <feOffset dx="0" dy="8" result="offsetblur" />
            <feFlood floodColor="#000000" floodOpacity="0.65" />
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

          {/* Capture Fire Glow Filter */}
          <filter id="captureFireGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
            <feFlood floodColor="#ef4444" floodOpacity="0.95" result="redColor" />
            <feComposite in="redColor" in2="blur" operator="in" result="redGlow" />
            <feMerge>
              <feMergeNode in="redGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

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

          {/* 3D Concave Sunk Pedestal Socket */}
          <radialGradient id="socketDepth" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#090d16" />
            <stop offset="65%" stopColor="#1e293b" />
            <stop offset="90%" stopColor="#334155" />
            <stop offset="100%" stopColor="#475569" />
          </radialGradient>

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

        {/* Board Background */}
        <rect width="1500" height="1500" fill="#0b1120" rx="32" />

        {/* 4 Large Corner Yards with Beveled Trays & Sunk Sockets */}
        <g>
          {/* Red Yard (Top Left) */}
          <g>
            <rect x="0" y="0" width="600" height="600" fill="url(#yardRedGrad)" rx="24" />
            <rect
              x="85"
              y="85"
              width="430"
              height="430"
              fill="url(#yardTrayGrad)"
              rx="36"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeOpacity="0.6"
            />
            {[
              [200, 200],
              [400, 200],
              [200, 400],
              [400, 400],
            ].map(([sx, sy], idx) => (
              <g key={`red-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
                <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#ef4444" strokeWidth="3" />
                <circle
                  cx="0"
                  cy="0"
                  r="46"
                  fill="url(#socketDepth)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                />
                <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#ef4444" opacity="0.45">
                  ★
                </text>
              </g>
            ))}
          </g>

          {/* Green Yard (Top Right) */}
          <g>
            <rect x="900" y="0" width="600" height="600" fill="url(#yardGreenGrad)" rx="24" />
            <rect
              x="985"
              y="85"
              width="430"
              height="430"
              fill="url(#yardTrayGrad)"
              rx="36"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeOpacity="0.6"
            />
            {[
              [1100, 200],
              [1300, 200],
              [1100, 400],
              [1300, 400],
            ].map(([sx, sy], idx) => (
              <g key={`green-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
                <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#10b981" strokeWidth="3" />
                <circle
                  cx="0"
                  cy="0"
                  r="46"
                  fill="url(#socketDepth)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                />
                <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#10b981" opacity="0.45">
                  ★
                </text>
              </g>
            ))}
          </g>

          {/* Yellow Yard (Bottom Right) */}
          <g>
            <rect x="900" y="900" width="600" height="600" fill="url(#yardYellowGrad)" rx="24" />
            <rect
              x="985"
              y="985"
              width="430"
              height="430"
              fill="url(#yardTrayGrad)"
              rx="36"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeOpacity="0.6"
            />
            {[
              [1100, 1100],
              [1300, 1100],
              [1100, 1300],
              [1300, 1300],
            ].map(([sx, sy], idx) => (
              <g key={`yellow-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
                <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />
                <circle
                  cx="0"
                  cy="0"
                  r="46"
                  fill="url(#socketDepth)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                />
                <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#f59e0b" opacity="0.45">
                  ★
                </text>
              </g>
            ))}
          </g>

          {/* Blue Yard (Bottom Left) */}
          <g>
            <rect x="0" y="900" width="600" height="600" fill="url(#yardBlueGrad)" rx="24" />
            <rect
              x="85"
              y="985"
              width="430"
              height="430"
              fill="url(#yardTrayGrad)"
              rx="36"
              stroke="#fbbf24"
              strokeWidth="3"
              strokeOpacity="0.6"
            />
            {[
              [200, 1100],
              [400, 1100],
              [200, 1300],
              [400, 1300],
            ].map(([sx, sy], idx) => (
              <g key={`blue-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
                <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
                <circle
                  cx="0"
                  cy="0"
                  r="46"
                  fill="url(#socketDepth)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1.5"
                />
                <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#3b82f6" opacity="0.45">
                  ★
                </text>
              </g>
            ))}
          </g>

          {/* Common Track Grid Cells */}
          {TRACK_COORDINATES.map(([gx, gy], i) => {
            let cellFill = '#111827';
            let isStart = false;
            let isStar = [8, 21, 34, 47].includes(i);

            if (i === 0) {
              cellFill = '#dc2626';
              isStart = true;
            } else if (i === 13) {
              cellFill = '#059669';
              isStart = true;
            } else if (i === 26) {
              cellFill = '#d97706';
              isStart = true;
            } else if (i === 39) {
              cellFill = '#2563eb';
              isStart = true;
            }

            return (
              <g key={`track-${i}`}>
                <rect
                  x={gx * 100}
                  y={gy * 100}
                  width="100"
                  height="100"
                  fill={cellFill}
                  stroke="#1f2937"
                  strokeWidth="2"
                />
                {isStar && (
                  <g>
                    {/* Rotating Star Protection Halo */}
                    <circle
                      cx={gx * 100 + 50}
                      cy={gy * 100 + 50}
                      r="36"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2"
                      strokeDasharray="6,4"
                      className="animate-star-halo"
                      opacity="0.8"
                    />
                    <circle
                      cx={gx * 100 + 50}
                      cy={gy * 100 + 50}
                      r="28"
                      fill="#0f172a"
                      stroke="#fbbf24"
                      strokeWidth="2.5"
                    />
                    <text
                      x={gx * 100 + 50}
                      y={gy * 100 + 64}
                      fill="#fbbf24"
                      fontSize="40"
                      textAnchor="middle"
                      fontWeight="bold"
                    >
                      ★
                    </text>
                  </g>
                )}
                {isStart && (
                  <polygon
                    points={`${gx * 100 + 25},${gy * 100 + 25} ${gx * 100 + 75},${gy * 100 + 50} ${
                      gx * 100 + 25
                    },${gy * 100 + 75}`}
                    fill="#ffffff"
                    opacity="0.85"
                  />
                )}
              </g>
            );
          })}

          {/* Home Stretch Paths with Step Indicators */}
          {HOME_PATHS.RED.map(([gx, gy], i) => (
            <g key={`red-h-${i}`}>
              <rect
                x={gx * 100}
                y={gy * 100}
                width="100"
                height="100"
                fill="#dc2626"
                stroke="#450a0a"
                strokeWidth="2"
                opacity="0.9"
              />
              <text
                x={gx * 100 + 50}
                y={gy * 100 + 60}
                fill="#ffffff"
                opacity="0.3"
                fontSize="32"
                fontWeight="900"
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}
          {HOME_PATHS.GREEN.map(([gx, gy], i) => (
            <g key={`green-h-${i}`}>
              <rect
                x={gx * 100}
                y={gy * 100}
                width="100"
                height="100"
                fill="#059669"
                stroke="#022c22"
                strokeWidth="2"
                opacity="0.9"
              />
              <text
                x={gx * 100 + 50}
                y={gy * 100 + 60}
                fill="#ffffff"
                opacity="0.3"
                fontSize="32"
                fontWeight="900"
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}
          {HOME_PATHS.YELLOW.map(([gx, gy], i) => (
            <g key={`yellow-h-${i}`}>
              <rect
                x={gx * 100}
                y={gy * 100}
                width="100"
                height="100"
                fill="#d97706"
                stroke="#451a03"
                strokeWidth="2"
                opacity="0.9"
              />
              <text
                x={gx * 100 + 50}
                y={gy * 100 + 60}
                fill="#ffffff"
                opacity="0.3"
                fontSize="32"
                fontWeight="900"
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}
          {HOME_PATHS.BLUE.map(([gx, gy], i) => (
            <g key={`blue-h-${i}`}>
              <rect
                x={gx * 100}
                y={gy * 100}
                width="100"
                height="100"
                fill="#2563eb"
                stroke="#1e3a8a"
                strokeWidth="2"
                opacity="0.9"
              />
              <text
                x={gx * 100 + 50}
                y={gy * 100 + 60}
                fill="#ffffff"
                opacity="0.3"
                fontSize="32"
                fontWeight="900"
                textAnchor="middle"
              >
                {i + 1}
              </text>
            </g>
          ))}

          {/* Center Home Triangles */}
          <polygon points="600,600 750,750 600,900" fill="#dc2626" />
          <polygon points="600,600 750,750 900,600" fill="#059669" />
          <polygon points="900,600 750,750 900,900" fill="#d97706" />
          <polygon points="600,900 750,750 900,900" fill="#2563eb" />
        </g>

        {/* Center Golden Medallion Crown with Rotating Sunburst & Home Counters */}
        <g>
          {/* Rotating Sunburst Rays */}
          <g className="animate-crown-rays" transform="translate(750, 750)">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={`ray-${deg}`}
                x1="0"
                y1="-75"
                x2="0"
                y2="-90"
                stroke="#fbbf24"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.5"
                transform={`rotate(${deg})`}
              />
            ))}
          </g>

          {/* Center Medallion Plate */}
          <circle cx="750" cy="750" r="64" fill="#090d16" stroke="url(#goldCollar)" strokeWidth="5" />
          <circle cx="750" cy="750" r="54" fill="#1e1b4b" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
          <text x="750" y="768" fill="#fbbf24" fontSize="46" textAnchor="middle" fontWeight="bold">
            👑
          </text>

          {/* 4 Cardinal Player Home Progress Counters */}
          {/* Red (Left) */}
          <g transform="translate(660, 750)">
            <rect x="-30" y="-12" width="60" height="24" rx="12" fill="#7f1d1d" stroke="#fca5a5" strokeWidth="1.5" />
            <text x="0" y="5" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
              {homeCounts.RED}/4 🔴
            </text>
          </g>
          {/* Green (Top) */}
          <g transform="translate(750, 660)">
            <rect x="-30" y="-12" width="60" height="24" rx="12" fill="#064e3b" stroke="#6ee7b7" strokeWidth="1.5" />
            <text x="0" y="5" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
              {homeCounts.GREEN}/4 🟢
            </text>
          </g>
          {/* Yellow (Right) */}
          <g transform="translate(840, 750)">
            <rect x="-30" y="-12" width="60" height="24" rx="12" fill="#78350f" stroke="#fef08a" strokeWidth="1.5" />
            <text x="0" y="5" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
              {homeCounts.YELLOW}/4 🟡
            </text>
          </g>
          {/* Blue (Bottom) */}
          <g transform="translate(750, 840)">
            <rect x="-30" y="-12" width="60" height="24" rx="12" fill="#1e3a8a" stroke="#93c5fd" strokeWidth="1.5" />
            <text x="0" y="5" fill="#ffffff" fontSize="12" fontWeight="900" textAnchor="middle">
              {homeCounts.BLUE}/4 🔵
            </text>
          </g>
        </g>

        {/* Tactical Destination Tile Preview Highlight */}
        {previewInfo && (
          <g className="pointer-events-none">
            {/* Pulsing Target Cell Box */}
            <rect
              x={Math.floor(previewInfo.targetCx / 100) * 100}
              y={Math.floor(previewInfo.targetCy / 100) * 100}
              width="100"
              height="100"
              fill={previewInfo.isCapture ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.4)'}
              stroke={previewInfo.isCapture ? '#ef4444' : '#fbbf24'}
              strokeWidth="5"
              className="animate-dest-pulse"
              rx="8"
            />
            {/* Destination Badge / Crosshair */}
            <g transform={`translate(${previewInfo.targetCx}, ${previewInfo.targetCy})`}>
              {previewInfo.isCapture ? (
                <g className="animate-capture-crosshair">
                  <circle cx="0" cy="0" r="38" fill="rgba(220, 38, 38, 0.3)" stroke="#ef4444" strokeWidth="3" />
                  <text x="0" y="-8" fontSize="22" textAnchor="middle" fill="#ffffff" filter="drop-shadow(0 2px 4px #000)">
                    ⚔️
                  </text>
                  <rect x="-35" y="10" width="70" height="18" rx="9" fill="#dc2626" stroke="#fca5a5" strokeWidth="1" />
                  <text x="0" y="23" fontSize="10" fontWeight="900" fill="#ffffff" textAnchor="middle">
                    CAPTURE!
                  </text>
                </g>
              ) : previewInfo.isHome ? (
                <g className="animate-dest-pulse">
                  <circle cx="0" cy="0" r="36" fill="rgba(245, 158, 11, 0.35)" stroke="#fbbf24" strokeWidth="3" />
                  <text x="0" y="-6" fontSize="22" textAnchor="middle" fill="#ffffff">
                    🏆
                  </text>
                  <rect x="-32" y="10" width="64" height="18" rx="9" fill="#d97706" stroke="#fef08a" strokeWidth="1" />
                  <text x="0" y="23" fontSize="10" fontWeight="900" fill="#ffffff" textAnchor="middle">
                    HOME!
                  </text>
                </g>
              ) : previewInfo.isSafeStar ? (
                <g className="animate-dest-pulse">
                  <circle cx="0" cy="0" r="36" fill="rgba(16, 185, 129, 0.35)" stroke="#10b981" strokeWidth="3" />
                  <text x="0" y="-6" fontSize="22" textAnchor="middle" fill="#ffffff">
                    🛡️
                  </text>
                  <rect x="-30" y="10" width="60" height="18" rx="9" fill="#059669" stroke="#6ee7b7" strokeWidth="1" />
                  <text x="0" y="23" fontSize="10" fontWeight="900" fill="#ffffff" textAnchor="middle">
                    SAFE!
                  </text>
                </g>
              ) : (
                <g className="animate-dest-pulse">
                  <circle cx="0" cy="0" r="28" fill="rgba(245, 158, 11, 0.25)" stroke="#fbbf24" strokeWidth="2.5" />
                  <text x="0" y="6" fontSize="18" fontWeight="900" fill="#fef08a" textAnchor="middle">
                    +{diceValue}
                  </text>
                </g>
              )}
            </g>
          </g>
        )}

        {/* Dynamic Visual FX Layer (Footstep Ripples & Impact Explosions) */}
        <g id="ludoFxLayer" className="pointer-events-none">
          {stepRipples.map((rip) => (
            <circle
              key={rip.id}
              cx={rip.cx}
              cy={rip.cy}
              r="20"
              fill="none"
              stroke="#fbbf24"
              strokeWidth="4"
              className="animate-step-ripple"
            />
          ))}

          {impactEffects.map((imp) => {
            if (imp.type === 'CAPTURE') {
              return (
                <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                  <circle cx="0" cy="0" r="30" fill="none" stroke="#ef4444" strokeWidth="8" className="animate-capture-burst" />
                  <circle cx="0" cy="0" r="50" fill="none" stroke="#fbbf24" strokeWidth="4" className="animate-capture-burst" />
                  <text x="0" y="10" fontSize="36" textAnchor="middle" filter="drop-shadow(0 0 8px #ef4444)">
                    💥
                  </text>
                </g>
              );
            }
            if (imp.type === 'HOME') {
              return (
                <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                  <circle cx="0" cy="0" r="40" fill="none" stroke="#fbbf24" strokeWidth="6" className="animate-capture-burst" />
                  <text x="0" y="10" fontSize="36" textAnchor="middle" filter="drop-shadow(0 0 10px #fbbf24)">
                    🌟
                  </text>
                </g>
              );
            }
            return (
              <g key={imp.id} transform={`translate(${imp.cx}, ${imp.cy})`}>
                <circle cx="0" cy="0" r="30" fill="none" stroke="#10b981" strokeWidth="5" className="animate-capture-burst" />
                <text x="0" y="10" fontSize="32" textAnchor="middle">
                  🛡️
                </text>
              </g>
            );
          })}
        </g>

        {/* Pawns (Tokens) Layer */}
        {players.map((player) => {
          const isTurn = currentTurnColor === player.color;
          const colorKey = player.color.toLowerCase();

          return player.tokens.map((token) => {
            // Check if this token is currently in the middle of step-by-step walking animation
            const isThisTokenWalking =
              animatedTokenState &&
              animatedTokenState.playerColor === player.color &&
              animatedTokenState.tokenIndex === token.token_index;

            const [baseCx, baseCy] = getTokenCoords(token, player.color);
            let cellKey = '';
            if (token.position === -1) {
              cellKey = `yard_${player.color}_${token.token_index}`;
            } else if (token.position >= 56 || token.is_home) {
              cellKey = `home_${player.color}`;
            } else if (token.position > 50) {
              cellKey = `stretch_${player.color}_${token.position - 51}`;
            } else {
              const startOffsets: Record<LudoColor, number> = { RED: 0, GREEN: 13, YELLOW: 26, BLUE: 39 };
              const trackIdx = (startOffsets[player.color] + token.position) % 52;
              cellKey = `track_${trackIdx}`;
            }
            const { dx, dy, scale } = getClusterOffset(cellKey, player.id, token.token_index);

            let rawCx = baseCx + dx;
            let rawCy = baseCy + dy;

            if (isThisTokenWalking && animatedTokenState) {
              rawCx = animatedTokenState.cx;
              rawCy = animatedTokenState.cy;
            }

            const isLegal = isTurn && isMyTurn && legalTokenIndices.includes(token.token_index);
            const isHighlighted = isLegal && diceValue === 6;
            const isHovered = hoveredTokenIndex === token.token_index;
            const hopOffset = isThisTokenWalking && animatedTokenState ? animatedTokenState.hopY : 0;
            const cx = rawCx;
            const cy = isHighlighted ? rawCy - 12 + hopOffset : rawCy + hopOffset;

            return (
              <g
                key={`tok-${player.id}-${token.token_index}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isLegal) onTokenClick(token.token_index);
                }}
                onMouseEnter={() => {
                  if (isLegal) setHoveredTokenIndex(token.token_index);
                }}
                onMouseLeave={() => {
                  if (hoveredTokenIndex === token.token_index) setHoveredTokenIndex(null);
                }}
                onTouchStart={() => {
                  if (isLegal) setHoveredTokenIndex(token.token_index);
                }}
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  transform: scale !== 1 ? `scale(${scale})` : undefined,
                  transition: isThisTokenWalking ? 'none' : 'transform 0.25s ease',
                  cursor: isLegal ? 'pointer' : 'default',
                  pointerEvents: isLegal ? 'all' : 'auto',
                  touchAction: 'manipulation',
                }}
              >
                {/* Active Turn Ground Halo & Pulse Rings (Only when rolling a 6) */}
                {isHighlighted && !isThisTokenWalking && (
                  <g>
                    {/* Multi-layered Pulsing Golden Beacon Aura */}
                    <ellipse
                      cx={rawCx}
                      cy={rawCy + 15}
                      rx="52"
                      ry="24"
                      fill="rgba(245, 158, 11, 0.4)"
                      stroke="#fbbf24"
                      strokeWidth="5"
                      className="ludo-token-pulse-ring"
                    />
                    <ellipse
                      cx={rawCx}
                      cy={rawCy + 15}
                      rx="38"
                      ry="17"
                      fill="rgba(254, 240, 138, 0.25)"
                      stroke="#fef08a"
                      strokeWidth="3"
                      strokeDasharray="8,5"
                    />
                    {/* Bouncing Golden Floating 3D Pointer Arrow Above Pawn */}
                    <g className="ludo-token-bounce-arrow pointer-events-none">
                      <polygon
                        points={`${cx},${cy - 80} ${cx - 18},${cy - 108} ${cx + 18},${cy - 108}`}
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth="3"
                        filter="drop-shadow(0 6px 12px rgba(0,0,0,0.85))"
                      />
                      <polygon
                        points={`${cx},${cy - 84} ${cx - 12},${cy - 103} ${cx + 12},${cy - 103}`}
                        fill="#fef08a"
                      />
                      {/* Floating glowing crown star atop arrow */}
                      <circle
                        cx={cx}
                        cy={cy - 118}
                        r="10"
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth="2"
                        filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
                      />
                      <text
                        x={cx}
                        y={cy - 114}
                        textAnchor="middle"
                        fontSize="13"
                        fontWeight="900"
                        fill="#ffffff"
                      >
                        ★
                      </text>
                    </g>
                  </g>
                )}

                {/* 3D Luxury Custom Token */}
                <g
                  className={isLegal && !isThisTokenWalking ? 'ludo-movable-pawn' : ''}
                  filter={isHighlighted ? 'url(#goldLegalGlow)' : 'url(#pawnDropShadow)'}
                  opacity={isMyTurn && isTurn && !isLegal && legalTokenIndices.length > 0 ? 0.45 : 1}
                  style={{
                    transform: isHovered && isLegal ? 'scale(1.12)' : 'scale(1)',
                    transformOrigin: `${cx}px ${cy}px`,
                    transition: 'transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
                  }}
                >
                  <g
                    transform={`translate(0 ${PAWN_SETTLE_Y}) translate(${cx} ${cy}) scale(${PAWN_FIT_SCALE}) translate(${-cx} ${-cy})`}
                  >
                    {/* Ground Contact Shadow */}
                    <ellipse
                      cx={cx}
                      cy={cy + 18}
                      rx={isThisTokenWalking ? 22 : 32}
                      ry={isThisTokenWalking ? 7 : 11}
                      fill="rgba(0,0,0,0.65)"
                    />

                    {/* Render chosen token style */}
                    {renderPawnGraphic(tokenStyle, cx, cy, colorKey, Boolean(isHighlighted))}
                  </g>
                </g>

                {/* Enlarged touch area for mobile click comfort — centred on the
                    pawn where it now sits, so taps near its base register too. */}
                {isLegal && (
                  <circle
                    cx={cx}
                    cy={cy - 4}
                    r="60"
                    fill="#ffffff"
                    opacity="0.001"
                    pointerEvents="all"
                    style={{ cursor: 'pointer' }}
                  />
                )}
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};
