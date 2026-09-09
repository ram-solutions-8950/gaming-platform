import React from 'react';
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
  const handleRollClick = () => {
    if (!isMyTurn || !canRoll || rolling) return;
    soundManager.play('button_click');
    onRoll();
  };

  // Render authentic 6-face dot pips
  const renderDots = (num: number) => {
    const dotsMap: Record<number, string[]> = {
      1: ['center'],
      2: ['top-left', 'bottom-right'],
      3: ['top-left', 'center', 'bottom-right'],
      4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
      5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
      6: ['top-left', 'top-right', 'mid-left', 'mid-right', 'bottom-left', 'bottom-right'],
    };

    const activeDots = dotsMap[num] || dotsMap[1];

    return (
      <div
        className={`ludo-dice-3d relative w-16 h-16 sm:w-18 sm:h-18 rounded-2xl border-2 border-slate-300 p-2.5 flex items-center justify-center transition-transform ${
          rolling ? 'animate-dice-tumble animate-dice-shake' : ''
        }`}
      >
        {activeDots.includes('top-left') && (
          <span className="ludo-dice-pip absolute top-2.5 left-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
        {activeDots.includes('top-right') && (
          <span className="ludo-dice-pip absolute top-2.5 right-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
        {activeDots.includes('mid-left') && (
          <span className="ludo-dice-pip absolute top-[calc(50%-6px)] left-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
        {activeDots.includes('center') && (
          <span
            className={`ludo-dice-pip absolute w-3.5 h-3.5 rounded-full ${
              num === 1 ? 'bg-red-600 ring-2 ring-red-300/60' : 'bg-slate-900'
            }`}
          />
        )}
        {activeDots.includes('mid-right') && (
          <span className="ludo-dice-pip absolute top-[calc(50%-6px)] right-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
        {activeDots.includes('bottom-left') && (
          <span className="ludo-dice-pip absolute bottom-2.5 left-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
        {activeDots.includes('bottom-right') && (
          <span className="ludo-dice-pip absolute bottom-2.5 right-2.5 w-3 h-3 bg-slate-900 rounded-full" />
        )}
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

  return (
    <div className="ludo-dice-box w-full max-w-[200px] sm:max-w-[220px] flex flex-col items-center gap-2 p-2.5 sm:p-3 bg-gradient-to-b from-slate-900/90 via-[#0d1326]/90 to-slate-950/90 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl shrink-0">
      {/* Turn & 10s Countdown Timer Bar */}
      <div className="w-full flex items-center justify-between px-2.5 py-1 bg-slate-950/90 rounded-xl border border-white/10 text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${turnBgClass} ${isMyTurn ? 'animate-ping' : ''}`} />
          <span className={`font-black truncate ${turnColorClass}`}>
            {isMyTurn ? 'YOUR TURN' : `${currentTurnColor || 'WAIT'}`}
          </span>
        </div>
        <span className={`font-mono text-xs tracking-wider shrink-0 ${timerColor}`}>
          ⏱ {timerSeconds}s
        </span>
      </div>

      {/* 3D Dice Graphic */}
      <div
        onClick={handleRollClick}
        className={`relative transition-all duration-300 transform select-none ${
          canRoll && isMyTurn && !rolling
            ? 'cursor-pointer hover:scale-105 active:scale-95 ring-4 ring-amber-400/90 ring-offset-2 ring-offset-slate-900 rounded-2xl shadow-[0_0_24px_rgba(251,191,36,0.6)] animate-bounce'
            : rolling
            ? 'cursor-wait scale-105'
            : 'opacity-90'
        }`}
        title={canRoll && isMyTurn ? 'Click to Roll Dice!' : undefined}
      >
        {renderDots(value ?? 1)}
      </div>

      {/* Roll Action Button */}
      {isMyTurn && canRoll && !rolling && (
        <button
          type="button"
          onClick={handleRollClick}
          className="w-full py-1.5 px-3 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-amber-500/30 transform active:scale-95 transition tracking-wider uppercase cursor-pointer border border-amber-300/50"
        >
          🎲 ROLL DICE
        </button>
      )}

      {rolling && (
        <span className="text-[11px] font-bold text-amber-300 animate-pulse">
          Rolling dice...
        </span>
      )}

      {/* Status Notice (e.g. Rolled 3 • Need 6 to start) */}
      {statusNotice && !rolling && (
        <div className="w-full text-center px-2 py-1 rounded-lg bg-amber-950/80 border border-amber-500/50 text-[10px] sm:text-[11px] font-bold text-amber-300 animate-fade-in shadow-inner">
          {statusNotice}
        </div>
      )}

      {/* Hints when waiting or moving */}
      {!statusNotice && !rolling && isMyTurn && !canRoll && value && (
        <span className="text-[10px] sm:text-[11px] text-amber-300 font-semibold text-center animate-pulse">
          👉 Tap a glowing token!
        </span>
      )}

      {!statusNotice && !rolling && !isMyTurn && currentTurnColor && (
        <span className="text-[10px] text-slate-400 text-center truncate w-full">
          Waiting for <strong className={turnColorClass}>{currentTurnColor}</strong>...
        </span>
      )}
    </div>
  );
};
