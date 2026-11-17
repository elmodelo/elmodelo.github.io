export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export const SORT_COLUMNS = [
  'posted_at', 'account(name)', 'description(name)',
  'description(memo)', 'category(name)', 'amount',
] as const;
export type SortColumn = typeof SORT_COLUMNS[number];

export interface TransactionPreferences {
  pageSize: number;
  sortColumn: SortColumn;
  ascending: boolean;
  postedAtAscending: boolean;
}

export const DEFAULT_TRANSACTION_PREFERENCES: TransactionPreferences = {
  pageSize: DEFAULT_PAGE_SIZE,
  sortColumn: 'posted_at',
  ascending: false,
  postedAtAscending: false,
};

export function isTransactionPreferences(value: unknown): value is TransactionPreferences {
  if (!value || typeof value !== 'object') return false;
  const preferences = value as Record<string, unknown>;
  return PAGE_SIZE_OPTIONS.some((size) => size === preferences.pageSize)
    && SORT_COLUMNS.some((column) => column === preferences.sortColumn)
    && typeof preferences.ascending === 'boolean'
    && typeof preferences.postedAtAscending === 'boolean'
    && (preferences.sortColumn !== 'posted_at' || preferences.ascending === preferences.postedAtAscending);
}

export function changeTransactionSort(preferences: TransactionPreferences, column: SortColumn): TransactionPreferences {
  const ascending = column === preferences.sortColumn
    ? !preferences.ascending
    : column === 'posted_at' ? preferences.postedAtAscending : true;
  return {
    ...preferences,
    sortColumn: column,
    ascending,
    postedAtAscending: column === 'posted_at' ? ascending : preferences.postedAtAscending,
  };
}
