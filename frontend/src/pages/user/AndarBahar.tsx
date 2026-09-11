import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CardView } from "../../components/andarBahar/CardView";
import { HistoryPanel } from "../../components/andarBahar/HistoryPanel";
import type { Card } from "../../game/andarBahar/deck";
import { rankLabel } from "../../game/andarBahar/deck";
import type { Side } from "../../game/andarBahar/andarBahar";
import { PAYOUT } from "../../game/andarBahar/andarBahar";
import {
  getCurrentRound,
  getRoundHistory,
  placeBet as placeBetApi,
  getRealBalance,
  type HistoryEntry,
  SLUG,
} from "../../services/andarBahar";
import type { GameRound } from "../../types";
import { soundManager } from "../../services/soundManager";
import { getWebSocketUrl } from "../../utils/ws";
import { setNativeLandscape } from "../../utils/nativeOrientation";
import { GameRulesModal } from "../../components/common/GameRulesModal";
import { ANDAR_BAHAR_RULES_DATA } from "../../components/common/gameRulesData";
import "../../styles/andar-bahar.css";

type Phase = "betting" | "closed" | "dealing" | "result";

const MIN_STAKE = 50;
const CHIPS = [50, 100, 500, 1000, 5000];
const STAKE_STEP = 10;

export function AndarBaharPage() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(1000);
  const [stake, setStake] = useState<number>(MIN_STAKE);
  const [phase, setPhase] = useState<Phase>("betting");
  const [myBet, setMyBet] = useState<{ side: Side; amount: number; roundId: string } | null>(null);
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [middle, setMiddle] = useState<Card | null>(null);
  const [andar, setAndar] = useState<Card[]>([]);
  const [bahar, setBahar] = useState<Card[]>([]);
  const [resultBanner, setResultBanner] = useState<{
    type: "win" | "lose" | "neutral";
    title: string;
    amount?: number;
    subText?: string;
  } | null>(null);
  const [winningSide, setWinningSide] = useState<Side | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [calcCountdown, setCalcCountdown] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [soundOn, setSoundOn] = useState(() => !soundManager.isMuted());
  const [rulesPopup, setRulesPopup] = useState<"how" | "rules" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const timers = useRef<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isAnimatingRef = useRef(false);
  const activeAnimatingRoundIdRef = useRef<string | null>(null);
  const lastProcessedResultRef = useRef<string | null>(null);
  const currentRoundIdRef = useRef<string | null>(null);
  const myBetRef = useRef<{ side: Side; amount: number; roundId: string } | null>(null);
  const isPlacingBetRef = useRef(false);
  const pendingRoundStartRef = useRef<{
    roundId: string;
    gameId?: string;
    startedAt?: string;
    bettingClosesAt?: string;
    secondsRemaining?: number;
  } | null>(null);
  const pendingResultRef = useRef<{ rd: any; roundId: string } | null>(null);
  const storedServerResultRef = useRef<{ rd: any; roundId: string } | null>(null);
  const calcCountdownRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("betting");

  useEffect(() => {
    calcCountdownRef.current = calcCountdown;
  }, [calcCountdown]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Sync and toggle sound through central soundManager
  const handleToggleSound = () => {
    const isMuted = soundManager.toggleMute();
    setSoundOn(!isMuted);
  };
  // Lock orientation to landscape on mount and handle sound manager
  useEffect(() => {
    setNativeLandscape().catch(() => {});
    setSoundOn(!soundManager.isMuted());
    const unlock = () => {
      soundManager.init();
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Refresh balance from server
  const refreshBalance = useCallback(async () => {
    try {
      const b = await getRealBalance();
      setBalance(b);
    } catch {
      // ignore
    }
  }, []);

  // Format server rounds into history entries
  const formatHistory = useCallback((rounds: GameRound[]): HistoryEntry[] => {
    return rounds
      .filter((r) => Boolean(r.result_data && r.result_data.middle && r.result_data.winner))
      .map((r) => {
        const rd = r.result_data!;
        const winner = String(rd.winner).toLowerCase() as Side;
        return {
          id: r.id,
          ts: new Date(r.ended_at || r.started_at).getTime(),
          openCard: rd.middle,
          bet: winner,
          stake: 50,
          winner: winner,
          won: true,
          payout: winner === "andar" ? 45 : 50,
          cardsDealt: rd.cardsDealt || (rd.steps ? rd.steps.length : undefined),
        };
      });
  }, []);

  // Apply a new round's betting start cleanly
  const applyRoundStart = useCallback(
    (data: {
      roundId: string;
      gameId?: string;
      startedAt?: string;
      bettingClosesAt?: string;
      secondsRemaining?: number;
    }) => {
      currentRoundIdRef.current = data.roundId;
      setCurrentRoundId(data.roundId);
      if (data.gameId) setCurrentGameId(data.gameId);

      // Clean up previous cards and state
      setMiddle(null);
      setAndar([]);
      setBahar([]);
      setResultBanner(null);
      setWinningSide(null);
      setMyBet(null);
      myBetRef.current = null;
      setSelectedSide(null);
      setServerError(null);
      setCalcCountdown(null);
      calcCountdownRef.current = null;
      storedServerResultRef.current = null;
      isAnimatingRef.current = false;
      activeAnimatingRoundIdRef.current = null;

      // Calculate authoritative remaining time
      const closesAt = data.bettingClosesAt ? new Date(data.bettingClosesAt).getTime() : 0;
      const now = Date.now();
      const remainingSec =
        closesAt > 0
          ? Math.max(0, Math.ceil((closesAt - now) / 1000))
          : data.secondsRemaining != null
          ? Math.max(0, Math.round(data.secondsRemaining))
          : 15;

      if (remainingSec > 0) {
        setPhase("betting");
        phaseRef.current = "betting";
        setTimeLeft(remainingSec);
        soundManager.play("betting_start");
      } else {
        setPhase("closed");
        phaseRef.current = "closed";
        setTimeLeft(0);
        setCalcCountdown(3);
        calcCountdownRef.current = 3;
        soundManager.play("betting_stop");
      }
    },
    []
  );

  // Run server card deal animation & result hold presentation
  const animateServerDeal = useCallback(
    (rd: any, roundId: string) => {
      // If this exact round result was already processed, ignore duplicate
      if (lastProcessedResultRef.current === roundId) {
        return;
      }

      // If currently animating another round, QUEUE this result instead of dropping it!
      if (isAnimatingRef.current) {
        pendingResultRef.current = { rd, roundId };
        return;
      }

      isAnimatingRef.current = true;
      activeAnimatingRoundIdRef.current = roundId;
      lastProcessedResultRef.current = roundId;

      // Authoritative result arrived: dismiss calculation indicator & stored result
      setCalcCountdown(null);
      calcCountdownRef.current = null;
      storedServerResultRef.current = null;

      // Clear any prior timeouts
      timers.current.forEach(clearTimeout);
      timers.current = [];

      // 1. Reveal open card immediately
      setMiddle(rd.middle);
      soundManager.play("card_deal");
      setAndar([]);
      setBahar([]);

      // 2. Reveal winner & player outcome immediately
      const winner = String(rd.winner || "").toLowerCase() as Side;
      setWinningSide(winner);
      const bet = myBetRef.current;
      const didWin = bet && bet.roundId === roundId && bet.side === winner;
      const didLose = bet && bet.roundId === roundId && bet.side !== winner;

      if (didWin) {
        const netProfit = Math.round(bet.amount * (PAYOUT[winner] ?? 0.8));
        const totalReturn = bet.amount + netProfit;
        setResultBanner({
          type: "win",
          title: "YOU WIN!",
          amount: totalReturn,
          subText: `Bet: ₹${bet.amount} on ${winner.toUpperCase()} • Won +₹${totalReturn}`,
        });
        soundManager.play("win_clap");
      } else if (didLose) {
        setResultBanner({
          type: "lose",
          title: "YOU LOSE",
          amount: bet.amount,
          subText: `Bet: ₹${bet.amount} on ${bet.side.toUpperCase()} • Winner: ${winner.toUpperCase()}`,
        });
        soundManager.play("loss");
      } else {
        setResultBanner({
          type: "neutral",
          title: `${winner.toUpperCase()} WINS!`,
          subText: `Target Rank: ${rankLabel(rd.middle?.rank || 0)}`,
        });
      }
      setPhase("result");
      phaseRef.current = "result";

      refreshBalance();
      getRoundHistory(20).then((h) => setHistory(formatHistory(h)));

      // 3. Deal the winning card sequence onto the table smoothly and quickly
      const steps = rd.steps || [];
      const stepDelay = Math.max(35, Math.min(75, Math.round(500 / Math.max(1, steps.length))));

      let i = 0;
      const step = () => {
        // Round ID check: Never append cards from a cancelled or stale round
        if (activeAnimatingRoundIdRef.current !== roundId) {
          return;
        }

        if (i >= steps.length) {
          // Cards finished dealing -> Hold winner on screen (~2s) before allowing next round transition
          const holdTimer = window.setTimeout(() => {
            if (activeAnimatingRoundIdRef.current !== roundId) {
              return;
            }

            isAnimatingRef.current = false;
            activeAnimatingRoundIdRef.current = null;

            // Transition: If a new round arrived while displaying result, transition now
            if (pendingRoundStartRef.current) {
              const nextRound = pendingRoundStartRef.current;
              pendingRoundStartRef.current = null;
              applyRoundStart(nextRound);
            } else if (pendingResultRef.current) {
              const nextResult = pendingResultRef.current;
              pendingResultRef.current = null;
              animateServerDeal(nextResult.rd, nextResult.roundId);
            }
          }, 2000);

          timers.current.push(holdTimer);
          return;
        }

        const s = steps[i];
        if (s.side === "andar") {
          setAndar((prev) => [...prev, s.card]);
        } else {
          setBahar((prev) => [...prev, s.card]);
        }
        soundManager.play("card_deal");
        i += 1;

        const nextStepTimer = window.setTimeout(step, stepDelay);
        timers.current.push(nextStepTimer);
      };

      // Start card animation immediately with zero lead-in delay
      step();
    },
    [applyRoundStart, formatHistory, refreshBalance]
  );

  // Fetch initial round & history
  const fetchAll = useCallback(async () => {
    try {
      const [state, hist] = await Promise.all([getCurrentRound(), getRoundHistory(20)]);
      setHistory(formatHistory(hist));
      await refreshBalance();

      // Guard against stale HTTP polling overwriting newer WebSocket or active presentation state
      if (
        state.round &&
        !isAnimatingRef.current &&
        !pendingRoundStartRef.current &&
        (!currentRoundIdRef.current || state.round.id === currentRoundIdRef.current)
      ) {
        currentRoundIdRef.current = state.round.id;
        setCurrentRoundId(state.round.id);
        if (state.game?.id) setCurrentGameId(state.game.id);

        if (state.round.status === "BETTING") {
          setPhase("betting");
          setTimeLeft(Math.max(0, Math.round(state.seconds_remaining)));
          setCalcCountdown(null);
        } else if (state.round.status === "CALCULATING") {
          setPhase("closed");
          setTimeLeft(0);
          setCalcCountdown((c) => (c === null ? 3 : c));
        }
      }
    } catch {
      // fallback
    }
  }, [formatHistory, refreshBalance]);

  // WebSocket Connection with APK lifecycle safety
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isUnmounted = false;
    let reconnectTimer: number | null = null;

    const cleanupSocket = () => {
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {}
        ws = null;
      }
      if (wsRef.current) {
        wsRef.current = null;
      }
    };

    const connect = () => {
      if (isUnmounted) return;
      cleanupSocket();

      try {
        const wsUrl = getWebSocketUrl("ws/games");
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.game_slug && data.game_slug !== SLUG) return;

            if (data.type === "round_start") {
              const roundInfo = {
                roundId: data.round_id,
                gameId: data.game_id,
                startedAt: data.started_at,
                bettingClosesAt: data.betting_closes_at,
                secondsRemaining: data.seconds_remaining,
              };

              // If currently presenting cards / winner from previous round,
              // queue this new round so winner display is never cut off
              if (isAnimatingRef.current) {
                pendingRoundStartRef.current = roundInfo;
              } else {
                applyRoundStart(roundInfo);
              }
            }

            if (data.type === "betting_locked") {
              if (pendingRoundStartRef.current && pendingRoundStartRef.current.roundId === data.round_id) {
                pendingRoundStartRef.current.secondsRemaining = 0;
              } else if (!isAnimatingRef.current && currentRoundIdRef.current === data.round_id) {
                soundManager.play("betting_stop");
                setPhase("closed");
                phaseRef.current = "closed";
                setTimeLeft(0);
                setCalcCountdown(3);
                calcCountdownRef.current = 3;
              }
            }

            if (data.type === "round_result" && data.result_data) {
              const rd = data.result_data;
              const roundId = data.round_id;

              // If calculation countdown already reached 0 (or not in closed phase), reveal IMMEDIATELY!
              if (calcCountdownRef.current === 0 || phaseRef.current !== "closed") {
                storedServerResultRef.current = null;
                animateServerDeal(rd, roundId);
              } else {
                // Calculation countdown is still ticking (3, 2, or 1): store it so it triggers reveal at 0!
                storedServerResultRef.current = { rd, roundId };
              }
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimer = window.setTimeout(connect, 2000);
          }
        };

        ws.onerror = () => {
          cleanupSocket();
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      }
    };

    connect();
    fetchAll();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      cleanupSocket();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [animateServerDeal, applyRoundStart, fetchAll]);

  // Local Countdown ticker while betting
  useEffect(() => {
    if (phase !== "betting" || timeLeft <= 0) return;
    const id = window.setTimeout(() => {
      setTimeLeft((t) => {
        const next = Math.max(0, t - 1);
        if (next === 0 && phase === "betting") {
          setPhase("closed");
          phaseRef.current = "closed";
          setCalcCountdown(3);
          calcCountdownRef.current = 3;
        }
        return next;
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [phase, timeLeft]);

  // Visual Calculation countdown while phase === "closed" (3 -> 2 -> 1 -> 0)
  useEffect(() => {
    if (phase !== "closed" || calcCountdown === null) return;

    if (calcCountdown === 0) {
      // Countdown reached 0! If authoritative server result is already stored, immediately reveal!
      if (storedServerResultRef.current) {
        const { rd, roundId } = storedServerResultRef.current;
        storedServerResultRef.current = null;
        animateServerDeal(rd, roundId);
      }
      return;
    }

    const id = window.setTimeout(() => {
      setCalcCountdown((c) => {
        const next = c !== null && c > 0 ? c - 1 : 0;
        calcCountdownRef.current = next;
        return next;
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [phase, calcCountdown, animateServerDeal]);

  // Mobile landscape check
  const [portraitPhone, setPortraitPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait) and (max-width: 820px)");
    setPortraitPhone(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPortraitPhone(e.matches);
    mq.addEventListener("change", onChange);

    const orientation = window.screen?.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    try {
      orientation?.lock?.("landscape").catch(() => {});
    } catch {}

    return () => {
      mq.removeEventListener("change", onChange);
      try {
        (window.screen?.orientation as any)?.unlock?.();
      } catch {}
    };
  }, []);

  // Place Server Bet immediately on side selection (No Confirm Bet button required)
  async function handlePlaceBet(side: Side) {
    if (
      !side ||
      !currentRoundId ||
      phase !== "betting" ||
      isPlacingBetRef.current ||
      !!myBetRef.current
    ) {
      return;
    }

    if (stake < MIN_STAKE) {
      setServerError(`Minimum bet amount is ₹${MIN_STAKE}.`);
      return;
    }

    if (stake > balance) {
      setServerError("Insufficient wallet balance for this bet amount.");
      return;
    }

    isPlacingBetRef.current = true;
    setIsPlacingBet(true);
    setSelectedSide(side);
    setServerError(null);

    try {
      const paiseAmount = stake * 100;
      await placeBetApi(
        currentRoundId,
        side === "andar" ? "ANDAR" : "BAHAR",
        paiseAmount,
        currentGameId || undefined
      );

      soundManager.play("bet_coin");
      const placedBet = { side, amount: stake, roundId: currentRoundId };
      setMyBet(placedBet);
      myBetRef.current = placedBet;
      setBalance((b) => b - stake);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Failed to place bet";
      setServerError(msg);
      setSelectedSide(null);
    } finally {
      isPlacingBetRef.current = false;
      setIsPlacingBet(false);
    }
  }

  function adjustStake(delta: number) {
    setStake((s) => Math.max(MIN_STAKE, Math.min(balance, s + delta)));
  }

  if (portraitPhone) {
    return (
      <div className="andar-bahar-container">
        <div className="rotate-block">
          <span className="rotate-icon">🔄</span>
          <p className="rotate-title">Please rotate your device to landscape mode</p>
          <p className="rotate-sub">Andar Bahar is designed for mobile landscape play.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="andar-bahar-container">
      <div className="ab-app">
        {/* ── Top Header Bar ── */}
        <header className="ab-header">
          <div className="ab-header-left">
            <button
              type="button"
              className="ab-btn-exit"
              title="Leave Game"
              onClick={() => setConfirmLeave(true)}
            >
              <span className="ab-exit-arrow">←</span>
              <span>Exit</span>
            </button>

            <div className="ab-brand-badge">
              <span className="ab-brand-title">ANDAR BAHAR</span>
              <span className="ab-brand-sub">LIVE CASINO</span>
            </div>
          </div>

          <div className="ab-header-center">
            <span className="ab-live-pill">
              <span className="ab-live-dot" /> LIVE
            </span>

            <div className={`ab-phase-pill ab-phase-${phase}`}>
              {phase === "betting" ? (
                <>
                  <span className="ab-phase-icon">⏱️</span>
                  <span className="ab-phase-label">BETTING</span>
                  <span className="ab-phase-timer">{String(timeLeft).padStart(2, "0")}s</span>
                </>
              ) : phase === "closed" ? (
                <>
                  <span className="ab-phase-icon">⏳</span>
                  <span className="ab-phase-label">CALCULATING</span>
                  <span className="ab-phase-timer">{calcCountdown !== null && calcCountdown > 0 ? `${calcCountdown}s` : "0s"}</span>
                </>
              ) : phase === "dealing" ? (
                <>
                  <span className="ab-phase-icon animate-spin">🎴</span>
                  <span className="ab-phase-label">DEALING CARDS</span>
                </>
              ) : (
                <>
                  <span className="ab-phase-icon">🏆</span>
                  <span className="ab-phase-label">{winningSide ? `${winningSide.toUpperCase()} WINS` : "RESULT"}</span>
                </>
              )}
            </div>
          </div>

          <div className="ab-header-right">
            <div className="ab-wallet-pill">
              <span className="ab-coin-icon">🪙</span>
              <span className="ab-wallet-val">₹{balance.toLocaleString("en-IN")}</span>
            </div>

            <button
              type="button"
              className="ab-icon-btn"
              title="Round History"
              onClick={() => setShowHistory(true)}
            >
              📜
            </button>

            <button
              type="button"
              className="ab-icon-btn"
              title="Game Rules"
              onClick={() => setRulesPopup("rules")}
            >
              ❓
            </button>

            <button
              type="button"
              className={`ab-icon-btn ${!soundOn ? "muted" : ""}`}
              title={soundOn ? "Mute" : "Unmute"}
              onClick={handleToggleSound}
            >
              {soundOn ? "🔊" : "🔇"}
            </button>
          </div>
        </header>

        {/* ── Main Arena Area ── */}
        <main className="ab-main-arena">
          {/* Live Bead Plate (Roadmap Strip) */}
          <div className="ab-roadmap-bar">
            <span className="ab-roadmap-label">TRENDS</span>
            <div className="ab-bead-list">
              {history.slice(0, 14).map((entry, idx) => {
                const isAndar = entry.winner === "andar";
                const isLatest = idx === 0;
                return (
                  <div
                    key={entry.id || idx}
                    className={`ab-bead ${isAndar ? "bead-andar" : "bead-bahar"} ${isLatest ? "bead-latest" : ""}`}
                    title={`Round ${history.length - idx}: ${isAndar ? "Andar" : "Bahar"}`}
                  >
                    {isAndar ? "A" : "B"}
                  </div>
                );
              })}
              {history.length === 0 && (
                <span className="ab-bead-empty">Waiting for previous rounds...</span>
              )}
            </div>
          </div>

          {/* ── The Casino Velvet Table ── */}
          <div className="ab-table-container">
            <div className="ab-felt-table">
              {/* ANDAR Zone (Left Section) */}
              <div
                className={`ab-table-zone zone-andar ${phase === "result" && winningSide === "andar" ? "zone-win" : ""} ${myBet?.side === "andar" ? "zone-has-bet" : ""}`}
                onClick={() => handlePlaceBet("andar")}
                title="Click to place bet on Andar"
              >
                <div className="ab-zone-header">
                  <span className="ab-zone-title text-andar">ANDAR</span>
                  <span className="ab-zone-payout">1.8×</span>
                  <span className="ab-card-counter">{andar.length} {andar.length === 1 ? "Card" : "Cards"}</span>
                </div>

                {/* Dealt Cards Tray */}
                <div className="ab-cards-tray">
                  {andar.map((c, idx) => (
                    <div key={idx} className="ab-card-deal-anim" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <CardView card={c} />
                    </div>
                  ))}
                  {andar.length === 0 && (
                    <div className="ab-card-slot-placeholder">
                      <span className="ab-slot-text">ANDAR SLOTS</span>
                    </div>
                  )}
                </div>

                {/* Active Chip on table */}
                {myBet?.side === "andar" && (
                  <div className="ab-placed-chip-badge chip-glow-blue">
                    <span className="ab-chip-icon">🪙</span>
                    <span>₹{myBet.amount}</span>
                  </div>
                )}
              </div>

              {/* JOKER / OPEN CARD (Center Pedestal) */}
              <div className="ab-center-pedestal">
                <div className="ab-pedestal-rim">
                  <div className="ab-pedestal-tag">OPEN CARD</div>
                  <div className="ab-pedestal-card-holder">
                    {middle ? (
                      <div className="ab-open-card-reveal">
                        <CardView card={middle} />
                      </div>
                    ) : phase === "closed" ? (
                      <div className="card-back calc-pulse">
                        <span className="text-yellow-400 font-black text-xs">
                          {calcCountdown !== null && calcCountdown > 0 ? `⏳ ${calcCountdown}` : "⏳ ..."}
                        </span>
                      </div>
                    ) : (
                      <div className="card-back" />
                    )}
                  </div>

                  {middle ? (
                    <div className="ab-target-badge">
                      <span>TARGET: <strong>{rankLabel(middle.rank)}</strong></span>
                    </div>
                  ) : (
                    <div className="ab-target-placeholder">TRUMP CARD</div>
                  )}
                </div>
              </div>

              {/* BAHAR Zone (Right Section) */}
              <div
                className={`ab-table-zone zone-bahar ${phase === "result" && winningSide === "bahar" ? "zone-win" : ""} ${myBet?.side === "bahar" ? "zone-has-bet" : ""}`}
                onClick={() => handlePlaceBet("bahar")}
                title="Click to place bet on Bahar"
              >
                <div className="ab-zone-header">
                  <span className="ab-zone-title text-bahar">BAHAR</span>
                  <span className="ab-zone-payout">1.8×</span>
                  <span className="ab-card-counter">{bahar.length} {bahar.length === 1 ? "Card" : "Cards"}</span>
                </div>

                {/* Dealt Cards Tray */}
                <div className="ab-cards-tray">
                  {bahar.map((c, idx) => (
                    <div key={idx} className="ab-card-deal-anim" style={{ animationDelay: `${idx * 0.04}s` }}>
                      <CardView card={c} />
                    </div>
                  ))}
                  {bahar.length === 0 && (
                    <div className="ab-card-slot-placeholder">
                      <span className="ab-slot-text">BAHAR SLOTS</span>
                    </div>
                  )}
                </div>

                {/* Active Chip on table */}
                {myBet?.side === "bahar" && (
                  <div className="ab-placed-chip-badge chip-glow-orange">
                    <span className="ab-chip-icon">🪙</span>
                    <span>₹{myBet.amount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Server Error Toast */}
          {serverError && (
            <div className="ab-floating-error-toast">
              <span>⚠️ {serverError}</span>
            </div>
          )}

          {/* Round Result Modal / Overlay */}
          {resultBanner && phase === "result" && (
            <div className={`ab-result-banner ${resultBanner.type}`}>
              <div className="ab-result-banner-badge">
                {resultBanner.type === "win" ? "🏆 ROUND RESULT" : resultBanner.type === "lose" ? "❌ ROUND RESULT" : "🎴 ROUND RESULT"}
              </div>
              <div className="ab-result-banner-title">{resultBanner.title}</div>
              {resultBanner.amount !== undefined && (
                <div className="ab-result-banner-amount">
                  {resultBanner.type === "win" ? `+₹${resultBanner.amount}` : `-₹${resultBanner.amount}`}
                </div>
              )}
              {resultBanner.subText && (
                <div className="ab-result-banner-sub">{resultBanner.subText}</div>
              )}
            </div>
          )}
        </main>

        {/* ── Bottom Betting Control Console ── */}
        <footer className="ab-bottom-console">
          {/* Chip Tray Selector */}
          <div className="ab-chip-tray">
            <span className="ab-tray-label">CHIPS</span>
            <div className="ab-chips-list">
              {CHIPS.map((chipVal) => {
                const isSelected = stake === chipVal;
                return (
                  <button
                    key={chipVal}
                    type="button"
                    disabled={phase !== "betting" || !!myBet}
                    className={`ab-chip-token chip-${chipVal} ${isSelected ? "chip-selected" : ""}`}
                    onClick={() => {
                      soundManager.play("bet_coin");
                      setStake(chipVal);
                    }}
                  >
                    <div className="ab-chip-dashed-ring" />
                    <span className="ab-chip-label">
                      {chipVal >= 1000 ? `${chipVal / 1000}k` : chipVal}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Stepper for fine adjustments */}
            <div className="ab-stake-stepper">
              <button
                type="button"
                className="ab-stepper-btn"
                disabled={phase !== "betting" || !!myBet || stake <= MIN_STAKE}
                onClick={() => adjustStake(-STAKE_STEP)}
                title="Decrease bet by ₹10"
              >
                −
              </button>
              <span className="ab-stepper-val">₹{stake}</span>
              <button
                type="button"
                className="ab-stepper-btn"
                disabled={phase !== "betting" || !!myBet || stake >= balance}
                onClick={() => adjustStake(STAKE_STEP)}
                title="Increase bet by ₹10"
              >
                +
              </button>
            </div>
          </div>

          {/* Action Betting Pads */}
          <div className="ab-action-pads">
            <button
              type="button"
              className={`ab-pad-btn pad-andar ${(myBet?.side === "andar" || selectedSide === "andar") ? "pad-locked" : ""}`}
              disabled={phase !== "betting" || !!myBet || isPlacingBet}
              onClick={() => handlePlaceBet("andar")}
            >
              <span className="ab-pad-title">ANDAR</span>
              <span className="ab-pad-sub">
                {myBet?.side === "andar"
                  ? `LOCKED ₹${myBet.amount}`
                  : isPlacingBet && selectedSide === "andar"
                  ? "PLACING..."
                  : `BET ₹${stake} (1.8×)`}
              </span>
            </button>

            <button
              type="button"
              className={`ab-pad-btn pad-bahar ${(myBet?.side === "bahar" || selectedSide === "bahar") ? "pad-locked" : ""}`}
              disabled={phase !== "betting" || !!myBet || isPlacingBet}
              onClick={() => handlePlaceBet("bahar")}
            >
              <span className="ab-pad-title">BAHAR</span>
              <span className="ab-pad-sub">
                {myBet?.side === "bahar"
                  ? `LOCKED ₹${myBet.amount}`
                  : isPlacingBet && selectedSide === "bahar"
                  ? "PLACING..."
                  : `BET ₹${stake} (1.8×)`}
              </span>
            </button>
          </div>
        </footer>

        {/* History Drawer Modal */}
        {showHistory && (
          <div className="history-backdrop" onClick={() => setShowHistory(false)} />
        )}
        <div className={`history-drawer${showHistory ? " open" : ""}`}>
          <HistoryPanel
            className="in-drawer"
            entries={history}
            onClose={() => setShowHistory(false)}
          />
        </div>

        {rulesPopup && (
          <GameRulesModal
            title={ANDAR_BAHAR_RULES_DATA.title}
            subtitle={ANDAR_BAHAR_RULES_DATA.subtitle}
            sections={ANDAR_BAHAR_RULES_DATA.sections}
            payouts={ANDAR_BAHAR_RULES_DATA.payouts}
            tips={ANDAR_BAHAR_RULES_DATA.tips}
            onClose={() => setRulesPopup(null)}
          />
        )}

        {confirmLeave && (
          <div className="popup-overlay" onClick={() => setConfirmLeave(false)}>
            <div className="popup-card" onClick={(e) => e.stopPropagation()}>
              <div className="popup-head">
                <span>Leave Table</span>
              </div>
              <p style={{ fontSize: 13, marginBottom: 16 }}>Return to Game Lobby?</p>
              <div className="row">
                <button className="action secondary" style={{ flex: 1 }} onClick={() => setConfirmLeave(false)}>
                  Stay
                </button>
                <button
                  className="action"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setConfirmLeave(false);
                    navigate("/dashboard");
                  }}
                >
                  Leave
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
