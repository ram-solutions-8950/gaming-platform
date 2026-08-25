import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { walletService } from '../../services/wallet';
import { soundManager } from '../../services/soundManager';
import '../../styles/roulette.css';

/* ── European Roulette Wheel Numbers Order ── */
const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

function getNumberColor(num: number): 'green' | 'red' | 'black' {
  if (num === 0) return 'green';
  return RED_NUMBERS.has(num) ? 'red' : 'black';
}

const CHIP_VALUES = [10, 50, 100, 500, 1000];

interface BetMap {
  [key: string]: number;
}

export function RoulettePage() {
  const navigate = useNavigate();

  /* ── State ── */
  const [balance, setBalance] = useState<number>(5000);
  const [selectedChip, setSelectedChip] = useState<number>(50);
  const [bets, setBets] = useState<BetMap>({});
  const [lastBets, setLastBets] = useState<BetMap>({});
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [winAmount, setWinAmount] = useState<number>(0);
  const [showWinModal, setShowWinModal] = useState<boolean>(false);
  const [history, setHistory] = useState<number[]>([17, 4, 22, 0, 35, 11, 8]);
  const [wheelRotation, setWheelRotation] = useState<number>(0);
  const [ballRotation, setBallRotation] = useState<number>(0);

  const totalBet = Object.values(bets).reduce((sum, val) => sum + val, 0);

  /* ── Fetch Real Wallet Balance on Mount ── */
  useEffect(() => {
    walletService.getWallet()
      .then((data) => {
        if (data && typeof data.balance === 'number') {
          // Convert from paise to rupees if >= 100
          const balInRupees = data.balance > 100 ? data.balance / 100 : data.balance;
          setBalance(Math.floor(balInRupees));
        }
      })
      .catch(() => {
        // Fallback to local default balance
      });
  }, []);

  /* ── Exit Button Handler ── */
  const handleExit = () => {
    navigate('/dashboard', { replace: true });
  };

  /* ── Add Bet on a Specific Target ── */
  const handlePlaceBet = (betKey: string) => {
    if (isSpinning) return;
    if (balance < selectedChip) return;

    soundManager.play('bet_coin');
    setBets((prev) => {
      const current = prev[betKey] || 0;
      return { ...prev, [betKey]: current + selectedChip };
    });
    setBalance((prev) => prev - selectedChip);
  };

  /* ── Clear Bets ── */
  const handleClearBets = () => {
    if (isSpinning || totalBet === 0) return;
    setBalance((prev) => prev + totalBet);
    setBets({});
  };

  /* ── Double Bets ── */
  const handleDoubleBets = () => {
    if (isSpinning || totalBet === 0) return;
    if (balance < totalBet) return;

    soundManager.play('bet_coin');
    setBets((prev) => {
      const doubled: BetMap = {};
      Object.entries(prev).forEach(([key, val]) => {
        doubled[key] = val * 2;
      });
      return doubled;
    });
    setBalance((prev) => prev - totalBet);
  };

  /* ── Repeat Last Bets ── */
  const handleRepeatBets = () => {
    if (isSpinning || Object.keys(lastBets).length === 0) return;
    const needed = Object.values(lastBets).reduce((s, v) => s + v, 0);
    if (balance < needed) return;

    soundManager.play('bet_coin');
    setBets(lastBets);
    setBalance((prev) => prev - needed);
  };

  /* ── Spin Action ── */
  const handleSpin = () => {
    if (isSpinning || totalBet === 0) return;

    setIsSpinning(true);
    setShowWinModal(false);
    setLastBets(bets);

    // Pick random winning number (0 - 36)
    const resultNum = Math.floor(Math.random() * 37);

    // Calculate angles
    const pocketIndex = WHEEL_NUMBERS.indexOf(resultNum);
    const sliceAngle = 360 / WHEEL_NUMBERS.length;
    const targetAngle = 360 - (pocketIndex * sliceAngle);

    // Spin wheel 4-5 full rotations plus target angle
    const extraSpins = 360 * 5;
    const finalWheelAngle = wheelRotation + extraSpins + targetAngle;
    const finalBallAngle = ballRotation - (360 * 6 + targetAngle);

    setWheelRotation(finalWheelAngle);
    setBallRotation(finalBallAngle);

    // Resolve outcome after 3.5s animation
    setTimeout(() => {
      setWinningNumber(resultNum);
      setIsSpinning(false);
      setHistory((prev) => [resultNum, ...prev.slice(0, 7)]);
      soundManager.play('reveal_tick');

      // Calculate Winnings
      let won = 0;
      const color = getNumberColor(resultNum);

      Object.entries(bets).forEach(([betKey, betVal]) => {
        // Straight number bet
        if (betKey === String(resultNum)) {
          won += betVal * 36;
        }
        // Red / Black
        if (betKey === 'red' && color === 'red') won += betVal * 2;
        if (betKey === 'black' && color === 'black') won += betVal * 2;
        // Even / Odd
        if (betKey === 'even' && resultNum > 0 && resultNum % 2 === 0) won += betVal * 2;
        if (betKey === 'odd' && resultNum > 0 && resultNum % 2 !== 0) won += betVal * 2;
        // 1-18 / 19-36
        if (betKey === '1-18' && resultNum >= 1 && resultNum <= 18) won += betVal * 2;
        if (betKey === '19-36' && resultNum >= 19 && resultNum <= 36) won += betVal * 2;
        // Dozens
        if (betKey === '1st12' && resultNum >= 1 && resultNum <= 12) won += betVal * 3;
        if (betKey === '2nd12' && resultNum >= 13 && resultNum <= 24) won += betVal * 3;
        if (betKey === '3rd12' && resultNum >= 25 && resultNum <= 36) won += betVal * 3;
        // Columns (1: 1,4,7..; 2: 2,5,8..; 3: 3,6,9..)
        if (betKey === 'col1' && resultNum > 0 && resultNum % 3 === 1) won += betVal * 3;
        if (betKey === 'col2' && resultNum > 0 && resultNum % 3 === 2) won += betVal * 3;
        if (betKey === 'col3' && resultNum > 0 && resultNum % 3 === 0) won += betVal * 3;
      });

      if (won > 0) {
        setWinAmount(won);
        setBalance((prev) => prev + won);
        setShowWinModal(true);
        soundManager.play('win_clap');
      } else {
        soundManager.play('loss');
      }
      setBets({});
    }, 3600);
  };

  /* ── 3 Rows for European Grid (Row 1: 3,6,9...36; Row 2: 2,5,8...35; Row 3: 1,4,7...34) ── */
  const rows = [
    [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
    [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
    [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
  ];

  return (
    <div className="roulette-game-page">
      {/* ── Top Header ── */}
      <header className="roulette-header">
        <div className="roulette-header__left">
          <button className="roulette-exit-btn" onClick={handleExit} title="Back to Dashboard">
            ← Exit
          </button>
          <div className="roulette-title-badge">
            <span>🎡 ROULETTE</span>
          </div>
        </div>

        <div className="roulette-history">
          <span className="roulette-history__label">HISTORY:</span>
          {history.map((num, i) => {
            const c = getNumberColor(num);
            return (
              <div key={i} className={`roulette-history-pill roulette-history-pill--${c}`}>
                {num}
              </div>
            );
          })}
        </div>

        <div className="roulette-header__right">
          <div className="roulette-balance-box">
            <span className="roulette-balance-box__icon">₹</span>
            <span className="roulette-balance-box__label">BALANCE:</span>
            <span className="roulette-balance-box__value">₹{balance.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* ── Main Arena ── */}
      <main className="roulette-arena">
        {/* Left Wheel Section */}
        <section className="roulette-wheel-section">
          <div className="roulette-wheel-wrapper">
            <div className="roulette-pointer" />
            
            {/* SVG Roulette Wheel */}
            <svg
              className="roulette-wheel-svg"
              viewBox="0 0 200 200"
              style={{ transform: `rotate(${wheelRotation}deg)` }}
            >
              <circle cx="100" cy="100" r="96" fill="#1e0933" stroke="#ffd700" strokeWidth="4" />
              {WHEEL_NUMBERS.map((num, i) => {
                const count = WHEEL_NUMBERS.length;
                const angle = (360 / count) * i;
                const rad1 = ((angle - 180 / count) * Math.PI) / 180;
                const rad2 = ((angle + 180 / count) * Math.PI) / 180;
                const x1 = 100 + 94 * Math.sin(rad1);
                const y1 = 100 - 94 * Math.cos(rad1);
                const x2 = 100 + 94 * Math.sin(rad2);
                const y2 = 100 - 94 * Math.cos(rad2);
                const color = num === 0 ? '#15803d' : RED_NUMBERS.has(num) ? '#b91c1c' : '#111827';

                return (
                  <g key={num}>
                    <path
                      d={`M 100 100 L ${x1} ${y1} A 94 94 0 0 1 ${x2} ${y2} Z`}
                      fill={color}
                      stroke="#ffd700"
                      strokeWidth="0.5"
                    />
                    <text
                      x="100"
                      y="20"
                      transform={`rotate(${angle}, 100, 100)`}
                      fill="#ffffff"
                      fontSize="6"
                      fontWeight="bold"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {num}
                    </text>
                  </g>
                );
              })}
              <circle cx="100" cy="100" r="54" fill="#2d124d" stroke="#ffd700" strokeWidth="2" />
            </svg>

            {/* Spinning Ball */}
            <div
              className="roulette-ball"
              style={{
                transform: `rotate(${ballRotation}deg) translate(0, -68px)`,
                opacity: isSpinning ? 1 : 0.85
              }}
            />

            {/* Center Gold Hub */}
            <div className="roulette-wheel-center-hub" />
          </div>

          {/* Last Result Badge */}
          {winningNumber !== null && (
            <div
              className={`roulette-current-result-badge roulette-current-result-badge--${getNumberColor(
                winningNumber
              )}`}
            >
              <span>RESULT: {winningNumber}</span>
              <span>({getNumberColor(winningNumber).toUpperCase()})</span>
            </div>
          )}
        </section>

        {/* Right Betting Table Section */}
        <section className="roulette-table-section">
          {/* Numbers Grid */}
          <div className="roulette-board-wrap">
            {/* Zero Cell */}
            <div className="roulette-zero-cell" onClick={() => handlePlaceBet('0')}>
              <span>0</span>
              {bets['0'] && <div className="roulette-chip-badge">{bets['0']}</div>}
            </div>

            {/* Numbers Grid (3x12) */}
            <div className="roulette-numbers-grid">
              {rows.map((row, rowIdx) => (
                <React.Fragment key={rowIdx}>
                  {row.map((num) => {
                    const color = getNumberColor(num);
                    const isWinner = winningNumber === num;
                    return (
                      <div
                        key={num}
                        className={`roulette-number-cell roulette-number-cell--${color} ${
                          isWinner ? 'roulette-number-cell--win' : ''
                        }`}
                        onClick={() => handlePlaceBet(String(num))}
                      >
                        {num}
                        {bets[String(num)] && (
                          <div className="roulette-chip-badge">{bets[String(num)]}</div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>

            {/* 2 to 1 Column Bets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div className="roulette-col-cell" onClick={() => handlePlaceBet('col3')}>
                2:1
                {bets['col3'] && <div className="roulette-chip-badge">{bets['col3']}</div>}
              </div>
              <div className="roulette-col-cell" onClick={() => handlePlaceBet('col2')}>
                2:1
                {bets['col2'] && <div className="roulette-chip-badge">{bets['col2']}</div>}
              </div>
              <div className="roulette-col-cell" onClick={() => handlePlaceBet('col1')}>
                2:1
                {bets['col1'] && <div className="roulette-chip-badge">{bets['col1']}</div>}
              </div>
            </div>
          </div>

          {/* Outside Bets */}
          <div className="roulette-outside-bets">
            {/* Dozens */}
            <div className="roulette-dozens-row">
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('1st12')}>
                1st 12
                {bets['1st12'] && <div className="roulette-chip-badge">{bets['1st12']}</div>}
              </div>
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('2nd12')}>
                2nd 12
                {bets['2nd12'] && <div className="roulette-chip-badge">{bets['2nd12']}</div>}
              </div>
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('3rd12')}>
                3rd 12
                {bets['3rd12'] && <div className="roulette-chip-badge">{bets['3rd12']}</div>}
              </div>
            </div>

            {/* 1:1 Evens/Odds/Red/Black */}
            <div className="roulette-evens-row">
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('1-18')}>
                1 - 18
                {bets['1-18'] && <div className="roulette-chip-badge">{bets['1-18']}</div>}
              </div>
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('even')}>
                EVEN
                {bets['even'] && <div className="roulette-chip-badge">{bets['even']}</div>}
              </div>
              <div
                className="roulette-outside-btn roulette-outside-btn--red"
                onClick={() => handlePlaceBet('red')}
              >
                RED
                {bets['red'] && <div className="roulette-chip-badge">{bets['red']}</div>}
              </div>
              <div
                className="roulette-outside-btn roulette-outside-btn--black"
                onClick={() => handlePlaceBet('black')}
              >
                BLACK
                {bets['black'] && <div className="roulette-chip-badge">{bets['black']}</div>}
              </div>
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('odd')}>
                ODD
                {bets['odd'] && <div className="roulette-chip-badge">{bets['odd']}</div>}
              </div>
              <div className="roulette-outside-btn" onClick={() => handlePlaceBet('19-36')}>
                19 - 36
                {bets['19-36'] && <div className="roulette-chip-badge">{bets['19-36']}</div>}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Bottom Controls Bar ── */}
      <footer className="roulette-bottom-controls">
        {/* Chip Selection */}
        <div className="roulette-chips-row">
          {CHIP_VALUES.map((val) => (
            <button
              key={val}
              className={`roulette-chip-btn roulette-chip-btn--${val} ${
                selectedChip === val ? 'roulette-chip-btn--active' : ''
              }`}
              onClick={() => setSelectedChip(val)}
              disabled={isSpinning}
            >
              ₹{val >= 1000 ? `${val / 1000}k` : val}
            </button>
          ))}
        </div>

        {/* Action Controls */}
        <div className="roulette-actions-row">
          <div className="roulette-bet-summary">
            <span className="roulette-bet-summary__label">TOTAL BET</span>
            <span className="roulette-bet-summary__val">₹{totalBet.toLocaleString()}</span>
          </div>

          <button
            className="roulette-action-btn roulette-action-btn--clear"
            onClick={handleClearBets}
            disabled={isSpinning || totalBet === 0}
          >
            CLEAR
          </button>

          <button
            className="roulette-action-btn roulette-action-btn--double"
            onClick={handleDoubleBets}
            disabled={isSpinning || totalBet === 0 || balance < totalBet}
          >
            2X DOUBLE
          </button>

          {Object.keys(lastBets).length > 0 && totalBet === 0 && (
            <button
              className="roulette-action-btn roulette-action-btn--double"
              onClick={handleRepeatBets}
              disabled={isSpinning}
            >
              REPEAT
            </button>
          )}

          <button
            className="roulette-action-btn roulette-action-btn--spin"
            onClick={handleSpin}
            disabled={isSpinning || totalBet === 0}
          >
            {isSpinning ? 'SPINNING...' : 'SPIN'}
          </button>
        </div>
      </footer>

      {/* ── Win Popup Modal ── */}
      {showWinModal && (
        <div className="roulette-win-modal" onClick={() => setShowWinModal(false)}>
          <div className="roulette-win-modal__title">🎉 YOU WON! 🎉</div>
          <div
            className="roulette-win-modal__num"
            style={{ color: winningNumber !== null && RED_NUMBERS.has(winningNumber) ? '#ef4444' : '#22c55e' }}
          >
            Number: {winningNumber}
          </div>
          <div className="roulette-win-modal__amount">+₹{winAmount.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
