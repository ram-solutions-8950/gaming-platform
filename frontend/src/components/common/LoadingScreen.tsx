import { useState, useEffect } from 'react';
import splashBg from '../../assets/casino-splash-bg.png';
import '../../styles/loading-screen.css';

interface LoadingScreenProps {
  isReady?: boolean;
  onFinish?: () => void;
  minDurationMs?: number;
}

export function LoadingScreen({
  isReady = true,
  onFinish,
  minDurationMs = 2400
}: LoadingScreenProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const startTime = Date.now();

    const checkComplete = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (isReady && elapsed >= minDurationMs) {
        clearInterval(checkComplete);

        // Fade out smoothly
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            setIsDone(true);
            if (onFinish) onFinish();
          }, 350);
        }, 200);
      }
    }, 100);

    return () => {
      clearInterval(checkComplete);
    };
  }, [isReady, minDurationMs, onFinish]);

  if (isDone) return null;

  return (
    <div className={`casino-loading-screen ${isFadingOut ? 'fade-out' : ''}`}>
      {/* High-res casino environment artwork */}
      <img
        src={splashBg}
        alt=""
        className="splash-bg-image"
      />

      {/* Atmospheric upper-center golden glow bloom */}
      <div className="splash-radial-light" />

      {/* Subtle sweeping light shimmer across center */}
      <div className="splash-center-shine" />

      {/* Center animated loading indicator */}
      <div className="splash-center-spinner" />

      {/* Smooth animated loading bar */}
      <div className="splash-loading-bar-track">
        <div className="splash-loading-bar-progress" />
      </div>

      {/* Version identifier in bottom-left */}
      <div className="splash-version">
        V1.8.2
      </div>
    </div>
  );
}
