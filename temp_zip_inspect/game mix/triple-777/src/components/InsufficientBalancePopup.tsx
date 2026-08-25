// Shown instead of silently doing nothing when SPIN/AUTO is tapped without
// enough balance — SPIN stays tappable even when unaffordable (unlike a
// disabled button) specifically so this can fire and explain why nothing
// happened. "empty" (balance is exactly 0) and "insufficient" (some balance,
// just not enough for this bet) get slightly different copy per the
// approved spec; both only ever offer a real, working top-up path — Practice
// mode tops up free demo chips, Points mode opens the real deposit flow.
export function InsufficientBalancePopup({
  variant, balance, bet, addLabel, onAdd, onCancel, autoStopped = false,
}: {
  variant: "empty" | "insufficient";
  balance: number;
  bet: number;
  addLabel: string;
  onAdd: () => void;
  onCancel: () => void;
  autoStopped?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="animate-pop-in w-full max-w-xs rounded-2xl border-2 border-gold-500/70 bg-gradient-to-b from-ink-900 to-black px-6 py-6 text-center shadow-glow-strong"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-3xl">💰</p>
        {autoStopped && (
          <p className="mt-1 text-xs font-bold uppercase tracking-widest text-red-400">Auto Spin Stopped</p>
        )}
        <p className="mt-1 font-display text-lg font-bold uppercase tracking-widest text-gold-300">
          {variant === "empty" ? "Wallet Empty" : "Insufficient Balance"}
        </p>

        {variant === "empty" ? (
          <p className="mt-2 text-sm text-slate-400">Your balance is 0.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">Not enough balance for this bet.</p>
        )}

        <div className="mt-4 space-y-1 rounded-lg border border-ink-700 bg-ink-950/60 px-4 py-3 text-sm">
          <div className="flex justify-between text-slate-300">
            <span>Required</span>
            <span className="font-semibold text-slate-100">{bet.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-slate-300">
            <span>Available</span>
            <span className="font-semibold text-slate-100">{balance.toLocaleString()}</span>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-500">Add more to keep playing.</p>

        <button className="btn-spin mt-4 h-11 w-full" onClick={onAdd}>
          {addLabel}
        </button>
        <button
          className="mt-2 h-11 w-full rounded-xl border border-ink-700 font-display font-semibold text-slate-300 active:bg-ink-800"
          onClick={onCancel}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}
