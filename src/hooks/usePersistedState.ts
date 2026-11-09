import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { preferenceKey, readStoredData, writeStoredData } from '../lib/storage';

/** Validated browser preferences, isolated by user (or guest before sign-in). */
export function usePersistedState<T>(
  name: string,
  fallback: T,
  validate: (value: unknown) => value is T,
  userId?: string | null,
) {
  const key = preferenceKey(name, userId);
  const [state, setState] = useState(() => ({
    key,
    value: readStoredData(key, fallback, validate),
  }));

  // Reload on an account change before rendering or persisting that account's settings.
  if (state.key !== key) {
    setState({ key, value: readStoredData(key, fallback, validate) });
  }

  useEffect(() => {
    if (state.key === key) writeStoredData(key, state.value);
  }, [key, state]);

  const setValue = useCallback((next: SetStateAction<T>) => {
    setState((previous) => {
      const value = previous.key === key ? previous.value : readStoredData(key, fallback, validate);
      return { key, value: typeof next === 'function' ? (next as (value: T) => T)(value) : next };
    });
  }, [key, fallback, validate]);

  return [state.value, setValue] as const;
}
