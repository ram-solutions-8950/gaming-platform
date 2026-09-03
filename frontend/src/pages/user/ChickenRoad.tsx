import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Coins,
  Play,
  RotateCcw,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  Wallet,
} from 'lucide-react';
import {
  chickenRoadService,
  type Difficulty,
  type GameStatus,
} from '../../services/chickenRoad';
import { walletService } from '../../services/wallet';
import { RoadCrossingGame } from '../../components/chickenRoad/RoadCrossingGame';
import { soundManager } from '../../services/soundManager';
import '../../styles/chicken-road.css';

// Multiplier progression: Road 1 = 1.00x (base), then +0.03x per road crossed after that
// (1 + (crossings - 1) * 0.03). Must exactly match DIFFICULTY_MULTIPLIERS in
// backend/app/routers/chicken_road.py. Used only as a pre-fetch fallback; the
// authoritative values always come from the API.
const buildMultiplierTable = (count: number, step = 0.03): number[] =>
  Array.from({ length: count }, (_, i) => Math.round((1 + step * i) * 100) / 100);

const DEFAULT_MULTIPLIERS: Record<Difficulty, number[]> = {
  MEDIUM: buildMultiplierTable(10),
  HARD: buildMultiplierTable(10),
};

const QUICK_BETS = [5, 10, 20, 30];

export function ChickenRoadPage() {
  const navigate = useNavigate();

  // Game States
  const [gameState, setGameState] = useState<GameStatus>('READY');
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [currentLane, setCurrentLane] = useState<number>(0);
  const [multipliers, setMultipliers] = useState<number[]>(DEFAULT_MULTIPLIERS.MEDIUM);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [nextMultiplier, setNextMultiplier] = useState<number>(DEFAULT_MULTIPLIERS.MEDIUM[0]);
  // Exact amount Cash Out would pay right now — always sourced from the backend
  // (never computed client-side), so it can never drift from what /cashout
  // actually credits (the backend applies the same winning-fee calculation to
  // both, see _preview_total_return_paisa in chicken_road.py).
  const [potentialWin, setPotentialWin] = useState<number>(0);

  const [winAmount, setWinAmount] = useState<number>(0);
  const [lossLane, setLossLane] = useState<number | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [isCashoutLoading, setIsCashoutLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // Mobile steering button state
  const [externalSteer, setExternalSteer] = useState<'left' | 'right' | null>(null);

  // Guards against Cash Out / collision / finish firing more than once for the
  // same round (e.g. a collision detected in the same frame a Cash Out click is
  // processed). Whichever settlement path starts first wins; the backend's own
  // ROUND_LOCK + status check is the final authority, this just stops the
  // frontend from firing duplicate/overlapping requests and flickering the UI.
  const settlementInFlightRef = useRef(false);

  // Sync state on load
  const syncState = useCallback(async () => {
    try {
      const [walletData, gameStateData] = await Promise.all([
        walletService.getWallet().catch(() => null),
        chickenRoadService.getState().catch(() => null),
      ]);

      if (walletData && typeof walletData.balance === 'number') {
        setBalance(walletData.balance / 100);
      }

      if (gameStateData) {
        if (gameStateData.multipliers) {
          setMultipliers(gameStateData.multipliers);
        }
        if (gameStateData.difficulty) {
          setDifficulty(gameStateData.difficulty);
        }

        if (gameStateData.status === 'ACTIVE' && gameStateData.round_id) {
          setActiveRoundId(gameStateData.round_id);
          setGameState('ACTIVE');
          setCurrentLane(gameStateData.current_lane || 0);
          setCurrentMultiplier(gameStateData.current_multiplier || 1.0);
          setNextMultiplier(
            gameStateData.next_multiplier || DEFAULT_MULTIPLIERS[gameStateData.difficulty || 'MEDIUM'][0]
          );
          if (typeof gameStateData.potential_win === 'number') {
            setPotentialWin(gameStateData.potential_win);
          }

          if (gameStateData.bet_amount) {
            setBetAmount(gameStateData.bet_amount);
          }
        } else {
          setGameState('READY');
          setActiveRoundId(null);
        }
      }
    } catch (err) {
      console.error('Failed to sync Chicken Road state:', err);
    }
  }, []);

  useEffect(() => {
    syncState();
  }, [syncState]);

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

  // Difficulty change handler
  const handleDifficultyChange = (diff: Difficulty) => {
    if (gameState === 'ACTIVE') return;
    setDifficulty(diff);
    setMultipliers(DEFAULT_MULTIPLIERS[diff]);
    setNextMultiplier(DEFAULT_MULTIPLIERS[diff][0]);
  };

  // Start / Place Bet
  const handleStartGame = async () => {
    if (betAmount <= 0) return;
    if (betAmount > balance) {
      setErrorMessage('Insufficient balance. Please deposit to continue.');
      return;
    }

    setIsActionLoading(true);
    setErrorMessage(null);
    setWinAmount(0);
    setLossLane(null);
    settlementInFlightRef.current = false; // fresh round, no settlement pending yet

    try {
      const res = await chickenRoadService.startGame(betAmount, difficulty);
      soundManager.play('bet_coin');
      setActiveRoundId(res.round_id);
      setGameState('ACTIVE');
      setCurrentLane(0);
      setCurrentMultiplier(1.0);
      setNextMultiplier(res.next_multiplier || multipliers[0]);
      setPotentialWin(res.potential_win ?? betAmount);

      if (res.wallet_balance !== undefined) {
        setBalance(res.wallet_balance);
      } else {
        setBalance((prev) => Math.max(0, prev - betAmount));
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to start game';
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Safe lane crossed callback from canvas. Only meaningful while the round is
  // still ACTIVE and no settlement (cashout/collision/finish) has started —
  // once one has, further crossings are ignored so a late frame can't keep
  // advancing state past a round that's already ending.
  const handleLaneCross = async (laneIndex: number) => {
    if (!activeRoundId || gameState !== 'ACTIVE' || settlementInFlightRef.current) return;

    try {
      const res = await chickenRoadService.crossLane(activeRoundId, laneIndex);
      soundManager.play('reveal_tick');
      setCurrentLane(res.current_lane);
      setCurrentMultiplier(res.current_multiplier);
      setNextMultiplier(res.next_multiplier);
      setPotentialWin(res.potential_win);
    } catch (err) {
      console.error('Failed to register lane cross:', err);
    }
  };

  // Collision callback from canvas. This is one of three mutually-exclusive
  // settlement paths (collision / cashout / finish) — settlementInFlightRef
  // ensures only the first one to fire actually settles the round; the
  // backend's own status check + lock is the final authority either way.
  const handleCollision = async (laneIndex: number) => {
    if (!activeRoundId || gameState !== 'ACTIVE' || settlementInFlightRef.current) return;
    settlementInFlightRef.current = true;

    setGameState('LOST');
    setLossLane(laneIndex);
    soundManager.play('loss');

    try {
      await chickenRoadService.reportCollision(activeRoundId, laneIndex);
    } catch (err) {
      console.error('Failed to report collision:', err);
    } finally {
      setActiveRoundId(null);
    }
  };

  // Finish safe line reached callback from canvas.
  const handleFinish = async () => {
    if (!activeRoundId || gameState !== 'ACTIVE' || settlementInFlightRef.current) return;
    settlementInFlightRef.current = true;

    try {
      const res = await chickenRoadService.finishGame(activeRoundId);
      soundManager.play('win_clap');
      setGameState('WON');
      setWinAmount(res.won_amount);
      setCurrentMultiplier(res.multiplier);
      if (res.wallet_balance !== undefined) {
        setBalance(res.wallet_balance);
      }
      setActiveRoundId(null);
    } catch (err) {
      console.error('Failed to complete finish:', err);
      // Don't strand activeRoundId/the lock on a network error — the canvas is
      // already frozen (isWon set internally the moment onFinish fired), and a
      // refresh will re-sync against the backend's authoritative round state.
      settlementInFlightRef.current = false;
    }
  };

  // Cash Out — only reachable once the player has crossed at least one lane
  // (see the button's disabled/visibility logic below and the backend's own
  // current_lane >= 1 guard, which is the authoritative check).
  const handleCashout = async () => {
    if (!activeRoundId || gameState !== 'ACTIVE' || currentLane < 1) return;
    if (settlementInFlightRef.current) return;
    settlementInFlightRef.current = true;
    setIsCashoutLoading(true);

    // Freeze movement immediately (optimistic) — the canvas stops updating
    // the instant gameState leaves 'ACTIVE', so no further lane-cross or
    // collision events can fire while the request is in flight.
    setGameState('CASHED_OUT');

    try {
      const res = await chickenRoadService.cashout(activeRoundId);
      soundManager.play('win_clap');
      setWinAmount(res.won_amount);
      setCurrentMultiplier(res.multiplier);
      if (res.wallet_balance !== undefined) {
        setBalance(res.wallet_balance);
      }
    } catch (err: any) {
      // Extremely rare: a collision reached the backend a moment earlier and
      // won the race under the server's round lock. Trust the backend, not
      // the optimistic client state — re-sync to find out what really happened.
      console.error('Cashout failed, re-syncing authoritative state:', err);
      const msg = err.response?.data?.detail || 'Cash out failed — round may have already ended.';
      setErrorMessage(msg);
      await syncState();
    } finally {
      setActiveRoundId(null);
      setIsCashoutLoading(false);
    }
  };

  // Play again
  const handlePlayAgain = () => {
    settlementInFlightRef.current = false;
    setGameState('READY');
    setActiveRoundId(null);
    setCurrentLane(0);
    setCurrentMultiplier(1.0);
    setNextMultiplier(multipliers[0]);
    setPotentialWin(0);

    setWinAmount(0);
    setLossLane(null);
    setErrorMessage(null);
  };

  return (
    <div className="cr-arcade-container">
      {/* ── 1. Top Header Bar (Dark Charcoal) ── */}
      <header className="cr-header">
        <div className="cr-header-left">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="cr-header-back-btn"
          >
            <ArrowLeft size={16} />
            <span>Chicken Road</span>
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
            <button
              type="button"
              onClick={() => navigate('/deposit')}
              className="cr-header-add-cash"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={syncState}
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
          <span className="cr-live-divider">•</span>
          <span className="cr-live-online">Online: 32,036</span>
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
              <span className="cr-hud-label">Next:</span>
              <span className="cr-hud-val cr-hud-val--green">
                {gameState === 'ACTIVE' && currentLane < multipliers.length
                  ? `${nextMultiplier.toFixed(2)}x`
                  : `${multipliers[0]?.toFixed(2) || '1.00'}x`}
              </span>
            </div>

          </div>

          <RoadCrossingGame
            gameState={gameState}
            multipliers={multipliers}
            currentLane={currentLane}
            difficulty={difficulty}
            onLaneCross={handleLaneCross}
            onCollision={handleCollision}
            onFinish={handleFinish}
            externalSteer={externalSteer}
          />

          {/* Cash Out — only shown once the round is active AND at least one
              lane has been successfully crossed (currentLane comes from the
              server's response to /cross-lane, not client-side position). */}
          {gameState === 'ACTIVE' && currentLane >= 1 && (
            <div className="cr-cashout-wrap">
              <button
                type="button"
                disabled={isCashoutLoading}
                onClick={handleCashout}
                className="cr-cashout-btn"
              >
                <Wallet size={16} />
                <span>
                  {isCashoutLoading
                    ? 'CASHING OUT...'
                    : `CASH OUT ₹${potentialWin.toFixed(2)}`}
                </span>
              </button>
            </div>
          )}

          {/* Floating Touch Controls (Mobile) */}
          <div className="cr-mobile-controls">
            <button
              type="button"
              className="cr-steer-btn"
              onMouseDown={() => setExternalSteer('left')}
              onMouseUp={() => setExternalSteer(null)}
              onTouchStart={(e) => {
                e.preventDefault();
                setExternalSteer('left');
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                setExternalSteer(null);
              }}
              aria-label="Steer Left"
            >
              <ChevronLeft size={28} />
            </button>

            <button
              type="button"
              className="cr-steer-btn"
              onMouseDown={() => setExternalSteer('right')}
              onMouseUp={() => setExternalSteer(null)}
              onTouchStart={(e) => {
                e.preventDefault();
                setExternalSteer('right');
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                setExternalSteer(null);
              }}
              aria-label="Steer Right"
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* Win Modal */}
          {gameState === 'WON' && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal cr-arcade-modal--win">
                <div className="cr-modal-badge">🏆</div>
                <h2 className="cr-modal-heading">YOU WON</h2>
                <div className="cr-modal-stat-row">
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Multiplier</span>
                    <span className="cr-modal-stat-val text-yellow-400">
                      {currentMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Bet</span>
                    <span className="cr-modal-stat-val">₹{betAmount}</span>
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

          {/* Cashed Out Modal */}
          {gameState === 'CASHED_OUT' && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal cr-arcade-modal--win">
                <div className="cr-modal-badge">💰</div>
                <h2 className="cr-modal-heading">CASHED OUT</h2>
                <div className="cr-modal-stat-row">
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Multiplier</span>
                    <span className="cr-modal-stat-val text-yellow-400">
                      {currentMultiplier.toFixed(2)}x
                    </span>
                  </div>
                  <div className="cr-modal-stat">
                    <span className="cr-modal-stat-label">Bet</span>
                    <span className="cr-modal-stat-val">₹{betAmount}</span>
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
          {gameState === 'LOST' && (
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
                    <span className="cr-modal-stat-val">₹{betAmount}</span>
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

          {/* How to Play Modal */}
          {showHowToPlay && (
            <div className="cr-overlay-backdrop" onClick={() => setShowHowToPlay(false)}>
              <div className="cr-arcade-modal cr-arcade-modal--help" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between w-full border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2 font-black text-sm text-yellow-400">
                    <HelpCircle size={16} />
                    <span>HOW TO PLAY</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHowToPlay(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="cr-rules-list">
                  <div className="cr-rule-item">
                    <span className="cr-rule-num">1</span>
                    <span>Choose your bet amount and difficulty.</span>
                  </div>
                  <div className="cr-rule-item">
                    <span className="cr-rule-num">2</span>
                    <span>Press <strong>PLAY</strong> to start the crossing run.</span>
                  </div>
                  <div className="cr-rule-item">
                    <span className="cr-rule-num">3</span>
                    <span>Use <strong>Arrow Keys / A & D</strong> or swipe to steer through traffic gaps.</span>
                  </div>
                  <div className="cr-rule-item">
                    <span className="cr-rule-num">4</span>
                    <span>Each crossed lane increases your reward multiplier.</span>
                  </div>
                  <div className="cr-rule-item">
                    <span className="cr-rule-num">5</span>
                    <span>Reach the finish line safe zone!</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHowToPlay(false)}
                  className="cr-modal-action-btn cr-modal-action-btn--green mt-2"
                >
                  <span>GOT IT</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="cr-error-banner">{errorMessage}</div>
        )}
      </main>

      {/* ── 4. Compact Bottom Betting Panel (Dark Charcoal) ── */}
      <footer className="cr-bottom-panel">
        {/* Bet Stepper: MIN [ - | value | + ] MAX */}
        <div className="cr-bet-stepper-group">
          <button
            type="button"
            disabled={gameState === 'ACTIVE'}
            onClick={() => setBetAmount(1)}
            className="cr-stepper-bound-btn"
          >
            MIN
          </button>

          <div className="cr-stepper-input-box">
            <button
              type="button"
              disabled={gameState === 'ACTIVE' || betAmount <= 1}
              onClick={() => setBetAmount((prev) => Math.max(1, prev - 5))}
              className="cr-stepper-adj-btn"
            >
              -
            </button>
            <input
              type="number"
              disabled={gameState === 'ACTIVE'}
              value={betAmount}
              onChange={(e) => setBetAmount(Math.max(1, Number(e.target.value)))}
              className="cr-stepper-input"
            />
            <button
              type="button"
              disabled={gameState === 'ACTIVE'}
              onClick={() => setBetAmount((prev) => prev + 5)}
              className="cr-stepper-adj-btn"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={gameState === 'ACTIVE'}
            onClick={() => setBetAmount(Math.floor(balance) || 100)}
            className="cr-stepper-bound-btn"
          >
            MAX
          </button>
        </div>

        {/* Quick Bet Buttons */}
        <div className="cr-quick-chips">
          {QUICK_BETS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={gameState === 'ACTIVE'}
              onClick={() => setBetAmount(chip)}
              className={`cr-chip-btn ${betAmount === chip ? 'cr-chip-btn--active' : ''}`}
            >
              ₹{chip}
            </button>
          ))}
          <button
            type="button"
            disabled={gameState === 'ACTIVE'}
            onClick={() => setBetAmount((prev) => Math.max(1, Math.floor(prev / 2)))}
            className="cr-chip-btn"
          >
            1/2
          </button>
          <button
            type="button"
            disabled={gameState === 'ACTIVE'}
            onClick={() => setBetAmount((prev) => prev * 2)}
            className="cr-chip-btn"
          >
            2X
          </button>
        </div>

        {/* Difficulty Pills */}
        <div className="cr-diff-pills">
          {(['MEDIUM', 'HARD'] as Difficulty[]).map((diff) => (
            <button
              key={diff}
              type="button"
              disabled={gameState === 'ACTIVE'}
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
          <button
            type="button"
            disabled={gameState === 'ACTIVE' || (gameState === 'READY' && (isActionLoading || betAmount <= 0))}
            onClick={gameState === 'READY' ? handleStartGame : handlePlayAgain}
            className="cr-play-btn"
          >
            <span className="cr-btn-icon-slot">
              {gameState === 'READY' && <Play size={15} fill="#FFFFFF" />}
              {gameState === 'ACTIVE' && <span className="cr-btn-pulse-dot" />}
              {(gameState === 'WON' || gameState === 'LOST' || gameState === 'CASHED_OUT') && <RotateCcw size={15} />}
            </span>
            <span className="cr-btn-label">
              {gameState === 'READY'
                ? isActionLoading
                  ? 'STARTING...'
                  : `PLAY ₹${betAmount}`
                : gameState === 'ACTIVE'
                ? 'CROSSING...'
                : 'PLAY AGAIN'}
            </span>
          </button>
        </div>
      </footer>
    </div>
  );
}
