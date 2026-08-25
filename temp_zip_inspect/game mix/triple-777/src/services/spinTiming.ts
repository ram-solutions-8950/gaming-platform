// Approved spin-pacing spec (ms from SPIN tap). Shared by SlotReels (which
// drives each reel's CSS transition duration off these stop times) and
// App.tsx (which delays revealing the WIN banner/balance/jackpot
// celebration until just after the last reel visually lands) — one source
// of truth so the two stay in sync.
export type SpinPace = "normal" | "turbo" | "jackpot";

// [reel0 stop, reel1 stop, reel2 stop]
export const REEL_STOPS_MS: Record<SpinPace, [number, number, number]> = {
  normal: [900, 1300, 1700],
  jackpot: [900, 1400, 1800],
  turbo: [400, 700, 1000],
};

// Extra pause after the last reel lands before the outcome (WIN/balance/
// celebration) reveals — matches the spec's "2.0s result confirmed" (normal),
// "2.2s Final 7" (jackpot), and turbo's near-immediate reveal.
export const REVEAL_BUFFER_MS: Record<SpinPace, number> = {
  normal: 300,
  jackpot: 400,
  turbo: 100,
};

export function spinPace(turbo: boolean, jackpot: boolean): SpinPace {
  if (turbo) return "turbo";
  return jackpot ? "jackpot" : "normal";
}
