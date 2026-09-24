import React, { useEffect, useState } from 'react';
import type { PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PokerActionsProps {
  isMyTurn: boolean;
  myPlayer?: PokerPlayerInfo | null;
  phase: string;
  playerCount: number;
  canDealHand: boolean;
  onDealHand: () => void;
  currentHighBet: number;
  minRaiseAmount: number;
  bigBlind: number;
  /** Changes whenever the turn passes to someone new. */
  turnKey: string;
  turnDurationSeconds: number;
  /** Buy-in for a viewer who isn't seated; omitted when they can't sit down. */
  seatBuyIn?: number;
  onTakeSeat?: () => void;
  onSendAction: (action: string, amount?: number) => void;
}

const BETTING_PHASES = ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER'];

function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

/** Seconds left on the current turn, counted from when this client saw it start. */
function useTurnCountdown(active: boolean, turnKey: string, durationSeconds: number): number {
  const [left, setLeft] = useState(durationSeconds);
  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    setLeft(durationSeconds);
    const timer = setInterval(() => {
      setLeft(Math.max(0, Math.ceil(durationSeconds - (Date.now() - startedAt) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [active, turnKey, durationSeconds]);
  return left;
}

export function PokerActions({
  isMyTurn,
  myPlayer,
  phase,
  playerCount,
  canDealHand,
  onDealHand,
  currentHighBet,
  minRaiseAmount,
  bigBlind,
  turnKey,
  turnDurationSeconds,
  seatBuyIn,
  onTakeSeat,
  onSendAction,
}: PokerActionsProps) {
  const myCurrentBet = myPlayer?.current_bet || 0;
  const myStack = myPlayer?.stack || 0;
  const callAmount = Math.max(0, currentHighBet - myCurrentBet);
  const canCheck = callAmount === 0;

  // Hold'em: a raise must be at least the size of the last full raise (the big
  // blind when nobody has raised), and it can't go beyond this player's stack.
  const minRaiseTarget = currentHighBet + minRaiseAmount;
  const maxRaiseTarget = myStack + myCurrentBet;
  const canRaise = maxRaiseTarget > minRaiseTarget;
  const isOpeningBet = currentHighBet === 0;

  // Every new decision starts from the minimum; the value on screen is always
  // clamped to what the rules allow right now.
  const [raiseAmount, setRaiseAmount] = useState<number>(minRaiseTarget);
  useEffect(() => {
    setRaiseAmount(minRaiseTarget);
  }, [minRaiseTarget, turnKey]);
  const raiseTarget = Math.max(minRaiseTarget, Math.min(raiseAmount, maxRaiseTarget));

  const handInProgress = BETTING_PHASES.includes(phase);
  const secondsLeft = useTurnCountdown(isMyTurn && handInProgress, turnKey, turnDurationSeconds);

  // Betting controls only make sense during a live betting round; between hands
  // they would advertise a call against a pot that has already been paid out.
  if (!myPlayer || !handInProgress || !myPlayer.in_hand || myPlayer.is_folded || myPlayer.is_all_in) {
    let status = 'Waiting for hand...';
    if (myPlayer && handInProgress && myPlayer.in_hand) {
      status = myPlayer.is_folded ? 'You have folded' : 'You are All-In';
    } else if (myPlayer && handInProgress) {
      status = 'You join from the next hand';
    } else if (phase === 'WAITING' && playerCount < 2) {
      status = 'Waiting for players to join...';
    } else if (phase === 'WAITING' && !canDealHand) {
      status = 'Waiting for players with chips...';
    }
    // Between hands the dock is empty, so the deal button lives here rather than
    // on the felt, where it sat on top of the viewer's own seat.
    return (
      <div className="poker-action-dock disabled">
        {!myPlayer && onTakeSeat && seatBuyIn ? (
          <button type="button" onClick={onTakeSeat} className="deal-hand-btn">
            Take a seat · buy in {rupees(seatBuyIn)}
          </button>
        ) : phase === 'WAITING' && canDealHand && myPlayer ? (
          <button type="button" onClick={onDealHand} className="deal-hand-btn">
            Deal the next hand
          </button>
        ) : (
          <span className="text-gray-400 text-xs font-semibold">{status}</span>
        )}
      </div>
    );
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRaiseAmount(Number(e.target.value));
  };

  return (
    <div className={`poker-action-dock ${!isMyTurn ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Raise slider & Quick Bet buttons */}
      {isMyTurn && canRaise && (
        <div className="poker-raise-control-bar">
          <input
            type="range"
            min={minRaiseTarget}
            max={maxRaiseTarget}
            step={bigBlind}
            value={raiseTarget}
            onChange={handleSliderChange}
            className="poker-raise-slider"
          />
          <div className="quick-raise-buttons">
            <button type="button" onClick={() => setRaiseAmount(minRaiseTarget)} className="quick-raise-btn">
              Min ({rupees(minRaiseTarget)})
            </button>
            <button
              type="button"
              onClick={() => setRaiseAmount(isOpeningBet ? bigBlind * 3 : currentHighBet * 2)}
              className="quick-raise-btn"
            >
              {isOpeningBet ? '3 BB' : '2x'}
            </button>
            <button type="button" onClick={() => setRaiseAmount(maxRaiseTarget)} className="quick-raise-btn highlight">
              Max / All-In
            </button>
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="poker-action-buttons-group">
        {isMyTurn && (
          <span className={`poker-turn-clock ${secondsLeft <= 5 ? 'urgent' : ''}`} aria-label="Time left to act">
            {secondsLeft}s
          </span>
        )}
        <button type="button" onClick={() => onSendAction('fold')} disabled={!isMyTurn} className="btn-poker btn-fold">
          FOLD
        </button>

        {canCheck ? (
          <button type="button" onClick={() => onSendAction('check')} disabled={!isMyTurn} className="btn-poker btn-check">
            CHECK
          </button>
        ) : (
          <button type="button" onClick={() => onSendAction('call')} disabled={!isMyTurn} className="btn-poker btn-call">
            CALL {rupees(Math.min(callAmount, myStack))}
          </button>
        )}

        {canRaise && (
          <button
            type="button"
            onClick={() => onSendAction(isOpeningBet ? 'bet' : 'raise', raiseTarget)}
            disabled={!isMyTurn}
            className="btn-poker btn-raise"
          >
            {isOpeningBet ? 'BET' : 'RAISE TO'} {rupees(raiseTarget)}
          </button>
        )}

        <button type="button" onClick={() => onSendAction('all_in')} disabled={!isMyTurn} className="btn-poker btn-allin">
          ALL-IN
        </button>
      </div>
    </div>
  );
}
