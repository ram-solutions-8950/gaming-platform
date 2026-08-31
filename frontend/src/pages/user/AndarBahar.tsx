import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CardView } from "../../components/andarBahar/CardView";
import { HistoryPanel } from "../../components/andarBahar/HistoryPanel";
import { ProgressStepper } from "../../components/andarBahar/ProgressStepper";
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
import "../../styles/andar-bahar.css";

type Phase = "betting" | "closed" | "dealing" | "result";

const CHIPS = [10, 50, 100, 500, 1000, 5000];
const STAKE_STEP = 10;

const RULES_COPY = {
  how: {
    title: "How to Play Andar Bahar",
    items: [
      "1. Choose your bet amount using the chip selector or stepper.",
      "2. Select ANDAR (blue) or BAHAR (red) and click Confirm Bet before the timer runs out.",
      "3. The server reveals the Open Card (the target) once betting closes.",
      "4. Cards are dealt alternately to Andar and Bahar by the server.",
      "5. The first side to receive a card matching the rank of the Open Card wins!",
    ],
  },
  rules: {
    title: "Game Rules & Payouts",
    items: [
      "Deck: One standard 52-card deck, shuffled server-side each round.",
      "Target rank: Determined by the Open Card revealed at the start.",
      "Dealing order: A black Open Card (♠/♣) deals to Andar first; a red Open Card (♥/♦) deals to Bahar first.",
      "First match wins: The round ends immediately on the first matching card.",
      "Payouts: Andar pays 0.9× stake (net win), Bahar pays 1.0× stake (net win).",
      "No tie: Every round produces exactly one winning side.",
      "Server-Authoritative: Every deal, winner calculation, and wallet settlement is executed securely on the server.",
    ],
  },
};

export function AndarBaharPage() {
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number>(1000);
  const [stake, setStake] = useState<number>(50);
  const [phase, setPhase] = useState<Phase>("betting");
  const [myBet, setMyBet] = useState<{ side: Side; amount: number; roundId: string } | null>(null);
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [showChipMenu, setShowChipMenu] = useState(false);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [middle, setMiddle] = useState<Card | null>(null);
  const [andar, setAndar] = useState<Card[]>([]);
  const [bahar, setBahar] = useState<Card[]>([]);
  const [result, setResult] = useState<{ won: boolean; text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState(15);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [rulesPopup, setRulesPopup] = useState<"how" | "rules" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const timers = useRef<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isAnimatingRef = useRef(false);
  const activeAnimatingRoundIdRef = useRef<string | null>(null);
  const lastProcessedResultRef = useRef<string | null>(null);
  const currentRoundIdRef = useRef<string | null>(null);
  const myBetRef = useRef<{ side: Side; amount: number; roundId: string } | null>(null);
  const pendingRoundStartRef = useRef<{
    roundId: string;
    gameId?: string;
    startedAt?: string;
    bettingClosesAt?: string;
    secondsRemaining?: number;
  } | null>(null);
  const pendingResultRef = useRef<{ rd: any; roundId: string } | null>(null);

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
      setResult(null);
      setMyBet(null);
      myBetRef.current = null;
      setSelectedSide(null);
      setServerError(null);

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
        setTimeLeft(remainingSec);
        soundManager.play("betting_start");
      } else {
        setPhase("closed");
        setTimeLeft(0);
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

      // Clear any prior timeouts
      timers.current.forEach(clearTimeout);
      timers.current = [];

      setPhase("dealing");
      setMiddle(rd.middle);
      soundManager.play("card_deal");
      setAndar([]);
      setBahar([]);
      setResult(null);

      const steps = rd.steps || [];
      const winner = String(rd.winner || "").toLowerCase() as Side;

      let i = 0;
      const step = () => {
        // Round ID check: Never append cards from a cancelled or stale round
        if (activeAnimatingRoundIdRef.current !== roundId) {
          return;
        }

        if (i >= steps.length) {
          // Cards finished dealing -> Show Winner & Result
          setPhase("result");
          const bet = myBetRef.current;
          const didWin = bet && bet.roundId === roundId && bet.side === winner;
          const didLose = bet && bet.roundId === roundId && bet.side !== winner;

          if (didWin) {
            const payout = Math.round(bet.amount * (PAYOUT[winner] || 1.0));
            setResult({
              won: true,
              text: `YOU WON! ${winner.toUpperCase()} WINS (+₹${payout})`,
            });
            soundManager.play("win_clap");
          } else if (didLose) {
            setResult({
              won: false,
              text: `${winner.toUpperCase()} WINS (-₹${bet.amount})`,
            });
            soundManager.play("loss");
          } else {
            setResult({
              won: true,
              text: `${winner.toUpperCase()} WINS!`,
            });
          }

          refreshBalance();
          getRoundHistory(20).then((h) => setHistory(formatHistory(h)));

          // RESULT HOLD: Hold winner on screen so user sees the outcome before next round
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

        const nextStepTimer = window.setTimeout(step, 280);
        timers.current.push(nextStepTimer);
      };

      const leadInTimer = window.setTimeout(step, 360);
      timers.current.push(leadInTimer);
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
        } else if (state.round.status === "CALCULATING") {
          setPhase("closed");
          setTimeLeft(0);
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
                setTimeLeft(0);
              }
            }

            if (data.type === "round_result" && data.result_data) {
              animateServerDeal(data.result_data, data.round_id);
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
    const id = window.setTimeout(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [phase, timeLeft]);

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

  // Place Server Bet
  async function handleConfirmBet() {
    if (!selectedSide || !currentRoundId || phase !== "betting" || stake > balance || isPlacingBet) return;

    setIsPlacingBet(true);
    setServerError(null);

    try {
      const paiseAmount = stake * 100;
      await placeBetApi(currentRoundId, selectedSide === "andar" ? "ANDAR" : "BAHAR", paiseAmount, currentGameId || undefined);

      soundManager.play("bet_coin");
      const placedBet = { side: selectedSide, amount: stake, roundId: currentRoundId };
      setMyBet(placedBet);
      myBetRef.current = placedBet;
      setBalance((b) => b - stake);
      setShowChipMenu(false);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.message || "Failed to place bet";
      setServerError(msg);
    } finally {
      setIsPlacingBet(false);
    }
  }

  function adjustStake(delta: number) {
    setStake((s) => Math.max(STAKE_STEP, Math.min(balance, s + delta)));
  }

  const canConfirm = phase === "betting" && selectedSide !== null && stake <= balance && !myBet && !isPlacingBet;

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
      <div className="app">
        <header className="app-header">
          <div className="header-left">
            <button className="iconbtn !px-2.5 !py-1 flex items-center gap-1 font-bold text-xs" title="Leave Game" onClick={() => setConfirmLeave(true)}>
              ← Exit
            </button>
            <span className="brand">
              <small>♠♣</small> ANDAR BAHAR <small>♣♠</small>
            </span>
          </div>
          <div className="header-right">
            <span className="balance">
              <small>₹</small> {balance}
            </span>
            <span className="live-badge">● LIVE</span>
            <span className={`timer-box${phase === "betting" && timeLeft <= 5 ? " warn" : ""}`}>
              <small>BETTING TIME</small>
              {phase === "betting" ? `${String(timeLeft).padStart(2, "0")}s` : "--"}
            </span>
            <button className="iconbtn" aria-label="Toggle Sound" onClick={() => setSoundOn((v) => !v)}>
              {soundOn ? "🔊" : "🔇"}
            </button>
          </div>
        </header>

        <div className="rail">
          <button type="button" className="rail-btn" onClick={() => setRulesPopup("how")}>
            <span className="rail-icon">📖</span>How to Play
          </button>
          <button type="button" className="rail-btn" onClick={() => setRulesPopup("rules")}>
            <span className="rail-icon">📋</span>Rules
          </button>
          <button
            type="button"
            className="rail-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowHistory((v) => !v);
            }}
            aria-label="Toggle History"
          >
            <span className="rail-icon">📜</span>History
          </button>
        </div>

        <div className="table-wrap">
          <div className="table-oval">
            <div className={`side-col andar${phase === "result" && result?.won && myBet?.side === "andar" ? " win" : ""}`}>
              <span className="side-name andar">ANDAR</span>
              <span className="side-count">
                {andar.length} card{andar.length === 1 ? "" : "s"}
              </span>
              <div className="pile">
                {andar.map((c, idx) => (
                  <CardView key={idx} card={c} />
                ))}
              </div>
            </div>

            <div className="middle-wrap">
              <span className="middle-label">Open Card</span>
              {middle ? <CardView card={middle} /> : <div className="card-back" />}
              {middle && <span className="target-rank">TARGET RANK: {rankLabel(middle.rank)}</span>}
            </div>

            <div className={`side-col bahar${phase === "result" && result?.won && myBet?.side === "bahar" ? " win" : ""}`}>
              <span className="side-name bahar">BAHAR</span>
              <span className="side-count">
                {bahar.length} card{bahar.length === 1 ? "" : "s"}
              </span>
              <div className="pile">
                {bahar.map((c, idx) => (
                  <CardView key={idx} card={c} />
                ))}
              </div>
            </div>
          </div>

          <div className={`result ${result ? (result.won ? "win" : "lose") : ""}`}>
            {result?.text ??
              (phase === "dealing"
                ? "Server dealing cards…"
                : phase === "closed"
                ? "STOP BETTING — Calculating…"
                : myBet
                ? `Bet Placed on ${myBet.side.toUpperCase()} (₹${myBet.amount}) — Waiting for Deal…`
                : "Place your bet on Andar or Bahar")}
          </div>
          {serverError && <div className="result lose">{serverError}</div>}
        </div>

        {/* Desktop History Sidebar */}
        <HistoryPanel entries={history} />

        {/* Mobile / APK History Drawer */}
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

        <footer className="app-footer">
          <div className="bet-row">
            <div className="chip-group">
              <span className="group-label">Chip Size</span>
              <div className="chip-select-wrap">
                <button
                  className="chip-select"
                  disabled={phase !== "betting" || !!myBet}
                  onClick={() => setShowChipMenu((v) => !v)}
                >
                  ₹{stake} <span className="chip-select-caret">▼</span>
                </button>
                {showChipMenu && (
                  <>
                    <div className="chip-menu-backdrop" onClick={() => setShowChipMenu(false)} />
                    <div className="chip-menu">
                      {CHIPS.map((c) => (
                        <button
                          key={c}
                          className={`chip-menu-item${stake === c ? " active" : ""}`}
                          onClick={() => {
                            setStake(c);
                            setShowChipMenu(false);
                          }}
                        >
                          ₹{c}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="stake-group">
              <span className="group-label">Bet Amount</span>
              <div className="bet-stepper">
                <button disabled={phase !== "betting" || !!myBet} onClick={() => adjustStake(-STAKE_STEP)}>
                  −
                </button>
                <span>₹{stake}</span>
                <button disabled={phase !== "betting" || !!myBet} onClick={() => adjustStake(STAKE_STEP)}>
                  +
                </button>
              </div>
            </div>

            <button
              className={`bet andar${selectedSide === "andar" ? " selected" : ""}`}
              disabled={phase !== "betting" || !!myBet}
              onClick={() => setSelectedSide((s) => (s === "andar" ? null : "andar"))}
            >
              ANDAR<small>pays {PAYOUT.andar}×</small>
            </button>
            <button
              className={`bet bahar${selectedSide === "bahar" ? " selected" : ""}`}
              disabled={phase !== "betting" || !!myBet}
              onClick={() => setSelectedSide((s) => (s === "bahar" ? null : "bahar"))}
            >
              BAHAR<small>pays {PAYOUT.bahar}×</small>
            </button>
            <button
              className="confirm-bet"
              disabled={!canConfirm}
              onClick={handleConfirmBet}
            >
              {isPlacingBet ? "Placing…" : myBet ? "Bet Locked" : "Confirm Bet"}
            </button>
          </div>

          <p className="hint">
            {myBet
              ? `Bet of ₹${myBet.amount} locked on ${myBet.side.toUpperCase()}. Waiting for round to resolve…`
              : stake > balance
              ? "Not enough balance — please lower your bet amount or deposit."
              : "Server-authoritative live game. All bets and outcomes settle securely on the server."}
          </p>

          <div className="progress-row">
            <ProgressStepper phase={phase} />
          </div>
        </footer>

        {rulesPopup && (
          <div className="popup-overlay" onClick={() => setRulesPopup(null)}>
            <div className="popup-card" onClick={(e) => e.stopPropagation()}>
              <div className="popup-head">
                <span>{RULES_COPY[rulesPopup].title}</span>
                <button className="iconbtn" onClick={() => setRulesPopup(null)}>
                  ✕
                </button>
              </div>
              <ul className="rules-list">
                {RULES_COPY[rulesPopup].items.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
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
