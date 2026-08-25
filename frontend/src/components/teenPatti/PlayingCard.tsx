import React from 'react';

interface PlayingCardProps {
  cardCode?: string | null;
  hidden?: boolean;
}

const SUIT_SYMBOLS: Record<string, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
};

export const PlayingCard: React.FC<PlayingCardProps> = ({ cardCode, hidden = false }) => {
  if (hidden || !cardCode) {
    return (
      <div className="tp-card tp-card-back">
        <span>🂠</span>
      </div>
    );
  }

  const rankPart = cardCode.slice(0, -1);
  const suitPart = cardCode.slice(-1);
  const isRed = suitPart === 'H' || suitPart === 'D';
  const symbol = SUIT_SYMBOLS[suitPart] || suitPart;

  return (
    <div className={`tp-card ${isRed ? 'tp-card-red' : 'tp-card-black'}`}>
      <div style={{ fontSize: '0.75rem', lineHeight: 1 }}>{rankPart}</div>
      <div style={{ fontSize: '1.1rem', textAlign: 'center', lineHeight: 1 }}>{symbol}</div>
      <div style={{ fontSize: '0.75rem', textAlign: 'right', lineHeight: 1 }}>{rankPart}</div>
    </div>
  );
};
