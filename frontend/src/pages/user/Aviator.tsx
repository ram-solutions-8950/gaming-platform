import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAviatorSocket } from '../../hooks/useAviatorSocket';
import { aviatorService, type AviatorBetHistoryItem } from '../../services/aviator';
import { walletService } from '../../services/wallet';
import { AviatorArena } from '../../components/aviator/AviatorArena';
import { AviatorBetPanel } from '../../components/aviator/AviatorBetPanel';
import { AviatorHistory } from '../../components/aviator/AviatorHistory';
import { AviatorPlayers } from '../../components/aviator/AviatorPlayers';
import { soundManager } from '../../services/soundManager';
import '../../styles/aviator.css';

export function AviatorPage() {
  const navigate = useNavigate();
  const [walletBalancePaise, setWalletBalancePaise] = useState<number>(0);
  const [myPastBets, setMyPastBets] = useState<AviatorBetHistoryItem[]>([]);
  const [recentCrashesList, setRecentCrashesList] = useState<number[]>([]);

  // Fetch current wallet balance
  const refreshWallet = useCallback(async () => {
    try {
      const w = await walletService.getWallet();
      setWalletBalancePaise(w.balance || 0);
    } catch (e) {
      console.error('Failed to fetch wallet balance', e);
    }
  }, []);

  // Fetch initial history & past bets
  const loadInitialData = useCallback(async () => {
    try {
      const [history, pastBets] = await Promise.all([
        aviatorService.getHistory(20),
        aviatorService.getMyBets(20),
      ]);
      setRecentCrashesList(
        history
          .map((h) => h.crash_multiplier)
          .filter((m): m is number => typeof m === 'number' && m > 0)
      );
      setMyPastBets(pastBets);
    } catch (e) {
      console.error('Failed to load initial Aviator data', e);
    }
  }, []);

  // Landscape orientation locking (game-specific, unlocked on unmount)
  useEffect(() => {
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch {}

    refreshWallet();
    loadInitialData();

    return () => {
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch {}
    };
  }, [refreshWallet, loadInitialData]);

  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);

  // Handle socket callbacks
  const {
    isConnected,
    isConnecting,
    connectionError,
    roundState,
    recentCrashes,
    currentUserId,
    placeBet,
    cashout,
  } = useAviatorSocket({
    onError: (err) => {
      setActionErrorMessage(err);
      setTimeout(() => setActionErrorMessage(null), 3000);
    },
    onCrash: () => {
      soundManager.play('loss');
      refreshWallet();
      aviatorService.getMyBets(20).then(setMyPastBets).catch(() => {});
    },
    onCashoutConfirmed: () => {
      soundManager.play('cashout');
      soundManager.play('win_clap');
      refreshWallet();
      aviatorService.getMyBets(20).then(setMyPastBets).catch(() => {});
    },
    onBetAccepted: () => {
      soundManager.play('bet_coin');
      refreshWallet();
    },
    onBalanceUpdateNeeded: () => {
      refreshWallet();
    },
  });

  // Track phase transitions for betting_start/betting_stop
  const lastPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (roundState.phase && roundState.phase !== lastPhaseRef.current) {
      if (roundState.phase === 'BETTING') {
        soundManager.play('betting_start');
      } else if (roundState.phase === 'FLYING') {
        soundManager.play('betting_stop');
      }
      lastPhaseRef.current = roundState.phase;
    }
  }, [roundState.phase]);

  // Combine fetched crashes with socket recent crashes
  const displayCrashes = recentCrashes.length > 0 ? recentCrashes : recentCrashesList;

  // Filter current user's slot 1 and slot 2 bets from active round
  const mySlot1Bet = currentUserId
    ? roundState.bets.find((b) => b.user_id === currentUserId && b.slot === 1)
    : null;
  const mySlot2Bet = currentUserId
    ? roundState.bets.find((b) => b.user_id === currentUserId && b.slot === 2)
    : null;

  return (
    <div className="aviator-game-wrapper">
      {/* Portrait Reminder on mobile */}
      <div className="aviator-portrait-reminder">
        <div className="rotate-icon">📱</div>
        <h2 className="text-xl font-bold text-white">Please Rotate Your Phone</h2>
        <p className="text-sm text-gray-400">
          Aviator requires landscape mode for high-speed flight controls.
        </p>
      </div>

      {/* Top Header */}
      <header className="aviator-top-nav">
        <div className="aviator-logo">
          <span className="plane-icon">✈️</span>
          <span className="logo-text">AVIATOR</span>
          <span
            className={`w-2 h-2 rounded-full inline-block ml-1 ${
              isConnected
                ? 'bg-emerald-400 animate-pulse'
                : isConnecting
                ? 'bg-amber-400 animate-ping'
                : 'bg-rose-500'
            }`}
            title={isConnected ? 'Radar Connected' : isConnecting ? 'Reconnecting...' : 'Disconnected'}
          />
        </div>

        <div className="aviator-nav-right">
          <div className="aviator-wallet-pill">
            <span className="text-xs text-gray-400">₹</span>
            <span className="wallet-amount">
              {(walletBalancePaise / 100).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="aviator-btn-back"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Crash History Pill Bar */}
      <AviatorHistory
        crashes={displayCrashes}
        currentRoundId={roundState.round_id}
      />

      {/* Connection Error or Action Error Banner */}
      {(connectionError || actionErrorMessage) && (
        <div className="bg-red-500/90 text-white text-xs font-bold py-1.5 px-4 text-center z-50 animate-bounce">
          ⚠️ {connectionError ? 'Aviator connection error' : actionErrorMessage}
        </div>
      )}

      {/* Main Game Grid: Sidebar + Canvas Arena + Dual Bet Panels */}
      <main className="aviator-main-layout">
        {/* Left: Players / Live bets feed */}
        <aside className="aviator-players-panel">
          <AviatorPlayers
            bets={roundState.bets}
            myPastBets={myPastBets}
            currentUserId={currentUserId}
          />
        </aside>

        {/* Center Arena & Bet Controls */}
        <section className="aviator-center-area">
          <AviatorArena
            phase={roundState.phase}
            multiplier={roundState.multiplier}
            crashPoint={roundState.crash_point}
            bettingDuration={roundState.betting_duration}
          />

          <div className="aviator-bet-panels-container">
            <AviatorBetPanel
              slot={1}
              phase={roundState.phase}
              multiplier={roundState.multiplier}
              myBet={mySlot1Bet}
              walletBalancePaise={walletBalancePaise}
              onPlaceBet={placeBet}
              onCashout={cashout}
            />

            <AviatorBetPanel
              slot={2}
              phase={roundState.phase}
              multiplier={roundState.multiplier}
              myBet={mySlot2Bet}
              walletBalancePaise={walletBalancePaise}
              onPlaceBet={placeBet}
              onCashout={cashout}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default AviatorPage;
