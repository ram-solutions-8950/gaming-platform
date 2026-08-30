import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/roulette.css';

export interface RouletteWheelProps {
  phase: 'BETTING' | 'STOP_BETTING' | 'SPINNING' | 'RESULT';
  winningNumber: number | null;
  winningColor: string | null;
  secondsLeft: number;
  userWinAmount?: number;
}

// European Roulette wheel sequence clockwise (0-36)
export const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const RED_NUMBERS_SET = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

const TOTAL_POCKETS = WHEEL_NUMBERS.length; // 37
const POCKET_ANGLE = 360 / TOTAL_POCKETS;   // ~9.7297 deg

export const RouletteWheel: React.FC<RouletteWheelProps> = ({
  phase,
  winningNumber,
  winningColor,
  secondsLeft,
  userWinAmount = 0,
}) => {
  const isVisible = phase !== 'BETTING';

  // Rotation state in degrees
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [isSpinningAnim, setIsSpinningAnim] = useState<boolean>(false);

  const prevPhaseRef = useRef<string>(phase);
  const currentRotationRef = useRef<number>(0);

  // Precompute pocket path data
  const pocketSlices = useMemo(() => {
    const rOuter = 200;
    const rInner = 135;
    const halfAngleRad = (POCKET_ANGLE / 2) * (Math.PI / 180);

    const x1 = 250 - rOuter * Math.sin(halfAngleRad);
    const y1 = 250 - rOuter * Math.cos(halfAngleRad);
    const x2 = 250 + rOuter * Math.sin(halfAngleRad);
    const y2 = 250 - rOuter * Math.cos(halfAngleRad);

    const x3 = 250 + rInner * Math.sin(halfAngleRad);
    const y3 = 250 - rInner * Math.cos(halfAngleRad);
    const x4 = 250 - rInner * Math.sin(halfAngleRad);
    const y4 = 250 - rInner * Math.cos(halfAngleRad);

    const pathData = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x4} ${y4} Z`;

    return WHEEL_NUMBERS.map((num, idx) => {
      let color = '#1a1a1a'; // black
      if (num === 0) {
        color = '#008744'; // green
      } else if (RED_NUMBERS_SET.has(num)) {
        color = '#b81414'; // red
      }
      return {
        num,
        color,
        angle: idx * POCKET_ANGLE,
        pathData,
      };
    });
  }, []);

  // Handle phase changes & spin triggers
  useEffect(() => {
    prevPhaseRef.current = phase;

    if (phase === 'SPINNING') {
      setIsSpinningAnim(true);
      const targetNum = winningNumber !== null ? winningNumber : 0;
      const targetIdx = WHEEL_NUMBERS.indexOf(targetNum);
      const targetPocketAngle = (targetIdx >= 0 ? targetIdx : 0) * POCKET_ANGLE;

      // To bring pocket targetIdx to 12 o'clock (0 deg), wheel needs to rotate:
      // (currentRotation + delta) % 360 = (360 - targetPocketAngle) % 360
      const currentMod = currentRotationRef.current % 360;
      const desiredMod = (360 - targetPocketAngle) % 360;
      let forwardDelta = desiredMod - currentMod;
      if (forwardDelta <= 0) {
        forwardDelta += 360;
      }
      // 5 full 360-degree rotations plus delta for majestic 4-second spin
      const spinDelta = 5 * 360 + forwardDelta;
      const finalWheelRot = currentRotationRef.current + spinDelta;
      currentRotationRef.current = finalWheelRot;
      setWheelRotation(finalWheelRot);

      const finishTimer = setTimeout(() => {
        setIsSpinningAnim(false);
      }, 3900);

      return () => {
        clearTimeout(finishTimer);
      };
    } else if (phase === 'RESULT' || phase === 'STOP_BETTING') {
      setIsSpinningAnim(false);
    }
  }, [phase, winningNumber]);

  const winningColorDisplay = useMemo(() => {
    if (winningColor) return winningColor.toLowerCase();
    if (winningNumber === null || winningNumber === 0) return 'green';
    return RED_NUMBERS_SET.has(winningNumber) ? 'red' : 'black';
  }, [winningNumber, winningColor]);

  return (
    <div
      className={`roulette-wheel-container ${isVisible ? 'wheel-container-visible' : 'wheel-container-hidden'}`}
      aria-hidden={!isVisible}
    >
      {/* Dimmed green felt backdrop */}
      <div className="roulette-wheel-backdrop" />

      {/* Wheel Card Presentation */}
      <div className="roulette-wheel-card">
        {/* Phase Header Banner */}
        <div className="roulette-wheel-status-pill">
          {phase === 'STOP_BETTING' && (
            <span className="pill-stop-badge">BETTING CLOSED</span>
          )}
          {phase === 'SPINNING' && (
            <span className="pill-spinning-badge">
              SPINNING... {String(secondsLeft).padStart(2, '0')}s
            </span>
          )}
          {phase === 'RESULT' && winningNumber !== null && (
            <span className="pill-result-badge">
              WINNING NUMBER: {winningNumber}
            </span>
          )}
        </div>

        {/* ── Outer Wheel Assembly ── */}
        <div className="roulette-wheel-viewport">
          {/* Top Golden Needle Indicator */}
          <div className="roulette-wheel-pointer-marker" />

          {/* Rotating SVG Wheel Disc */}
          <div
            className="roulette-wheel-rotating-disc"
            style={{
              transform: `rotate(${wheelRotation}deg)`,
              transition: isSpinningAnim
                ? 'transform 3.8s cubic-bezier(0.18, 0.89, 0.32, 1)'
                : 'none',
            }}
          >
            <svg
              className="roulette-wheel-svg"
              viewBox="0 0 500 500"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                {/* Mahogany Woodgrain Radial Gradient */}
                <radialGradient id="mahoganyBezel" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4a1805" />
                  <stop offset="70%" stopColor="#2c0c02" />
                  <stop offset="88%" stopColor="#5d2208" />
                  <stop offset="94%" stopColor="#d4af37" />
                  <stop offset="100%" stopColor="#1a0601" />
                </radialGradient>

                {/* Metallic Gold Ring Gradient */}
                <radialGradient id="goldRingGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#f3e0aa" />
                  <stop offset="45%" stopColor="#d4af37" />
                  <stop offset="70%" stopColor="#aa820a" />
                  <stop offset="100%" stopColor="#543e03" />
                </radialGradient>

                {/* Inner Cone Metallic Gradient */}
                <radialGradient id="innerConeGrad" cx="45%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="#fff2cb" />
                  <stop offset="35%" stopColor="#dfba4e" />
                  <stop offset="75%" stopColor="#7a5c0b" />
                  <stop offset="100%" stopColor="#2d2204" />
                </radialGradient>

                {/* Ball Specular Radial */}
                <radialGradient id="ballShine" cx="35%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#e8e8e8" />
                  <stop offset="85%" stopColor="#9a9a9a" />
                  <stop offset="100%" stopColor="#444444" />
                </radialGradient>

                <filter id="wheelShadow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000000" floodOpacity="0.8" />
                </filter>
              </defs>

              {/* Outer Mahogany & Brass Bezel */}
              <circle cx="250" cy="250" r="246" fill="url(#mahoganyBezel)" filter="url(#wheelShadow)" />
              <circle cx="250" cy="250" r="236" fill="none" stroke="url(#goldRingGrad)" strokeWidth="3" />
              <circle cx="250" cy="250" r="222" fill="#0d0d0d" />

              {/* Track Ball Groove */}
              <circle cx="250" cy="250" r="208" fill="none" stroke="#222222" strokeWidth="18" />

              {/* 37 European Number Pockets */}
              <g id="roulette-pockets">
                {pocketSlices.map((p) => {
                  const isWinningPocket = phase === 'RESULT' && p.num === winningNumber;
                  return (
                    <g
                      key={p.num}
                      transform={`rotate(${p.angle} 250 250)`}
                      className={isWinningPocket ? 'winning-pocket-glow' : ''}
                    >
                      <path
                        d={p.pathData}
                        fill={p.color}
                        stroke={isWinningPocket ? '#ffe066' : '#d4af37'}
                        strokeWidth={isWinningPocket ? '2.5' : '0.8'}
                      />
                      {/* Pocket Number rotated to read toward center */}
                      <text
                        x="250"
                        y="68"
                        fill="#ffffff"
                        fontSize="13.5"
                        fontWeight="900"
                        fontFamily="Arial, sans-serif"
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform="rotate(180 250 68)"
                        style={{
                          filter: isWinningPocket ? 'drop-shadow(0 0 4px #ffdd00)' : 'none',
                        }}
                      >
                        {p.num}
                      </text>
                    </g>
                  );
                })}
              </g>

              {/* Brass Separator Pins / Frets */}
              <circle cx="250" cy="250" r="135" fill="none" stroke="url(#goldRingGrad)" strokeWidth="2.5" />

              {/* Inner Brass Cone / Turret Base */}
              <circle cx="250" cy="250" r="132" fill="url(#innerConeGrad)" />
              <circle cx="250" cy="250" r="95" fill="none" stroke="#543e03" strokeWidth="1.5" />
              <circle cx="250" cy="250" r="60" fill="url(#goldRingGrad)" />

              {/* 8 Chrome / Brass Turret Spokes */}
              <g id="turret-spokes">
                {[0, 45, 90, 135, 180, 225, 270, 315].map((ang) => (
                  <g key={ang} transform={`rotate(${ang} 250 250)`}>
                    <line
                      x1="250"
                      y1="250"
                      x2="250"
                      y2="155"
                      stroke="#ffffff"
                      strokeWidth="4"
                      strokeLinecap="round"
                      opacity="0.85"
                    />
                    <line
                      x1="250"
                      y1="250"
                      x2="250"
                      y2="155"
                      stroke="#a67c00"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    {/* Deflector Diamond Tip */}
                    <polygon
                      points="250,150 254,158 250,166 246,158"
                      fill="#ffeaa7"
                      stroke="#7a5c0b"
                      strokeWidth="0.8"
                    />
                  </g>
                ))}
              </g>

              {/* Center Spindle Knob */}
              <circle cx="250" cy="250" r="32" fill="url(#innerConeGrad)" stroke="#ffd700" strokeWidth="2" />
              <circle cx="247" cy="247" r="16" fill="#ffffff" opacity="0.45" />
              <circle cx="250" cy="250" r="12" fill="#d4af37" />
            </svg>
          </div>
        </div>

        {/* ── Result Announcement Overlay on Wheel ── */}
        {phase === 'RESULT' && winningNumber !== null && (
          <div className="roulette-wheel-result-reveal">
            <div className={`result-num-circle color-${winningColorDisplay}`}>
              <span className="result-num-text">{winningNumber}</span>
              <span className="result-color-text">{winningColorDisplay.toUpperCase()}</span>
            </div>

            {userWinAmount > 0 ? (
              <div className="wheel-win-pill">
                <span className="win-sparkle">✨</span>
                <span>YOU WON ₹{userWinAmount.toFixed(2)}</span>
                <span className="win-sparkle">✨</span>
              </div>
            ) : (
              <div className="wheel-waiting-pill">
                <span>Waiting for next round...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RouletteWheel;
