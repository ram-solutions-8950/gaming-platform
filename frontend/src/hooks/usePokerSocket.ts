import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { getWebSocketUrl } from '../utils/ws';

export interface PokerPlayerInfo {
  user_id: string;
  username: string;
  seat_index: number;
  stack: number;
  current_bet: number;
  total_bet_in_hand: number;
  is_folded: boolean;
  is_all_in: boolean;
  is_sitting_out: boolean;
  is_bot: boolean;
  last_action?: string | null;
  hole_cards?: string[] | null;
}

export interface PokerTableState {
  table_id: string;
  is_practice: boolean;
  small_blind: number;
  big_blind: number;
  max_players: number;
  phase: string;  // WAITING, PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN, SETTLEMENT
  hand_id?: string | null;
  dealer_seat_idx: number;
  current_turn_seat_idx?: number | null;
  current_high_bet: number;
  min_raise_amount: number;
  pot: number;
  community_cards: string[];
  players: PokerPlayerInfo[];
  winners_summary?: any[];
  turn_start_time?: number;
  turn_duration?: number;
}

export interface UsePokerSocketOptions {
  tableId: string;
  onHandStart?: () => void;
  onShowdown?: (winners: any[]) => void;
  onError?: (err: string) => void;
}

function getPokerWsUrl(tableId: string, token: string): string {
  return getWebSocketUrl(`poker/ws/${tableId}`, token);
}

export function usePokerSocket(options: UsePokerSocketOptions) {
  const user = useAuthStore((state) => state.user);
  const token = localStorage.getItem('access_token');

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [myHoleCards, setMyHoleCards] = useState<string[]>([]);

  const [tableState, setTableState] = useState<PokerTableState>({
    table_id: options.tableId,
    is_practice: false,
    small_blind: 100,
    big_blind: 200,
    max_players: 6,
    phase: 'WAITING',
    dealer_seat_idx: 0,
    current_high_bet: 0,
    min_raise_amount: 200,
    pot: 0,
    community_cards: [],
    players: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const reconnectAttemptsRef = useRef<number>(0);
  const socketIdRef = useRef<number>(0);

  const connect = useCallback(() => {
    if (!token || !options.tableId) {
      setConnectionError(true);
      return;
    }

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
    const wsUrl = getPokerWsUrl(options.tableId, token);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(false);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (evt) => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      setConnectionError(false);
      try {
        const msg = JSON.parse(evt.data);
        const { type } = msg;

        if (type === 'table_state' || type === 'sync') {
          const s: PokerTableState = msg.state;
          setTableState(s);
          // If my player has hole_cards inside public state, store them
          if (user) {
            const me = s.players?.find((p) => p.user_id === user.id);
            if (me && me.hole_cards && me.hole_cards.length === 2) {
              setMyHoleCards(me.hole_cards);
            }
          }
          if (s.phase === 'SHOWDOWN' && s.winners_summary) {
            options.onShowdown?.(s.winners_summary);
          }
        } else if (type === 'hole_cards') {
          // Private event delivered strictly to this client
          setMyHoleCards(msg.hole_cards || []);
          options.onHandStart?.();
        } else if (type === 'error') {
          options.onError?.(msg.message);
        }
      } catch (e) {
        console.error('Error parsing Poker WS message:', e);
      }
    };

    ws.onerror = (evt) => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      console.error('[POKER WS ERROR]', evt);
    };

    ws.onclose = () => {
      if (!isMountedRef.current || socketIdRef.current !== currentSocketId) return;
      setIsConnected(false);
      setIsConnecting(false);
      if (reconnectAttemptsRef.current >= 3) {
        setConnectionError(true);
      }

      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 6000);
      reconnectAttemptsRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect();
        }
      }, delay);
    };
  }, [token, options.tableId]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
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

  const sendAction = useCallback((action: string, amount: number = 0) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      options.onError?.('Not connected to game server');
      return;
    }
    const action_id = `pk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    wsRef.current.send(JSON.stringify({ action, amount, action_id }));
  }, []);

  const startHand = useCallback(() => {
    sendAction('start_hand');
  }, [sendAction]);

  const sync = useCallback(() => {
    sendAction('sync');
  }, [sendAction]);

  return {
    isConnected,
    isConnecting,
    connectionError,
    tableState,
    myHoleCards,
    currentUserId: user?.id || null,
    sendAction,
    startHand,
    sync,
  };
}
