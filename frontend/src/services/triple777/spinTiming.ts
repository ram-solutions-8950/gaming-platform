export type SpinPace = "normal" | "turbo" | "jackpot";

// [reel0 stop, reel1 stop, reel2 stop] (milliseconds from spin start)
export const REEL_STOPS_MS: Record<SpinPace, [number, number, number]> = {
  normal: [900, 1300, 1700],
  jackpot: [900, 1400, 1800],
  turbo: [400, 700, 1000],
};

export const REVEAL_BUFFER_MS: Record<SpinPace, number> = {
  normal: 300,
  jackpot: 400,
  turbo: 100,
};

export function spinPace(turbo: boolean, jackpot: boolean): SpinPace {
  if (turbo) return "turbo";
  return jackpot ? "jackpot" : "normal";
}
