import React, { useEffect, useState, useRef } from 'react';
import type { LudoColor } from '../../types/ludo';
import { soundManager } from '../../services/soundManager';

interface Props {
  value: number | null;
  rolling: boolean;
  isMyTurn: boolean;
  canRoll: boolean;
  onRoll: () => void;
  timerSeconds: number;
  currentTurnColor: LudoColor | null;
  statusNotice?: string | null;
}

const COLOR_TEXT_CLASSES: Record<LudoColor, string> = {
  RED: 'text-red-400',
  GREEN: 'text-emerald-400',
  YELLOW: 'text-amber-400',
  BLUE: 'text-blue-400',
};

const COLOR_BG_CLASSES: Record<LudoColor, string> = {
  RED: 'bg-red-500',
  GREEN: 'bg-emerald-500',
  YELLOW: 'bg-amber-500',
  BLUE: 'bg-blue-500',
};

const COLOR_GLOW_STYLES: Record<LudoColor, string> = {
  RED: 'rgba(239, 68, 68, 0.4)',
  GREEN: 'rgba(16, 185, 129, 0.4)',
  YELLOW: 'rgba(245, 158, 11, 0.45)',
  BLUE: 'rgba(59, 130, 246, 0.4)',
};

export const LudoDice: React.FC<Props> = ({
  value,
  rolling,
  isMyTurn,
  canRoll,
  onRoll,
  timerSeconds,
  currentTurnColor,
  statusNotice,
}) => {
  // Rapid pip cycling animation during active 3D roll
  const [displayNumber, setDisplayNumber] = useState<number>(value ?? 1);
  const cycleTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!rolling) {
      setDisplayNumber(value ?? 1);
      if (cycleTimerRef.current) {
        clearInterval(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
      return;
    }

    cycleTimerRef.current = setInterval(() => {
      setDisplayNumber((prev) => {
        let next = Math.floor(Math.random() * 6) + 1;
        while (next === prev) {
          next = Math.floor(Math.random() * 6) + 1;
        }
        return next;
      });
      try {
        soundManager.play('reveal_tick');
      } catch {}
    }, 65);

    return () => {
      if (cycleTimerRef.current) {
        clearInterval(cycleTimerRef.current);
        cycleTimerRef.current = null;
      }
    };
  }, [rolling, value]);

  const handleRollClick = () => {
    if (!isMyTurn || !canRoll || rolling) return;
    soundManager.play('button_click');
    onRoll();
  };

  // 3x3 Grid Placement for authentic dice face dots (1..6)
  const DICE_GRID_PIPS: Record<number, Array<{ row: number; col: number; isCenter?: boolean }>> = {
    1: [{ row: 2, col: 2, isCenter: true }],
    2: [
      { row: 1, col: 1 },
      { row: 3, col: 3 },
    ],
    3: [
      { row: 1, col: 1 },
      { row: 2, col: 2, isCenter: true },
      { row: 3, col: 3 },
    ],
    4: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
    5: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 2, col: 2, isCenter: true },
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
    6: [
      { row: 1, col: 1 },
      { row: 1, col: 3 },
      { row: 2, col: 1 },
      { row: 2, col: 3 },
      { row: 3, col: 1 },
      { row: 3, col: 3 },
    ],
  };

  const renderDots = (num: number) => {
    const activePips = DICE_GRID_PIPS[num] || DICE_GRID_PIPS[1];

    return (
      <div
        className={`ludo-dice-3d relative w-16 h-16 sm:w-20 sm:h-20 rounded-[20px] p-2.5 sm:p-3 grid grid-cols-3 grid-rows-3 select-none ${
          rolling
            ? 'animate-dice-roll-3d'
            : isMyTurn && canRoll
            ? 'animate-dice-gold-aura'
            : 'animate-dice-land'
        }`}
      >
        {/* Specular Diagonal Light Sheen */}
        <div className="absolute inset-0 rounded-[20px] overflow-hidden pointer-events-none">
          <div className="ludo-dice-glass-sheen absolute -top-4 -left-4 w-20 h-28 rotate-35 pointer-events-none" />
          <div className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-white/25 blur-[1.5px] pointer-events-none" />
        </div>

        {activePips.map((pip, idx) => (
          <span
            key={idx}
            className={`ludo-dice-pip place-self-center rounded-full ${
              pip.isCenter && num === 1
                ? 'ludo-dice-pip--ruby w-4 h-4 sm:w-4.5 sm:h-4.5'
                : 'w-3 h-3 sm:w-3.5 sm:h-3.5'
            }`}
            style={{
              gridRow: pip.row,
              gridColumn: pip.col,
            }}
          />
        ))}
      </div>
    );
  };

  const timerColor =
    timerSeconds <= 3
      ? 'text-red-500 animate-pulse font-black'
      : timerSeconds <= 6
      ? 'text-amber-400 font-bold'
      : 'text-emerald-400 font-bold';

  const turnColorClass = currentTurnColor ? COLOR_TEXT_CLASSES[currentTurnColor] : 'text-slate-300';
  const turnBgClass = currentTurnColor ? COLOR_BG_CLASSES[currentTurnColor] : 'bg-slate-600';
  const haloColor = currentTurnColor ? COLOR_GLOW_STYLES[currentTurnColor] : 'rgba(251, 191, 36, 0.3)';

  return (
    <div className="ludo-dice-box w-full max-w-[205px] sm:max-w-[225px] flex flex-col items-center gap-2.5 p-3 bg-gradient-to-b from-slate-900/95 via-[#0b1120]/95 to-slate-950/95 backdrop-blur-xl rounded-3xl border border-amber-500/25 shadow-[0_12px_36px_rgba(0,0,0,0.85)] shrink-0">
      {/* Turn & Countdown Timer Bar */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 bg-slate-950/90 rounded-xl border border-white/10 text-[11px] shadow-inner">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${turnBgClass} ${isMyTurn ? 'animate-ping' : ''}`} />
          <span className={`font-black tracking-wider text-[11px] truncate ${turnColorClass}`}>
            {isMyTurn ? 'YOUR TURN' : `${currentTurnColor || 'WAIT'}`}
          </span>
        </div>
        <span className={`font-mono text-xs tracking-wider shrink-0 ${timerColor}`}>
          ⏱ {timerSeconds}s
        </span>
      </div>

      {/* 3D Dice Stage with Pedestal Underplate */}
      <div className="relative flex items-center justify-center p-2 my-0.5">
        {/* Radial Ambient Underglow */}
        <div
          className="absolute inset-0 rounded-full blur-xl pointer-events-none transition-all duration-500"
          style={{
            background: `radial-gradient(circle, ${haloColor} 0%, transparent 70%)`,
            transform: isMyTurn && canRoll ? 'scale(1.25)' : 'scale(0.95)',
          }}
        />

        {/* Die Click Trigger */}
        <div
          onClick={handleRollClick}
          className={`relative z-10 transition-all duration-300 transform select-none ${
            canRoll && isMyTurn && !rolling
              ? 'cursor-pointer hover:scale-110 active:scale-95 animate-bounce'
              : rolling
              ? 'cursor-wait scale-105'
              : 'opacity-95'
          }`}
          title={canRoll && isMyTurn ? 'Click to Roll Dice!' : undefined}
        >
          {renderDots(displayNumber)}
        </div>
      </div>

      {/* Primary 3D Metallic ROLL Button */}
      {isMyTurn && canRoll && !rolling && (
        <button
          type="button"
          onClick={handleRollClick}
          className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-[0_4px_16px_rgba(245,158,11,0.5)] transform active:scale-95 transition-all tracking-wider uppercase cursor-pointer border border-yellow-200/70 flex items-center justify-center gap-1.5 animate-pulse"
        >
          <span className="text-base">🎲</span>
          <span>ROLL DICE</span>
        </button>
      )}

      {rolling && (
        <span className="text-xs font-black text-amber-300 animate-pulse tracking-wide flex items-center gap-1">
          <span className="inline-block animate-spin">⚙</span> Rolling dice...
        </span>
      )}

      {/* Status Notice (e.g. Rolled 3 • Need 6 to open token) */}
      {statusNotice && !rolling && (
        <div className="w-full text-center px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/90 to-yellow-950/90 border border-amber-500/50 text-[11px] font-bold text-amber-300 animate-fade-in shadow-inner">
          {statusNotice}
        </div>
      )}

      {/* Guided Hints */}
      {!statusNotice && !rolling && isMyTurn && !canRoll && value && (
        <span className="text-[11px] text-amber-300 font-bold text-center animate-pulse flex items-center justify-center gap-1">
          <span>👉</span> Tap a glowing token!
        </span>
      )}

      {!statusNotice && !rolling && !isMyTurn && currentTurnColor && (
        <span className="text-[10px] sm:text-[11px] text-slate-400 text-center truncate w-full">
          Waiting for <strong className={turnColorClass}>{currentTurnColor}</strong>...
        </span>
      )}
    </div>
  );
};
