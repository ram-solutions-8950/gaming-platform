import { Gem, Gamepad2 } from "lucide-react";

// Practice vs Points, same split as Teen Patti's lobby tabs (`tabPractice`/
// `tabPoints` in teen-patti/web/teen-patti.html) — Practice spends free demo
// virtual chips, Points spends the real-money wallet. Nothing here is faked:
// Points balance is whatever `real_paise` actually is (0 until a real
// deposit lands), and spinning in Points mode hits the same backend gate
// every other game already has (`real_money_enabled`) — if that's off
// platform-wide, the Lobby's own insufficient-balance guard already keeps
// the SPIN button disabled, so there's nothing to fake or hide here.
export function ModeSelect({
  virtualBalance, realBalance, onSelect,
}: {
  virtualBalance: number | null;
  realBalance: number | null;
  onSelect: (mode: "virtual" | "real") => void;
}) {
  return (
    <div
      className="flex h-[100dvh] flex-col items-center justify-center gap-6 px-6"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="text-center">
        <h1 className="title-777 text-4xl leading-none tracking-wide">TRIPLE 777</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">Choose Mode</p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <button
          className="frame-gold flex w-full flex-col items-center gap-2 px-6 py-6 active:scale-[0.98]"
          onClick={() => onSelect("virtual")}
        >
          <Gamepad2 size={32} className="text-gold-400" />
          <span className="font-display text-lg font-bold text-gold-400">PRACTICE</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Free demo chips</span>
          <span className="font-display text-2xl font-extrabold text-slate-100">
            {virtualBalance === null ? "…" : virtualBalance.toLocaleString()}
          </span>
        </button>

        <button
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-neon/60 bg-royal-900/30 px-6 py-6 shadow-glow-strong active:scale-[0.98]"
          onClick={() => onSelect("real")}
        >
          <Gem size={32} className="text-neon" />
          <span className="font-display text-lg font-bold text-neon">POINTS</span>
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Real balance</span>
          <span className="font-display text-2xl font-extrabold text-slate-100">
            {realBalance === null ? "…" : realBalance.toLocaleString()}
          </span>
        </button>
      </div>

      <p className="max-w-xs text-center text-[11px] text-slate-500">
        DEMO CREDITS — no real money is used. Points mode uses your real-money wallet where enabled.
      </p>
    </div>
  );
}
