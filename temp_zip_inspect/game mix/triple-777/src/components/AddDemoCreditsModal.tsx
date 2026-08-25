import { useState } from "react";
import { X } from "lucide-react";
import * as api from "../services/api";

const { DEMO_TOPUP_AMOUNTS } = api;

interface AddDemoCreditsModalProps {
  serverUrl: string;
  balance: number;
  onClose: () => void;
  onTopUp: () => void;
}

/** Practice-mode-only free chip refill — the +100/+500/+1,000/+5,000 preset
 * denominations from the approved wallet-rules spec. Freely repeatable
 * (no lifetime cap, no payment), clearly labeled DEMO CREDITS throughout so
 * it's never mistaken for the real Add Money flow (`AddMoneyModal.tsx`),
 * which is Points-mode-only and does involve real payment. */
export function AddDemoCreditsModal({ serverUrl, balance, onClose, onTopUp }: AddDemoCreditsModalProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(amount: number) {
    setLoading(amount);
    setError(null);
    try {
      const newBalance = await api.demoTopup(serverUrl, amount);
      if (newBalance !== null) {
        onTopUp();
        onClose();
      } else {
        setError("Could not add credits — check your connection and try again.");
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="card-surface w-full max-w-sm space-y-4 rounded-b-none p-5 sm:rounded-b-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-gold-400">Add Demo Credits</h2>
          <button className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <p className="text-sm text-slate-400">
          Current balance: <span className="font-semibold text-slate-200">{balance.toLocaleString()}</span> DEMO CREDITS
        </p>

        <div className="grid grid-cols-2 gap-2">
          {DEMO_TOPUP_AMOUNTS.map((amount) => (
            <button
              key={amount}
              className="btn-spin h-14 text-lg"
              disabled={loading !== null}
              onClick={() => add(amount)}
            >
              {loading === amount ? "Adding…" : `+${amount.toLocaleString()}`}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        <p className="text-center text-[11px] text-slate-500">
          Free demo top-up — not real money, always available.
        </p>
      </div>
    </div>
  );
}
