import React, { useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  userBalance: number; // in paise
  onStartMatchmaking: (playerCount: number, entryFee: number) => void;
  searching: boolean;
  searchElapsedSeconds: number;
  searchRemainingSeconds: number;
  onCancelMatchmaking: () => void;
}

interface Tier {
  amount: number; // in paise
  label: string;
  winAmount: string;
  badge?: string;
}

const TIERS: Tier[] = [
  { amount: 1000, label: '₹10', winAmount: '₹18', badge: 'POPULAR' },
  { amount: 5000, label: '₹50', winAmount: '₹90', badge: 'HOT' },
  { amount: 10000, label: '₹100', winAmount: '₹180' },
  { amount: 50000, label: '₹500', winAmount: '₹900' },
];

export const LudoLobby: React.FC<Props> = ({
  userBalance,
  onStartMatchmaking,
  searching,
  searchElapsedSeconds,
  searchRemainingSeconds,
  onCancelMatchmaking,
}) => {
  const [playerCount, setPlayerCount] = useState<2 | 4>(2);
  const [selectedTier, setSelectedTier] = useState<Tier>(TIERS[0]);

  const canAfford = userBalance >= selectedTier.amount;

  return (
    <div className="ludo-lobby-card w-full max-w-lg mx-auto flex flex-col gap-6 p-4 sm:p-6 bg-slate-900/90 backdrop-blur-xl rounded-3xl border border-amber-500/30 shadow-2xl">
      {/* Header */}
      <div className="ludo-lobby-header flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="ludo-lobby-title text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-200 to-amber-500">
            LUDO ARENA
          </h2>
          <p className="ludo-lobby-subtitle text-xs text-slate-400">Authoritative Real Multiplayer Battle</p>
        </div>
        <div className="flex flex-col items-end">
          <span className="ludo-balance-lbl text-[10px] text-slate-400 font-medium">Your Balance</span>
          <span className="ludo-balance-val text-base font-black text-amber-400">
            ₹{(userBalance / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Mode Selector (2 vs 4 Players) */}
      <div className="flex flex-col gap-2">
        <label className="ludo-section-label text-xs font-bold text-slate-300 uppercase tracking-wider">
          Select Match Type
        </label>
        <div className="ludo-match-grid grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPlayerCount(2)}
            className={`ludo-match-btn flex flex-col items-center gap-1 p-3.5 rounded-2xl border transition-all cursor-pointer ${
              playerCount === 2
                ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-400/40 shadow-lg'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
            }`}
          >
            <span className="ludo-match-icon text-2xl">⚔️</span>
            <span className="ludo-match-title font-extrabold text-sm text-white">2 Players</span>
            <span className="ludo-match-sub text-[11px] text-amber-400/90 font-semibold">RED vs YELLOW (Opposite)</span>
          </button>

          <button
            type="button"
            onClick={() => setPlayerCount(4)}
            className={`ludo-match-btn flex flex-col items-center gap-1 p-3.5 rounded-2xl border transition-all cursor-pointer ${
              playerCount === 4
                ? 'border-amber-500 bg-amber-500/15 ring-2 ring-amber-400/40 shadow-lg'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400'
            }`}
          >
            <span className="ludo-match-icon text-2xl">👑</span>
            <span className="ludo-match-title font-extrabold text-sm text-white">4 Players</span>
            <span className="ludo-match-sub text-[11px] text-emerald-400/90 font-semibold">4-Way Royal Battle</span>
          </button>
        </div>
      </div>

      {/* Tier Selector */}
      <div className="flex flex-col gap-2">
        <label className="ludo-section-label text-xs font-bold text-slate-300 uppercase tracking-wider">
          Select Entry Fee Tier
        </label>
        <div className="ludo-tier-grid grid grid-cols-4 gap-2.5">
          {TIERS.map((t) => {
            const isSelected = selectedTier.amount === t.amount;
            return (
              <button
                key={t.amount}
                type="button"
                onClick={() => setSelectedTier(t)}
                className={`ludo-tier-btn relative flex flex-col items-center p-3 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/20 ring-2 ring-amber-400/40 shadow-md'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                {t.badge && (
                  <span className="ludo-tier-badge absolute -top-2 bg-gradient-to-r from-amber-500 to-red-500 text-slate-950 text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
                    {t.badge}
                  </span>
                )}
                <span className="ludo-tier-amount text-lg font-black text-white">{t.label}</span>
                <span className="ludo-tier-sub text-[10px] text-slate-400">Win {t.winAmount}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={() => onStartMatchmaking(playerCount, selectedTier.amount)}
        disabled={!canAfford || searching}
        className={`ludo-find-btn w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider shadow-xl transition-all transform active:scale-98 ${
          canAfford
            ? 'bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:brightness-110 text-slate-950 cursor-pointer shadow-amber-500/20'
            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
        }`}
      >
        {!canAfford ? 'INSUFFICIENT BALANCE' : `FIND MATCH (${selectedTier.label})`}
      </button>

      {/* 30-Second Matchmaking Radar Modal */}
      {searching &&
        createPortal(
          <div
            id="ludo-matchmaking-modal"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto"
            style={{
              paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
              paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
              paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
              paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)',
            }}
          >
            <div
              id="ludo-matchmaking-card"
              className="relative flex flex-col items-center gap-2.5 sm:gap-4 p-4 sm:p-6 bg-slate-900 border border-amber-500/50 rounded-2xl sm:rounded-3xl shadow-2xl max-w-xs w-full text-center max-h-[calc(100dvh-24px)] overflow-y-auto scrollbar-hide my-auto"
            >
              {/* Animated Radar Circle */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-60" />
                <div className="absolute inset-1.5 rounded-full border border-yellow-500/50 animate-pulse" />
                <span className="text-2xl sm:text-3xl">🎲</span>
              </div>

              <div className="shrink-0">
                <h3 className="text-base sm:text-lg font-black text-white leading-tight">SEARCHING OPPONENT</h3>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                  {playerCount} Players • {selectedTier.label} Table
                </p>
              </div>

              <div className="flex items-center justify-between w-full px-3 py-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs shrink-0">
                <span className="text-slate-400 text-[11px]">Elapsed: <strong className="text-white">{searchElapsedSeconds}s</strong></span>
                <span className="text-amber-400 font-bold text-[11px]">Timeout in: {searchRemainingSeconds}s</span>
              </div>

              <button
                type="button"
                onClick={onCancelMatchmaking}
                className="w-full py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 font-bold text-xs rounded-xl transition shrink-0 cursor-pointer border border-slate-700"
              >
                Cancel Matchmaking
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
