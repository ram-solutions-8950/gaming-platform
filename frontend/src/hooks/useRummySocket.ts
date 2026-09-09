import { useCallback, useEffect, useRef, useState } from "react";
import { getWebSocketUrl } from "../utils/ws";
import { authStorage } from "../services/authStorage";
import { authService } from "../services/auth";
import type {
  ClientAction,
  ServerMessage,
  TableState,
} from "../types/rummy";

/**
 * Connects to the Rummy game WebSocket for a table and exposes the live table state,
 * this player's private hand, and a `send` function for intents. Automatically
 * reconnects with backoff and auto-refreshes tokens if expired.
 */
export function useRummySocket(tableId: string, token: string | null) {
  const [state, setState] = useState<TableState | null>(null);
  const [hand, setHand] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const connect = useCallback(async () => {
    if (!tableId || closedRef.current) return;
    let activeToken = authStorage.getAccessToken() || token;
    if (!activeToken) {
      // Attempt silent session recovery
      const refreshed = await authService.refreshSession().catch(() => false);
      if (refreshed) {
        activeToken = authStorage.getAccessToken();
      }
    }
    if (!activeToken) {
      setLastError("Authentication required. Please log in again.");
      return;
    }

    try {
      wsRef.current?.close();
    } catch {}

    const url = getWebSocketUrl(`rummy/ws/game/${tableId}`, activeToken);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLastError(null);
      retryRef.current = 0;
      ws.send(JSON.stringify({ action: "sync" } as ClientAction));
    };
    ws.onmessage = async (ev) => {
      try {
        const msg: ServerMessage = JSON.parse(ev.data);
        if (msg.type === "state") setState(msg.state);
        else if (msg.type === "hand") setHand(msg.cards);
        else if (msg.type === "error") {
          if (
            (msg as any).code === "AUTH_REQUIRED" ||
            msg.message?.toLowerCase().includes("authentication") ||
            msg.message?.toLowerCase().includes("log in again")
          ) {
            if (!isRefreshingRef.current) {
              isRefreshingRef.current = true;
              const refreshed = await authService.refreshSession().catch(() => false);
              isRefreshingRef.current = false;
              if (refreshed) {
                setLastError(null);
                connect();
                return;
              }
            }
          }
          setLastError(msg.message);
        }
      } catch (e) {
        console.error("Failed to parse rummy ws message", e);
      }
    };
    ws.onclose = async () => {
      setConnected(false);
      if (closedRef.current) return;
      const delay = Math.min(1000 * 2 ** retryRef.current, 8000);
      retryRef.current += 1;
      setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
  }, [tableId, token]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((action: ClientAction) => {
    const action_id = action.action === "sync" ? undefined : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
    wsRef.current?.send(JSON.stringify({ ...action, action_id }));
  }, []);

  return { state, hand, connected, lastError, send };
}
