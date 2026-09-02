'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Like useState, but persists the value to localStorage so it
 * survives page refreshes. Works application-wide — just give
 * each piece of state a unique key.
 *
 * Usage:
 *   const [sort, setSort] = usePersistentState('customers-sort', 'due');
 *
 * Optional `validate` function: called with the loaded value before
 * setting state. Return a transformed value (e.g. to reject stale data)
 * or return the value as-is. Useful for date-rollover logic.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
  validate?: (loaded: T) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);
  const hydratedRef = useRef(false);

  // Load from localStorage on mount (client-only, after hydration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        let parsed = JSON.parse(saved) as T;
        if (validate) parsed = validate(parsed);
        setState(parsed);
      }
    } catch {
      // ignore parse errors or localStorage unavailable
    }
    hydratedRef.current = true;
  }, [key]);

  // Save to localStorage whenever state changes — but only after hydration
  // to avoid overwriting saved data with the default value
  const setPersistentState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        if (hydratedRef.current) {
          try {
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
        return next;
      });
    },
    [key]
  );

  return [state, setPersistentState];
}
