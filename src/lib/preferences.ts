import { parseSavedTransactionFilters, type SavedTransactionFilter } from './transactionFilterPresets';
import { DEFAULT_TRANSACTION_PREFERENCES, isTransactionPreferences, type TransactionPreferences } from './transactionPreferences';

export interface ApplicationPreferences extends Record<string, unknown> {
  theme: 'light' | 'dark' | null;
  language: 'en' | 'es' | null;
  trackedAccounts: string[] | null;
  cashFlowAccounts: string[] | null;
  netWorthIncludeResp: boolean;
  netWorthChartsStartMonth: string | null;
  transactions: TransactionPreferences;
  transaction_filters: SavedTransactionFilter[];
}

/** Validate individual fields so one invalid preference doesn't discard the rest. */
export function parsePreferences(value: unknown): ApplicationPreferences {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    ...data,
    transaction_filters: parseSavedTransactionFilters(data.transaction_filters),
    theme: data.theme === 'light' || data.theme === 'dark' ? data.theme : null,
    language: data.language === 'en' || data.language === 'es' ? data.language : null,
    trackedAccounts: Array.isArray(data.trackedAccounts) && data.trackedAccounts.every((id) => typeof id === 'string')
      ? data.trackedAccounts : null,
    cashFlowAccounts: Array.isArray(data.cashFlowAccounts) && data.cashFlowAccounts.every((id) => typeof id === 'string')
      ? data.cashFlowAccounts : null,
    netWorthIncludeResp: data.netWorthIncludeResp === true,
    netWorthChartsStartMonth: typeof data.netWorthChartsStartMonth === 'string'
      && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(data.netWorthChartsStartMonth) ? data.netWorthChartsStartMonth : null,
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
