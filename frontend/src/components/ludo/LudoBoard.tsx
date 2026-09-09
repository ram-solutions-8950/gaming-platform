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
    <div className="ludo-board-wrapper relative w-full max-w-[min(90vw,calc(100dvh-var(--safe-top)-var(--safe-bottom)-72px),440px)] aspect-square rounded-2xl p-2 sm:p-2.5 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 shadow-2xl border border-amber-500/30 overflow-hidden flex items-center justify-center shrink-0">
      <svg
        viewBox="0 0 1500 1500"
        className="w-full h-full select-none rounded-xl drop-shadow-lg"
      >
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
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
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

          {/* Metallic Gold Collar Ring */}
          <linearGradient id="goldCollar" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#92400e" />
            <stop offset="30%" stopColor="#fef08a" />
            <stop offset="60%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>

          {/* 3D Pawn Shading: Red */}
          <radialGradient id="redHeadGrad" cx="30%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#fca5a5" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="85%" stopColor="#b91c1c" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </radialGradient>
          <linearGradient id="redBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#991b1b" />
            <stop offset="25%" stopColor="#ef4444" />
            <stop offset="55%" stopColor="#f87171" />
            <stop offset="80%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>

          {/* 3D Pawn Shading: Green */}
          <radialGradient id="greenHeadGrad" cx="30%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#a7f3d0" />
            <stop offset="50%" stopColor="#10b981" />
            <stop offset="85%" stopColor="#047857" />
            <stop offset="100%" stopColor="#064e3b" />
          </radialGradient>
          <linearGradient id="greenBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#065f46" />
            <stop offset="25%" stopColor="#10b981" />
            <stop offset="55%" stopColor="#34d399" />
            <stop offset="80%" stopColor="#059669" />
            <stop offset="100%" stopColor="#022c22" />
          </linearGradient>

          {/* 3D Pawn Shading: Yellow */}
          <radialGradient id="yellowHeadGrad" cx="30%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="85%" stopColor="#d97706" />
            <stop offset="100%" stopColor="#78350f" />
          </radialGradient>
          <linearGradient id="yellowBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="25%" stopColor="#fbbf24" />
            <stop offset="55%" stopColor="#fde047" />
            <stop offset="80%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#451a03" />
          </linearGradient>

          {/* 3D Pawn Shading: Blue */}
          <radialGradient id="blueHeadGrad" cx="30%" cy="25%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="20%" stopColor="#bfdbfe" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="85%" stopColor="#1d4ed8" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </radialGradient>
          <linearGradient id="blueBodyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e40af" />
            <stop offset="25%" stopColor="#3b82f6" />
            <stop offset="55%" stopColor="#60a5fa" />
            <stop offset="80%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
        </defs>

        {/* Board Background */}
        <rect width="1500" height="1500" fill="#0b1120" rx="32" />

        {/* 4 Large Corner Yards with Beveled Trays & Sunk Sockets */}
        {/* Red Yard (Top Left) */}
        <g>
          <rect x="0" y="0" width="600" height="600" fill="url(#yardRedGrad)" rx="24" />
          <rect x="85" y="85" width="430" height="430" fill="url(#yardTrayGrad)" rx="36" stroke="#fbbf24" strokeWidth="3" strokeOpacity="0.6" />
          
          {[
            [200, 200], [400, 200], [200, 400], [400, 400]
          ].map(([sx, sy], idx) => (
            <g key={`red-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
              <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#ef4444" strokeWidth="3" />
              <circle cx="0" cy="0" r="46" fill="url(#socketDepth)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#ef4444" opacity="0.45">★</text>
            </g>
          ))}
        </g>

        {/* Green Yard (Top Right) */}
        <g>
          <rect x="900" y="0" width="600" height="600" fill="url(#yardGreenGrad)" rx="24" />
          <rect x="985" y="85" width="430" height="430" fill="url(#yardTrayGrad)" rx="36" stroke="#fbbf24" strokeWidth="3" strokeOpacity="0.6" />
          
          {[
            [1100, 200], [1300, 200], [1100, 400], [1300, 400]
          ].map(([sx, sy], idx) => (
            <g key={`green-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
              <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#10b981" strokeWidth="3" />
              <circle cx="0" cy="0" r="46" fill="url(#socketDepth)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#10b981" opacity="0.45">★</text>
            </g>
          ))}
        </g>

        {/* Yellow Yard (Bottom Right) */}
        <g>
          <rect x="900" y="900" width="600" height="600" fill="url(#yardYellowGrad)" rx="24" />
          <rect x="985" y="985" width="430" height="430" fill="url(#yardTrayGrad)" rx="36" stroke="#fbbf24" strokeWidth="3" strokeOpacity="0.6" />
          
          {[
            [1100, 1100], [1300, 1100], [1100, 1300], [1300, 1300]
          ].map(([sx, sy], idx) => (
            <g key={`yellow-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
              <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />
              <circle cx="0" cy="0" r="46" fill="url(#socketDepth)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#f59e0b" opacity="0.45">★</text>
            </g>
          ))}
        </g>

        {/* Blue Yard (Bottom Left) */}
        <g>
          <rect x="0" y="900" width="600" height="600" fill="url(#yardBlueGrad)" rx="24" />
          <rect x="85" y="985" width="430" height="430" fill="url(#yardTrayGrad)" rx="36" stroke="#fbbf24" strokeWidth="3" strokeOpacity="0.6" />
          
          {[
            [200, 1100], [400, 1100], [200, 1300], [400, 1300]
          ].map(([sx, sy], idx) => (
            <g key={`blue-sock-${idx}`} transform={`translate(${sx}, ${sy})`}>
              <circle cx="0" cy="0" r="54" fill="#1e293b" stroke="#3b82f6" strokeWidth="3" />
              <circle cx="0" cy="0" r="46" fill="url(#socketDepth)" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <text x="0" y="8" fontSize="24" textAnchor="middle" fill="#3b82f6" opacity="0.45">★</text>
            </g>
          ))}
        </g>

        {/* Common Track Grid Cells */}
        {TRACK_COORDINATES.map(([gx, gy], i) => {
          let cellFill = '#111827';
          let isStart = false;
          let isStar = [8, 21, 34, 47].includes(i);

          if (i === 0) { cellFill = '#dc2626'; isStart = true; }
          else if (i === 13) { cellFill = '#059669'; isStart = true; }
          else if (i === 26) { cellFill = '#d97706'; isStart = true; }
          else if (i === 39) { cellFill = '#2563eb'; isStart = true; }

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
                  <circle cx={gx * 100 + 50} cy={gy * 100 + 50} r="32" fill="#0f172a" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
                  <text
                    x={gx * 100 + 50}
                    y={gy * 100 + 64}
                    fill="#fbbf24"
                    fontSize="42"
                    textAnchor="middle"
                    fontWeight="bold"
                  >
                    ★
                  </text>
                </g>
              )}
              {isStart && (
                <polygon
                  points={`${gx * 100 + 25},${gy * 100 + 25} ${gx * 100 + 75},${gy * 100 + 50} ${gx * 100 + 25},${gy * 100 + 75}`}
                  fill="#ffffff"
                  opacity="0.8"
                />
              )}
            </g>
          );
        })}

        {/* Home Stretch Paths */}
        {HOME_PATHS.RED.map(([gx, gy], i) => (
          <rect key={`red-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#dc2626" stroke="#450a0a" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.GREEN.map(([gx, gy], i) => (
          <rect key={`green-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#059669" stroke="#022c22" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.YELLOW.map(([gx, gy], i) => (
          <rect key={`yellow-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#d97706" stroke="#451a03" strokeWidth="2" opacity="0.9" />
        ))}
        {HOME_PATHS.BLUE.map(([gx, gy], i) => (
          <rect key={`blue-h-${i}`} x={gx * 100} y={gy * 100} width="100" height="100" fill="#2563eb" stroke="#1e3a8a" strokeWidth="2" opacity="0.9" />
        ))}

        {/* Center Home Triangles */}
        <polygon points="600,600 750,750 600,900" fill="#dc2626" />
        <polygon points="600,600 750,750 900,600" fill="#059669" />
        <polygon points="900,600 750,750 900,900" fill="#d97706" />
        <polygon points="600,900 750,750 900,900" fill="#2563eb" />
        <circle cx="750" cy="750" r="64" fill="#090d16" stroke="#fbbf24" strokeWidth="5" />
        <text x="750" y="766" fill="#fbbf24" fontSize="44" textAnchor="middle" fontWeight="bold">👑</text>

        {/* Luxury 3D Pawns (Tokens) */}
        {players.map((player) => {
          const isTurn = currentTurnColor === player.color;
          const colorKey = player.color.toLowerCase();
          const baseRimColors: Record<LudoColor, string> = {
            RED: '#7f1d1d',
            GREEN: '#064e3b',
            YELLOW: '#78350f',
            BLUE: '#1e3a8a',
          };
          const baseRim = baseRimColors[player.color] || '#334155';

          return player.tokens.map((token) => {
            const [rawCx, rawCy] = getTokenCoords(token, player.color);
            const isLegal = isTurn && isMyTurn && legalTokenIndices.includes(token.token_index);
            // Slight upward hover translation if active/legal
            const cx = rawCx;
            const cy = isLegal ? rawCy - 10 : rawCy;

            return (
              <g
                key={`tok-${player.id}-${token.token_index}`}
                onClick={() => {
                  if (isLegal) onTokenClick(token.token_index);
                }}
                className={isLegal ? 'cursor-pointer' : ''}
              >
                {/* Active Turn Ground Halo & Ping */}
                {isLegal && (
                  <g>
                    <ellipse
                      cx={rawCx}
                      cy={rawCy + 14}
                      rx="42"
                      ry="20"
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="5"
                      strokeDasharray="8,6"
                      className="animate-ping"
                      opacity="0.85"
                    />
                    {/* Golden Floating Pointer Arrow Above Pawn */}
                    <polygon
                      points={`${cx},${cy - 68} ${cx - 9},${cy - 82} ${cx + 9},${cy - 82}`}
                      fill="#fbbf24"
                      stroke="#78350f"
                      strokeWidth="1.5"
                    />
                  </g>
                )}

                {/* 3D Pawn Body with Drop Shadow */}
                <g filter={isLegal ? 'url(#goldLegalGlow)' : 'url(#pawnDropShadow)'}>
                  {/* Ground Contact Shadow */}
                  <ellipse cx={cx} cy={cy + 18} rx="32" ry="12" fill="rgba(0,0,0,0.65)" />

                  {/* Pawn Base: Bottom Shadow Rim */}
                  <ellipse cx={cx} cy={cy + 12} rx="28" ry="11" fill={baseRim} />
                  {/* Pawn Base: Top Plate */}
                  <ellipse
                    cx={cx}
                    cy={cy + 9}
                    rx="28"
                    ry="9"
                    fill={`url(#${colorKey}BodyGrad)`}
                    stroke="rgba(255,255,255,0.6)"
                    strokeWidth="1.2"
                  />

                  {/* Conical Tapered Waist Body */}
                  <path
                    d={`M ${cx - 22},${cy + 9} C ${cx - 20},${cy - 6} ${cx - 10},${cy - 22} ${cx - 8},${cy - 30} L ${cx + 8},${cy - 30} C ${cx + 10},${cy - 22} ${cx + 20},${cy - 6} ${cx + 22},${cy + 9} Z`}
                    fill={`url(#${colorKey}BodyGrad)`}
                  />

                  {/* Metallic Gold Collar Ring */}
                  <ellipse
                    cx={cx}
                    cy={cy - 30}
                    rx="12"
                    ry="4.5"
                    fill="url(#goldCollar)"
                    stroke="#78350f"
                    strokeWidth="0.8"
                  />

                  {/* Spherical 3D Head */}
                  <circle
                    cx={cx}
                    cy={cy - 48}
                    r="19"
                    fill={`url(#${colorKey}HeadGrad)`}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth="1"
                  />

                  {/* Specular Highlight Glints */}
                  <ellipse
                    cx={cx - 6}
                    cy={cy - 54}
                    rx="6.5"
                    ry="3.5"
                    fill="#ffffff"
                    opacity="0.85"
                    transform={`rotate(-25 ${cx - 6} ${cy - 54})`}
                  />
                  <circle cx={cx - 10} cy={cy - 48} r="2.2" fill="#ffffff" opacity="0.9" />
                </g>
              </g>
            );
          });
        })}
      </svg>
    </div>
  );
};
