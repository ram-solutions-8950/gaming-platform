import React from 'react';
import { createPortal } from 'react-dom';
import type { LudoPlayer } from '../../types/ludo';

interface Props {
  winnerPlayer: LudoPlayer | null;
  isMe: boolean;
  prizePool: number;
  entryFee?: number;
  userBalance?: number;
  forfeited?: boolean;
  onReturnToLobby: () => void;
}

export const LudoWinnerModal: React.FC<Props> = ({
  winnerPlayer,
  isMe,
  prizePool,
  entryFee,
  userBalance,
  forfeited = false,
  onReturnToLobby,
}) => {
  React.useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(
    <div
      id="ludo-winner-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-hidden select-none animate-fade-in"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 8px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 8px)',
      }}
    >
      <div className="relative flex flex-col items-center gap-2 sm:gap-3 p-3.5 sm:p-5 bg-gradient-to-b from-slate-900 via-slate-950 to-amber-950/60 border border-amber-500/50 rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.3)] max-w-sm w-full text-center max-h-[calc(100dvh-16px)] overflow-hidden shrink-0">
        {/* Trophy or Game Icon */}
        <div className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full ${isMe ? 'bg-amber-500/20 border-amber-400/80 text-amber-400' : 'bg-red-500/20 border-red-500/60 text-red-400'} border-2 flex items-center justify-center text-2xl sm:text-3xl shadow-inner animate-bounce shrink-0`}>
          {isMe ? '🏆' : '💀'}
        </div>

        <div className="shrink-0">
          <h2 className={`text-lg sm:text-xl font-black uppercase tracking-wider ${isMe ? 'text-amber-400' : 'text-red-400'}`}>
            {isMe ? 'VICTORY!' : forfeited ? 'FORFEITED' : 'DEFEAT'}
          </h2>
          <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
            {isMe
              ? 'Congratulations! You won the match!'
              : `${winnerPlayer?.username || winnerPlayer?.color || 'Opponent'} won the match.`}
          </p>
        </div>

        {/* Bet & Win & Balance Summary */}
        <div className="w-full py-2 px-2.5 sm:px-4 bg-slate-900/80 rounded-xl sm:rounded-2xl border border-amber-500/30 flex justify-around items-center shrink-0">
          {entryFee !== undefined && entryFee > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Entry Bet
              </span>
              <span className="text-xs sm:text-sm font-bold text-amber-300">
                ₹{(entryFee / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {isMe ? 'You Won' : 'Prize Pool'}
            </span>
            <span className={`text-xs sm:text-base font-black ${isMe ? 'text-emerald-400' : 'text-amber-400'}`}>
              ₹{(prizePool / 100).toFixed(2)}
            </span>
          </div>
          {userBalance !== undefined && (
            <div className="flex flex-col items-center">
              <span className="text-[9px] sm:text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Total Balance
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-400">
                ₹{(userBalance / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onReturnToLobby}
          className="w-full py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm rounded-xl uppercase tracking-wider shadow-lg transition transform active:scale-95 cursor-pointer shrink-0"
        >
          Back to Lobby
        </button>
      </div>
    </div>,
    document.body
  );
};
