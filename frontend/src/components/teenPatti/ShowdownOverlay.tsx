import React, { useEffect, useState } from 'react';
import type { TeenPattiSeat } from '../../services/teenPatti';
import { PlayingCard } from './PlayingCard';
import { LogOut, Play, X } from 'lucide-react';

interface ShowdownOverlayProps {
  winnerSeat: number | null;
  reason: string | null;
  seats: TeenPattiSeat[];
  potAmount: number;
  currentUserId?: string | null;
  onLeaveTable?: () => void;
  onNextHand?: () => void;
  onDismiss?: () => void;
}

export const ShowdownOverlay: React.FC<ShowdownOverlayProps> = ({
  winnerSeat,
  reason,
  seats,
  potAmount,
  currentUserId,
  onLeaveTable,
  onNextHand,
  onDismiss,
}) => {
  const [countdown, setCountdown] = useState<number>(5);
  const winner = winnerSeat !== null ? seats[winnerSeat] : null;
  const mySeat = seats.find((s) => s.id === currentUserId);
  const isMeWinner = winner && winner.id === currentUserId;
  const myBet = mySeat?.total_bet || 0;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onNextHand?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onNextHand]);

  return (
    <div className="tp-modal-overlay animate-fade-in" style={{ zIndex: 120 }}>
      <div className="tp-modal-box relative" style={{ maxWidth: 440, padding: '24px 20px', textAlign: 'center' }}>
        {/* Dismiss / Close Button */}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-3 right-3 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-full p-1.5 transition"
            title="View Table"
          >
            <X size={16} />
          </button>
        )}

        {/* Winner Title */}
        <h2 style={{ fontSize: '1.45rem', fontWeight: 900, color: isMeWinner ? '#4ade80' : '#ffd700', textTransform: 'uppercase', margin: '0 0 6px' }}>
          {isMeWinner ? '🎉 YOU WON!' : `🏆 Winner: ${winner ? winner.name : 'Split'}`}
        </h2>

        {/* Total Pot */}
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#22c55e', margin: '0 0 8px' }}>
          +₹{(potAmount / 100).toFixed(0)}
        </div>

        {/* Explicit Bet & Win Display */}
        {mySeat && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(15, 23, 42, 0.75)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              padding: '6px 14px',
              margin: '0 auto 12px',
              width: 'fit-content',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}
          >
            <span style={{ color: '#94a3b8' }}>
              Your Bet: <span style={{ color: '#ffd700' }}>₹{(myBet / 100).toFixed(0)}</span>
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
            <span style={{ color: isMeWinner ? '#4ade80' : '#f87171' }}>
              {isMeWinner ? `Win: +₹${(potAmount / 100).toFixed(0)}` : `Lost: -₹${(myBet / 100).toFixed(0)}`}
            </span>
          </div>
        )}

        {reason && (
          <p style={{ color: '#94a3b8', fontSize: '0.82rem', margin: '0 0 12px' }}>
            {reason}
          </p>
        )}

        {/* Winning Cards */}
        {winner && winner.cards && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '10px 0 16px' }}>
            {winner.cards.map((c, i) => (
              <PlayingCard key={i} cardCode={c} />
            ))}
          </div>
        )}

        {/* Countdown Indicator */}
        <div style={{ color: '#fbbf24', fontSize: '0.8rem', fontWeight: 700, margin: '8px 0 16px' }}>
          ⏱ Next hand dealing automatically in {countdown}s...
        </div>

        {/* Action Buttons: Leave Table or Deal Now */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 4 }}>
          {onLeaveTable && (
            <button
              type="button"
              onClick={onLeaveTable}
              className="tp-btn"
              style={{
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                padding: '9px 18px',
                borderRadius: 12,
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <LogOut size={15} />
              <span>Leave Table</span>
            </button>
          )}

          {onNextHand && (
            <button
              type="button"
              onClick={onNextHand}
              className="tp-btn tp-btn-chaal"
              style={{
                minWidth: 140,
                padding: '9px 20px',
                fontSize: '0.85rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <Play size={15} fill="currentColor" />
              <span>Deal Hand Now</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
