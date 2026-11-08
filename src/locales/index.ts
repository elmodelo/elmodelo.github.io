import en from './en';
import es from './es';
import type { LocaleMessages } from './types';

export type { LocaleMessages } from './types';

export function getLocaleMessages(locale: string): LocaleMessages {
  return locale.toLowerCase().startsWith('es') ? es : en;
}
