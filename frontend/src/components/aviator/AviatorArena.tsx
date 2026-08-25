import React, { useEffect, useRef } from 'react';
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
  const bettingTimerRef = useRef<number>(bettingDuration);

  const prevIntRef = useRef<number>(-1);

  // Countdown timer for BETTING phase
  useEffect(() => {
    if (phase !== 'BETTING') {
      bettingTimerRef.current = bettingDuration;
      prevIntRef.current = -1;
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const current = Math.max(0, bettingDuration - elapsed);
      bettingTimerRef.current = current;

      const currentInt = Math.ceil(current);
      if (currentInt !== prevIntRef.current && currentInt >= 5 && currentInt <= 9) {
        soundManager.play('countdown_tick');
      }
      prevIntRef.current = currentInt;
    }, 50);

    return () => clearInterval(interval);
  }, [phase, bettingDuration]);

  // Canvas render loop
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
    const stars = Array.from({ length: 40 }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 0.8 + 0.2,
      opacity: Math.random() * 0.7 + 0.3,
    }));

    let progress = 0;

    const render = () => {
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

      // 2. Background stars moving during flight
      if (phase === 'FLYING') {
        stars.forEach((s) => {
          s.x -= s.speed * Math.min(multiplier, 5);
          if (s.x < 0) s.x = width;
          ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // 3. Draw flight curve
      if (phase === 'FLYING' || phase === 'CRASHED' || phase === 'SETTLED') {
        const flightTime = Math.max(0, Math.log(multiplier) / 0.1);
        progress = Math.min(1, flightTime / 15); // Normalize progress across arena

        const startX = width * 0.08;
        const startY = height * 0.88;
        const endX = startX + (width * 0.72) * Math.min(1, progress * 1.2);
        const endY = startY - (height * 0.65) * Math.pow(progress, 0.75);

        // Control point for smooth exponential curve
        const cpX = startX + (endX - startX) * 0.65;
        const cpY = startY;

        // Gradient under curve
        const gradient = ctx.createLinearGradient(0, endY, 0, startY);
        if (phase === 'FLYING') {
          gradient.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
          gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
        } else {
          gradient.addColorStop(0, 'rgba(150, 20, 20, 0.2)');
          gradient.addColorStop(1, 'rgba(150, 20, 20, 0.0)');
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
        if (phase === 'FLYING') {
          ctx.save();
          ctx.translate(endX, endY);
          // Angle of plane following curve tangent
          const angle = Math.atan2(endY - startY, endX - cpX) * 0.45;
          ctx.rotate(angle);

          // Jet Body & Wings
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath();
          // Nose
          ctx.moveTo(25, 0);
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
          const flameLength = 12 + Math.random() * 10;
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

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [phase, multiplier]);

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
                  width: `${Math.max(0, Math.min(100, (bettingTimerRef.current / bettingDuration) * 100))}%`,
                }}
              />
            </div>
            <div className="aviator-betting-seconds">
              {bettingTimerRef.current.toFixed(1)}s
            </div>
          </div>
        )}

        {phase === 'FLYING' && (
          <div className="aviator-multiplier-display flying">
            <span className="mult-value">{multiplier.toFixed(2)}</span>
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
