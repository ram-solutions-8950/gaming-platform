import { X } from "lucide-react";
import { SYMBOL_COLOR, SYMBOL_DISPLAY } from "../../services/triple777/symbols";
import type { Triple777Config } from "../../services/triple777/api";

interface PaytableModalProps {
  config: Triple777Config | null;
  onClose: () => void;
}

export function PaytableModal({ config, onClose }: PaytableModalProps) {
  const entries = Object.entries(config?.paytable ?? {
    "7": 100,
    BAR: 50,
    CHERRY: 25,
    LEMON: 15,
    BELL: 10,
    STAR: 8,
    COIN: 5,
    two_match: 2,
  }).sort(([, a], [, b]) => b - a);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
          <h2 className="text-lg font-black text-amber-400">PAYTABLE & RULES</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-neutral-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Match all 3 reels for top payouts, or any 2 symbols for a 2× consolation win. Payout = Stake × Multiplier.
        </p>

        <div className="mt-3 max-h-60 divide-y divide-neutral-800 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950">
          {entries.map(([symbol, multiplier]) => (
            <div key={symbol} className="flex items-center justify-between px-3 py-2">
              {symbol === "two_match" ? (
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Any 2 Matching Symbols
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={`text-xl font-black ${SYMBOL_COLOR[symbol] ?? "text-white"}`}
                    >
                      {SYMBOL_DISPLAY[symbol] ?? symbol}
                    </span>
                  ))}
                </div>
              )}
              <span className="font-black text-amber-400">{multiplier}×</span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-center">
          <span className="text-xs font-bold text-amber-300">
            👑 7-7-7 hits the Progressive Jackpot!
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 h-10 w-full rounded-xl bg-neutral-800 font-bold text-white hover:bg-neutral-700"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
