/**
 * Triple777 Sound Manager – Compatibility Wrapper
 *
 * Delegates all audio to the centralized CentralSoundManager.
 * Existing imports of `soundManager` from this path continue to work unchanged.
 */
import { soundManager as centralSoundManager, type SoundEvent } from "../soundManager";

export type SoundKey = "reel_spin" | "reel_stop" | "small_win" | "big_win" | "777_win" | "button_click";

class Triple777SoundManager {
  play(key: SoundKey): void {
    centralSoundManager.play(key as SoundEvent);
  }

  isMuted(): boolean {
    return centralSoundManager.isMuted();
  }

  setMuted(muted: boolean): void {
    if (muted) {
      centralSoundManager.mute();
    } else {
      centralSoundManager.unmute();
    }
  }
}

export const soundManager = new Triple777SoundManager();
