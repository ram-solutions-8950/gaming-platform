import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { authStorage } from '../services/authStorage';
import { authService } from '../services/auth';
import type { TeenPattiGameState } from '../services/teenPatti';
import { getWebSocketUrl } from '../utils/ws';

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

  const connect = useCallback(async () => {
    if (!tableId) return;

    let activeToken = authStorage.getAccessToken();
    if (!activeToken) {
      const refreshed = await authService.refreshSession().catch(() => false);
      if (refreshed) {
        activeToken = authStorage.getAccessToken();
      }
    }
    if (!activeToken) return;

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

    ws.onopen = () => {
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
          }
          onEvent?.(msg);
        } else if (msg.type === 'error') {
          if (
            msg.message?.toLowerCase().includes('authentication') ||
            msg.message?.toLowerCase().includes('log in again')
          ) {
            if (!isRefreshingRef.current) {
              isRefreshingRef.current = true;
              const refreshed = await authService.refreshSession().catch(() => false);
              isRefreshingRef.current = false;
              if (refreshed) {
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
      setIsConnected(false);
      setIsConnecting(false);
      if (event.code === 1008) {
        // Attempt one silent refresh if closed due to policy / auth
        if (!isRefreshingRef.current) {
          isRefreshingRef.current = true;
          const refreshed = await authService.refreshSession().catch(() => false);
          isRefreshingRef.current = false;
          if (refreshed) {
            connect();
            return;
          }
        }
        return;
      }
      // Auto-reconnect after 3s if still mounted
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (tableId) {
          connect();
        }
      }, 3000);
    };
  }, [tableId, onEvent, onError]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        try {
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
  const chaal = useCallback(() => sendAction('bet', { raise: false }), [sendAction]);
  const raiseBet = useCallback(() => sendAction('bet', { raise: true }), [sendAction]);
  const pack = useCallback(() => sendAction('pack'), [sendAction]);
  const show = useCallback(() => sendAction('show'), [sendAction]);
  const sideShow = useCallback(() => sendAction('side_show'), [sendAction]);
  const respondSideShow = useCallback((accept: boolean) => sendAction('side_show_respond', { accept }), [sendAction]);
  const startHand = useCallback(() => sendAction('start'), [sendAction]);

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
  };
}
