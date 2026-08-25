import { getSoundOn, setSoundOn as persistSoundOn } from "./config";

/** Thin wrapper over `HTMLAudioElement` — actual audio files are NOT bundled
 * here (`/sounds/*.mp3`); drop them in `public/sounds/` when available,
 * playback fails silently if a file is missing. */
export type SoundKey = "reel_spin" | "reel_stop" | "small_win" | "big_win" | "777_win" | "button_click";

const FILES: Record<SoundKey, string> = {
  reel_spin: "/sounds/reel_spin.mp3",
  reel_stop: "/sounds/reel_stop.mp3",
  small_win: "/sounds/small_win.mp3",
  big_win: "/sounds/big_win.mp3",
  "777_win": "/sounds/777_win.mp3",
  button_click: "/sounds/button_click.mp3",
};

class SoundManager {
  private cache = new Map<SoundKey, HTMLAudioElement>();
  private muted = false;
  private volume = 0.8;
  private ready = false;

  async init(): Promise<void> {
    if (this.ready) return;
    this.muted = !(await getSoundOn());
    this.ready = true;
  }

  private get(key: SoundKey): HTMLAudioElement {
    let el = this.cache.get(key);
    if (!el) {
      el = new Audio(FILES[key]);
      el.preload = "auto";
      this.cache.set(key, el);
    }
    return el;
  }

  play(key: SoundKey): void {
    if (this.muted) return;
    const el = this.get(key);
    try {
      el.currentTime = 0;
      el.volume = this.volume;
      void el.play()?.catch(() => {});
    } catch {
      // ignore
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
    await persistSoundOn(!muted);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }
}

export const soundManager = new SoundManager();
