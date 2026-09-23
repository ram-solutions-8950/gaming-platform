import { useCallback, useRef, useState } from 'react';

/** Keep the indicator on screen long enough to be seen on a fast response. */
const MIN_VISIBLE_MS = 450;

/**
 * Drives the "Refreshing…" state of a manual refresh button.
 *
 * A local API answers in a few milliseconds, so a spinner tied straight to the
 * request lifetime appeared and vanished within one frame — the page did reload
 * its data, but nothing on screen said so. Holding the state for a short floor
 * makes the refresh visible, and an in-flight guard keeps repeated clicks from
 * stacking up requests.
 */
export function useRefreshIndicator(minVisibleMs = MIN_VISIBLE_MS) {
  const [refreshing, setRefreshing] = useState(false);
  const inFlight = useRef(false);

  const runRefresh = useCallback(
    async (task: () => unknown | Promise<unknown>) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRefreshing(true);
      try {
        await Promise.all([
          (async () => task())(),
          new Promise((resolve) => setTimeout(resolve, minVisibleMs)),
        ]);
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    },
    [minVisibleMs],
  );

  return { refreshing, runRefresh };
}
