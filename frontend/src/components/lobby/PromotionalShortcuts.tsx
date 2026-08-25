import React from 'react';

const shortcuts = [
  { label: 'Bonus', emoji: '🎁', color: '#ff6b35' },
  { label: 'Free', emoji: '🎯', color: '#4ecdc4' },
  { label: '7-Days', emoji: '📅', color: '#a855f7' },
  { label: 'Refer\n& Win', emoji: '🤝', color: '#f59e0b' },
  { label: 'Ranking', emoji: '🏆', color: '#ef4444' },
];

export const PromotionalShortcuts: React.FC = () => {
  return (
    <div className="promo-shortcuts">
      {shortcuts.map((s) => (
        <button key={s.label} className="promo-shortcut" style={{ '--shortcut-color': s.color } as React.CSSProperties}>
          <div className="promo-shortcut__icon">{s.emoji}</div>
          <span className="promo-shortcut__label">{s.label.replace('\n', ' ')}</span>
        </button>
      ))}
    </div>
  );
};
