import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/wallet';
import { ludoService } from '../../services/ludo';
import type { LudoMatchState } from '../../types/ludo';
import { LudoBoard } from '../../components/ludo/LudoBoard';
import { LudoDice } from '../../components/ludo/LudoDice';
import { LudoPlayerPanel } from '../../components/ludo/LudoPlayerPanel';
import { LudoLobby } from '../../components/ludo/LudoLobby';
import { LudoWinnerModal } from '../../components/ludo/LudoWinnerModal';
import { GameRulesModal } from '../../components/common/GameRulesModal';
import { LUDO_RULES_DATA } from '../../components/common/gameRulesData';
import { soundManager } from '../../services/soundManager';
import { authStorage } from '../../services/authStorage';
import { getWebSocketUrl } from '../../utils/ws';
import { lockLandscape } from '../../utils/nativeOrientation';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import '../../styles/ludo.css';

interface FloatingReaction {
  id: string;
  emoji: string;
  leftPercent: number;
}

interface CelebrationBanner {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  type: 'SIX' | 'CAPTURE' | 'HOME';
}

export const Ludo: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [matchState, setMatchState] = useState<LudoMatchState | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showRulesModal, setShowRulesModal] = useState<boolean>(false);

  // Matchmaking State
  const [searching, setSearching] = useState<boolean>(false);
  const [searchRemainingSeconds, setSearchRemainingSeconds] = useState<number>(30);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState<number>(0);

  // In-Game State & Dice Animation
  const [timerSeconds, setTimerSeconds] = useState<number>(10);
  const [rollingDice, setRollingDice] = useState<boolean>(false);
  const [diceDisplayValue, setDiceDisplayValue] = useState<number | null>(null);
  const [diceStatusNotice, setDiceStatusNotice] = useState<string | null>(null);

  // Floating reactions & celebration banners
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [banner, setBanner] = useState<CelebrationBanner | null>(null);
  const bannerTimerRef = useRef<any>(null);

  const triggerBanner = useCallback(
    (title: string, subtitle: string, badge: string, type: 'SIX' | 'CAPTURE' | 'HOME') => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      const newBanner: CelebrationBanner = { id: Math.random().toString(), title, subtitle, badge, type };
      setBanner(newBanner);
      bannerTimerRef.current = setTimeout(() => {
        setBanner(null);
        bannerTimerRef.current = null;
      }, 1400);
    },
    []
  );

  const addReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}_${Math.random()}`;
    const leftPercent = 25 + Math.random() * 50;
    setReactions((prev) => [...prev.slice(-12), { id, emoji, leftPercent }]);
    soundManager.play('reveal_tick');
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 1800);
  }, []);

  const sendReaction = useCallback(
    (emoji: string) => {
      addReaction(emoji);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'REACTION',
              emoji,
              sender: user?.username || 'Player',
            })
          );
        } catch {}
      }
    },
    [addReaction, user?.username]
  );

  const rollCycleTimerRef = useRef<any>(null);
  const transitionDelayTimerRef = useRef<any>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<any>(null);

  // Matchmaking WebSocket ref
  const mmWsRef = useRef<WebSocket | null>(null);

  // Guard against duplicate match transitions
  const matchTransitionRef = useRef<string | null>(null);

  // Lock orientation to landscape
  useEffect(() => {
    lockLandscape().catch(() => {});
  }, []);

  // Fetch balance
  const refreshWallet = useCallback(async () => {
    try {
      const w = await walletService.getWallet();
      setWalletBalance(w.balance);
    } catch (e) {
      console.error('Failed to load wallet', e);
    }
  }, []);

  useEffect(() => {
    refreshWallet();
    ludoService.getMatchmakingStatus().then((res) => {
      if (res.status === 'MATCHED' && res.match_id) {
        transitionToMatch(res.match_id);
      } else if (res.status === 'SEARCHING') {
        setSearching(true);
        if (res.remaining_seconds) setSearchRemainingSeconds(res.remaining_seconds);
      }
    }).catch(() => {});
  }, [refreshWallet]);

  // -----------------------------------------------------------------
  // Guarded Match Transition (prevents duplicate loadMatch calls)
  // -----------------------------------------------------------------
  const transitionToMatch = useCallback((matchId: string) => {
    if (matchTransitionRef.current === matchId) {
      return;
    }
    matchTransitionRef.current = matchId;

    setSearching(false);
    setSearchElapsedSeconds(0);

    if (mmWsRef.current) {
      try {
        mmWsRef.current.close();
      } catch {}
      mmWsRef.current = null;
    }

    loadMatch(matchId);
    refreshWallet();
  }, [refreshWallet]);

  // -----------------------------------------------------------------
  // Matchmaking REST Polling (fallback)
  // -----------------------------------------------------------------
  useEffect(() => {
    let interval: any = null;
    if (searching) {
      interval = setInterval(async () => {
        try {
          const status = await ludoService.getMatchmakingStatus();
          if (status.status === 'MATCHED' && status.match_id) {
            clearInterval(interval);
            transitionToMatch(status.match_id);
          } else if (status.status === 'CANCELLED' || status.status === 'TIMEOUT') {
            setSearching(false);
            clearInterval(interval);
          } else if (status.status === 'SEARCHING') {
            setSearchElapsedSeconds((prev) => prev + 1);
            if (status.remaining_seconds !== undefined) {
              setSearchRemainingSeconds(status.remaining_seconds);
            }
          }
        } catch (e) {
          console.error('Matchmaking poll error', e);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [searching, transitionToMatch]);

  // -----------------------------------------------------------------
  // -----------------------------------------------------------------
  // Animated Dice Roll Pipeline (Snappy 300ms tumbling + fast notice)
  // -----------------------------------------------------------------
  const triggerDiceRollAnimation = useCallback(
    (rollVal: number, turnEnded: boolean, reason: string | undefined, rolledState: LudoMatchState) => {
      soundManager.play('dice_roll');
      setRollingDice(true);
      setDiceDisplayValue(rollVal);

      if (rollCycleTimerRef.current) clearInterval(rollCycleTimerRef.current);
      if (transitionDelayTimerRef.current) clearTimeout(transitionDelayTimerRef.current);

      let cycles = 0;
      rollCycleTimerRef.current = setInterval(() => {
        cycles++;
        setDiceDisplayValue(Math.floor(Math.random() * 6) + 1);

        if (cycles >= 6) {
          clearInterval(rollCycleTimerRef.current);
          rollCycleTimerRef.current = null;
          setRollingDice(false);
          setDiceDisplayValue(rollVal);

          // Update matchState safely without overwriting newer state
          setMatchState((current) => {
            if (!current) return rolledState;
            // If already on a newer state (token moved or turn already passed), preserve latest
            if (current.last_dice_roll === null && current.current_turn_color !== rolledState.current_turn_color) {
              return current;
            }
            return rolledState;
          });
          setTimerSeconds(rolledState.remaining_timer_seconds ?? 10);

          // Trigger Lucky 6 Celebration Banner
          if (rollVal === 6) {
            soundManager.play('cashout');
            const isMe = rolledState.players.some((p) => p.user_id === user?.id && p.color === rolledState.current_turn_color);
            triggerBanner(
              'LUCKY 6! BONUS ROLL! 🎲',
              isMe ? 'You earned a bonus roll!' : `${rolledState.current_turn_color} earned a bonus roll!`,
              '🎉',
              'SIX'
            );
          }

          if (turnEnded) {
            let note = `Rolled ${rollVal} • No legal moves`;
            if (reason === 'THREE_CONSECUTIVE_SIXES') {
              note = '3 Consecutive 6s! Turn forfeited';
            } else if (rollVal !== 6) {
              note = `Rolled ${rollVal} • Need 6 to open token`;
            }
            setDiceStatusNotice(note);

            // Fast 400ms notice hold without blocking turn transition
            transitionDelayTimerRef.current = setTimeout(() => {
              setDiceStatusNotice(null);
              transitionDelayTimerRef.current = null;
            }, 400);
          } else {
            setDiceStatusNotice(`Rolled ${rollVal}! Tap a glowing token`);
          }
        }
      }, 50);
    },
    [triggerBanner, user?.id]
  );

  // -----------------------------------------------------------------
  // Load Match State & Connect Game WebSocket
  // -----------------------------------------------------------------
  const loadMatch = async (matchId: string) => {
    try {
      const state = await ludoService.getMatchState(matchId);
      setMatchState(state);
      setTimerSeconds(state.remaining_timer_seconds ?? 10);
      setDiceDisplayValue(state.last_dice_roll);
      connectWebSocket(matchId);
    } catch (e) {
      console.error('Failed to load match state', e);
      matchTransitionRef.current = null;
    }
  };

  const connectWebSocket = (matchId: string) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const token = authStorage.getAccessToken();
    const wsUrl = getWebSocketUrl(`ludo/ws/${matchId}`, token || undefined);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'MATCH_STATE' && msg.state) {
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          setDiceDisplayValue(msg.state.last_dice_roll);
        } else if (msg.type === 'DICE_ROLLED' && msg.state) {
          const rollVal = msg.data?.roll ?? msg.state.last_dice_roll ?? 1;
          const turnEnded = Boolean(msg.data?.turn_ended);
          const reason = msg.data?.reason;
          triggerDiceRollAnimation(rollVal, turnEnded, reason, msg.state);
        } else if (msg.type === 'TOKEN_MOVED' && msg.state) {
          // Immediately cancel any pending roll timers to prevent state regression
          if (rollCycleTimerRef.current) {
            clearInterval(rollCycleTimerRef.current);
            rollCycleTimerRef.current = null;
            setRollingDice(false);
          }
          if (transitionDelayTimerRef.current) {
            clearTimeout(transitionDelayTimerRef.current);
            transitionDelayTimerRef.current = null;
          }
          setDiceStatusNotice(null);
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          setDiceDisplayValue(msg.state.last_dice_roll);
          if (msg.data?.captured) {
            soundManager.play('loss');
            triggerBanner(
              'TOKEN CAPTURED! 💥',
              'Opponent eliminated back to yard! Bonus roll granted!',
              '⚔️',
              'CAPTURE'
            );
          } else if (msg.data?.is_home) {
            soundManager.play('cashout');
            triggerBanner(
              'HOME RUN! TOKEN SCORED! 🌟',
              'Pawn safely arrived at Home Triangle!',
              '🏆',
              'HOME'
            );
          }
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
          }
        } else if (msg.type === 'TIMEOUT') {
          if (rollCycleTimerRef.current) {
            clearInterval(rollCycleTimerRef.current);
            rollCycleTimerRef.current = null;
            setRollingDice(false);
          }
          if (transitionDelayTimerRef.current) {
            clearTimeout(transitionDelayTimerRef.current);
            transitionDelayTimerRef.current = null;
          }
          setDiceStatusNotice(null);
          if (msg.state) {
            setMatchState(msg.state);
            setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
            setDiceDisplayValue(msg.state.last_dice_roll);
          }
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
          }
        } else if (msg.type === 'PLAYER_FORFEITED' && msg.state) {
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
          }
        } else if (msg.type === 'REACTION' && msg.data?.emoji) {
          if (msg.data.sender !== user?.username) {
            addReaction(msg.data.emoji);
          }
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => {
        if (matchState && matchState.status === 'IN_PROGRESS') {
          connectWebSocket(matchId);
        }
      }, 2000);
    };
  };

  // -----------------------------------------------------------------
  // Visual 10s Timer Countdown
  // -----------------------------------------------------------------
  useEffect(() => {
    let interval: any = null;
    if (matchState && matchState.status === 'IN_PROGRESS' && !rollingDice) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            ludoService.forceTimeout(matchState.id).catch(() => {});
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matchState?.current_turn_color, matchState?.status, rollingDice]);

  // Fallback Polling (Sync every 3s)
  useEffect(() => {
    if (matchState && matchState.status === 'IN_PROGRESS' && !rollingDice) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const fresh = await ludoService.getMatchState(matchState.id);
          setMatchState(fresh);
          setTimerSeconds(fresh.remaining_timer_seconds ?? 10);
        } catch {}
      }, 3000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [matchState?.id, matchState?.status, rollingDice]);

  // -----------------------------------------------------------------
  // Matchmaking handlers
  // -----------------------------------------------------------------
  const handleStartMatchmaking = async (playerCount: number, entryFee: number) => {
    matchTransitionRef.current = null;
    const token = authStorage.getAccessToken();
    const mmWsUrl = getWebSocketUrl('ludo/ws/matchmaking', token || undefined);

    try {
      const mmWs = await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(mmWsUrl);
        const timeoutId = setTimeout(() => {
          ws.close();
          reject(new Error('Matchmaking WS connection timeout'));
        }, 5000);

        ws.onopen = () => {
          clearTimeout(timeoutId);
          resolve(ws);
        };
        ws.onerror = (err) => {
          clearTimeout(timeoutId);
          reject(err);
        };
      });

      mmWsRef.current = mmWs;

      mmWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'MATCH_FOUND' && msg.match_id) {
            transitionToMatch(msg.match_id);
          }
        } catch (e) {
          console.error('[LUDO-MM-WS] Parse error', e);
        }
      };

      mmWs.onclose = () => {
        mmWsRef.current = null;
      };
    } catch (wsError) {
      console.warn('[LUDO-MM-WS] WS connection failed, using REST fallback only', wsError);
    }

    try {
      const res = await ludoService.joinMatchmaking(playerCount, entryFee);
      if (res.status === 'MATCHED' && res.match_id) {
        transitionToMatch(res.match_id);
      } else if (res.status === 'ALREADY_IN_MATCH' && res.match_id) {
        transitionToMatch(res.match_id);
      } else {
        setSearching(true);
        setSearchRemainingSeconds(30);
        setSearchElapsedSeconds(0);
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to start matchmaking');
      if (mmWsRef.current) {
        mmWsRef.current.close();
        mmWsRef.current = null;
      }
    }
  };

  const handleCancelMatchmaking = async () => {
    try {
      if (mmWsRef.current) {
        mmWsRef.current.close();
        mmWsRef.current = null;
      }
      await ludoService.cancelMatchmaking();
      setSearching(false);
      setSearchElapsedSeconds(0);
      matchTransitionRef.current = null;
    } catch {}
  };

  // -----------------------------------------------------------------
  // Game Actions
  // -----------------------------------------------------------------
  const handleRollDice = async () => {
    if (!matchState || rollingDice) return;
    try {
      await ludoService.rollDice(matchState.id);
    } catch (e: any) {
      console.error('Roll error', e);
    }
  };

  const handleMoveToken = async (tokenIndex: number) => {
    if (!matchState) return;
    try {
      await ludoService.moveToken(matchState.id, tokenIndex);
      setDiceStatusNotice(null);
    } catch (e: any) {
      console.error('Move error', e);
    }
  };

  const handleExitLobby = async () => {
    if (searching) {
      await handleCancelMatchmaking();
    }
    navigate('/dashboard');
  };

  const handleConfirmExitActiveMatch = async () => {
    setShowExitConfirm(false);
    if (matchState) {
      try {
        await ludoService.leaveMatch(matchState.id);
      } catch {}
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (mmWsRef.current) {
      try {
        mmWsRef.current.close();
      } catch {}
      mmWsRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (rollCycleTimerRef.current) clearInterval(rollCycleTimerRef.current);
    if (transitionDelayTimerRef.current) clearTimeout(transitionDelayTimerRef.current);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(null);
    setReactions([]);

    setMatchState(null);
    matchTransitionRef.current = null;
    refreshWallet();
    navigate('/dashboard');
  };

  const handleReturnToLobby = () => {
    if (rollCycleTimerRef.current) clearInterval(rollCycleTimerRef.current);
    if (transitionDelayTimerRef.current) clearTimeout(transitionDelayTimerRef.current);
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setBanner(null);
    setReactions([]);
    setMatchState(null);
    matchTransitionRef.current = null;
    refreshWallet();
  };

  // Identify Player Info
  const myPlayer = matchState?.players.find((p) => p.user_id === user?.id);
  const isMyTurn = Boolean(
    myPlayer &&
      matchState?.status === 'IN_PROGRESS' &&
      matchState.current_turn_color === myPlayer.color
  );

  const canRoll = isMyTurn && matchState?.last_dice_roll === null && !rollingDice;

  const winnerPlayer = matchState?.players.find((p) => p.rank === 1) || null;
  const isWinnerMe = Boolean(winnerPlayer && myPlayer && winnerPlayer.user_id === myPlayer.user_id);

  // Authentic 4-Corner mapping matching Board Yards:
  // Top-Left: Red, Bottom-Left: Blue, Top-Right: Green, Bottom-Right: Yellow
  const redPlayer = matchState?.players.find((p) => p.color === 'RED');
  const greenPlayer = matchState?.players.find((p) => p.color === 'GREEN');
  const bluePlayer = matchState?.players.find((p) => p.color === 'BLUE');
  const yellowPlayer = matchState?.players.find((p) => p.color === 'YELLOW');

  // Movable tokens calculation with fallback (BUG-004)
  const legalTokenIndices = React.useMemo(() => {
    if (!matchState || !isMyTurn) return [];
    if (matchState.legal_token_indices && matchState.legal_token_indices.length > 0) {
      return matchState.legal_token_indices;
    }
    const roll = diceDisplayValue ?? matchState.last_dice_roll;
    if (!roll || !myPlayer) return [];
    return myPlayer.tokens
      .filter((t) => {
        if (t.is_home || t.position >= 56) return false;
        if (t.position === -1) return roll === 6;
        return t.position + roll <= 56;
      })
      .map((t) => t.token_index);
  }, [matchState, isMyTurn, diceDisplayValue, myPlayer]);

  // Smart Auto-Move (BUG-005): If there is only ONE legal move, auto-dispatch smoothly
  // after a brief 400ms visual confirmation so turns transition smoothly without delays.
  useEffect(() => {
    if (!isMyTurn || rollingDice || !matchState || matchState.last_dice_roll === null) return;
    if (legalTokenIndices.length === 1) {
      const tokenIdx = legalTokenIndices[0];
      const autoTimer = setTimeout(() => {
        handleMoveToken(tokenIdx);
      }, 400);
      return () => clearTimeout(autoTimer);
    }
  }, [isMyTurn, rollingDice, matchState?.last_dice_roll, legalTokenIndices]);

  // Hardware & popstate Back Button Handler
  useEffect(() => {
    const handleAndroidBack = (): boolean => {
      if (showExitConfirm) {
        setShowExitConfirm(false);
        return true;
      }
      if (showRulesModal) {
        setShowRulesModal(false);
        return true;
      }
      if (matchState) {
        if (matchState.status === 'COMPLETED') {
          handleReturnToLobby();
          return true;
        }
        setShowExitConfirm(true);
        return true;
      }
      handleExitLobby();
      return true;
    };

    (window as any).__gameSpecificBackPressed = handleAndroidBack;

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      handleAndroidBack();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      delete (window as any).__gameSpecificBackPressed;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [matchState, showExitConfirm, showRulesModal, handleReturnToLobby, handleExitLobby]);

  const diceElement = matchState ? (
    <LudoDice
      value={diceDisplayValue ?? matchState.last_dice_roll}
      rolling={rollingDice}
      isMyTurn={isMyTurn}
      canRoll={canRoll}
      onRoll={handleRollDice}
      timerSeconds={timerSeconds}
      currentTurnColor={matchState.current_turn_color}
      statusNotice={diceStatusNotice}
    />
  ) : null;

  return (
    <div
      className="ludo-page-container w-full h-full flex-1 flex flex-col items-center justify-center bg-[#040713] text-white select-none"
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        paddingLeft: 'max(var(--safe-left), 8px)',
        paddingRight: 'max(var(--safe-right), 8px)',
        paddingTop: 'max(var(--safe-top), 4px)',
        paddingBottom: 'max(var(--safe-bottom), 6px)',
      }}
    >
      {/* 1. LOBBY VIEW */}
      {!matchState && (
        <div className="ludo-lobby-wrapper w-full max-w-lg mx-auto flex flex-col items-center justify-center">
          <LudoLobby
            userBalance={walletBalance}
            onStartMatchmaking={handleStartMatchmaking}
            searching={searching}
            searchElapsedSeconds={searchElapsedSeconds}
            searchRemainingSeconds={searchRemainingSeconds}
            onCancelMatchmaking={handleCancelMatchmaking}
            onExit={handleExitLobby}
          />
        </div>
      )}

      {/* 2. ACTIVE MATCH VIEW (Centered Board + 4 Corners + Dynamic Dice Placement) */}
      {matchState && (
        <div className="ludo-active-match w-full max-w-7xl h-full flex flex-col gap-1 sm:gap-2 items-center justify-between overflow-hidden">
          {/* Header Bar with Total Balance & Contextual Back Button */}
          <div className="ludo-game-header w-full flex items-center justify-between px-3 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={matchState.status === 'COMPLETED' ? handleReturnToLobby : () => setShowExitConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
                aria-label={matchState.status === 'COMPLETED' ? 'Back to Lobby' : 'Exit Game'}
              >
                <ArrowLeft size={14} />
                <span>{matchState.status === 'COMPLETED' ? 'Back' : 'Exit'}</span>
              </button>
              <div>
                <h1 className="text-xs sm:text-sm font-black text-amber-400 leading-tight">
                  LUDO {matchState.players.length}P
                </h1>
                <span className="text-[10px] text-slate-400">
                  Prize: ₹{(matchState.prize_pool / 100).toFixed(0)} • Entry: ₹{(matchState.entry_fee / 100).toFixed(0)}
                </span>
              </div>
            </div>

            {/* Total Balance Pill */}
            <div className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 bg-slate-950/80 rounded-full border border-amber-500/40 shadow-inner">
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Total Balance:</span>
              <span className="text-xs sm:text-sm font-black text-amber-400">
                ₹{(walletBalance / 100).toFixed(2)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRulesModal(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg text-xs font-bold transition active:scale-95 cursor-pointer"
                aria-label="View Rules"
              >
                <HelpCircle size={14} />
                <span>Rules</span>
              </button>

              {matchState.status === 'IN_PROGRESS' && (
                <button
                  type="button"
                  onClick={() => setShowExitConfirm(true)}
                  className="text-xs font-bold px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 rounded-lg transition active:scale-95 cursor-pointer"
                >
                  Forfeit
                </button>
              )}
            </div>
          </div>

          {/* Arena Stage: Centered Board flanked by Corner Player Panels & Corner Dice (BUG-003) */}
          <div className="ludo-arena-stage w-full flex-1 flex flex-row items-center justify-between gap-2 sm:gap-4 overflow-hidden min-h-0 px-1 sm:px-3">
            {/* Left Column: Top-Left (RED) & Bottom-Left (BLUE) */}
            <div className="ludo-side-col-left h-full flex flex-col justify-between items-start w-[170px] sm:w-[210px] shrink-0 py-0.5">
              {/* Top-Left: RED Player Panel & Dice (when Red's turn) */}
              <div className="w-full flex flex-col gap-1.5 items-start">
                {redPlayer ? (
                  <div className="w-full">
                    <LudoPlayerPanel
                      player={redPlayer}
                      isCurrentTurn={matchState.current_turn_color === 'RED'}
                      isMe={redPlayer.user_id === user?.id}
                    />
                  </div>
                ) : (
                  <div className="w-full p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    Empty Seat
                  </div>
                )}
                {matchState.current_turn_color === 'RED' && diceElement}
              </div>

              {/* Bottom-Left: BLUE Player Panel & Dice (when Blue's turn) */}
              <div className="w-full flex flex-col gap-1.5 items-start">
                {matchState.current_turn_color === 'BLUE' && diceElement}
                {bluePlayer ? (
                  <div className="w-full">
                    <LudoPlayerPanel
                      player={bluePlayer}
                      isCurrentTurn={matchState.current_turn_color === 'BLUE'}
                      isMe={bluePlayer.user_id === user?.id}
                    />
                  </div>
                ) : (
                  <div className="w-full p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    {matchState.players.length === 2 ? '2P Match' : 'Empty Seat'}
                  </div>
                )}
              </div>
            </div>

            {/* Center Stage: Ludo Board (Centered Horizontally & Vertically) + Quick Reactions */}
            <div className="ludo-board-center-stage flex-1 flex flex-col items-center justify-center h-full max-h-full overflow-hidden p-1 relative">
              <LudoBoard
                players={matchState.players}
                currentTurnColor={matchState.current_turn_color}
                legalTokenIndices={legalTokenIndices}
                onTokenClick={handleMoveToken}
                isMyTurn={isMyTurn}
              />

              {/* Interactive Quick Reaction Bar */}
              <div className="mt-1 sm:mt-1.5 flex items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3 py-1 bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-700/70 shadow-lg shrink-0 z-20">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider hidden sm:inline mr-1">
                  React:
                </span>
                {['😂', '🔥', '👑', '🎲', '😎', '👏'].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => sendReaction(emoji)}
                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 active:scale-125 hover:scale-110 text-base sm:text-lg transition-transform cursor-pointer select-none shadow-sm border border-slate-700/50"
                    title={`Send ${emoji}`}
                    aria-label={`Reaction ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Top-Right (GREEN) & Bottom-Right (YELLOW) */}
            <div className="ludo-side-col-right h-full flex flex-col justify-between items-end w-[170px] sm:w-[210px] shrink-0 py-0.5">
              {/* Top-Right: GREEN Player Panel & Dice (when Green's turn) */}
              <div className="w-full flex flex-col gap-1.5 items-end">
                {greenPlayer ? (
                  <div className="w-full">
                    <LudoPlayerPanel
                      player={greenPlayer}
                      isCurrentTurn={matchState.current_turn_color === 'GREEN'}
                      isMe={greenPlayer.user_id === user?.id}
                    />
                  </div>
                ) : (
                  <div className="w-full p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    {matchState.players.length === 2 ? '2P Match' : 'Empty Seat'}
                  </div>
                )}
                {matchState.current_turn_color === 'GREEN' && diceElement}
              </div>

              {/* Bottom-Right: YELLOW Player Panel & Dice (when Yellow's turn) */}
              <div className="w-full flex flex-col gap-1.5 items-end">
                {matchState.current_turn_color === 'YELLOW' && diceElement}
                {yellowPlayer ? (
                  <div className="w-full">
                    <LudoPlayerPanel
                      player={yellowPlayer}
                      isCurrentTurn={matchState.current_turn_color === 'YELLOW'}
                      isMe={yellowPlayer.user_id === user?.id}
                    />
                  </div>
                ) : (
                  <div className="w-full p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    Empty Seat
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Winner Celebration Modal */}
          {matchState.status === 'COMPLETED' && (
            <LudoWinnerModal
              winnerPlayer={winnerPlayer}
              isMe={isWinnerMe}
              prizePool={matchState.prize_pool}
              entryFee={matchState.entry_fee}
              userBalance={walletBalance}
              onReturnToLobby={handleReturnToLobby}
            />
          )}
        </div>
      )}

      {/* Rules Modal */}
      {showRulesModal && (
        <GameRulesModal
          title={LUDO_RULES_DATA.title}
          subtitle={LUDO_RULES_DATA.subtitle}
          sections={LUDO_RULES_DATA.sections}
          tips={LUDO_RULES_DATA.tips}
          onClose={() => setShowRulesModal(false)}
        />
      )}

      {/* Exit Confirmation Modal */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="relative w-full max-w-sm bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.85)] text-white text-center flex flex-col items-center gap-3.5 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600/30 via-red-900/40 to-slate-900 border-2 border-red-500/50 flex items-center justify-center text-3xl shadow-inner">
              ⚠️
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-500 uppercase tracking-wide">
                Exit Game?
              </h3>
              <p className="text-xs text-slate-300 font-medium">
                Are you sure you want to leave the current game?
              </p>
              <span className="text-[11px] text-red-400 font-semibold block pt-0.5">
                Leaving an active match will forfeit your entry fee.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full pt-1">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-xs font-bold text-slate-200 border border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExitActiveMatch}
                className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-700 hover:brightness-110 active:scale-95 text-xs font-black text-white shadow-lg shadow-red-900/40 border border-red-400/50 transition cursor-pointer uppercase tracking-wider"
              >
                Exit Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Celebration Banner Overlay */}
      {banner && (
        <div className="fixed top-12 sm:top-14 left-1/2 -translate-x-1/2 z-[70] pointer-events-none animate-banner-pop max-w-sm sm:max-w-md w-[92%]">
          <div
            className={`px-4 py-2.5 rounded-2xl border backdrop-blur-xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] text-center flex items-center justify-center gap-3 ${
              banner.type === 'SIX'
                ? 'bg-gradient-to-r from-amber-600/95 via-yellow-500/95 to-amber-600/95 border-amber-300 text-amber-950 font-extrabold'
                : banner.type === 'CAPTURE'
                ? 'bg-gradient-to-r from-red-600/95 via-rose-500/95 to-red-600/95 border-red-300 text-white font-extrabold'
                : 'bg-gradient-to-r from-emerald-600/95 via-teal-500/95 to-green-600/95 border-emerald-300 text-white font-extrabold'
            }`}
          >
            <span className="text-2xl sm:text-3xl filter drop-shadow shrink-0">{banner.badge}</span>
            <div className="flex flex-col text-left leading-tight">
              <span className="text-xs sm:text-sm font-black tracking-wide uppercase drop-shadow-sm">
                {banner.title}
              </span>
              <span className="text-[10px] sm:text-xs font-bold opacity-95">
                {banner.subtitle}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Reactions Overlay */}
      <div className="fixed inset-0 pointer-events-none z-[60] overflow-hidden">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-24 text-3xl sm:text-5xl animate-reaction-float filter drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] select-none"
            style={{ left: `${r.leftPercent}%` }}
          >
            {r.emoji}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Ludo;
