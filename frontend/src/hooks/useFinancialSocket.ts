import { useEffect, useRef, useCallback } from 'react';
import { authStorage } from '../services/authStorage';
import { getWebSocketUrl } from '../utils/ws';

export type FinancialChannel =
  | 'user_deposits'
  | 'user_withdrawals'
  | 'admin_deposits'
  | 'admin_withdrawals';

export interface UseFinancialSocketOptions {
  channel: FinancialChannel;
  onMessage: (data: any) => void;
  enabled?: boolean;
}

const CHANNEL_PATHS: Record<FinancialChannel, string> = {
  user_deposits: 'ws/user/deposits',
  user_withdrawals: 'ws/user/withdrawals',
  admin_deposits: 'ws/admin/deposits',
  admin_withdrawals: 'ws/admin/withdrawals',
};

/**
 * Real-time WebSocket hook dedicated strictly to the 4 financial views:
 * 1. User Deposit
 * 2. User Withdrawal
 * 3. Admin Deposits
 * 4. Admin Withdrawals
 *
 * Automatically opens the connection on mount and unconditionally cleans up on unmount
 * to eliminate unnecessary server load.
 */
export function useFinancialSocket({
  channel,
  onMessage,
  enabled = true,
}: UseFinancialSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const onMessageRef = useRef(onMessage);

  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!isMountedRef.current || !enabled) return;

    const token = authStorage.getAccessToken();
    if (!token) return;

    const path = CHANNEL_PATHS[channel];
    const url = getWebSocketUrl(path, token);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }

        // Start periodic ping keepalive
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'pong' || data.type === 'connected') return;
          onMessageRef.current(data);
        } catch (err) {
          console.warn('[Financial WS] Error parsing message:', err);
        }
      };

      ws.onclose = () => {
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (!isMountedRef.current || !enabled) return;

        // Reconnect after brief delay
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && enabled) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = (err) => {
        console.warn(`[Financial WS] ${channel} error:`, err);
        try {
          ws.close();
        } catch {}
      };
    } catch (err) {
      console.warn(`[Financial WS] Failed to initialize connection for ${channel}:`, err);
    }
  }, [channel, enabled]);

  useEffect(() => {
    isMountedRef.current = true;
    if (enabled) {
      connect();
    }

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {}
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);
}
