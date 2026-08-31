import React, { useEffect, useState } from 'react';
import { rewardService, type JackpotStatus } from '../../services/rewardService';

interface Props {
  onClose: () => void;
  onPlayGame?: (path: string) => void;
}

export const JackpotModal: React.FC<Props> = ({ onClose, onPlayGame }) => {
  const [jackpot, setJackpot] = useState<JackpotStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    rewardService.getJackpotStatus()
      .then(setJackpot)
      .catch(console.error)
      .finally(() => setLoading(false));

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm animate-fade-in select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md bg-gradient-to-b from-[#380424] via-[#1a0219] to-[#0c000f] rounded-2xl border-2 border-amber-400/90 shadow-[0_0_45px_rgba(245,158,11,0.4)] overflow-hidden text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 px-6 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎟️</span>
            <div>
              <h2 className="text-base font-black text-purple-950 tracking-wider uppercase drop-shadow-sm leading-tight">
                Mega Jackpot
              </h2>
              <p className="text-[11px] font-bold text-purple-900/90 leading-tight">
                Live Grand Progressive Prize Pool
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-purple-950/20 hover:bg-purple-950/40 text-purple-950 font-black text-lg flex items-center justify-center transition active:scale-95 cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col items-center text-center space-y-4 overflow-y-auto">
          {/* Animated Gold Pot Icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(251,191,36,0.6)] animate-pulse">
              🏆
            </div>
            <span className="absolute -top-1 -right-1 bg-red-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full uppercase border border-red-300 shadow">
              LIVE
            </span>
          </div>

          {/* Amount Ticker Display */}
          <div className="w-full bg-[#1e021c]/90 border-2 border-amber-400/80 rounded-2xl p-4 shadow-inner">
            <span className="text-[11px] font-extrabold text-amber-300 tracking-wider uppercase block">
              {jackpot?.title || 'Mega Jackpot'}
            </span>
            <div className="text-3xl sm:text-4xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)] my-1">
              ₹{loading ? '500,000.00' : (jackpot?.current_amount_inr ?? 500000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-purple-300 font-semibold block mt-1">
              Seed Pool: ₹{(jackpot?.seed_amount_inr ?? 100000).toLocaleString('en-IN')} | Verified by RNG
            </span>
          </div>

          {/* Description / Rules */}
          <div className="w-full bg-[#160216]/80 border border-purple-800/40 rounded-xl p-3.5 text-left space-y-2 text-xs">
            <h4 className="text-xs font-black text-amber-400 uppercase tracking-wide">
              How To Win:
            </h4>
            <ul className="space-y-1.5 text-purple-200/90 text-[11px] list-disc list-inside">
              <li>Place a minimum bet of <strong>₹10</strong> on any live casino game.</li>
              <li>Every qualifying bet adds to the live progressive pool.</li>
              <li>Jackpot triggers randomly on qualifying winning rounds!</li>
              <li>Winnings are instantly credited directly to your cash wallet.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="w-full pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onPlayGame) onPlayGame('/games/dragon-tiger');
              }}
              className="w-full bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 hover:from-amber-300 text-purple-950 font-black text-xs py-2.5 rounded-xl uppercase shadow-[0_0_15px_rgba(245,158,11,0.5)] border border-yellow-200 active:scale-95 transition cursor-pointer"
            >
              Play Qualifying Games 🎮
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-[#0c000f] border-t border-purple-800/40 flex items-center justify-between text-[11px] text-purple-300">
          <span>Randomly awarded to active players.</span>
          <button onClick={onClose} className="text-amber-400 hover:text-amber-300 font-bold uppercase cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
