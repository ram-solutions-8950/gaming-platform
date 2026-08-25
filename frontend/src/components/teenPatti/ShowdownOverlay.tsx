import React from 'react';
import type { TeenPattiSeat } from '../../services/teenPatti';
import { PlayingCard } from './PlayingCard';

interface ShowdownOverlayProps {
  winnerSeat: number | null;
  reason: string | null;
  seats: TeenPattiSeat[];
  potAmount: number;
}

export const ShowdownOverlay: React.FC<ShowdownOverlayProps> = ({
  winnerSeat,
  reason,
  seats,
  potAmount,
}) => {
  const winner = winnerSeat !== null ? seats[winnerSeat] : null;

  return (
    <div className="tp-modal-overlay">
      <div className="tp-modal-box" style={{ maxWidth: 460 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#ffd700', textTransform: 'uppercase' }}>
          🏆 Winner: {winner ? winner.name : 'Split'}
        </h2>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#22c55e', margin: '0.25rem 0' }}>
          +₹{(potAmount / 100).toFixed(0)}
        </div>
        {reason && (
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>
            {reason}
          </p>
        )}

        {winner && winner.cards && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '1rem 0' }}>
            {winner.cards.map((c, i) => (
              <PlayingCard key={i} cardCode={c} />
            ))}
          </div>
        )}

        <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          Next hand starts shortly...
        </div>
      </div>
    </div>
  );
};
