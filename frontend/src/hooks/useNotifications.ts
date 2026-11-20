/**
 * Player notification inbox: state, live delivery and read actions.
 *
 * The HTTP inbox is the source of truth; the websocket only delivers
 * notifications that arrive while the app is open, so a dropped socket
 * costs a popup, never a notification. A slow poll backs the socket up for
 * exactly that case.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  notificationService,
  type PlayerNotification,
} from '../services/notificationService';
import { authStorage } from '../services/authStorage';
import { getWebSocketUrl } from '../utils/ws';

/** Safety net behind the websocket, not the primary delivery path. */
const POLL_INTERVAL_MS = 120_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

export function useNotifications(enabled = true) {
  const [items, setItems] = useState<PlayerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  /** The most recent live arrival, for showing a toast exactly once. */
  const [liveArrival, setLiveArrival] = useState<PlayerNotification | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  // Guards against setting state after unmount, and against a reconnect
  // timer firing once the hook has been disabled (e.g. on logout).
  const activeRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const inbox = await notificationService.getInbox();
      if (!activeRef.current) return;
      setItems(inbox.items || []);
      setUnreadCount(inbox.unread_count || 0);
    } catch {
      // Keep whatever is already on screen: an inbox that empties itself on
      // a transient network error looks like lost notifications.
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [enabled]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic: the badge should respond to the tap immediately.
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const serverCount = await notificationService.markRead(id);
      if (activeRef.current) setUnreadCount(serverCount);
    } catch {
      // Re-sync rather than leave the optimistic value if the write failed.
      refresh();
    }
  }, [refresh]);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      const serverCount = await notificationService.markAllRead();
      if (activeRef.current) setUnreadCount(serverCount);
    } catch {
      refresh();
    }
  }, [refresh]);

  const dismissLiveArrival = useCallback(() => setLiveArrival(null), []);

  // --- live socket -------------------------------------------------------
  useEffect(() => {
    activeRef.current = true;
    if (!enabled) return undefined;

    const clearReconnect = () => {
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    const connect = () => {
      if (!activeRef.current) return;
      const token = authStorage.getAccessToken();
      if (!token) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(getWebSocketUrl('ws/user/notifications', token));
      } catch {
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        attemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        if (!activeRef.current) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type !== 'notification' || !payload.notification) return;
          const incoming: PlayerNotification = payload.notification;

          setItems((prev) =>
            // The socket can repeat a notification across a reconnect, and a
            // duplicate in the list would also double the badge.
            prev.some((n) => n.id === incoming.id)
              ? prev
              : [{ ...incoming, is_read: false }, ...prev],
          );
          setUnreadCount((c) => c + 1);
          setLiveArrival(incoming);
        } catch {
          // Ignore unparseable frames rather than tearing down the socket.
        }
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!activeRef.current) return;
        // Exponential backoff, so a backend restart does not get hammered by
        // every connected player at once.
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** attemptsRef.current,
          RECONNECT_MAX_MS,
        );
        attemptsRef.current += 1;
        clearReconnect();
        reconnectRef.current = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* onclose handles the retry */
        }
      };
    };

    refresh();
    connect();

    const poll = window.setInterval(refresh, POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      window.clearInterval(poll);
      clearReconnect();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        // Detach first: onclose would otherwise schedule a reconnect for a
        // hook that is going away.
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        try {
          socket.close();
        } catch {
          /* already closing */
        }
      }
    };
  }, [enabled, refresh]);

  return {
    items,
    unreadCount,
    loading,
    liveArrival,
    dismissLiveArrival,
    refresh,
    markRead,
    markAllRead,
  };
}
