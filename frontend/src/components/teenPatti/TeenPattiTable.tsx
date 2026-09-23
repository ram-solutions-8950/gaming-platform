import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTeenPattiSocket } from '../../hooks/useTeenPattiSocket';
import { PlayerSeat } from './PlayerSeat';
import { BettingControls } from './BettingControls';
import { SideShowDialog } from './SideShowDialog';
import { ShowdownOverlay } from './ShowdownOverlay';
import { soundManager } from '../../services/soundManager';
import { walletService } from '../../services/wallet';
import { GameRulesModal } from '../common/GameRulesModal';
import { TEEN_PATTI_RULES_DATA } from '../common/gameRulesData';
import { HelpCircle, Crown, LogOut } from 'lucide-react';
import './TeenPattiTable.css';

interface TeenPattiTableProps {
  tableId: string;
  onLeaveTable: () => void;
}

export const TeenPattiTable: React.FC<TeenPattiTableProps> = ({
  tableId,
  onLeaveTable,
}) => {
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [showdownDismissed, setShowdownDismissed] = useState<boolean>(false);
  const [showLobbyConfirm, setShowLobbyConfirm] = useState<boolean>(false);

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
    leaveTable,
    syncState,
    errorMessage,
  } = useTeenPattiSocket({ tableId });

  const handleLeave = useCallback(() => {
    try {
      leaveTable();
    } catch (e) {}
    onLeaveTable();
  }, [leaveTable, onLeaveTable]);

  const handleDealHandNow = useCallback(() => {
    setShowdownDismissed(true);
    startHand();
  }, [startHand]);

  const handleLeaveImmediately = useCallback(() => {
    setShowdownDismissed(true);
    handleLeave();
  }, [handleLeave]);

  // Ensure table departure on component unmount
  useEffect(() => {
    return () => {
      try {
        leaveTable();
      } catch (e) {}
    };
  }, [leaveTable]);

  // Intercept Android hardware back button to show exit confirmation
  useEffect(() => {
    (window as any).__gameSpecificBackPressed = () => {
      setShowLobbyConfirm(true);
      return true;
    };
    return () => {
      if ((window as any).__gameSpecificBackPressed) {
        (window as any).__gameSpecificBackPressed = null;
      }
    };
  }, []);

  // Audio effects & phase change reactions
  const lastPhaseRef = useRef<string>('');
  const lastBetRef = useRef<number>(0);
  const lastSeenRef = useRef<boolean>(false);
  const lastWinnerSeatRef = useRef<number | null>(null);

  // Backgrounding & Disconnection recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncState();
        refreshWallet();
      }
    };
    const handleOnline = () => {
      syncState();
      refreshWallet();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [syncState, refreshWallet]);

  // Chip movement animation & pot bump
  const [chipsFlying, setChipsFlying] = useState<Array<{ id: number; fromSeat: number }>>([]);
  const [potBump, setPotBump] = useState<boolean>(false);
  const lastPotRef = useRef<number>(0);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.pot > lastPotRef.current && lastPotRef.current > 0) {
      setPotBump(true);
      const actingSeat = gameState.last_action?.seat ?? (gameState.current_turn > 0 ? gameState.current_turn - 1 : 0);
      const chipId = Date.now();
      setChipsFlying((prev) => [...prev, { id: chipId, fromSeat: actingSeat }]);
      const t1 = setTimeout(() => setPotBump(false), 500);
      const t2 = setTimeout(() => {
        setChipsFlying((prev) => prev.filter((c) => c.id !== chipId));
      }, 750);
      lastPotRef.current = gameState.pot;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    lastPotRef.current = gameState.pot;
  }, [gameState?.pot, gameState?.last_action]);

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

  // Derive top action banner text
  const actionBannerText = (() => {
    if (pendingSideShow) {
      const isMe = pendingSideShow.requester === currentUserId;
      return isMe ? 'You requested a Side Show' : `${requesterSeat?.name || 'Opponent'} requested a Side Show`;
    }
    if (gameState.phase === 'showdown') {
      return gameState.reason || 'Showdown! Comparing hands...';
    }
    if (gameState.phase === 'finished') {
      return gameState.reason || 'Round finished';
    }
    const last = gameState.last_action;
    if (!last) {
      if (gameState.phase === 'playing') {
        const activeSeat = gameState.seats[gameState.current_turn];
        const isMyTurn = activeSeat?.id === currentUserId;
        return isMyTurn ? "It's your turn to bet!" : `${activeSeat?.name || 'Player'}'s turn to play`;
      }
      return 'Waiting for round to begin...';
    }
    const isMe = last.user_id === currentUserId;
    const name = isMe ? 'You' : (last.player_name || gameState.seats[last.seat]?.name || 'Player');
    const amountStr = last.amount ? `₹${(last.amount / 100).toFixed(0)}` : '';
    if (last.action === 'pack') {
      return isMe ? 'You packed (folded)' : `${name} packed (folded)`;
    }
    if (last.action === 'raise') {
      return isMe ? `You raised the stake to ${amountStr}` : `${name} raised the stake to ${amountStr}`;
    }
    if (last.action === 'chaal' || last.action === 'blind') {
      if (!last.seen) {
        return isMe ? `You placed a Blind bet of ${amountStr}` : `${name} placed a Blind bet of ${amountStr}`;
      }
      return isMe ? `You called a Chaal of ${amountStr}` : `${name} called a Chaal of ${amountStr}`;
    }
    if (last.action === 'side_show_declined') {
      return isMe ? 'Side show was declined' : `${name} declined the side show`;
    }
    return `${name} took action`;
  })();

  return (
    <div className="tp-arena-container">
      {/* Top Navigation & Status Bar — placed outside oval felt to prevent overlapping player */}
      <div className="tp-top-header-bar">
        {/* Left: Lobby Exit + Live Status */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowLobbyConfirm(true)}
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

      {/* Live Action Notification Banner */}
      <div className="tp-action-banner-row">
        <div className="tp-action-banner">
          <span className="tp-action-dot" />
          <span className="tp-action-text">{actionBannerText}</span>
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
        <div className={`tp-center-pot ${potBump ? 'tp-pot-bump' : ''}`}>
          <span className="tp-pot-label">Main Pot</span>
          <span className="tp-pot-amount">₹{(gameState.pot / 100).toFixed(0)}</span>
          <span className="tp-stake-info">Current Stake: ₹{(gameState.current_stake / 100).toFixed(0)}</span>
          {chipsFlying.map((c) => (
            <div key={c.id} className={`tp-flying-chip tp-flying-chip-${c.fromSeat}`}>
              🪙
            </div>
          ))}
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
            turnSeconds={15}
            onSee={seeCards}
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
          onLeaveTable={handleLeaveImmediately}
          onNextHand={handleDealHandNow}
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

      {/* Lobby Exit Confirmation Modal (BUG-016) */}
      {showLobbyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-amber-500/40 p-6 shadow-2xl text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <LogOut size={24} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Exit to Lobby?</h3>
            <p className="text-sm text-slate-300 mb-6">
              Are you sure you want to leave this table and return to the Teen Patti lobby?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowLobbyConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:scale-95 transition border border-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLobbyConfirm(false);
                  handleLeaveImmediately();
                }}
                className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 shadow-lg shadow-red-900/30 transition cursor-pointer"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
