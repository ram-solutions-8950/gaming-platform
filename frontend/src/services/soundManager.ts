// src/services/soundManager.ts
// Centralized Casino Sound Manager – ONE manager for the entire platform.
import { Howl, Howler } from "howler";

// All sound events used across the platform


// All sound events used across the platform
export type SoundEvent =
  | "reveal_tick"
  | "win_clap"
  | "bet_coin"
  | "card_deal"
  | "betting_start"
  | "betting_stop"
  | "loss"
  | "cashout"
  | "jackpot"
  | "button_click"
  | "countdown_tick"
  // Triple777 specific events (oscillator-based, no MP3 needed)
  | "reel_spin"
  | "reel_stop"
  | "small_win"
  | "big_win"
  | "777_win"
  // Dragon/Tiger specific events
  | "dragon_wins"
  | "tiger_wins"
  // Ludo specific events
  | "dice_roll";

// Triple777 events that use Web Audio oscillators instead of Howler files
const OSCILLATOR_EVENTS = new Set<SoundEvent>([
  "reel_spin",
  "reel_stop",
  "small_win",
  "big_win",
  "777_win",
]);

// Common casino sounds – mapped to local MP3 assets
const HOWLER_SOUND_MAP: Partial<Record<SoundEvent, string>> = {
  reveal_tick: "/assets/sounds/reveal-tick.mp3",
  win_clap: "/assets/sounds/win-clap.mp3",
  bet_coin: "/assets/sounds/bet-coin.mp3",
  card_deal: "/assets/sounds/card-deal.mp3",
  betting_start: "/assets/sounds/betting-start.mp3",
  betting_stop: "/assets/sounds/betting-stop.mp3",
  loss: "/assets/sounds/loss.mp3",
  cashout: "/assets/sounds/cashout.mp3",
  jackpot: "/assets/sounds/jackpot.mp3",
  button_click: "/assets/sounds/button-click.mp3",
  countdown_tick: "/assets/sounds/countdown-tick.mp3",
  dragon_wins: "/assets/sounds/dragon_wins.mp3",
  tiger_wins: "/assets/sounds/tigers_wins.mp3",
  dice_roll: "/assets/sounds/dice roll.mp3",
};

class CentralSoundManager {
  private howls: Map<SoundEvent, Howl> = new Map();
  private bgMusic: Howl | null = null;
  private _muted: boolean = false;
  private _volume: number = 0.7;
  private _musicVolume: number = 0.3;
  private _musicStarted: boolean = false;
  private audioCtx: AudioContext | null = null;

  constructor() {
    // Restore persisted state
    try {
      const stored = localStorage.getItem("casinoSoundMuted");
      if (stored === "true") this._muted = true;
      const vol = localStorage.getItem("casinoSoundVolume");
      if (vol !== null) this._volume = Math.max(0, Math.min(1, parseFloat(vol)));
      const mVol = localStorage.getItem("casinoMusicVolume");
      if (mVol !== null) this._musicVolume = Math.max(0, Math.min(1, parseFloat(mVol)));
    } catch {
      // localStorage unavailable – use defaults
    }
    this.loadHowlerSounds();
  }

  // ──────────────────── Howler-based sounds ────────────────────

  private loadHowlerSounds() {
    for (const [event, src] of Object.entries(HOWLER_SOUND_MAP) as [SoundEvent, string][]) {
      const howl = new Howl({
        src: [src],
        preload: true,
        html5: false, // Use Web Audio API for lower latency
        volume: this._volume,
      });
      this.howls.set(event, howl);
    }
  }

  // ──────────────────── Oscillator-based Triple777 sounds ──────

  private getAudioContext(): AudioContext | null {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (Ctx) this.audioCtx = new Ctx();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playOscillator(key: SoundEvent) {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (key === "reel_spin") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0.04 * this._volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (key === "reel_stop") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(587.33, now);
        gain.gain.setValueAtTime(0.08 * this._volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (key === "small_win") {
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          gain.gain.setValueAtTime(0.09 * this._volume, now + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.25);
        });
      } else if (key === "big_win" || key === "777_win") {
        [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + i * 0.09);
          gain.gain.setValueAtTime(0.12 * this._volume, now + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.35);
          osc.connect(gain).connect(ctx.destination);
          osc.start(now + i * 0.09);
          osc.stop(now + i * 0.09 + 0.35);
        });
      }
    } catch {
      // Audio blocked or unavailable
    }
  }

  // ──────────────────── Public API ─────────────────────────────

  /** Call once after first user interaction to unlock audio on mobile and start background music */
  init() {
    // Resume Howler's internal AudioContext
    Howler.ctx?.resume?.();
    // Also resume our oscillator context
    this.getAudioContext();

    if (!this._musicStarted) {
      this._musicStarted = true;
      if (!this.bgMusic) {
        this.bgMusic = new Howl({
          src: ["/assets/sounds/kgf.mp3"],
          html5: true, // Use HTML5 audio for large background music to stream it
          loop: true,
          volume: this._musicVolume,
          preload: true,
        });
      }
      if (!this.bgMusic.playing()) {
        this.bgMusic.play();
      }
    }
  }

  /** Pause or stop background music when leaving the casino application */
  stopMusic() {
    this._musicStarted = false;
    if (this.bgMusic) {
      this.bgMusic.stop();
    }
  }

  play(event: SoundEvent) {
    if (this._muted) return;

    if (OSCILLATOR_EVENTS.has(event)) {
      this.playOscillator(event);
      return;
    }

    const howl = this.howls.get(event);
    if (!howl) {
      // Sound file not yet downloaded – silently ignore
      return;
    }
    try {
      howl.volume(this._volume);
      howl.play();
    } catch {
      // Playback blocked
    }
  }

  setVolume(vol: number) {
    this._volume = Math.max(0, Math.min(1, vol));
    for (const howl of this.howls.values()) {
      howl.volume(this._volume);
    }
    try {
      localStorage.setItem("casinoSoundVolume", String(this._volume));
    } catch { /* ignore */ }
  }

  getVolume(): number {
    return this._volume;
  }

  setMusicVolume(vol: number) {
    this._musicVolume = Math.max(0, Math.min(1, vol));
    if (this.bgMusic) {
      this.bgMusic.volume(this._musicVolume);
    }
    try {
      localStorage.setItem("casinoMusicVolume", String(this._musicVolume));
    } catch { /* ignore */ }
  }

  getMusicVolume(): number {
    return this._musicVolume;
  }

  mute() {
    this._muted = true;
    Howler.mute(true); // Mutes both game effects and bgMusic globally
    try {
      localStorage.setItem("casinoSoundMuted", "true");
    } catch { /* ignore */ }
  }

  unmute() {
    this._muted = false;
    Howler.mute(false);
    try {
      localStorage.setItem("casinoSoundMuted", "false");
    } catch { /* ignore */ }
  }

  toggleMute() {
    if (this._muted) {
      this.unmute();
    } else {
      this.mute();
    }
    return this._muted;
  }

  isMuted(): boolean {
    return this._muted;
  }
}

export const soundManager = new CentralSoundManager();


