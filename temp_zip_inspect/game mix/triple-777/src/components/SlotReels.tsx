import { useEffect, useRef, useState } from "react";
import { REEL_STOPS_MS, type SpinPace } from "../services/spinTiming";
import { SYMBOL_COLOR, SYMBOL_DISPLAY } from "../services/symbols";

// Classic 3-row slot window: each reel shows the settled symbol in the
// middle (the server-decided, actually-evaluated outcome) plus one random
// filler symbol above and below — purely decorative reel-strip dressing,
// same convention every real slot UI uses. There is only ever one payline
// here (the middle row, which is what the backend's paytable evaluates) —
// the top/bottom rows never imply extra wins, unlike a multi-line machine.
const SYMBOL_HEIGHT = 66;
const BLUR_LEN = 16;

function randomSymbol(allSymbols: string[]): string {
  return allSymbols[Math.floor(Math.random() * allSymbols.length)];
}

function buildStrip(target: string, allSymbols: string[]): string[] {
  const strip: string[] = [];
  for (let i = 0; i < BLUR_LEN; i++) strip.push(randomSymbol(allSymbols));
  strip.push(randomSymbol(allSymbols), target, randomSymbol(allSymbols));
  return strip;
}

function SymbolCell({ symbol, dim }: { symbol: string; dim?: boolean }) {
  const isText = symbol === "7" || symbol === "BAR";
  return (
    <div
      className={`flex items-center justify-center transition-opacity ${dim ? "opacity-45" : "opacity-100"}`}
      style={{ height: SYMBOL_HEIGHT }}
    >
      <span
        className={`font-display font-black drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)] ${SYMBOL_COLOR[symbol] ?? "text-white"} ${isText ? "text-3xl" : "text-4xl"}`}
        style={isText ? { WebkitTextStroke: "1px rgba(255,255,255,0.25)" } : undefined}
      >
        {SYMBOL_DISPLAY[symbol] ?? symbol}
      </span>
    </div>
  );
}

interface ReelProps {
  symbols: string[];
  target: string;
  spinToken: number;
  reelIndex: number; // 0, 1, 2 — later reels stop later, for the classic staggered feel
  pace: SpinPace;
}

/** requestAnimationFrame-free — a plain CSS `transition: transform` easing
 * does the deceleration, same convention as `Wheel.tsx` and the rest of the
 * platform. The result is decided server-side and known instantly; this
 * animation staggers the reveal per reel for the classic slot feel. Each
 * reel's transition duration is exactly its stop time from `spinTiming.ts`
 * (the shared, approved pacing spec) — reel 0 finishes first, reel 2 last. */
function Reel({ symbols, target, spinToken, reelIndex, pace }: ReelProps) {
  const initial = () => [randomSymbol(symbols), target, randomSymbol(symbols)];
  const [strip, setStrip] = useState<string[]>(initial);
  // Idle: the 3-symbol strip already exactly fills the 3-row window
  // (above/target/below), so no scroll offset is needed to center it.
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);
  const prevToken = useRef(spinToken);

  useEffect(() => {
    if (spinToken === prevToken.current) return;
    prevToken.current = spinToken;
    const newStrip = buildStrip(target, symbols);
    setAnimate(false);
    setStrip(newStrip);
    setOffset(0);
    const raf = requestAnimationFrame(() => {
      setAnimate(true);
      // Middle of the final 3 symbols (above/target/below) is at index
      // BLUR_LEN + 1 — translate so that row lands centered in the window.
      setOffset(BLUR_LEN * SYMBOL_HEIGHT);
    });
    return () => cancelAnimationFrame(raf);
  }, [spinToken, target, symbols]);

  const duration = REEL_STOPS_MS[pace][reelIndex] / 1000;

  return (
    <div
      className="relative overflow-hidden bg-gradient-to-b from-ink-900 to-black"
      style={{ height: SYMBOL_HEIGHT * 3, width: SYMBOL_HEIGHT }}
    >
      <div
        style={{
          transform: `translateY(-${offset}px)`,
          transition: animate ? `transform ${duration}s cubic-bezier(0.1,0.8,0.2,1)` : "none",
        }}
      >
        {strip.map((s, i) => {
          // While settled (strip length 3), only the middle row is the real
          // payline — dim the decorative neighbors above/below it.
          const isMiddle = strip.length === 3 ? i === 1 : i === strip.length - 2;
          return <SymbolCell key={i} symbol={s} dim={!isMiddle} />;
        })}
      </div>
      {/* glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/30" />
      {/* dim the non-payline rows so the middle row reads as the active line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/55 to-transparent" style={{ height: SYMBOL_HEIGHT * 0.6 }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent" style={{ height: SYMBOL_HEIGHT * 0.6 }} />
    </div>
  );
}

interface SlotReelsProps {
  symbols: string[];
  reels: [string, string, string];
  spinToken: number;
  pace?: SpinPace;
}

const BULB_COUNT = 10;

export function SlotReels({ symbols, reels, spinToken, pace = "normal" }: SlotReelsProps) {
  return (
    <div className="frame-gold relative px-4 py-4">
      {/* decorative marquee bulbs along the top edge */}
      <div className="absolute -top-1 left-3 right-3 flex justify-between">
        {Array.from({ length: BULB_COUNT }, (_, i) => (
          <span key={i} className="bulb" style={{ animationDelay: `${(i % 5) * 0.15}s` }} />
        ))}
      </div>

      <div className="relative overflow-hidden rounded-lg border-2 border-gold-500/70 bg-black/40 shadow-[inset_0_3px_14px_rgba(0,0,0,0.85)]">
        <div className="flex items-stretch justify-center">
          <Reel symbols={symbols} target={reels[0]} spinToken={spinToken} reelIndex={0} pace={pace} />
          <div className="w-px shrink-0 bg-gold-500/30" />
          <Reel symbols={symbols} target={reels[1]} spinToken={spinToken} reelIndex={1} pace={pace} />
          <div className="w-px shrink-0 bg-gold-500/30" />
          <Reel symbols={symbols} target={reels[2]} spinToken={spinToken} reelIndex={2} pace={pace} />
        </div>
        {/* payline indicator across the middle row */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gold-300/50" />
      </div>

      <div className="absolute -bottom-1 left-3 right-3 flex justify-between">
        {Array.from({ length: BULB_COUNT }, (_, i) => (
          <span key={i} className="bulb" style={{ animationDelay: `${(i % 5) * 0.15 + 0.6}s` }} />
        ))}
      </div>
    </div>
  );
}
