import { useEffect, useRef, useState } from "react";
import { CardView } from "./CardView";
import { rankLabel } from "../../game/andarBahar/deck";
import type { Side } from "../../game/andarBahar/andarBahar";
import {
  connectAndarBaharTable,
  getRealBalance,
  getVirtualBalance,
  type AndarBaharSocket,
  type TablePublicState,
} from "../../services/andarBahar";
import type { Mode, Tier } from "./Lobby";

const STAKE_STEP = 10;

export function OnlineTable({
  serverUrl,
  tableId,
  tier,
  mode,
  onLeave,
}: {
  serverUrl: string;
  tableId: string;
  tier: Tier;
  mode: Mode;
  onLeave: () => void;
}) {
  const [state, setState] = useState<TablePublicState | null>(null);
  const [myId] = useState<string>(() => localStorage.getItem("user_id") || "me");
  const [balance, setBalance] = useState<number | null>(null);
  const [stake, setStake] = useState(tier.minBet);
  const [selectedSide, setSelectedSide] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const sockRef = useRef<AndarBaharSocket | null>(null);
  const lastRoundRef = useRef<number>(-1);

  async function refreshBalance() {
    const b = mode === "virtual" ? getVirtualBalance() : await getRealBalance();
    setBalance(b);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshBalance();
      try {
        const sock = await connectAndarBaharTable(serverUrl, tableId, {
          onState: (s: any) => { if (!cancelled) setState(s); },
          onEvent: (event: any) => {
            if (event === "round_settled" && !cancelled) refreshBalance();
          },
          onError: (m: any) => { if (!cancelled) setError(m); },
        });
        if (cancelled) { sock.close(); return; }
        sockRef.current = sock;
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to connect to table.");
      }
    })();
    return () => {
      cancelled = true;
      sockRef.current?.close();
      sockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, tableId, mode]);

  useEffect(() => {
    if (!state || state.phase !== "betting") return;
    if (lastRoundRef.current === state.round_number) return;
    lastRoundRef.current = state.round_number;
    setSelectedSide(null);
    setTimeLeft(state.betting_seconds);
  }, [state]);

  useEffect(() => {
    if (!state || state.phase !== "betting" || timeLeft <= 0) return;
    const id = window.setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [state, timeLeft]);

  const myBet = state?.bets.find((b) => b.user_id === myId) ?? null;
  const mySettlement = myId ? state?.settlements[myId] : undefined;
  const canBet = state?.phase === "betting" && !myBet;

  function placeBet() {
    if (!selectedSide || !sockRef.current) return;
    sockRef.current.bet(selectedSide, stake);
  }

  const round = state?.round;
  const andar = round?.andar ?? [];
  const bahar = round?.bahar ?? [];

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button className="iconbtn" onClick={() => setConfirmLeave(true)}>←</button>
          <span className="brand"><small>♠♣</small> ANDAR BAHAR <small>♣♠</small></span>
        </div>
        <div className="header-right">
          <span className="balance"><small>{mode === "virtual" ? "♠" : "₹"}</small> {balance ?? "…"}</span>
          <span className="live-badge">● LIVE</span>
          {state?.phase === "betting" && (
            <span className={`timer-box${timeLeft <= 5 ? " warn" : ""}`}>
              <small>BETTING TIME</small>{String(Math.max(0, timeLeft)).padStart(2, "0")}s
            </span>
          )}
        </div>
      </header>

      <div className="table-wrap">
        <div className="table-oval">
          <div className={`side-col andar${state?.phase === "settled" && round?.winner === "andar" ? " win" : ""}`}>
            <span className="side-name andar">ANDAR</span>
            <span className="side-count">{andar.length} card{andar.length === 1 ? "" : "s"}</span>
            <div className="pile">{andar.map((c: any, i: number) => <CardView key={i} card={c} />)}</div>
          </div>
          <div className="middle-wrap">
            <span className="middle-label">Open Card</span>
            {round?.middle ? <CardView card={round.middle} /> : <div className="card-back" />}
            {round?.middle && <span className="target-rank">TARGET RANK: {rankLabel(round.middle.rank)}</span>}
          </div>
          <div className={`side-col bahar${state?.phase === "settled" && round?.winner === "bahar" ? " win" : ""}`}>
            <span className="side-name bahar">BAHAR</span>
            <span className="side-count">{bahar.length} card{bahar.length === 1 ? "" : "s"}</span>
            <div className="pile">{bahar.map((c: any, i: number) => <CardView key={i} card={c} />)}</div>
          </div>
        </div>
        <div className={`result ${mySettlement ? (mySettlement.won ? "win" : "lose") : ""}`}>
          {!state ? "Connecting…"
            : state.phase === "waiting" ? "Waiting for players…"
            : state.phase === "betting" ? (myBet ? `Bet placed: ${myBet.side.toUpperCase()} ₹${myBet.stake}` : "Place your bet")
            : state.phase === "dealing" ? "Dealing…"
            : mySettlement ? (mySettlement.won ? `You won! +₹${mySettlement.payout}` : `Round lost. Winner: ${round?.winner?.toUpperCase()}`)
            : `Round settled — winner: ${round?.winner?.toUpperCase() ?? "?"}`}
        </div>
        {error && <div className="result lose">{error}</div>}
      </div>

      <footer className="app-footer">
        <div className="bet-row">
          <div className="stake-group">
            <span className="group-label">Bet Amount</span>
            <div className="bet-stepper">
              <button disabled={!canBet} onClick={() => setStake((s) => Math.max(tier.minBet, s - STAKE_STEP))}>−</button>
              <span>₹{stake}</span>
              <button disabled={!canBet} onClick={() => setStake((s) => Math.min(tier.maxBet, s + STAKE_STEP))}>+</button>
            </div>
          </div>
          <button className={`bet andar${selectedSide === "andar" ? " selected" : ""}`} disabled={!canBet}
            onClick={() => setSelectedSide((s) => (s === "andar" ? null : "andar"))}>
            ANDAR<small>pays 0.9×</small>
          </button>
          <button className={`bet bahar${selectedSide === "bahar" ? " selected" : ""}`} disabled={!canBet}
            onClick={() => setSelectedSide((s) => (s === "bahar" ? null : "bahar"))}>
            BAHAR<small>pays 1.0×</small>
          </button>
          <button className="confirm-bet"
            disabled={!canBet || !selectedSide || balance === null || balance < stake}
            onClick={placeBet}>
            Confirm Bet
          </button>
        </div>
        <p className="hint">
          {myBet ? "Waiting for betting to close…"
            : balance !== null && balance < stake ? "Not enough balance — lower your stake."
            : `Tier: ₹${tier.minBet}–₹${tier.maxBet}`}
        </p>
      </footer>

      {confirmLeave && (
        <div className="popup-overlay" onClick={() => setConfirmLeave(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-head"><span>Leave Table</span></div>
            <p style={{ fontSize: 13, marginBottom: 12 }}>Are you sure you want to leave the table?</p>
            <div className="row">
              <button className="action secondary" style={{ flex: 1 }} onClick={() => setConfirmLeave(false)}>No</button>
              <button className="action" style={{ flex: 1 }} onClick={onLeave}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
