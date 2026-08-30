import React from 'react';
import type { TeenPattiGameState } from '../../services/teenPatti';

interface BettingControlsProps {
  gameState: TeenPattiGameState;
  currentUserId: string | null;
  onSee: () => void;
  onChaal: () => void;
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
  const isWaiting = gameState.phase === 'waiting' || gameState.phase === 'finished';

  const activeSeats = gameState.seats.filter((s) => s.status === 'active');
  const canShow = isPlaying && isMyTurn && activeSeats.length === 2;

  // Calculate current stake multiplier
  const multiplier = viewerSeat?.seen ? 2 : 1;
  const currentChaalCost = gameState.current_stake * multiplier;
  const raiseChaalCost = (gameState.current_stake * 2) * multiplier;

  if (isWaiting) {
    const playerCount = gameState.seats?.length || 0;
    const canStart = playerCount >= 2;

    return (
      <div className="tp-action-dock">
        {canStart ? (
          <button className="tp-btn tp-btn-chaal" onClick={onStart} style={{ minWidth: 160 }}>
            <span>Deal Hand</span>
            <span className="tp-btn-sub">Start Round ({playerCount} Players)</span>
          </button>
        ) : (
          <button
            className="tp-btn tp-btn-chaal"
            disabled
            style={{ minWidth: 180, opacity: 0.65, cursor: 'not-allowed' }}
          >
            <span>Waiting for Players</span>
            <span className="tp-btn-sub">Need min 2 ({playerCount}/4)</span>
          </button>
        )}
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

      {viewerSeat.seen && activeSeats.length > 2 && (
        <button
          className="tp-btn tp-btn-sideshow"
          onClick={onSideShow}
          disabled={!isMyTurn}
        >
          <span>Side Show</span>
          <span className="tp-btn-sub">₹{(currentChaalCost / 100).toFixed(0)}</span>
        </button>
      )}

      {canShow ? (
        <button
          className="tp-btn tp-btn-show"
          onClick={onShow}
          disabled={!isMyTurn}
        >
          <span>Show</span>
          <span className="tp-btn-sub">₹{(currentChaalCost / 100).toFixed(0)}</span>
        </button>
      ) : (
        <>
          <button
            className="tp-btn tp-btn-chaal"
            onClick={onChaal}
            disabled={!isMyTurn}
          >
            <span>Chaal</span>
            <span className="tp-btn-sub">₹{(currentChaalCost / 100).toFixed(0)}</span>
          </button>

          <button
            className="tp-btn tp-btn-raise"
            onClick={onRaise}
            disabled={!isMyTurn}
          >
            <span>Raise</span>
            <span className="tp-btn-sub">₹{(raiseChaalCost / 100).toFixed(0)}</span>
          </button>
        </>
      )}
    </div>
  );
};
