import { getLocaleMessages } from '../locales';
import type { LocaleMessages } from '../locales/types';
import { readStored } from '../lib/storage';
import { usePersistedState } from './usePersistedState';

export type Language = LocaleMessages['language'];

export const LANGUAGES: readonly Language[] = ['en', 'es'];
const STORAGE_KEY = 'language';

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some((language) => language === value);
}

export function useLanguage(userId?: string | null) {
  const fallback = getLocaleMessages(
    (!userId ? readStored(STORAGE_KEY, LANGUAGES) : null) ??
      (typeof navigator !== 'undefined' ? navigator.language : 'en'),
  ).language;
  const [language, setLanguage] = usePersistedState(
    STORAGE_KEY, fallback, isLanguage, userId,
  );
  const messages = getLocaleMessages(language);

  return { messages, setLanguage };
}
