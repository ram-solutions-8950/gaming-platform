import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { rouletteService, type RouletteState } from '../../services/roulette';
import { walletService } from '../../services/wallet';
import { soundManager } from '../../services/soundManager';
import { RouletteWheel } from '../../components/roulette/RouletteWheel';
import '../../styles/roulette.css';

// European Roulette Red Numbers
const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

function getNumberColor(num: number): 'green' | 'red' | 'black' {
  if (num === 0) return 'green';
  return RED_NUMBERS.has(num) ? 'red' : 'black';
}

// Chip values matching the reference screenshots
const CHIPS = [
  { value: 10, label: '10', color: 'chip-green' },
  { value: 50, label: '50', color: 'chip-teal' },
  { value: 100, label: '100', color: 'chip-blue' },
  { value: 500, label: '500', color: 'chip-purple' },
  { value: 1000, label: '1000', color: 'chip-orange' },
  { value: 2000, label: '2000', color: 'chip-red' },
];

// European Roulette layout rows
const ROW_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const ROW_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const ROW_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

interface LocalBet {
  bet_type: string;
  target: string;
  amount: number;
}

export function RoulettePage() {
  const navigate = useNavigate();

  // Server state
  const [serverState, setServerState] = useState<RouletteState | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [selectedChip, setSelectedChip] = useState<number>(10);

  // Local pending bets before server commit or local optimistic display
  const [localBets, setLocalBets] = useState<LocalBet[]>([]);
  const [betHistoryStack, setBetHistoryStack] = useState<LocalBet[]>([]);
  const [previousRoundBets, setPreviousRoundBets] = useState<LocalBet[]>([]);

  // Overlays & Phase transitions
  const [showStartBettingBanner, setShowStartBettingBanner] = useState<boolean>(false);
  const [showStopBettingBanner, setShowStopBettingBanner] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sound & round tracking
  const prevPhaseRef = useRef<string>('');
  const prevWinningNumRef = useRef<number | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // Fetch initial wallet balance
  const refreshBalance = async () => {
    try {
      const data = await walletService.getWallet();
      if (data && typeof data.balance === 'number') {
        setBalance(data.balance / 100);
      }
    } catch {
      // ignore
    }
  };

  // Poll server state every 600ms for rock-solid sync with backend
  const fetchState = async () => {
    try {
      const state = await rouletteService.getState();
      setServerState(state);

      // Handle phase changes
      const currentPhase = state.phase;
      const prevPhase = prevPhaseRef.current;

      if (prevPhase !== currentPhase) {
        if (currentPhase === 'BETTING') {
          // New round started!
          setShowStartBettingBanner(true);
          setTimeout(() => setShowStartBettingBanner(false), 2000);
          soundManager.play('betting_start');
          // Clear local bets for the new round
          setLocalBets([]);
          setBetHistoryStack([]);
        } else if (currentPhase === 'STOP_BETTING') {
          setShowStopBettingBanner(true);
          setTimeout(() => setShowStopBettingBanner(false), 2000);
          soundManager.play('betting_stop');
        } else if (currentPhase === 'SPINNING') {
          soundManager.play('dice_roll');
        } else if (currentPhase === 'RESULT') {
          soundManager.play('reveal_tick');
          if (state.winning_number !== null && state.winning_number !== prevWinningNumRef.current) {
            prevWinningNumRef.current = state.winning_number;
            // Check if user won
            const totalWin = state.my_bets.reduce((sum, b) => sum + (b.win_inr || 0), 0);
            if (totalWin > 0) {
              soundManager.play('win_clap');
              setToastMessage(`Congratulations! You won ₹${totalWin.toFixed(2)}`);
              setTimeout(() => setToastMessage(null), 4000);
            }
            refreshBalance();
          }
        }
        prevPhaseRef.current = currentPhase;
      }
    } catch {
      // offline fallback
    }
  };

  useEffect(() => {
    refreshBalance();
    fetchState();
    pollIntervalRef.current = window.setInterval(fetchState, 700);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Compute aggregated bets per target key
  const betsByTarget = useMemo(() => {
    const map: Record<string, number> = {};
    // Server bets
    if (serverState?.my_bets) {
      serverState.my_bets.forEach((b) => {
        const key = `${b.bet_type}:${b.target}`;
        map[key] = (map[key] || 0) + b.amount_inr;
      });
    }
    // Local optimistic bets
    localBets.forEach((b) => {
      const key = `${b.bet_type}:${b.target}`;
      map[key] = (map[key] || 0) + b.amount;
    });
    return map;
  }, [serverState?.my_bets, localBets]);

  const totalMyBet = useMemo(() => {
    return Object.values(betsByTarget).reduce((sum, v) => sum + v, 0);
  }, [betsByTarget]);

  // Handle placing bet on table
  const handlePlaceBet = async (bet_type: string, target: string) => {
    if (!serverState || serverState.phase !== 'BETTING') {
      setToastMessage('Betting is closed for this round!');
      setTimeout(() => setToastMessage(null), 1500);
      return;
    }

    if (balance < selectedChip) {
      setToastMessage('Insufficient balance!');
      setTimeout(() => setToastMessage(null), 1500);
      return;
    }

    const newBet: LocalBet = { bet_type, target, amount: selectedChip };

    // Optimistically update local state & balance
    soundManager.play('bet_coin');
    setBalance((prev) => Math.max(0, prev - selectedChip));
    setLocalBets((prev) => [...prev, newBet]);
    setBetHistoryStack((prev) => [...prev, newBet]);

    // Send to server
    try {
      await rouletteService.placeBets([{
        bet_type,
        target,
        amount: selectedChip,
      }]);
      fetchState();
    } catch (err: any) {
      // Revert if rejected
      setBalance((prev) => prev + selectedChip);
      setLocalBets((prev) => prev.filter((_, idx) => idx !== prev.length - 1));
      const msg = err.response?.data?.message || 'Failed to place bet';
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 2000);
    }
  };

  // Clear bets
  const handleClearBets = async () => {
    if (!serverState || serverState.phase !== 'BETTING') return;
    if (totalMyBet === 0) return;

    try {
      await rouletteService.clearBets();
      setLocalBets([]);
      setBetHistoryStack([]);
      refreshBalance();
      fetchState();
      setToastMessage('Bets cleared');
      setTimeout(() => setToastMessage(null), 1200);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Could not clear bets';
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 1500);
    }
  };

  // Undo last bet
  const handleUndo = async () => {
    if (!serverState || serverState.phase !== 'BETTING') return;
    if (betHistoryStack.length === 0) return;

    // For safety, clearing and re-applying all except last
    const stack = [...betHistoryStack];
    const removed = stack.pop();
    if (!removed) return;

    try {
      await rouletteService.clearBets();
      if (stack.length > 0) {
        await rouletteService.placeBets(stack.map((b) => ({
          bet_type: b.bet_type,
          target: b.target,
          amount: b.amount,
        })));
      }
      setBetHistoryStack(stack);
      setLocalBets(stack);
      refreshBalance();
      fetchState();
    } catch {
      // fallback
    }
  };

  // Repeat bet
  const handleRepeatBet = async () => {
    if (!serverState || serverState.phase !== 'BETTING') return;
    if (previousRoundBets.length === 0) {
      setToastMessage('No previous bets to repeat');
      setTimeout(() => setToastMessage(null), 1500);
      return;
    }

    const needed = previousRoundBets.reduce((sum, b) => sum + b.amount, 0);
    if (balance < needed) {
      setToastMessage('Insufficient balance to repeat bet');
      setTimeout(() => setToastMessage(null), 1500);
      return;
    }

    try {
      soundManager.play('bet_coin');
      await rouletteService.placeBets(previousRoundBets.map((b) => ({
        bet_type: b.bet_type,
        target: b.target,
        amount: b.amount,
      })));
      setLocalBets([...previousRoundBets]);
      setBetHistoryStack([...previousRoundBets]);
      refreshBalance();
      fetchState();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed repeating bet';
      setToastMessage(msg);
      setTimeout(() => setToastMessage(null), 1500);
    }
  };

  // Save current bets before round ends for repeat bet support
  useEffect(() => {
    if (serverState?.phase === 'STOP_BETTING' && localBets.length > 0) {
      setPreviousRoundBets([...localBets]);
    }
  }, [serverState?.phase, localBets]);

  const winNum = serverState?.winning_number;
  const isResultPhase = serverState?.phase === 'RESULT' || serverState?.phase === 'SPINNING';

  // Helper to check if a tile is a winning target
  const isWinningTile = (type: string, target: string): boolean => {
    if (!isResultPhase || winNum === null || winNum === undefined) return false;
    const wNum: number = winNum;
    if (type === 'straight') return wNum === Number(target);
    if (wNum === 0) return target === '0';

    if (type === 'even_money') {
      if (target === 'red') return RED_NUMBERS.has(wNum);
      if (target === 'black') return !RED_NUMBERS.has(wNum) && wNum > 0;
      if (target === 'even') return wNum % 2 === 0;
      if (target === 'odd') return wNum % 2 !== 0;
      if (target === 'low') return wNum >= 1 && wNum <= 18;
      if (target === 'high') return wNum >= 19 && wNum <= 36;
    }
    if (type === 'dozen') {
      if (target === '1st12') return wNum >= 1 && wNum <= 12;
      if (target === '2nd12') return wNum >= 13 && wNum <= 24;
      if (target === '3rd12') return wNum >= 25 && wNum <= 36;
    }
    if (type === 'column') {
      if (target === 'col3') return wNum % 3 === 0;
      if (target === 'col2') return wNum % 3 === 2;
      if (target === 'col1') return wNum % 3 === 1;
    }
    return false;
  };

  const userWinAmount = useMemo(() => {
    if (serverState?.phase !== 'RESULT' || !serverState?.my_bets) return 0;
    return serverState.my_bets.reduce((sum, b) => sum + (b.win_inr || 0), 0);
  }, [serverState]);

  return (
    <div className="roulette-screen" data-testid="roulette-screen">
      {/* ── Top Header Bar ── */}
      <header className="roulette-top-bar">
        <div className="roulette-top-left">
          {/* Back Button */}
          <button
            type="button"
            className="roulette-back-circle-btn"
            onClick={() => navigate('/dashboard')}
            aria-label="Back to dashboard"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Online Players Badge */}
          <div className="roulette-online-pill">
            <span className="roulette-online-icon">👥</span>
            <span className="roulette-online-count">193</span>
          </div>

          {/* Ranking Button */}
          <div className="roulette-ranking-pill">
            <span className="roulette-ranking-trophy">🏆</span>
            <span className="roulette-ranking-text">Ranking</span>
          </div>
        </div>

        {/* Center Live Marquee & Winning History Pill Track */}
        <div className="roulette-top-center">
          <div className="roulette-marquee-row">
            <span className="roulette-speaker-icon">📢</span>
            <span className="roulette-marquee-text">Mobile1632... withdraw ₹3,000</span>
          </div>

          {/* Horizontal Number History Pills */}
          <div className="roulette-history-track">
            {serverState?.history?.slice(-16).map((item, idx, arr) => {
              const isLatest = idx === arr.length - 1;
              return (
                <div
                  key={idx}
                  className={`roulette-history-pill pill-${item.color} ${isLatest ? 'pill-latest-ring' : ''}`}
                >
                  {item.number}
                </div>
              );
            })}
            {/* Trend Graph Button */}
            <div className="roulette-trend-btn" title="Trends">
              📈
            </div>
          </div>
        </div>

        {/* Top Right ADD Cash Button */}
        <div className="roulette-top-right">
          <button
            type="button"
            className="roulette-add-cash-btn"
            onClick={() => navigate('/wallet')}
          >
            <span className="roulette-add-text">ADD</span>
            <span className="roulette-add-coin">₹</span>
          </button>
        </div>
      </header>

      {/* ── Main Play Arena ── */}
      <div className="roulette-arena">
        {/* Left Column: VIP Player Cards & Chat Button */}
        <aside className="roulette-vip-sidebar">
          {serverState?.vip_players?.map((vip, idx) => (
            <div key={idx} className="roulette-vip-card">
              {idx === 0 && <div className="roulette-winner-badge">winner</div>}
              {idx === 1 && <div className="roulette-ban-badge">BAN</div>}
              <div className="roulette-vip-avatar-frame">
                <div className={`roulette-vip-avatar-img avatar-${vip.avatar}`} />
                <span className="roulette-vip-tag">{vip.vip}</span>
              </div>
              <div className="roulette-vip-name">{vip.name}</div>
              <div className="roulette-vip-balance">₹{vip.balance_inr}</div>
              {vip.last_win && (
                <div className="roulette-vip-win-bubble">+{vip.last_win}</div>
              )}
            </div>
          ))}

          {/* Bottom Chat Bubble */}
          <button
            type="button"
            className="roulette-chat-circle-btn"
            aria-label="Chat"
            onClick={() => setToastMessage('Chat room is active')}
          >
            💬
          </button>
        </aside>

        {/* Center Main Green Felt Board */}
        <main className="roulette-board-container">
          {/* European Roulette Wheel Animation Overlay */}
          <RouletteWheel
            phase={serverState?.phase || 'BETTING'}
            winningNumber={serverState?.winning_number ?? null}
            winningColor={serverState?.winning_color ?? null}
            secondsLeft={serverState?.seconds_left ?? 0}
            userWinAmount={userWinAmount}
          />

          <div className="roulette-felt-table">
            {/* Zero Cell on Left */}
            <div
              className={`felt-cell felt-cell-zero ${isWinningTile('straight', '0') ? 'tile-winning-glow' : ''}`}
              onClick={() => handlePlaceBet('straight', '0')}
            >
              <span className="zero-label">0</span>
              {betsByTarget['straight:0'] > 0 && (
                <div className="placed-chip chip-placed-50">
                  {betsByTarget['straight:0']}
                </div>
              )}
            </div>

            {/* Grid of 36 Numbers (3 rows x 12 cols) */}
            <div className="felt-numbers-grid">
              {/* Row 3 (Top row: 3, 6, 9... 36) */}
              <div className="felt-number-row">
                {ROW_3.map((num) => {
                  const color = getNumberColor(num);
                  const isWin = isWinningTile('straight', String(num));
                  const chipAmt = betsByTarget[`straight:${num}`] || 0;
                  return (
                    <div
                      key={num}
                      className={`felt-cell felt-num-cell cell-${color} ${isWin ? 'tile-winning-glow' : ''}`}
                      onClick={() => handlePlaceBet('straight', String(num))}
                    >
                      <span className="num-label">{num}</span>
                      {chipAmt > 0 && (
                        <div className="placed-chip chip-placed-10">{chipAmt}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Row 2 (Middle row: 2, 5, 8... 35) */}
              <div className="felt-number-row">
                {ROW_2.map((num) => {
                  const color = getNumberColor(num);
                  const isWin = isWinningTile('straight', String(num));
                  const chipAmt = betsByTarget[`straight:${num}`] || 0;
                  return (
                    <div
                      key={num}
                      className={`felt-cell felt-num-cell cell-${color} ${isWin ? 'tile-winning-glow' : ''}`}
                      onClick={() => handlePlaceBet('straight', String(num))}
                    >
                      <span className="num-label">{num}</span>
                      {chipAmt > 0 && (
                        <div className="placed-chip chip-placed-50">{chipAmt}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Row 1 (Bottom row: 1, 4, 7... 34) */}
              <div className="felt-number-row">
                {ROW_1.map((num) => {
                  const color = getNumberColor(num);
                  const isWin = isWinningTile('straight', String(num));
                  const chipAmt = betsByTarget[`straight:${num}`] || 0;
                  return (
                    <div
                      key={num}
                      className={`felt-cell felt-num-cell cell-${color} ${isWin ? 'tile-winning-glow' : ''}`}
                      onClick={() => handlePlaceBet('straight', String(num))}
                    >
                      <span className="num-label">{num}</span>
                      {chipAmt > 0 && (
                        <div className="placed-chip chip-placed-100">{chipAmt}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Column: 2 TO 1 Bets */}
            <div className="felt-column-bets">
              <div
                className={`felt-cell felt-2to1-cell ${isWinningTile('column', 'col3') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('column', 'col3')}
              >
                <span>2 TO 1</span>
                {betsByTarget['column:col3'] > 0 && (
                  <div className="placed-chip chip-placed-500">{betsByTarget['column:col3']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-2to1-cell ${isWinningTile('column', 'col2') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('column', 'col2')}
              >
                <span>2 TO 1</span>
                {betsByTarget['column:col2'] > 0 && (
                  <div className="placed-chip chip-placed-500">{betsByTarget['column:col2']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-2to1-cell ${isWinningTile('column', 'col1') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('column', 'col1')}
              >
                <span>2 TO 1</span>
                {betsByTarget['column:col1'] > 0 && (
                  <div className="placed-chip chip-placed-500">{betsByTarget['column:col1']}</div>
                )}
              </div>
            </div>

            {/* Dozen Bets Row: 1ST 12, 2ND 12, 3RD 12 */}
            <div className="felt-dozens-row">
              <div
                className={`felt-cell felt-dozen-cell ${isWinningTile('dozen', '1st12') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('dozen', '1st12')}
              >
                <span>1ST 12</span>
                {betsByTarget['dozen:1st12'] > 0 && (
                  <div className="placed-chip chip-placed-100">{betsByTarget['dozen:1st12']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-dozen-cell ${isWinningTile('dozen', '2nd12') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('dozen', '2nd12')}
              >
                <span>2ND 12</span>
                {betsByTarget['dozen:2nd12'] > 0 && (
                  <div className="placed-chip chip-placed-100">{betsByTarget['dozen:2nd12']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-dozen-cell ${isWinningTile('dozen', '3rd12') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('dozen', '3rd12')}
              >
                <span>3RD 12</span>
                {betsByTarget['dozen:3rd12'] > 0 && (
                  <div className="placed-chip chip-placed-100">{betsByTarget['dozen:3rd12']}</div>
                )}
              </div>
            </div>

            {/* Outside Bets Row: 1 TO 18, EVEN, RED, BLACK, ODD, 19 TO 36 */}
            <div className="felt-outside-row">
              <div
                className={`felt-cell felt-outside-cell ${isWinningTile('even_money', 'low') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'low')}
              >
                <span>1 TO 18</span>
                {betsByTarget['even_money:low'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:low']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-outside-cell ${isWinningTile('even_money', 'even') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'even')}
              >
                <span>EVEN</span>
                {betsByTarget['even_money:even'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:even']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-outside-cell felt-diamond-red ${isWinningTile('even_money', 'red') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'red')}
              >
                <div className="red-diamond-symbol" />
                {betsByTarget['even_money:red'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:red']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-outside-cell felt-diamond-black ${isWinningTile('even_money', 'black') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'black')}
              >
                <div className="black-diamond-symbol" />
                {betsByTarget['even_money:black'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:black']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-outside-cell ${isWinningTile('even_money', 'odd') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'odd')}
              >
                <span>ODD</span>
                {betsByTarget['even_money:odd'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:odd']}</div>
                )}
              </div>
              <div
                className={`felt-cell felt-outside-cell ${isWinningTile('even_money', 'high') ? 'tile-winning-glow' : ''}`}
                onClick={() => handlePlaceBet('even_money', 'high')}
              >
                <span>19 TO 36</span>
                {betsByTarget['even_money:high'] > 0 && (
                  <div className="placed-chip chip-placed-50">{betsByTarget['even_money:high']}</div>
                )}
              </div>
            </div>

            {/* ── Overlay: Start Betting Banner ── */}
            {showStartBettingBanner && (
              <div className="roulette-phase-banner banner-start-betting">
                <div className="banner-text-3d">Start Betting</div>
              </div>
            )}

            {/* ── Overlay: Stop Betting Banner ── */}
            {showStopBettingBanner && (
              <div className="roulette-phase-banner banner-stop-betting">
                <div className="banner-text-3d purple-glow">Stop Betting</div>
              </div>
            )}

            {/* ── Overlay: Big Winning Number Reveal ── */}
            {isResultPhase && winNum !== null && (
              <div className="roulette-result-reveal-overlay">
                <div className="winning-num-3d-display">
                  {winNum}
                </div>
                <div className="waiting-game-text">Waiting for the game to start</div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Bottom Status & Control Bar ── */}
      <footer className="roulette-bottom-bar">
        {/* User Balance & Avatar */}
        <div className="roulette-user-profile">
          <div className="roulette-user-avatar-wrap">
            <div className="roulette-user-avatar-img" />
          </div>
          <div className="roulette-user-balance-pill">
            ₹{balance.toFixed(2)}
          </div>
        </div>

        {/* Status Metrics: TOTAL BET, COUNTDOWN / STATUS, MY BET */}
        <div className="roulette-status-panel">
          <div className="roulette-metric-total">
            <span className="metric-label">TOTAL BET:</span>
            <span className="metric-val">{serverState?.total_bet_pool_inr ? Math.round(serverState.total_bet_pool_inr) : 17020}</span>
          </div>

          <div className="roulette-countdown-pill">
            {serverState?.phase === 'BETTING' && (
              <span>Betting stop in...{serverState.seconds_left}s</span>
            )}
            {serverState?.phase === 'STOP_BETTING' && (
              <span>BETTING CLOSED</span>
            )}
            {serverState?.phase === 'SPINNING' && (
              <span>SPINNING... {String(serverState.seconds_left).padStart(2, '0')}s</span>
            )}
            {serverState?.phase === 'RESULT' && (
              <span>Winning Number: {serverState.winning_number}</span>
            )}
          </div>

          <div className="roulette-metric-mybet">
            <span className="metric-label">MY BET:</span>
            <span className="metric-val">{totalMyBet}</span>
          </div>
        </div>

        {/* Interactive Chips Selector */}
        <div className="roulette-chips-selector">
          {CHIPS.map((chip) => {
            const isSelected = selectedChip === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                className={`roulette-chip-btn ${chip.color} ${isSelected ? 'chip-selected-glow' : ''}`}
                onClick={() => {
                  soundManager.play('bet_coin');
                  setSelectedChip(chip.value);
                }}
              >
                <div className="chip-inner-circle">
                  <span className="chip-val-text">{chip.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Control Action Buttons */}
        <div className="roulette-controls-group">
          <button
            type="button"
            className="roulette-action-btn btn-clear"
            onClick={handleClearBets}
            disabled={serverState?.phase !== 'BETTING' || totalMyBet === 0}
          >
            <span className="btn-icon">✕</span>
            <span className="btn-text">CLEAR BET</span>
          </button>

          <button
            type="button"
            className="roulette-action-btn btn-undo"
            onClick={handleUndo}
            disabled={serverState?.phase !== 'BETTING' || betHistoryStack.length === 0}
          >
            <span className="btn-icon">↶</span>
            <span className="btn-text">UNDO</span>
          </button>

          <button
            type="button"
            className="roulette-action-btn btn-repeat"
            onClick={handleRepeatBet}
            disabled={serverState?.phase !== 'BETTING' || previousRoundBets.length === 0}
          >
            <span className="btn-icon">🔁</span>
            <span className="btn-text">REPEAT BET</span>
          </button>
        </div>

        {/* Lucky 3Patti Badge */}
        <div className="roulette-lucky-badge">
          <div className="lucky-badge-content">
            <span className="badge-sub">JACKPOT</span>
            <span className="badge-main">LUCKY 3PATTI</span>
          </div>
        </div>
      </footer>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="roulette-floating-toast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default RoulettePage;
