import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Users, History, BarChart3, Volume2, VolumeX, Flag,
  Trash2, RotateCcw, Sparkles, Shuffle, Trophy, MessageCircle, Minus, Plus,
  Send,
} from "lucide-react";
import PlayingCard from "./PlayingCard";
import "./RummyTable.css";
import RulesModal from "./RulesModal";
import { useRummySocket } from "../../hooks/useRummySocket";
import { autoArrange, classifyGroup, deadwoodPoints, isWild, parseCard, sortHand, groupBySuits } from "../../services/rummyMelds";
import { RummyApi, type RummyTableOut } from "../../services/rummy";
import type { TableState } from "../../types/rummy";
import { useAuthStore } from "../../store/authStore";
import { soundManager } from "../../services/soundManager";
import { authStorage } from "../../services/authStorage";
import { walletService } from "../../services/wallet";

const FIRST_DROP_POINTS = 20;
const MIDDLE_DROP_POINTS = 40;

/** A random card code purely for the decorative toss flip — never a real card from
 * anyone's hand or the deck, just flavor while the toast names the actual (server-
 * decided) opening player. */
function randomCardCode(): string {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["S", "H", "D", "C"];
  const rank = ranks[Math.floor(Math.random() * ranks.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  return `${rank}${suit}0`;
}

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

function formatCardLabel(code: string): string {
  if (code.startsWith("PJ")) return "the Joker";
  const body = code.replace(/\d+$/, "");
  const suitChar = body.slice(-1);
  const rank = body.slice(0, -1);
  return `${rank}${SUIT_GLYPH[suitChar] ?? ""}`;
}

/** A circular countdown ring around a player's avatar — depletes from `total` down to
 * 0. Purely visual (the numeric badges already told the story); the server is still
 * the sole authority on the real deadline, this just makes it legible at a glance. */
function TurnRing({ seconds, total, size }: { seconds: number; total: number; size: number }) {
  const stroke = 3;
  const radius = size / 2 - stroke / 2 - 0.5;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const urgent = seconds <= 5;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={urgent ? "#f87171" : "#facc15"}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        className={`transition-[stroke-dashoffset] duration-1000 ease-linear ${urgent ? "animate-pulse" : ""}`}
      />
    </svg>
  );
}

function ResultOverlay({
  state, meId, table, onContinue, onBackToLobby, onPlayAgain, playAgainBusy,
}: {
  state: TableState;
  meId: string | null;
  table: RummyTableOut | null;
  onContinue: () => void;
  onBackToLobby: () => void;
  onPlayAgain: () => void;
  playAgainBusy: boolean;
}) {
  const isPool = state.pool_limit != null;
  const isGameOver = state.phase === "game_over";
  const winner = state.players.find((p) => p.id === state.winner_id);
  const iWon = winner?.id === meId;
  const me = state.players.find((p) => p.id === meId);
  const iWasEliminatedThisDeal = isPool && !isGameOver && me?.eliminated;
  const pool = state.players
    .filter((p) => p.id !== state.winner_id)
    .reduce((sum, p) => sum + p.deal_points, 0);

  const entryFeePaise = table?.entry_fee_paise || 0;
  const pointValuePaise = entryFeePaise >= 80 ? Math.max(1, Math.round(entryFeePaise / 80)) : Math.max(1, entryFeePaise);
  const entryFeeRupees = entryFeePaise / 100;
  const totalPoolPaise = pool * pointValuePaise;
  const totalPoolRupees = (totalPoolPaise / 100).toFixed(2);
  const myLossPaise = Math.min((me?.deal_points || 0) * pointValuePaise, entryFeePaise);
  const myLossRupees = (myLossPaise / 100).toFixed(2);

  return (
    <div className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto select-none">
      <div className="w-full max-w-sm max-h-[96vh] bg-gradient-to-b from-[#1d0d33] via-[#120824] to-[#0a0316] border-2 border-amber-500/50 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.9)] p-3 sm:p-4 flex flex-col items-center justify-center gap-1.5 text-center my-auto overflow-y-auto">
        <p className="font-display text-base sm:text-lg text-gold-400 font-extrabold tracking-wide">
          {isGameOver
            ? isPool
              ? iWon ? "🏆 POOL WINNER" : "🏁 POOL OVER"
              : iWon ? "🏆 GAME WINNER" : "🏁 GAME OVER"
            : iWasEliminatedThisDeal
              ? "🚫 YOU'RE OUT"
              : iWon
                ? "🏆 YOU WIN"
                : winner
                  ? `🏆 ${winner.name} wins the deal`
                  : "Deal over"}
        </p>

        {/* Explicit Bet & Win Display */}
        {entryFeePaise > 0 && (
          <div className="flex items-center justify-center gap-2.5 bg-black/80 border border-amber-500/40 rounded-xl px-3.5 py-1 text-xs font-bold my-0.5">
            <span className="text-slate-300">
              Bet: <span className="text-amber-300">₹{entryFeeRupees.toFixed(2)}</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className={iWon ? "text-emerald-400 font-black" : "text-rose-400 font-black"}>
              {iWon ? `Won: +₹${totalPoolRupees}` : `Lost: -₹${myLossRupees}`}
            </span>
          </div>
        )}

        <div className="w-full max-w-[17rem] space-y-1 my-1">
          {state.players.map((p) => {
            const pLossRupees = ((Math.min(p.deal_points * pointValuePaise, entryFeePaise)) / 100).toFixed(2);
            return (
              <div key={p.id} className="flex justify-between items-center text-[11px] bg-ink-900/80 rounded px-2.5 py-1">
                <span className={p.id === meId ? "text-gold-300 font-bold" : "text-slate-200 font-medium"}>
                  {p.name}
                  {isPool && p.eliminated && <span className="ml-1 text-[8px] text-red-400 uppercase">out</span>}
                </span>
                <span className="flex items-center gap-1.5 font-mono">
                  <span className={p.id === state.winner_id ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {p.id === state.winner_id
                      ? (entryFeePaise > 0 ? `+₹${totalPoolRupees}` : `+${pool}`)
                      : (entryFeePaise > 0 ? `-₹${pLossRupees}` : `-${p.deal_points}`)}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    ({p.deal_points} pts)
                  </span>
                  {isPool && (
                    <span className="text-[9px] text-slate-500 font-mono">
                      {p.total_score}/{state.pool_limit}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[8px] text-slate-500 font-mono hidden sm:block">Table: {state.table_id.slice(0, 8)}</p>
        {isGameOver ? (
          <div className="flex flex-wrap gap-2 mt-1 w-full max-w-[17rem] justify-center">
            <button
              type="button"
              className="flex-1 py-2 px-3 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-lg border border-amber-300 hover:brightness-110 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              disabled={playAgainBusy}
              onClick={onPlayAgain}
            >
              {playAgainBusy ? "Creating…" : "🔁 New Game"}
            </button>
            <button
              type="button"
              className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
              onClick={onBackToLobby}
            >
              Back to Lobby
            </button>
          </div>
        ) : (
          <button type="button" className="btn-gold rounded-full px-5 py-1.5 text-xs mt-1 cursor-pointer font-bold shadow-md" onClick={onContinue}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
}


export default function GameTable({ onBack, onExit, customTableId }: { onBack?: () => void; onExit?: () => void; customTableId?: string } = {}) {
  const { tableId: paramTableId } = useParams();
  const tableId = customTableId || paramTableId || "";
  const token = authStorage.getAccessToken() || "";
  const user = useAuthStore((s) => s.user);
  const myUsername = user?.username || user?.name || "Player";
  const navigate = useNavigate();
  const { state, hand, connected, lastError, send } = useRummySocket(tableId, token);

  const [table, setTable] = useState<RummyTableOut | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [groups, setGroups] = useState<string[][]>([]);
  const [finishCard, setFinishCard] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);

  const refreshWallet = useCallback(() => {
    walletService.getWallet().then((w) => setWalletBalance(w.balance || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    refreshWallet();
    const timer = setInterval(refreshWallet, 5000);
    return () => clearInterval(timer);
  }, [refreshWallet]);

  function handleBackToLobby() {
    if (onBack) {
      onBack();
    } else {
      navigate("/games/rummy");
    }
  }

  function handleExitToDashboard() {
    if (onExit) {
      onExit();
    } else {
      navigate("/dashboard");
    }
  }

  // Shared "table announcement" banner — toss, discard, and drop all reuse this
  // same pill (text + up to 2 decorative/real cards) instead of each owning a
  // separate state+timer pair.
  const [announceText, setAnnounceText] = useState<string | null>(null);
  const [announceFading, setAnnounceFading] = useState(false);
  const [announceCards, setAnnounceCards] = useState<string[]>([]);
  const tossShownForDeal = useRef<number | null>(null);
  const announceTimers = useRef<{ fade?: ReturnType<typeof setTimeout>; clear?: ReturnType<typeof setTimeout> }>({});
  const lastTurnRef = useRef<string | null>(null);
  const prevTopDiscardRef = useRef<string | null>(null);
  const lastStatusRef = useRef<Record<string, string>>({});

  // Sound effects integration and state transition tracking
  const lastHandLenRef = useRef<number>(0);
  useEffect(() => {
    if (hand && hand.length !== lastHandLenRef.current) {
      soundManager.play('card_deal');
      lastHandLenRef.current = hand.length;
    }
  }, [hand]);

  const lastDiscardRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.top_discard && state.top_discard !== lastDiscardRef.current) {
      soundManager.play('card_deal');
      lastDiscardRef.current = state.top_discard;
    }
  }, [state?.top_discard]);

  const lastPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (state.phase !== lastPhaseRef.current) {
      const p = state.phase;
      if (p === 'dealing' || p === 'await_draw' || p === 'await_discard') {
        soundManager.play('betting_start');
        soundManager.play('card_deal');
        setResultDismissed(false);
      } else if (p === 'declare' || p === 'showdown' || p === 'game_over' || p === 'deal_over') {
        soundManager.play('betting_stop');
        refreshWallet();
      }
      lastPhaseRef.current = p;
    }
  }, [state?.phase, refreshWallet]);

  const lastWinnerIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !user?.id) return;
    if (state.winner_id && state.winner_id !== lastWinnerIdRef.current) {
      if (state.winner_id === user.id) {
        soundManager.play('win_clap');
      } else {
        soundManager.play('loss');
      }
      lastWinnerIdRef.current = state.winner_id;
    } else if (!state.winner_id) {
      lastWinnerIdRef.current = null;
    }
  }, [state?.winner_id, user?.id]);

  function announce(text: string, cards: string[] = [], durationMs = 3000) {
    setAnnounceText(text);
    setAnnounceFading(false);
    setAnnounceCards(cards);
    clearTimeout(announceTimers.current.fade);
    clearTimeout(announceTimers.current.clear);
    announceTimers.current.fade = setTimeout(() => setAnnounceFading(true), durationMs - 300);
    announceTimers.current.clear = setTimeout(() => {
      setAnnounceText(null);
      setAnnounceCards([]);
    }, durationMs);
  }
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [scoreModalOpen, setScoreModalOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string; sender: string; text: string; time: string }[]>([
    { id: '1', sender: 'Dealer', text: 'Welcome to Indian Rummy! Enjoy the game.', time: '12:00' }
  ]);
  const [chatInput, setChatInput] = useState('');

  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("rummy_sound") !== "off");

  useEffect(() => {
    const isOff = localStorage.getItem("rummy_sound") === "off" || localStorage.getItem("casinoSoundMuted") === "true";
    if (isOff) {
      soundManager.mute();
      soundManager.stopMusic();
      setSoundOn(false);
    }
  }, []);

  function toggleSound() {
    setSoundOn((v) => {
      const next = !v;
      localStorage.setItem("rummy_sound", next ? "on" : "off");
      if (next) {
        soundManager.unmute();
      } else {
        soundManager.mute();
        soundManager.stopMusic();
      }
      return next;
    });
  }

  const openHistory = async () => {
    setHistoryLoading(true);
    setHistoryModalOpen(true);
    try {
      const data = await RummyApi.getHistory();
      setHistoryData(data || []);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const sendChatMessage = (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : chatInput).trim();
    if (!text) return;
    const newMsg = {
      id: String(Date.now()),
      sender: myUsername || 'You',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setChatInput('');
  };


  async function handlePlayAgain() {
    setPlayAgainBusy(true);
    navigate('/games/rummy');
  }

  useEffect(() => {
    if (tableId) {
      RummyApi.getTable(tableId).then(setTable).catch(() => setTable(null));
    }
  }, [tableId]);

  // Live turn countdown — purely visual; the server is the authority and will
  // auto-play (draw+discard) if the real deadline elapses, regardless of this display.
  useEffect(() => {
    if (!state || (state.phase !== "await_draw" && state.phase !== "await_discard")) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(table?.turn_seconds ?? 30);
    const id = setInterval(() => {
      setSecondsLeft((s) => (s !== null && s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [state, table?.turn_seconds]);

  // "X won the toss and will play first" — purely a presentation of who the server
  // already picked as the opening player (see start_deal's dealer-relative seat pick);
  // the client never chooses this, it just narrates it once per fresh deal. The two
  // flipped cards are decorative flavor only — randomised client side each time, not
  // read from anyone's real hand.
  useEffect(() => {
    if (!state || state.phase !== "await_draw") return;
    if (tossShownForDeal.current === state.deal_number) return;
    tossShownForDeal.current = state.deal_number;
    const firstPlayer = state.players.find((p) => p.id === state.turn);
    if (!firstPlayer) return;
    announce(`${firstPlayer.name} won the toss and will play first.`, [randomCardCode(), randomCardCode()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.deal_number, state?.turn]);

  // "X discarded 7♥" — fires exactly once per real discard by comparing the new
  // top_discard against the last-seen one, rather than depending on state.turn
  // alone (turn also changes on a drop, which isn't a discard).
  useEffect(() => {
    if (!state) return;
    if (state.top_discard && state.top_discard !== prevTopDiscardRef.current) {
      const discarder = state.players.find((p) => p.id === lastTurnRef.current);
      if (discarder) {
        announce(`${discarder.name} discarded ${formatCardLabel(state.top_discard)}`, [state.top_discard], 2200);
      }
    }
    prevTopDiscardRef.current = state.top_discard;
    lastTurnRef.current = state.turn ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.top_discard, state?.turn]);

  // "X dropped the hand" — fires once per player the first time their status
  // flips to "dropped" (guarded so a reconnect that loads an already-dropped
  // player doesn't retroactively announce it).
  useEffect(() => {
    if (!state) return;
    for (const p of state.players) {
      const prevStatus = lastStatusRef.current[p.id];
      if (prevStatus !== undefined && prevStatus !== "dropped" && p.status === "dropped") {
        announce(`${p.name} dropped the hand.`, [], 2200);
      }
      lastStatusRef.current[p.id] = p.status;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.players]);

  useEffect(() => {
    const timers = announceTimers.current;
    return () => {
      clearTimeout(timers.fade);
      clearTimeout(timers.clear);
    };
  }, []);

  function handleStart() {
    send({ action: "start" });
  }

  useEffect(() => {
    if (state?.phase !== "deal_over" && state?.phase !== "game_over") {
      setResultDismissed(false);
    }
  }, [state?.phase]);

  // Reconcile local grouping with the server hand: keep existing arrangement, drop
  // cards that left the hand (discarded/declared), and drop newly drawn cards into
  // their own trailing group so the player notices and places them.
  useEffect(() => {
    setGroups((prev) => {
      const kept = prev.map((g) => g.filter((c) => hand.includes(c))).filter((g) => g.length > 0);
      const placed = new Set(kept.flat());
      const fresh = hand.filter((c) => c !== finishCard && !placed.has(c));
      return fresh.length > 0 ? [...kept, fresh] : kept;
    });
    setFinishCard((prev) => (prev && hand.includes(prev) ? prev : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hand]);

  const me = state?.players.find((p) => (user?.id && p.id === user.id) || p.name === myUsername) ?? null;
  const myTurn = !!(state && me && state.turn === me.id);
  const phase = state?.phase ?? "connecting";
  const wildRank = state?.wild_rank ?? null;
  const opponents = state?.players.filter((p) => p.id !== me?.id) ?? [];

  // Auto-start: once enough players are seated, the deal begins on its own — no
  // manual "Start deal" click needed. If the table is already full, start almost
  // immediately; if only the 2-player minimum is met on a bigger table, give
  // stragglers a real window to join before dealing locks the table (starting the
  // instant 2/4 are seated would strand the other seats — they can't join mid-deal).
  // Only the seat-0 client actually sends the command, so two simultaneous clients
  // don't both fire it; a harmless server-side rejection either way.
  //
  // For deal_over specifically, wait for the player to dismiss the result overlay
  // first (resultDismissed) — auto-starting the instant the deal ends would yank
  // the result screen away before anyone's had a chance to read it.
  const autoStartedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !me || !table) return;
    const ready =
      state.phase === "waiting" || (state.phase === "deal_over" && resultDismissed);
    if (!ready) return;
    if (state.players.length < 2) return;
    if (state.players[0]?.id !== me.id) return;
    const key = `${state.phase}-${state.deal_number}-${state.players.length}`;
    if (autoStartedFor.current === key) return;
    autoStartedFor.current = key;
    const isFull = state.players.length >= table.max_players;
    const t = setTimeout(handleStart, isFull ? 600 : 12000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.deal_number, state?.players.length, me?.id, resultDismissed, table?.max_players]);

  const showingResult = !!state && (state.phase === "deal_over" || state.phase === "game_over") && !resultDismissed;
  const pointValue = table && table.mode === "real_money" ? (table.entry_fee_paise / 80) / 100 : null;
  const modeName = table ? (table.mode === "real_money" ? "Points Rummy" : "Practice Rummy") : "";
  const dropPoints = phase === "await_draw" && hand.length === 13 ? FIRST_DROP_POINTS : MIDDLE_DROP_POINTS;
  const dropCost = pointValue != null ? `₹${(dropPoints * pointValue).toFixed(2)}` : `${dropPoints}`;

  const isGameOver = !state || state.phase === "deal_over" || state.phase === "game_over";
  const isPlayingPhase = phase === "await_draw" || phase === "await_discard";
  const isMyTurnActive = Boolean(myTurn && isPlayingPhase && !isGameOver);
  const activeTurnPlayer = state?.players?.find((p) => p.id === state?.turn);
  const [autoSortStep, setAutoSortStep] = useState<number>(0);

  function toggleSelect(code: string) {
    if (isGameOver) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function shiftLeft(i: number) {
    if (isGameOver) return;
    setGroups((gs) => {
      if (i <= 0) return gs;
      const copy = gs.map((g) => [...g]);
      const moved = copy[i].shift();
      if (moved === undefined) return gs;
      copy[i - 1].push(moved);
      return copy.filter((g) => g.length > 0);
    });
  }

  function shiftRight(i: number) {
    if (isGameOver) return;
    setGroups((gs) => {
      if (i >= gs.length - 1) return gs;
      const copy = gs.map((g) => [...g]);
      const moved = copy[i].pop();
      if (moved === undefined) return gs;
      copy[i + 1].unshift(moved);
      return copy.filter((g) => g.length > 0);
    });
  }

  function groupSelected() {
    if (isGameOver || selected.size < 2) return;
    setGroups((gs) => {
      const order = gs.flat().filter((c) => selected.has(c));
      const remaining = gs.map((g) => g.filter((c) => !selected.has(c))).filter((g) => g.length > 0);
      return [...remaining, order];
    });
    setSelected(new Set());
  }

  function ungroupSelected() {
    if (isGameOver || selected.size === 0) return;
    setGroups((gs) => {
      const pulled = gs.flat().filter((c) => selected.has(c));
      const remaining = gs.map((g) => g.filter((c) => !selected.has(c))).filter((g) => g.length > 0);
      return [...remaining, ...pulled.map((c) => [c])];
    });
    setSelected(new Set());
  }

  function resetGroups() {
    if (isGameOver) return;
    const all = [...groups.flat(), ...(finishCard ? [finishCard] : [])];
    setGroups(all.length > 0 ? [all] : []);
    setFinishCard(null);
    setSelected(new Set());
  }

  function doSort() {
    if (isGameOver) return;
    const all = [...groups.flat(), ...(finishCard ? [finishCard] : [])];
    setGroups(all.length > 0 ? [sortHand(all)] : []);
    setFinishCard(null);
    setSelected(new Set());
  }

  function doAutoSort() {
    if (isGameOver) return;
    const all = [...groups.flat(), ...(finishCard ? [finishCard] : [])];
    if (all.length === 0) return;

    if (autoSortStep % 2 === 0) {
      setGroups(autoArrange(all, wildRank));
      announce("✨ Arranged by Melds", [], 2000);
    } else {
      setGroups(groupBySuits(all, wildRank));
      announce("✨ Grouped by Suits", [], 2000);
    }
    setAutoSortStep((prev) => prev + 1);
    setFinishCard(null);
    setSelected(new Set());
  }

  function toggleFinishSlot() {
    if (isGameOver) return;
    if (finishCard) {
      setGroups((gs) => [...gs, [finishCard]]);
      setFinishCard(null);
      return;
    }
    if (selected.size !== 1) return;
    const [code] = selected;
    setGroups((gs) => gs.map((g) => g.filter((c) => c !== code)).filter((g) => g.length > 0));
    setFinishCard(code);
    setSelected(new Set());
  }

  // ---- drag-and-drop: an alternative to Group selected/◀▶ for mouse users. Dropping
  // onto a group appends to it; dropping onto the tray end starts a new group.
  // Identifies the target group by one of its existing cards rather than its index,
  // since removing the dragged card can shift/prune indices before the drop resolves.
  function dropOnGroup(targetSample: string | null) {
    if (isGameOver) return;
    const code = dragCode;
    setDragCode(null);
    if (!code) return;
    setGroups((gs) => {
      const without = gs.map((g) => g.filter((c) => c !== code));
      if (targetSample === null) {
        return [...without.filter((g) => g.length > 0), [code]];
      }
      const targetIdx = without.findIndex((g) => g.includes(targetSample));
      if (targetIdx === -1) return [...without.filter((g) => g.length > 0), [code]];
      return without.map((g, i) => (i === targetIdx ? [...g, code] : g)).filter((g) => g.length > 0);
    });
    if (finishCard === code) setFinishCard(null);
  }

  function dropOnFinishSlot() {
    if (isGameOver) return;
    const code = dragCode;
    setDragCode(null);
    if (!code) return;
    setGroups((gs) => {
      const without = gs.map((g) => g.filter((c) => c !== code)).filter((g) => g.length > 0);
      return finishCard ? [...without, [finishCard]] : without;
    });
    setFinishCard(code);
  }

  function doDiscard() {
    if (selected.size !== 1) return;
    const [code] = selected;
    send({ action: "discard", card: code });
    setSelected(new Set());
  }

  function doDeclare() {
    if (!finishCard) return;
    send({ action: "declare", groups });
    setSelected(new Set());
  }

  const canDiscard = myTurn && phase === "await_discard" && selected.size === 1;
  const canDeclare = myTurn && phase === "await_discard" && finishCard != null;
  // Matches the backend's own guard (drop() only allows AWAIT_DRAW/AWAIT_DISCARD) —
  // myTurn alone isn't enough, since current_player() defaults to the first seated
  // player even before a deal starts, which made Drop look clickable while WAITING.
  const canDrop = myTurn && (phase === "await_draw" || phase === "await_discard");
  const seatedCount = state?.players.length ?? 0;
  const emptySeats = table ? Math.max(0, table.max_players - seatedCount) : 0;
  const chipsLabel = me
    ? (pointValue != null ? `₹${me.chips}` : `${me.chips}`)
    : "—";


  return (
    <div className="gt-shell">
      <header className="gt-header">
        <div className="gt-header-cluster">
          <button
            type="button"
            className="gt-chip !bg-red-950/90 hover:!bg-red-900 !border-red-500/50 text-red-200 font-bold transition active:scale-95 cursor-pointer flex items-center gap-1"
            onClick={() => setLeaveConfirmOpen(true)}
            aria-label="Exit Table"
          >
            <ArrowLeft size={14} /><span>Exit</span>
          </button>
          <span className="gt-title">{modeName || "Indian Rummy"}</span>
        </div>
        <div className="gt-header-cluster">
          {table && (
            <span className="gt-chip">
              <Users size={12} className="text-[#49D78C]" />
              Players {table.max_players}
            </span>
          )}
          {table && <span className="gt-chip gt-hide-narrow">{modeName}</span>}
        </div>
        <div className="gt-header-cluster">
          <div className="flex items-center gap-1.5">
            <span className="gt-chip !border-amber-500/40 !bg-slate-900/90 text-amber-300 font-extrabold flex items-center gap-1.5 shadow-sm">
              <span className="text-[10px] text-slate-400 font-bold uppercase hidden sm:inline">BALANCE:</span>
              <span>₹{walletBalance !== null ? (walletBalance / 100).toFixed(2) : "..."}</span>
            </span>
          </div>
          {table && table.entry_fee_paise > 0 && (
            <span className="gt-chip !border-emerald-500/40 !bg-slate-900/90 text-emerald-400 font-bold flex items-center gap-1 shadow-sm">
              <span className="text-[10px] text-slate-400 uppercase">BET:</span>
              <span>₹{(table.entry_fee_paise / 100).toFixed(2)}</span>
            </span>
          )}
          <span className={`gt-chip ${connected ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {connected ? "LIVE" : "OFFLINE"}
          </span>
          {state && (
            <span className="gt-chip uppercase text-[10px] text-[#F4C542] gt-hide-narrow">
              {phase.replace("_", " ")}
            </span>
          )}
          {secondsLeft !== null && (
            <span className={`gt-chip font-mono ${secondsLeft <= 5 ? "text-red-300 animate-pulse" : ""}`}>
              ⏱ 0:{secondsLeft.toString().padStart(2, "0")}
            </span>
          )}
        </div>
      </header>

      <main className="gt-main">
        <div className="gt-rails gt-rails-left">
          <button type="button" className="gt-rail-btn" onClick={openHistory}><History size={15} /><span>History</span></button>
          <button type="button" className="gt-rail-btn" onClick={() => setScoreModalOpen(true)}><BarChart3 size={15} /><span>Score</span></button>
          <button type="button" className="gt-rail-btn" onClick={() => setChatModalOpen(true)}><MessageCircle size={15} /><span>Chat</span></button>
          <button type="button" className="gt-rail-btn" onClick={toggleSound}>
            {soundOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span>{soundOn ? "Sound" : "Muted"}</span>
          </button>
        </div>

        <div className="gt-rails gt-rails-right">
          <button type="button" className="gt-rail-btn" disabled={hand.length === 0 || isGameOver} onClick={doSort}><Shuffle size={15} /><span>Sort</span></button>
          <button type="button" className="gt-rail-btn" disabled={hand.length === 0 || isGameOver} onClick={doAutoSort}><Sparkles size={15} className="text-[#F4C542]" /><span>Auto Sort</span></button>
          <button type="button" className="gt-rail-btn" disabled={isGameOver} onClick={resetGroups}><RotateCcw size={15} /><span>Reset</span></button>
        </div>

        <div className="gt-table">
          <div className="gt-felt">
            <div className="gt-watermark">RUMMY</div>
          </div>

          {/* Central Turn Announcement Banner */}
          {isPlayingPhase && !showingResult && (
            <div className={`gt-turn-banner ${isMyTurnActive ? "gt-turn-mine animate-pulse" : "gt-turn-opponent"}`}>
              {isMyTurnActive ? (
                <span>👉 YOUR TURN: {phase === "await_draw" ? "Pick Open or Closed Card" : "Discard or Declare"}</span>
              ) : (
                <span>⏳ {activeTurnPlayer?.name || "Player"}'s Turn ({secondsLeft !== null ? `${secondsLeft}s` : "..."})</span>
              )}
            </div>
          )}

          <div className={`relative z-10 pt-1 text-center ${showingResult ? "invisible" : ""}`}>
            <div className="flex justify-center gap-5 flex-wrap px-6">
              {opponents.map((p) => {
                const isOpponentTurn = state?.turn === p.id && isPlayingPhase && !isGameOver;
                return (
                  <div key={p.id} className="text-center relative">
                    {/* Opponent Active Turn Indicator */}
                    {isOpponentTurn && (
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-[8px] px-2 py-0.5 rounded-full shadow-lg border border-amber-300 animate-bounce flex items-center gap-1 z-30 pointer-events-none">
                        <span>▶ TURN</span>
                      </div>
                    )}
                    <div className={`relative gt-seat-avatar ${isOpponentTurn ? "ring-4 ring-amber-400 ring-offset-2 ring-offset-black rounded-full" : ""}`}>
                      <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-[#2B3045] to-[#090B14] border-2 flex items-center justify-center font-display font-bold text-sm ${isOpponentTurn ? "border-[#F4C542] shadow-[0_0_24px_rgba(244,197,66,.8)]" : "border-white/30"}`}>{p.name.slice(0, 2).toUpperCase()}</div>
                      {isOpponentTurn && secondsLeft !== null && <TurnRing seconds={secondsLeft} total={table?.turn_seconds ?? 30} size={40} />}
                      {isOpponentTurn && secondsLeft !== null && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#0B1020] border-2 border-[#F4C542] flex items-center justify-center text-[7px] font-mono font-bold text-[#F4C542]">{secondsLeft}</span>}
                      {(p.eliminated || p.status !== "active") && (
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-red-900 border border-red-600 flex items-center justify-center text-[7px]">✕</span>
                      )}
                    </div>
                    <div className={`text-[10px] font-semibold mt-0.5 leading-tight ${isOpponentTurn ? "text-amber-300 font-extrabold" : "text-white"}`}>{p.name}</div>
                    <div className="text-[8px] text-white/70 leading-tight">🪙{p.chips} · 🂠{p.hand_count}</div>
                  </div>
                );
              })}
              {phase === "waiting" && Array.from({ length: emptySeats }).map((_, i) => (
                <div key={`empty-${i}`} className="text-center opacity-40">
                  <div className="gt-seat-avatar rounded-full border-2 border-dashed border-white/30 flex items-center justify-center"><span className="text-lg text-white/40">?</span></div>
                  <div className="text-[9px] text-white/50 mt-0.5">Empty</div>
                </div>
              ))}
            </div>
          </div>

          <div className="gt-piles">
            <div className="text-center">
              {state?.wild_joker ? <PlayingCard code={state.wild_joker} wild small className="gt-pile-card" /> : <div className="gt-pile-card rounded-lg bg-black/20 border border-dashed border-white/25" />}
              <div className="gt-pile-label">Wild</div>
            </div>
            <button className="text-center disabled:opacity-60" disabled={!myTurn || phase !== "await_draw"} onClick={() => send({ action: "draw", source: "stock" })}>
              <PlayingCard code="" faceDown small className="gt-pile-card" />
              <div className="gt-pile-label">Closed ({state?.stock_count ?? 0})</div>
            </button>
            <div
              role="button"
              tabIndex={0}
              className={`text-center ${myTurn && phase === "await_draw" ? "cursor-pointer" : "opacity-60"}`}
              onClick={myTurn && phase === "await_draw" ? () => send({ action: "draw", source: "discard" }) : undefined}
            >
              {state?.top_discard ? <PlayingCard code={state.top_discard} small className="gt-pile-card" /> : <div className="gt-pile-card rounded-lg bg-black/20 border border-dashed border-white/25" />}
              <div className="gt-pile-label">Open ({state?.discard_count ?? 0})</div>
            </div>
            <div
              role="button"
              tabIndex={0}
              className={`gt-finish ${!finishCard && selected.size !== 1 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${finishCard ? "filled" : ""} ${dragCode ? "ring-2 ring-[#F4C542]" : ""}`}
              onClick={!finishCard && selected.size !== 1 ? undefined : toggleFinishSlot}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && (finishCard || selected.size === 1)) toggleFinishSlot(); }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={dropOnFinishSlot}
            >
              {finishCard ? <PlayingCard code={finishCard} small className="gt-pile-card" /> : "Finish\nSlot"}
            </div>

            {announceText && (
              <div className={`absolute inset-0 flex items-center justify-center z-20 pointer-events-none transition-opacity duration-500 ${announceFading ? "opacity-0" : "opacity-100"}`}>
                <div className="gt-announce flex items-center text-center bg-[#002A1F]/95 border border-[#1ED291]/30 shadow-2xl">
                  {announceCards[0] && <PlayingCard code={announceCards[0]} small className="gt-announce-card" />}
                  <span>{announceText}</span>
                  {announceCards[1] && <PlayingCard code={announceCards[1]} small className="gt-announce-card" />}
                </div>
              </div>
            )}
          </div>

          {phase === "waiting" && (
            <p className="relative z-10 text-center text-[11px] text-white/80 px-5">
              {seatedCount < 2 ? `Waiting for players (${seatedCount}/2 minimum)…` : `${seatedCount} seated — ready to start.`}
            </p>
          )}

          {me && (
            <div className={`relative z-10 text-center pb-1 ${showingResult ? "invisible" : ""}`}>
              {/* Active Player Turn Badge */}
              {isMyTurnActive && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-500 text-slate-950 font-black text-[9px] px-2.5 py-0.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.9)] border border-green-200 animate-pulse flex items-center gap-1 z-30 pointer-events-none">
                  <span>✨ YOUR TURN</span>
                </div>
              )}
              <div className={`relative gt-seat-avatar ${isMyTurnActive ? "ring-4 ring-emerald-400 ring-offset-2 ring-offset-black rounded-full" : ""}`}>
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-[#2B3045] to-[#090B14] border-2 flex items-center justify-center font-display font-bold text-xs ${isMyTurnActive ? "border-emerald-400 shadow-[0_0_22px_rgba(16,185,129,.8)]" : "border-white/30"}`}>{me.name.slice(0, 2).toUpperCase()}</div>
                {isMyTurnActive && secondsLeft !== null && <TurnRing seconds={secondsLeft} total={table?.turn_seconds ?? 30} size={36} />}
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 leading-tight ${isMyTurnActive ? "text-emerald-400 font-extrabold" : "text-white"}`}>You ({me.name})</div>
            </div>
          )}

          {state && (state.phase === "deal_over" || state.phase === "game_over") && !resultDismissed && (
            <ResultOverlay state={state} meId={me?.id ?? null} table={table} onContinue={() => setResultDismissed(true)} onBackToLobby={handleBackToLobby} onPlayAgain={handlePlayAgain} playAgainBusy={playAgainBusy} />
          )}
        </div>
      </main>

      <footer className="gt-footer">
        <div className={`gt-hand ${isGameOver ? "pointer-events-none opacity-80" : ""}`}>
          {groups.map((group, i) => {
            const meldType = classifyGroup(group, wildRank);
            const valid = meldType !== "invalid";
            const points = deadwoodPoints(group, wildRank);
            return (
              <div
                key={i}
                className={`gt-hand-group ${dragCode && !group.includes(dragCode) ? "ring-2 ring-[#F4C542]/60 border-[#F4C542]/40" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => !isGameOver && dropOnGroup(group.find((c) => c !== dragCode) ?? null)}
              >
                <div className="gt-hand-cards">
                  {group.map((code, ci) => (
                    <div key={code} className="gt-hand-card" style={{ zIndex: ci }}>
                      <PlayingCard
                        code={code}
                        small
                        className="gt-card-hand"
                        selected={selected.has(code)}
                        wild={isWild(parseCard(code), wildRank)}
                        disabled={isGameOver}
                        onClick={() => toggleSelect(code)}
                        draggable={!isGameOver}
                        onDragStart={() => !isGameOver && setDragCode(code)}
                        onDragEnd={() => setDragCode(null)}
                      />
                    </div>
                  ))}
                </div>
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${valid ? "bg-green-700/60 text-green-200" : "bg-red-800/70 text-red-200"}`}>
                  <button className="w-3.5 h-3.5 flex items-center justify-center disabled:opacity-40" disabled={i === 0 || isGameOver} onClick={() => shiftLeft(i)}>◀</button>
                  <span className="whitespace-nowrap">{valid ? meldType.replace("_", " ") : `Invalid (${points})`}</span>
                  <button className="w-3.5 h-3.5 flex items-center justify-center disabled:opacity-40" disabled={i === groups.length - 1 || isGameOver} onClick={() => shiftRight(i)}>▶</button>
                </div>
              </div>
            );
          })}
          {dragCode && !isGameOver && (
            <div className="shrink-0 w-14 h-20 rounded-lg border-2 border-dashed border-[#F4C542]/60 text-[9px] text-[#F4C542] flex items-center justify-center text-center animate-pulse" onDragOver={(e) => e.preventDefault()} onDrop={() => dropOnGroup(null)}>
              + New group
            </div>
          )}
        </div>

        <div className="gt-actions">
          <div className="gt-stat">
            <span className="gt-stat-box">{chipsLabel}</span>
            <span className="gt-stat-box">Total {me?.deal_points ?? 0}</span>
            {selected.size > 0 && !isGameOver && (
              <button type="button" className="gt-icon-btn" onClick={ungroupSelected} aria-label="Ungroup"><Minus size={14} /></button>
            )}
            {selected.size >= 2 && !isGameOver && (
              <button type="button" className="gt-icon-btn" onClick={groupSelected} aria-label="Group"><Plus size={14} /></button>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canDiscard && !isGameOver && (
              <button type="button" className="gt-btn-discard inline-flex items-center justify-center gap-1" onClick={doDiscard}>
                <Trash2 size={13} /> Discard
              </button>
            )}
            {canDrop && !isGameOver && (
              <button type="button" className="gt-btn-drop inline-flex items-center justify-center gap-1" onClick={() => send({ action: "drop" })}>
                <Flag size={13} /> Drop {dropCost}
              </button>
            )}
            {canDeclare && !isGameOver && (
              <button type="button" className="gt-btn-declare inline-flex items-center justify-center gap-1" onClick={doDeclare}>
                <Trophy size={13} /> Declare
              </button>
            )}
          </div>
        </div>
      </footer>

      {rulesOpen && <RulesModal onClose={() => setRulesOpen(false)} />}
      {leaveConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setLeaveConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/60 rounded-3xl p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)] text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gradient-to-br from-amber-600/30 via-red-950/40 to-slate-900 border-2 border-amber-500/50 flex items-center justify-center text-3xl shadow-inner">
              🚪
            </div>
            <h2 className="font-display text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 uppercase tracking-wide mb-1.5">
              Leave Table?
            </h2>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Are you sure you want to leave? You can return to the Rummy lobby or exit directly to the dashboard.
            </p>
            <div className="flex flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer"
                  onClick={() => setLeaveConfirmOpen(false)}
                >
                  Stay in Game
                </button>
                <button
                  type="button"
                  className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-slate-950 text-xs font-black shadow-md transition active:scale-95 cursor-pointer uppercase tracking-wider"
                  onClick={() => {
                    setLeaveConfirmOpen(false);
                    try { send({ action: "leave" }); } catch {}
                    handleBackToLobby();
                  }}
                >
                  To Lobby
                </button>
              </div>
              <button
                type="button"
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:brightness-110 text-xs font-black text-white shadow-lg shadow-red-900/40 border border-red-400/50 transition active:scale-95 cursor-pointer uppercase tracking-wider"
                onClick={() => {
                  setLeaveConfirmOpen(false);
                  try { send({ action: "leave" }); } catch {}
                  handleExitToDashboard();
                }}
              >
                Exit to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Table History Modal */}
      {historyModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/50 rounded-3xl p-5 shadow-2xl text-white flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <History size={18} className="text-amber-400" />
                <h3 className="font-display font-black text-base text-amber-300 tracking-wide uppercase">Table History</h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {historyLoading ? (
                <div className="py-12 text-center text-slate-400 text-xs">Loading game history...</div>
              ) : historyData.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">No previous hands recorded yet.</div>
              ) : (
                historyData.map((h: any) => (
                  <div key={h.id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-200">Table: {h.table_id?.substring(0, 8)}</p>
                      <p className="text-slate-400 text-[10px]">Deals played: {h.deals_played || 1}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-emerald-400">
                        {h.prize_pool_paise > 0 ? `₹${(h.prize_pool_paise / 100).toFixed(2)}` : "FREE"}
                      </p>
                      <p className="text-slate-500 text-[10px]">
                        {h.created_at ? new Date(h.created_at).toLocaleTimeString() : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table Scorecard Modal */}
      {scoreModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setScoreModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/50 rounded-3xl p-5 shadow-2xl text-white flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-amber-400" />
                <h3 className="font-display font-black text-base text-amber-300 tracking-wide uppercase">
                  Scorecard — Deal {state?.deal_number || 1}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setScoreModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                    <th className="py-2 px-2">Player</th>
                    <th className="py-2 px-2">Status</th>
                    <th className="py-2 px-2 text-right">Deal Pts</th>
                    <th className="py-2 px-2 text-right">Total Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {state?.players && state.players.length > 0 ? (
                    state.players.map((p) => {
                      const isMe = p.id === me?.id;
                      return (
                        <tr key={p.id} className={isMe ? "bg-amber-500/10" : ""}>
                          <td className="py-2.5 px-2 font-semibold text-slate-200 flex items-center gap-1.5">
                            <span>{p.name}</span>
                            {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">YOU</span>}
                          </td>
                          <td className="py-2.5 px-2">
                            <span className="capitalize text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                              {p.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-400">
                            {p.deal_points} pts
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-300">
                            {p.total_score} pts
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-500">No players seated</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Table Chat Modal */}
      {chatModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setChatModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/50 rounded-3xl p-5 shadow-2xl text-white flex flex-col h-[420px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-2">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} className="text-amber-400" />
                <h3 className="font-display font-black text-base text-amber-300 tracking-wide uppercase">Table Chat</h3>
              </div>
              <button
                type="button"
                onClick={() => setChatModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Quick Messages */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {["Good luck! 🍀", "Well played! 👏", "Nice hand! 🔥", "Hurry up! ⏳", "GG! 🏆", "Thanks! 😊"].map((msg) => (
                <button
                  key={msg}
                  type="button"
                  onClick={() => sendChatMessage(msg)}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] font-semibold transition active:scale-95 cursor-pointer"
                >
                  {msg}
                </button>
              ))}
            </div>

            {/* Chat Messages List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-3 bg-black/30 p-2.5 rounded-xl border border-white/5">
              {chatMessages.map((m) => (
                <div key={m.id} className="text-xs">
                  <span className="font-bold text-amber-300 mr-1.5">{m.sender}:</span>
                  <span className="text-slate-200">{m.text}</span>
                  <span className="text-[9px] text-slate-500 ml-2">{m.time}</span>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatMessage();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Type a message..."
                maxLength={80}
                className="flex-1 px-3 py-2 bg-slate-900 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1 transition active:scale-95 cursor-pointer"
              >
                <Send size={13} />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {lastError && <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-red-800 bg-black/90 px-6 py-3 text-sm text-red-300 shadow-2xl backdrop-blur-xl">⚠ {lastError}</div>}
    </div>
  );
}
