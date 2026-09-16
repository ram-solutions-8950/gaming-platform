
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, ListOrdered, History, Zap, Play, RotateCw } from 'lucide-react';
import { walletService } from '../../services/wallet';
import * as api from '../../services/triple777/api';
import { SlotReels } from '../../components/triple777/SlotReels';
import { ResultPopup, type ResultVariant } from '../../components/triple777/ResultPopup';
import { PaytableModal } from '../../components/triple777/PaytableModal';
import { HistoryModal } from '../../components/triple777/HistoryModal';
import { soundManager } from '../../services/triple777/soundManager';
import { haptics } from '../../services/triple777/haptics';
import { REEL_STOPS_MS, REVEAL_BUFFER_MS, spinPace } from '../../services/triple777/spinTiming';
import triple777Logo from '../../assets/triple-777-logo.webp';
import { GameRulesModal } from '../../components/common/GameRulesModal';
import { TRIPLE_777_RULES_DATA } from '../../components/common/gameRulesData';
import { setNativePortrait, setNativeLandscape } from '../../utils/nativeOrientation';
import '../../styles/triple-777.css';

const BET_OPTIONS = [10, 20, 50, 100];
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
  const [isMobileLandscape, setIsMobileLandscape] = useState<boolean>(false);

  // Game States
  const [config, setConfig] = useState<api.Triple777Config | null>(null);
  const [jackpot, setJackpot] = useState<number>(50000);
  const [balance, setBalance] = useState<number>(0);
  const [stake, setStake] = useState<number>(10);
  const [turbo, setTurbo] = useState<boolean>(false);
  const [autoSpinsLeft, setAutoSpinsLeft] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
  const [showRules, setShowRules] = useState<boolean>(false);
  const [historyItems, setHistoryItems] = useState<api.HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [autoSummary, setAutoSummary] = useState<{ totalWon: number; totalSpins: number } | null>(null);

  const symbols = config?.symbols ?? ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL', 'STAR', 'COIN'];

  const spinLockRef = useRef(false);
  const userDismissedBlockerRef = useRef<boolean>(false);
  // Auto-spin & Turbo mode runtime state references
  const autoSpinActiveRef = useRef<boolean>(false);
  const autoSpinsRemainingRef = useRef<number>(0);
  const autoSpinTotalWonRef = useRef<number>(0);
  const autoSpinSpinsCountRef = useRef<number>(0);
  const autoSpinTimerRef = useRef<any>(null);
  const toastTimerRef = useRef<any>(null);
  const turboRef = useRef<boolean>(false);
  const balanceRef = useRef<number>(balance);
  balanceRef.current = balance;
  const stakeRef = useRef<number>(stake);
  stakeRef.current = stake;

  const handleToggleTurbo = useCallback(() => {
    soundManager.play('button_click');
    haptics.spin();
    setTurbo((prev) => {
      const next = !prev;
      turboRef.current = next;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage(
        next
          ? '⚡ TURBO MODE ACTIVATED: Spins are now 3× faster! Press SPIN or AUTO to play.'
          : '⚡ TURBO MODE DEACTIVATED: Normal spin speed restored'
      );
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 2600);
      return next;
    });
  }, []);

  const stopAutoSpin = useCallback(() => {
    autoSpinActiveRef.current = false;
    autoSpinsRemainingRef.current = 0;
    if (autoSpinTimerRef.current) {
      clearTimeout(autoSpinTimerRef.current);
      autoSpinTimerRef.current = null;
    }
    setAutoSpinsLeft(null);
  }, []);

  useEffect(() => {
    return () => {
      autoSpinActiveRef.current = false;
      if (autoSpinTimerRef.current) {
        clearTimeout(autoSpinTimerRef.current);
        autoSpinTimerRef.current = null;
      }
    };
  }, []);

  // Orientation Lock Helpers (Scoped strictly to Triple 777 via Android Native Activity & Bridge)
  const requestPortraitLock = async (): Promise<boolean> => {
    try {
      await setNativePortrait();
      setIsMobileLandscape(false);
      userDismissedBlockerRef.current = true;
      return true;
    } catch {
      return false;
    }
  };

  const restoreLandscapeLock = () => {
    try {
      setNativeLandscape().catch(() => {});
    } catch {
      // Ignored
    }
  };

  const handleExitClick = () => {
    if (spinning) return;
    setShowExitConfirm(true);
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    restoreLandscapeLock();
    navigate('/dashboard');
  };

  const handleRotateToPortrait = async () => {
    userDismissedBlockerRef.current = true;
    await requestPortraitLock();
    // Dismiss blocker and show full-viewport game directly
    setIsMobileLandscape(false);
  };

  // 1. Attempt Screen Orientation Lock & Synchronize Orientation Listener
  useEffect(() => {
    const initOrientation = async () => {
      const locked = await requestPortraitLock();
      if (!locked && checkIsMobileLandscape() && !userDismissedBlockerRef.current) {
        setIsMobileLandscape(true);
      } else {
        setIsMobileLandscape(false);
      }
    };

    initOrientation();

    const updateOrientation = () => {
      const isPortraitNow = window.innerHeight >= window.innerWidth;
      if (isPortraitNow) {
        setIsMobileLandscape(false);
      } else if (!userDismissedBlockerRef.current && checkIsMobileLandscape()) {
        setIsMobileLandscape(true);
      }
    };

    window.addEventListener('resize', updateOrientation, { passive: true });
    window.addEventListener('orientationchange', updateOrientation, { passive: true });

    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', updateOrientation);
    }

    return () => {
      // Restore application's original orientation (LANDSCAPE) on unmount/leave
      restoreLandscapeLock();

      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', updateOrientation);
      }
    };
  }, []);

  // 1b. Dynamic viewport-height fallback for reliable portrait fitting.
  // `100dvh` alone can misreport on some Android browsers/WebViews when the
  // OS gesture-navigation bar is present, which previously left the bottom
  // spin panel pushed below the visible fold. This tracks the actual visual
  // viewport height and exposes it as a CSS var the container prefers.
  useEffect(() => {
    const root = document.documentElement;
    const setAppHeight = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      root.style.setProperty('--t777-app-height', `${vh}px`);
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
      root.style.removeProperty('--t777-app-height');
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
    if (balanceRef.current < currentStake) {
      setErrorMessage('Insufficient balance to spin.');
      stopAutoSpin();
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
        balanceRef.current = response.balance;
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

        // Auto-spin sequencing
        if (autoSpinActiveRef.current) {
          autoSpinTotalWonRef.current += (response.won ? response.payout : 0);
          autoSpinSpinsCountRef.current += 1;
          const remaining = autoSpinsRemainingRef.current - 1;
          autoSpinsRemainingRef.current = remaining;
          setAutoSpinsLeft(remaining > 0 ? remaining : null);

          // On big win / jackpot in auto mode, celebrate with popup
          if (response.tier === 'jackpot' || response.tier === 'bigwin') {
            setShowResultPopup(true);
          }

          if (remaining <= 0 || response.balance < currentStake) {
            const completedWon = autoSpinTotalWonRef.current;
            const completedCount = autoSpinSpinsCountRef.current;
            stopAutoSpin();
            if (completedCount > 0) {
              setAutoSummary({ totalWon: completedWon, totalSpins: completedCount });
            }
            if (response.balance < currentStake && remaining > 0) {
              setErrorMessage('Auto spin stopped: Insufficient balance.');
            }
          } else {
            // Snappy auto advance: 200ms in turbo, 700ms in normal
            const nextSpinDelay = isTurbo ? 200 : 700;
            autoSpinTimerRef.current = setTimeout(() => {
              if (autoSpinActiveRef.current) {
                handleSpin(stakeRef.current, turboRef.current);
              }
            }, nextSpinDelay);
          }
        } else {
          // Manual spin: Display outcome popup with turbo-adapted snappy timing
          setShowResultPopup(true);
        }
      }, revealDelay);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Spin failed';
      setErrorMessage(msg);
      setSpinning(false);
      spinLockRef.current = false;
      stopAutoSpin();
    }
  }, [stopAutoSpin]);

  // 4. Handle result popup close
  const handleCloseResultPopup = useCallback(() => {
    setShowResultPopup(false);
  }, []);

  // 5. Auto spin toggle
  const toggleAutoSpin = useCallback(() => {
    if (autoSpinActiveRef.current) {
      stopAutoSpin();
    } else {
      if (balanceRef.current < stakeRef.current) {
        setErrorMessage('Insufficient balance for auto spin.');
        return;
      }
      autoSpinTotalWonRef.current = 0;
      autoSpinSpinsCountRef.current = 0;
      setAutoSummary(null);
      autoSpinActiveRef.current = true;
      autoSpinsRemainingRef.current = AUTO_SPIN_COUNT;
      setAutoSpinsLeft(AUTO_SPIN_COUNT);
      handleSpin(stakeRef.current, turboRef.current);
    }
  }, [stopAutoSpin, handleSpin]);

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

          <button
            type="button"
            onClick={handleRotateToPortrait}
            className="t777-blocker-badge"
            style={{ cursor: 'pointer', background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(251, 191, 36, 0.4)' }}
          >
            <RotateCw size={14} className="text-amber-400" />
            <span>Rotate to portrait</span>
          </button>

          <button
            type="button"
            onClick={handleExitClick}
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
            onClick={handleExitClick}
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

            <button
              type="button"
              onClick={() => setShowRules(true)}
              className="t777-header-btn !border-amber-500/40 text-amber-300"
              title="Rules"
            >
              <span>❓</span>
              <span className="hidden xs:inline">Rules</span>
            </button>

            <div className="t777-balance-pill">
              <span className="text-[10px] text-gray-400 uppercase font-bold">₹</span>
              <span className="t777-balance-text">{balance.toFixed(2)}</span>
            </div>
          </div>
        </header>

        {/* ── 2. Main Slot Machine Stage (Portrait) ── */}
        <main className="t777-stage relative">
          {/* Floating Toast Notification */}
          {toastMessage && (
            <div className="t777-floating-toast" role="status" aria-live="polite">
              <Zap size={14} className="fill-amber-300 text-amber-200 shrink-0 animate-pulse" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Jackpot Banner */}
          <div className="t777-jackpot-banner">
            <span className="t777-jackpot-tag">👑 JACKPOT</span>
            <span className="t777-jackpot-val">₹{jackpot.toLocaleString()}</span>
          </div>

          {/* Turbo Mode Active Badge */}
          {turbo && (
            <div className="t777-turbo-badge" title="Turbo Mode active: 3× faster reel spins">
              <Zap size={13} className="fill-amber-300 text-amber-100 animate-pulse shrink-0" />
              <span>⚡ TURBO: 3× Spin Speed Active</span>
            </div>
          )}

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
                disabled={spinning || autoSpinsLeft !== null || stake <= 10}
                onClick={() => {
                  const idx = BET_OPTIONS.indexOf(stake);
                  const newStake = idx > 0 ? BET_OPTIONS[idx - 1] : 10;
                  setStake(newStake);
                  stakeRef.current = newStake;
                }}
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
                disabled={spinning || autoSpinsLeft !== null || stake >= 100}
                onClick={() => {
                  const idx = BET_OPTIONS.indexOf(stake);
                  const newStake = idx !== -1 && idx < BET_OPTIONS.length - 1 ? BET_OPTIONS[idx + 1] : 100;
                  setStake(newStake);
                  stakeRef.current = newStake;
                }}
                className="t777-stepper-btn"
                aria-label="Increase Bet"
              >
                +
              </button>
            </div>

            {/* Quick Bet Chips: 10, 20, 50, 100 */}
            <div className="t777-quick-chips">
              {BET_OPTIONS.map((chipStake) => (
                <button
                  key={chipStake}
                  type="button"
                  disabled={spinning || autoSpinsLeft !== null}
                  onClick={() => {
                    setStake(chipStake);
                    stakeRef.current = chipStake;
                  }}
                  className={`t777-chip-btn ${stake === chipStake ? 't777-chip-btn--active' : ''}`}
                >
                  ₹{chipStake}
                </button>
              ))}
            </div>
          </div>

          {/* Row 2: Turbo + Auto + Large Spin Button */}
          <div className="t777-actions-row">
            {/* Turbo Mode Toggle Switch */}
            <button
              type="button"
              onClick={handleToggleTurbo}
              className={`t777-toggle-btn t777-toggle-btn--turbo ${
                turbo ? 't777-toggle-btn--active t777-toggle-btn--turbo-active' : ''
              }`}
              title={
                turbo
                  ? 'Turbo Mode: ON (Click to switch to normal speed)'
                  : 'Turbo Mode: OFF (Click to switch to 3× fast speed)'
              }
              aria-label={turbo ? 'Turbo Mode ON' : 'Turbo Mode OFF'}
              aria-pressed={turbo}
            >
              <Zap size={16} className={turbo ? 'fill-amber-300 text-amber-100 animate-pulse' : 'text-slate-400'} />
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[10px] font-black tracking-wide">TURBO</span>
                <div className={`t777-switch-badge ${turbo ? 't777-switch-badge--on' : 't777-switch-badge--off'}`}>
                  <span className="t777-switch-dot" />
                  <span>{turbo ? 'ON (3×)' : 'OFF'}</span>
                </div>
              </div>
            </button>

            {/* Auto Spin Toggle */}
            <button
              type="button"
              onClick={toggleAutoSpin}
              className={`t777-toggle-btn t777-toggle-btn--auto ${
                autoSpinsLeft !== null ? 't777-toggle-btn--active' : ''
              }`}
              title={
                autoSpinsLeft !== null
                  ? 'Click to Stop Auto Spin'
                  : turbo
                  ? 'Auto Spin: 10 Fast Turbo Rounds'
                  : 'Auto Spin: 10 Consecutive Rounds'
              }
              aria-label={autoSpinsLeft !== null ? 'Stop Auto Spin' : 'Start Auto Spin'}
            >
              <RotateCcw
                size={15}
                className={autoSpinsLeft !== null ? 'animate-spin text-white' : 'text-slate-400'}
              />
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[10px] font-black tracking-wide">
                  {autoSpinsLeft !== null ? 'STOP' : 'AUTO'}
                </span>
                <span
                  className={`text-[8px] font-extrabold ${
                    autoSpinsLeft !== null
                      ? 'text-red-100'
                      : turbo
                      ? 'text-amber-200'
                      : 'text-slate-400'
                  }`}
                >
                  {autoSpinsLeft !== null ? `${autoSpinsLeft} LEFT` : turbo ? '⚡ 10 FAST' : '10 SPINS'}
                </span>
              </div>
            </button>

            {/* Large Glossy Green / Amber Turbo SPIN Button */}
            <button
              type="button"
              disabled={spinning || autoSpinsLeft !== null}
              onClick={() => handleSpin(stake, turbo)}
              className={`t777-spin-btn ${turbo ? 't777-spin-btn--turbo' : ''}`}
              aria-label={turbo ? `Turbo Spin ₹${stake}` : `Spin ₹${stake}`}
            >
              {turbo ? <Zap size={20} className="fill-amber-300 text-amber-100 animate-pulse" /> : <Play size={20} fill="#052e16" />}
              <div className="flex flex-col items-center leading-none">
                <span>
                  {spinning
                    ? (turbo ? '⚡ FAST SPINNING...' : 'SPINNING...')
                    : (turbo ? `⚡ TURBO SPIN ₹${stake}` : `SPIN ₹${stake}`)}
                </span>
                {turbo && !spinning && (
                  <span className="text-[8.5px] font-black tracking-widest text-amber-200 mt-0.5">
                    3× ULTRA FAST
                  </span>
                )}
              </div>
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
            isTurbo={turbo}
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

        {showRules && (
          <GameRulesModal
            title={TRIPLE_777_RULES_DATA.title}
            subtitle={TRIPLE_777_RULES_DATA.subtitle}
            sections={TRIPLE_777_RULES_DATA.sections}
            payouts={TRIPLE_777_RULES_DATA.payouts}
            tips={TRIPLE_777_RULES_DATA.tips}
            onClose={() => setShowRules(false)}
          />
        )}

        {/* ── Exit Confirmation Modal (BUG-009) ── */}
        {showExitConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border border-amber-500/40 p-6 shadow-2xl text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <ArrowLeft size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Leave Game?</h3>
              <p className="text-sm text-slate-300 mb-6">
                Are you sure you want to exit Triple 777 and return to the dashboard?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 active:scale-95 transition border border-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExit}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 shadow-lg shadow-red-900/30 transition cursor-pointer"
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Auto Spin Summary Modal (BUG-006) ── */}
        {autoSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-sm rounded-2xl bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-900 border border-amber-400/50 p-6 shadow-2xl text-center">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-2xl animate-bounce">
                🏆
              </div>
              <h3 className="text-xl font-black text-amber-400 mb-1 tracking-wide">
                AUTO SPINS COMPLETE
              </h3>
              <p className="text-xs text-slate-300 mb-4">
                All {autoSummary.totalSpins} auto spins finished!
              </p>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Total Won
                </div>
                <div className={`text-2xl font-black ${autoSummary.totalWon > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
                  ₹{autoSummary.totalWon.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoSummary(null)}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 active:scale-95 shadow-lg shadow-amber-500/25 transition cursor-pointer"
              >
                Continue Playing
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
