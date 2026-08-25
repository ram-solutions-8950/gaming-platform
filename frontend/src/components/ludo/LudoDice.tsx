import React, { useEffect, useRef, useState } from 'react';
import { useLudo } from '../../contexts/LudoContext';
import { useAuthStore } from '../../store/authStore';
import { soundManager } from '../../services/soundManager';
import './ludo-king.css';

const PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};


function DiceFace({ n, className }: { n: number; className: string }) {
  const pips = PIP_MAP[n];
  return (
    <div className={`ludo-dice-face ${className}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={pips.includes(i) ? 'pip' : undefined} />
      ))}
    </div>
  );
}

function DiceCube({ value, rolling }: { value: number; rolling: boolean }) {
  const shown = value >= 1 && value <= 6 ? value : 1;
  return (
    <div className="ludo-dice-scene">
      <div
        className={`ludo-dice-cube ${rolling ? 'rolling' : `ludo-dice-show-${shown}`}`}
      >
        <DiceFace n={1} className="f1" />
        <DiceFace n={2} className="f2" />
        <DiceFace n={3} className="f3" />
        <DiceFace n={4} className="f4" />
        <DiceFace n={5} className="f5" />
        <DiceFace n={6} className="f6" />
      </div>
    </div>
  );
}

export const LudoDice: React.FC = () => {
  const { match, rollDice } = useLudo();
  const { user } = useAuthStore();

  const [isRolling, setIsRolling] = useState(false);
  const [showSix, setShowSix] = useState(false);
  const lastSeen = useRef<number | null>(null);
  const selfRoll = useRef(false);

  const me = match?.players.find(p => p.user_id === user?.id);

  const isMyTurn =
    match?.status === 'IN_PROGRESS' &&
    match.current_turn_color === me?.color;

  const alreadyRolled =
    match?.last_dice_roll !== null &&
    match?.last_dice_roll !== undefined;

  const canRoll = Boolean(isMyTurn && !isRolling && !alreadyRolled);
  const face = match?.last_dice_roll && match.last_dice_roll >= 1 ? match.last_dice_roll : 1;

  useEffect(() => {
    const roll = match?.last_dice_roll ?? null;
    if (!roll || roll === lastSeen.current) return;
    lastSeen.current = roll;
    if (!selfRoll.current) {
      setIsRolling(true);
      window.setTimeout(() => setIsRolling(false), 850);
    }
    selfRoll.current = false;
    if (roll === 6) {
      setShowSix(true);
      const t = window.setTimeout(() => setShowSix(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [match?.last_dice_roll]);

  useEffect(() => {
    if (isRolling) {
      soundManager.play('dice_roll');
    }
  }, [isRolling]);

  const handleRoll = async () => {
    if (!canRoll) return;
    selfRoll.current = true;
    setIsRolling(true);
    try {
      await rollDice();
    } finally {
      window.setTimeout(() => setIsRolling(false), 850);
    }
  };

  if (!match || match.status !== 'IN_PROGRESS') return null;

  const sparks = [
    { sx: '-42px', sy: '-36px' },
    { sx: '44px', sy: '-28px' },
    { sx: '-36px', sy: '38px' },
    { sx: '40px', sy: '34px' },
    { sx: '0px', sy: '-48px' },
    { sx: '52px', sy: '8px' },
  ];

  return (
    <div className="relative w-full rounded-2xl bg-black/55 px-3 py-3 ring-1 ring-white/20 backdrop-blur-md sm:px-4">
      {showSix && (
        <div className="ludo-six-burst pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#fdd835] px-3 py-1 text-xs font-black text-[#3e2723]">
          SIX! Extra turn
        </div>
      )}
      {showSix &&
        sparks.map((s, i) => (
          <span
            key={i}
            className="ludo-sparkle pointer-events-none"
            style={{ top: '20px', left: '18%', ['--sx']: s.sx, ['--sy']: s.sy } as React.CSSProperties}
          />
        ))}

      <div className="flex items-center gap-3 sm:gap-4">
        <DiceCube value={face} rolling={isRolling} />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider sm:text-xs">
            {isRolling ? (
              <span className="text-[#fdd835]">Rolling…</span>
            ) : alreadyRolled ? (
              <span className="text-emerald-300">Tap a glowing token</span>
            ) : isMyTurn ? (
              <span className="text-white">Your turn — roll</span>
            ) : (
              <span className="text-white/60">{match.current_turn_color} is rolling</span>
            )}
          </p>

          {isMyTurn && (
            <button
              type="button"
              onClick={handleRoll}
              disabled={!canRoll}
              className={`mt-2 min-h-[44px] w-full rounded-xl text-sm font-black uppercase tracking-widest text-white ${
                canRoll
                  ? 'ludo-roll-btn bg-gradient-to-b from-[#7cb342] to-[#33691e] active:translate-y-1'
                  : 'cursor-not-allowed bg-white/10 opacity-70'
              }`}
            >
              {isRolling ? 'Rolling…' : alreadyRolled ? 'Move token' : 'Roll dice'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
