import { useState } from "react";
import { X } from "lucide-react";
import * as api from "../services/api";

const AMOUNTS = [100, 500, 1000, 2000, 5000];

interface AddMoneyModalProps {
  serverUrl: string;
  onClose: () => void;
  onDeposited: () => void;
}

/**
 * Real, working Add Money flow (same `/api/v1/payments/deposit` + Razorpay
 * checkout every other game uses) — see chicken-road's AddMoneyModal for the
 * full rationale. Gated off until REAL_MONEY_ENABLED + KYC land via the
 * main-website integration; surfaces that honestly instead of faking success.
 */
export function AddMoneyModal({ serverUrl, onClose, onDeposited }: AddMoneyModalProps) {
  const [amount, setAmount] = useState(500);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addCash() {
    setError(null);
    setLoading(true);
    try {
      const order = await api.createDepositOrder(serverUrl, amount * 100);
      const ok = await api.loadRazorpayScript();
      if (!ok || !window.Razorpay) {
        setError("Could not load the payment provider. Check your connection and try again.");
        return;
      }
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "Triple 777",
        description: "Add money to wallet",
        order_id: order.razorpay_order_id,
        handler: () => {
          window.setTimeout(onDeposited, 2000);
          onClose();
        },
        theme: { color: "#d4af37" },
      });
      rzp.open();
    } catch (err) {
      const notLiveYet = err instanceof api.ApiError && (err.status === 403 || err.status === 502);
      const message = err instanceof Error ? err.message : "Could not start the payment.";
      setError(
        notLiveYet
          ? "Add Money isn't switched on yet in this app — it'll be enabled once this connects to the main website."
          : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="card-surface w-full max-w-sm space-y-4 rounded-b-none p-5 sm:rounded-b-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-gold-400">Add Money</h2>
          <button className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="flex flex-wrap gap-2">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                amount === a ? "bg-gold-500 text-ink-950 shadow-glow" : "bg-ink-800 text-slate-300 hover:bg-ink-700"
              }`}
            >
              ₹{a}
            </button>
          ))}
        </div>

        <input
          className="input text-center font-display text-lg"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
        />

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
        )}

        <button className="btn-gold w-full" disabled={loading} onClick={addCash}>
          {loading ? "Starting…" : `Add ₹${amount}`}
        </button>
        <p className="text-center text-[11px] text-slate-500">Secure payment via Razorpay.</p>
      </div>
    </div>
  );
}
