import { PokerCard } from './PokerCard';
import type { PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PlayerSeatProps {
  player?: PokerPlayerInfo | null;
  seatIndex: number;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isCurrentUser: boolean;
  myHoleCards: string[];
}

export function PlayerSeat({
  player,
  seatIndex,
  isCurrentTurn,
  isDealer,
  isCurrentUser,
  myHoleCards,
}: PlayerSeatProps) {
  if (!player) {
    return (
      <div className={`poker-seat seat-${seatIndex} empty`}>
        <div className="empty-seat-pill">Empty</div>
      </div>
    );
  }

  const cardsToDisplay = isCurrentUser && myHoleCards.length === 2
    ? myHoleCards
    : player.hole_cards || [];

  return (
    <div className={`poker-seat seat-${seatIndex} ${isCurrentTurn ? 'active-turn' : ''} ${player.is_folded ? 'folded' : ''}`}>
      {/* Dealer Button Badge */}
      {isDealer && <div className="dealer-button">D</div>}

      {/* Cards Area */}
      <div className="player-cards-container">
        {player.is_folded ? (
          <div className="folded-label">FOLDED</div>
        ) : cardsToDisplay.length > 0 ? (
          <>
            <PokerCard card={cardsToDisplay[0]} size="sm" className="card-left" />
            <PokerCard card={cardsToDisplay[1]} size="sm" className="card-right" />
          </>
        ) : (
          <>
            <PokerCard card={null} size="sm" className="card-left" />
            <PokerCard card={null} size="sm" className="card-right" />
          </>
        )}
      </div>

      {/* Seat Avatar & Details Box */}
      <div className={`player-info-box ${isCurrentTurn ? 'ring-2 ring-amber-400' : ''}`}>
        <div className="player-avatar">
          {player.username.charAt(0).toUpperCase()}
        </div>
        <div className="player-details">
          <div className="player-name truncate">{player.username} {isCurrentUser && '(You)'}</div>
          <div className="player-stack">₹{(player.stack / 100).toFixed(2)}</div>
        </div>
      </div>

      {/* Last Action Badge */}
      {player.last_action && (
        <div className={`action-badge action-${player.last_action.toLowerCase()}`}>
          {player.last_action}
        </div>
      )}

      {/* Current Bet Chips */}
      {player.current_bet > 0 && (
        <div className="player-bet-chips">
          <span className="chip-icon">🟡</span>
          <span>₹{(player.current_bet / 100).toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
