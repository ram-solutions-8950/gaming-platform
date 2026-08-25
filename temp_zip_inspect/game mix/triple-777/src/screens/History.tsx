import { ArrowLeft } from "lucide-react";
import type { HistoryItem } from "../services/api";
import { SYMBOL_DISPLAY } from "../services/symbols";

export function History({ items, loading, onBack }: { items: HistoryItem[]; loading: boolean; onBack: () => void }) {
  return (
    <div className="flex min-h-full flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <button className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="font-display text-xl font-bold text-gold-400">Spin History</h1>
      </header>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {!loading && items.length === 0 && <p className="text-sm text-slate-400">No spins yet.</p>}

      <div className="divide-y divide-ink-700 overflow-hidden rounded-xl border border-ink-700">
        {items.map((item) => (
          <div key={item.round_code} className="flex items-center justify-between bg-ink-900/60 px-4 py-3">
            <div>
              <p className="font-mono text-xs text-slate-500">{item.round_code}</p>
              <p className="text-sm text-slate-300">
                {item.reels.map((r) => SYMBOL_DISPLAY[r] ?? r).join(" ")} · Bet {item.stake}
                {item.won && <> · {item.multiplier}x</>}
              </p>
              <p className="text-[11px] text-slate-500">
                {new Date(item.created_at).toLocaleString()} · Balance {item.balance_after}
              </p>
            </div>
            <div className={`text-right font-display font-bold ${item.won ? "text-green-400" : "text-red-400"}`}>
              <p>{item.jackpot_payout > 0 ? "★ JACKPOT" : item.won ? "WIN" : "LOSS"}</p>
              <p className="text-sm">
                {item.won ? `+${item.payout + item.jackpot_payout}` : `-${item.stake}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
