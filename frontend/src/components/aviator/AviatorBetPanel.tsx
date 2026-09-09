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

export const AviatorBetPanel: React.FC<AviatorBetPanelProps> = ({
  slot,
  phase,
  multiplier,
  myBet,
  walletBalancePaise,
  onPlaceBet,
  onCashout,
}) => {
  const [amountInput, setAmountInput] = useState<string>('10');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState<boolean>(false);
  const [autoCashoutInput, setAutoCashoutInput] = useState<string>('2.0');

  const amountRupees = parseInt(amountInput, 10) || 0;
  const amountPaise = Math.round(amountRupees * 100);
  const isBettingPhase = phase === 'BETTING';
  const isFlyingPhase = phase === 'FLYING';
  const hasActiveBet = myBet?.status === 'ACTIVE';
  const isCashedOut = myBet?.status === 'CASHED_OUT';
  const isLost = myBet?.status === 'LOST';

  const livePayoutRupees = hasActiveBet
    ? ((myBet.amount * multiplier) / 100).toFixed(2)
    : '0.00';

  const handleStep = (step: number) => {
    if (hasActiveBet) return;
    const current = parseInt(amountInput, 10) || 0;
    setAmountInput(String(Math.max(10, current + step)));
  };

  const handleMin = () => {
    if (hasActiveBet) return;
    setAmountInput('10');
  };

  const handleMax = () => {
    if (hasActiveBet) return;
    const walletRupees = Math.floor(walletBalancePaise / 100);
    const maxVal = Math.max(10, Math.min(10000, walletRupees || 1000));
    setAmountInput(String(maxVal));
  };

  const handlePresetClick = (val: number) => {
    if (hasActiveBet) return;
    const current = parseInt(amountInput, 10) || 0;
    setAmountInput(String(Math.max(10, current + val)));
  };

  const handleDouble = () => {
    if (hasActiveBet) return;
    const current = parseInt(amountInput, 10) || 0;
    setAmountInput(String(Math.max(10, current * 2)));
  };

  const handleHalf = () => {
    if (hasActiveBet) return;
    const current = parseInt(amountInput, 10) || 0;
    setAmountInput(String(Math.max(10, Math.floor(current / 2))));
  };

  const handleActionClick = () => {
    if (isBettingPhase) {
      if (!myBet) {
        // Place bet
        const effectiveAmountRupees = Math.max(10, parseInt(amountInput, 10) || 10);
        const effectiveAmountPaise = Math.round(effectiveAmountRupees * 100);
        const effectiveAutoMult = autoCashoutEnabled ? (parseFloat(autoCashoutInput) || 2.0) : null;
        onPlaceBet(
          slot,
          effectiveAmountPaise,
          effectiveAutoMult
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
                type="text"
                inputMode="decimal"
                disabled={hasActiveBet}
                value={autoCashoutInput}
                onChange={(e) => setAutoCashoutInput(e.target.value)}
                onBlur={() => {
                  const val = parseFloat(autoCashoutInput);
                  if (!val || val < 1.01) {
                    setAutoCashoutInput('1.01');
                  }
                }}
                className="auto-mult-input"
              />
              <span className="auto-x">x</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Bet Controls */}
      <div className="aviator-bet-card-body">
        {/* Left column: Amount input with Stepper & Quick Chips */}
        <div className="aviator-amount-section">
          <div className="amount-stepper-wrap">
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase || amountRupees <= 10}
              onClick={() => handleStep(-10)}
              className="stepper-btn stepper-minus"
              aria-label="Decrease bet by ₹10"
              title="Decrease by ₹10"
            >
              −
            </button>
            <div className="amount-input-row">
              <span className="currency-symbol">₹</span>
              <input
                type="text"
                inputMode="numeric"
                disabled={hasActiveBet || !isBettingPhase}
                value={amountInput}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^0-9]/g, '');
                  setAmountInput(clean);
                }}
                onBlur={() => {
                  const val = parseInt(amountInput, 10);
                  if (!val || val < 10) {
                    setAmountInput('10');
                  }
                }}
                className="amount-input"
              />
            </div>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handleStep(10)}
              className="stepper-btn stepper-plus"
              aria-label="Increase bet by ₹10"
              title="Increase by ₹10"
            >
              +
            </button>
          </div>

          <div className="quick-chips-row">
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleMin}
              className="chip-btn chip-minmax chip-min"
              title="Set to minimum bet (₹10)"
            >
              MIN
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase || amountRupees <= 10}
              onClick={() => handleStep(-50)}
              className="chip-btn chip-dec"
              title="Decrease by ₹50"
            >
              -50
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase || amountRupees <= 10}
              onClick={() => handleStep(-10)}
              className="chip-btn chip-dec"
              title="Decrease by ₹10"
            >
              -10
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(10)}
              className="chip-btn chip-inc"
              title="Increase by ₹10"
            >
              +10
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(50)}
              className="chip-btn chip-inc"
              title="Increase by ₹50"
            >
              +50
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(100)}
              className="chip-btn chip-inc"
              title="Increase by ₹100"
            >
              +100
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase || amountRupees <= 10}
              onClick={handleHalf}
              className="chip-btn chip-action"
              title="Half bet amount"
            >
              ½
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleDouble}
              className="chip-btn chip-action"
              title="Double bet amount"
            >
              2×
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleMax}
              className="chip-btn chip-minmax chip-max"
              title="Set to maximum bet"
            >
              MAX
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
                <div className="cashed-out-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">Bet: ₹{((myBet?.amount || 0) / 100).toFixed(0)}</span>
                  <span className="text-sm font-black text-emerald-400">WON: ₹{((myBet?.payout || 0) / 100).toFixed(2)}</span>
                  <span className="text-[10px] text-emerald-300 font-mono font-bold">@{myBet?.cashout_multiplier?.toFixed(2)}x</span>
                </div>
              ) : isLost ? (
                <div className="lost-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span className="text-[10px] text-rose-300 font-bold uppercase tracking-wider">Bet: ₹{((myBet?.amount || 0) / 100).toFixed(0)}</span>
                  <span className="text-xs font-black text-rose-400">CRASHED (LOST)</span>
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
