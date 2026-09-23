import { PokerCard } from './PokerCard';
import { PotDisplay } from './PotDisplay';

interface CommunityCardsProps {
  cards: string[];
  phase: string;
  pot?: number;
}

// The board always holds five slots, so cards land in place instead of the row
// re-centring under the player's eye every street.
const BOARD_SLOTS = 5;

const STREET_NAMES: Record<string, string> = {
  WAITING: 'Waiting for players',
  PRE_FLOP: 'Pre-flop',
  FLOP: 'Flop',
  TURN: 'Turn',
  RIVER: 'River',
  SHOWDOWN: 'Showdown',
  SETTLEMENT: 'Showdown',
};

export function CommunityCards({ cards, phase, pot }: CommunityCardsProps) {
  const street = STREET_NAMES[phase] ?? phase;

  return (
    <div className="board">
      <div className="board-meta-row">
        <span className="board-street">{street}</span>
        {pot !== undefined && pot > 0 && <PotDisplay pot={pot} />}
      </div>
      <div className="board-row">
        {Array.from({ length: BOARD_SLOTS }).map((_, idx) =>
          cards[idx] ? (
            <PokerCard key={idx} card={cards[idx]} size="md" className="board-card" />
          ) : (
            <div key={`slot-${idx}`} className="board-slot" />
          ),
        )}
      </div>
    </div>
  );
}
