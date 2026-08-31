'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Like useState, but persists the value to localStorage so it
 * survives page refreshes. Works application-wide — just give
 * each piece of state a unique key.
 *
 * Usage:
 *   const [sort, setSort] = usePersistentState('customers-sort', 'due');
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(defaultValue);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        setState(JSON.parse(saved) as T);
      }
    } catch {
      // ignore parse errors or localStorage unavailable
    }
  }, [key]);

  // Save to localStorage whenever state changes
  const setPersistentState = useCallback(
    (value: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [key]
  );

  return [state, setPersistentState];
}
