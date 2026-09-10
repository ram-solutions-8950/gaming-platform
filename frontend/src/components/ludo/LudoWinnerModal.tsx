import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import type { LudoPlayer } from '../../types/ludo';

interface Props {
  winnerPlayer: LudoPlayer | null;
  isMe: boolean;
  prizePool: number;
  entryFee?: number;
  userBalance?: number;
  onReturnToLobby: () => void;
}

export const LudoWinnerModal: React.FC<Props> = ({
  winnerPlayer,
  isMe,
  prizePool,
  entryFee,
  userBalance,
  onReturnToLobby,
}) => {
  return createPortal(
    <div
      id="ludo-winner-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-fade-in"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)',
      }}
    >
      <div className="relative flex flex-col items-center gap-3 sm:gap-5 p-4 sm:p-8 bg-gradient-to-b from-slate-900 via-slate-950 to-amber-950/60 border border-amber-500/50 rounded-2xl sm:rounded-3xl shadow-[0_0_50px_rgba(245,158,11,0.3)] max-w-sm w-full text-center max-h-[calc(100dvh-24px)] overflow-y-auto scrollbar-hide my-auto">
        {/* Back Button */}
        <div className="w-full flex justify-start">
          <button
            type="button"
            onClick={onReturnToLobby}
            className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer"
            aria-label="Back to Lobby"
          >
            <ArrowLeft size={14} />
            <span>Back</span>
          </button>
        </div>

        {/* Trophy icon */}
        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-amber-500/20 border-2 border-amber-400/80 flex items-center justify-center text-3xl sm:text-4xl shadow-inner animate-bounce shrink-0">
          🏆
        </div>

        <div className="shrink-0">
          <h2 className={`text-xl sm:text-3xl font-black ${isMe ? 'text-amber-400' : 'text-white'}`}>
            {isMe ? 'VICTORY!' : 'MATCH COMPLETED'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            {isMe
              ? 'Congratulations! You won the match!'
              : `${winnerPlayer?.username || winnerPlayer?.color || 'Player'} won the match.`}
          </p>
        </div>

        {/* Bet & Win & Balance Summary */}
        <div className="w-full py-3 px-4 bg-slate-900/80 rounded-2xl border border-amber-500/30 flex justify-around items-center">
          {entryFee !== undefined && entryFee > 0 && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Entry Bet
              </span>
              <span className="text-base font-bold text-amber-300">
                ₹{(entryFee / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
              {isMe ? 'You Won' : 'Prize Pool'}
            </span>
            <span className={`text-xl font-black ${isMe ? 'text-emerald-400' : 'text-amber-400'}`}>
              ₹{(prizePool / 100).toFixed(2)}
            </span>
          </div>
          {userBalance !== undefined && (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Total Balance
              </span>
              <span className="text-base font-black text-amber-400">
                ₹{(userBalance / 100).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onReturnToLobby}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:brightness-110 text-slate-950 font-black text-sm rounded-xl uppercase tracking-wider shadow-lg transition transform active:scale-95"
        >
          Return to Lobby
        </button>
      </div>
    </div>,
    document.body
  );
};
