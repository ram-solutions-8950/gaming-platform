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
  // Animated Dice Roll Pipeline (600ms tumbling + 1.4s notice hold)
  // -----------------------------------------------------------------
  const triggerDiceRollAnimation = useCallback(
    (rollVal: number, turnEnded: boolean, reason: string | undefined, newState: LudoMatchState) => {
      // 1. Play sound and start tumbling
      soundManager.play('dice_roll');
      setRollingDice(true);

      if (rollCycleTimerRef.current) clearInterval(rollCycleTimerRef.current);
      if (transitionDelayTimerRef.current) clearTimeout(transitionDelayTimerRef.current);

      let cycles = 0;
      rollCycleTimerRef.current = setInterval(() => {
        cycles++;
        setDiceDisplayValue(Math.floor(Math.random() * 6) + 1);

        if (cycles >= 10) {
          clearInterval(rollCycleTimerRef.current);
          rollCycleTimerRef.current = null;
          setRollingDice(false);
          setDiceDisplayValue(rollVal);

          if (turnEnded) {
            let note = `Rolled ${rollVal} • No legal moves`;
            if (reason === 'THREE_CONSECUTIVE_SIXES') {
              note = '3 Consecutive 6s! Turn forfeited';
            } else if (rollVal !== 6) {
              note = `Rolled ${rollVal} • Need 6 to open token`;
            }
            setDiceStatusNotice(note);

            // Hold rolled number & explanation for 1.4s before advancing turn
            transitionDelayTimerRef.current = setTimeout(() => {
              setMatchState(newState);
              setTimerSeconds(newState.remaining_timer_seconds ?? 10);
              setDiceStatusNotice(null);
              transitionDelayTimerRef.current = null;
            }, 1400);
          } else {
            setMatchState(newState);
            setTimerSeconds(newState.remaining_timer_seconds ?? 10);
            setDiceStatusNotice(`Rolled ${rollVal}! Tap a glowing token`);
          }
        }
      }, 55);
    },
    []
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
          setDiceStatusNotice(null);
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          if (msg.data?.captured) {
            soundManager.play('loss');
          }
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
          }
        } else if (msg.type === 'TIMEOUT' && msg.state) {
          setDiceStatusNotice(null);
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
          }
        } else if (msg.type === 'PLAYER_FORFEITED' && msg.state) {
          setMatchState(msg.state);
          if (msg.data?.game_over) {
            soundManager.play('win_clap');
            refreshWallet();
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
  }, [matchState, rollingDice]);

  // Fallback Polling (Sync every 3s)
  useEffect(() => {
    if (matchState && matchState.status === 'IN_PROGRESS' && !rollingDice) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const fresh = await ludoService.getMatchState(matchState.id);
          setMatchState(fresh);
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

    setMatchState(null);
    matchTransitionRef.current = null;
    refreshWallet();
    navigate('/dashboard');
  };

  const handleReturnToLobby = () => {
    if (rollCycleTimerRef.current) clearInterval(rollCycleTimerRef.current);
    if (transitionDelayTimerRef.current) clearTimeout(transitionDelayTimerRef.current);
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

  // Position Players at the 4 Corners matching Board Yards
  // Top-Left: Red, Top-Right: Green, Bottom-Left: Blue, Bottom-Right: Yellow
  const redPlayer = matchState?.players.find((p) => p.color === 'RED');
  const greenPlayer = matchState?.players.find((p) => p.color === 'GREEN');
  const bluePlayer = matchState?.players.find((p) => p.color === 'BLUE');
  const yellowPlayer = matchState?.players.find((p) => p.color === 'YELLOW');

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

      {/* 2. ACTIVE MATCH VIEW (Centered Board + 4 Corners + Bottom Corner Dice) */}
      {matchState && (
        <div className="ludo-active-match w-full max-w-7xl h-full flex flex-col gap-1 sm:gap-2 items-center justify-between overflow-hidden">
          {/* Header Bar */}
          <div className="ludo-game-header w-full flex items-center justify-between px-3 py-1.5 bg-slate-900/90 backdrop-blur-md rounded-xl border border-slate-800 shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowExitConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-lg text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
                aria-label="Exit Game"
              >
                <ArrowLeft size={14} />
                <span>Exit</span>
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

              <button
                type="button"
                onClick={() => setShowExitConfirm(true)}
                className="text-xs font-bold px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 rounded-lg transition active:scale-95 cursor-pointer"
              >
                Forfeit
              </button>
            </div>
          </div>

          {/* Arena Stage: Centered Board flanked by Corner Player Panels & Bottom-Left Corner Dice */}
          <div className="ludo-arena-stage w-full flex-1 flex flex-row items-center justify-between gap-2 sm:gap-4 overflow-hidden min-h-0 px-1 sm:px-3">
            {/* Left Side: P1 Red (Top-Left) & P3 Blue / Bottom Corner Dice (Bottom-Left) */}
            <div className="ludo-side-col-left h-full flex flex-col justify-between items-start w-[170px] sm:w-[210px] shrink-0 py-0.5">
              {/* Top-Left Corner: Red Player */}
              <div className="w-full">
                {redPlayer ? (
                  <LudoPlayerPanel
                    player={redPlayer}
                    isCurrentTurn={matchState.current_turn_color === 'RED'}
                    isMe={redPlayer.user_id === user?.id}
                  />
                ) : (
                  <div className="p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    Empty Seat
                  </div>
                )}
              </div>

              {/* Bottom-Left Corner: P3 Blue & Dice Roll Widget */}
              <div className="w-full flex flex-col gap-1.5 items-start">
                {bluePlayer && (
                  <div className="w-full">
                    <LudoPlayerPanel
                      player={bluePlayer}
                      isCurrentTurn={matchState.current_turn_color === 'BLUE'}
                      isMe={bluePlayer.user_id === user?.id}
                    />
                  </div>
                )}

                {/* Bottom Corner Dice Box (matches user sketch) */}
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
              </div>
            </div>

            {/* Center Stage: Ludo Board (Centered Horizontally & Vertically) */}
            <div className="ludo-board-center-stage flex-1 flex items-center justify-center h-full max-h-full overflow-hidden p-1">
              <LudoBoard
                players={matchState.players}
                currentTurnColor={matchState.current_turn_color}
                legalTokenIndices={matchState.legal_token_indices || []}
                onTokenClick={handleMoveToken}
                isMyTurn={isMyTurn}
              />
            </div>

            {/* Right Side: P2 Green (Top-Right) & P4 Yellow (Bottom-Right) */}
            <div className="ludo-side-col-right h-full flex flex-col justify-between items-end w-[170px] sm:w-[210px] shrink-0 py-0.5">
              {/* Top-Right Corner: Green Player */}
              <div className="w-full">
                {greenPlayer ? (
                  <LudoPlayerPanel
                    player={greenPlayer}
                    isCurrentTurn={matchState.current_turn_color === 'GREEN'}
                    isMe={greenPlayer.user_id === user?.id}
                  />
                ) : (
                  <div className="p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    {matchState.players.length === 2 ? '2P Match' : 'Empty Seat'}
                  </div>
                )}
              </div>

              {/* Bottom-Right Corner: Yellow Player */}
              <div className="w-full">
                {yellowPlayer ? (
                  <LudoPlayerPanel
                    player={yellowPlayer}
                    isCurrentTurn={matchState.current_turn_color === 'YELLOW'}
                    isMe={yellowPlayer.user_id === user?.id}
                  />
                ) : (
                  <div className="p-2 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl text-center text-[10px] text-slate-500">
                    Empty Seat
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Winner Modal */}
          {matchState.status === 'COMPLETED' && (
            <LudoWinnerModal
              winnerPlayer={winnerPlayer}
              isMe={isWinnerMe}
              prizePool={matchState.prize_pool}
              entryFee={matchState.entry_fee}
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
    </div>
  );
};

export default Ludo;
