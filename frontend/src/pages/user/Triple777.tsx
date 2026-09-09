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

  const symbols = config?.symbols ?? ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL', 'STAR', 'COIN'];

  const spinLockRef = useRef(false);
  const userDismissedBlockerRef = useRef(false);

  // Auto spin & Turbo runtime refs (BUG-010)
  const autoSpinActiveRef = useRef<boolean>(false);
  const autoSpinsRemainingRef = useRef<number>(0);
  const autoSpinTimerRef = useRef<any>(null);
  const turboRef = useRef<boolean>(false);
  const balanceRef = useRef<number>(balance);
  balanceRef.current = balance;
  const stakeRef = useRef<number>(stake);
  stakeRef.current = stake;

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

  const handleExitToLobby = () => {
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
      setErrorMessage('Insufficient balance. Please add cash to spin.');
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

        // Auto spin chaining (BUG-010)
        if (autoSpinActiveRef.current) {
          const remaining = autoSpinsRemainingRef.current - 1;
          autoSpinsRemainingRef.current = remaining;
          setAutoSpinsLeft(remaining > 0 ? remaining : null);

          // On big win / jackpot in auto mode, celebrate with popup
          if (response.tier === 'jackpot' || response.tier === 'bigwin') {
            setShowResultPopup(true);
          }

          if (remaining <= 0 || response.balance < currentStake) {
            stopAutoSpin();
            if (response.balance < currentStake && remaining > 0) {
              setErrorMessage('Auto spin stopped: Insufficient balance.');
            }
          } else {
            // Snappy auto advance: 350ms in turbo, 700ms in normal
            const nextSpinDelay = isTurbo ? 350 : 700;
            autoSpinTimerRef.current = setTimeout(() => {
              if (autoSpinActiveRef.current) {
                handleSpin(stakeRef.current, turboRef.current);
              }
            }, nextSpinDelay);
          }
        } else {
          // Manual spin: display clear win/loss result popup (BUG-008)
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
            onClick={handleExitToLobby}
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
            onClick={handleExitToLobby}
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
          {/* Row 1: Bet Stepper + Quick Chips strictly [10, 20, 50, 100] (BUG-011) */}
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

            {/* Quick Bet Chips: 10, 20, 50, 100 (BUG-011) */}
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

          {/* Row 2: Turbo + Auto + Large Spin Button (BUG-010) */}
          <div className="t777-actions-row">
            {/* Turbo Toggle */}
            <button
              type="button"
              onClick={() => {
                setTurbo((prev) => {
                  const next = !prev;
                  turboRef.current = next;
                  return next;
                });
              }}
              className={`t777-toggle-btn t777-toggle-btn--turbo ${
                turbo ? 't777-toggle-btn--active' : ''
              }`}
              title="Turbo Mode: Fast 2× Spin Speed"
            >
              <Zap size={15} className={turbo ? 'fill-amber-300 text-amber-200' : 'text-slate-400'} />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-black">TURBO</span>
                <span className={`text-[8px] font-bold ${turbo ? 'text-amber-100' : 'text-slate-400'}`}>
                  {turbo ? '2× FAST' : 'OFF'}
                </span>
              </div>
            </button>

            {/* Auto Spin Toggle */}
            <button
              type="button"
              onClick={toggleAutoSpin}
              className={`t777-toggle-btn t777-toggle-btn--auto ${
                autoSpinsLeft !== null ? 't777-toggle-btn--active' : ''
              }`}
              title={autoSpinsLeft !== null ? 'Click to Stop Auto Spin' : 'Auto Spin: 10 Consecutive Rounds'}
            >
              <RotateCcw
                size={15}
                className={autoSpinsLeft !== null ? 'animate-spin text-white' : 'text-slate-400'}
              />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-black">
                  {autoSpinsLeft !== null ? 'STOP' : 'AUTO'}
                </span>
                <span className={`text-[8px] font-bold ${autoSpinsLeft !== null ? 'text-red-100' : 'text-slate-400'}`}>
                  {autoSpinsLeft !== null ? `${autoSpinsLeft} LEFT` : '10 SPINS'}
                </span>
              </div>
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
              <span>{spinning ? (turbo ? 'FAST SPINNING...' : 'SPINNING...') : `SPIN ₹${stake}`}</span>
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
      </div>
    </>
  );
}
