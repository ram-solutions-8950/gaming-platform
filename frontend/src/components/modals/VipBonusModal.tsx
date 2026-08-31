import React, { useEffect, useState } from 'react';
import { rewardService, type VipStatus, type VipTier } from '../../services/rewardService';
import { soundManager } from '../../services/soundManager';

interface Props {
  onClose: () => void;
  onWalletRefresh?: () => void;
  onDeposit?: () => void;
}

export const VipBonusModal: React.FC<Props> = ({ onClose, onWalletRefresh, onDeposit }) => {
  const [vipData, setVipData] = useState<VipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingLevel, setClaimingLevel] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchVip = async () => {
    try {
      setLoading(true);
      const data = await rewardService.getVipStatus();
      setVipData(data);
    } catch (err: any) {
      console.error('Failed to load VIP status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVip();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleClaim = async (tier: VipTier) => {
    if (!tier.can_claim || claimingLevel) return;
    setClaimingLevel(tier.vip_level);
    setMsg(null);
    try {
      soundManager.play('button_click');
      const res = await rewardService.claimVipBonus(tier.vip_level);
      soundManager.play('win_clap');
      setMsg({ text: res.message, isError: false });
      if (onWalletRefresh) onWalletRefresh();
      await fetchVip();
    } catch (err: any) {
      const errorText = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'VIP claim failed.';
      setMsg({ text: errorText, isError: true });
    } finally {
      setClaimingLevel(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-gradient-to-b from-[#2e0854] via-[#1a0335] to-[#0e011f] rounded-2xl border-2 border-amber-400/80 shadow-[0_0_40px_rgba(245,158,11,0.35)] overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-2xl">👑</span>
            <div>
              <h2 className="text-base font-black text-purple-950 tracking-wider uppercase drop-shadow-sm leading-tight">
                VIP Club & Rewards
              </h2>
              <p className="text-[11px] font-bold text-purple-900/90 leading-tight">
                Unlock exclusive tier bonuses as you deposit & play!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-purple-950/20 hover:bg-purple-950/40 text-purple-950 font-black text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
          {/* User VIP Badge and Lifetime Deposits */}
          {vipData && (
            <div className="bg-[#180533]/90 border border-amber-400/50 rounded-xl p-3 flex items-center justify-between shadow-inner">
              <div className="flex items-center gap-2.5">
                <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-amber-500 flex items-center justify-center text-xl shadow font-black text-purple-950">
                  👑
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white">Current Tier:</span>
                    <span className="bg-amber-400/20 text-yellow-300 text-[11px] font-black px-2 py-0.5 rounded-full border border-yellow-400/40 uppercase">
                      VIP {vipData.current_vip_level} - {vipData.current_level_name}
                    </span>
                  </div>
                  <span className="text-[11px] text-purple-300 block mt-0.5">
                    Total Deposited: <strong>₹{vipData.total_deposited_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                  </span>
                </div>
              </div>

              {onDeposit && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDeposit();
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 text-white font-black text-[10px] px-3 py-1.5 rounded-lg uppercase shadow active:scale-95 transition"
                >
                  Deposit +
                </button>
              )}
            </div>
          )}

          {/* Feedback message */}
          {msg && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                msg.isError
                  ? 'bg-red-950/80 border-red-400/70 text-red-200'
                  : 'bg-emerald-950/80 border-emerald-400/70 text-emerald-200'
              }`}
            >
              {msg.text}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-purple-300 font-bold">Loading VIP tiers...</span>
            </div>
          )}

          {/* Tier Cards Ladder */}
          {!loading && vipData && (
            <div className="space-y-2">
              {vipData.tiers.map((tier) => {
                const isCurrent = tier.is_current_tier;
                return (
                  <div
                    key={tier.vip_level}
                    className={`rounded-xl p-3 flex items-center justify-between border transition-all ${
                      isCurrent
                        ? 'bg-gradient-to-r from-[#3d1175] via-[#4f1699] to-[#2b0c53] border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                        : 'bg-[#15042d]/80 border-purple-800/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-purple-950 border border-amber-400/40 flex items-center justify-center text-sm font-black text-amber-300 shrink-0">
                        L{tier.vip_level}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-black text-white">{tier.level_name}</h4>
                          {isCurrent && (
                            <span className="text-[8px] bg-amber-400 text-purple-950 font-black px-1.5 py-0.2 rounded-full uppercase">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-purple-300 block">
                          Requirement: ₹{tier.min_deposit_inr.toLocaleString('en-IN')} Deposit
                        </span>
                        <span className="text-xs font-extrabold text-yellow-300 block">
                          Reward: ₹{tier.reward_amount_inr.toLocaleString('en-IN')} Cash
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {tier.can_claim ? (
                        <button
                          type="button"
                          onClick={() => handleClaim(tier)}
                          disabled={claimingLevel === tier.vip_level}
                          className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 text-purple-950 font-black text-[11px] px-3 py-1.5 rounded-lg uppercase shadow border border-yellow-200 active:scale-95 transition cursor-pointer"
                        >
                          {claimingLevel === tier.vip_level ? '...' : 'CLAIM'}
                        </button>
                      ) : tier.is_claimed ? (
                        <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-extrabold text-[10px] px-2.5 py-1 rounded-lg uppercase">
                          CLAIMED ✓
                        </div>
                      ) : (
                        <div className="bg-purple-950/40 border border-purple-400/20 text-purple-400/60 font-extrabold text-[10px] px-2.5 py-1 rounded-lg uppercase">
                          LOCKED 🔒
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#0c011a] border-t border-purple-800/40 flex items-center justify-between text-[11px] text-purple-300">
          <span>VIP tiers calculate lifetime deposits automatically.</span>
          <button onClick={onClose} className="text-amber-400 hover:text-amber-300 font-bold uppercase cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
