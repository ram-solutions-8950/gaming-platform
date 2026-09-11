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
  isSingleSlot?: boolean;
  onAddSlot?: () => void;
  canClose?: boolean;
  onClose?: () => void;
}

export const AviatorBetPanel: React.FC<AviatorBetPanelProps> = ({
  slot,
  phase,
  multiplier,
  myBet,
  walletBalancePaise,
  onPlaceBet,
  onCashout,
  isSingleSlot,
  onAddSlot,
  canClose,
  onClose,
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
        <div className="slot-title-group">
          <span className="slot-badge">SLOT {slot}</span>
          {isSingleSlot && onAddSlot && (
            <button
              type="button"
              onClick={onAddSlot}
              className="add-slot-btn"
              title="Add 2nd bet panel"
            >
              + 2nd Bet
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="auto-cashout-toggle">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-300">
              <input
                type="checkbox"
                checked={autoCashoutEnabled}
                disabled={hasActiveBet}
                onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
                className="aviator-custom-checkbox cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-gray-300">Auto Cash Out</span>
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
          {canClose && onClose && (
            <button
              type="button"
              disabled={hasActiveBet}
              onClick={onClose}
              className="close-slot-btn"
              title="Remove 2nd bet panel"
            >
              ✕
            </button>
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
              onClick={() => handlePresetClick(50)}
              className="chip-btn chip-inc"
              title="Add ₹50"
            >
              +50
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(100)}
              className="chip-btn chip-inc"
              title="Add ₹100"
            >
              +100
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(500)}
              className="chip-btn chip-inc"
              title="Add ₹500"
            >
              +500
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={() => handlePresetClick(1000)}
              className="chip-btn chip-inc"
              title="Add ₹1,000"
            >
              +1K
            </button>
            <button
              type="button"
              disabled={hasActiveBet || !isBettingPhase}
              onClick={handleMin}
              className="chip-btn chip-minmax"
              title="Set to minimum bet (₹10)"
            >
              MIN
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
              className="chip-btn chip-minmax"
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
                <span className="bet-placed-tag">✓ BET READY</span>
                <span className="bet-placed-amount">₹{(myBet.amount / 100).toFixed(0)}</span>
                <span className="bet-placed-sub">
                  {myBet.auto_cashout ? `Auto: ${myBet.auto_cashout.toFixed(2)}x` : 'Waiting for takeoff'}
                </span>
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
                <span className="waiting-tag">IN FLIGHT</span>
                <span className="waiting-mult">{multiplier.toFixed(2)}x</span>
                <span className="waiting-sub">Wait next round</span>
              </div>
            )
          ) : (
            /* CRASHED or SETTLED */
            <div className="round-ended-state">
              {isCashedOut ? (
                <div className="cashed-out-badge">
                  <span className="cashed-tag">🏆 CASHED OUT</span>
                  <span className="cashed-won">₹{((myBet?.payout || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <div className="cashed-meta">
                    <span className="cashed-mult">@{myBet?.cashout_multiplier?.toFixed(2)}x</span>
                    <span className="cashed-bet">Bet: ₹{((myBet?.amount || 0) / 100).toFixed(0)}</span>
                  </div>
                </div>
              ) : isLost ? (
                <div className="lost-badge">
                  <span className="lost-tag">💥 FLEW AWAY</span>
                  <span className="lost-main">CRASHED</span>
                  <span className="lost-sub">Lost ₹{((myBet?.amount || 0) / 100).toFixed(0)}</span>
                </div>
              ) : (
                <div className="waiting-next-round">
                  <span className="waiting-tag">ROUND ENDED</span>
                  <span className="waiting-sub">Next round starting...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
