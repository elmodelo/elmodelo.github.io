import { DEFAULT_TRANSACTION_PREFERENCES, isTransactionPreferences, type TransactionPreferences } from './transactionPreferences';

export interface ApplicationPreferences extends Record<string, unknown> {
  theme: 'light' | 'dark' | null;
  language: 'en' | 'es' | null;
  trackedAccounts: string[] | null;
  transactions: TransactionPreferences;
}

/** Validate individual fields so one invalid preference doesn't discard the rest. */
export function parsePreferences(value: unknown): ApplicationPreferences {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    ...data,
    theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : null,
    language: data.language === 'en' || data.language === 'es' ? data.language : null,
    trackedAccounts: Array.isArray(data.trackedAccounts) && data.trackedAccounts.every((id) => typeof id === 'string')
      ? data.trackedAccounts : null,
    transactions: isTransactionPreferences(data.transactions) ? data.transactions : DEFAULT_TRANSACTION_PREFERENCES,
  };
}

/** Serialize writes so a slow earlier save can never overwrite a later edit. */
export function createPreferencesWriter(save: (preferences: ApplicationPreferences) => Promise<void>) {
  let pending = Promise.resolve();
  return (preferences: ApplicationPreferences) => {
    pending = pending.catch(() => {}).then(() => save(preferences));
    return pending;
  };
}
