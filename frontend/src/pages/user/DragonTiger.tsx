import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameService } from '../../services/game';
import { walletService } from '../../services/wallet';
import { Loader } from '../../components/common/Loader';
import type { CatalogGame, GameBet, GameRound, GameState, Wallet } from '../../types';

const SLUG = 'dragon-tiger';
const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(2);
}

function parseCard(code?: string | null) {
  if (!code) return null;
  const [rank, suit] = code.split('-');
  return { rank, suit, red: suit === 'H' || suit === 'D' };
}

function PlayingCard({
  label,
  emoji,
  card,
  faceDown,
  delayMs,
  glow,
}: {
  label: string;
  emoji: string;
  card?: string | null;
  faceDown: boolean;
  delayMs: number;
  glow: 'gold' | 'red' | 'none';
}) {
  const parsed = parseCard(card);
  const glowClass =
    glow === 'gold'
      ? 'shadow-[0_0_28px_rgba(250,204,21,0.55)] ring-2 ring-yellow-300'
      : glow === 'red'
        ? 'shadow-[0_0_22px_rgba(239,68,68,0.4)] ring-1 ring-red-500/60'
        : 'shadow-[0_8px_30px_rgba(0,0,0,0.45)]';

  return (
    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
      <p className="text-sm font-bold tracking-widest text-yellow-300">
        {emoji} {label}
      </p>
      <div
        className={`relative w-[118px] h-[168px] sm:w-[140px] sm:h-[196px] rounded-xl ${glowClass} transition-shadow duration-500`}
        style={{ animation: `dtDeal 520ms cubic-bezier(.2,.8,.2,1) ${delayMs}ms both` }}
      >
        {faceDown || !parsed ? (
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-red-900 via-red-800 to-yellow-900 border-2 border-yellow-500/70 overflow-hidden">
            <div className="absolute inset-2 rounded-lg border border-yellow-400/40 bg-[radial-gradient(circle_at_30%_20%,rgba(250,204,21,0.25),transparent_45%)]" />
            <div className="absolute inset-0 opacity-30 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(250,204,21,0.12)_8px,rgba(250,204,21,0.12)_16px)]" />
          </div>
        ) : (
          <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white to-zinc-100 border border-yellow-200 flex flex-col justify-between p-3">
            <div className={`text-left ${parsed.red ? 'text-red-600' : 'text-zinc-900'}`}>
              <div className="text-2xl font-black leading-none">{parsed.rank}</div>
              <div className="text-lg leading-none">{SUIT_GLYPH[parsed.suit] || parsed.suit}</div>
            </div>
            <div className={`self-center text-5xl ${parsed.red ? 'text-red-600' : 'text-zinc-900'}`}>
              {SUIT_GLYPH[parsed.suit] || parsed.suit}
            </div>
            <div className={`self-end rotate-180 ${parsed.red ? 'text-red-600' : 'text-zinc-900'}`}>
              <div className="text-2xl font-black leading-none">{parsed.rank}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function DragonTigerPage() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<GameRound[]>([]);
  const [myBets, setMyBets] = useState<GameBet[]>([]);
  const [catalogGame, setCatalogGame] = useState<CatalogGame | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [betting, setBetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [revealTick, setRevealTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const game = gameState?.game || catalogGame;
  const cfg = game?.config || {};
  const payouts = cfg.payouts || { dragon: 1, tiger: 1, tie: 11 };
  const allowed = cfg.allowed_bets || { dragon: true, tiger: true, tie: true };

  const fetchAll = useCallback(async () => {
    try {
      const [gs, w, h, b, catalog] = await Promise.all([
        gameService.getCurrentRound(SLUG),
        walletService.getWallet(),
        gameService.getHistory(12, SLUG),
        gameService.getMyBets(1, 10, SLUG),
        gameService.getCatalog(),
      ]);
      setGameState(gs);
      setWallet(w);
      setHistory(h);
      setMyBets(b.items);
      setCountdown(gs.seconds_remaining);
      setCatalogGame(catalog.find((g) => g.slug === SLUG) || null);
    } catch {
      // keep last good state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const pollId = setInterval(fetchAll, 5000);
    return () => clearInterval(pollId);
  }, [fetchAll]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.round?.id, gameState?.round?.status]);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}://localhost:8000`;
    const ws = new WebSocket(`${wsHost}/api/v1/ws/games`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.game_slug && data.game_slug !== SLUG) return;
        if (data.type === 'round_start' || data.type === 'betting_locked' || data.type === 'round_result') {
          if (data.seconds_remaining != null) setCountdown(data.seconds_remaining);
          fetchAll();
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [fetchAll]);

  const round = gameState?.round;
  const isBetting = round?.status === 'BETTING';
  const isCalculating = round?.status === 'CALCULATING';
  const result = round?.result_data?.result as string | undefined;
  const dragonCard = round?.result_data?.dragon_card as string | undefined;
  const tigerCard = round?.result_data?.tiger_card as string | undefined;
  const showingCards = Boolean(dragonCard && tigerCard);

  useEffect(() => {
    if (showingCards) setRevealTick((n) => n + 1);
  }, [round?.id, showingCards, result]);

  const roundBets = useMemo(
    () => myBets.filter((b) => round && b.round_id === round.id),
    [myBets, round],
  );
  const wonThisRound = roundBets.some((b) => b.status === 'WON');
  const lostThisRound = roundBets.some((b) => b.status === 'LOST') && !wonThisRound;

  const handleBet = async () => {
    if (!selected || !round || !game) return;
    setError(null);
    setSuccess(null);
    setBetting(true);
    try {
      await gameService.placeBet(round.id, selected, amount, game.id);
      setSuccess(`Bet placed: ₹${paiseToRupees(amount)} on ${selected}`);
      await fetchAll();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr?.response?.data?.error?.message || 'Failed to place bet');
    } finally {
      setBetting(false);
    }
  };

  const options = [
    { key: 'DRAGON', label: 'DRAGON 🐉', enabled: allowed.dragon !== false, payout: payouts.dragon, tone: 'from-red-700 to-red-500' },
    { key: 'TIGER', label: 'TIGER 🐯', enabled: allowed.tiger !== false, payout: payouts.tiger, tone: 'from-yellow-600 to-amber-400' },
    { key: 'TIE', label: 'TIE', enabled: allowed.tie !== false, payout: payouts.tie, tone: 'from-emerald-700 to-green-500' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <style>{`
        @keyframes dtDeal {
          from { opacity: 0; transform: translateY(28px) rotateY(70deg) scale(.92); }
          to { opacity: 1; transform: none; }
        }
        @keyframes dtPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.35); }
          50% { box-shadow: 0 0 28px 6px rgba(250, 204, 21, 0.28); }
        }
      `}</style>

      <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-zinc-950 via-red-950/40 to-emerald-950/30 p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-yellow-400/80">Live table</p>
        <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-red-400 to-green-400">
          Dragon Tiger
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Higher rank wins. Suit does not count.</p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-zinc-500">Round</p>
            <p className="font-mono text-xs text-zinc-400">{round?.id?.slice(0, 8) ?? '—'}</p>
          </div>
          <div className="text-center">
            <div
              className={`text-5xl font-black tabular-nums ${
                isBetting ? 'text-green-400' : isCalculating ? 'text-yellow-300' : 'text-zinc-500'
              }`}
            >
              {Math.floor(countdown)}s
            </div>
            <p className="text-xs font-semibold mt-1 text-zinc-400">
              {isBetting ? 'Betting open' : isCalculating ? 'Cards drawing' : 'Waiting'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Wallet</p>
            <p className="text-xl font-bold text-yellow-300">₹{wallet?.balance_inr ?? '0.00'}</p>
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl p-4 sm:p-6 border ${
          wonThisRound
            ? 'border-yellow-400 bg-gradient-to-b from-emerald-950/80 to-zinc-950'
            : lostThisRound
              ? 'border-red-900 bg-gradient-to-b from-red-950/50 to-zinc-950'
              : 'border-zinc-800 bg-zinc-950'
        }`}
        key={revealTick}
      >
        <div className="flex items-end justify-center gap-4 sm:gap-10">
          <PlayingCard
            label="DRAGON"
            emoji="🐉"
            card={dragonCard}
            faceDown={!showingCards}
            delayMs={0}
            glow={result === 'DRAGON' ? 'gold' : showingCards && result === 'TIGER' ? 'red' : 'none'}
          />
          <div className="pb-16 text-yellow-500/80 font-black">VS</div>
          <PlayingCard
            label="TIGER"
            emoji="🐯"
            card={tigerCard}
            faceDown={!showingCards}
            delayMs={380}
            glow={result === 'TIGER' ? 'gold' : showingCards && result === 'DRAGON' ? 'red' : 'none'}
          />
        </div>
        {showingCards && (
          <div
            className={`mt-5 text-center rounded-xl py-3 font-black tracking-widest ${
              result === 'TIE'
                ? 'bg-emerald-900/40 text-green-300'
                : wonThisRound
                  ? 'bg-yellow-500/15 text-yellow-200'
                  : lostThisRound
                    ? 'bg-red-950/80 text-red-300'
                    : 'bg-zinc-900 text-zinc-200'
            }`}
            style={{ animation: 'dtDeal 480ms ease 720ms both' }}
          >
            RESULT: {result}
            {wonThisRound ? ' · YOU WON' : lostThisRound ? ' · NO PAYOUT' : ''}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-300">Betting options</p>
          <p className="text-xs text-zinc-500">
            Selection: <span className="text-yellow-300">{selected ?? 'none'}</span>
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {options.map((opt) => (
            <button
              key={opt.key}
              disabled={!isBetting || betting || !opt.enabled}
              onClick={() => setSelected(opt.key)}
              className={`rounded-xl py-4 px-3 font-black text-white bg-gradient-to-br ${opt.tone} ${
                selected === opt.key ? 'ring-4 ring-yellow-300 scale-[1.02]' : 'opacity-90'
              } ${!isBetting || !opt.enabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {opt.label}
              <span className="block text-xs font-semibold mt-1 opacity-90">{opt.payout}x payout</span>
            </button>
          ))}
        </div>

        <p className="text-sm text-zinc-400">Bet amount</p>
        <div className="flex flex-wrap gap-2">
          {[1000, 5000, 10000, 25000, 50000].map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                amount === p ? 'bg-yellow-500 text-zinc-950' : 'bg-zinc-800 text-zinc-200'
              }`}
            >
              ₹{paiseToRupees(p)}
            </button>
          ))}
        </div>

        <button
          onClick={handleBet}
          disabled={!isBetting || !selected || betting}
          className="w-full py-4 rounded-xl font-black text-lg bg-gradient-to-r from-red-600 via-yellow-500 to-green-500 text-zinc-950 disabled:from-zinc-700 disabled:via-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500"
        >
          {betting ? 'Placing…' : selected ? `Place bet ₹${paiseToRupees(amount)} on ${selected}` : 'Select Dragon, Tiger, or Tie'}
        </button>
        {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        {success && <p className="text-sm text-green-400 text-center">{success}</p>}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm font-semibold text-zinc-300 mb-3">Recent results</p>
        {history.length === 0 ? (
          <p className="text-sm text-zinc-500">No completed rounds yet.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {history.map((r) => {
              const res = r.result_data?.result as string | undefined;
              const cls =
                res === 'DRAGON'
                  ? 'from-red-700 to-red-500'
                  : res === 'TIGER'
                    ? 'from-yellow-600 to-amber-400'
                    : 'from-emerald-700 to-green-500';
              return (
                <div
                  key={r.id}
                  className={`min-w-14 h-14 rounded-xl bg-gradient-to-br ${cls} text-white text-[11px] font-black flex items-center justify-center`}
                >
                  {res === 'DRAGON' ? '🐉' : res === 'TIGER' ? '🐯' : 'TIE'}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[11px] text-zinc-500 mt-3">
          Previous outcomes are shown for history only. They do not predict future results.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <p className="text-sm font-semibold text-zinc-300 mb-3">My Dragon Tiger bets</p>
        {myBets.length === 0 ? (
          <p className="text-sm text-zinc-500">No bets yet.</p>
        ) : (
          <div className="space-y-2">
            {myBets.map((bet) => (
              <div key={bet.id} className="flex items-center justify-between text-sm bg-zinc-900 rounded-lg px-3 py-2">
                <span className="font-semibold text-zinc-200">{bet.prediction}</span>
                <span className="text-zinc-400">₹{paiseToRupees(bet.amount)}</span>
                <span
                  className={
                    bet.status === 'WON' ? 'text-yellow-300' : bet.status === 'LOST' ? 'text-red-400' : 'text-zinc-400'
                  }
                >
                  {bet.status === 'WON' ? `+₹${paiseToRupees(bet.net_win_amount || 0)}` : bet.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
