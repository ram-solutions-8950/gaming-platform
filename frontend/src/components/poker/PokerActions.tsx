import React, { useState } from 'react';
import type { PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PokerActionsProps {
  isMyTurn: boolean;
  myPlayer?: PokerPlayerInfo | null;
  currentHighBet: number;
  minRaiseAmount: number;
  bigBlind: number;
  onSendAction: (action: string, amount?: number) => void;
}

export function PokerActions({
  isMyTurn,
  myPlayer,
  currentHighBet,
  minRaiseAmount,
  bigBlind,
  onSendAction,
}: PokerActionsProps) {
  const myCurrentBet = myPlayer?.current_bet || 0;
  const myStack = myPlayer?.stack || 0;
  const callAmount = Math.max(0, currentHighBet - myCurrentBet);
  const canCheck = callAmount === 0;

  const minRaiseTarget = currentHighBet + minRaiseAmount;
  const maxRaiseTarget = myStack + myCurrentBet;

  const [raiseAmount, setRaiseAmount] = useState<number>(minRaiseTarget);

  if (!myPlayer || myPlayer.is_folded || myPlayer.is_all_in) {
    return (
      <div className="poker-action-dock disabled">
        <span className="text-gray-400 text-xs font-semibold">
          {myPlayer?.is_folded ? 'You have folded' : myPlayer?.is_all_in ? 'You are All-In' : 'Waiting for hand...'}
        </span>
      </div>
    );
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRaiseAmount(Number(e.target.value));
  };

  return (
    <div className={`poker-action-dock ${!isMyTurn ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Raise slider & Quick Bet buttons */}
      {isMyTurn && maxRaiseTarget > minRaiseTarget && (
        <div className="poker-raise-control-bar">
          <input
            type="range"
            min={minRaiseTarget}
            max={maxRaiseTarget}
            step={bigBlind}
            value={Math.max(minRaiseTarget, Math.min(raiseAmount, maxRaiseTarget))}
            onChange={handleSliderChange}
            className="poker-raise-slider"
          />
          <div className="quick-raise-buttons">
            <button
              type="button"
              onClick={() => setRaiseAmount(minRaiseTarget)}
              className="quick-raise-btn"
            >
              Min (₹{(minRaiseTarget / 100).toFixed(0)})
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(Math.min(maxRaiseTarget, currentHighBet * 2 || bigBlind * 4))}
              className="quick-raise-btn"
            >
              2x
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(maxRaiseTarget)}
              className="quick-raise-btn highlight"
            >
              Max / All-In
            </button>
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="poker-action-buttons-group">
        <button
          type="button"
          onClick={() => onSendAction('fold')}
          disabled={!isMyTurn}
          className="btn-poker btn-fold"
        >
          FOLD
        </button>

        {canCheck ? (
          <button
            type="button"
            onClick={() => onSendAction('check')}
            disabled={!isMyTurn}
            className="btn-poker btn-check"
          >
            CHECK
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSendAction('call')}
            disabled={!isMyTurn}
            className="btn-poker btn-call"
          >
            CALL ₹{(callAmount / 100).toFixed(2)}
          </button>
        )}

        {maxRaiseTarget > minRaiseTarget && (
          <button
            type="button"
            onClick={() => onSendAction('raise', raiseAmount)}
            disabled={!isMyTurn}
            className="btn-poker btn-raise"
          >
            RAISE TO ₹{(raiseAmount / 100).toFixed(2)}
          </button>
        )}

        <button
          type="button"
          onClick={() => onSendAction('all_in')}
          disabled={!isMyTurn}
          className="btn-poker btn-allin"
        >
          ALL-IN
        </button>
      </div>
    </div>
  );
}
