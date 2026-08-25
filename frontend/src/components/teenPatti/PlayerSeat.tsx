import React from 'react';
import type { TeenPattiSeat } from '../../services/teenPatti';
import { PlayingCard } from './PlayingCard';

interface PlayerSeatProps {
  seat: TeenPattiSeat;
  seatIndex: number;
  totalSeats: number;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isViewer: boolean;
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  seat,
  seatIndex,
  totalSeats,
  isCurrentTurn,
  isDealer,
  isViewer,
}) => {
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

  return (
    <div className={`tp-seat ${posClass} ${isCurrentTurn ? 'tp-seat-active' : ''} ${isPacked ? 'tp-seat-packed' : ''}`}>
      <div className="tp-avatar-wrapper">
        {seat.name.charAt(0).toUpperCase()}
        {isDealer && (
          <span style={{
            position: 'absolute', bottom: -5, right: -5, background: '#d4af37', color: '#111',
            borderRadius: '50%', width: 20, height: 20, fontSize: '0.65rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fff'
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
          <span className="tp-seat-status-badge tp-badge-won">Winner</span>
        ) : (
          <span className="tp-seat-status-badge tp-badge-packed">Packed</span>
        )}
      </div>

      {seat.total_bet > 0 && (
        <span style={{ fontSize: '0.75rem', color: '#ffd700', fontWeight: 700 }}>
          ₹{(seat.total_bet / 100).toFixed(0)}
        </span>
      )}

      {seat.card_count > 0 && (
        <div className="tp-card-fan">
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
