import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTeenPattiSocket } from '../../hooks/useTeenPattiSocket';
import { PlayerSeat } from './PlayerSeat';
import { BettingControls } from './BettingControls';
import { SideShowDialog } from './SideShowDialog';
import { ShowdownOverlay } from './ShowdownOverlay';
import { soundManager } from '../../services/soundManager';
import { walletService } from '../../services/wallet';
import { GameRulesModal } from '../common/GameRulesModal';
import { TEEN_PATTI_RULES_DATA } from '../common/gameRulesData';
import { HelpCircle, Crown, Plus } from 'lucide-react';
import './TeenPattiTable.css';

interface TeenPattiTableProps {
  tableId: string;
  onLeaveTable: () => void;
}

export const TeenPattiTable: React.FC<TeenPattiTableProps> = ({
  tableId,
  onLeaveTable,
}) => {
  const navigate = useNavigate();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showdownDismissed, setShowdownDismissed] = useState<boolean>(false);

  const refreshWallet = useCallback(() => {
    walletService.getWallet().then((w) => setWalletBalance(w.balance || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);
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

  // Audio effects & phase change reactions
  const lastPhaseRef = useRef<string>('');
  const lastBetRef = useRef<number>(0);
  const lastSeenRef = useRef<boolean>(false);
  const lastWinnerSeatRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gameState || !currentUserId) return;

    // Betting start / stop & initial card deal
    if (gameState.phase !== lastPhaseRef.current) {
      const p = gameState.phase;
      if (p === 'boot' || p === 'playing' || p === 'waiting') {
        setShowdownDismissed(false);
        soundManager.play('betting_start');
        soundManager.play('card_deal');
      } else if (p === 'showdown' || p === 'finished') {
        soundManager.play('betting_stop');
        refreshWallet();
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
      {/* Top Navigation & Status Bar — placed outside oval felt to prevent overlapping player */}
      <div className="tp-top-header-bar">
        {/* Left: Lobby Exit + Live Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onLeaveTable}
            className="tp-header-btn"
          >
            ← Lobby
          </button>
          <div className="tp-status-pill">
            <span className={`tp-status-dot ${isConnected ? 'live' : 'offline'}`} />
            <span>{isConnected ? 'LIVE TABLE' : 'RECONNECTING'}</span>
          </div>
        </div>

        {/* Center: Crown icon and game branding */}
        <div className="tp-brand-pill">
          <Crown size={15} className="text-amber-400 fill-amber-400 shrink-0" />
          <span className="font-extrabold text-xs text-amber-300 uppercase tracking-wider">Royal Teen Patti</span>
        </div>

        {/* Right: Total Balance + Add Amount (+) button + Rules Modal */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="tp-balance-pill">
            <span className="tp-balance-label">TOTAL BALANCE:</span>
            <span className="tp-balance-val">
              ₹{walletBalance !== null ? (walletBalance / 100).toFixed(2) : '...'}
            </span>
            <button
              type="button"
              onClick={() => navigate('/deposit')}
              className="tp-add-amount-btn"
              title="Add Amount / Top Up Balance"
            >
              <Plus size={11} strokeWidth={3} />
              <span>Add Amount</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="tp-header-btn tp-rules-btn"
            aria-label="Rules"
          >
            <HelpCircle size={13} />
            <span>Rules</span>
          </button>
        </div>
      </div>

      {/* Main Oval Table */}
      <div className="tp-table-oval">
        {/* In-table waiting notice when 2nd player has not yet joined */}
        {gameState.phase === 'waiting' && gameState.seats.length < 2 && (
          <div className="tp-waiting-badge">
            <span className="animate-spin text-xs">⏳</span>
            <span>Waiting for Opponent to Join (1/2)...</span>
          </div>
        )}

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
      {isShowdown && !showdownDismissed && gameState.winner_seat !== null && (
        <ShowdownOverlay
          winnerSeat={gameState.winner_seat}
          reason={gameState.reason}
          seats={gameState.seats}
          potAmount={gameState.pot}
          currentUserId={currentUserId}
          onLeaveTable={onLeaveTable}
          onNextHand={startHand}
          onDismiss={() => setShowdownDismissed(true)}
        />
      )}

      {/* Rules Modal */}
      {showRules && (
        <GameRulesModal
          title={TEEN_PATTI_RULES_DATA.title}
          subtitle={TEEN_PATTI_RULES_DATA.subtitle}
          sections={TEEN_PATTI_RULES_DATA.sections}
          payouts={TEEN_PATTI_RULES_DATA.payouts}
          tips={TEEN_PATTI_RULES_DATA.tips}
          onClose={() => setShowRules(false)}
        />
      )}
    </div>
  );
};
