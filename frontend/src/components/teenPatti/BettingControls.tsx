import React, { useState, useEffect } from 'react';
import type { TeenPattiGameState } from '../../services/teenPatti';
import { Minus, Plus } from 'lucide-react';

interface BettingControlsProps {
  gameState: TeenPattiGameState;
  currentUserId: string | null;
  onSee: () => void;
  onChaal: (amount?: number) => void;
  onRaise: () => void;
  onPack: () => void;
  onShow: () => void;
  onSideShow: () => void;
  onStart: () => void;
}

export const BettingControls: React.FC<BettingControlsProps> = ({
  gameState,
  currentUserId,
  onSee,
  onChaal,
  onRaise,
  onPack,
  onShow,
  onSideShow,
  onStart,
}) => {
  const viewerSeat = gameState.seats.find((s) => s.id === currentUserId);
  const isMyTurn = viewerSeat && gameState.seats[gameState.current_turn]?.id === currentUserId;
  const isPlaying = gameState.phase === 'playing';
  const isWaiting = gameState.phase === 'waiting';

  const activeSeats = gameState.seats.filter((s) => s.status === 'active');
  const canShow = isPlaying && activeSeats.length === 2;

  // A blind player stakes 1x, a player who has seen their cards stakes 2x.
  const isBlind = !viewerSeat?.seen;
  const multiplier = isBlind ? 1 : 2;
  const minChaalCost = gameState.current_stake * multiplier;
  const stepSize = gameState.current_stake * multiplier;

  // Upper bet limits
  const maxTableStake = gameState.max_stake
    ? gameState.max_stake * multiplier
    : gameState.current_stake * 8 * multiplier;

  const potHeadroom = gameState.pot_limit
    ? Math.max(0, gameState.pot_limit - gameState.pot)
    : Infinity;

  const maxBet = Math.min(maxTableStake, potHeadroom);

  // Stepper bet amount state
  const [customBet, setCustomBet] = useState<number>(minChaalCost);

  // Recalculate minimum bet immediately on state transition (e.g. when cards are opened or stake changes)
  useEffect(() => {
    setCustomBet((prev) => {
      // Constraint: A player with seen cards must be strictly prevented from placing a bet lower than the 2x baseline
      if (prev < minChaalCost) {
        return minChaalCost;
      }
      return prev;
    });
  }, [minChaalCost, isBlind, gameState.current_stake]);

  const handleIncrement = () => {
    setCustomBet((prev) => Math.min(maxBet, prev + stepSize));
  };

  const handleDecrement = () => {
    setCustomBet((prev) => Math.max(minChaalCost, prev - stepSize));
  };

  // Find immediately preceding active player to validate Side Show
  const myIndex = gameState.seats.findIndex((s) => s.id === currentUserId);
  const prevActiveSeat = (() => {
    if (myIndex === -1) return null;
    const n = gameState.seats.length;
    for (let step = 1; step < n; step++) {
      const cand = (myIndex - step + n) % n;
      const s = gameState.seats[cand];
      if (s.status === 'active') {
        return s;
      }
    }
    return null;
  })();

  // Side Show Restrictions:
  // Reject side show requests if the previous player is still Blind (both players must be Seen).
  // Reject side show requests if only two active players remain (must perform a Show instead).
  const canSideShow = Boolean(
    isPlaying &&
    viewerSeat?.seen &&
    activeSeats.length > 2 &&
    prevActiveSeat?.seen
  );

  const raiseChaalCost = (gameState.current_stake * 2) * multiplier;

  // The engine forces a blind player to see after `max_blind_rounds` rounds.
  const maxBlindRounds = gameState.max_blind_rounds ?? 0;
  const blindRoundsLeft = maxBlindRounds
    ? Math.max(0, maxBlindRounds - (viewerSeat?.blind_count ?? 0))
    : null;

  if (isWaiting) {
    const playerCount = gameState.seats?.length || 0;
    const canStart = playerCount >= 2;

    return (
      <div className="tp-action-dock">
        {canStart ? (
          <button className="tp-btn tp-btn-chaal" onClick={onStart} style={{ minWidth: 160 }}>
            <span>Deal Hand</span>
            <span className="tp-btn-sub">Start Round ({playerCount}/2 Ready)</span>
          </button>
        ) : (
          <button
            className="tp-btn tp-btn-chaal"
            disabled
            style={{ minWidth: 180, opacity: 0.65, cursor: 'not-allowed' }}
          >
            <span>Waiting for Opponent</span>
            <span className="tp-btn-sub">Waiting for Player 2 ({playerCount}/2)</span>
          </button>
        )}
      </div>
    );
  }

  if (gameState.phase === 'finished') {
    return (
      <div className="tp-action-dock">
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
          {gameState.reason || 'Round finished'}
        </div>
      </div>
    );
  }

  if (!viewerSeat || viewerSeat.status !== 'active') {
    return (
      <div className="tp-action-dock">
        <div style={{ color: '#94a3b8', fontSize: '0.85rem', fontWeight: 600 }}>
          Waiting for next hand...
        </div>
      </div>
    );
  }

  return (
    <div className="tp-action-dock">
      {!viewerSeat.seen && (
        <button className="tp-btn tp-btn-see" onClick={onSee}>
          <span>See</span>
          <span className="tp-btn-sub">View Cards</span>
        </button>
      )}

      <button
        className="tp-btn tp-btn-pack"
        onClick={onPack}
        disabled={!isMyTurn}
      >
        <span>Pack</span>
        <span className="tp-btn-sub">Fold Hand</span>
      </button>

      {/* Side Show button: available only when seen, > 2 players, and previous player is seen */}
      {canSideShow && (
        <button
          className="tp-btn tp-btn-sideshow"
          onClick={onSideShow}
          disabled={!isMyTurn}
          title="Compare hands privately with previous seen player"
        >
          <span>Side Show</span>
          <span className="tp-btn-sub">₹{(minChaalCost / 100).toFixed(0)}</span>
        </button>
      )}

      {/* Stepper + Bet Button Group */}
      <div className="tp-bet-stepper-container">
        <button
          type="button"
          className="tp-stepper-btn"
          onClick={handleDecrement}
          disabled={!isMyTurn || customBet <= minChaalCost}
          title={`Decrease bet (Minimum: ₹${(minChaalCost / 100).toFixed(0)})`}
          aria-label="Decrease bet"
        >
          <Minus size={15} />
        </button>

        <button
          className={`tp-btn ${isBlind ? 'tp-btn-blind' : 'tp-btn-chaal'}`}
          onClick={() => onChaal(customBet)}
          disabled={!isMyTurn}
          title={isBlind ? 'Bet blind at standard rate' : 'Call with enforced 2x baseline'}
        >
          <span>{isBlind ? 'Blind' : 'Call'}</span>
          <span className="tp-btn-sub">
            ₹{(customBet / 100).toFixed(0)}
            {isBlind && blindRoundsLeft !== null ? ` · ${blindRoundsLeft} left` : ''}
          </span>
        </button>

        <button
          type="button"
          className="tp-stepper-btn"
          onClick={handleIncrement}
          disabled={!isMyTurn || customBet >= maxBet}
          title={`Increase bet (Maximum: ₹${(maxBet / 100).toFixed(0)})`}
          aria-label="Increase bet"
        >
          <Plus size={15} />
        </button>
      </div>

      <button
        className="tp-btn tp-btn-raise"
        onClick={onRaise}
        disabled={!isMyTurn}
        title={isBlind ? 'Double the stake, still blind' : 'Double the stake'}
      >
        <span>Raise</span>
        <span className="tp-btn-sub">₹{(raiseChaalCost / 100).toFixed(0)}</span>
      </button>

      {canShow && (
        <button
          className="tp-btn tp-btn-show"
          onClick={onShow}
          disabled={!isMyTurn}
          title="Compare hands and end the round"
        >
          <span>Show</span>
          <span className="tp-btn-sub">₹{(minChaalCost / 100).toFixed(0)}</span>
        </button>
      )}
    </div>
  );
};
