import { useEffect, useRef, useState } from "react";
import { ParticleBurst } from "./ParticleBurst";
import { SYMBOL_DISPLAY } from "../services/symbols";

export type ResultVariant = "win" | "bigwin" | "loss";

// Auto-close timing per the approved popup spec — win/bigwin get a short
// celebration beat before dismissing, loss stays brief and low-key.
export const RESULT_POPUP_MS: Record<ResultVariant, number> = {
  win: 1800,
  bigwin: 2200,
  loss: 1300,
};

function useCountUp(target: number, durationMs: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    if (target <= 0) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

interface ResultPopupProps {
  variant: ResultVariant;
  amount: number; // positive magnitude — sign is rendered based on variant
  bet: number;
  multiplier: number;
  symbols: [string, string, string];
  creditsLabel: string; // "DEMO CREDITS" (practice) or "POINTS" (real)
  onClose: () => void;
}

export function ResultPopup({ variant, amount, bet, multiplier, symbols, creditsLabel, onClose }: ResultPopupProps) {
  const autoCloseMs = RESULT_POPUP_MS[variant];
  const countedAmount = useCountUp(amount, Math.min(900, autoCloseMs - 300));

  // `onClose` (Lobby's closeResultPopup) is a fresh closure every render —
  // depending on it directly would restart this timer (and the popup's
  // on-screen time with it) on every unrelated parent re-render while it's
  // open. Read the latest via a ref instead so the timer is set up exactly
  // once, keyed only on the duration that's actually meant to change it.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const id = window.setTimeout(() => onCloseRef.current(), autoCloseMs);
    return () => window.clearTimeout(id);
  }, [autoCloseMs]);

  const isLoss = variant === "loss";
  const isBig = variant === "bigwin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`animate-pop-in relative w-full max-w-xs rounded-2xl border-2 px-6 py-6 text-center ${
          isLoss
            ? "border-royal-500/50 bg-gradient-to-b from-royal-900/70 to-ink-950 shadow-[0_0_24px_rgba(139,0,255,0.15)]"
            : "border-gold-400 bg-gradient-to-b from-ink-900 to-black shadow-glow-strong"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isLoss && <ParticleBurst keyToken={0} count={isBig ? 30 : 16} />}

        {isBig && (
          <p className="mb-1 text-xl tracking-widest text-gold-300 [text-shadow:0_0_10px_rgba(232,195,122,0.7)]">
            ✦ ✦ ✦ ✦ ✦
          </p>
        )}

        <p
          className={`font-display text-xs font-bold uppercase tracking-[0.25em] ${
            isLoss ? "text-slate-400" : "text-gold-300"
          }`}
        >
          {isLoss ? "Round Over" : isBig ? "Big Win!" : "✨ Nice Win ✨"}
        </p>

        {isBig ? (
          <p className="mt-2 font-display text-2xl font-black tracking-widest text-red-400 [text-shadow:0_0_14px_rgba(255,45,45,0.6)]">
            {symbols.map((s) => SYMBOL_DISPLAY[s] ?? s).join(" ")}
          </p>
        ) : (
          <p className={`mt-2 font-display text-lg font-bold ${isLoss ? "text-slate-300" : "text-slate-100"}`}>
            {isLoss ? "No Win" : "WIN!"}
          </p>
        )}

        <p
          className={`mt-2 font-display text-4xl font-black ${
            isLoss ? "text-red-400/90" : "text-gold-300 [text-shadow:0_0_16px_rgba(232,195,122,0.7)]"
          }`}
        >
          {isLoss ? "−" : "+"}
          {countedAmount.toLocaleString()}
        </p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{creditsLabel}</p>

        {isLoss ? (
          <p className="mt-3 text-sm text-slate-400">Better luck next spin</p>
        ) : (
          <div className="mt-3 flex justify-center gap-6 text-xs">
            <span className="text-slate-400">
              Bet <span className="font-semibold text-slate-200">{bet}</span>
            </span>
            <span className="text-slate-400">
              Multiplier <span className="font-semibold text-slate-200">{multiplier}×</span>
            </span>
          </div>
        )}

        <button
          className={`mt-5 h-11 w-full rounded-xl font-display font-bold ${
            isLoss ? "border border-royal-500/50 text-slate-200 active:bg-royal-900/40" : "btn-spin"
          }`}
          onClick={onClose}
        >
          {isLoss ? "TRY AGAIN" : "CONTINUE"}
        </button>
      </div>
    </div>
  );
}
