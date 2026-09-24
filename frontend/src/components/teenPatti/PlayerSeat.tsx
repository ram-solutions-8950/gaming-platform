import React, { useEffect, useState } from 'react';
import type { TeenPattiSeat } from '../../services/teenPatti';
import { PlayingCard } from './PlayingCard';
import { Crown, Eye } from 'lucide-react';

interface PlayerSeatProps {
  seat: TeenPattiSeat;
  seatIndex: number;
  totalSeats: number;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isViewer: boolean;
  turnSeconds?: number;
  onSee?: () => void;
  viewerSeatIndex?: number;
}

const TurnRing: React.FC<{ seconds: number; total: number }> = ({ seconds, total }) => {
  const stroke = 2.5;
  const radius = 22 - stroke / 2 - 0.5; // ~20.25
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const urgent = seconds <= 5;

  return (
    <svg
      viewBox="0 0 44 44"
      className="tp-turn-ring-svg"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 'calc(100% + 8px)',
        height: 'calc(100% + 8px)',
        transform: 'translate(-50%, -50%) rotate(-90deg)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <circle
        cx="22"
        cy="22"
        r={radius}
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        stroke={urgent ? '#ef4444' : '#ffd700'}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        style={{
          transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease',
          filter: urgent ? 'drop-shadow(0 0 5px #ef4444)' : 'drop-shadow(0 0 5px #ffd700)',
        }}
      />
    </svg>
  );
};

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  seat,
  seatIndex,
  totalSeats,
  isCurrentTurn,
  isDealer,
  isViewer,
  turnSeconds = 15,
  onSee,
  viewerSeatIndex,
}) => {
  const [timeLeft, setTimeLeft] = useState<number>(turnSeconds);

  useEffect(() => {
    if (!isCurrentTurn || seat.status !== 'active') {
      setTimeLeft(turnSeconds);
      return;
    }

    setTimeLeft(turnSeconds);
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const rem = Math.max(0, turnSeconds - elapsed);
      setTimeLeft(rem);
      if (rem <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isCurrentTurn, seat.status, turnSeconds]);

  // Determine relative seat positioning class so viewer is always at bottom
  const effectiveIdx = viewerSeatIndex !== undefined && viewerSeatIndex >= 0
    ? (seatIndex - viewerSeatIndex + totalSeats) % totalSeats
    : (isViewer ? 0 : seatIndex);

  let posClass = 'tp-seat-bottom';
  if (totalSeats === 2) {
    posClass = effectiveIdx === 0 ? 'tp-seat-bottom' : 'tp-seat-top';
  } else if (totalSeats === 3) {
    const classes = ['tp-seat-bottom', 'tp-seat-top-right', 'tp-seat-top-left'];
    posClass = classes[effectiveIdx % 3];
  } else if (totalSeats === 4) {
    const classes = ['tp-seat-bottom', 'tp-seat-right', 'tp-seat-top', 'tp-seat-left'];
    posClass = classes[effectiveIdx % 4];
  } else {
    // 5 or 6 seats layout
    const classes = ['tp-seat-bottom', 'tp-seat-bottom-right', 'tp-seat-top-right', 'tp-seat-top', 'tp-seat-top-left', 'tp-seat-bottom-left'];
    posClass = classes[effectiveIdx % classes.length];
  }

  const isPacked = seat.status === 'packed' || seat.status === 'lost_side_show';
  const isWinner = seat.status === 'show_winner';
  const canTapToSee = isViewer && !seat.seen && seat.status === 'active' && Boolean(onSee);

  return (
    <div className={`tp-seat ${posClass} ${isCurrentTurn ? 'tp-seat-active' : ''} ${isPacked ? 'tp-seat-packed' : ''}`}>
      <div className="tp-seat-player-row">
        <div className="tp-avatar-wrapper">
          {isCurrentTurn && seat.status === 'active' && (
            <TurnRing seconds={timeLeft} total={turnSeconds} />
          )}
          {seat.name.charAt(0).toUpperCase()}
          {isDealer && (
            <span className="tp-dealer-badge">
              D
            </span>
          )}
        </div>

        <div className="tp-seat-meta">
          <div className="tp-seat-name" title={seat.name}>{seat.name}</div>
          <div className="tp-seat-meta-sub">
            {seat.status === 'active' ? (
              <span className={`tp-seat-status-badge ${seat.seen ? 'tp-badge-seen' : 'tp-badge-blind'}`}>
                {seat.seen ? 'Seen' : 'Blind'}
              </span>
            ) : isWinner ? (
              <span className="tp-seat-status-badge tp-badge-won flex items-center gap-0.5">
                <Crown size={9} className="text-white fill-white shrink-0" />
                <span>Won</span>
              </span>
            ) : seat.status === 'show_loser' ? (
              <span className="tp-seat-status-badge tp-badge-packed">Lost</span>
            ) : (
              <span className="tp-seat-status-badge tp-badge-packed">Packed</span>
            )}

            {seat.total_bet > 0 && (
              <span className="tp-seat-bet-val">
                ₹{(seat.total_bet / 100).toFixed(0)}
              </span>
            )}
          </div>
        </div>
      </div>

      {seat.card_count > 0 && (
        <div
          className={`tp-card-fan ${canTapToSee ? 'tp-card-fan-interactive' : ''} ${isWinner && seat.cards ? 'tp-card-fan-winner' : ''}`}
          onClick={canTapToSee ? onSee : undefined}
          role={canTapToSee ? 'button' : undefined}
          tabIndex={canTapToSee ? 0 : undefined}
          title={canTapToSee ? 'Click or tap to view your cards' : undefined}
        >
          {seat.cards ? (
            seat.cards.map((c, i) => <PlayingCard key={i} cardCode={c} />)
          ) : (
            <>
              <PlayingCard hidden />
              <PlayingCard hidden />
              <PlayingCard hidden />
            </>
          )}
          {/* Keep this after the cards: the fan tilts cards by :nth-child, so
              anything placed before them shifts every card's tilt. */}
          {canTapToSee && (
            <div className="tp-tap-see-pill">
              <Eye size={10} />
              <span>Tap to See</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
