import React, { useState } from 'react';
import type { AviatorPhase, AviatorLiveBet } from '../../hooks/useAviatorSocket';

interface AviatorBetPanelProps {
  slot: 1 | 2;
  phase: AviatorPhase;
  multiplier: number;
  myBet?: AviatorLiveBet | null;
  walletBalancePaise: number;
  onPlaceBet: (slot: 1 | 2, amountPaise: number, autoCashout?: number | null) => void;
  onCashout: (slot: 1 | 2) => void;
}

const CHIP_PRESETS = [10, 50, 100, 500, 1000];

export const AviatorBetPanel: React.FC<AviatorBetPanelProps> = ({
  slot,
  phase,
  multiplier,
  myBet,
  walletBalancePaise,
  onPlaceBet,
  onCashout,
}) => {
  const [amountRupees, setAmountRupees] = useState<number>(10);
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutMultiplier, setAutoCashoutMultiplier] = useState<number>(2.0);

  const amountPaise = Math.round(amountRupees * 100);
  const isBettingPhase = phase === 'BETTING';
  const isFlyingPhase = phase === 'FLYING';
  const hasActiveBet = myBet?.status === 'ACTIVE';
  const isCashedOut = myBet?.status === 'CASHED_OUT';
  const isLost = myBet?.status === 'LOST';

  const livePayoutRupees = hasActiveBet
    ? ((myBet.amount * multiplier) / 100).toFixed(2)
    : '0.00';

  const handlePresetClick = (val: number) => {
    if (hasActiveBet) return;
    setAmountRupees((prev) => Math.max(1, prev + val));
  };

  const handleDouble = () => {
    if (hasActiveBet) return;
    setAmountRupees((prev) => prev * 2);
  };

  const handleHalf = () => {
    if (hasActiveBet) return;
    setAmountRupees((prev) => Math.max(1, Math.floor(prev / 2)));
  };

  const handleActionClick = () => {
    if (isBettingPhase) {
      if (!myBet) {
        // Place bet
        onPlaceBet(
          slot,
          amountPaise,
          autoCashoutEnabled ? autoCashoutMultiplier : null
        );
      }
    } else if (isFlyingPhase && hasActiveBet) {
      // Manual cashout
      onCashout(slot);
    }
  };

  return (
    <div className={`aviator-bet-card ${hasActiveBet ? 'active-bet' : ''}`}>
      {/* Top Header & Slot indicator */}
      <div className="aviator-bet-card-header">
        <span className="slot-badge">SLOT {slot}</span>
        <div className="auto-cashout-toggle">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300">
            <input
              type="checkbox"
              checked={autoCashoutEnabled}
              disabled={hasActiveBet}
              onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
              className="accent-brand-500 rounded cursor-pointer"
            />
            Auto Cash Out
          </label>
          {autoCashoutEnabled && (
            <div className="auto-input-wrap">
              <input
                type="number"
                step="0.1"
                min="1.01"
                max="1000"
                disabled={hasActiveBet}
                value={autoCashoutMultiplier}
                onChange={(e) => setAutoCashoutMultiplier(parseFloat(e.target.value) || 1.01)}
                className="auto-mult-input"
              />
              <span className="auto-x">x</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Bet Controls */}
      <div className="aviator-bet-card-body">
        {/* Left column: Amount input & Quick Chips */}
        <div className="aviator-amount-section">
          <div className="amount-input-row">
            <span className="currency-symbol">₹</span>
            <input
              type="number"
              min="1"
              max="50000"
              disabled={hasActiveBet || !isBettingPhase}
              value={amountRupees}
              onChange={(e) => setAmountRupees(Math.max(1, parseInt(e.target.value) || 0))}
              className="amount-input"
            />
          </div>

          <div className="quick-chips-row">
            {CHIP_PRESETS.map((val) => (
              <button
                key={val}
                type="button"
                disabled={hasActiveBet || !isBettingPhase}
                onClick={() => handlePresetClick(val)}
                className="chip-btn"
              >
                +{val}
              </button>
            ))}
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleHalf}
              className="chip-btn chip-action"
            >
              ½
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleDouble}
              className="chip-btn chip-action"
            >
              2×
            </button>
          </div>
        </div>

        {/* Right column: Big Action Button */}
        <div className="aviator-action-section">
          {isBettingPhase ? (
            myBet ? (
              <div className="bet-placed-state">
                <span className="text-xs uppercase font-bold text-emerald-400">BET READY</span>
                <span className="text-base font-extrabold text-white">₹{(myBet.amount / 100).toFixed(0)}</span>
                {myBet.auto_cashout && (
                  <span className="text-[10px] text-gray-400">Auto: {myBet.auto_cashout.toFixed(2)}x</span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleActionClick}
                disabled={amountPaise > walletBalancePaise || amountPaise <= 0}
                className="aviator-btn-bet"
              >
                <span className="btn-main-label">BET</span>
                <span className="btn-sub-label">₹{amountRupees.toFixed(0)}</span>
              </button>
            )
          ) : isFlyingPhase ? (
            hasActiveBet ? (
              <button
                type="button"
                onClick={handleActionClick}
                className="aviator-btn-cashout animate-pulse"
              >
                <span className="btn-main-label">CASH OUT</span>
                <span className="btn-sub-label">₹{livePayoutRupees}</span>
              </button>
            ) : (
              <div className="waiting-next-round">
                <span className="text-xs font-semibold text-gray-400">ROUND IN FLIGHT</span>
                <span className="text-xs font-bold text-brand-400">{multiplier.toFixed(2)}x</span>
              </div>
            )
          ) : (
            /* CRASHED or SETTLED */
            <div className="round-ended-state">
              {isCashedOut ? (
                <div className="cashed-out-badge">
                  <span className="text-xs font-bold text-emerald-400">WON ₹{((myBet?.payout || 0) / 100).toFixed(2)}</span>
                  <span className="text-[11px] text-emerald-300">@{myBet?.cashout_multiplier?.toFixed(2)}x</span>
                </div>
              ) : isLost ? (
                <div className="lost-badge">
                  <span className="text-xs font-bold text-rose-400">CRASHED</span>
                </div>
              ) : (
                <div className="waiting-next-round">
                  <span className="text-xs font-semibold text-gray-400">WAIT FOR NEXT ROUND</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
