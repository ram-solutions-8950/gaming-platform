import { PokerCard } from './PokerCard';

interface CommunityCardsProps {
  cards: string[];
  phase: string;
}

export function CommunityCards({ cards, phase }: CommunityCardsProps) {
  const emptySlotsCount = Math.max(0, 5 - cards.length);

  return (
    <div className="community-cards-area">
      <div className="phase-indicator">{phase}</div>
      <div className="community-cards-row">
        {cards.map((card, idx) => (
          <PokerCard key={idx} card={card} size="md" className="community-card animate-deal" />
        ))}
        {Array.from({ length: emptySlotsCount }).map((_, idx) => (
          <div key={`empty-${idx}`} className="community-card-slot" />
        ))}
      </div>
    </div>
  );
}
