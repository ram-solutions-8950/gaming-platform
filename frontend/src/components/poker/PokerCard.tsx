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

const SUIT_COLORS: Record<string, string> = {
  S: 'text-gray-900',
  H: 'text-red-600',
  D: 'text-blue-600',
  C: 'text-emerald-700',
};

export function PokerCard({ card, className = '', size = 'md' }: PokerCardProps) {
  if (!card || card === '??') {
    // Face-down card back
    return (
      <div className={`poker-card poker-card-back ${size} ${className}`}>
        <div className="card-pattern" />
      </div>
    );
  }

  const suit = card.slice(-1).toUpperCase();
  const rank = card.slice(0, -1);
  const icon = SUIT_ICONS[suit] || '';
  const colorClass = SUIT_COLORS[suit] || 'text-gray-900';

  return (
    <div className={`poker-card poker-card-front ${size} ${className}`}>
      <div className={`card-corner top-left ${colorClass}`}>
        <span className="card-rank">{rank}</span>
        <span className="card-suit">{icon}</span>
      </div>
      <div className={`card-center-icon ${colorClass}`}>{icon}</div>
      <div className={`card-corner bottom-right ${colorClass}`}>
        <span className="card-rank">{rank}</span>
        <span className="card-suit">{icon}</span>
      </div>
    </div>
  );
}
