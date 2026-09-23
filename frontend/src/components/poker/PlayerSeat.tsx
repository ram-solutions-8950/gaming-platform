import { PokerCard } from './PokerCard';
import type { PokerPlayerInfo } from '../../hooks/usePokerSocket';

interface PlayerSeatProps {
  player?: PokerPlayerInfo | null;
  /** Position around the felt as the viewer sees it — 0 is always the viewer. */
  screenPos: number;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isCurrentUser: boolean;
  myHoleCards: string[];
}

const ACTION_LABELS: Record<string, string> = {
  FOLD: 'Fold',
  CHECK: 'Check',
  CALL: 'Call',
  RAISE: 'Raise',
  BET: 'Bet',
  ALL_IN: 'All in',
  SMALL_BLIND: 'Small blind',
  BIG_BLIND: 'Big blind',
};

function formatMoney(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function PlayerSeat({
  player,
  screenPos,
  isCurrentTurn,
  isDealer,
  isCurrentUser,
  myHoleCards,
}: PlayerSeatProps) {
  if (!player) {
    return (
      <div className={`poker-seat pos-${screenPos} is-open`}>
        <span className="seat-open">Open seat</span>
      </div>
    );
  }

  const cards = isCurrentUser && myHoleCards.length === 2 ? myHoleCards : player.hole_cards || [];
  const action = player.last_action ? ACTION_LABELS[player.last_action.toUpperCase()] ?? player.last_action : null;

  const stateClasses = [
    isCurrentTurn && !player.is_folded ? 'is-turn' : '',
    player.is_folded ? 'is-folded' : '',
    player.is_all_in ? 'is-all-in' : '',
    isCurrentUser ? 'is-you' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`poker-seat pos-${screenPos} ${stateClasses}`}>
      <div className="seat-cards">
        {player.is_folded ? (
          <span className="seat-folded">Folded</span>
        ) : (
          <>
            <PokerCard card={cards[0] ?? null} size="sm" className="seat-card seat-card-left" />
            <PokerCard card={cards[1] ?? null} size="sm" className="seat-card seat-card-right" />
          </>
        )}
      </div>

      <div className="seat-pod">
        <span className="seat-avatar" aria-hidden="true">
          {player.username.charAt(0).toUpperCase()}
        </span>
        <span className="seat-text">
          <span className="seat-name">{isCurrentUser ? 'You' : player.username}</span>
          <span className="seat-stack">{player.is_all_in ? 'All in' : formatMoney(player.stack)}</span>
        </span>
        {isDealer && (
          <span className="seat-dealer" title="Dealer">
            D
          </span>
        )}
      </div>

      {action && !player.is_folded && (
        <span className={`seat-action seat-action-${(player.last_action || '').toLowerCase().replace(/[^a-z0-9]/g, '_')}`}>
          {action}
        </span>
      )}

      {player.current_bet > 0 && (
        <span className="seat-bet" title="Bet this street">
          {formatMoney(player.current_bet)}
        </span>
      )}
    </div>
  );
}
