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
  { rank: 1, name: 'DragonKing_99', vip: 'VIP 7', avatar: '🐉', winAmount: 215400, streak: '6 Wins' },
  { rank: 2, name: 'TigerClaw_X', vip: 'VIP 6', avatar: '🐅', winAmount: 168200, streak: '5 Wins' },
  { rank: 3, name: 'RoyalDealer88', vip: 'VIP 5', avatar: '👑', winAmount: 112500, streak: '4 Wins' },
  { rank: 4, name: 'DesiMaster', vip: 'VIP 5', avatar: '🔥', winAmount: 89000, streak: '3 Wins' },
  { rank: 5, name: 'LuckyCard77', vip: 'VIP 4', avatar: '💎', winAmount: 74200, streak: '3 Wins' },
  { rank: 6, name: 'ShadowTiger', vip: 'VIP 4', avatar: '⚡', winAmount: 58900, streak: '2 Wins' },
  { rank: 7, name: 'DragonBreath', vip: 'VIP 3', avatar: '🌟', winAmount: 46300, streak: '2 Wins' },
  { rank: 8, name: 'TieBreakerPRO', vip: 'VIP 3', avatar: '🎯', winAmount: 39800, streak: '1 Win' },
  { rank: 9, name: 'GoldenFang', vip: 'VIP 2', avatar: '🪙', winAmount: 31200, streak: '2 Wins' },
  { rank: 10, name: 'AceHunter', vip: 'VIP 2', avatar: '🃏', winAmount: 25600, streak: '1 Win' },
];

const WEEKLY_RANKINGS: RankingEntry[] = [
  { rank: 1, name: 'TigerClaw_X', vip: 'VIP 7', avatar: '🐅', winAmount: 785000, streak: '21 Wins' },
  { rank: 2, name: 'DragonKing_99', vip: 'VIP 7', avatar: '🐉', winAmount: 692000, streak: '17 Wins' },
  { rank: 3, name: 'RoyalDealer88', vip: 'VIP 6', avatar: '👑', winAmount: 514000, streak: '14 Wins' },
  { rank: 4, name: 'DesiMaster', vip: 'VIP 5', avatar: '🔥', winAmount: 430000, streak: '11 Wins' },
  { rank: 5, name: 'LuckyCard77', vip: 'VIP 5', avatar: '💎', winAmount: 365000, streak: '9 Wins' },
];

export interface DragonTigerRankingModalProps {
  onClose: () => void;
  myWinAmount?: number;
}

export const DragonTigerRankingModal: React.FC<DragonTigerRankingModalProps> = ({
  onClose,
  myWinAmount = 0,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly'>('daily');
  const list = activeTab === 'daily' ? DAILY_RANKINGS : WEEKLY_RANKINGS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full max-w-lg max-h-[92vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#1a0826] via-[#100618] to-[#08020d] border border-yellow-500/40 shadow-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-red-900/40 via-amber-900/30 to-blue-900/40 border-b border-yellow-500/30">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl drop-shadow">🏆</span>
            <div>
              <h2 className="text-lg font-black tracking-wide bg-gradient-to-r from-yellow-200 via-amber-400 to-yellow-200 bg-clip-text text-transparent">
                Dragon Tiger Rankings
              </h2>
              <p className="text-[11px] text-yellow-200/70 font-medium">
                Top table champions & high roller payouts
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
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-md shadow-amber-500/20 font-extrabold'
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
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-black shadow-md shadow-amber-500/20 font-extrabold'
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
                    ? 'bg-gradient-to-r from-amber-500/20 via-yellow-950/40 to-amber-500/10 border-amber-400/40 shadow-sm'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                {/* Left: Rank & Avatar & Name */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      item.rank === 1
                        ? 'bg-yellow-400 text-black shadow-md shadow-yellow-400/30'
                        : item.rank === 2
                        ? 'bg-slate-300 text-black'
                        : item.rank === 3
                        ? 'bg-amber-700 text-white'
                        : 'bg-white/10 text-gray-300'
                    }`}
                  >
                    {medal}
                  </div>

                  <span className="text-xl">{item.avatar}</span>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white/90">{item.name}</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/30">
                        {item.vip}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-semibold">{item.streak}</span>
                  </div>
                </div>

                {/* Right: Won Amount */}
                <div className="text-right">
                  <div className="text-xs font-black text-yellow-400 font-mono">
                    ₹{item.winAmount.toLocaleString()}
                  </div>
                  <span className="text-[9px] text-gray-400">Total Won</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: User's Own Ranking */}
        <div className="px-5 py-3 bg-black/60 border-t border-yellow-500/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">👤</span>
            <div>
              <div className="text-xs font-bold text-yellow-300">Your Rank</div>
              <div className="text-[10px] text-gray-400">
                {myWinAmount > 0 ? 'Rank #18 • Trending Up 📈' : 'Place a bet to join the leaderboard!'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-black text-emerald-400 font-mono">
              ₹{myWinAmount.toLocaleString()}
            </div>
            <span className="text-[9px] text-gray-400">Session Winnings</span>
          </div>
        </div>
      </div>
    </div>
  );
};
