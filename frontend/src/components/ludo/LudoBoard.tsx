import React from 'react';
import type { LudoColor, LudoPlayer, LudoToken } from '../../types/ludo';

interface Props {
  players: LudoPlayer[];
  currentTurnColor: LudoColor | null;
  legalTokenIndices: number[];
  onTokenClick: (tokenIndex: number) => void;
  isMyTurn?: boolean;
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

export const LudoBoard: React.FC<Props> = ({
  players,
  currentTurnColor,
  legalTokenIndices,
  onTokenClick,
  isMyTurn,
}) => {
  // Convert token position to (cx, cy) on 1500x1500 board
  const getTokenCoords = (token: LudoToken, color: LudoColor): [number, number] => {
    if (token.position === -1) {
      const [gx, gy] = YARD_COORDINATES[color][token.token_index];
      return [gx * 100 + 50, gy * 100 + 50];
    }
    if (token.position >= 56 || token.is_home) {
      const [gx, gy] = HOME_CENTERS[color];
      return [gx * 100 + 50, gy * 100 + 50];
    }
    if (token.position > 50) {
      // Home stretch (steps 51..55 -> indices 0..4)
      const stretchIdx = token.position - 51;
      const [gx, gy] = HOME_PATHS[color][stretchIdx];
      return [gx * 100 + 50, gy * 100 + 50];
    }
    // Common track
    const startOffsets: Record<LudoColor, number> = {
      RED: 0,
      GREEN: 13,
      YELLOW: 26,
      BLUE: 39,
    };
    const trackIndex = (startOffsets[color] + token.position) % 52;
    const [gx, gy] = TRACK_COORDINATES[trackIndex];
    return [gx * 100 + 50, gy * 100 + 50];
  };

  return (
    <div className="ludo-board-wrapper relative w-full max-w-[620px] aspect-square rounded-2xl p-2 sm:p-3 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 shadow-2xl border border-amber-500/30 overflow-hidden flex items-center justify-center">
      <svg
        viewBox="0 0 1500 1500"
        className="w-full h-full select-none rounded-xl drop-shadow-lg"
      >
        <defs>
          {/* Gradients */}
          <radialGradient id="redGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="100%" stopColor="#b91c1c" />
          </radialGradient>
          <radialGradient id="greenGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#047857" />
          </radialGradient>
          <radialGradient id="yellowGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id="blueGrad" cx="30%" cy="30%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </radialGradient>

          {/* Token Glow Filter */}
          <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Board Background */}
        <rect width="1500" height="1500" fill="#0b0f19" rx="20" />

        {/* 4 Large Corner Yards */}
        {/* Red Yard (Top Left) */}
        <rect x="0" y="0" width="600" height="600" fill="#ef4444" opacity="0.9" />
        <rect x="100" y="100" width="400" height="400" fill="#ffffff" rx="30" />
        <circle cx="200" cy="200" r="60" fill="#ef4444" />
        <circle cx="400" cy="200" r="60" fill="#ef4444" />
        <circle cx="200" cy="400" r="60" fill="#ef4444" />
        <circle cx="400" cy="400" r="60" fill="#ef4444" />

        {/* Green Yard (Top Right) */}
        <rect x="900" y="0" width="600" height="600" fill="#10b981" opacity="0.9" />
        <rect x="1000" y="100" width="400" height="400" fill="#ffffff" rx="30" />
        <circle cx="1100" cy="200" r="60" fill="#10b981" />
        <circle cx="1300" cy="200" r="60" fill="#10b981" />
        <circle cx="1100" cy="400" r="60" fill="#10b981" />
        <circle cx="1300" cy="400" r="60" fill="#10b981" />

        {/* Yellow Yard (Bottom Right) */}
        <rect x="900" y="900" width="600" height="600" fill="#f59e0b" opacity="0.9" />
        <rect x="1000" y="1000" width="400" height="400" fill="#ffffff" rx="30" />
        <circle cx="1100" cy="1100" r="60" fill="#f59e0b" />
        <circle cx="1300" cy="1100" r="60" fill="#f59e0b" />
        <circle cx="1100" cy="1300" r="60" fill="#f59e0b" />
        <circle cx="1300" cy="1300" r="60" fill="#f59e0b" />

        {/* Blue Yard (Bottom Left) */}
        <rect x="0" y="900" width="600" height="600" fill="#3b82f6" opacity="0.9" />
        <rect x="100" y="1000" width="400" height="400" fill="#ffffff" rx="30" />
        <circle cx="200" cy="1100" r="60" fill="#3b82f6" />
        <circle cx="400" cy="1100" r="60" fill="#3b82f6" />
        <circle cx="200" cy="1300" r="60" fill="#3b82f6" />
        <circle cx="400" cy="1300" r="60" fill="#3b82f6" />

        {/* Common Track Grid Cells */}
        {TRACK_COORDINATES.map(([gx, gy], i) => {
          // Special styling for start cells and star safe cells
          let cellFill = '#1e293b';
          let isStart = false;
          let isStar = [8, 21, 34, 47].includes(i);

          if (i === 0) { cellFill = '#ef4444'; isStart = true; }
          else if (i === 13) { cellFill = '#10b981'; isStart = true; }
          else if (i === 26) { cellFill = '#f59e0b'; isStart = true; }
          else if (i === 39) { cellFill = '#3b82f6'; isStart = true; }

          return (
            <g key={`track-${i}`}>
              <rect
                x={gx * 100}
                y={gy * 100}
                width="100"
                height="100"
                fill={cellFill}
                stroke="#334155"
                strokeWidth="2"
              />
              {isStar && (
                <text
                  x={gx * 100 + 50}
                  y={gy * 100 + 68}
                  fill="#fcd34d"
                  fontSize="48"
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  ★
                </text>
              )}
              {isStart && (
                <polygon
                  points={`${gx * 100 + 20},${gy * 100 + 20} ${gx * 100 + 80},${gy * 100 + 50} ${gx * 100 + 20},${gy * 100 + 80}`}
                  fill="#ffffff"
                  opacity="0.6"
                />
              )}
            </g>
          );
        })}

        {/* Home Stretch Paths */}
        {HOME_PATHS.RED.map(([gx, gy], i) => (
          <rect key={`red-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#ef4444" stroke="#334155" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.GREEN.map(([gx, gy], i) => (
          <rect key={`green-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#10b981" stroke="#334155" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.YELLOW.map(([gx, gy], i) => (
          <rect key={`yellow-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#f59e0b" stroke="#334155" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.BLUE.map(([gx, gy], i) => (
          <rect key={`blue-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#3b82f6" stroke="#334155" strokeWidth="2" opacity="0.9" />
        ))}

        {/* Center Home Triangles */}
        <polygon points="600,600 750,750 600,900" fill="#ef4444" />
        <polygon points="600,600 750,750 900,600" fill="#10b981" />
        <polygon points="900,600 750,750 900,900" fill="#f59e0b" />
        <polygon points="600,900 750,750 900,900" fill="#3b82f6" />
        <circle cx="750" cy="750" r="60" fill="#0f172a" stroke="#f59e0b" strokeWidth="6" />
        <text x="750" y="765" fill="#f59e0b" fontSize="42" textAnchor="middle" fontWeight="bold">👑</text>

        {/* Tokens */}
        {players.map((player) => {
          const isTurn = currentTurnColor === player.color;

          return player.tokens.map((token) => {
            const [cx, cy] = getTokenCoords(token, player.color);
            const isLegal = isTurn && isMyTurn && legalTokenIndices.includes(token.token_index);
            const gradId = `${player.color.toLowerCase()}Grad`;

            return (
              <g
                key={`tok-${player.id}-${token.token_index}`}
                onClick={() => {
                  if (isLegal) onTokenClick(token.token_index);
                }}
                className={isLegal ? 'cursor-pointer hover:opacity-90' : ''}
              >
                {/* Pulsing Highlight for Legal Tokens */}
                {isLegal && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r="48"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="6"
                    className="animate-ping"
                    opacity="0.8"
                  />
                )}

                {/* Token Body */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="36"
                  fill={`url(#${gradId})`}
                  stroke="#ffffff"
                  strokeWidth="4"
                  filter={isLegal ? 'url(#goldGlow)' : undefined}
                />

                {/* Inner Ring */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="20"
                  fill="#ffffff"
                  opacity="0.35"
                />

                {/* Center Token Index Dot or Star */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="8"
                  fill="#ffffff"
                />
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};
