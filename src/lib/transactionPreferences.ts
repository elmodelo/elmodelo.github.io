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
  const settings = value as Record<string, unknown>;
  return PAGE_SIZE_OPTIONS.some((size) => size === settings.pageSize)
    && SORT_COLUMNS.some((column) => column === settings.sortColumn)
    && typeof settings.ascending === 'boolean'
    && typeof settings.postedAtAscending === 'boolean'
    && (settings.sortColumn !== 'posted_at' || settings.ascending === settings.postedAtAscending);
}

export function changeTransactionSort(settings: TransactionPreferences, column: SortColumn): TransactionPreferences {
  const ascending = column === settings.sortColumn
    ? !settings.ascending
    : column === 'posted_at' ? settings.postedAtAscending : true;
  return {
    ...settings,
    sortColumn: column,
    ascending,
    postedAtAscending: column === 'posted_at' ? ascending : settings.postedAtAscending,
  };
}
