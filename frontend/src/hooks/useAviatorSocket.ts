import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

export type AviatorPhase = 'BETTING' | 'FLYING' | 'CRASHED' | 'SETTLED' | 'COOLDOWN' | 'DISCONNECTED';

export interface AviatorLiveBet {
  user_id: string;
  slot: number;
  amount: number;
  status: 'ACTIVE' | 'CASHED_OUT' | 'LOST';
  cashout_multiplier?: number | null;
  payout?: number;
  auto_cashout?: number | null;
}

export interface AviatorRoundState {
  round_id: string | null;
  phase: AviatorPhase;
  nonce: number;
  server_seed_hash: string;
  server_seed?: string | null;
  crash_point?: number | null;
  multiplier: number;
  betting_duration: number;
  flight_started_at?: string | null;
  bets: AviatorLiveBet[];
}

export interface UseAviatorSocketOptions {
  onBetAccepted?: (slot: number, amount: number, autoCashout?: number | null) => void;
  onCashoutConfirmed?: (slot: number, multiplier: number, payout: number) => void;
  onCrash?: (crashPoint: number) => void;
  onError?: (error: string) => void;
  onBalanceUpdateNeeded?: () => void;
}

function getAviatorWsUrl(token: string): string {
  const envWs = import.meta.env.VITE_WS_URL;
  const envApi = import.meta.env.VITE_API_URL;

  let wsBase: string;

  if (envWs) {
    wsBase = envWs.replace(/\/+$/, '');
  } else if (envApi && !envApi.includes('trycloudflare.com')) {
    const apiUrl = envApi.replace(/\/+$/, '');
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    wsBase = apiUrl.replace(/^https?:/, wsProto);
  } else {
    const isDevPort = window.location.port === '5173' || window.location.port === '3000' || window.location.port === '5174';
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isLocalhost || isDevPort ? '127.0.0.1:8000' : window.location.host;
    wsBase = `${protocol}//${host}/api/v1`;
  }

  const cleanBase = wsBase.endsWith('/aviator/ws') ? wsBase : `${wsBase}/aviator/ws`;
  return `${cleanBase}?token=${encodeURIComponent(token)}`;
}

export function useAviatorSocket(options: UseAviatorSocketOptions = {}) {
  const user = useAuthStore((state) => state.user);
  const token = localStorage.getItem('access_token');

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const [roundState, setRoundState] = useState<AviatorRoundState>({
    round_id: null,
    phase: 'DISCONNECTED',
    nonce: 0,
    server_seed_hash: '',
    multiplier: 1.0,
    betting_duration: 10.0,
    bets: [],
  });

  const [recentCrashes, setRecentCrashes] = useState<number[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const flightIntervalRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const reconnectAttemptsRef = useRef<number>(0);
  const socketIdRef = useRef<number>(0);

  // Local multiplier interpolation during FLYING phase
  const flightStartTimeRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    console.log('[AVIATOR] Initializing socket connection...');
    console.log('[AVIATOR] token exists:', Boolean(token));

    if (!token) {
      console.warn('[AVIATOR] Connection aborted: No token found in localStorage');
      setConnectionError(true);
      return;
    }

    // Increment socket ID to invalidate callbacks from previous socket instances
    const currentSocketId = ++socketIdRef.current;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    setIsConnecting(true);

    const wsUrl = getAviatorWsUrl(token);
    const sanitizedUrl = wsUrl.replace(/token=([^&]+)/, 'token=***');
    console.log('[AVIATOR] WS URL generated (socket #' + currentSocketId + '):', sanitizedUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      console.log('[AVIATOR] WS OPENED successfully (socket #' + currentSocketId + ')');
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (evt) => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      // Clear connection error on receiving any valid server message
      setConnectionError(false);
      console.log('[AVIATOR] WS MESSAGE:', evt.data);
      try {
        const msg = JSON.parse(evt.data);
        const { type } = msg;

        if (type === 'sync') {
          const phase = (msg.phase || 'BETTING') as AviatorPhase;
          setRoundState({
            round_id: msg.round_id || null,
            phase,
            nonce: msg.nonce || 0,
            server_seed_hash: msg.server_seed_hash || '',
            server_seed: msg.server_seed,
            crash_point: msg.crash_point,
            multiplier: msg.multiplier || 1.0,
            betting_duration: 10.0,
            flight_started_at: msg.flight_started_at,
            bets: msg.bets || [],
          });
          if (phase === 'FLYING' && msg.flight_started_at) {
            flightStartTimeRef.current = new Date(msg.flight_started_at).getTime();
          } else {
            flightStartTimeRef.current = null;
          }
        } else if (type === 'round_start') {
          flightStartTimeRef.current = null;
          setRoundState({
            round_id: msg.round_id,
            phase: 'BETTING',
            nonce: msg.nonce,
            server_seed_hash: msg.server_seed_hash,
            server_seed: null,
            crash_point: null,
            multiplier: 1.0,
            betting_duration: msg.betting_duration || 10.0,
            flight_started_at: null,
            bets: [],
          });
        } else if (type === 'flight_start') {
          flightStartTimeRef.current = new Date(msg.flight_started_at || msg.timestamp).getTime();
          setRoundState((prev) => ({
            ...prev,
            round_id: msg.round_id,
            phase: 'FLYING',
            multiplier: 1.0,
            flight_started_at: msg.flight_started_at || msg.timestamp,
          }));
        } else if (type === 'multiplier_update') {
          setRoundState((prev) => ({
            ...prev,
            multiplier: msg.multiplier,
          }));
        } else if (type === 'cashout_broadcast') {
          setRoundState((prev) => {
            const exists = prev.bets.some(
              (b) => b.user_id === msg.user_id && b.slot === msg.slot
            );
            const updatedBets = exists
              ? prev.bets.map((b) =>
                  b.user_id === msg.user_id && b.slot === msg.slot
                    ? {
                        ...b,
                        status: 'CASHED_OUT' as const,
                        cashout_multiplier: msg.multiplier,
                        payout: msg.payout,
                      }
                    : b
                )
              : [
                  ...prev.bets,
                  {
                    user_id: msg.user_id,
                    slot: msg.slot,
                    amount: 0,
                    status: 'CASHED_OUT' as const,
                    cashout_multiplier: msg.multiplier,
                    payout: msg.payout,
                  },
                ];
            return { ...prev, bets: updatedBets };
          });
          if (user && msg.user_id === user.id) {
            options.onBalanceUpdateNeeded?.();
          }
        } else if (type === 'crash') {
          flightStartTimeRef.current = null;
          const crashPoint = msg.crash_point || 1.0;
          setRoundState((prev) => ({
            ...prev,
            phase: 'CRASHED',
            crash_point: crashPoint,
            server_seed: msg.server_seed,
            multiplier: crashPoint,
            bets: prev.bets.map((b) =>
              b.status === 'ACTIVE' ? { ...b, status: 'LOST' as const } : b
            ),
          }));
          setRecentCrashes((prev) => [crashPoint, ...prev.slice(0, 19)]);
          options.onCrash?.(crashPoint);
          options.onBalanceUpdateNeeded?.();
        } else if (type === 'settled') {
          flightStartTimeRef.current = null;
          setRoundState((prev) => ({
            ...prev,
            phase: 'SETTLED',
            crash_point: msg.crash_point,
          }));
          options.onBalanceUpdateNeeded?.();
        } else if (type === 'bet_accepted') {
          options.onBetAccepted?.(msg.slot, msg.amount, msg.auto_cashout);
          options.onBalanceUpdateNeeded?.();
        } else if (type === 'cashout_confirmed') {
          options.onCashoutConfirmed?.(msg.slot, msg.multiplier, msg.payout);
          options.onBalanceUpdateNeeded?.();
        } else if (type === 'new_bet') {
          setRoundState((prev) => {
            const exists = prev.bets.some(
              (b) => b.user_id === msg.user_id && b.slot === msg.slot
            );
            if (exists) return prev;
            return {
              ...prev,
              bets: [
                ...prev.bets,
                {
                  user_id: msg.user_id,
                  slot: msg.slot,
                  amount: msg.amount,
                  status: 'ACTIVE',
                },
              ],
            };
          });
        } else if (type === 'error') {
          options.onError?.(msg.message);
        }
      } catch (e) {
        console.error('Error parsing Aviator WS message:', e);
      }
    };

    ws.onerror = (evt) => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      console.error('[AVIATOR] WS ERROR event (socket #' + currentSocketId + '):', evt);
    };

    ws.onclose = (evt) => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      console.warn('[AVIATOR] WS CLOSED (socket #' + currentSocketId + ') code:', evt.code, 'reason:', evt.reason, 'wasClean:', evt.wasClean);
      setIsConnected(false);
      setIsConnecting(false);
      setRoundState((prev) => ({ ...prev, phase: 'DISCONNECTED' }));
      flightStartTimeRef.current = null;

      // Only flag connection error after multiple failed reconnect attempts
      if (reconnectAttemptsRef.current >= 3) {
        setConnectionError(true);
      }

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 8000);
      reconnectAttemptsRef.current += 1;
      console.log(`[AVIATOR] Scheduling reconnect attempt #${reconnectAttemptsRef.current} in ${delay}ms`);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect();
        }
      }, delay);
    };
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (flightIntervalRef.current) clearInterval(flightIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        try {
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Smooth client-side multiplier curve interpolation when FLYING
  useEffect(() => {
    if (roundState.phase !== 'FLYING') {
      if (flightIntervalRef.current) {
        clearInterval(flightIntervalRef.current);
        flightIntervalRef.current = null;
      }
      return;
    }

    flightIntervalRef.current = setInterval(() => {
      if (!flightStartTimeRef.current) return;
      const elapsedSec = (Date.now() - flightStartTimeRef.current) / 1000;
      if (elapsedSec > 0) {
        const estMult = Math.exp(elapsedSec * 0.1);
        setRoundState((prev) => {
          if (prev.phase !== 'FLYING') return prev;
          // Keep highest or close to estimate
          return {
            ...prev,
            multiplier: Math.max(prev.multiplier, Math.floor(estMult * 100) / 100),
          };
        });
      }
    }, 50);

    return () => {
      if (flightIntervalRef.current) {
        clearInterval(flightIntervalRef.current);
        flightIntervalRef.current = null;
      }
    };
  }, [roundState.phase]);

  const sendAction = useCallback((action: string, payload: Record<string, any> = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      options.onError?.('Not connected to game server');
      return;
    }
    const action_id = `av_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    wsRef.current.send(JSON.stringify({ action, action_id, ...payload }));
  }, []);

  const placeBet = useCallback(
    (slot: 1 | 2, amountPaise: number, autoCashout?: number | null) => {
      sendAction('place_bet', {
        slot,
        amount: amountPaise,
        auto_cashout: autoCashout && autoCashout >= 1.01 ? autoCashout : null,
      });
    },
    [sendAction]
  );

  const cashout = useCallback(
    (slot: 1 | 2) => {
      sendAction('cashout', { slot });
    },
    [sendAction]
  );

  const sync = useCallback(() => {
    sendAction('sync');
  }, [sendAction]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    roundState,
    recentCrashes,
    currentUserId: user?.id || null,
    placeBet,
    cashout,
    sync,
  };
}

