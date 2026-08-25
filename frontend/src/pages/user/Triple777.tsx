import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCcw, ListOrdered, History, Zap, Play, RotateCw } from 'lucide-react';
import { walletService } from '../../services/wallet';
import * as api from '../../services/triple777/api';
import { SlotReels } from '../../components/triple777/SlotReels';
import { ResultPopup, type ResultVariant } from '../../components/triple777/ResultPopup';
import { PaytableModal } from '../../components/triple777/PaytableModal';
import { HistoryModal } from '../../components/triple777/HistoryModal';
import { soundManager } from '../../services/triple777/soundManager';
import { haptics } from '../../services/triple777/haptics';
import { REEL_STOPS_MS, REVEAL_BUFFER_MS, spinPace } from '../../services/triple777/spinTiming';
import triple777Logo from '../../assets/triple-777-logo.png';
import '../../styles/triple-777.css';

const QUICK_MULTIPLIERS = [1, 2, 5, 10];
const AUTO_SPIN_COUNT = 10;

function checkIsMobileLandscape(): boolean {
  if (typeof window === 'undefined') return false;
  const isMobile = window.innerWidth <= 768 || window.innerHeight <= 500;
  const isLandscape = window.innerWidth > window.innerHeight;
  return isMobile && isLandscape && window.innerHeight <= 500;
}

export function Triple777Page() {
  const navigate = useNavigate();

  // Orientation State
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(() => checkIsMobileLandscape());

  // Game States
  const [config, setConfig] = useState<api.Triple777Config | null>(null);
  const [jackpot, setJackpot] = useState<number>(50000);
  const [balance, setBalance] = useState<number>(0);
  const [stake, setStake] = useState<number>(10);
  const [turbo, setTurbo] = useState<boolean>(false);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number | null>(null);

  const [spinning, setSpinning] = useState<boolean>(false);
  const [spinReels, setSpinReels] = useState<[string, string, string]>(['7', 'BAR', 'CHERRY']);
  const [spinToken, setSpinToken] = useState<number>(0);
  const [spinPaceVal, setSpinPaceVal] = useState<ReturnType<typeof spinPace>>('normal');

  const [lastOutcome, setLastOutcome] = useState<{
    result: api.SpinResponse;
    stake: number;
  } | null>(null);
  const [lastWinAmount, setLastWinAmount] = useState<number>(0);

  const [showResultPopup, setShowResultPopup] = useState<boolean>(false);
  const [showPaytable, setShowPaytable] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<api.HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const minBet = config?.min_bet ?? 10;
  const maxBet = config?.max_bet ?? 10000;
  const symbols = config?.symbols ?? ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL', 'STAR', 'COIN'];

  const spinLockRef = useRef(false);

  // 1. Attempt Screen Orientation Lock & Synchronize Orientation Listener
  useEffect(() => {
    try {
      if (window.screen?.orientation && typeof (window.screen.orientation as any).lock === 'function') {
        (window.screen.orientation as any).lock('portrait-primary').catch(() => {});
      }
    } catch {
      // Ignored
    }

    const updateOrientation = () => {
      setIsMobileLandscape(checkIsMobileLandscape());
    };

    window.addEventListener('resize', updateOrientation, { passive: true });
    window.addEventListener('orientationchange', updateOrientation, { passive: true });

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', updateOrientation);
    }

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', updateOrientation);
      }
    };
  }, []);

  // 2. Fetch initial config, jackpot, and wallet balance
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [cfg, jpk, walletData] = await Promise.all([
          api.getConfig(),
          api.getJackpot(),
          walletService.getWallet().catch(() => null),
        ]);
        if (isMounted) {
          setConfig(cfg);
          setJackpot(jpk);
          setStake(cfg.min_bet || 10);
          if (walletData) {
            setBalance(walletData.balance / 100);
          }
        }
      } catch (err) {
        console.error('Failed to load Triple 777 configuration', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // 3. Handle spin execution
  const handleSpin = useCallback(async (currentStake: number, isTurbo: boolean) => {
    if (spinLockRef.current) return;
    if (balance < currentStake) {
      setErrorMessage('Insufficient balance. Please add cash to spin.');
      setAutoSpinsLeft(null);
      return;
    }

    spinLockRef.current = true;
    setSpinning(true);
    setErrorMessage(null);
    setShowResultPopup(false);

    haptics.spin();
    soundManager.play('reel_spin');

    try {
      const response = await api.spin(currentStake);

      const pace = spinPace(isTurbo, response.tier === 'jackpot');
      setSpinReels(response.reels);
      setSpinPaceVal(pace);
      setSpinToken((t) => t + 1);

      const revealDelay = REEL_STOPS_MS[pace][2] + REVEAL_BUFFER_MS[pace];

      window.setTimeout(() => {
        setLastOutcome({ result: response, stake: currentStake });
        setLastWinAmount(response.won ? response.payout : 0);
        setJackpot(response.jackpot_amount);
        setBalance(response.balance);
        setSpinning(false);
        spinLockRef.current = false;

        haptics.reelStop();
        if (response.jackpot_won > 0) {
          soundManager.play('777_win');
          haptics.win();
        } else if (response.won) {
          soundManager.play(response.tier === 'bigwin' ? 'big_win' : 'small_win');
          haptics.win();
        } else {
          soundManager.play('reel_stop');
        }

        setShowResultPopup(true);
      }, revealDelay);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Spin failed';
      setErrorMessage(msg);
      setSpinning(false);
      spinLockRef.current = false;
      setAutoSpinsLeft(null);
    }
  }, [balance]);

  // 4. Handle result popup close & Auto Spin chaining
  const handleCloseResultPopup = useCallback(() => {
    setShowResultPopup(false);
    if (autoSpinsLeft !== null) {
      if (autoSpinsLeft <= 1 || errorMessage || balance < stake) {
        setAutoSpinsLeft(null);
      } else {
        setAutoSpinsLeft((prev) => (prev ? prev - 1 : null));
        handleSpin(stake, turbo);
      }
    }
  }, [autoSpinsLeft, errorMessage, balance, stake, turbo, handleSpin]);

  // 5. Auto spin toggle
  const toggleAutoSpin = () => {
    if (autoSpinsLeft !== null) {
      setAutoSpinsLeft(null);
    } else {
      if (balance < stake) {
        setErrorMessage('Insufficient balance for auto spin.');
        return;
      }
      setAutoSpinsLeft(AUTO_SPIN_COUNT);
      handleSpin(stake, turbo);
    }
  };

  // 6. Open history
  const openHistoryModal = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const items = await api.getHistory();
      setHistoryItems(items);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  let popupVariant: ResultVariant = 'loss';
  let popupAmount = 0;
  if (lastOutcome) {
    const r = lastOutcome.result;
    if (r.tier === 'jackpot') popupVariant = 'jackpot';
    else if (r.tier === 'bigwin') popupVariant = 'bigwin';
    else if (r.won) popupVariant = 'win';
    else popupVariant = 'loss';

    popupAmount = r.won ? r.payout : lastOutcome.stake;
  }

  return (
    <>
      {/* ── Landscape Blocker (Only on small mobile phones in landscape) ── */}
      <div className="t777-landscape-blocker" style={isMobileLandscape ? { display: 'flex' } : { display: 'none' }}>
        <div className="t777-blocker-card">
          <img src={triple777Logo} alt="Triple 777" className="t777-blocker-logo" />

          <h2 className="t777-blocker-title">TRIPLE 777</h2>
          <p className="t777-blocker-subtitle">Please rotate your device</p>
          <p className="t777-blocker-desc">
            Triple 777 is designed exclusively for portrait mode.
          </p>

          <div className="t777-blocker-badge">
            <RotateCw size={14} className="text-amber-400 animate-spin" />
            <span>Rotate to portrait</span>
          </div>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="mt-3 px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold border border-white/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft size={14} /> Exit to Lobby
          </button>
        </div>
      </div>

      {/* ── Portrait-Optimized Game Page ── */}
      <div className="t777-container" style={isMobileLandscape ? { display: 'none' } : { display: 'flex' }}>
        {/* ── 1. Arcade Header ── */}
        <header className="t777-header">
          <button
            type="button"
            disabled={spinning}
            onClick={() => navigate('/dashboard')}
            className="t777-header-back-btn"
            aria-label="Back to Dashboard"
          >
            <ArrowLeft size={18} />
            <span>Exit</span>
          </button>

          <div className="t777-header-logo-wrap">
            <img src={triple777Logo} alt="Triple 777" className="t777-header-logo" />
          </div>

          <div className="t777-header-right">
            <button
              type="button"
              onClick={() => setShowPaytable(true)}
              className="t777-header-btn"
              title="Paytable"
            >
              <ListOrdered size={16} />
              <span className="hidden xs:inline">Paytable</span>
            </button>

            <button
              type="button"
              onClick={openHistoryModal}
              className="t777-header-btn"
              title="History"
            >
              <History size={16} />
              <span className="hidden xs:inline">History</span>
            </button>

            <div className="t777-balance-pill">
              <span className="text-[10px] text-gray-400 uppercase font-bold">₹</span>
              <span className="t777-balance-text">{balance.toFixed(2)}</span>
              <button
                type="button"
                onClick={() => navigate('/deposit')}
                className="t777-add-cash"
                title="Add Cash"
                aria-label="Add Cash"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </header>

        {/* ── 2. Main Slot Machine Stage (Portrait) ── */}
        <main className="t777-stage">
          {/* Jackpot Banner */}
          <div className="t777-jackpot-banner">
            <span className="t777-jackpot-tag">👑 JACKPOT</span>
            <span className="t777-jackpot-val">₹{jackpot.toLocaleString()}</span>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/40 px-3 py-1 text-xs text-red-300">
              {errorMessage}
            </div>
          )}

          {/* 3-Reel Machine */}
          <SlotReels
            symbols={symbols}
            reels={spinReels}
            spinToken={spinToken}
            pace={spinPaceVal}
          />

          {/* Win Meter */}
          <div className="t777-win-meter">
            <span className="t777-win-label">WIN</span>
            <span className="t777-win-amount">
              ₹{lastWinAmount > 0 ? lastWinAmount.toFixed(2) : '0.00'}
            </span>
          </div>
        </main>

        {/* ── 3. Bottom Betting & Spin Controls (Stacked Portrait) ── */}
        <footer className="t777-bottom-panel">
          {/* Row 1: Bet Stepper + Quick Chips */}
          <div className="t777-controls-row">
            {/* Bet Stepper: [- | Stake | +] */}
            <div className="t777-stepper-group">
              <button
                type="button"
                disabled={spinning || autoSpinsLeft !== null || stake <= minBet}
                onClick={() => setStake((s) => Math.max(minBet, s - minBet))}
                className="t777-stepper-btn"
                aria-label="Decrease Bet"
              >
                −
              </button>
              <div className="t777-stake-display">
                <span className="t777-stake-label">BET</span>
                <span className="t777-stake-val">₹{stake}</span>
              </div>
              <button
                type="button"
                disabled={spinning || autoSpinsLeft !== null || stake >= maxBet}
                onClick={() => setStake((s) => Math.min(maxBet, s + minBet))}
                className="t777-stepper-btn"
                aria-label="Increase Bet"
              >
                +
              </button>
            </div>

            {/* Quick Multiplier Chips */}
            <div className="t777-quick-chips">
              {QUICK_MULTIPLIERS.map((m) => {
                const chipStake = Math.min(maxBet, minBet * m);
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={spinning || autoSpinsLeft !== null}
                    onClick={() => setStake(chipStake)}
                    className={`t777-chip-btn ${stake === chipStake ? 't777-chip-btn--active' : ''}`}
                  >
                    {m}x
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Turbo + Auto + Large Spin Button */}
          <div className="t777-actions-row">
            {/* Turbo Toggle */}
            <button
              type="button"
              disabled={spinning}
              onClick={() => setTurbo((t) => !t)}
              className={`t777-toggle-btn t777-toggle-btn--turbo ${
                turbo ? 't777-toggle-btn--active' : ''
              }`}
              title="Turbo Mode"
            >
              <Zap size={16} />
              <span>TURBO</span>
            </button>

            {/* Auto Spin Toggle */}
            <button
              type="button"
              disabled={spinning && autoSpinsLeft === null}
              onClick={toggleAutoSpin}
              className={`t777-toggle-btn t777-toggle-btn--auto ${
                autoSpinsLeft !== null ? 't777-toggle-btn--active' : ''
              }`}
              title="Auto Spin"
            >
              <RotateCcw size={16} />
              <span>{autoSpinsLeft !== null ? `AUTO ${autoSpinsLeft}` : 'AUTO'}</span>
            </button>

            {/* Large Glossy Green SPIN Button */}
            <button
              type="button"
              disabled={spinning || autoSpinsLeft !== null}
              onClick={() => handleSpin(stake, turbo)}
              className="t777-spin-btn"
              aria-label="Spin Slot Machine"
            >
              <Play size={20} fill="#052e16" />
              <span>{spinning ? 'SPINNING...' : `SPIN ₹${stake}`}</span>
            </button>
          </div>
        </footer>

        {/* ── 4. Modals ── */}
        {showResultPopup && lastOutcome && (
          <ResultPopup
            variant={popupVariant}
            amount={popupAmount}
            bet={lastOutcome.stake}
            multiplier={lastOutcome.result.multiplier}
            symbols={lastOutcome.result.reels}
            onClose={handleCloseResultPopup}
          />
        )}

        {showPaytable && (
          <PaytableModal
            config={config}
            onClose={() => setShowPaytable(false)}
          />
        )}

        {showHistory && (
          <HistoryModal
            items={historyItems}
            loading={historyLoading}
            onClose={() => setShowHistory(false)}
          />
        )}
      </div>
    </>
  );
}
