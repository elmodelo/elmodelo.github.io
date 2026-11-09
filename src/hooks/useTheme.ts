import { useEffect, useState } from 'react';
import { readStored } from '../lib/storage';
import { usePersistedState } from './usePersistedState';

export type Theme = 'light' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dark'];
const STORAGE_KEY = 'theme';

function getSystemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function isTheme(value: unknown): value is Theme | null {
  return value === null || THEMES.some((theme) => theme === value);
}

export function useTheme(userId?: string | null) {
  const [storedTheme, setTheme] = usePersistedState<Theme | null>(
    STORAGE_KEY, !userId ? readStored(STORAGE_KEY, THEMES) : null, isTheme, userId,
  );
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme = storedTheme ?? systemTheme;

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', updateSystemTheme);
    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, []);

  return { theme, setTheme };
}
