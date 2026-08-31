import React, { useEffect, useState } from 'react';
import { rewardService, type DailyRewardStatus, type DailyRewardDay } from '../../services/rewardService';
import { soundManager } from '../../services/soundManager';

interface Props {
  onClose: () => void;
  onWalletRefresh?: () => void;
  onOpenLuckySpin?: () => void;
}

export const Reward7DaysModal: React.FC<Props> = ({ onClose, onWalletRefresh, onOpenLuckySpin }) => {
  const [statusData, setStatusData] = useState<DailyRewardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<boolean | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const data = await rewardService.get7DayStatus();
      setStatusData(data);
    } catch (err: any) {
      console.error('Failed to load 7-day reward status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleClaim = async (day: DailyRewardDay) => {
    if (day.status !== 'CLAIMABLE' || claiming) return;
    setClaiming(true);
    setClaimMessage(null);
    try {
      soundManager.play('button_click');
      const res = await rewardService.claim7DayReward(day.day_number);
      setClaimSuccess(true);
      setClaimMessage(res.message);
      soundManager.play('win_clap');
      if (onWalletRefresh) onWalletRefresh();
      // Refresh status after claim
      await fetchStatus();
    } catch (err: any) {
      setClaimSuccess(false);
      setClaimMessage(err.response?.data?.message || err.message || 'Failed to claim reward.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#2a0b5a] via-[#1b053c] to-[#100224] rounded-2xl border-2 border-amber-400/80 shadow-[0_0_40px_rgba(245,158,11,0.35)] overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header Ribbon / Banner */}
        <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-base font-black text-purple-950 tracking-wider uppercase drop-shadow-sm">
                7-Day Daily Rewards
              </h2>
              <p className="text-[11px] font-bold text-purple-900/90 leading-tight">
                Log in daily & claim exclusive free cash & lucky spins!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-purple-950/20 hover:bg-purple-950/40 text-purple-950 font-black text-xl flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Qualifying Bet Requirement Banner */}
          {statusData && !statusData.has_qualifying_bet && (
            <div className="bg-gradient-to-r from-amber-500/20 via-red-500/25 to-amber-500/20 border border-amber-400/60 rounded-xl p-3 flex items-start gap-2.5 shadow-inner">
              <span className="text-xl shrink-0">⚠️</span>
              <div>
                <h4 className="text-xs font-black text-amber-300 uppercase tracking-wide">
                  Requirement Not Met
                </h4>
                <p className="text-[11px] text-gray-200 mt-0.5 leading-snug">
                  Place at least <strong className="text-yellow-300">₹{statusData.min_qualifying_bet_inr.toFixed(0)}</strong> bet in any game to unlock 7-Day Rewards.
                </p>
              </div>
            </div>
          )}

          {/* Feedback message */}
          {claimMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                claimSuccess
                  ? 'bg-emerald-950/80 border-emerald-400/70 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-red-950/80 border-red-400/70 text-red-200'
              }`}
            >
              <span>{claimMessage}</span>
              {claimSuccess && claimMessage.includes('Free Lucky Spin') && onOpenLuckySpin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLuckySpin();
                  }}
                  className="ml-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-purple-950 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase shadow hover:from-amber-300 hover:to-yellow-400 active:scale-95 transition"
                >
                  Spin Now 🎰
                </button>
              )}
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-purple-300 font-bold">Loading reward calendar...</span>
            </div>
          )}

          {/* 7 Days Grid */}
          {!loading && statusData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {statusData.days.map((day) => {
                const isClaimed = day.status === 'CLAIMED';
                const isClaimable = day.status === 'CLAIMABLE';
                const isLocked = day.status === 'LOCKED';
                const isDay4 = day.day_number === 4;
                const isDay7 = day.day_number === 7;

                return (
                  <div
                    key={day.day_number}
                    className={`relative rounded-xl p-3 flex flex-col items-center justify-between text-center transition-all duration-200 border ${
                      isClaimable
                        ? 'bg-gradient-to-b from-[#3b1279] via-[#4d169e] to-[#250a50] border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.4)] scale-[1.02]'
                        : isClaimed
                        ? 'bg-[#15062c]/80 border-purple-800/40 opacity-75'
                        : 'bg-[#180833]/90 border-purple-500/20 opacity-90'
                    } ${isDay7 ? 'sm:col-span-2' : ''}`}
                  >
                    {/* Day Pill */}
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[10px] font-black uppercase text-purple-300 tracking-wider">
                        DAY {day.day_number}
                      </span>
                      {isClaimed && (
                        <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/50 flex items-center justify-center text-[10px] font-black">
                          ✓
                        </span>
                      )}
                      {isLocked && (
                        <span className="text-gray-400 text-xs">🔒</span>
                      )}
                    </div>

                    {/* Reward Graphic */}
                    <div className="my-1.5 flex flex-col items-center">
                      {isDay4 ? (
                        <div className="relative">
                          <span className="text-3xl animate-bounce">🎰</span>
                          <span className="absolute -top-1 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase border border-pink-300 shadow">
                            Free
                          </span>
                        </div>
                      ) : isDay7 ? (
                        <span className="text-3xl">💰</span>
                      ) : (
                        <span className="text-2xl">🪙</span>
                      )}

                      <div className="mt-1">
                        <span className={`text-xs font-black block leading-none ${
                          isDay4
                            ? 'text-yellow-300 drop-shadow-[0_0_8px_rgba(253,224,71,0.6)]'
                            : 'text-amber-400 drop-shadow-sm'
                        }`}>
                          {day.label}
                        </span>
                        {isDay4 && (
                          <span className="text-[9px] text-purple-200 font-bold block mt-0.5">
                            1 FREE SPIN
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action / State Button */}
                    <div className="w-full mt-2">
                      {isClaimable ? (
                        <button
                          type="button"
                          onClick={() => handleClaim(day)}
                          disabled={claiming}
                          className="w-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-purple-950 font-black text-[11px] py-1.5 rounded-lg uppercase shadow-[0_0_12px_rgba(245,158,11,0.6)] border border-yellow-200 active:scale-95 transition cursor-pointer"
                        >
                          {claiming ? 'CLAIMING...' : 'CLAIM'}
                        </button>
                      ) : isClaimed ? (
                        <div className="w-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-extrabold text-[10px] py-1 rounded-lg uppercase">
                          CLAIMED
                        </div>
                      ) : (
                        <div className="w-full bg-purple-950/40 border border-purple-400/20 text-purple-400/60 font-extrabold text-[10px] py-1 rounded-lg uppercase">
                          LOCKED
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Next Claim Info */}
          {statusData && statusData.can_claim_today === false && statusData.has_qualifying_bet && (
            <div className="text-center py-1">
              <span className="text-[11px] text-purple-300/80 font-bold">
                🎉 Today's reward already claimed! Next reward unlocks at 00:00 UTC.
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#0c021b] border-t border-purple-800/40 flex items-center justify-between text-[11px] text-purple-300">
          <span>Streak resets if you miss a calendar day.</span>
          <button
            onClick={onClose}
            className="text-amber-400 hover:text-amber-300 font-bold uppercase cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
