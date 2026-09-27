import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Coins,
  Play,
  RotateCcw,
  HelpCircle,
  Sparkles,
  Flame,
  LogOut,
  Footprints,
} from 'lucide-react';
import {
  chickenRoadService,
  type CrossLaneResponse,
  type Difficulty,
  type FinishResponse,
  type GameStatus,
  type LostResponse,
} from '../../services/chickenRoad';
import { walletService } from '../../services/wallet';
import { getApiErrorMessage } from '../../utils/apiError';
import {
  RoadCrossingGame,
  type RoadCrossingHandle,
  type StepOutcome,
} from '../../components/chickenRoad/RoadCrossingGame';
import { soundManager } from '../../services/soundManager';
import { isInsufficientBalanceMessage, showInsufficientBalance } from '../../store/insufficientBalanceStore';
import { lockLandscape } from '../../utils/nativeOrientation';
import { GameRulesModal } from '../../components/common/GameRulesModal';
import { CHICKEN_ROAD_RULES_DATA } from '../../components/common/gameRulesData';
import '../../styles/chicken-road.css';

const DEFAULT_MULTIPLIERS: Record<Difficulty, number[]> = {
  MEDIUM: [1.03, 1.08, 1.15, 1.25, 1.38, 1.55, 1.75, 2.05, 2.45, 3.00],
  HARD: [1.05, 1.15, 1.30, 1.55, 1.90, 2.40, 3.10, 4.20, 6.00, 10.00],
};

const QUICK_BETS = [10, 20, 50, 100];

// The road has already shown the car hitting the chicken; the loss modal
// follows once the player has seen it lying there.
const LOSS_MODAL_DELAY_MS = 500;

function isRetryable(err: any): boolean {
  const status = err?.response?.status;
  return status === undefined || status === 429 || status >= 500;
}

// Every round action is safe to repeat: the server ignores a lane it has
// already ruled on and refuses to settle a round twice. Retries indefinitely
// while the round is still active to avoid desync on temporary network glitches.
async function withRetry<T>(
  request: () => Promise<T>,
  stillWanted: () => boolean,
  onRetry?: (attempt: number) => void
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request();
    } catch (err) {
      if (!isRetryable(err) || !stillWanted()) throw err;
      onRetry?.(attempt + 1);
      const delay = Math.min(500 * Math.pow(1.5, attempt), 2500);
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
  }
}

export function ChickenRoadPage() {
  const navigate = useNavigate();

  // Game States
  const [gameState, setGameState] = useState<GameStatus>('READY');
  const [balance, setBalance] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(10);
  // Stake of the round in play (or just ended); betAmount is the next round's.
  const [roundBet, setRoundBet] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [currentLane, setCurrentLane] = useState<number>(0);
  const [multipliers, setMultipliers] = useState<number[]>(DEFAULT_MULTIPLIERS.MEDIUM);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [nextMultiplier, setNextMultiplier] = useState<number>(DEFAULT_MULTIPLIERS.MEDIUM[0]);

  const [winAmount, setWinAmount] = useState<number>(0);
  const [cashoutAmount, setCashoutAmount] = useState<number>(0);
  const [lossLane, setLossLane] = useState<number | null>(null);
  const [showLossModal, setShowLossModal] = useState<boolean>(false);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  // A hop is under way: its lane is being ruled on or the road is still showing the ruling.
  const [stepping, setStepping] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Synchronous refs to prevent race conditions and closure staleness
  const roadRef = useRef<RoadCrossingHandle>(null);
  const activeRoundIdRef = useRef<string | null>(null);
  const currentLaneRef = useRef<number>(0);
  const steppingRef = useRef<boolean>(false);
  const crossLanePromiseRef = useRef<Promise<unknown> | null>(null);
  const initialMountRef = useRef<boolean>(true);
  // Bumped whenever a round starts or ends here, so a sync that was already in
  // flight doesn't overwrite it with what the server said before.
  const roundEpochRef = useRef<number>(0);

  // Back to the betting screen, with no round in play.
  const resetRound = useCallback(() => {
    activeRoundIdRef.current = null;
    currentLaneRef.current = 0;
    crossLanePromiseRef.current = null;
    setGameState('READY');
    setCurrentLane(0);
    setCurrentMultiplier(1.0);
    setWinAmount(0);
    setCashoutAmount(0);
    setLossLane(null);
    setShowLossModal(false);
  }, []);

  // Brings the page in line with the server. On initial app/page mount, if there was
  // an unfinished round left open from an abandoned session, forfeit it and restart fresh.
  const syncState = useCallback(async (): Promise<boolean | null> => {
    const epoch = roundEpochRef.current;
    const isFirstMount = initialMountRef.current;
    initialMountRef.current = false;
    try {
      const [walletData, gameStateData] = await Promise.all([
        walletService.getWallet().catch(() => null),
        chickenRoadService.getState().catch(() => null),
      ]);
      if (roundEpochRef.current !== epoch) return null;

      if (walletData && typeof walletData.balance === 'number') {
        setBalance(walletData.balance / 100);
      }
      if (!gameStateData) return null;

      if (gameStateData.status === 'ACTIVE' && gameStateData.round_id) {
        // If loading fresh after app was killed or exited, forfeit the abandoned round
        // and restart in READY state as requested
        if (isFirstMount) {
          try {
            await chickenRoadService.forfeit(gameStateData.round_id);
          } catch {}
          resetRound();
          const refreshedWallet = await walletService.getWallet().catch(() => null);
          if (refreshedWallet && typeof refreshedWallet.balance === 'number') {
            setBalance(refreshedWallet.balance / 100);
          }
          return false;
        }

        if (gameStateData.multipliers) {
          setMultipliers(gameStateData.multipliers);
        }
        if (gameStateData.difficulty) {
          setDifficulty(gameStateData.difficulty);
        }
        activeRoundIdRef.current = gameStateData.round_id;
        currentLaneRef.current = gameStateData.current_lane || 0;
        setGameState('ACTIVE');
        setCurrentLane(gameStateData.current_lane || 0);
        setCurrentMultiplier(gameStateData.current_multiplier || 1.0);
        setNextMultiplier(
          gameStateData.next_multiplier || DEFAULT_MULTIPLIERS[gameStateData.difficulty || 'MEDIUM'][0]
        );

        if (gameStateData.bet_amount) {
          setBetAmount(gameStateData.bet_amount);
          setRoundBet(gameStateData.bet_amount);
        }
        if (typeof gameStateData.cashout_amount === 'number') {
          setCashoutAmount(gameStateData.cashout_amount);
        } else if (gameStateData.bet_amount && gameStateData.current_multiplier) {
          setCashoutAmount(gameStateData.bet_amount * gameStateData.current_multiplier);
        }
        return true;
      }
      resetRound();
      return false;
    } catch (err) {
      console.error('Failed to sync Chicken Road state:', err);
      return null;
    }
  }, [resetRound]);

  // A round action failed in a way that leaves it unclear where the round
  // stands (e.g. it was settled but the answer never arrived): ask the server.
  const reconcileRound = useCallback(async () => {
    const inPlay = await syncState();
    if (inPlay === false) {
      setErrorMessage('This round has already ended. Your balance has been updated.');
    }
  }, [syncState]);

  const refreshBalance = useCallback(async () => {
    try {
      const walletData = await walletService.getWallet();
      if (typeof walletData?.balance === 'number') setBalance(walletData.balance / 100);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
    }
  }, []);

  useEffect(() => {
    lockLandscape().catch(() => {});
    syncState();
  }, [syncState]);

  useEffect(() => {
    const handleBackPressed = (): boolean => {
      if (showHowToPlay) {
        setShowHowToPlay(false);
        return true;
      }
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return true;
      }
      if (gameState === 'ACTIVE') {
        setShowExitConfirm(true);
        return true;
      }
      navigate('/dashboard');
      return true;
    };

    (window as any).__gameSpecificBackPressed = handleBackPressed;
    return () => {
      delete (window as any).__gameSpecificBackPressed;
    };
  }, [showHowToPlay, showExitConfirm, gameState, navigate]);

  // Dynamic viewport-height fallback for Android landscape fitting.
  // `100dvh` alone can be unreliable in some Android WebViews (Capacitor)
  // while system bars / safe-area insets settle after mount or the on-screen
  // keyboard toggles, which previously left the bottom betting panel clipped
  // outside the visible area. This tracks the actual visual viewport height
  // and exposes it as a CSS var the container prefers over plain `dvh`.
  useEffect(() => {
    const root = document.documentElement;
    const setAppHeight = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      root.style.setProperty('--cr-app-height', `${vh}px`);
    };
    setAppHeight();
    const settleTimer = window.setTimeout(setAppHeight, 300);

    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', setAppHeight);
    window.visualViewport?.addEventListener('resize', setAppHeight);

    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', setAppHeight);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
      root.style.removeProperty('--cr-app-height');
    };
  }, []);

  // The stake and difficulty are fixed from the moment PLAY is pressed.
  const betLocked = gameState !== 'READY' || isActionLoading;

  // Difficulty change handler
  const handleDifficultyChange = (diff: Difficulty) => {
    if (betLocked) return;
    setDifficulty(diff);
    setMultipliers(DEFAULT_MULTIPLIERS[diff]);
    setNextMultiplier(DEFAULT_MULTIPLIERS[diff][0]);
  };

  // Bet stepper helpers restricted to allowed values [10, 20, 50, 100]
  const handleStepDown = () => {
    if (betLocked) return;
    setBetAmount((curr) => {
      const idx = QUICK_BETS.findIndex((b) => b >= curr);
      if (idx > 0) return QUICK_BETS[idx - 1];
      return QUICK_BETS[0];
    });
  };

  const handleStepUp = () => {
    if (betLocked) return;
    setBetAmount((curr) => {
      const idx = QUICK_BETS.findIndex((b) => b > curr);
      if (idx !== -1) return QUICK_BETS[idx];
      return QUICK_BETS[QUICK_BETS.length - 1];
    });
  };

  // Start / Place Bet
  const handleStartGame = async () => {
    if (gameState !== 'READY' || isActionLoading) return;
    if (betAmount < 10 || betAmount > 100) {
      setErrorMessage('Bet amount must be between ₹10 and ₹100.');
      return;
    }
    if (betAmount > balance) {
      showInsufficientBalance();
      return;
    }

    setIsActionLoading(true);
    setErrorMessage(null);
    setWinAmount(0);
    setLossLane(null);

    try {
      const res = await chickenRoadService.startGame(betAmount, difficulty);
      roundEpochRef.current += 1;
      soundManager.play('bet_coin');
      activeRoundIdRef.current = res.round_id;
      currentLaneRef.current = 0;
      crossLanePromiseRef.current = null;
      // The round is played on the server's terms.
      const roundMultipliers = res.multipliers?.length ? res.multipliers : multipliers;
      setMultipliers(roundMultipliers);
      if (res.difficulty) setDifficulty(res.difficulty);
      setRoundBet(res.bet_amount || betAmount);
      setGameState('ACTIVE');
      setCurrentLane(0);
      setCurrentMultiplier(1.0);
      setNextMultiplier(res.next_multiplier || roundMultipliers[0]);
      if (typeof res.cashout_amount === 'number') {
        setCashoutAmount(res.cashout_amount);
      } else {
        setCashoutAmount(res.bet_amount || betAmount);
      }

      if (res.wallet_balance !== undefined) {
        setBalance(res.wallet_balance);
      } else {
        setBalance((prev) => Math.max(0, prev - betAmount));
      }
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to start game');
      // A bet refused for lack of funds already has its popup.
      if (!isInsufficientBalanceMessage(msg)) setErrorMessage(msg);
      // A round may be in play anyway (started from another tab, or started
      // here but the answer was lost): pick it up rather than stay stuck.
      syncState();
    } finally {
      setIsActionLoading(false);
    }
  };

  // The server's draw hit the chicken. It has already settled the round as
  // lost; all that's left is to show it.
  const showLoss = useCallback((laneIndex: number, laneReached: number) => {
    roundEpochRef.current += 1;
    currentLaneRef.current = laneReached;
    setCurrentLane(laneReached);
    setCurrentMultiplier(laneReached > 0 ? multipliers[laneReached - 1] || 1.0 : 1.0);
    setShowLossModal(false);
    setGameState('LOST');
    setLossLane(laneIndex);
    soundManager.play('loss');
    activeRoundIdRef.current = null;
    crossLanePromiseRef.current = null;
  }, [multipliers]);

  useEffect(() => {
    if (gameState !== 'LOST') return;
    const timer = window.setTimeout(() => setShowLossModal(true), LOSS_MODAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [gameState]);

  // The round is paid out: across the finish line, or cashed out.
  const showWin = useCallback((wonAmount: number, multiplier: number, walletBalance?: number) => {
    roundEpochRef.current += 1;
    soundManager.play('win_clap');
    setGameState('WON');
    setWinAmount(wonAmount);
    setCurrentMultiplier(multiplier);
    if (walletBalance !== undefined) setBalance(walletBalance);
    activeRoundIdRef.current = null;
    crossLanePromiseRef.current = null;
  }, []);

  // GO: the chicken hops into the next lane, one lane per tap. The server
  // rules on the lane while it hops, and the road plays the ruling out
  // (barrier down, or a car) before the round moves on.
  const handleGo = useCallback(async () => {
    const roundId = activeRoundIdRef.current;
    const road = roadRef.current;
    if (!roundId || !road || gameState !== 'ACTIVE' || isActionLoading || steppingRef.current) return;
    if (!road.canStep()) return;
    const total = multipliers.length;
    const lane = currentLaneRef.current + 1;
    if (lane > total) return;

    steppingRef.current = true;
    setStepping(true);
    setErrorMessage(null);

    // The last lane is the finish: crossing it settles the round at the top multiplier.
    const request = withRetry<CrossLaneResponse | FinishResponse | LostResponse>(
      () => (lane === total
        ? chickenRoadService.finishGame(roundId, lane)
        : chickenRoadService.crossLane(roundId, lane)),
      () => activeRoundIdRef.current === roundId,
      (attempt) => {
        if (attempt >= 2) setErrorMessage(`Reconnecting... (attempt ${attempt})`);
      }
    );
    crossLanePromiseRef.current = request;
    const verdict = request.then(
      (res): StepOutcome => (res.status === 'LOST' ? 'hit' : res.status === 'WON' ? 'won' : 'safe'),
      (): StepOutcome => 'error'
    );

    try {
      await road.step(lane, verdict);
      const res = await request;
      if (activeRoundIdRef.current !== roundId) return;
      setErrorMessage(null);
      if (res.status === 'LOST') {
        showLoss(res.lane_index, res.current_lane);
      } else if (res.status === 'WON') {
        currentLaneRef.current = total;
        setCurrentLane(total);
        showWin(res.won_amount, res.multiplier, res.wallet_balance);
      } else {
        currentLaneRef.current = Math.max(currentLaneRef.current, res.current_lane);
        setCurrentLane(currentLaneRef.current);
        setCurrentMultiplier(res.current_multiplier);
        setNextMultiplier(res.next_multiplier);
        setCashoutAmount(
          typeof res.cashout_amount === 'number' ? res.cashout_amount : roundBet * res.current_multiplier
        );
        soundManager.play('reveal_tick');
      }
    } catch (err) {
      console.error('Failed to cross lane:', err);
      if (activeRoundIdRef.current === roundId) {
        setErrorMessage(getApiErrorMessage(err, 'Could not reach the game server.'));
        reconcileRound();
      }
    } finally {
      if (crossLanePromiseRef.current === request) crossLanePromiseRef.current = null;
      steppingRef.current = false;
      setStepping(false);
    }
  }, [gameState, isActionLoading, multipliers.length, roundBet, showLoss, showWin, reconcileRound]);

  // Keyboard: Space, Enter or the right / up arrow is GO.
  useEffect(() => {
    if (gameState !== 'ACTIVE') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || showExitConfirm || showHowToPlay) return;
      if (['Space', 'Enter', 'ArrowRight', 'ArrowUp', 'KeyD', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        handleGo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameState, showExitConfirm, showHowToPlay, handleGo]);

  // Cashout mid-game callback
  const handleCashout = async () => {
    const roundId = activeRoundIdRef.current;
    if (!roundId || gameState !== 'ACTIVE' || isActionLoading || steppingRef.current) return;
    setIsActionLoading(true);
    try {
      // Let an in-flight crossing land first: it may have ended the round.
      if (crossLanePromiseRef.current) {
        try {
          await crossLanePromiseRef.current;
        } catch {}
      }
      if (activeRoundIdRef.current !== roundId) return;
      const res = await withRetry(
        () => chickenRoadService.cashout(roundId),
        () => activeRoundIdRef.current === roundId,
        (attempt) => {
          if (attempt >= 2) {
            setErrorMessage(`Reconnecting... (attempt ${attempt})`);
          }
        }
      );
      if (activeRoundIdRef.current !== roundId) return;
      if (res.status === 'LOST') {
        showLoss(res.lane_index, res.current_lane);
        return;
      }
      setErrorMessage(null);
      showWin(res.won_amount, res.multiplier, res.wallet_balance);
    } catch (err: any) {
      const msg = getApiErrorMessage(err, 'Failed to cash out');
      setErrorMessage(msg);
      reconcileRound();
    } finally {
      setIsActionLoading(false);
    }
  };

  // Play again
  const handlePlayAgain = () => {
    resetRound();
    setErrorMessage(null);
  };

  // Exit Game: forfeit active round as LOST and leave
  const handleExitGame = async () => {
    setShowExitConfirm(false);
    const roundId = activeRoundIdRef.current;
    if (gameState === 'ACTIVE' && roundId) {
      try {
        await chickenRoadService.forfeit(roundId);
      } catch (err) {
        console.error('Failed to forfeit on exit:', err);
      }
    }
    resetRound();
    lockLandscape().catch(() => {});
    navigate('/dashboard');
  };

  // The stake is committed on start: cashing out is only possible once the
  // chicken has actually crossed a lane (the server enforces this too).
  const hasCrossedALane = Math.max(currentLane, currentLaneRef.current) > 0;
  const canCashOut = hasCrossedALane && !stepping && !isActionLoading;
  const canGo = gameState === 'ACTIVE' && !stepping && !isActionLoading && currentLane < multipliers.length;

  return (
    <div className="cr-arcade-container">
      {/* ── 1. Top Header Bar (Dark Charcoal) ── */}
      <header className="cr-header">
        <div className="cr-header-left">
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="cr-header-back-btn"
            title="Exit Game"
            aria-label="Exit Game"
          >
            <LogOut size={16} />
            <span>Exit</span>
          </button>
        </div>

        <div className="cr-header-center">
          <span className="cr-header-chicken-icon">🐔</span>
          <span className="cr-header-title">CHICKEN ROAD</span>
        </div>

        <div className="cr-header-right">
          <button
            type="button"
            onClick={() => setShowHowToPlay(true)}
            className="cr-header-help-btn"
          >
            <HelpCircle size={14} />
            <span>How to play</span>
          </button>

          <div className="cr-header-balance-pill">
            <Coins size={14} className="text-yellow-400" />
            <span className="cr-header-balance-text">₹{balance.toFixed(2)}</span>
          </div>

          <button
            type="button"
            onClick={refreshBalance}
            className="cr-header-icon-btn"
            title="Refresh balance"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>

      {/* ── 2. Live Information Strip ── */}
      <div className="cr-live-strip">
        <div className="cr-live-strip-content">
          <span className="cr-live-dot" />
          <span className="cr-live-text">Live wins</span>
        </div>
      </div>

      {/* ── 3. Full-Width Main Game Stage (Road & Traffic) ── */}
      <main className="cr-game-stage">
        {/* Canvas Engine */}
        <div className="cr-canvas-viewport">
          {/* Compact Floating HUD Bar */}
          <div className="cr-floating-hud">
            <div className="cr-hud-pill">
              <span className="cr-hud-label">Multiplier:</span>
              <span className="cr-hud-val cr-hud-val--gold">
                {currentLane > 0 ? `${currentMultiplier.toFixed(2)}x` : '1.00x'}
              </span>
            </div>

            <div className="cr-hud-pill">
              <span className="cr-hud-label">Points:</span>
              <span className="cr-hud-val cr-hud-val--points text-amber-400 font-mono">
                {currentLane * 100} / {multipliers.length * 100} Pts
              </span>
            </div>

            <div className="cr-hud-pill">
              <span className="cr-hud-label">Next:</span>
              <span className="cr-hud-val cr-hud-val--green">
                {gameState === 'READY'
                  ? `${(multipliers[0] ?? 1).toFixed(2)}x`
                  : gameState === 'ACTIVE' && currentLane < multipliers.length
                  ? `${nextMultiplier.toFixed(2)}x`
                  : '—'}
              </span>
            </div>

          </div>

          <RoadCrossingGame
            ref={roadRef}
            gameState={gameState}
            multipliers={multipliers}
            currentLane={currentLane}
            difficulty={difficulty}
          />

          {/* GO: one tap, one lane */}
          {gameState === 'ACTIVE' && (
            <div className="cr-go-wrap">
              <button
                type="button"
                className={`cr-go-btn ${canGo ? 'cr-go-btn--ready' : ''}`}
                onClick={handleGo}
                disabled={!canGo}
                aria-label="Go: hop to the next lane"
              >
                <Footprints size={18} />
                <span>GO</span>
              </button>
            </div>
          )}

          {/* Win Modal */}
          {(gameState === 'WON' || (gameState as any) === 'CASHED_OUT') && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal cr-arcade-modal--win">
                <div className="cr-modal-badge">🏆</div>
                <h2 className="cr-modal-heading">YOU WON</h2>
                {currentLane >= multipliers.length && (
                  <div className="bg-amber-500/20 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full border border-amber-500/40 uppercase tracking-wide">
                    🎯 GOAL REACHED ({(multipliers.length * 100).toLocaleString('en-IN')} PTS)
                  </div>
                )}
                <div className="cr-modal-stat-row">
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Multiplier</span>
                    <span className="cr-modal-stat-val text-yellow-400">
                      {currentMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Points Earned</span>
                    <span className="cr-modal-stat-val text-amber-400">
                      {Math.max(currentLane, currentLaneRef.current) * 100} Pts
                    </span>
                  </div>
                </div>

                <div className="cr-modal-payout-box">
                  <span className="text-[11px] font-bold text-emerald-300 uppercase">Payout</span>
                  <span className="text-2xl font-black text-emerald-400">
                    ₹{winAmount.toFixed(2)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handlePlayAgain}
                  className="cr-modal-action-btn cr-modal-action-btn--green"
                >
                  <RotateCcw size={16} />
                  <span>PLAY AGAIN</span>
                </button>
              </div>
            </div>
          )}

          {/* Loss Modal */}
          {gameState === 'LOST' && showLossModal && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal cr-arcade-modal--lost">
                <div className="cr-modal-badge">💥</div>
                <h2 className="cr-modal-heading text-red-500">CHICKEN HIT</h2>
                <p className="text-xs text-gray-400 m-0">
                  Hit by traffic in Lane {lossLane || 1}.
                </p>

                <div className="cr-modal-stat-row">
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Bet</span>
                    <span className="cr-modal-stat-val">₹{roundBet}</span>
                  </div>
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Result</span>
                    <span className="cr-modal-stat-val text-red-400">ROUND LOST</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePlayAgain}
                  className="cr-modal-action-btn cr-modal-action-btn--red"
                >
                  <RotateCcw size={16} />
                  <span>PLAY AGAIN</span>
                </button>
              </div>
            </div>
          )}

          {/* Exit Confirmation Modal (BUG-009: Cancel keeps user in game, Leave exits to dashboard) */}
          {showExitConfirm && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in select-none">
              <div className="relative flex flex-col items-center gap-3 p-5 sm:p-6 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/50 flex items-center justify-center text-2xl">
                  🚪
                </div>
                <h2 className="text-lg font-black text-white uppercase tracking-wider">
                  Exit Game?
                </h2>
                <p className="text-xs text-slate-300 m-0">
                  {gameState === 'ACTIVE'
                    ? 'A round is in progress. Leaving will forfeit your current bet. Are you sure you want to exit?'
                    : 'Are you sure you want to exit the game?'}
                </p>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    type="button"
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm transition active:scale-95 cursor-pointer shadow"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExitGame}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition active:scale-95 cursor-pointer shadow"
                  >
                    Leave
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* How to Play Modal */}
          {showHowToPlay && (
            <GameRulesModal
              title={CHICKEN_ROAD_RULES_DATA.title}
              subtitle={CHICKEN_ROAD_RULES_DATA.subtitle}
              sections={CHICKEN_ROAD_RULES_DATA.sections}
              payouts={CHICKEN_ROAD_RULES_DATA.payouts}
              tips={CHICKEN_ROAD_RULES_DATA.tips}
              onClose={() => setShowHowToPlay(false)}
            />
          )}
        </div>

        {errorMessage && (
          <div className="cr-error-banner">{errorMessage}</div>
        )}
      </main>

      {/* ── 4. Compact Bottom Betting Panel (Dark Charcoal) ── */}
      <footer className="cr-bottom-panel">
        {/* Bet Stepper: MIN [ - | value | + ] MAX strictly bounded to [10, 20, 50, 100] */}
        <div className="cr-bet-stepper-group">
          <button
            type="button"
            disabled={betLocked || betAmount <= 10}
            onClick={() => setBetAmount(10)}
            className="cr-stepper-bound-btn"
          >
            MIN
          </button>

          <div className="cr-stepper-input-box">
            <button
              type="button"
              disabled={betLocked || betAmount <= 10}
              onClick={handleStepDown}
              className="cr-stepper-adj-btn"
            >
              -
            </button>
            <input
              type="number"
              disabled={betLocked}
              readOnly
              value={betAmount}
              className="cr-stepper-input cursor-default"
            />
            <button
              type="button"
              disabled={betLocked || betAmount >= 100}
              onClick={handleStepUp}
              className="cr-stepper-adj-btn"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={betLocked || betAmount >= 100}
            onClick={() => setBetAmount(100)}
            className="cr-stepper-bound-btn"
          >
            MAX
          </button>
        </div>

        {/* Quick Bet Buttons: strictly 10, 20, 50, 100 */}
        <div className="cr-quick-chips">
          {QUICK_BETS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={betLocked}
              onClick={() => setBetAmount(chip)}
              className={`cr-chip-btn ${betAmount === chip ? 'cr-chip-btn--active' : ''}`}
            >
              ₹{chip}
            </button>
          ))}
        </div>

        {/* Difficulty Pills */}
        <div className="cr-diff-pills">
          {(['MEDIUM', 'HARD'] as Difficulty[]).map((diff) => (
            <button
              key={diff}
              type="button"
              disabled={betLocked}
              onClick={() => handleDifficultyChange(diff)}
              className={`cr-diff-pill ${
                difficulty === diff ? `cr-diff-pill--active cr-diff-pill--${diff.toLowerCase()}` : ''
              }`}
            >
              {diff === 'MEDIUM' && <Sparkles size={12} className="inline mr-1" />}
              {diff === 'HARD' && <Flame size={12} className="inline mr-1 text-red-400" />}
              <span>{diff.charAt(0) + diff.slice(1).toLowerCase()}</span>
            </button>
          ))}
        </div>

        {/* Large Action Button: Strictly invariant position, size & structure */}
        <div className="cr-play-action-wrap">
          {gameState === 'ACTIVE' ? (
            <button
              type="button"
              disabled={!canCashOut}
              onClick={handleCashout}
              className="cr-play-btn"
              style={
                hasCrossedALane
                  ? {
                      background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                      borderColor: '#FBBF24',
                      boxShadow: '0 0 15px rgba(245, 158, 11, 0.45)',
                      opacity: canCashOut ? 1 : 0.8,
                    }
                  : {
                      background: 'linear-gradient(135deg, #374151 0%, #1F2937 100%)',
                      borderColor: '#4B5563',
                      boxShadow: 'none',
                      opacity: 0.75,
                    }
              }
            >
              <span className="cr-btn-icon-slot">
                <Coins
                  size={16}
                  className={hasCrossedALane ? 'text-yellow-100' : 'text-gray-400'}
                />
              </span>
              <span className="cr-btn-label">
                {isActionLoading
                  ? 'CASHING OUT...'
                  : !hasCrossedALane
                  ? 'TAP GO TO CROSS'
                  : `CASH OUT ₹${(cashoutAmount || roundBet * currentMultiplier).toFixed(2)} (${currentMultiplier.toFixed(2)}x)`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={gameState === 'READY' && (isActionLoading || betAmount <= 0)}
              onClick={gameState === 'READY' ? handleStartGame : handlePlayAgain}
              className="cr-play-btn"
            >
              <span className="cr-btn-icon-slot">
                {gameState === 'READY' && <Play size={15} fill="#FFFFFF" />}
                {(gameState === 'WON' || (gameState as any) === 'CASHED_OUT' || gameState === 'LOST') && <RotateCcw size={15} />}
              </span>
              <span className="cr-btn-label">
                {gameState === 'READY'
                  ? isActionLoading
                    ? 'STARTING...'
                    : `PLAY ₹${betAmount}`
                  : 'PLAY AGAIN'}
              </span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
