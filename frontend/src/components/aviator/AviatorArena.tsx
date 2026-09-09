import React, { useEffect, useRef, useState } from 'react';
import type { AviatorPhase } from '../../hooks/useAviatorSocket';
import { soundManager } from '../../services/soundManager';

interface AviatorArenaProps {
  phase: AviatorPhase;
  multiplier: number;
  crashPoint?: number | null;
  bettingDuration?: number;
}

export const AviatorArena: React.FC<AviatorArenaProps> = ({
  phase,
  multiplier,
  crashPoint,
  bettingDuration = 10,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [bettingSeconds, setBettingSeconds] = useState<number>(bettingDuration);
  const prevIntRef = useRef<number>(-1);

  // Smooth continuous animation multiplier and flight state
  const smoothMultRef = useRef<number>(1.0);
  const lastTimeRef = useRef<number>(performance.now());
  const crashFlyAwayRef = useRef<{ active: boolean; startTime: number; startX: number; startY: number }>({
    active: false,
    startTime: 0,
    startX: 0,
    startY: 0,
  });

  // Countdown timer for BETTING phase with reactive state
  useEffect(() => {
    if (phase !== 'BETTING') {
      setBettingSeconds(bettingDuration);
      prevIntRef.current = -1;
      return;
    }
    setBettingSeconds(bettingDuration);
    const start = performance.now();
    const interval = setInterval(() => {
      const elapsed = (performance.now() - start) / 1000;
      const current = Math.max(0, bettingDuration - elapsed);
      setBettingSeconds(current);

      const currentInt = Math.ceil(current);
      if (currentInt !== prevIntRef.current && currentInt >= 1 && currentInt <= 5) {
        soundManager.play('countdown_tick');
      }
      prevIntRef.current = currentInt;
    }, 50);

    return () => clearInterval(interval);
  }, [phase, bettingDuration]);

  // Track crash event to trigger fly-away burst
  useEffect(() => {
    if (phase === 'CRASHED' || phase === 'SETTLED') {
      crashFlyAwayRef.current.active = true;
      crashFlyAwayRef.current.startTime = performance.now();
    } else if (phase === 'FLYING') {
      crashFlyAwayRef.current.active = false;
      smoothMultRef.current = Math.max(1.0, multiplier);
    } else {
      crashFlyAwayRef.current.active = false;
      smoothMultRef.current = 1.0;
    }
  }, [phase]);

  // Canvas render loop with smooth 60fps interpolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 400);

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', handleResize);

    // Stars / background dots
    const stars = Array.from({ length: 50 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 1.2 + 0.4,
      opacity: Math.random() * 0.7 + 0.3,
    }));

    lastTimeRef.current = performance.now();

    const render = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      ctx.clearRect(0, 0, width, height);

      // 1. Background grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Smoothly advance multiplier continuously on every frame (no freezing!)
      if (phase === 'FLYING') {
        const target = Math.max(1.0, multiplier);
        if (target > smoothMultRef.current) {
          // Catch up smoothly to server target while never stopping
          const diff = target - smoothMultRef.current;
          smoothMultRef.current += Math.max(diff * 0.15, dt * 0.09 * smoothMultRef.current);
        } else {
          // Extrapolate at growth rate so plane never sits still between ticks
          smoothMultRef.current += dt * 0.09 * smoothMultRef.current;
        }
      }

      const activeMult = phase === 'FLYING'
        ? smoothMultRef.current
        : (crashPoint || multiplier || 1.0);

      // 2. Background stars moving faster during flight
      if (phase === 'FLYING' || crashFlyAwayRef.current.active) {
        const starSpeedMult = Math.min(activeMult * 1.2, 8);
        stars.forEach((s) => {
          s.x -= s.speed * starSpeedMult;
          if (s.x < 0) s.x = width;
          ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 3. Draw flight curve & plane
      if (phase === 'FLYING' || phase === 'CRASHED' || phase === 'SETTLED') {
        // Dynamic, responsive exponential curve
        const logVal = Math.log(Math.max(1.0, activeMult));
        const progress = Math.min(1.0, logVal / 2.3); // Reaches upper arena at ~10x

        const startX = width * 0.06;
        const startY = height * 0.88;
        let endX = startX + (width * 0.76) * Math.min(1.0, progress * 1.15);
        let endY = startY - (height * 0.68) * Math.pow(progress, 0.72);

        // Fly-away animation on crash: plane zooms off top-right!
        let planeAlpha = 1.0;
        if (crashFlyAwayRef.current.active) {
          const flyElapsed = (now - crashFlyAwayRef.current.startTime) / 1000;
          if (flyElapsed < 0.6) {
            endX += flyElapsed * width * 1.2;
            endY -= flyElapsed * height * 1.0;
            planeAlpha = Math.max(0, 1.0 - flyElapsed / 0.6);
          } else {
            planeAlpha = 0;
          }
        }

        const cpX = startX + (endX - startX) * 0.55;
        const cpY = startY;

        // Gradient under curve
        const gradient = ctx.createLinearGradient(0, endY, 0, startY);
        if (phase === 'FLYING') {
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        } else {
          gradient.addColorStop(0, 'rgba(185, 28, 28, 0.18)');
          gradient.addColorStop(1, 'rgba(185, 28, 28, 0.0)');
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.lineTo(endX, startY);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Stroke curve
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.strokeStyle = phase === 'FLYING' ? '#ef4444' : 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = phase === 'FLYING' ? 12 : 0;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 4. Draw Airplane
        if ((phase === 'FLYING' || crashFlyAwayRef.current.active) && planeAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = planeAlpha;
          ctx.translate(endX, endY);
          const angle = Math.atan2(endY - startY, endX - cpX) * 0.45;
          ctx.rotate(angle);

          // Jet Body & Wings
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          // Nose
          ctx.moveTo(26, 0);
          ctx.lineTo(-20, -9);
          ctx.lineTo(-14, 0);
          ctx.lineTo(-20, 9);
          ctx.closePath();
          ctx.fill();

          // Main Wings
          ctx.fillStyle = '#e11d48';
          ctx.beginPath();
          ctx.moveTo(5, 0);
          ctx.lineTo(-12, -22);
          ctx.lineTo(-6, 0);
          ctx.lineTo(-12, 22);
          ctx.closePath();
          ctx.fill();

          // Cockpit canopy
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.ellipse(8, -1, 7, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Afterburner / Thrust Flame
          const flameLength = (14 + Math.random() * 12) * (phase === 'FLYING' ? 1 : 1.8);
          const flameGrad = ctx.createLinearGradient(-14, 0, -14 - flameLength, 0);
          flameGrad.addColorStop(0, '#fde047');
          flameGrad.addColorStop(0.5, '#f97316');
          flameGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = flameGrad;
          ctx.beginPath();
          ctx.moveTo(-14, -4);
          ctx.lineTo(-14 - flameLength, 0);
          ctx.lineTo(-14, 4);
          ctx.closePath();
          ctx.fill();

          ctx.restore();
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, multiplier, crashPoint]);

  return (
    <div className="aviator-arena">
      <canvas ref={canvasRef} className="aviator-canvas" />

      {/* Center Overlay Display */}
      <div className="aviator-center-display">
        {phase === 'BETTING' && (
          <div className="aviator-betting-banner">
            <div className="aviator-betting-spinner" />
            <div className="aviator-betting-title">WAITING FOR NEXT ROUND</div>
            <div className="aviator-betting-bar-container">
              <div
                className="aviator-betting-bar-fill"
                style={{
                  width: `${Math.max(0, Math.min(100, (bettingSeconds / bettingDuration) * 100))}%`,
                }}
              />
            </div>
            <div className="aviator-betting-seconds">
              {bettingSeconds.toFixed(1)}s
            </div>
          </div>
        )}

        {phase === 'FLYING' && (
          <div className="aviator-multiplier-display flying">
            <span className="mult-value">{Math.max(1.0, multiplier).toFixed(2)}</span>
            <span className="mult-x">x</span>
          </div>
        )}

        {(phase === 'CRASHED' || phase === 'SETTLED') && (
          <div className="aviator-multiplier-display crashed">
            <div className="crashed-header">FLEW AWAY!</div>
            <div className="crashed-value">
              <span>{(crashPoint || multiplier).toFixed(2)}</span>
              <span className="mult-x">x</span>
            </div>
          </div>
        )}

        {phase === 'DISCONNECTED' && (
          <div className="aviator-betting-banner">
            <div className="aviator-betting-title text-red-400">CONNECTING TO FLIGHT RADAR...</div>
          </div>
        )}
      </div>
    </div>
  );
};
