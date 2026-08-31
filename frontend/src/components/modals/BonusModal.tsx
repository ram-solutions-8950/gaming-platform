import React, { useEffect, useState } from 'react';
import { rewardService, type BonusItem } from '../../services/rewardService';
import { soundManager } from '../../services/soundManager';

interface Props {
  onClose: () => void;
  onWalletRefresh?: () => void;
}

export const BonusModal: React.FC<Props> = ({ onClose, onWalletRefresh }) => {
  const [bonuses, setBonuses] = useState<BonusItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchBonuses = async () => {
    try {
      setLoading(true);
      const data = await rewardService.getBonusList();
      setBonuses(data);
    } catch (err: any) {
      console.error('Failed to load bonuses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBonuses();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleClaim = async (bonus: BonusItem) => {
    if (!bonus.can_claim || claimingId) return;
    setClaimingId(bonus.id);
    setMsg(null);
    try {
      soundManager.play('button_click');
      const res = await rewardService.claimBonus(bonus.id);
      soundManager.play('win_clap');
      setMsg({ text: res.message, isError: false });
      if (onWalletRefresh) onWalletRefresh();
      await fetchBonuses();
    } catch (err: any) {
      const errorText = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Claim failed.';
      setMsg({ text: errorText, isError: true });
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#2d0c61] via-[#1a053c] to-[#0f0224] rounded-2xl border-2 border-amber-400/80 shadow-[0_0_40px_rgba(245,158,11,0.35)] overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎁</span>
            <div>
              <h2 className="text-base font-black text-purple-950 tracking-wider uppercase drop-shadow-sm leading-tight">
                Bonus Center
              </h2>
              <p className="text-[11px] font-bold text-purple-900/90 leading-tight">
                Claim active platform bonuses & special gifts!
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
        <div className="p-4 space-y-3 overflow-y-auto">
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

          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-purple-300 font-bold">Checking available bonuses...</span>
            </div>
          )}

          {!loading && bonuses.length === 0 && (
            <div className="py-8 text-center text-purple-300 text-xs font-bold">
              No active bonuses available right now. Check back soon!
            </div>
          )}

          {!loading &&
            bonuses.map((b) => (
              <div
                key={b.id}
                className="bg-[#180833]/90 border border-purple-500/30 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-lg font-black text-purple-950 shrink-0 shadow">
                    🎁
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-black text-white truncate">{b.title}</h3>
                    {b.description && (
                      <p className="text-[10px] text-gray-300 line-clamp-2 mt-0.5">{b.description}</p>
                    )}
                    <span className="text-xs font-extrabold text-yellow-300 mt-1 block">
                      +₹{b.amount_inr.toFixed(0)} Cash
                    </span>
                  </div>
                </div>

                <div className="shrink-0">
                  {b.can_claim ? (
                    <button
                      type="button"
                      onClick={() => handleClaim(b)}
                      disabled={claimingId === b.id}
                      className="bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 text-purple-950 font-black text-[11px] px-3.5 py-1.5 rounded-lg uppercase shadow border border-yellow-200 active:scale-95 transition cursor-pointer"
                    >
                      {claimingId === b.id ? '...' : 'CLAIM'}
                    </button>
                  ) : (
                    <div className="bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 font-extrabold text-[10px] px-2.5 py-1 rounded-lg uppercase">
                      CLAIMED ✓
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#0c021b] border-t border-purple-800/40 flex items-center justify-between text-[11px] text-purple-300">
          <span>Bonuses are credited instantly to your wallet.</span>
          <button onClick={onClose} className="text-amber-400 hover:text-amber-300 font-bold uppercase cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
