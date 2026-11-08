import { useCallback, useEffect, useState } from 'react';
import { readStored, writeStored } from '../lib/storage';

export type Theme = 'light' | 'dark';

export const THEMES: readonly Theme[] = ['light', 'dark'];
const STORAGE_KEY = 'theme';

function getSystemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function useTheme() {
  const [storedTheme, setStoredTheme] = useState<Theme | null>(() =>
    readStored(STORAGE_KEY, THEMES),
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

  const setTheme = useCallback((nextTheme: Theme) => {
    writeStored(STORAGE_KEY, nextTheme);
    setStoredTheme(nextTheme);
  }, []);

  return { theme, setTheme };
}
