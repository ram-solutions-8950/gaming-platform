import { useState, useEffect } from 'react';
import splashBg from '../../assets/corona888-logo.jpg';
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

      {/* Clean loading indicator at the bottom */}
      <div className="splash-loading-container">
        <div className="splash-loading-text">LOADING...</div>
        <div className="splash-loading-bar-track">
          <div className="splash-loading-bar-progress" />
        </div>
      </div>
    </div>
  );
}
