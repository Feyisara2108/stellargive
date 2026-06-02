import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` has elapsed
 * without further changes, so rapidly-changing inputs (e.g. a search box)
 * don't trigger work on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
