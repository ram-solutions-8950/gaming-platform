import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { getHapticsOn } from "./config";

async function fire(fn: () => Promise<void>): Promise<void> {
  try {
    if (!(await getHapticsOn())) return;
    await fn();
  } catch {
    // Haptics unsupported on this device/browser — never let it break gameplay.
  }
}

export const haptics = {
  spin: () => fire(() => Haptics.impact({ style: ImpactStyle.Medium })),
  reelStop: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
  win: () => fire(() => Haptics.impact({ style: ImpactStyle.Heavy })),
  tap: () => fire(() => Haptics.impact({ style: ImpactStyle.Light })),
};
