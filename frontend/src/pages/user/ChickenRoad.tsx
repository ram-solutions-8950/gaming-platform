import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coins,
  Play,
  RotateCcw,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Flame,
  LogOut,
} from 'lucide-react';
import {
  chickenRoadService,
  type Difficulty,
  type GameStatus,
} from '../../services/chickenRoad';
import { walletService } from '../../services/wallet';
import { RoadCrossingGame } from '../../components/chickenRoad/RoadCrossingGame';
import { soundManager } from '../../services/soundManager';
import { lockLandscape } from '../../utils/nativeOrientation';
import { GameRulesModal } from '../../components/common/GameRulesModal';
import { CHICKEN_ROAD_RULES_DATA } from '../../components/common/gameRulesData';
import '../../styles/chicken-road.css';

const DEFAULT_MULTIPLIERS: Record<Difficulty, number[]> = {
  MEDIUM: [1.03, 1.08, 1.15, 1.25, 1.38, 1.55, 1.75, 2.05, 2.45, 3.00],
  HARD: [1.05, 1.15, 1.30, 1.55, 1.90, 2.40, 3.10, 4.20, 6.00, 10.00],
};

const QUICK_BETS = [10, 20, 50, 100];

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

  const [winAmount, setWinAmount] = useState<number>(0);
  const [lossLane, setLossLane] = useState<number | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Mobile steering button state
  const [externalSteer, setExternalSteer] = useState<'left' | 'right' | null>(null);

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
    lockLandscape().catch(() => {});
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

  // Bet stepper helpers restricted to allowed values [10, 20, 50, 100]
  const handleStepDown = () => {
    if (gameState === 'ACTIVE') return;
    setBetAmount((curr) => {
      const idx = QUICK_BETS.findIndex((b) => b >= curr);
      if (idx > 0) return QUICK_BETS[idx - 1];
      return QUICK_BETS[0];
    });
  };

  const handleStepUp = () => {
    if (gameState === 'ACTIVE') return;
    setBetAmount((curr) => {
      const idx = QUICK_BETS.findIndex((b) => b > curr);
      if (idx !== -1) return QUICK_BETS[idx];
      return QUICK_BETS[QUICK_BETS.length - 1];
    });
  };

  // Start / Place Bet
  const handleStartGame = async () => {
    if (betAmount < 10 || betAmount > 100) {
      setErrorMessage('Bet amount must be between ₹10 and ₹100.');
      return;
    }
    if (betAmount > balance) {
      setErrorMessage('Insufficient balance.');
      return;
    }

    setIsActionLoading(true);
    setErrorMessage(null);
    setWinAmount(0);
    setLossLane(null);

    try {
      const res = await chickenRoadService.startGame(betAmount, difficulty);
      soundManager.play('bet_coin');
      setActiveRoundId(res.round_id);
      setGameState('ACTIVE');
      setCurrentLane(0);
      setCurrentMultiplier(1.0);
      setNextMultiplier(res.next_multiplier || multipliers[0]);

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

  // Safe lane crossed callback from canvas
  const handleLaneCross = useCallback(async (laneIndex: number) => {
    if (!activeRoundId || gameState !== 'ACTIVE') return;

    try {
      const res = await chickenRoadService.crossLane(activeRoundId, laneIndex);
      soundManager.play('reveal_tick');
      setCurrentLane(res.current_lane);
      setCurrentMultiplier(res.current_multiplier);
      setNextMultiplier(res.next_multiplier);

    } catch (err) {
      console.error('Failed to register lane cross:', err);
    }
  }, [activeRoundId, gameState]);

  // Collision callback from canvas
  const handleCollision = useCallback(async (laneIndex: number) => {
    if (!activeRoundId || gameState !== 'ACTIVE') return;

    setGameState('LOST');
    setLossLane(laneIndex);
    soundManager.play('loss');

    try {
      await chickenRoadService.reportCollision(activeRoundId, laneIndex);
      setActiveRoundId(null);
    } catch (err) {
      console.error('Failed to report collision:', err);
    }
  }, [activeRoundId, gameState]);

  // Finish safe line reached callback from canvas
  const handleFinish = useCallback(async () => {
    if (!activeRoundId || gameState !== 'ACTIVE') return;

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
    }
  }, [activeRoundId, gameState]);

  // Cashout mid-game callback
  const handleCashout = async () => {
    if (!activeRoundId || gameState !== 'ACTIVE' || isActionLoading) return;
    setIsActionLoading(true);
    try {
      const res = await chickenRoadService.cashout(activeRoundId);
      soundManager.play('win_clap');
      setGameState('WON');
      setWinAmount(res.won_amount);
      setCurrentMultiplier(res.multiplier);
      if (res.wallet_balance !== undefined) {
        setBalance(res.wallet_balance);
      }
      setActiveRoundId(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to cash out';
      setErrorMessage(msg);
    } finally {
      setIsActionLoading(false);
    }
  };

  // Play again
  const handlePlayAgain = () => {
    setGameState('READY');
    setActiveRoundId(null);
    setCurrentLane(0);
    setCurrentMultiplier(1.0);
    setNextMultiplier(multipliers[0]);

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
              <span className="cr-hud-label">Points:</span>
              <span className="cr-hud-val text-amber-400 font-mono">
                {currentLane * 100} / 1000 Pts
              </span>
            </div>

            <div className="cr-hud-pill">
              <span className="cr-hud-label">Next:</span>
              <span className="cr-hud-val cr-hud-val--green">
                {gameState === 'ACTIVE' && currentLane < multipliers.length
                  ? `${nextMultiplier.toFixed(2)}x`
                  : `${multipliers[0]?.toFixed(2) || '1.03'}x`}
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
          {(gameState === 'WON' || (gameState as any) === 'CASHED_OUT') && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal cr-arcade-modal--win">
                <div className="cr-modal-badge">🏆</div>
                <h2 className="cr-modal-heading">YOU WON</h2>
                {currentLane >= 10 && (
                  <div className="bg-amber-500/20 text-amber-300 text-[11px] font-black px-3 py-1 rounded-full border border-amber-500/40 uppercase tracking-wide">
                    🎯 GOAL REACHED (1,000 PTS)
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
                      {currentLane * 100} Pts
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

          {/* Exit Confirmation Modal */}
          {showExitConfirm && (
            <div className="cr-overlay-backdrop">
              <div className="cr-arcade-modal">
                <div className="cr-modal-badge">🚪</div>
                <h2 className="cr-modal-heading">Exit Game?</h2>
                <p className="text-xs text-gray-300 m-0">
                  {gameState === 'ACTIVE'
                    ? 'An active round is currently in progress. Leaving now will forfeit your current round.'
                    : 'Are you sure you want to exit the game?'}
                </p>
                <div className="flex gap-3 w-full mt-2">
                  <button
                    type="button"
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-2 px-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowExitConfirm(false);
                      lockLandscape().catch(() => {});
                      navigate('/dashboard');
                    }}
                    className="flex-1 py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm transition"
                  >
                    Leave Game
                  </button>
                </div>
              </div>
            </div>
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
            disabled={gameState === 'ACTIVE' || betAmount <= 10}
            onClick={() => setBetAmount(10)}
            className="cr-stepper-bound-btn"
          >
            MIN
          </button>

          <div className="cr-stepper-input-box">
            <button
              type="button"
              disabled={gameState === 'ACTIVE' || betAmount <= 10}
              onClick={handleStepDown}
              className="cr-stepper-adj-btn"
            >
              -
            </button>
            <input
              type="number"
              disabled={gameState === 'ACTIVE'}
              readOnly
              value={betAmount}
              className="cr-stepper-input cursor-default"
            />
            <button
              type="button"
              disabled={gameState === 'ACTIVE' || betAmount >= 100}
              onClick={handleStepUp}
              className="cr-stepper-adj-btn"
            >
              +
            </button>
          </div>

          <button
            type="button"
            disabled={gameState === 'ACTIVE' || betAmount >= 100}
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
              disabled={gameState === 'ACTIVE'}
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
          {gameState === 'ACTIVE' ? (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={handleCashout}
              className="cr-play-btn"
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                borderColor: '#34D399',
                boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
              }}
            >
              <span className="cr-btn-icon-slot">
                <Coins size={16} className="text-yellow-300 animate-bounce" />
              </span>
              <span className="cr-btn-label">
                {isActionLoading
                  ? 'CASHING OUT...'
                  : `CASH OUT ₹${(betAmount * (currentLane > 0 ? currentMultiplier : 1.0)).toFixed(2)} (${(currentLane > 0 ? currentMultiplier : 1.0).toFixed(2)}x)`}
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
