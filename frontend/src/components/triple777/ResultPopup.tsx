import { useEffect, useRef, useState } from "react";
import { ParticleBurst } from "./ParticleBurst";
import { SYMBOL_DISPLAY } from "../../services/triple777/symbols";

export type ResultVariant = "win" | "bigwin" | "jackpot" | "loss";

export const RESULT_POPUP_MS: Record<ResultVariant, number> = {
  win: 2000,
  bigwin: 2600,
  jackpot: 3200,
  loss: 1400,
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
  amount: number;
  bet: number;
  multiplier: number;
  symbols: [string, string, string];
  onClose: () => void;
}

export function ResultPopup({
  variant,
  amount,
  bet,
  multiplier,
  symbols,
  onClose,
}: ResultPopupProps) {
  const autoCloseMs = RESULT_POPUP_MS[variant];
  const countedAmount = useCountUp(amount, Math.min(900, autoCloseMs - 300));

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = window.setTimeout(() => onCloseRef.current(), autoCloseMs);
    return () => window.clearTimeout(id);
  }, [autoCloseMs]);

  const isLoss = variant === "loss";
  const isJackpot = variant === "jackpot";
  const isBig = variant === "bigwin" || isJackpot;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className={`t777-result-card relative w-full max-w-xs rounded-2xl border-2 px-6 py-6 text-center ${
          isLoss
            ? "border-red-500/40 bg-gradient-to-b from-neutral-900 to-black shadow-[0_0_24px_rgba(239,68,68,0.2)]"
            : isJackpot
            ? "border-amber-400 bg-gradient-to-b from-amber-950/90 via-neutral-900 to-black shadow-[0_0_40px_rgba(251,191,36,0.6)]"
            : "border-yellow-400/80 bg-gradient-to-b from-neutral-900 to-black shadow-[0_0_30px_rgba(234,179,8,0.35)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isLoss && <ParticleBurst count={isBig ? 32 : 18} />}

        {isJackpot ? (
          <p className="mb-1 text-2xl tracking-widest text-amber-300 animate-pulse font-black">
            👑 JACKPOT 👑
          </p>
        ) : isBig ? (
          <p className="mb-1 text-xl tracking-widest text-yellow-300 font-bold">
            ✦ ✦ BIG WIN ✦ ✦
          </p>
        ) : null}

        <p
          className={`text-xs font-bold uppercase tracking-[0.25em] ${
            isLoss ? "text-slate-400" : isJackpot ? "text-amber-300" : "text-yellow-400"
          }`}
        >
          {isLoss ? "Round Over" : isJackpot ? "MEGA JACKPOT HIT!" : isBig ? "Super Win!" : "✨ Nice Win ✨"}
        </p>

        {isBig ? (
          <p className="mt-2 text-2xl font-black tracking-widest text-red-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.7)]">
            {symbols.map((s) => SYMBOL_DISPLAY[s] ?? s).join(" ")}
          </p>
        ) : (
          <p className={`mt-2 text-lg font-bold ${isLoss ? "text-slate-300" : "text-slate-100"}`}>
            {isLoss ? "No Match" : "WIN!"}
          </p>
        )}

        <p
          className={`mt-2 text-4xl font-black ${
            isLoss ? "text-red-400" : isJackpot ? "text-amber-300" : "text-yellow-400"
          }`}
        >
          {isLoss ? "−" : "+"}₹{countedAmount.toFixed(2)}
        </p>

        {isLoss ? (
          <p className="mt-3 text-sm text-slate-400">Better luck next spin</p>
        ) : (
          <div className="mt-3 flex justify-center gap-6 text-xs">
            <span className="text-slate-400">
              Bet <span className="font-semibold text-slate-200">₹{bet}</span>
            </span>
            <span className="text-slate-400">
              Multiplier <span className="font-semibold text-emerald-400">{multiplier}×</span>
            </span>
          </div>
        )}

        <button
          type="button"
          className={`mt-5 h-11 w-full rounded-xl font-bold cursor-pointer transition-transform active:scale-95 ${
            isLoss
              ? "border border-neutral-700 bg-neutral-800 text-slate-200"
              : "bg-gradient-to-b from-emerald-400 to-emerald-600 text-slate-950 shadow-lg shadow-emerald-500/30"
          }`}
          onClick={onClose}
        >
          {isLoss ? "TRY AGAIN" : "CONTINUE"}
        </button>
      </div>
    </div>
  );
}
