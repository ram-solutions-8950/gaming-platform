import React, { useEffect, useState, useRef } from 'react';
import { rewardService, type LuckySpinStatus, type LuckySpinSegment } from '../../services/rewardService';
import { soundManager } from '../../services/soundManager';
import '../../styles/lucky-spin.css';

interface Props {
  onClose: () => void;
  onWalletRefresh?: () => void;
  onOpen7Days?: () => void;
}

const DEFAULT_SEGMENTS: LuckySpinSegment[] = [
  { segment_index: 0, label: '₹1', reward_type: 'CASH', amount_inr: 1, free_spins: 0, color: '#D97706' },
  { segment_index: 1, label: '₹2', reward_type: 'CASH', amount_inr: 2, free_spins: 0, color: '#DB2777' },
  { segment_index: 2, label: '₹5', reward_type: 'CASH', amount_inr: 5, free_spins: 0, color: '#7C3AED' },
  { segment_index: 3, label: '₹10', reward_type: 'CASH', amount_inr: 10, free_spins: 0, color: '#2563EB' },
  { segment_index: 4, label: '1 FREE SPIN', reward_type: 'FREE_SPIN', amount_inr: 0, free_spins: 1, color: '#059669' },
  { segment_index: 5, label: 'TRY AGAIN', reward_type: 'NO_REWARD', amount_inr: 0, free_spins: 0, color: '#475569' },
  { segment_index: 6, label: '₹20', reward_type: 'CASH', amount_inr: 20, free_spins: 0, color: '#DC2626' },
  { segment_index: 7, label: '₹50', reward_type: 'CASH', amount_inr: 50, free_spins: 0, color: '#CA8A04' },
];

export const LuckySpinModal: React.FC<Props> = ({ onClose, onWalletRefresh, onOpen7Days }) => {
  const [statusData, setStatusData] = useState<LuckySpinStatus | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotationDegrees, setRotationDegrees] = useState(0);
  const [winResult, setWinResult] = useState<{ label: string; reward_type: string; amount_inr: number; message: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const currentRotationRef = useRef(0);

  const fetchStatus = async () => {
    try {
      const data = await rewardService.getLuckySpinStatus();
      setStatusData(data);
    } catch (err: any) {
      console.error('Failed to load lucky spin status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSpinning) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSpinning]);

  const activeSegments = (statusData?.segments && statusData.segments.length > 0)
    ? statusData.segments
    : DEFAULT_SEGMENTS;

  const numSegments = activeSegments.length;
  const segmentAngle = 360 / numSegments;

  const handleSpin = async () => {
    if (isSpinning || !statusData || statusData.free_spins_available <= 0) return;

    setIsSpinning(true);
    setErrorMsg(null);
    setWinResult(null);

    try {
      soundManager.play('reel_spin');

      // 1. Authoritative spin result from backend
      const result = await rewardService.executeLuckySpin();

      // 2. Exact mathematical rotation formula
      // Top pointer needle is at 12 o'clock (0 deg relative to top)
      // Segment i starts at i*segmentAngle and ends at (i+1)*segmentAngle
      // Center of segment i is at (i*segmentAngle + segmentAngle/2)
      // To bring segment center under top pointer rotating clockwise:
      const winningIdx = result.winning_index;
      const targetMod = (360 - (winningIdx * segmentAngle + segmentAngle / 2) + 360) % 360;
      const currMod = currentRotationRef.current % 360;
      const delta = (targetMod - currMod + 360) % 360;
      const extraRotations = 360 * 6; // 6 full rotations for excitement
      const targetRotation = currentRotationRef.current + extraRotations + delta;

      currentRotationRef.current = targetRotation;
      setRotationDegrees(targetRotation);

      // 3. Animation duration is 4800ms
      setTimeout(() => {
        setIsSpinning(false);
        setWinResult({
          label: result.segment.label,
          reward_type: result.segment.reward_type,
          amount_inr: result.segment.amount_inr,
          message: result.message,
        });

        if (result.segment.reward_type !== 'NO_REWARD') {
          soundManager.play('win_clap');
        }

        // Update local free spins count
        setStatusData((prev) => (prev ? {
          ...prev,
          free_spins_available: result.free_spins_left,
          can_spin: result.free_spins_left > 0,
        } : null));

        if (onWalletRefresh) onWalletRefresh();
      }, 4900);
    } catch (err: any) {
      setIsSpinning(false);
      setErrorMsg(err.response?.data?.message || err.message || 'Spin failed.');
    }
  };

  // 16 decorative lights around circumference
  const bulbs = Array.from({ length: 16 }).map((_, i) => {
    const angleRad = (i * (360 / 16) * Math.PI) / 180;
    // Radius percentage from center (50%)
    const r = 47.5;
    const x = 50 + r * Math.cos(angleRad);
    const y = 50 + r * Math.sin(angleRad);
    return { id: i, left: `${x}%`, top: `${y}%` };
  });

  const freeSpins = statusData?.free_spins_available ?? 0;

  return (
    <div
      className="lucky-spin-modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSpinning) onClose();
      }}
    >
      <div className="lucky-spin-card">
        {/* Header */}
        <div className="lucky-spin-header">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎰</span>
            <div>
              <h2 className="lucky-spin-title">Lucky Spin Wheel</h2>
              <p className="lucky-spin-subtitle">Spin to win instant cash & free spins!</p>
            </div>
          </div>
          <button
            onClick={() => !isSpinning && onClose()}
            disabled={isSpinning}
            className="lucky-spin-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Modal Body */}
        <div className="lucky-spin-body p-3.5 flex flex-col items-center justify-center overflow-y-auto">
          {/* Wheel Stage */}
          <div className="lucky-wheel-stage-wrap">
            {/* 1. FIXED TOP POINTER NEEDLE (Does NOT rotate) */}
            <div className="lucky-wheel-pointer">
              <div className="lucky-pointer-arrow" />
              <div className="lucky-pointer-pin" />
            </div>

            {/* 2. OUTER BEZEL WITH LIGHTS */}
            <div className="lucky-wheel-outer-bezel">
              {/* Decorative Pulsing Bulbs */}
              {bulbs.map((b) => (
                <div
                  key={b.id}
                  className="lucky-bulb"
                  style={{ left: b.left, top: b.top }}
                />
              ))}

              {/* 3. ROTATING WHEEL DISC (SVG with 8 segments) */}
              <div
                className="lucky-wheel-disc"
                style={{
                  transform: `rotate(${rotationDegrees}deg)`,
                  transition: isSpinning
                    ? 'transform 4.8s cubic-bezier(0.12, 0.82, 0.18, 1)'
                    : 'none',
                }}
              >
                <svg viewBox="0 0 300 300" className="w-full h-full block">
                  <defs>
                    <filter id="luckyTextShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.9" />
                    </filter>
                  </defs>

                  {/* Wedge Segments */}
                  {activeSegments.map((seg, idx) => {
                    const startDeg = idx * segmentAngle - 90;
                    const endDeg = (idx + 1) * segmentAngle - 90;
                    const startRad = (startDeg * Math.PI) / 180;
                    const endRad = (endDeg * Math.PI) / 180;

                    // Center (150, 150), radius 146
                    const cx = 150;
                    const cy = 150;
                    const r = 146;

                    const x1 = cx + r * Math.cos(startRad);
                    const y1 = cy + r * Math.sin(startRad);
                    const x2 = cx + r * Math.cos(endRad);
                    const y2 = cy + r * Math.sin(endRad);

                    const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;

                    // Segment center rotation angle for text
                    const rotAngle = idx * segmentAngle + segmentAngle / 2;

                    return (
                      <g key={seg.segment_index}>
                        {/* Wedge slice */}
                        <path
                          d={pathD}
                          fill={seg.color || (idx % 2 === 0 ? '#7C3AED' : '#5B21B6')}
                          stroke="#FFE57F"
                          strokeWidth="2"
                        />

                        {/* Radial divider pin at rim */}
                        <circle
                          cx={x1}
                          cy={y1}
                          r="3"
                          fill="#FFFFFF"
                          stroke="#B45309"
                          strokeWidth="1"
                        />

                        {/* Reward Text centered radially inside segment */}
                        <g transform={`rotate(${rotAngle} ${cx} ${cy})`}>
                          <text
                            x={cx}
                            y="48"
                            textAnchor="middle"
                            fontSize={seg.label.length > 7 ? '9.5' : '12'}
                            fontWeight="900"
                            fill="#FFFFFF"
                            filter="url(#luckyTextShadow)"
                            className="lucky-seg-text"
                          >
                            {seg.label}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* 4. FIXED CENTER HUB BUTTON (Does NOT rotate with wheel) */}
              <button
                type="button"
                onClick={handleSpin}
                disabled={isSpinning || freeSpins <= 0}
                className="lucky-wheel-center-btn"
                title={freeSpins <= 0 ? 'No free spins available' : 'Click to Spin'}
              >
                <span className="lucky-center-text">
                  {isSpinning ? 'SPINNING' : freeSpins > 0 ? 'SPIN' : 'LOCKED'}
                </span>
                <span className="lucky-center-subtext">
                  {isSpinning ? '...' : freeSpins > 0 ? 'FREE' : '0 SPINS'}
                </span>
              </button>
            </div>
          </div>

          {/* Side Panel: Counter & Status */}
          <div className="lucky-spin-side-panel w-full space-y-2.5 mt-1">
            {/* Free Spins Pill Counter */}
            <div className="flex items-center justify-between w-full px-4 py-2 bg-[#120429]/90 border border-amber-400/40 rounded-full shadow-inner">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">🎟️</span>
                <span className="text-xs font-bold text-purple-200">Available Free Spins:</span>
              </div>
              <span className="text-xs font-black text-yellow-300 bg-purple-950/90 px-3 py-0.5 rounded-full border border-yellow-400/40">
                {freeSpins}
              </span>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="w-full p-2 rounded-xl bg-red-950/80 border border-red-400/70 text-red-200 text-xs font-bold text-center">
                {errorMsg}
              </div>
            )}

            {/* Celebration Result Banner */}
            {winResult && (
              <div className="w-full p-2.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-emerald-500/30 to-amber-500/25 border border-amber-400 text-center animate-pulse">
                <span className="text-xs font-black text-amber-300 block">
                  🎉 {winResult.message}
                </span>
              </div>
            )}

            {/* If 0 Free Spins Available */}
            {freeSpins <= 0 && (
              <div className="w-full bg-[#120429]/90 border border-purple-500/30 rounded-xl p-2.5 text-center space-y-1.5">
                <span className="text-xs text-amber-300 font-bold block">
                  🎯 Need Free Spins?
                </span>
                <p className="text-[11px] text-gray-300">
                  Claim <strong>Day 4</strong> in <strong>7-Day Rewards</strong> to get 1 Free Lucky Spin!
                </p>
                {onOpen7Days && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpen7Days();
                    }}
                    className="mt-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white text-[11px] font-black px-3 py-1 rounded-lg uppercase shadow active:scale-95 transition cursor-pointer"
                  >
                    Open 7-Day Rewards 📅
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#0a011a] border-t border-purple-800/40 flex items-center justify-between text-[10px] text-purple-300 flex-shrink-0">
          <span>Server-authoritative RNG certified</span>
          <button
            onClick={() => !isSpinning && onClose()}
            disabled={isSpinning}
            className="text-amber-400 hover:text-amber-300 font-bold uppercase cursor-pointer disabled:opacity-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
