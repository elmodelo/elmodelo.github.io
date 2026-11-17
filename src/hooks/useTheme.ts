import { useEffect, useState } from 'react';
import { usePreferences } from './usePreferences';

export type Theme = 'light' | 'dark';

function getSystemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function useTheme() {
  const { preferences, update } = usePreferences();
  const setTheme = (theme: Theme) => update('theme', theme);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const theme = preferences.theme ?? systemTheme;

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
