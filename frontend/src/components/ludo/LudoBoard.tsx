import React from 'react';
import { useLudo } from '../../contexts/LudoContext';
import { LudoToken } from './LudoToken';
import { SAFE_CELLS, COMMON_PATH, LUDO_GRID_SIZE } from './utils';
import { useAuthStore } from '../../store/authStore';
import './ludo-king.css';

const YARD: Record<string, { pos: string; fill: string; inner: string }> = {
  RED: { pos: 'top-[2.2%] left-[2.2%]', fill: '#e53935', inner: '#ffcdd2' },
  GREEN: { pos: 'top-[2.2%] right-[2.2%]', fill: '#43a047', inner: '#c8e6c9' },
  YELLOW: { pos: 'bottom-[2.2%] right-[2.2%]', fill: '#fdd835', inner: '#fff9c4' },
  BLUE: { pos: 'bottom-[2.2%] left-[2.2%]', fill: '#1e88e5', inner: '#bbdefb' },
};

const START_CELLS: Record<string, { row: number; col: number }> = {
  RED: { row: 6, col: 1 },
  GREEN: { row: 1, col: 8 },
  YELLOW: { row: 8, col: 13 },
  BLUE: { row: 13, col: 6 },
};

function cellKind(r: number, c: number) {
  if (r < 6 && c < 6) return 'yard-red';
  if (r < 6 && c > 8) return 'yard-green';
  if (r > 8 && c > 8) return 'yard-yellow';
  if (r > 8 && c < 6) return 'yard-blue';
  if (r > 5 && r < 9 && c > 5 && c < 9) return 'center';
  if (r === 7 && c > 0 && c < 6) return 'lane-red';
  if (c === 7 && r > 0 && r < 6) return 'lane-green';
  if (r === 7 && c > 8 && c < 14) return 'lane-yellow';
  if (c === 7 && r > 8 && r < 14) return 'lane-blue';
  return 'path';
}

const KIND_BG: Record<string, string> = {
  'yard-red': '#e53935',
  'yard-green': '#43a047',
  'yard-yellow': '#fdd835',
  'yard-blue': '#1e88e5',
  center: 'transparent',
  'lane-red': '#e53935',
  'lane-green': '#43a047',
  'lane-yellow': '#fdd835',
  'lane-blue': '#1e88e5',
  path: '#fff8ee',
};

export const LudoBoard: React.FC = () => {
  const { match } = useLudo();
  const { user } = useAuthStore();

  if (!match) return null;

  const renderGrid = () => {
    const cells: React.ReactNode[] = [];

    for (let r = 0; r < LUDO_GRID_SIZE; r++) {
      for (let c = 0; c < LUDO_GRID_SIZE; c++) {
        const kind = cellKind(r, c);
        const pathIndex = COMMON_PATH.findIndex(coord => coord.row === r && coord.col === c);
        const isSafe = pathIndex !== -1 && SAFE_CELLS.includes(pathIndex);
        const startColor = (Object.keys(START_CELLS) as Array<keyof typeof START_CELLS>).find(
          color => START_CELLS[color].row === r && START_CELLS[color].col === c
        );

        let bg = KIND_BG[kind];
        if (startColor) {
          bg = YARD[startColor].fill;
        }

        cells.push(
          <div
            key={`${r}-${c}`}
            className="relative h-full w-full"
            style={{
              background: bg,
              boxShadow: kind === 'path' || isSafe ? 'inset 0 0 0 1px rgba(0,0,0,0.12)' : undefined,
            }}
          >
            {(isSafe || startColor) && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span
                  className="text-[7px] leading-none sm:text-[10px]"
                  style={{ color: startColor ? '#fff' : '#9e9e9e' }}
                >
                  ★
                </span>
              </div>
            )}
          </div>
        );
      }
    }

    return cells;
  };

  return (
    <div className="ludo-board-wrap relative mx-auto aspect-square w-full max-w-[620px]">
      <div className="ludo-board-frame relative h-full w-full rounded-[18px] p-[7px] sm:rounded-[22px] sm:p-[9px]">
        <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-[#fff8ee] sm:rounded-[14px]">
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${LUDO_GRID_SIZE}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${LUDO_GRID_SIZE}, minmax(0, 1fr))`,
            }}
          >
            {renderGrid()}
          </div>

          {(Object.keys(YARD) as Array<keyof typeof YARD>).map(color => {
            const y = YARD[color];
            const isTurn = match.current_turn_color === color;
            const player = match.players.find(p => p.color === color);
            const isMe = player?.user_id === user?.id;
            return (
              <div
                key={color}
                className={`absolute h-[35.6%] w-[35.6%] rounded-[14px] p-[7%] pointer-events-none ${y.pos} ${
                  isTurn ? 'ludo-yard-pulse' : ''
                }`}
                style={{ background: y.fill }}
              >
                <div
                  className="flex h-full w-full items-center justify-center rounded-[10px]"
                  style={{ background: y.inner }}
                >
                  <div className="grid w-[62%] grid-cols-2 gap-[18%]">
                    {[0, 1, 2, 3].map(i => (
                      <div
                        key={i}
                        className="aspect-square rounded-full border-[3px] border-white/80"
                        style={{ background: y.fill, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.25)' }}
                      />
                    ))}
                  </div>
                </div>
                {player && (
                  <div className="absolute left-1/2 top-1 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/70 px-2 py-0.5">
                    <span className="h-2 w-2 rounded-full bg-white" />
                    <span className="max-w-[72px] truncate text-[9px] font-bold text-white sm:text-[10px]">
                      {isMe ? 'You' : color}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[20%] w-[20%] -translate-x-1/2 -translate-y-1/2 overflow-hidden">
            <div className="absolute inset-0" style={{ background: '#43a047', clipPath: 'polygon(0 0, 100% 0, 50% 50%)' }} />
            <div className="absolute inset-0" style={{ background: '#fdd835', clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)' }} />
            <div className="absolute inset-0" style={{ background: '#1e88e5', clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)' }} />
            <div className="absolute inset-0" style={{ background: '#e53935', clipPath: 'polygon(0 0, 0 100%, 50% 50%)' }} />
          </div>

          <div className="absolute inset-0">
            {match.players.map(player =>
              player.tokens.map(token => (
                <LudoToken
                  key={`${player.id}-${token.id}`}
                  token={token}
                  color={player.color}
                />
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
