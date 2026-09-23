interface PokerCardProps {
  card?: string | null;  // e.g. "AH", "10D", "2S" or null / "??" for face-down
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SUIT_ICONS: Record<string, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

// Four-colour deck: at the size a phone shows hole cards, colour separates the
// suits faster than the pip shape does.
const SUIT_CLASSES: Record<string, string> = {
  S: 'suit-spade',
  H: 'suit-heart',
  D: 'suit-diamond',
  C: 'suit-club',
};

export function PokerCard({ card, className = '', size = 'md' }: PokerCardProps) {
  if (!card || card === '??') {
    return (
      <div className={`poker-card poker-card-back ${size} ${className}`}>
        <div className="card-pattern" />
      </div>
    );
  }

  const suit = card.slice(-1).toUpperCase();
  const rank = card.slice(0, -1);
  const icon = SUIT_ICONS[suit] || '';
  const suitClass = SUIT_CLASSES[suit] || 'suit-spade';

  return (
    <div className={`poker-card poker-card-front ${size} ${suitClass} ${className}`}>
      <span className="card-rank">{rank}</span>
      <span className="card-pip">{icon}</span>
    </div>
  );
}
