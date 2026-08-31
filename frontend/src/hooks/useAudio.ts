/**
 * useAudio – React hook wrapping the centralized CentralSoundManager.
 *
 * Replaces the old per-game HTML5 Audio refs with the shared Howler-based manager.
 * Preserves the same return API so existing components compile without changes.
 */
import { useCallback, useState } from "react";
import { soundManager, type SoundEvent } from "../services/soundManager";

export const useAudio = () => {
  const [muted, setMuted] = useState(() => soundManager.isMuted());

  /** Call once on first user interaction to unlock mobile audio */
  const unlock = useCallback(() => {
    soundManager.init();
  }, []);

  const toggleMute = useCallback(() => {
    soundManager.toggleMute();
    setMuted(soundManager.isMuted());
  }, []);

  // Convenience helpers matching the old API surface
  const playTheme = useCallback(() => {
    soundManager.startMusic();
  }, []);

  const stopTheme = useCallback(() => {
    // Keep background music running unless explicitly asked
  }, []);

  const playChip = useCallback(() => {
    soundManager.play("bet_coin");
  }, []);

  const playFlip = useCallback(() => {
    soundManager.play("card_deal");
  }, []);

  const playWin = useCallback(() => {
    soundManager.play("win_clap");
  }, []);

  const playLoss = useCallback(() => {
    soundManager.play("loss");
  }, []);

  const playRoundStart = useCallback(() => {
    soundManager.play("betting_start");
  }, []);

  /** Generic play – use this for new integrations */
  const play = useCallback((event: SoundEvent) => {
    soundManager.play(event);
  }, []);

  return {
    unlock,
    toggleMute,
    muted,
    playTheme,
    stopTheme,
    playChip,
    playFlip,
    playWin,
    playLoss,
    playRoundStart,
    play,
  };
};

export default useAudio;
