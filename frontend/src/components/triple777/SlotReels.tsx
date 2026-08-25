import { useEffect, useRef, useState } from "react";
import { REEL_STOPS_MS, type SpinPace } from "../../services/triple777/spinTiming";
import { SYMBOL_COLOR, SYMBOL_DISPLAY } from "../../services/triple777/symbols";

const SYMBOL_HEIGHT = 68;
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
      className={`flex items-center justify-center transition-opacity select-none ${
        dim ? "opacity-35" : "opacity-100"
      }`}
      style={{ height: SYMBOL_HEIGHT }}
    >
      <span
        className={`font-black drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
          SYMBOL_COLOR[symbol] ?? "text-white"
        } ${isText ? "text-3xl tracking-wider" : "text-4xl"}`}
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
  reelIndex: number;
  pace: SpinPace;
}

function Reel({ symbols, target, spinToken, reelIndex, pace }: ReelProps) {
  const initial = () => [randomSymbol(symbols), target, randomSymbol(symbols)];
  const [strip, setStrip] = useState<string[]>(initial);
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
      setOffset(BLUR_LEN * SYMBOL_HEIGHT);
    });
    return () => cancelAnimationFrame(raf);
  }, [spinToken, target, symbols]);

  const duration = REEL_STOPS_MS[pace][reelIndex] / 1000;

  return (
    <div
      className="relative overflow-hidden bg-gradient-to-b from-neutral-900 via-black to-neutral-950"
      style={{ height: SYMBOL_HEIGHT * 3, width: SYMBOL_HEIGHT * 1.05 }}
    >
      <div
        style={{
          transform: `translateY(-${offset}px)`,
          transition: animate ? `transform ${duration}s cubic-bezier(0.12,0.82,0.22,1)` : "none",
        }}
      >
        {strip.map((s, i) => {
          const isMiddle = strip.length === 3 ? i === 1 : i === strip.length - 2;
          return <SymbolCell key={i} symbol={s} dim={!isMiddle} />;
        })}
      </div>
      {/* glass sheen */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/40" />
      {/* dim non-payline rows */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 to-transparent"
        style={{ height: SYMBOL_HEIGHT * 0.7 }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent"
        style={{ height: SYMBOL_HEIGHT * 0.7 }}
      />
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
    <div className="t777-machine-cabinet relative px-4 py-3">
      {/* top marquee bulbs */}
      <div className="absolute -top-1.5 left-3 right-3 flex justify-between">
        {Array.from({ length: BULB_COUNT }, (_, i) => (
          <span key={i} className="t777-bulb" style={{ animationDelay: `${(i % 5) * 0.15}s` }} />
        ))}
      </div>

      <div className="relative overflow-hidden rounded-xl border-2 border-amber-500/70 bg-black/60 shadow-[inset_0_3px_16px_rgba(0,0,0,0.9)]">
        <div className="flex items-stretch justify-center">
          <Reel symbols={symbols} target={reels[0]} spinToken={spinToken} reelIndex={0} pace={pace} />
          <div className="w-[1.5px] shrink-0 bg-gradient-to-b from-amber-500/50 via-amber-300/80 to-amber-500/50" />
          <Reel symbols={symbols} target={reels[1]} spinToken={spinToken} reelIndex={1} pace={pace} />
          <div className="w-[1.5px] shrink-0 bg-gradient-to-b from-amber-500/50 via-amber-300/80 to-amber-500/50" />
          <Reel symbols={symbols} target={reels[2]} spinToken={spinToken} reelIndex={2} pace={pace} />
        </div>
        {/* payline red-gold neon indicator across middle row */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-red-500/40 via-amber-300/90 to-red-500/40 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
      </div>

      {/* bottom marquee bulbs */}
      <div className="absolute -bottom-1.5 left-3 right-3 flex justify-between">
        {Array.from({ length: BULB_COUNT }, (_, i) => (
          <span key={i} className="t777-bulb" style={{ animationDelay: `${(i % 5) * 0.15 + 0.5}s` }} />
        ))}
      </div>
    </div>
  );
}
