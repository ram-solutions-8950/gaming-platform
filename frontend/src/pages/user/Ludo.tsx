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
import { soundManager } from '../../services/soundManager';
import { authStorage } from '../../services/authStorage';
import { getWebSocketUrl } from '../../utils/ws';
import { lockLandscape } from '../../utils/nativeOrientation';
import { ArrowLeft } from 'lucide-react';

export const Ludo: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [matchState, setMatchState] = useState<LudoMatchState | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Matchmaking State
  const [searching, setSearching] = useState<boolean>(false);
  const [searchRemainingSeconds, setSearchRemainingSeconds] = useState<number>(30);
  const [searchElapsedSeconds, setSearchElapsedSeconds] = useState<number>(0);

  // In-Game State
  const [timerSeconds, setTimerSeconds] = useState<number>(10);
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
    // Check if user already has an active matchmaking search or in-progress match
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
    // Prevent duplicate transitions
    if (matchTransitionRef.current === matchId) {
      return;
    }
    matchTransitionRef.current = matchId;

    console.log('[LUDO] transitionToMatch matchId=', matchId);

    // Stop searching UI
    setSearching(false);
    setSearchElapsedSeconds(0);

    // Close matchmaking WebSocket
    if (mmWsRef.current) {
      try {
        mmWsRef.current.close();
      } catch {}
      mmWsRef.current = null;
    }

    // Load match and connect game WebSocket
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
            // REST detected match — transition (guard prevents duplicate)
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
  // Load Match State & Connect Game WebSocket
  // -----------------------------------------------------------------
  const loadMatch = async (matchId: string) => {
    try {
      const state = await ludoService.getMatchState(matchId);
      setMatchState(state);
      setTimerSeconds(state.remaining_timer_seconds ?? 10);
      connectWebSocket(matchId);
    } catch (e) {
      console.error('Failed to load match state', e);
      // Reset transition guard so user can retry
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
        } else if (msg.type === 'DICE_ROLLED' && msg.state) {
          setMatchState(msg.state);
          setTimerSeconds(msg.state.remaining_timer_seconds ?? 10);
          soundManager.play('dice_roll');
        } else if (msg.type === 'TOKEN_MOVED' && msg.state) {
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
      // Reconnect after brief pause if match in progress
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
    if (matchState && matchState.status === 'IN_PROGRESS') {
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
  }, [matchState]);

  // Fallback Polling (Sync every 3s)
  useEffect(() => {
    if (matchState && matchState.status === 'IN_PROGRESS') {
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
  }, [matchState?.id, matchState?.status]);

  // -----------------------------------------------------------------
  // FIND MATCH handler — WS-first, then POST
  // -----------------------------------------------------------------
  const handleStartMatchmaking = async (playerCount: number, entryFee: number) => {
    // Reset transition guard
    matchTransitionRef.current = null;

    const token = authStorage.getAccessToken();

    // 1. Connect matchmaking WebSocket FIRST
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

      // Listen for MATCH_FOUND on the matchmaking WebSocket
      mmWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          console.log('[LUDO-MM-WS] Received:', msg.type);
          if (msg.type === 'MATCH_FOUND' && msg.match_id) {
            console.log('[LUDO-MM-WS] MATCH_FOUND match_id=', msg.match_id);
            transitionToMatch(msg.match_id);
          }
        } catch (e) {
          console.error('[LUDO-MM-WS] Parse error', e);
        }
      };

      mmWs.onclose = () => {
        console.log('[LUDO-MM-WS] Matchmaking WS closed');
        mmWsRef.current = null;
      };

    } catch (wsError) {
      // WS failed to connect — fall back to REST-only mode
      console.warn('[LUDO-MM-WS] WS connection failed, using REST fallback only', wsError);
    }

    // 2. ONLY AFTER WS is connected (or failed), call POST /matchmaking/join
    try {
      const res = await ludoService.joinMatchmaking(playerCount, entryFee);
      if (res.status === 'MATCHED' && res.match_id) {
        // Immediate match — transition directly
        transitionToMatch(res.match_id);
      } else if (res.status === 'ALREADY_IN_MATCH' && res.match_id) {
        transitionToMatch(res.match_id);
      } else {
        // SEARCHING — show modal, REST polling starts via useEffect
        setSearching(true);
        setSearchRemainingSeconds(30);
        setSearchElapsedSeconds(0);
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to start matchmaking');
      // Close matchmaking WS on error
      if (mmWsRef.current) {
        mmWsRef.current.close();
        mmWsRef.current = null;
      }
    }
  };

  // -----------------------------------------------------------------
  // Cancel Matchmaking
  // -----------------------------------------------------------------
  const handleCancelMatchmaking = async () => {
    try {
      // Close matchmaking WebSocket
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
    if (!matchState) return;
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
    setMatchState(null);
    matchTransitionRef.current = null;
    refreshWallet();
    navigate('/dashboard');
  };

  const handleReturnToLobby = () => {
    setMatchState(null);
    matchTransitionRef.current = null;
    refreshWallet();
  };

  // Identify Current Player & My Player
  const myPlayer = matchState?.players.find((p) => p.user_id === user?.id);
  const isMyTurn = Boolean(
    myPlayer &&
    matchState?.status === 'IN_PROGRESS' &&
    matchState.current_turn_color === myPlayer.color
  );

  const canRoll = isMyTurn && matchState?.last_dice_roll === null;

  const winnerPlayer = matchState?.players.find((p) => p.rank === 1) || null;
  const isWinnerMe = Boolean(winnerPlayer && myPlayer && winnerPlayer.user_id === myPlayer.user_id);

  return (
    <div
      className="ludo-page-container w-full h-full flex-1 flex flex-col items-center justify-center bg-[#040713] text-white"
      style={{
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        paddingLeft: 'max(var(--safe-left), 8px)',
        paddingRight: 'max(var(--safe-right), 8px)',
        paddingTop: 'max(var(--safe-top), 4px)',
        paddingBottom: 'max(var(--safe-bottom), 8px)',
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

      {/* 2. ACTIVE MATCH VIEW */}
      {matchState && (
        <div className="ludo-active-match w-full max-w-5xl h-full flex flex-col gap-2 items-center justify-between overflow-hidden">
          {/* Header Bar */}
          <div className="ludo-game-header w-full flex items-center justify-between px-3 py-1.5 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-800 shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowExitConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 active:scale-95 border border-slate-700 rounded-xl text-slate-200 text-xs font-bold transition shadow-sm cursor-pointer shrink-0"
                aria-label="Exit Game"
              >
                <ArrowLeft size={16} />
                <span>Exit</span>
              </button>
              <div>
                <h1 className="text-sm sm:text-base font-black text-amber-400 leading-tight">
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
                onClick={() => setShowExitConfirm(true)}
                className="text-xs font-bold px-3 py-1 bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 rounded-lg transition active:scale-95 cursor-pointer"
              >
                Forfeit
              </button>
            </div>
          </div>

          {/* Center Stage: Board & Controls Side Panel */}
          <div className="ludo-board-control-row w-full flex-1 flex flex-row items-center justify-center gap-3 sm:gap-6 overflow-hidden min-h-0">
            {/* Ludo Board */}
            <LudoBoard
              players={matchState.players}
              currentTurnColor={matchState.current_turn_color}
              legalTokenIndices={matchState.legal_token_indices || []}
              onTokenClick={handleMoveToken}
              isMyTurn={isMyTurn}
            />

            {/* Controls Side Panel */}
            <div className="ludo-controls-side-panel flex flex-col items-center justify-center gap-1.5 w-full max-w-[280px] shrink-0 h-full max-h-full overflow-y-auto">
              {/* All Players List */}
              <div className="w-full flex flex-col gap-1">
                {matchState.players.map((p) => (
                  <LudoPlayerPanel
                    key={p.id}
                    player={p}
                    isCurrentTurn={matchState.current_turn_color === p.color}
                    isMe={p.user_id === user?.id}
                  />
                ))}
              </div>

              {/* Dice & Timer Box */}
              <LudoDice
                value={matchState.last_dice_roll}
                isMyTurn={isMyTurn}
                canRoll={canRoll}
                onRoll={handleRollDice}
                timerSeconds={timerSeconds}
                currentTurnColor={matchState.current_turn_color}
              />
            </div>
          </div>

          {/* Winner Modal */}
          {matchState.status === 'COMPLETED' && (
            <LudoWinnerModal
              winnerPlayer={winnerPlayer}
              isMe={isWinnerMe}
              prizePool={matchState.prize_pool}
              onReturnToLobby={handleReturnToLobby}
            />
          )}
        </div>
      )}

      {/* 3. EXIT CONFIRMATION MODAL */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in select-none"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="relative w-full max-w-sm bg-gradient-to-b from-[#1c0836] via-[#120324] to-[#0a0117] border-2 border-amber-500/60 rounded-3xl p-5 sm:p-6 shadow-[0_0_40px_rgba(0,0,0,0.85)] text-white text-center flex flex-col items-center gap-3.5 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning Icon Badge */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-600/30 via-red-900/40 to-slate-900 border-2 border-red-500/50 flex items-center justify-center text-3xl shadow-inner">
              ⚠️
            </div>

            {/* Title & Copy */}
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

            {/* Action Buttons */}
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
