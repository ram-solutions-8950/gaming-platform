// src/services/soundManager.ts
// Centralized Casino Sound Manager – ONE manager for the entire platform.
// Provides reliable lifecycle-controlled audio state across Android APK and Web.
import { Howl, Howler } from "howler";

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
  // Table / Dice events
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
  private _isAppInForeground: boolean = true;
  private _wasMusicPlayingBeforePause: boolean = false;
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
    this.setupLifecycleListeners();
  }

  // ──────────────────── Lifecycle Listeners ────────────────────

  private setupLifecycleListeners() {
    if (typeof window === "undefined") return;

    // 1. Web Page Visibility API (switched tabs, minimized browser)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.pauseAll();
      } else if (document.visibilityState === "visible") {
        this.resumeFromBackground();
      }
    });

    // 2. Page Hide event
    window.addEventListener("pagehide", () => {
      this.pauseAll();
    });

    // 3. Native Android Activity Lifecycle hooks invoked by MainActivity
    (window as any).__onAndroidPause = () => {
      this.pauseAll();
    };

    (window as any).__onAndroidStop = () => {
      this.pauseAll();
    };

    (window as any).__onAndroidResume = () => {
      this.resumeFromBackground();
    };

    // Expose reference for direct bridge calls
    (window as any).soundManager = this;
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
    if (this.audioCtx && this.audioCtx.state === "suspended" && this._isAppInForeground) {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playOscillator(key: SoundEvent) {
    if (!this._isAppInForeground || this._muted) return;

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

  /** Immediately stop/pause all audio when app goes to background / Recent Apps */
  pauseAll() {
    this._isAppInForeground = false;

    // Track whether music was playing so we can restore it on foreground return
    if (this._musicStarted && !this._muted && this.bgMusic) {
      this._wasMusicPlayingBeforePause = this.bgMusic.playing();
    }

    // Immediately stop or pause background music
    if (this.bgMusic) {
      try {
        this.bgMusic.pause();
      } catch {}
    }

    // Stop all Howler effects
    try {
      Howler.stop();
    } catch {}

    // Suspend audio context
    if (this.audioCtx && this.audioCtx.state === "running") {
      try {
        this.audioCtx.suspend().catch(() => {});
      } catch {}
    }
  }

  /** Complete hard stop of all audio */
  stopAll() {
    this._musicStarted = false;
    this._wasMusicPlayingBeforePause = false;
    if (this.bgMusic) {
      try {
        this.bgMusic.stop();
      } catch {}
    }
    try {
      Howler.stop();
    } catch {}
    if (this.audioCtx) {
      try {
        this.audioCtx.suspend().catch(() => {});
      } catch {}
    }
  }

  /** Resumes background music and audio processing when app returns to foreground */
  resumeFromBackground() {
    this._isAppInForeground = true;

    // Resume Howler AudioContext
    try {
      Howler.ctx?.resume?.();
    } catch {}

    // Resume oscillator context
    this.getAudioContext();

    // Only resume music if user had it playing and is not muted
    if (!this._muted && this._wasMusicPlayingBeforePause) {
      this.startMusic();
    }
    this._wasMusicPlayingBeforePause = false;
  }

  /** Start or resume background music */
  startMusic() {
    if (this._muted) return;

    // If app is currently in background, DO NOT start playing now — queue for return
    if (!this._isAppInForeground) {
      this._wasMusicPlayingBeforePause = true;
      return;
    }

    // Prevent duplicate instances or multiple copies playing
    if (this._musicStarted && this.bgMusic?.playing()) return;

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
      try {
        this.bgMusic.play();
      } catch {}
    }
    this._musicStarted = true;
  }

  /** Call once after first user interaction to unlock audio on mobile and start background music */
  init() {
    if (!this._isAppInForeground) return;

    // Resume Howler's internal AudioContext
    try {
      Howler.ctx?.resume?.();
    } catch {}

    // Also resume our oscillator context
    this.getAudioContext();
    this.startMusic();
  }

  /** Pause or stop background music when leaving the casino application */
  stopMusic() {
    this._musicStarted = false;
    this._wasMusicPlayingBeforePause = false;
    if (this.bgMusic) {
      try {
        this.bgMusic.stop();
      } catch {}
    }
  }

  play(event: SoundEvent) {
    if (this._muted || !this._isAppInForeground) return;

    if (OSCILLATOR_EVENTS.has(event)) {
      this.playOscillator(event);
      return;
    }

    const howl = this.howls.get(event);
    if (!howl) return;

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
    try {
      Howler.mute(true); // Mutes both game effects and bgMusic globally
    } catch {}
    try {
      localStorage.setItem("casinoSoundMuted", "true");
    } catch { /* ignore */ }
  }

  unmute() {
    this._muted = false;
    try {
      Howler.mute(false);
    } catch {}
    if (this._isAppInForeground) {
      this.startMusic();
    }
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

  isForeground(): boolean {
    return this._isAppInForeground;
  }
}

export const soundManager = new CentralSoundManager();
