import React, { useState } from 'react';
import type { LudoColor } from '../../types/ludo';
import { soundManager } from '../../services/soundManager';

interface Props {
  value: number | null;
  isMyTurn: boolean;
  canRoll: boolean;
  onRoll: () => void;
  timerSeconds: number;
  currentTurnColor: LudoColor | null;
}

export const LudoDice: React.FC<Props> = ({
  value,
  isMyTurn,
  canRoll,
  onRoll,
  timerSeconds,
  currentTurnColor,
}) => {
  const [rolling, setRolling] = useState(false);

  const handleRollClick = () => {
    if (!isMyTurn || !canRoll || rolling) return;
    setRolling(true);
    soundManager.play('button_click');
    onRoll();
    setTimeout(() => setRolling(false), 600);
  };

  // Render dot faces 1..6
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
      <div className="relative w-16 h-16 bg-white rounded-2xl shadow-[0_8px_20px_rgba(0,0,0,0.4)] border-2 border-slate-200 p-2 flex items-center justify-center">
        {activeDots.includes('top-left') && <span className="absolute top-2.5 left-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
        {activeDots.includes('top-right') && <span className="absolute top-2.5 right-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
        {activeDots.includes('mid-left') && <span className="absolute top-6.5 left-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
        {activeDots.includes('center') && <span className="absolute w-3 h-3 bg-red-600 rounded-full" />}
        {activeDots.includes('mid-right') && <span className="absolute top-6.5 right-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
        {activeDots.includes('bottom-left') && <span className="absolute bottom-2.5 left-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
        {activeDots.includes('bottom-right') && <span className="absolute bottom-2.5 right-2.5 w-3 h-3 bg-slate-900 rounded-full" />}
      </div>
    );
  };

  const timerColor = timerSeconds <= 3 ? 'text-red-500 animate-pulse' : timerSeconds <= 6 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="ludo-dice-box flex flex-col items-center gap-2 p-3 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl">
      {/* 10s Timer Banner */}
      <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/80 rounded-full border border-slate-800">
        <span className="text-xs text-slate-400 font-medium">Turn Timer:</span>
        <span className={`text-sm font-black tracking-wider ${timerColor}`}>
          {timerSeconds}s
        </span>
      </div>

      {/* Dice Visual */}
      <div
        onClick={handleRollClick}
        className={`transition-all duration-300 transform ${
          rolling ? 'rotate-180 scale-95' : 'hover:scale-105'
        } ${canRoll && isMyTurn ? 'cursor-pointer ring-4 ring-amber-400/80 ring-offset-2 ring-offset-slate-900 animate-bounce' : 'opacity-85'}`}
      >
        {renderDots(value ?? 1)}
      </div>

      {/* Roll Button */}
      {isMyTurn && canRoll && (
        <button
          onClick={handleRollClick}
          disabled={rolling}
          className="px-5 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 font-black text-sm rounded-xl shadow-lg transform active:scale-95 transition tracking-wider uppercase"
        >
          ROLL DICE
        </button>
      )}

      {isMyTurn && !canRoll && value && (
        <span className="text-xs text-amber-300 font-semibold animate-pulse">
          Pick a token to move!
        </span>
      )}

      {!isMyTurn && currentTurnColor && (
        <span className="text-xs text-slate-400 font-medium">
          Waiting for <strong className="text-white">{currentTurnColor}</strong>...
        </span>
      )}
    </div>
  );
};
