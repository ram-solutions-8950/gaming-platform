import React from 'react';
import type { LudoColor, LudoPlayer } from '../../types/ludo';

interface Props {
  player: LudoPlayer;
  isCurrentTurn: boolean;
  isMe: boolean;
}

const COLOR_STYLES: Record<LudoColor, { border: string; bg: string; text: string; badge: string }> = {
  RED: { border: 'border-red-500/60', bg: 'bg-red-950/40', text: 'text-red-400', badge: 'bg-red-500' },
  GREEN: { border: 'border-emerald-500/60', bg: 'bg-emerald-950/40', text: 'text-emerald-400', badge: 'bg-emerald-500' },
  YELLOW: { border: 'border-amber-500/60', bg: 'bg-amber-950/40', text: 'text-amber-400', badge: 'bg-amber-500' },
  BLUE: { border: 'border-blue-500/60', bg: 'bg-blue-950/40', text: 'text-blue-400', badge: 'bg-blue-500' },
};

export const LudoPlayerPanel: React.FC<Props> = ({
  player,
  isCurrentTurn,
  isMe,
}) => {
  const style = COLOR_STYLES[player.color];
  const homeCount = player.tokens.filter((t) => t.is_home || t.position >= 56).length;
  const isForfeited = player.consecutive_timeouts >= 3 || player.rank === 99;

  return (
    <div
      className={`ludo-player-card relative flex items-center justify-between p-2.5 sm:p-3 rounded-xl border transition-all duration-300 ${
        isCurrentTurn ? `${style.border} ${style.bg} shadow-lg ring-2 ring-amber-400/40` : 'border-slate-800 bg-slate-900/60 opacity-80'
      }`}
    >
      {/* Left: Avatar & Name */}
      <div className="flex items-center gap-2.5">
        <div className={`relative w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ${style.badge} shadow-md`}>
          {player.color.charAt(0)}
          {isCurrentTurn && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full animate-ping" />
          )}
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs sm:text-sm font-bold text-white max-w-[100px] sm:max-w-[130px] truncate">
              {player.username || 'Player'}
            </span>
            {isMe && (
              <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 font-semibold rounded">
                YOU
              </span>
            )}
          </div>
          <span className={`text-[11px] font-semibold ${style.text}`}>
            {player.color} {isForfeited && '• FORFEITED'}
          </span>
        </div>
      </div>

      {/* Right: Timeout Warning Dots & Home Score */}
      <div className="flex flex-col items-end gap-1">
        {/* Home Score */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">Home:</span>
          <span className="text-xs font-black text-amber-400">{homeCount}/4</span>
        </div>

        {/* 3 Timeout Warning Indicators */}
        <div className="flex items-center gap-1" title="Missed turn count (3 misses = forfeit)">
          {[0, 1, 2].map((idx) => {
            const hasTimedOut = player.consecutive_timeouts > idx;
            return (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full transition-all ${
                  hasTimedOut ? 'bg-red-500 ring-2 ring-red-400/60' : 'bg-slate-700'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
