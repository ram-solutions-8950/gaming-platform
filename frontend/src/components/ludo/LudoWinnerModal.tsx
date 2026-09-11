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
  return createPortal(
    <div
      id="ludo-winner-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 animate-fade-in"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)',
      }}
    >
      <div className="relative flex flex-col items-center gap-2.5 sm:gap-4 p-4 sm:p-6 bg-gradient-to-b from-slate-900 via-slate-950 to-amber-950/60 border border-amber-500/50 rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.3)] max-w-sm w-full text-center">
        {/* Trophy or Game Icon */}
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full ${isMe ? 'bg-amber-500/20 border-amber-400/80 text-amber-400' : 'bg-red-500/20 border-red-500/60 text-red-400'} border-2 flex items-center justify-center text-3xl sm:text-4xl shadow-inner animate-bounce shrink-0`}>
          {isMe ? '🏆' : '💀'}
        </div>

        <div className="shrink-0">
          <h2 className={`text-xl sm:text-2xl font-black uppercase tracking-wider ${isMe ? 'text-amber-400' : 'text-red-400'}`}>
            {isMe ? 'VICTORY!' : forfeited ? 'FORFEITED' : 'DEFEAT'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
            {isMe
              ? 'Congratulations! You won the match!'
              : `${winnerPlayer?.username || winnerPlayer?.color || 'Opponent'} won the match.`}
          </p>
        </div>

        {/* Bet & Win & Balance Summary */}
        <div className="w-full py-2.5 px-3 sm:px-4 bg-slate-900/80 rounded-2xl border border-amber-500/30 flex justify-around items-center">
          {entryFee !== undefined && entryFee > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Entry Bet
              </span>
              <span className="text-xs sm:text-sm font-bold text-amber-300">
                ₹{(entryFee / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {isMe ? 'You Won' : 'Prize Pool'}
            </span>
            <span className={`text-sm sm:text-base font-black ${isMe ? 'text-emerald-400' : 'text-amber-400'}`}>
              ₹{(prizePool / 100).toFixed(2)}
            </span>
          </div>
          {userBalance !== undefined && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
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
          className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm rounded-xl uppercase tracking-wider shadow-lg transition transform active:scale-95 cursor-pointer"
        >
          Return to Lobby
        </button>
      </div>
    </div>,
    document.body
  );
};
