import React, { useEffect, useState } from 'react';
import type { TeenPattiSeat } from '../../services/teenPatti';
import { PlayingCard } from './PlayingCard';
import { LogOut, Play, X, Crown } from 'lucide-react';

// Mirrors _NEXT_HAND_DELAY_SECONDS in teen_patti_ws.py: the server deals the
// next hand by itself once the result has been up this long.
const NEXT_HAND_DELAY_SECONDS = 5;

interface ShowdownOverlayProps {
  winnerSeat: number | null;
  reason: string | null;
  seats: TeenPattiSeat[];
  potAmount: number;
  currentUserId?: string | null;
  onLeaveTable?: () => void;
  onNextHand?: () => void;
  onDismiss?: () => void;
  isTableClosed?: boolean;
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
  isTableClosed,
}) => {
  const [countdown, setCountdown] = useState<number>(NEXT_HAND_DELAY_SECONDS);
  const winner = winnerSeat !== null ? seats[winnerSeat] : null;
  const mySeat = seats.find((s) => s.id === currentUserId);
  const isMeWinner = Boolean(winner && winner.id === currentUserId);
  const isDoubleLoss = winnerSeat === null;
  const myBet = mySeat?.total_bet || 0;

  const isOpponentLeft = Boolean(
    isTableClosed ||
    (reason && reason.toLowerCase().includes('left')) ||
    seats.length < 2
  );

  // Auto-countdown to exit to lobby if opponent left, or deal next hand if normal game
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (isOpponentLeft) {
            onLeaveTable?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpponentLeft, onLeaveTable]);

  return (
    <div className="tp-modal-overlay animate-fade-in" style={{ zIndex: 120 }}>
      <div className="tp-modal-box tp-result-box relative">
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

        {/* Win / Loss Outcome Title */}
        {isDoubleLoss ? (
          <h2 className="tp-result-title" style={{ color: '#ef4444' }}>
            ❌ BOTH PLAYERS LOST
          </h2>
        ) : isMeWinner ? (
          <h2 className="tp-result-title" style={{ color: '#4ade80' }}>
            🎉 YOU WON!
          </h2>
        ) : (
          <h2 className="tp-result-title" style={{ color: '#ef4444' }}>
            ❌ YOU LOST
          </h2>
        )}

        {/* Net Amount Result: Positive for winner, Negative for loser */}
        <div className="tp-result-amount" style={{ color: isMeWinner ? '#22c55e' : '#f87171' }}>
          {isMeWinner ? `+₹${(potAmount / 100).toFixed(0)}` : `-₹${(myBet / 100).toFixed(0)}`}
        </div>

        {/* Explicit Bet & Result Details */}
        <div className="tp-result-bet">
          {mySeat && (
            <span style={{ color: '#94a3b8' }}>
              Your Bet: <span style={{ color: '#ffd700' }}>₹{(myBet / 100).toFixed(0)}</span>
            </span>
          )}
          {winner && !isMeWinner && (
            <>
              <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>•</span>
              <span style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                Winner: <Crown size={12} className="text-amber-400 fill-amber-400 shrink-0" /> {winner.name}
              </span>
            </>
          )}
        </div>

        {reason && (
          <p className="tp-result-reason">
            {reason}
          </p>
        )}

        {/* Winning Cards */}
        {winner && winner.cards && (
          <div className="tp-result-cards">
            {winner.cards.map((c, i) => (
              <PlayingCard key={i} cardCode={c} />
            ))}
          </div>
        )}

        {/* Countdown Indicator */}
        {isOpponentLeft ? (
          <div className="tp-result-countdown">
            {countdown > 0
              ? `⏳ Opponent left the match. Returning to lobby in ${countdown}s...`
              : 'Returning to lobby...'}
          </div>
        ) : (
          <div className="tp-result-countdown">
            {countdown > 0 ? `⏱ Next hand dealing automatically in ${countdown}s...` : '⏱ Dealing next hand...'}
          </div>
        )}

        {/* Action Buttons: Leave Table or Deal Now */}
        <div className="tp-result-actions">
          {onLeaveTable && (
            <button
              type="button"
              onClick={onLeaveTable}
              className={`tp-btn tp-result-btn ${isOpponentLeft ? 'tp-btn-chaal' : 'tp-result-btn-leave'}`}
            >
              <LogOut size={15} />
              <span>{isOpponentLeft ? 'Back to Lobby' : 'Leave Table'}</span>
            </button>
          )}

          {!isOpponentLeft && onNextHand && seats.length >= 2 && (
            <button
              type="button"
              onClick={onNextHand}
              className="tp-btn tp-btn-chaal tp-result-btn"
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
