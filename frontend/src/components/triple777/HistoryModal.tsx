import { X } from "lucide-react";
import { SYMBOL_DISPLAY } from "../../services/triple777/symbols";
import type { HistoryItem } from "../../services/triple777/api";

interface HistoryModalProps {
  items: HistoryItem[];
  loading: boolean;
  onClose: () => void;
}

export function HistoryModal({ items, loading, onClose }: HistoryModalProps) {
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
          <h2 className="text-lg font-black text-amber-400">ROUND HISTORY</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-neutral-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading history...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">No rounds played yet.</div>
        ) : (
          <div className="mt-3 max-h-64 divide-y divide-neutral-800 overflow-y-auto rounded-xl border border-neutral-800 bg-neutral-950">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2.5">
                <div>
                  <div className="flex items-center gap-1 text-base font-black">
                    {item.reels.map((r, i) => (
                      <span key={i}>{SYMBOL_DISPLAY[r] ?? r}</span>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500">{item.round_code}</span>
                </div>
                <div className="text-right">
                  <div
                    className={`text-xs font-black ${
                      item.won ? "text-emerald-400" : "text-slate-400"
                    }`}
                  >
                    {item.won ? `+₹${item.payout.toFixed(2)}` : `-₹${item.stake.toFixed(2)}`}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    {item.multiplier > 0 ? `${item.multiplier}x` : "0x"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

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
