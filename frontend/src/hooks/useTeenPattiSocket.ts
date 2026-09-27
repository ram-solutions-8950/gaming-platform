import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { authStorage } from '../services/authStorage';
import { authService } from '../services/auth';
import type { TeenPattiGameState } from '../services/teenPatti';
import { getWebSocketUrl } from '../utils/ws';
import { isInsufficientBalanceMessage, showInsufficientBalance } from '../store/insufficientBalanceStore';

export interface UseTeenPattiSocketOptions {
  tableId: string | null;
  onEvent?: (event: any) => void;
  onError?: (error: string) => void;
}

export function useTeenPattiSocket({ tableId, onEvent, onError }: UseTeenPattiSocketOptions) {
  const user = useAuthStore((state) => state.user);
  const [gameState, setGameState] = useState<TeenPattiGameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingSideShow, setPendingSideShow] = useState<{ requester: string; target: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isRefreshingRef = useRef(false);
  const isMountedRef = useRef(true);
  const intentionalLeaveRef = useRef(false);

  const connect = useCallback(async () => {
    if (!tableId || !isMountedRef.current || intentionalLeaveRef.current) return;

    let activeToken = authStorage.getAccessToken();
    if (!activeToken) {
      const refreshed = await authService.refreshSession().catch(() => false);
      if (refreshed) {
        activeToken = authStorage.getAccessToken();
      }
    }
    if (!activeToken || !isMountedRef.current || intentionalLeaveRef.current) return;

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    setIsConnecting(true);
    setErrorMessage(null);

    const wsUrl = getWebSocketUrl(`ws/teen-patti/${tableId}`, activeToken);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    // Why the server turned this connection away, when it said so before closing it.
    let rejectedFor: string | null = null;

    ws.onopen = () => {
      if (!isMountedRef.current || intentionalLeaveRef.current) {
        try { ws.close(); } catch (e) {}
        return;
      }
      setIsConnected(true);
      setIsConnecting(false);
    };

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'state') {
          setGameState(msg.state);
        } else if (msg.type === 'event') {
          if (msg.event === 'side_show_request' || msg.event === 'side_show_pending') {
            setPendingSideShow({ requester: msg.requester, target: msg.target });
          } else if (msg.event === 'side_show_result') {
            setPendingSideShow(null);
          } else if (msg.event === 'hand_over') {
            setPendingSideShow(null);
          } else if (msg.event === 'table_closed') {
            intentionalLeaveRef.current = true;
          }
          onEvent?.(msg);
        } else if (msg.type === 'error') {
          rejectedFor = msg.message ?? '';
          if (isInsufficientBalanceMessage(msg.message)) showInsufficientBalance();
          if (
            msg.message?.toLowerCase().includes('authentication') ||
            msg.message?.toLowerCase().includes('log in again')
          ) {
            if (!isRefreshingRef.current) {
              isRefreshingRef.current = true;
              const refreshed = await authService.refreshSession().catch(() => false);
              isRefreshingRef.current = false;
              if (refreshed && isMountedRef.current && !intentionalLeaveRef.current) {
                setErrorMessage(null);
                connect();
                return;
              }
            }
          }
          setErrorMessage(msg.message);
          onError?.(msg.message);
        }
      } catch (e) {
        console.error('Error parsing TP WS message:', e);
      }
    };

    ws.onerror = () => {
      onError?.('WebSocket connection encountered an error');
    };

    ws.onclose = async (event: CloseEvent) => {
      // A socket this hook has since replaced or shut: reconnecting for it would
      // replace the live one, whose close would reconnect again, and so on.
      if (wsRef.current !== ws) return;
      setIsConnected(false);
      setIsConnecting(false);

      if (!isMountedRef.current || intentionalLeaveRef.current) {
        return;
      }

      if (event.code === 1008) {
        // Turned away by the server, which said why (it's on screen): a table
        // that has ended or is full, a hand already under way, too little
        // balance. Every retry would be turned away too. A rejected login is
        // refreshed and retried by the error handler above.
        if (rejectedFor !== null) return;
        // Turned away without a word: one silent refresh, in case it was the login.
        if (!isRefreshingRef.current) {
          isRefreshingRef.current = true;
          const refreshed = await authService.refreshSession().catch(() => false);
          isRefreshingRef.current = false;
          if (refreshed && isMountedRef.current && !intentionalLeaveRef.current) {
            connect();
            return;
          }
        }
        return;
      }
      // Auto-reconnect after 3s only if still mounted and not leaving
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (tableId && isMountedRef.current && !intentionalLeaveRef.current) {
          connect();
        }
      }, 3000);
    };
  }, [tableId, onEvent, onError]);

  useEffect(() => {
    isMountedRef.current = true;
    intentionalLeaveRef.current = false;
    connect();
    return () => {
      isMountedRef.current = false;
      intentionalLeaveRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          if (wsRef.current.readyState === WebSocket.OPEN) {
            const action_id = `tp_leave_${Date.now()}`;
            wsRef.current.send(JSON.stringify({ action: 'leave', action_id }));
          }
          wsRef.current.close();
        } catch (e) {}
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendAction = useCallback((action: string, payload: Record<string, any> = {}) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const action_id = `tp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    wsRef.current.send(JSON.stringify({ action, action_id, ...payload }));
  }, []);

  const seeCards = useCallback(() => sendAction('see'), [sendAction]);
  const chaal = useCallback((amount?: number) => sendAction('bet', { raise: false, ...(amount ? { amount } : {}) }), [sendAction]);
  const raiseBet = useCallback(() => sendAction('bet', { raise: true }), [sendAction]);
  const pack = useCallback(() => sendAction('pack'), [sendAction]);
  const show = useCallback(() => sendAction('show'), [sendAction]);
  const sideShow = useCallback(() => sendAction('side_show'), [sendAction]);
  const respondSideShow = useCallback((accept: boolean) => sendAction('side_show_respond', { accept }), [sendAction]);
  const startHand = useCallback(() => sendAction('start'), [sendAction]);
  const leaveTable = useCallback(() => {
    intentionalLeaveRef.current = true;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    sendAction('leave');
  }, [sendAction]);
  const syncState = useCallback(() => sendAction('sync'), [sendAction]);

  return {
    gameState,
    isConnected,
    isConnecting,
    pendingSideShow,
    errorMessage,
    currentUserId: user?.id || null,
    seeCards,
    chaal,
    raiseBet,
    pack,
    show,
    sideShow,
    respondSideShow,
    startHand,
    leaveTable,
    syncState,
  };
}
