import React, { useState } from 'react';

interface RankingEntry {
  rank: number;
  name: string;
  vip: string;
  avatar: string;
  winAmount: number;
  streak: string;
}

const DAILY_RANKINGS: RankingEntry[] = [
  { rank: 1, name: 'Mobile153687..', vip: 'VIP 7', avatar: '👑', winAmount: 184500, streak: '5 Wins' },
  { rank: 2, name: 'LuckyRoller_88', vip: 'VIP 6', avatar: '💎', winAmount: 142000, streak: '4 Wins' },
  { rank: 3, name: 'LIVE 72', vip: 'VIP 5', avatar: '🔥', winAmount: 93987, streak: '3 Wins' },
  { rank: 4, name: 'RoyalSpinner', vip: 'VIP 5', avatar: '⭐', winAmount: 76500, streak: '2 Wins' },
  { rank: 5, name: 'Mobile209727..', vip: 'VIP 6', avatar: '⚡', winAmount: 68400, streak: '3 Wins' },
  { rank: 6, name: 'VegasKing99', vip: 'VIP 4', avatar: '🎲', winAmount: 51200, streak: '2 Wins' },
  { rank: 7, name: 'GoldenWheel', vip: 'VIP 4', avatar: '🌟', winAmount: 43800, streak: '1 Win' },
  { rank: 8, name: 'Mobile384192..', vip: 'VIP 3', avatar: '🎯', winAmount: 38900, streak: '2 Wins' },
  { rank: 9, name: 'DesiPlayerX', vip: 'VIP 3', avatar: '🪙', winAmount: 29500, streak: '1 Win' },
  { rank: 10, name: 'AceHigh77', vip: 'VIP 2', avatar: '🃏', winAmount: 24000, streak: '1 Win' },
];

const WEEKLY_RANKINGS: RankingEntry[] = [
  { rank: 1, name: 'LuckyRoller_88', vip: 'VIP 6', avatar: '💎', winAmount: 642000, streak: '18 Wins' },
  { rank: 2, name: 'Mobile153687..', vip: 'VIP 7', avatar: '👑', winAmount: 589000, streak: '14 Wins' },
  { rank: 3, name: 'VegasKing99', vip: 'VIP 5', avatar: '🎲', winAmount: 430000, streak: '11 Wins' },
  { rank: 4, name: 'LIVE 72', vip: 'VIP 5', avatar: '🔥', winAmount: 395000, streak: '9 Wins' },
  { rank: 5, name: 'RedBlackMaster', vip: 'VIP 4', avatar: '🔴', winAmount: 310000, streak: '8 Wins' },
];

export interface RouletteRankingModalProps {
  onClose: () => void;
  myWinAmount?: number;
}

export const RouletteRankingModal: React.FC<RouletteRankingModalProps> = ({
  onClose,
  myWinAmount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const list = activeTab === 'daily' ? DAILY_RANKINGS : WEEKLY_RANKINGS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#0a2f1d] via-[#041d12] to-[#02110a] border border-amber-400/40 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-amber-600/30 via-emerald-900/40 to-amber-600/30 border-b border-amber-400/25">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl drop-shadow">🏆</span>
            <div>
              <h2 className="text-lg font-black tracking-wide bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent">
                Roulette Rankings
              </h2>
              <p className="text-[11px] text-amber-200/70 font-medium">
                Top winners and table high rollers
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-gray-300 hover:text-white transition-all text-sm font-bold cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Period Tabs */}
        <div className="flex items-center gap-2 px-5 pt-3 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-md shadow-amber-500/20 font-extrabold'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            🔥 Today's Top
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weekly')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'weekly'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-600 text-black shadow-md shadow-amber-500/20 font-extrabold'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            ⭐ Weekly Champions
          </button>
        </div>

        {/* Ranking List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 max-h-[50vh]">
          {list.map((item) => {
            const isTop3 = item.rank <= 3;
            const medal =
              item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`;

            return (
              <div
                key={item.rank}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all ${
                  isTop3
                    ? 'bg-gradient-to-r from-amber-500/15 via-emerald-950/60 to-amber-500/10 border-amber-400/40 shadow-sm'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {/* Left: Rank & Avatar & Name */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      item.rank === 1
                        ? 'bg-gradient-to-b from-yellow-300 to-amber-600 text-black ring-2 ring-yellow-300'
                        : item.rank === 2
                        ? 'bg-gradient-to-b from-slate-200 to-slate-400 text-black ring-1 ring-white/50'
                        : item.rank === 3
                        ? 'bg-gradient-to-b from-amber-700 to-amber-900 text-yellow-200 ring-1 ring-amber-500'
                        : 'text-gray-400 font-semibold'
                    }`}
                  >
                    {medal}
                  </div>

                  <div className="w-8 h-8 rounded-full bg-slate-800 border border-amber-400/30 flex items-center justify-center text-base">
                    {item.avatar}
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-white">{item.name}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 text-[9px] font-black border border-amber-400/30">
                        {item.vip}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">{item.streak}</span>
                  </div>
                </div>

                {/* Right: Amount Won */}
                <div className="text-right">
                  <div className="text-xs font-black text-amber-300">
                    ₹{item.winAmount.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-gray-400 font-medium">Total Won</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* User's Current Session Rank Footer */}
        <div className="px-5 py-3 bg-black/60 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">👤</span>
            <div>
              <div className="text-xs font-bold text-white">Your Table Rank: #142</div>
              <div className="text-[10px] text-gray-400">Keep spinning to climb the ranks!</div>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-black text-emerald-400">
              {myWinAmount > 0 ? `+₹${myWinAmount.toFixed(2)}` : '₹0.00'}
            </span>
            <div className="text-[9px] text-gray-400">Session Wins</div>
          </div>
        </div>
      </div>
    </div>
  );
};
