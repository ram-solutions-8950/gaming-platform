import { useEffect, useState, useRef, useCallback } from 'react';
import { Card } from '../../components/common/Card';
import { Loader } from '../../components/common/Loader';
import { gameService } from '../../services/game';
import { walletService } from '../../services/wallet';
import type { GameState, GameBet, GameRound, Wallet } from '../../types';

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
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [gs, w, h, b] = await Promise.all([
        gameService.getCurrentRound(),
        walletService.getWallet(),
        gameService.getHistory(10),
        gameService.getMyBets(1, 10),
      ]);
      setGameState(gs);
      setWallet(w);
      setHistory(h);
      setMyBets(b.items);
      setCountdown(gs.seconds_remaining);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 5 seconds as a fallback alongside WebSocket
  useEffect(() => {
    fetchAll();
    const pollId = setInterval(fetchAll, 5000);
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
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}://localhost:8000`;
    const ws = new WebSocket(`${wsHost}/api/v1/ws/games`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.game_slug && data.game_slug !== 'colour-prediction') {
          return;
        }
        if (data.type === 'round_start') {
          setCountdown(data.seconds_remaining);
          fetchAll();
        } else if (data.type === 'betting_locked') {
          setCountdown(data.seconds_remaining);
          fetchAll();
        } else if (data.type === 'round_result') {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Colour Prediction</h1>
        <p className="text-gray-400 mt-1">Predict the colour or number to win!</p>
      </div>

      {/* Round Status & Timer */}
      <Card>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gray-400">Current Round</p>
            <p className="text-xs text-gray-500 font-mono mt-1">{round?.id?.slice(0, 8) ?? '---'}</p>
          </div>
          <div className="text-center">
            <div className={`text-6xl font-extrabold tabular-nums ${
              isBetting ? 'text-green-400' : isCalculating ? 'text-yellow-400' : 'text-gray-500'
            }`}>
              {Math.floor(countdown)}s
            </div>
            <p className={`text-sm font-semibold mt-1 ${
              isBetting ? 'text-green-400' : isCalculating ? 'text-yellow-400' : 'text-gray-500'
            }`}>
              {isBetting ? '🟢 Betting Open' : isCalculating ? '⏳ Calculating...' : 'Waiting...'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Balance</p>
            <p className="text-2xl font-bold text-white">₹{wallet?.balance_inr ?? '0.00'}</p>
          </div>
        </div>
      </Card>

      {/* Betting Panel */}
      <Card title="Place Your Bet">
        {/* Colour predictions */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Pick a colour</p>
          <div className="flex gap-3 flex-wrap">
            {PREDICTIONS.map((p) => (
              <button
                key={p.value}
                disabled={!isBetting || betting}
                onClick={() => setSelectedPrediction(p.value)}
                className={`
                  flex-1 min-w-[100px] py-4 rounded-xl text-white font-bold text-lg transition-all duration-200
                  ${p.color} ${p.hoverColor}
                  ${selectedPrediction === p.value ? 'ring-4 ring-white/50 scale-105' : 'opacity-80'}
                  ${!isBetting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {p.label}
                <span className="block text-xs font-normal opacity-70">{p.multi}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Number predictions */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Or pick a number (9x payout)</p>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {NUMBERS.map((n) => {
              const isRed = ['0', '2', '4', '6', '8'].includes(n.value);
              return (
                <button
                  key={n.value}
                  disabled={!isBetting || betting}
                  onClick={() => setSelectedPrediction(n.value)}
                  className={`
                    py-3 rounded-lg font-bold text-lg transition-all duration-200
                    ${isRed ? 'bg-red-900/60 text-red-300' : 'bg-green-900/60 text-green-300'}
                    ${selectedPrediction === n.value ? 'ring-4 ring-white/50 scale-110' : ''}
                    ${!isBetting ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:opacity-100'}
                  `}
                >
                  {n.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bet amount */}
        <div className="mb-6">
          <p className="text-sm text-gray-400 mb-3">Bet amount</p>
          <div className="flex gap-2 flex-wrap">
            {BET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => setSelectedAmount(amt)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                  ${selectedAmount === amt
                    ? 'bg-brand-600 text-white'
                    : 'bg-dark-800 text-gray-300 hover:bg-dark-700'}
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
            w-full py-4 rounded-xl text-lg font-bold transition-all duration-200
            ${isBetting && selectedPrediction
              ? 'bg-gradient-to-r from-brand-500 to-gold-500 text-white hover:from-brand-400 hover:to-gold-400 cursor-pointer'
              : 'bg-dark-700 text-gray-500 cursor-not-allowed'}
          `}
        >
          {betting ? 'Placing...' : selectedPrediction
            ? `Bet ₹${paiseToRupees(selectedAmount)} on ${selectedPrediction}`
            : 'Select a prediction'}
        </button>

        {error && <p className="mt-3 text-sm text-red-400 text-center">{error}</p>}
        {success && <p className="mt-3 text-sm text-green-400 text-center">{success}</p>}
      </Card>

      {/* Recent Results */}
      <Card title="Recent Results">
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">No completed rounds yet.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {history.map((r) => {
              const colorClass =
                r.result_color === 'RED' ? 'bg-red-600' :
                r.result_color === 'GREEN' ? 'bg-green-600' :
                r.result_color === 'VIOLET' ? 'bg-violet-600' : 'bg-gray-600';
              return (
                <div
                  key={r.id}
                  className={`w-12 h-12 ${colorClass} rounded-lg flex items-center justify-center text-white font-bold text-lg`}
                  title={`Round ${r.id.slice(0, 8)} — ${r.result_color} #${r.result_number}`}
                >
                  {r.result_number}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* My Recent Bets */}
      <Card title="My Recent Bets">
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
