import { ArrowLeft } from "lucide-react";
import { SYMBOL_COLOR, SYMBOL_DISPLAY } from "../services/symbols";
import type { Triple777Config } from "../services/api";

export function Paytable({ config, onBack }: { config: Triple777Config | null; onBack: () => void }) {
  const entries = Object.entries(config?.paytable ?? {}).sort(([, a], [, b]) => b - a);

  return (
    <div className="flex min-h-full flex-col gap-4 p-5">
      <header className="flex items-center gap-3">
        <button className="flex h-12 w-12 items-center justify-center rounded-lg text-slate-200 active:bg-ink-800" onClick={onBack} aria-label="Back"><ArrowLeft size={20} /></button>
        <h1 className="font-display text-xl font-bold text-gold-400">Paytable</h1>
      </header>
      <p className="text-sm text-slate-400">Match all three reels for the symbol's rate, or any two for a smaller flat win. Payout = stake × multiplier.</p>

      <div className="divide-y divide-ink-700 overflow-hidden rounded-xl border border-ink-700">
        {entries.map(([symbol, multiplier]) => (
          <div key={symbol} className="flex items-center justify-between bg-ink-900/60 px-4 py-3">
            {symbol === "two_match" ? (
              <span className="font-display text-sm font-bold uppercase tracking-wide text-slate-300">
                Any 2 Matching Symbols
              </span>
            ) : (
              <div className="flex items-center gap-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`font-display text-2xl font-bold ${SYMBOL_COLOR[symbol] ?? "text-white"}`}>
                    {SYMBOL_DISPLAY[symbol] ?? symbol}
                  </span>
                ))}
              </div>
            )}
            <span className="font-display text-lg font-bold text-gold-400">{multiplier}x</span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600">
        Other combinations don't pay. The exact paytable is configured server-side and may
        change without notice.
      </p>
    </div>
  );
}
