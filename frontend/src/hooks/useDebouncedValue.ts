import { useEffect, useState } from 'react';

/**
 * Trail `value` by `delayMs`, so a search box fires one request per pause in
 * typing instead of one per keystroke. Without it, responses for earlier
 * prefixes can land after later ones and leave the table showing results that
 * do not match what is in the box.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
