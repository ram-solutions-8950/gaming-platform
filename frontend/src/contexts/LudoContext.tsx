import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { LudoMatch, WSMessage } from '../types/ludo';
import { ludoService } from '../services/ludo';
import { soundManager } from '../services/soundManager';
import { useAuthStore } from '../store/authStore';
import { getWebSocketUrl } from '../utils/ws';

interface MatchmakingStatus {
  status: string;
  player_count: number;
  entry_fee: number;
  players_found: number;
  players_required?: number;
  match_id?: string;
}

interface LudoContextState {
  match: LudoMatch | null;
  matchmakingStatus: MatchmakingStatus | null;
  connectionStatus: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';
  joinMatchmaking: (playerCount: number, entryFee: number) => Promise<void>;
  cancelMatchmaking: () => Promise<void>;
  rollDice: () => Promise<void>;
  moveToken: (tokenIndex: number) => Promise<void>;
  claimTimeout: () => Promise<void>;
  refreshState: () => Promise<void>;
  error: string | null;
  clearError: () => void;
  closeWebSocket: () => void;
  resetMatch: () => void;
}

const LudoContext = createContext<LudoContextState | null>(null);

export const LudoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [match, setMatch] = useState<LudoMatch | null>(null);
  const [matchmakingStatus, setMatchmakingStatus] = useState<MatchmakingStatus | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<LudoContextState['connectionStatus']>('DISCONNECTED');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRetries = useRef(0);
  const maxRetries = 5;

  // ----- Helper: closeWebSocket -----
  const closeWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('DISCONNECTED');
  }, []);

  // ----- Helper: resetMatch -----
  // ----- Helper: resetMatch -----
  const resetMatch = useCallback(async () => {
    closeWebSocket();
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setMatch(null);
    setMatchmakingStatus(null);
    setError(null);
    setConnectionStatus('DISCONNECTED');
  }, [closeWebSocket]);

  // ----- Refresh current match state -----
  const refreshState = useCallback(async () => {
    if (!match?.id) return;
    try {
      const state = await ludoService.getMatchState(match.id);
      setMatch(state);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to refresh state');
    }
  }, [match?.id]);

  // ----- WebSocket connection -----
  const connectWebSocket = useCallback((matchId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setConnectionStatus('CONNECTING');
    const token = localStorage.getItem('access_token');
    const wsUrl = getWebSocketUrl(`ludo/ws/${matchId}`, token || undefined);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnectionStatus('CONNECTED');
      reconnectRetries.current = 0;
    };
    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        if (['PLAYER_JOINED', 'PLAYER_READY', 'MATCH_STARTED', 'DICE_ROLLED', 'TOKEN_MOVED', 'TURN_TIMEOUT'].includes(msg.type)) {
          refreshState();
        }
      } catch (e) {
        console.error('Failed to parse WS message', e);
      }
    };
    ws.onclose = () => {
      setConnectionStatus('DISCONNECTED');
      if (reconnectRetries.current < maxRetries) {
        reconnectRetries.current += 1;
        setConnectionStatus('RECONNECTING');
        setTimeout(() => connectWebSocket(matchId), 2000 * reconnectRetries.current);
      } else {
        setError('Lost connection to game server.');
      }
    };
    ws.onerror = (e) => {
      console.error('WebSocket error', e);
    };
  }, [refreshState]);

  // ----- Initial load: existing matchmaking or match -----
  useEffect(() => {
    const checkInitialState = async () => {
      try {
        const status = await ludoService.getMatchmakingStatus();
        if (status.status === 'NOT_QUEUED') return;
        setMatchmakingStatus(status);
        if (status.status === 'MATCH_FOUND' && status.match_id) {
          const m = await ludoService.getMatchState(status.match_id);
          setMatch(m);
        }
      } catch {}
    };
    checkInitialState();
  }, []);

  // ----- Poll matchmaking while searching -----
  useEffect(() => {
    if (matchmakingStatus?.status === 'SEARCHING') {
      pollRef.current = setInterval(async () => {
        try {
          const status = await ludoService.getMatchmakingStatus();
          setMatchmakingStatus(status);
          if (status.status === 'MATCH_FOUND' && status.match_id) {
            const m = await ludoService.getMatchState(status.match_id);
            setMatch(m);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } else if (status.status === 'NOT_QUEUED' || status.status === 'CANCELLED') {
            setMatchmakingStatus(null);
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch {}
      }, 2000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [matchmakingStatus?.status]);

  // ----- Auto‑connect websocket for an existing match -----
  useEffect(() => {
    if (match?.id && connectionStatus === 'DISCONNECTED' && reconnectRetries.current === 0) {
      connectWebSocket(match.id);
    }
    // Cleanup on component unmount
    return () => {
      closeWebSocket();
    };
  }, [match?.id, connectionStatus, connectWebSocket, closeWebSocket]);

  // Track match status transitions for completion win/loss
  const lastMatchStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!match || !match.status) return;
    if (match.status !== lastMatchStatusRef.current) {
      if (match.status === 'COMPLETED') {
        const myUserId = useAuthStore.getState().user?.id;
        if (myUserId) {
          const me = match.players?.find((p) => p.user_id === myUserId);
          if (me && me.rank === 1) {
            soundManager.play('win_clap');
          } else if (me && me.rank && me.rank > 1) {
            soundManager.play('loss');
          }
        }
      } else if (match.status === 'IN_PROGRESS') {
        soundManager.play('betting_start');
      }
      lastMatchStatusRef.current = match.status;
    }
  }, [match?.status, match?.players]);

  // ----- API actions -----
  const joinMatchmaking = async (playerCount: number, entryFee: number) => {
    try {
      setError(null);
      const status = await ludoService.joinMatchmaking(playerCount, entryFee);
      soundManager.play('bet_coin');
      setMatchmakingStatus(status);
      if (status.status === 'MATCH_FOUND' && status.match_id) {
        const m = await ludoService.getMatchState(status.match_id);
        setMatch(m);
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to join matchmaking');
    }
  };

  const cancelMatchmaking = async () => {
    try {
      await ludoService.cancelMatchmaking();
      setMatchmakingStatus(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to cancel');
    }
  };

  const rollDice = async () => {
    if (!match) return;
    try {
      setError(null);
      await ludoService.rollDice(match.id);
      soundManager.play('reveal_tick');
      await refreshState();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to roll dice');
    }
  };

  const moveToken = async (tokenIndex: number) => {
    if (!match) return;
    try {
      setError(null);
      await ludoService.moveToken(match.id, tokenIndex);
      soundManager.play('reveal_tick');
      await refreshState();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to move token');
    }
  };

  const claimTimeout = async () => {
    if (!match) return;
    try {
      setError(null);
      await ludoService.claimTimeout(match.id);
      await refreshState();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to claim timeout');
    }
  };

  const clearError = () => setError(null);

  return (
    <LudoContext.Provider
      value={{
        match,
        matchmakingStatus,
        connectionStatus,
        joinMatchmaking,
        cancelMatchmaking,
        rollDice,
        moveToken,
        claimTimeout,
        refreshState,
        error,
        clearError,
        closeWebSocket,
        resetMatch,
      }}
    >
      {children}
    </LudoContext.Provider>
  );
};

export const useLudo = () => {
  const context = useContext(LudoContext);
  if (!context) {
    throw new Error('useLudo must be used within a LudoProvider');
  }
  return context;
};
