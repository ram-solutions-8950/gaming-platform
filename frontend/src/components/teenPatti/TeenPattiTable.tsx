import React, { useEffect, useRef } from 'react';
import { useTeenPattiSocket } from '../../hooks/useTeenPattiSocket';
import { PlayerSeat } from './PlayerSeat';
import { BettingControls } from './BettingControls';
import { SideShowDialog } from './SideShowDialog';
import { ShowdownOverlay } from './ShowdownOverlay';
import { soundManager } from '../../services/soundManager';
import './TeenPattiTable.css';

interface TeenPattiTableProps {
  tableId: string;
  onLeaveTable: () => void;
}

export const TeenPattiTable: React.FC<TeenPattiTableProps> = ({
  tableId,
  onLeaveTable,
}) => {
  const {
    gameState,
    isConnected,
    pendingSideShow,
    currentUserId,
    seeCards,
    chaal,
    raiseBet,
    pack,
    show,
    sideShow,
    respondSideShow,
    startHand,
    errorMessage,
  } = useTeenPattiSocket({ tableId });

  const lastPhaseRef = useRef<string | null>(null);
  const lastBetRef = useRef<number>(0);
  const lastSeenRef = useRef<boolean>(false);
  const lastWinnerSeatRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameState || !currentUserId) return;

    // Betting start / stop & initial card deal
    if (gameState.phase !== lastPhaseRef.current) {
      const p = gameState.phase;
      if (p === 'boot' || p === 'playing') {
        soundManager.play('betting_start');
        soundManager.play('card_deal');
      } else if (p === 'showdown' || p === 'finished') {
        soundManager.play('betting_stop');
      }
      lastPhaseRef.current = p;
    }

    // Card reveal (when viewer sees their cards)
    const mySeat = gameState.seats?.find((s) => s.id === currentUserId);
    const mySeen = mySeat?.seen || false;
    if (mySeen && !lastSeenRef.current) {
      soundManager.play('card_deal');
    }
    lastSeenRef.current = mySeen;

    // Bet confirmed (viewer's total_bet increases)
    const myBet = mySeat?.total_bet || 0;
    if (myBet > lastBetRef.current) {
      soundManager.play('bet_coin');
    }
    lastBetRef.current = myBet;

    // Showdown win/loss
    if (gameState.winner_seat !== null && gameState.winner_seat !== lastWinnerSeatRef.current) {
      const winner = gameState.seats[gameState.winner_seat];
      if (winner && winner.id === currentUserId) {
        soundManager.play('win_clap');
      } else {
        soundManager.play('loss');
      }
      lastWinnerSeatRef.current = gameState.winner_seat;
    } else if (gameState.winner_seat === null) {
      lastWinnerSeatRef.current = null;
    }
  }, [gameState, currentUserId]);

  if (!gameState) {
    return (
      <div className="tp-arena-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {errorMessage ? (
          <>
            <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 700, textAlign: 'center', maxWidth: 400 }}>
              {errorMessage}
            </div>
            <button
              onClick={onLeaveTable}
              className="tp-btn tp-btn-chaal"
              style={{ padding: '8px 24px', fontSize: '0.9rem' }}
            >
              Back to Lobby
            </button>
          </>
        ) : (
          <div style={{ color: '#94a3b8', fontSize: '1.1rem', fontWeight: 600 }}>
            {isConnected ? 'Syncing Table State...' : 'Connecting to Table...'}
          </div>
        )}
      </div>
    );
  }

  const isShowdown = gameState.phase === 'showdown' || gameState.phase === 'finished';
  const isTargetOfSideShow = pendingSideShow && pendingSideShow.target === currentUserId;
  const requesterSeat = pendingSideShow ? gameState.seats.find((s) => s.id === pendingSideShow.requester) : null;

  return (
    <div className="tp-arena-container">
      {/* Main Oval Table */}
      <div className="tp-table-oval">
        {/* Top Header Bar — inside the table so it stays within bounds */}
        <div style={{
          position: 'absolute', top: 10, left: 14, right: 14, display: 'flex',
          justifyContent: 'space-between', alignItems: 'center', zIndex: 50
        }}>
          <button
            onClick={onLeaveTable}
            className="tp-header-btn"
            style={{
              background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', padding: '4px 10px', borderRadius: 10, fontWeight: 700,
              cursor: 'pointer', fontSize: '0.75rem'
            }}
          >
            ← Lobby
          </button>

          <div style={{
            background: 'rgba(15, 23, 42, 0.85)', padding: '3px 10px', borderRadius: 16,
            border: '1px solid rgba(212, 175, 55, 0.3)', display: 'flex', gap: '6px', alignItems: 'center'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e2e8f0' }}>
              {isConnected ? 'LIVE TABLE' : 'RECONNECTING'}
            </span>
          </div>
        </div>

        {/* Pot in center */}
        <div className="tp-center-pot">
          <span className="tp-pot-label">Main Pot</span>
          <span className="tp-pot-amount">₹{(gameState.pot / 100).toFixed(0)}</span>
          <span className="tp-stake-info">Current Stake: ₹{(gameState.current_stake / 100).toFixed(0)}</span>
        </div>

        {/* Player Seats */}
        {gameState.seats.map((seat, idx) => (
          <PlayerSeat
            key={seat.id}
            seat={seat}
            seatIndex={idx}
            totalSeats={gameState.seats.length}
            isCurrentTurn={gameState.phase === 'playing' && gameState.current_turn === idx}
            isDealer={gameState.dealer_seat === idx}
            isViewer={seat.id === currentUserId}
          />
        ))}
      </div>

      {/* Action Controls */}
      <BettingControls
        gameState={gameState}
        currentUserId={currentUserId}
        onSee={seeCards}
        onChaal={chaal}
        onRaise={raiseBet}
        onPack={pack}
        onShow={show}
        onSideShow={sideShow}
        onStart={startHand}
      />

      {/* Side-Show Request Dialog */}
      {isTargetOfSideShow && (
        <SideShowDialog
          requesterName={requesterSeat ? requesterSeat.name : 'Opponent'}
          onAccept={() => respondSideShow(true)}
          onDecline={() => respondSideShow(false)}
        />
      )}

      {/* Showdown Winner Overlay */}
      {isShowdown && gameState.winner_seat !== null && (
        <ShowdownOverlay
          winnerSeat={gameState.winner_seat}
          reason={gameState.reason}
          seats={gameState.seats}
          potAmount={gameState.pot}
        />
      )}
    </div>
  );
};
