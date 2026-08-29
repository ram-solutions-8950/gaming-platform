import React, { useEffect, useRef, useState } from 'react';
import { useLudo } from '../../contexts/LudoContext';
import { useAuthStore } from '../../store/authStore';

const ACCENT: Record<string, string> = {
  RED: '#e53935',
  GREEN: '#43a047',
  YELLOW: '#fdd835',
  BLUE: '#1e88e5',
};

export const LudoTurnIndicator: React.FC = () => {
  const { match, claimTimeout } = useLudo();
  const { user } = useAuthStore();

  const [timeLeft, setTimeLeft] = useState(0);

  // Track which turn we already claimed timeout for,
  // keyed by the server's turn_started_at so we don't
  // re-claim when refreshState() causes a re-render
  // without actually changing the turn.
  const timeoutClaimedRef = useRef<string | null>(null);

  // Track the last turn_started_at we anchored to,
  // so we only recalculate the anchor when the server
  // actually starts a new turn.
  const lastTurnStartedAtRef = useRef<string | null>(null);

  // The local Date.now() corresponding to when we
  // received the server's turn_started_at. We use this
  // to compute elapsed time without clock drift issues.
  const anchorLocalTimeRef = useRef<number>(0);

  // The server-reported elapsed seconds at anchor time.
  const serverElapsedAtAnchorRef = useRef<number>(0);

  useEffect(() => {
    if (
      !match ||
      match.status !== 'IN_PROGRESS' ||
      !match.current_turn_color ||
      !match.turn_started_at
    ) {
      setTimeLeft(0);
      timeoutClaimedRef.current = null;
      lastTurnStartedAtRef.current = null;
      return;
    }

    const turnTimeout = match.turn_timeout_seconds || 30;

    // Only re-anchor when the server's turn_started_at
    // actually changes (i.e., a new turn started).
    if (match.turn_started_at !== lastTurnStartedAtRef.current) {
      lastTurnStartedAtRef.current = match.turn_started_at;
      anchorLocalTimeRef.current = Date.now();
      timeoutClaimedRef.current = null;

      // Calculate how much time the server says has already
      // elapsed. This handles the case where we receive
      // the state mid-turn (e.g., page reload, reconnect).
      const serverTurnStart = new Date(match.turn_started_at).getTime();
      const serverNow = Date.now(); // approximate, but close enough for display
      serverElapsedAtAnchorRef.current = Math.max(
        0,
        Math.floor((serverNow - serverTurnStart) / 1000)
      );
    }

    // Stable key for this specific turn, based on
    // the server's turn_started_at (not version, which
    // can change without turn change).
    const turnKey = `${match.id}-${match.turn_started_at}`;

    const updateTimer = () => {
      // Seconds elapsed since we anchored
      const localElapsed = Math.floor(
        (Date.now() - anchorLocalTimeRef.current) / 1000
      );

      // Total elapsed = server elapsed at anchor + local elapsed since anchor
      const totalElapsed = serverElapsedAtAnchorRef.current + localElapsed;
      const remaining = Math.max(0, turnTimeout - totalElapsed);

      setTimeLeft(remaining);

      if (
        remaining === 0 &&
        timeoutClaimedRef.current !== turnKey
      ) {
        timeoutClaimedRef.current = turnKey;

        claimTimeout().catch((error) => {
          console.debug('Ludo timeout claim failed:', error);
        });
      }
    };

    updateTimer();

    const interval = window.setInterval(updateTimer, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    match?.id,
    match?.turn_started_at,
    match?.current_turn_color,
    match?.turn_timeout_seconds,
    match?.status,
    claimTimeout,
  ]);

  if (
    !match ||
    match.status !== 'IN_PROGRESS' ||
    !match.current_turn_color
  ) {
    return null;
  }

  const me = match.players.find(
    (player) => player.user_id === user?.id
  );

  const isMyTurn =
    me?.color === match.current_turn_color;

  const color = ACCENT[match.current_turn_color];

  return (
    <div className="flex justify-center py-2 sm:py-3">
      <div className="inline-flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 ring-1 ring-white/15 backdrop-blur-sm">
        <span
          className="h-3 w-3 animate-pulse rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 10px ${color}`,
          }}
        />

        {isMyTurn ? (
          <span className="text-sm font-black uppercase tracking-wider text-white">
            Your turn ({timeLeft}s)
          </span>
        ) : (
          <span className="text-sm font-black uppercase tracking-wider text-white">
            <span style={{ color }}>
              {match.current_turn_color}
            </span>

            <span className="ml-1 font-semibold text-white/70">
              is playing ({timeLeft}s)
            </span>
          </span>
        )}
      </div>
    </div>
  );
};