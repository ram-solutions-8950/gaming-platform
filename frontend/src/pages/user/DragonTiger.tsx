import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gameService } from '../../services/game';
import { walletService } from '../../services/wallet';
import { Loader } from '../../components/common/Loader';
import type { CatalogGame, GameBet, GameRound, GameState, Wallet, PublicBet } from '../../types';
import { DragonTigerArena, type ArenaPhase } from '../../components/dragonTiger/DragonTigerArena';
import useAudio from '../../hooks/useAudio';
import { ChipLayer } from '../../components/dragonTiger/ChipLayer';
import { getWebSocketUrl } from '../../utils/ws';

import bgImg from '../../assets/dragon-tiger-bg.webp';
import dragonImg from '../../assets/dragon-3d.webp';
import tigerImg from '../../assets/tiger-3d.webp';

const SLUG = 'dragon-tiger';

function paiseToRupees(p: number): string {
  return (p / 100).toFixed(2);
}

export function DragonTigerPage() {
  const navigate = useNavigate();
  /* ── core data ── */
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<GameRound[]>([]);
  const [myBets, setMyBets] = useState<GameBet[]>([]);
  const [catalogGame, setCatalogGame] = useState<CatalogGame | null>(null);
  const [publicBets, setPublicBets] = useState<PublicBet[]>([]);
  const [recentLiveBets, setRecentLiveBets] = useState<PublicBet[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState(1000);
  const [loading, setLoading] = useState(true);
  const [betting, setBetting] = useState(false);
  const [isBettingLocked, setIsBettingLocked] = useState(false);
  const [countdown, setCountdown] = useState(15);

  // Initialize audio hook
  const audio = useAudio();

  // Unlock AudioContext & start background music on interaction / mount
  useEffect(() => {
    // Start background music and unlock audio immediately
    audio.unlock();
    audio.playTheme();

    const unlock = () => {
      audio.unlock();
      audio.playTheme();
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);

      // Attempt to lock native screen orientation to landscape
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (e) {
        /* ignore */
      }
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      // Unlock orientation on unmount without stopping global background music
      try {
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (e) {
        /* ignore */
      }
    };
  }, []);

  /* ── animation state ── */
  const [phase, setPhase] = useState<ArenaPhase>('waiting');
  const [dragonFlipped, setDragonFlipped] = useState(false);
  const [tigerFlipped, setTigerFlipped] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  // Keep myBets ref synchronized for animation callbacks
  const myBetsRef = useRef(myBets);
  useEffect(() => {
    myBetsRef.current = myBets;
  }, [myBets]);

  /**
   * displayRound holds the completed round whose result is currently being
   * animated. While this is set, all card data & result come from it — even
   * if the backend already created a new BETTING round.
   */
  const [displayRound, setDisplayRound] = useState<GameRound | null>(null);
  const [lastAnimatedRoundId, setLastAnimatedRoundId] = useState<string | null>(null);
  /** Ref tracks whether an animation sequence is in progress so we never
   *  start a second one or let polling/ws clobber state mid-animation. */
  const animatingRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultSoundPlayedRef = useRef<string | null>(null);

  const game = gameState?.game || catalogGame;
  const cfg = game?.config || {};
  const payouts = cfg.payouts || { dragon: 1, tiger: 1, tie: 11 };
  const allowed = cfg.allowed_bets || { dragon: true, tiger: true, tie: true };

  /* ── data fetching ── */
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
      if (gs?.public_bets) {
        setPublicBets(gs.public_bets);
      }
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

  /* ── countdown timer ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.round?.id, gameState?.round?.status]);

  const prevCountdown = useRef<number>(-1);
  // Play countdown tick sound for values 5-1 only during active betting (never during result/reveal)
  useEffect(() => {
    if (
      !displayRound &&
      !animatingRef.current &&
      phase === 'waiting' &&
      gameState?.round?.status === 'BETTING' &&
      !isBettingLocked &&
      countdown !== prevCountdown.current &&
      countdown >= 1 &&
      countdown <= 5
    ) {
      audio.play('countdown_tick');
    }
    prevCountdown.current = countdown;
  }, [countdown, gameState?.round?.status, isBettingLocked, displayRound, phase]);

  /* ── WebSocket (with robust URL resolution for Android APK WebView & auto-reconnect) ── */
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isUnmounted = false;

    const connect = () => {
      if (isUnmounted) return;
      try {
        const wsUrl = getWebSocketUrl('ws/games');
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.game_slug && data.game_slug !== SLUG) return;
            if (data.type === 'round_start') {
              setIsBettingLocked(false);
              setPublicBets([]);
              setRecentLiveBets([]);
            }
            if (data.type === 'betting_locked') {
              setIsBettingLocked(true);
            }
            if (data.type === 'new_bet' && data.bet) {
              const newBet: PublicBet = data.bet;
              setPublicBets((prev) => {
                if (prev.some((b) => b.id === newBet.id)) return prev;
                return [...prev, newBet];
              });
              setRecentLiveBets((prev) => [newBet, ...prev.slice(0, 4)]);
            }
            if (data.type === 'round_result' && data.result_data) {
              const rd = data.result_data;
              if (rd.dragon_card && rd.tiger_card && !animatingRef.current) {
                const syntheticRound: GameRound = {
                  id: data.round_id,
                  game_id: data.game_id,
                  status: 'COMPLETED',
                  result_data: rd,
                } as GameRound;
                setLastAnimatedRoundId(data.round_id);
                setDisplayRound(syntheticRound);
              }
            }
            if (data.type === 'round_start' || data.type === 'betting_locked' || data.type === 'round_result') {
              if (data.seconds_remaining != null) setCountdown(Math.max(0, Math.round(data.seconds_remaining)));
              fetchAll();
            }
          } catch {
            /* ignore */
          }
        };

        ws.onerror = () => {
          /* ignore and reconnect */
        };

        ws.onclose = () => {
          if (!isUnmounted) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };
      } catch {
        if (!isUnmounted) {
          reconnectTimeout = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [fetchAll]);

  /* ── derived state ── */
  const round = gameState?.round;
  const isBetting = round?.status === 'BETTING' && !isBettingLocked && countdown > 0;
  const isCalculating = round?.status === 'CALCULATING';
  // Strict Event Synchronization: Betting Start & Betting Stop
  const lastRoundStartRoundId = useRef<string | null>(null);
  const lastBettingStopRoundId = useRef<string | null>(null);

  useEffect(() => {
    // CRITICAL: Never trigger betting start or betting stop while a round result is actively displaying/animating!
    if (displayRound || animatingRef.current || phase !== 'waiting') {
      return;
    }

    if (!round?.id) return;

    // 1. Betting Start: ONLY when current visual state is genuinely BETTING,
    // betting is open, countdown > 0, and this new round has not yet played betting_start.
    if (round.status === 'BETTING' && !isBettingLocked && countdown > 0) {
      if (lastRoundStartRoundId.current !== round.id) {
        audio.playRoundStart();
        lastRoundStartRoundId.current = round.id;
      }
    }
    // 2. Betting Stop: When betting locks or countdown expires for this active betting round.
    else if (
      (isBettingLocked || countdown <= 0 || round.status === 'CALCULATING') &&
      lastRoundStartRoundId.current === round.id &&
      lastBettingStopRoundId.current !== round.id
    ) {
      audio.play('betting_stop');
      lastBettingStopRoundId.current = round.id;
    }
  }, [
    round?.id,
    round?.status,
    isBettingLocked,
    countdown,
    displayRound,
    phase,
  ]);

  // Stop betting overlay flag — shown when betting locks or timer reaches 0 during BETTING status
  const showStopBettingOverlay = round?.status === 'BETTING' && (isBettingLocked || countdown <= 0);
  // Calculating overlay flag (when in CALCULATING phase without result data yet)
  const showCalculatingOverlay = isCalculating && !(round?.result_data?.result);

  // The round we use for display: the frozen completed round during animation,
  // otherwise the live round.
  const activeRound = displayRound || round;
  const dragonCard = (activeRound?.result_data?.dragon_card as string) || undefined;
  const tigerCard = (activeRound?.result_data?.tiger_card as string) || undefined;

  /* ── fallback: capture completed round from polling or history if WS missed it ── */
  useEffect(() => {
    if (animatingRef.current || displayRound) return;

    // 1. Direct from round result
    const rd = round?.result_data;
    const hasCards = Boolean(rd?.dragon_card && rd?.tiger_card);
    if (hasCards && round?.id !== lastAnimatedRoundId) {
      setDisplayRound(round!);
      setLastAnimatedRoundId(round!.id);
      return;
    }

    // 2. From latest history item
    const latestHistory = history[0];
    const hRd = latestHistory?.result_data;
    const hasHistoryCards = Boolean(hRd?.dragon_card && hRd?.tiger_card);
    if (hasHistoryCards && latestHistory?.id !== lastAnimatedRoundId) {
      setDisplayRound(latestHistory);
      setLastAnimatedRoundId(latestHistory.id);
    }
  }, [round, history, displayRound, lastAnimatedRoundId]);

  useEffect(() => {
    if (!displayRound) {
      // No round to animate — ensure idle state
      if (!animatingRef.current) {
        setPhase('waiting');
        setDragonFlipped(false);
        setTigerFlipped(false);
        setShowPlayer(false);
      }
      return;
    }

    // Prevent re-entry
    if (animatingRef.current) return;
    animatingRef.current = true;

    const rd = displayRound.result_data;
    const resVal = rd?.result as string | undefined;

    let cancelled = false;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const run = async () => {
      // 1. Cards deal in
      setPhase('revealing');
      setDragonFlipped(false);
      setTigerFlipped(false);
      setShowPlayer(false);

      // Dragon card slide + flip (faster reveal: 200ms lead-in)
      await delay(200);
      if (cancelled) return;
      setDragonFlipped(true);
      audio.playFlip();

      // Tiger card slide + flip (faster reveal: 450ms deal & flip)
      await delay(450);
      if (cancelled) return;
      setTigerFlipped(true);
      audio.playFlip();

      // Both cards visible — brief pause before result display (450ms)
      await delay(450);
      if (cancelled) return;

      if (resVal === 'DRAGON') {
        setPhase('dragon-winning');
        audio.play('dragon_wins');
      } else if (resVal === 'TIGER') {
        setPhase('tiger-winning');
        audio.play('tiger_wins');
      } else if (resVal === 'TIE') {
        setPhase('tie-result');
      }

      // Winner animation plays, then show player outcome banner & win/loss sound
      await delay(600);
      if (cancelled) return;
      setShowPlayer(true);

      const roundId = displayRound.id;
      if (resultSoundPlayedRef.current !== roundId) {
        const userBets = myBetsRef.current.filter((b) => b.round_id === roundId);
        const isUserWin = userBets.some((b) => b.status === 'WON');
        const isUserLoss = userBets.some((b) => b.status === 'LOST') && !isUserWin;
        if (isUserWin) {
          audio.playWin();
          resultSoundPlayedRef.current = roundId;
        } else if (isUserLoss) {
          audio.playLoss();
          resultSoundPlayedRef.current = roundId;
        }
      }

      // Hold everything on screen for 2.2 seconds (reduced from 4.0s)
      await delay(2200);
      if (cancelled) return;

      // Clear — next round takes over
      animatingRef.current = false;
      setDisplayRound(null);
      setPhase('waiting');
      setDragonFlipped(false);
      setTigerFlipped(false);
      setShowPlayer(false);
    };

    run();
    return () => {
      cancelled = true;
      animatingRef.current = false;
    };
  }, [displayRound]);

  /* ── bet matching ── */
  const displayRoundId = displayRound?.id || round?.id;
  const roundBets = useMemo(
    () => myBets.filter((b) => displayRoundId && b.round_id === displayRoundId),
    [myBets, displayRoundId],
  );
  const wonThisRound = roundBets.some((b) => b.status === 'WON');
  const lostThisRound = roundBets.some((b) => b.status === 'LOST') && !wonThisRound;

  /* ── place bet ── */
  const handleBet = async (predictionKey?: string) => {
    const prediction = predictionKey || selected;
    if (!prediction || !round || !game || betting) return;
    if (round.status !== 'BETTING' || isBettingLocked || countdown <= 0) return;
    setBetting(true);
    try {
      await gameService.placeBet(round.id, prediction, amount, game.id);
      setSelected(prediction);
      console.log(`Bet placed: ₹${paiseToRupees(amount)} on ${prediction}`);
    audio.playChip();
      await fetchAll();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      console.error(axiosErr?.response?.data?.error?.message || 'Failed to place bet');
    } finally {
      setBetting(false);
    }
  };

  /* ── public bets memoized aggregations ── */
  const dragonPublicBets = useMemo(() => publicBets.filter((b) => b.prediction === 'DRAGON'), [publicBets]);
  const tigerPublicBets = useMemo(() => publicBets.filter((b) => b.prediction === 'TIGER'), [publicBets]);
  const tiePublicBets = useMemo(() => publicBets.filter((b) => b.prediction === 'TIE'), [publicBets]);

  const dragonPublicTotal = useMemo(() => dragonPublicBets.reduce((sum, b) => sum + b.amount, 0), [dragonPublicBets]);
  const tigerPublicTotal = useMemo(() => tigerPublicBets.reduce((sum, b) => sum + b.amount, 0), [tigerPublicBets]);
  const tiePublicTotal = useMemo(() => tiePublicBets.reduce((sum, b) => sum + b.amount, 0), [tiePublicBets]);

  const totalPublicBettors = publicBets.length;
  const totalPublicVolume = useMemo(() => publicBets.reduce((sum, b) => sum + b.amount, 0), [publicBets]);

  /* ── DRAGON | TIE | TIGER order (matches reference) ── */
  const options = [
    { key: 'DRAGON', enabled: allowed.dragon !== false, payout: payouts.dragon },
    { key: 'TIE', enabled: allowed.tie !== false, payout: payouts.tie },
    { key: 'TIGER', enabled: allowed.tiger !== false, payout: payouts.tiger },
  ];

  /* ── countdown status label & styling ── */
  const isAnimating = Boolean(displayRound);
  const countdownLabel = isAnimating
    ? 'Revealing'
    : isBetting
      ? 'Bet Time'
      : isCalculating ? 'Drawing' : 'Waiting';

  const countdownColor = isAnimating
    ? 'text-yellow-300'
    : isBetting
      ? countdown <= 3
        ? 'text-red-400 animate-pulse'
        : countdown <= 7 ? 'text-orange-400' : 'text-green-400'
      : isCalculating ? 'text-yellow-300' : 'text-zinc-500';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0d0820]">
        <Loader size="lg" />
      </div>
    );
  }

  return (
    <div className="dragon-tiger-game fixed inset-0 w-full overflow-hidden select-none font-sans text-white z-50"
         style={{ width: '100%', height: '100dvh', minHeight: '100dvh', maxWidth: 'none', margin: 0, padding: 0 }}>

      {/* Layer 0: Fullscreen background image */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center" style={{ backgroundImage: `url(${bgImg})` }} />

      {/* Layer 1: Dark translucent overlay for readability (lets artwork show through) */}
      <div className="absolute inset-0 z-[1] bg-black/50 pointer-events-none" />

      {/* Layer 2: All game content */}
      <div
        className="relative z-[2] w-full h-full flex flex-col justify-between overflow-hidden"
        style={{
           paddingTop: 'env(safe-area-inset-top, 0px)',
           paddingBottom: 'env(safe-area-inset-bottom, 0px)',
           paddingLeft: 'env(safe-area-inset-left, 0px)',
           paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >

        {/* ═══════════ TOP: HUD + ARENA (cards + artwork) ═══════════ */}
        <div className="relative shrink-0 w-full flex-none" style={{ height: 'clamp(110px, 42dvh, 300px)' }}>

          {/* HUD top-left: Back + Ranking */}
          <div className="absolute top-1.5 left-2 z-30 flex items-center gap-1.5">
            <button onClick={() => navigate('/dashboard')} className="px-3 py-1 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-xs font-bold text-white transition-colors flex items-center gap-1 shadow-md">← Exit</button>
            <div className="flex items-center gap-1 bg-black/50 pl-1 pr-2.5 py-1 rounded-full border border-yellow-500/40">
              <span className="text-yellow-400 text-base">🏆</span>
              <span className="text-[9px] text-yellow-300 font-bold tracking-wider">Ranking</span>
            </div>
          </div>

          {/* HUD top-center: Live Public Bets Indicator */}
          <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full border border-yellow-500/40 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="text-[10px] sm:text-xs font-bold text-white/90">
              {totalPublicBettors} {totalPublicBettors === 1 ? 'Player' : 'Players'}
            </span>
            <span className="text-zinc-500 text-[10px]">|</span>
            <span className="text-[10px] sm:text-xs font-extrabold text-yellow-400">
              ₹{paiseToRupees(totalPublicVolume)}
            </span>
          </div>

          {/* HUD top-center sub-ticker: Live incoming bet notification */}
          {recentLiveBets.length > 0 && isBetting && (
            <div className="absolute top-9 sm:top-10 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-3 py-0.5 rounded-full border border-yellow-500/40 shadow-[0_0_12px_rgba(234,179,8,0.3)] animate-pulse">
              <span className="text-[9px] sm:text-[10px] text-zinc-300 font-medium">
                ⚡ Live: <strong className="text-white font-bold">₹{paiseToRupees(recentLiveBets[0].amount)}</strong> on{' '}
                <strong className={
                  recentLiveBets[0].prediction === 'DRAGON' ? 'text-blue-400' :
                  recentLiveBets[0].prediction === 'TIGER' ? 'text-orange-400' : 'text-emerald-400'
                }>
                  {recentLiveBets[0].prediction === 'DRAGON' ? '🐉 DRAGON' : recentLiveBets[0].prediction === 'TIGER' ? '🐅 TIGER' : '🗿 TIE'}
                </strong>
              </span>
            </div>
          )}

          {/* HUD top-right: Wallet + ADD */}
          <div className="absolute top-1.5 right-2 z-30 flex items-center gap-1.5">
            <div className="bg-black/60 rounded-full px-3 py-1 border border-yellow-500/30">
                <span className="text-yellow-400 font-bold text-xs">₹{wallet?.balance_inr ?? '0.00'}</span>
              </div>
              <button className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-yellow-600 px-2.5 py-1.5 rounded-full text-black font-black text-[10px] shadow-lg border border-yellow-200">
                ADD <span className="text-sm">₹</span>
              </button>
              <button
                onClick={audio.toggleMute}
                className="ml-2 w-8 h-8 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-sm hover:bg-black/70 transition-colors"
                title={audio.muted ? "Unmute" : "Mute"}
              >
                {audio.muted ? "🔈" : "🔊"}
              </button>
          </div>

          {/* Large Dragon Artwork (left background) */}
          <div className="absolute left-[-3%] top-[-8%] bottom-[-15%] w-[55%] flex items-center justify-start pointer-events-none z-[2]" style={{ perspective: '800px' }}>
            <div
              className={`relative transition-all duration-700 ease-out origin-left ${phase === 'dragon-winning' ? 'dragon-attack-anim' : 'animate-[float-slow_6s_ease-in-out_infinite]'}`}
              style={{
                width: 'clamp(280px, 72dvw, 680px)',
                height: 'clamp(220px, 82dvh, 580px)',
                transform: phase === 'dragon-winning'
                  ? undefined
                  : phase === 'tiger-winning'
                  ? 'scale(0.9) translateX(-2%) translateY(6%)'
                  : phase === 'tie-result'
                  ? 'scale(1.02) translateX(4%) translateY(6%)'
                  : 'translateX(4%) translateY(6%)',
                filter: phase === 'dragon-winning'
                  ? 'drop-shadow(0 0 60px rgba(255,80,0,1)) brightness(1.3)'
                  : phase === 'tie-result'
                  ? 'drop-shadow(0 4px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 35px rgba(255,80,0,0.6)) brightness(1.1)'
                  : 'drop-shadow(0 4px 20px rgba(0,0,0,0.9)) drop-shadow(0 0 25px rgba(255,80,20,0.45)) contrast(1.1) brightness(1.02)',
                opacity: phase === 'tiger-winning' ? 0.45 : 1.0,
              }}
            >
              {/* Dragon <img> — foreground, no fire baked in */}
              <img
                src={dragonImg}
                alt="Dragon"
                draggable={false}
                className="w-full h-full object-contain object-left select-none"
              />

              {/* === FIRE BREATH — only during DRAGON WIN === */}
              {phase === 'dragon-winning' && (
                <div className="dragon-fire-container">
                  {/* Main fire stream from mouth going right */}
                  <div className="fire-breath-stream" />
                  {/* Glow behind fire */}
                  <div className="fire-breath-glow" />
                  {/* Sparks / embers */}
                  <div className="fire-ember ember-1" />
                  <div className="fire-ember ember-2" />
                  <div className="fire-ember ember-3" />
                  <div className="fire-ember ember-4" />
                  <div className="fire-ember ember-5" />
                </div>
              )}
            </div>
          </div>

          {/* Large Tiger Artwork (right foreground <img>) */}
          <div className="absolute right-[-3%] top-[-8%] bottom-[-15%] w-[55%] flex items-center justify-end pointer-events-none z-[2]" style={{ perspective: '800px' }}>
            <div
              className={`relative transition-all duration-700 ease-out origin-right ${phase === 'tiger-winning' ? 'tiger-attack-anim' : 'animate-[float-slow_6s_ease-in-out_infinite_reverse]'}`}
              style={{
                width: 'clamp(280px, 72dvw, 680px)',
                height: 'clamp(220px, 82dvh, 580px)',
                transform: phase === 'tiger-winning'
                  ? undefined
                  : phase === 'dragon-winning'
                  ? 'scale(0.9) translateX(2%) translateY(6%)'
                  : phase === 'tie-result'
                  ? 'scale(1.02) translateX(-4%) translateY(6%)'
                  : 'translateX(-4%) translateY(6%)',
                filter: phase === 'tiger-winning'
                  ? 'drop-shadow(0 0 60px rgba(255,160,30,1)) brightness(1.3)'
                  : phase === 'tie-result'
                  ? 'drop-shadow(0 4px 20px rgba(0,0,0,0.85)) drop-shadow(0 0 35px rgba(255,180,40,0.6)) brightness(1.1)'
                  : 'drop-shadow(0 4px 20px rgba(0,0,0,0.9)) drop-shadow(0 0 25px rgba(255,160,30,0.45)) contrast(1.1) brightness(1.02)',
                opacity: phase === 'dragon-winning' ? 0.45 : 1.0,
              }}
            >
              {/* Tiger <img> — foreground, facing LEFT toward VS */}
              <img
                src={tigerImg}
                alt="Tiger"
                draggable={false}
                className="w-full h-full object-contain object-right select-none"
              />

              {/* === TIGER ENERGY / FIRE BREATH — only during TIGER WIN === */}
              {phase === 'tiger-winning' && (
                <div className="tiger-fire-container">
                  {/* Main fire stream from mouth going left */}
                  <div className="tiger-fire-stream" />
                  {/* Glow behind fire */}
                  <div className="tiger-fire-glow" />
                  {/* Sparks / embers */}
                  <div className="tiger-ember ember-t1" />
                  <div className="tiger-ember ember-t2" />
                  <div className="tiger-ember ember-t3" />
                  <div className="tiger-ember ember-t4" />
                  <div className="tiger-ember ember-t5" />
                </div>
              )}
            </div>
          </div>

          {/* Cards & Center VS (horizontally aligned in DragonTigerArena) */}
          <div className="absolute inset-0 flex items-center justify-center z-10 -translate-y-[12%] sm:-translate-y-[14%]">
            <DragonTigerArena
              phase={phase}
              dragonCard={dragonCard}
              tigerCard={tigerCard}
              dragonFlipped={dragonFlipped}
              tigerFlipped={tigerFlipped}
              showPlayer={showPlayer && (wonThisRound || lostThisRound)}
              playerWon={wonThisRound ? true : lostThisRound ? false : null}
              playerAmountLabel={wonThisRound ? `+₹${paiseToRupees(roundBets.reduce((sum, b) => sum + (b.net_win_amount || 0), 0))}` : undefined}
            />
          </div>

          {/* Countdown Timer (below cards, center) */}
          <div className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center" style={{ bottom: '-2px' }}>
            <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-lg border-2 flex items-center justify-center font-black text-base sm:text-lg shadow-lg ${
              isAnimating ? 'border-yellow-400 bg-yellow-900/80'
              : countdown <= 5 ? 'border-red-500 bg-red-900/80'
              : 'border-green-500 bg-green-900/80'
            }`}>
              <span className={countdownColor}>{isAnimating ? '✨' : Math.floor(countdown)}</span>
            </div>
            <span className="text-[7px] sm:text-[8px] font-bold text-yellow-400 mt-0.5 uppercase tracking-wider bg-black/60 px-2 py-0.5 rounded-full">
              {countdownLabel}
            </span>
          </div>
        </div>

        {/* ═══════════ HISTORY STRIP ═══════════ */}
        <div className="shrink-0 flex justify-center px-4 py-0.5 sm:py-1 z-20 flex-none -mt-1 sm:-mt-2 mb-0.5" style={{ height: 'clamp(28px, 6.2dvh, 48px)' }}>
          <div className="flex gap-1.5 sm:gap-2 items-center bg-black/75 px-3.5 sm:px-5 py-1 rounded-full border border-yellow-500/20 overflow-x-auto max-w-[92%] scrollbar-hide h-full shadow-[0_4px_16px_rgba(0,0,0,0.6)] backdrop-blur-md">
            {history.map((r, idx) => {
              const res = r.result_data?.result as string | undefined;
              const isLatest = idx === 0;
              const bg = res === 'DRAGON'
                ? 'bg-gradient-to-br from-blue-500 to-blue-700'
                : res === 'TIGER'
                ? 'bg-gradient-to-br from-orange-400 to-amber-600'
                : 'bg-gradient-to-br from-emerald-400 to-green-600';
              const txt = res === 'DRAGON' ? 'D' : res === 'TIGER' ? 'T' : 'T';

              if (isLatest) {
                return (
                  <div
                    key={r.id}
                    title="Latest Result"
                    className={`relative shrink-0 w-[clamp(24px,5.2dvh,34px)] h-[clamp(24px,5.2dvh,34px)] rounded-full ${bg} flex items-center justify-center text-[10px] sm:text-xs font-black text-white border-2 border-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.95),0_0_5px_rgba(250,204,21,0.7)] ring-2 ring-yellow-400/80 ring-offset-1 ring-offset-black`}
                  >
                    {txt}
                  </div>
                );
              }

              return (
                <div
                  key={r.id}
                  className={`shrink-0 w-[clamp(18px,4dvh,26px)] h-[clamp(18px,4dvh,26px)] rounded-full ${bg} flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-white/85 border border-white/25 shadow-sm opacity-80 hover:opacity-100 transition-opacity`}
                >
                  {txt}
                </div>
              );
            })}
            <div className="shrink-0 w-[clamp(18px,4dvh,26px)] h-[clamp(18px,4dvh,26px)] rounded-full bg-zinc-700/80 flex items-center justify-center border border-white/20 text-white/80 opacity-75">
              <span className="text-[9px] sm:text-[11px]">📈</span>
            </div>
          </div>
        </div>

        {/* ═══════════ CENTER: BETTING TABLE ═══════════ */}
        <div id="betting-controls" className="betting-table shrink-0 w-full mx-auto px-[2%] sm:px-[5%] relative z-20 flex-1 min-h-[90px]" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'clamp(4px, 1vw, 8px)' }}>



          {options.map((opt) => {
            const isDragon = opt.key === 'DRAGON';
            const isTiger = opt.key === 'TIGER';

            const zoneBg = isDragon
              ? 'from-[#3a4fa0]/75 to-[#2a3570]/75 border-[#6888cc]'
              : isTiger
              ? 'from-[#c47020]/75 to-[#8a4e10]/75 border-[#f0a840]'
              : 'from-[#2d8a4e]/75 to-[#1a5a30]/75 border-[#50d080]';

            const zonePublicBets = isDragon ? dragonPublicBets : isTiger ? tigerPublicBets : tiePublicBets;
            const zonePublicTotal = isDragon ? dragonPublicTotal : isTiger ? tigerPublicTotal : tiePublicTotal;

            const zoneBets = roundBets.filter(b => b.prediction === opt.key);
            const zoneTotal = zoneBets.reduce((sum, b) => sum + b.amount, 0);

            const isSelected = selected === opt.key;

            return (
              <button
                key={opt.key}
                data-zone={opt.key}
                disabled={!isBetting || betting || !opt.enabled}
                onClick={() => handleBet(opt.key)}
                className={`relative w-full h-full flex flex-col items-center justify-between rounded-xl border-[2px] sm:border-[3px] overflow-hidden transition-all duration-200 bg-gradient-to-b ${zoneBg} ${
                  !isBetting || !opt.enabled ? 'opacity-50 cursor-not-allowed saturate-50' : 'hover:brightness-110 active:scale-[0.98] cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]'
                } ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] scale-[1.02] z-20' : 'border-transparent'}`}
              >
                {/* Header: Public live count/total + User bet badge */}
                <div className="w-full flex items-center justify-between px-2 pt-1.5 z-10">
                  <div className="bg-black/50 px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold text-white/90 border border-white/10 flex items-center gap-1 shadow-sm">
                    <span className="text-yellow-400">👥</span>
                    <span>{zonePublicBets.length}</span>
                    <span className="text-zinc-500 font-normal">|</span>
                    <span className="text-emerald-400 font-extrabold">₹{paiseToRupees(zonePublicTotal)}</span>
                  </div>
                  {zoneTotal > 0 && (
                    <div className="bg-yellow-500/25 border border-yellow-400/60 px-1.5 py-0.5 rounded text-[9px] font-black text-yellow-300 shadow-sm animate-pulse flex items-center gap-0.5">
                      <span>You:</span>
                      <span>₹{paiseToRupees(zoneTotal)}</span>
                    </div>
                  )}
                </div>

                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.12] pointer-events-none overflow-hidden">
                  <span className="text-[clamp(40px,25dvh,120px)] leading-none">{isDragon ? '🐉' : isTiger ? '🐅' : '🗿'}</span>
                </div>

                {/* Chip target area */}
                <div className="flex-1 w-full z-10 pointer-events-none" />

                {/* Bottom: name + multiplier */}
                <div className="flex flex-col items-center pb-2 z-10">
                  <span className="text-sm sm:text-lg font-black tracking-[0.15em] uppercase text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{opt.key}</span>
                  <span className="text-base sm:text-xl font-black text-yellow-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] leading-none">{opt.payout}X</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ═══════════ BOTTOM BAR: User + Chips + Rebet ═══════════ */}
        <div className="shrink-0 flex items-center justify-between gap-1 sm:gap-2 px-1 sm:px-2 pb-1 sm:pb-2 pt-1 z-20 flex-none" style={{ height: 'clamp(46px, 15dvh, 80px)' }}>

          {/* User avatar */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-black/60 rounded-full border border-white/10 p-1 pr-2 sm:pr-3 shrink-0 h-full max-h-[44px] sm:max-h-[48px]">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-zinc-700 rounded-full border-2 border-yellow-500 flex items-center justify-center text-sm shadow-inner">👤</div>
            <div className="flex flex-col min-w-0">
              <p className="text-[8px] text-zinc-400 leading-none truncate">You</p>
              <p className="text-[10px] sm:text-xs font-bold text-yellow-400 leading-tight truncate">
                ₹{paiseToRupees(roundBets.reduce((acc, b) => acc + b.amount, 0))}
              </p>
            </div>
          </div>

          {/* Chip Selector */}
          <div className="flex-1 flex justify-center items-center gap-1.5 sm:gap-2.5 h-full overflow-x-auto scrollbar-hide">
            {[1000, 5000, 10000, 50000, 100000, 200000].map((p) => {
              const isChipSelected = amount === p;
              const chipColor =
                p === 1000 ? 'from-gray-400 to-gray-600' :
                p === 5000 ? 'from-green-500 to-green-700' :
                p === 10000 ? 'from-blue-500 to-blue-700' :
                p === 50000 ? 'from-purple-500 to-purple-700' :
                p === 100000 ? 'from-orange-500 to-orange-700' :
                'from-red-600 to-red-800';

              return (
                <button
                  key={p}
                  data-amount={p}
                  onClick={() => setAmount(p)}
                  className={`relative shrink-0 rounded-full flex items-center justify-center font-black transition-all duration-200 border-[2px] sm:border-[3px] shadow-[inset_0_3px_3px_rgba(255,255,255,0.3),inset_0_-3px_3px_rgba(0,0,0,0.5),0_3px_6px_rgba(0,0,0,0.5)] bg-gradient-to-br ${chipColor} ${
                    isChipSelected
                      ? 'w-[clamp(36px,9dvh,52px)] h-[clamp(36px,9dvh,52px)] text-white border-yellow-300 shadow-[0_0_14px_rgba(250,204,21,0.8)] -translate-y-1 z-10'
                      : 'w-[clamp(28px,7.5dvh,44px)] h-[clamp(28px,7.5dvh,44px)] text-white/90 border-white/25 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="absolute inset-[2px] sm:inset-[3px] rounded-full border-[1.5px] border-dashed border-white/35 pointer-events-none" />
                  <span className="text-[10px] sm:text-[12px] md:text-sm drop-shadow-md">{p >= 1000 ? p / 100 : p}</span>
                </button>
              );
            })}
          </div>

          {/* Place Bet / Rebet */}
          <button
            disabled={!isBetting || !selected || betting}
            onClick={() => handleBet()}
            className={`shrink-0 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gradient-to-b from-green-400 to-green-700 border border-green-300 text-white font-black text-[9px] sm:text-xs uppercase shadow-lg active:translate-y-0.5 transition-transform h-full max-h-[44px] sm:max-h-[48px] ${
              !isBetting || !selected || betting ? 'opacity-50 cursor-not-allowed saturate-0' : 'hover:brightness-110'
            }`}>
            {selected ? 'PLACE BET' : 'REBET'}
          </button>
        </div>
      </div>

      {/* ── Chips Animation Layer (z-[100]) ── */}
      <ChipLayer bets={roundBets} />

      {/* ── STOP BETTING / REVEALING Overlays (Rendered above chips at z-[150]) ── */}
      {showStopBettingOverlay && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none px-4">
          <div className="bg-black/80 backdrop-blur-[3px] py-2.5 sm:py-3.5 w-full max-w-lg rounded-xl border-y-2 border-red-500 flex flex-col items-center shadow-[0_0_50px_rgba(220,38,38,0.7)]">
            <p className="text-2xl sm:text-4xl font-black tracking-[0.25em] text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(220,38,38,0.9)]">STOP</p>
            <p className="text-[10px] sm:text-xs font-bold tracking-widest text-white mt-0.5 uppercase">Betting</p>
          </div>
        </div>
      )}
      {showCalculatingOverlay && !showStopBettingOverlay && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none px-4">
          <div className="bg-black/70 backdrop-blur-[2px] py-2.5 w-full max-w-lg rounded-xl border-y-2 border-yellow-500 flex justify-center shadow-[0_0_40px_rgba(234,179,8,0.5)]">
            <p className="text-sm sm:text-lg font-black tracking-widest text-yellow-400 animate-pulse uppercase">Revealing...</p>
          </div>
        </div>
      )}
    </div>
  );
}
