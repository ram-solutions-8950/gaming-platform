import { useState, useEffect, useCallback } from 'react';
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
  ShieldCheck,
  Sparkles,
  Flame,
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

const DEFAULT_MULTIPLIERS: Record<Difficulty, number[]> = {
  EASY: [1.01, 1.03, 1.06, 1.10, 1.15, 1.19, 1.24, 1.30, 1.40, 1.50],
  MEDIUM: [1.03, 1.08, 1.15, 1.25, 1.38, 1.55, 1.75, 2.05, 2.45, 3.00],
  HARD: [1.05, 1.15, 1.30, 1.55, 1.90, 2.40, 3.10, 4.20, 6.00, 10.00],
};

const QUICK_BETS = [5, 10, 20, 30];

export function ChickenRoadPage() {
  const navigate = useNavigate();

  // Game States
  const [gameState, setGameState] = useState<GameStatus>('READY');
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('EASY');
  const [currentLane, setCurrentLane] = useState<number>(0);
  const [multipliers, setMultipliers] = useState<number[]>(DEFAULT_MULTIPLIERS.EASY);
  const [currentMultiplier, setCurrentMultiplier] = useState<number>(1.0);
  const [nextMultiplier, setNextMultiplier] = useState<number>(DEFAULT_MULTIPLIERS.EASY[0]);
  const [potentialWin, setPotentialWin] = useState<number>(10);
  const [winAmount, setWinAmount] = useState<number>(0);
  const [lossLane, setLossLane] = useState<number | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

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
            gameStateData.next_multiplier || DEFAULT_MULTIPLIERS[gameStateData.difficulty || 'EASY'][0]
          );
          setPotentialWin(gameStateData.potential_win || gameStateData.bet_amount || 10);
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

    try {
      const res = await chickenRoadService.startGame(betAmount, difficulty);
      soundManager.play('bet_coin');
      setActiveRoundId(res.round_id);
      setGameState('ACTIVE');
      setCurrentLane(0);
      setCurrentMultiplier(1.0);
      setNextMultiplier(res.next_multiplier || multipliers[0]);
      setPotentialWin(res.potential_win || betAmount);
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
  const handleLaneCross = async (laneIndex: number) => {
    if (!activeRoundId || gameState !== 'ACTIVE') return;

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

  // Collision callback from canvas
  const handleCollision = async (laneIndex: number) => {
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
  };

  // Finish safe line reached callback from canvas
  const handleFinish = async () => {
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
  };

  // Cashout mid-round
  const handleCashout = async () => {
    if (!activeRoundId || gameState !== 'ACTIVE' || isActionLoading) return;

    setIsActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await chickenRoadService.cashout(activeRoundId);
      soundManager.play('cashout');
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
    setPotentialWin(betAmount);
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
                  : `${multipliers[0]?.toFixed(2) || '1.01'}x`}
              </span>
            </div>

            <div className="cr-hud-pill">
              <span className="cr-hud-label">Cashout:</span>
              <span className="cr-hud-val cr-hud-val--win">
                ₹{potentialWin.toFixed(2)}
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
                    <span>Cash out anytime or reach the finish line safe zone!</span>
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
          {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((diff) => (
            <button
              key={diff}
              type="button"
              disabled={gameState === 'ACTIVE'}
              onClick={() => handleDifficultyChange(diff)}
              className={`cr-diff-pill ${
                difficulty === diff ? `cr-diff-pill--active cr-diff-pill--${diff.toLowerCase()}` : ''
              }`}
            >
              {diff === 'EASY' && <ShieldCheck size={12} className="inline mr-1" />}
              {diff === 'MEDIUM' && <Sparkles size={12} className="inline mr-1" />}
              {diff === 'HARD' && <Flame size={12} className="inline mr-1 text-red-400" />}
              <span>{diff.charAt(0) + diff.slice(1).toLowerCase()}</span>
            </button>
          ))}
        </div>

        {/* Large Green PLAY Button / Glowing CASH OUT Button */}
        <div className="cr-play-action-wrap">
          {gameState === 'READY' ? (
            <button
              type="button"
              disabled={isActionLoading || betAmount <= 0}
              onClick={handleStartGame}
              className="cr-play-btn"
            >
              <Play size={18} fill="#FFFFFF" />
              <span>{isActionLoading ? 'STARTING...' : `PLAY ₹${betAmount}`}</span>
            </button>
          ) : gameState === 'ACTIVE' ? (
            <button
              type="button"
              disabled={isActionLoading}
              onClick={handleCashout}
              className="cr-cashout-btn"
            >
              <Coins size={18} />
              <span>{isActionLoading ? 'CASHING...' : `CASH OUT ₹${potentialWin.toFixed(2)}`}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePlayAgain}
              className="cr-play-btn"
            >
              <RotateCcw size={16} />
              <span>PLAY AGAIN</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
