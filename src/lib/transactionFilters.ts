/** Transaction-table fields; relationships are filtered by their IDs. */
export type TransactionFilterField = 'id' | 'account' | 'description' | 'category' | 'posted_at' | 'amount';

/** Conditions are combined with AND, in addition to the tracked-account restriction. */
export type TransactionFilter =
  | { field: TransactionFilterField; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'; value: string | number }
  | { field: TransactionFilterField; operator: 'in'; value: readonly string[] | readonly number[] }
  | { field: TransactionFilterField; operator: 'is' | 'not.is'; value: null };

export type TransactionFilters = readonly TransactionFilter[];
