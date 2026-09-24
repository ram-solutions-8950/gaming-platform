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
}

const TurnRing: React.FC<{ seconds: number; total: number; size: number }> = ({ seconds, total, size }) => {
  const stroke = 3;
  const radius = size / 2 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const urgent = seconds <= 5;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: 'absolute',
        inset: -4,
        width: size + 8,
        height: size + 8,
        transform: 'rotate(-90deg)',
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.15)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={urgent ? '#ef4444' : '#ffd700'}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        style={{
          transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease',
          filter: urgent ? 'drop-shadow(0 0 6px #ef4444)' : 'drop-shadow(0 0 6px #ffd700)',
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

  // Determine relative seat positioning class
  let posClass = 'tp-seat-bottom';
  if (totalSeats === 2) {
    posClass = isViewer ? 'tp-seat-bottom' : 'tp-seat-top';
  } else if (totalSeats === 4) {
    if (seatIndex === 0) posClass = 'tp-seat-bottom';
    else if (seatIndex === 1) posClass = 'tp-seat-left';
    else if (seatIndex === 2) posClass = 'tp-seat-top';
    else posClass = 'tp-seat-right';
  } else {
    // Fallback for up to 6 seats
    const classes = ['tp-seat-bottom', 'tp-seat-bottom-left', 'tp-seat-top-left', 'tp-seat-top', 'tp-seat-top-right', 'tp-seat-bottom-right'];
    posClass = classes[seatIndex % classes.length];
  }

  const isPacked = seat.status === 'packed' || seat.status === 'lost_side_show';
  const isWinner = seat.status === 'show_winner';
  const canTapToSee = isViewer && !seat.seen && seat.status === 'active' && Boolean(onSee);

  return (
    <div className={`tp-seat ${posClass} ${isCurrentTurn ? 'tp-seat-active' : ''} ${isPacked ? 'tp-seat-packed' : ''}`}>
      <div className="tp-avatar-wrapper">
        {isCurrentTurn && seat.status === 'active' && (
          <TurnRing seconds={timeLeft} total={turnSeconds} size={60} />
        )}
        {seat.name.charAt(0).toUpperCase()}
        {isDealer && (
          <span style={{
            position: 'absolute', bottom: -5, right: -5, background: '#d4af37', color: '#111',
            borderRadius: '50%', width: 20, height: 20, fontSize: '0.65rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fff', zIndex: 10
          }}>
            D
          </span>
        )}
      </div>

      <div className="tp-seat-name">{seat.name}</div>

      <div className="flex items-center gap-1">
        {seat.status === 'active' ? (
          <span className={`tp-seat-status-badge ${seat.seen ? 'tp-badge-seen' : 'tp-badge-blind'}`}>
            {seat.seen ? 'Seen' : 'Blind'}
          </span>
        ) : isWinner ? (
          <span className="tp-seat-status-badge tp-badge-won flex items-center gap-1">
            <Crown size={10} className="text-white fill-white shrink-0" />
            <span>Winner</span>
          </span>
        ) : seat.status === 'show_loser' ? (
          <span className="tp-seat-status-badge tp-badge-packed">Lost</span>
        ) : (
          <span className="tp-seat-status-badge tp-badge-packed">Packed</span>
        )}
      </div>

      {seat.total_bet > 0 && (
        <span style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 700 }}>
          Bet: ₹{(seat.total_bet / 100).toFixed(0)}
        </span>
      )}

      {seat.card_count > 0 && (
        <div
          className={`tp-card-fan ${canTapToSee ? 'tp-card-fan-interactive' : ''} ${isWinner && seat.cards ? 'tp-card-fan-winner' : ''}`}
          onClick={canTapToSee ? onSee : undefined}
          role={canTapToSee ? 'button' : undefined}
          tabIndex={canTapToSee ? 0 : undefined}
          title={canTapToSee ? 'Click or tap to view your cards' : undefined}
        >
          {canTapToSee && (
            <div className="tp-tap-see-pill animate-bounce">
              <Eye size={11} />
              <span>Tap to See</span>
            </div>
          )}
          {seat.cards ? (
            seat.cards.map((c, i) => <PlayingCard key={i} cardCode={c} />)
          ) : (
            <>
              <PlayingCard hidden />
              <PlayingCard hidden />
              <PlayingCard hidden />
            </>
          )}
        </div>
      )}
    </div>
  );
};
