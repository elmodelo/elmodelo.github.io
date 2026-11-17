import { getLocaleMessages } from '../locales';
import type { LocaleMessages } from '../locales/types';
import { usePreferences } from './usePreferences';

export type Language = LocaleMessages['language'];

export function useLanguage() {
  const { preferences, update } = usePreferences();
  const messages = getLocaleMessages(preferences.language ?? (typeof navigator !== 'undefined' ? navigator.language : 'en'));
  const setLanguage = (language: Language) => update('language', language);
  return { messages, setLanguage };
}
