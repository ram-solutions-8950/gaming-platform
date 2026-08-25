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
  const timeoutClaimedRef = useRef<string | null>(null);
  const turnStartedRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      !match ||
      match.status !== 'IN_PROGRESS' ||
      !match.current_turn_color
    ) {
      setTimeLeft(0);
      timeoutClaimedRef.current = null;
      turnStartedRef.current = null;
      return;
    }

    const turnTimeout = match.turn_timeout_seconds || 30;

    // Start a fresh local timer whenever the backend state/version
    // changes to a new turn.
    const turnKey = `${match.id}-${match.version}-${match.current_turn_color}`;

    turnStartedRef.current = Date.now();
    timeoutClaimedRef.current = null;

    const updateTimer = () => {
      if (turnStartedRef.current === null) {
        return;
      }

      const elapsed = Math.floor(
        (Date.now() - turnStartedRef.current) / 1000
      );

      const remaining = Math.max(0, turnTimeout - elapsed);

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
    match?.version,
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