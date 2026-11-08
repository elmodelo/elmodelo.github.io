import { useCallback, useState } from 'react';
import { getLocaleMessages } from '../locales';
import type { LocaleMessages } from '../locales/types';
import { readStored, writeStored } from '../lib/storage';

export type Language = LocaleMessages['language'];

export const LANGUAGES: readonly Language[] = ['en', 'es'];
const STORAGE_KEY = 'language';

export function useLanguage() {
  const [messages, setMessages] = useState<LocaleMessages>(() =>
    getLocaleMessages(
      readStored(STORAGE_KEY, LANGUAGES) ??
        (typeof navigator !== 'undefined' ? navigator.language : 'en'),
    ),
  );

  const setLanguage = useCallback((language: Language) => {
    writeStored(STORAGE_KEY, language);
    setMessages(getLocaleMessages(language));
  }, []);

  return { messages, setLanguage };
}
