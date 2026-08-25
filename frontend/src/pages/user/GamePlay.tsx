import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import { walletService } from '../../services/wallet';
import type { GameState, GameBet, GameRound, Wallet } from '../../types';
import { soundManager } from '../../services/soundManager';

const PREDICTIONS = [
  { value: 'RED', label: 'Red', color: 'bg-red-600', hoverColor: 'hover:bg-red-500', textColor: 'text-red-400', multi: '2x' },
  { value: 'GREEN', label: 'Green', color: 'bg-green-600', hoverColor: 'hover:bg-green-500', textColor: 'text-green-400', multi: '2x' },
  { value: 'VIOLET', label: 'Violet', color: 'bg-violet-600', hoverColor: 'hover:bg-violet-500', textColor: 'text-violet-400', multi: '4.5x' },
];

const NUMBERS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i),
  label: String(i),
  multi: '9x',
}));

const BET_AMOUNTS = [1000, 5000, 10000, 50000, 100000]; // paisa

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(2);
}

export function GamePlayPage() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<GameRound[]>([]);
  const [myBets, setMyBets] = useState<GameBet[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<string | null>(null);
  const [selectedAmount, setSelectedAmount] = useState<number>(1000);
  const [loading, setLoading] = useState(true);
  const [betting, setBetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const prevCountdown = useRef<number>(-1);
  // Play countdown tick sound for values 9-5
  useEffect(() => {
    if (countdown !== prevCountdown.current && countdown >= 5 && countdown <= 9) {
      soundManager.play('countdown_tick');
    }
    prevCountdown.current = countdown;
  }, [countdown]);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [latestResult, setLatestResult] = useState<{ color: string; number: string; roundId: string } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [gs, w, h, b] = await Promise.all([
        gameService.getCurrentRound('colour-prediction'),
        walletService.getWallet(),
        gameService.getHistory(15, 'colour-prediction'),
        gameService.getMyBets(1, 15, 'colour-prediction'),
      ]);
      setGameState(gs);
      setWallet(w);
      setHistory(h || []);
      setMyBets(b?.items || []);
      setCountdown(gs.seconds_remaining);

      // If history has recent round, populate latestResult if not already set
      if (h && h.length > 0 && h[0].status === 'COMPLETED' && h[0].result_color) {
        setLatestResult({
          color: h[0].result_color,
          number: h[0].result_number ?? '?',
          roundId: h[0].id,
        });
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 3 seconds as a fallback alongside WebSocket
  useEffect(() => {
    fetchAll();
    const pollId = setInterval(fetchAll, 3000);
    return () => clearInterval(pollId);
  }, [fetchAll]);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState?.round?.id]);

  // WebSocket connection
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}://${window.location.hostname || 'localhost'}:8000`;
    const ws = new WebSocket(`${wsHost}/api/v1/ws/games`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.game_slug && data.game_slug !== 'colour-prediction') {
          return;
        }
        if (data.type === 'round_start') {
          soundManager.play('betting_start');
          setCountdown(data.seconds_remaining);
          fetchAll();
        } else if (data.type === 'betting_locked') {
          soundManager.play('betting_stop');
          setCountdown(data.seconds_remaining);
          fetchAll();
        } else if (data.type === 'round_result') {
          if (data.result_color) {
            setLatestResult({
              color: data.result_color,
              number: data.result_number != null ? String(data.result_number) : '?',
              roundId: data.round_id,
            });
            soundManager.play('reveal_tick');
          }
          fetchAll();
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [fetchAll]);

  const handleBet = async () => {
    if (!selectedPrediction || !gameState?.round) return;
    setError(null);
    setSuccess(null);
    setBetting(true);
    try {
      await gameService.placeBet(gameState.round.id, selectedPrediction, selectedAmount);
      setSuccess(`Bet placed! ₹${paiseToRupees(selectedAmount)} on ${selectedPrediction}`);
      setSelectedPrediction(null);
      await fetchAll();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      setError(axiosErr?.response?.data?.error?.message || 'Failed to place bet');
    } finally {
      setBetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  const round = gameState?.round;
  const isBetting = round?.status === 'BETTING';
  const isCalculating = round?.status === 'CALCULATING';

  return (
    <div className="cp-page w-full max-w-4xl mx-auto space-y-3">
      {/* Header & Status Bar */}
      <div className="cp-game-header bg-dark-900 border border-dark-700 rounded-2xl p-3 sm:p-4 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="cp-exit-btn px-3 py-1.5 bg-dark-800 hover:bg-dark-700 text-white font-bold text-xs rounded-xl border border-dark-700 transition shadow-sm flex items-center gap-1 active:scale-95 shrink-0"
          >
            ← Exit
          </button>
          <div className="cp-title-wrap">
            <h1 className="cp-title text-base sm:text-lg font-extrabold text-white">Colour Prediction</h1>
            <p className="cp-round-text text-[11px] text-gray-400">Round #{round?.id?.slice(0, 8) ?? '---'}</p>
          </div>
        </div>

        {/* Center Timer */}
        <div className="cp-timer-box flex items-center gap-2 bg-dark-950 px-4 py-1.5 rounded-xl border border-dark-800 shadow-inner">
          <span className={`cp-timer-countdown text-2xl sm:text-3xl font-black tabular-nums ${
            isBetting ? 'text-emerald-400' : isCalculating ? 'text-amber-400' : 'text-gray-500'
          }`}>
            {Math.floor(countdown)}s
          </span>
          <span className={`cp-timer-status text-xs font-bold uppercase tracking-wider ${
            isBetting ? 'text-emerald-400' : isCalculating ? 'text-amber-400' : 'text-gray-500'
          }`}>
            {isBetting ? '🟢 Open' : isCalculating ? '⏳ Calculating' : 'Closed'}
          </span>
        </div>

        {/* Right Balance */}
        <div className="cp-balance-box text-right">
          <p className="cp-balance-label text-[10px] text-gray-400 uppercase font-semibold">Balance</p>
          <p className="cp-balance-val text-base font-extrabold text-gold-400">₹{wallet?.balance_inr ?? '0.00'}</p>
        </div>
      </div>

      {/* Latest Winning Result Banner */}
      {latestResult && (
        <div className="cp-winner-banner bg-dark-900 border-2 border-gold-500/40 rounded-2xl p-3 sm:p-4 shadow-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-lg ${
              latestResult.color === 'RED' ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/30' :
              latestResult.color === 'GREEN' ? 'bg-gradient-to-br from-green-500 to-green-700 shadow-green-500/30' :
              latestResult.color === 'VIOLET' ? 'bg-gradient-to-br from-purple-500 to-purple-700 shadow-purple-500/30' :
              'bg-gray-700'
            }`}>
              {latestResult.number}
            </div>
            <div>
              <p className="text-[10px] text-gold-400 font-bold uppercase tracking-wider">Latest Winning Result</p>
              <p className="text-base sm:text-lg font-black text-white">
                <span className={
                  latestResult.color === 'RED' ? 'text-red-400' :
                  latestResult.color === 'GREEN' ? 'text-green-400' :
                  latestResult.color === 'VIOLET' ? 'text-purple-400' : 'text-gray-300'
                }>{latestResult.color}</span> — Number {latestResult.number}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 font-mono">Round #{latestResult.roundId?.slice(0, 8)}</span>
          </div>
        </div>
      )}

      {/* Betting Panel */}
      <Card title="Place Your Bet" className="cp-betting-card">
        {/* Colour predictions */}
        <div className="cp-colours-section mb-4">
          <p className="cp-section-label text-xs text-gray-400 mb-2 font-medium">Pick a Colour</p>
          <div className="cp-colours-grid grid grid-cols-3 gap-2.5">
            {PREDICTIONS.map((p) => (
              <button
                key={p.value}
                disabled={!isBetting || betting}
                onClick={() => setSelectedPrediction(p.value)}
                className={`
                  cp-colour-btn py-3 rounded-xl text-white font-extrabold text-sm sm:text-base transition-all duration-150 flex flex-col items-center justify-center
                  ${p.color} ${p.hoverColor}
                  ${selectedPrediction === p.value ? 'ring-4 ring-white/70 scale-[1.02]' : 'opacity-90'}
                  ${!isBetting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                `}
              >
                <span>{p.label}</span>
                <span className="text-[10px] font-semibold opacity-80">{p.multi}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Number predictions */}
        <div className="cp-numbers-section mb-4">
          <p className="cp-section-label text-xs text-gray-400 mb-2 font-medium">Or Pick a Number (9x Payout)</p>
          <div className="cp-numbers-grid grid grid-cols-10 gap-1.5">
            {NUMBERS.map((n) => {
              const isRed = ['0', '2', '4', '6', '8'].includes(n.value);
              return (
                <button
                  key={n.value}
                  disabled={!isBetting || betting}
                  onClick={() => setSelectedPrediction(n.value)}
                  className={`
                    cp-number-btn py-2 rounded-lg font-black text-sm sm:text-base transition-all duration-150
                    ${isRed ? 'bg-red-900/60 text-red-300 border border-red-500/30' : 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/30'}
                    ${selectedPrediction === n.value ? 'ring-2 ring-white scale-110' : ''}
                    ${!isBetting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-100 active:scale-95'}
                  `}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bet amount presets */}
        <div className="cp-amounts-section mb-4">
          <p className="cp-section-label text-xs text-gray-400 mb-2 font-medium">Bet Amount</p>
          <div className="cp-amounts-grid grid grid-cols-5 gap-2">
            {BET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => setSelectedAmount(amt)}
                className={`
                  cp-amount-btn py-2 rounded-lg text-xs font-extrabold transition-all duration-150 active:scale-95
                  ${selectedAmount === amt
                    ? 'bg-brand-600 text-white shadow-md shadow-brand-500/30 border border-brand-400'
                    : 'bg-dark-800 text-gray-300 hover:bg-dark-700 border border-dark-700'}
                `}
              >
                ₹{paiseToRupees(amt)}
              </button>
            ))}
          </div>
        </div>

        {/* Place bet button */}
        <button
          onClick={handleBet}
          disabled={!isBetting || !selectedPrediction || betting}
          className={`
            cp-submit-btn w-full py-3 rounded-xl text-sm sm:text-base font-extrabold transition-all duration-150 active:scale-95 shadow-lg
            ${isBetting && selectedPrediction
              ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-500 hover:to-green-500 cursor-pointer shadow-green-600/20'
              : 'bg-dark-800 text-gray-500 cursor-not-allowed border border-dark-700'}
          `}
        >
          {betting ? 'Placing Bet...' : selectedPrediction
            ? `Bet ₹${paiseToRupees(selectedAmount)} on ${selectedPrediction}`
            : 'Select a Colour or Number Above'}
        </button>

        {error && <p className="mt-2 text-xs text-red-400 text-center font-semibold">{error}</p>}
        {success && <p className="mt-2 text-xs text-emerald-400 text-center font-semibold">{success}</p>}
      </Card>

      {/* Recent Results */}
      <Card title="Recent Round Results" className="cp-results-card">
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">No completed rounds yet.</p>
        ) : (
          <div className="flex gap-2.5 flex-wrap">
            {history.map((r) => {
              const colorClass =
                r.result_color === 'RED' ? 'bg-gradient-to-br from-red-500 to-red-700 border-red-400 shadow-red-500/20' :
                r.result_color === 'GREEN' ? 'bg-gradient-to-br from-green-500 to-green-700 border-green-400 shadow-green-500/20' :
                r.result_color === 'VIOLET' ? 'bg-gradient-to-br from-purple-500 to-purple-700 border-purple-400 shadow-purple-500/20' : 'bg-gray-700 border-gray-600';
              return (
                <div
                  key={r.id}
                  className={`w-12 h-14 ${colorClass} border rounded-xl flex flex-col items-center justify-center text-white shadow-md transition-transform hover:scale-105`}
                  title={`Round ${r.id.slice(0, 8)} — ${r.result_color} #${r.result_number ?? '?'}`}
                >
                  <span className="text-xs font-bold leading-tight uppercase opacity-90">{r.result_color ? r.result_color[0] : '-'}</span>
                  <span className="text-base font-black leading-tight">{r.result_number ?? '?'}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* My Recent Bets */}
      <Card title="My Recent Bets" className="cp-history-card">
        {myBets.length === 0 ? (
          <p className="text-gray-500 text-sm">You haven't placed any bets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-dark-700">
                  <th className="text-left py-2 px-2">Prediction</th>
                  <th className="text-right py-2 px-2">Bet</th>
                  <th className="text-right py-2 px-2">Stake</th>
                  <th className="text-right py-2 px-2">Won</th>
                  <th className="text-center py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {myBets.map((bet) => (
                  <tr key={bet.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                    <td className="py-2 px-2 font-semibold text-gray-200">{bet.prediction}</td>
                    <td className="py-2 px-2 text-right text-gray-300">₹{paiseToRupees(bet.amount)}</td>
                    <td className="py-2 px-2 text-right text-gray-400">₹{paiseToRupees(bet.stake_amount)}</td>
                    <td className="py-2 px-2 text-right">
                      {bet.net_win_amount != null && bet.net_win_amount > 0 ? (
                        <span className="text-green-400 font-semibold">+₹{paiseToRupees(bet.net_win_amount)}</span>
                      ) : bet.status === 'LOST' ? (
                        <span className="text-red-400">-₹{paiseToRupees(bet.amount)}</span>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        bet.status === 'WON' ? 'bg-green-900/50 text-green-400' :
                        bet.status === 'LOST' ? 'bg-red-900/50 text-red-400' :
                        'bg-yellow-900/50 text-yellow-400'
                      }`}>
                        {bet.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
