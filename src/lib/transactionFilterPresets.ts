import { buildTransactionDateFilters, isTransactionDateRange, parseFilterPowerSearch } from './transactionSearch';
import type { TransactionFilters } from './transactionFilters';

export interface TransactionFilterValues {
  accounts: string[] | null;
  categories: string[] | null;
  from: string;
  to: string;
  search: string;
  minimum: string;
  maximum: string;
  powerSearch?: string;
  sourceSearch?: string;
}
export interface SavedTransactionFilter {
  id: string;
  name: string;
  values: TransactionFilterValues;
}
export const EMPTY_TRANSACTION_FILTER: TransactionFilterValues = {
  accounts: null, categories: null, from: '', to: '', search: '', minimum: '', maximum: '',
};

export function isTransactionFilterValues(value: unknown): value is TransactionFilterValues {
  if (!value || typeof value !== 'object') return false;
  const v = value as TransactionFilterValues;
  return [v.accounts, v.categories].every((ids) => ids === null || (Array.isArray(ids) && ids.every((id) => typeof id === 'string')))
    && isTransactionDateRange(v.from, v.to)
    && (v.powerSearch === undefined || (typeof v.powerSearch === 'string' && parseFilterPowerSearch(v.powerSearch) !== null))
    && (v.sourceSearch === undefined || typeof v.sourceSearch === 'string')
    && typeof v.search === 'string'
    && [v.minimum, v.maximum].every((amount) => typeof amount === 'string' && (amount === '' || (amount.trim() !== '' && Number.isFinite(Number(amount)))))
    && (!v.minimum || !v.maximum || Number(v.minimum) < Number(v.maximum));
}
export function parseSavedTransactionFilters(value: unknown): SavedTransactionFilter[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((item) => {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim()
      || !isTransactionFilterValues(item.values)) return false;
    ids.add(item.id);
    return true;
  });
}
export function buildTransactionFilters(values: TransactionFilterValues): TransactionFilters {
  if (!isTransactionFilterValues(values)) throw new Error('Invalid transaction filter');
  const filters: TransactionFilters[number][] = [];
  if (values.accounts !== null) filters.push({ field: 'account', operator: 'in', value: values.accounts });
  if (values.categories !== null) filters.push({ field: 'category', operator: 'in', value: values.categories });
  filters.push(...buildTransactionDateFilters(values.from, values.to));
  if (values.search.trim()) filters.push({ field: 'description', operator: 'search', value: values.search.trim() });
  if (values.minimum !== '') filters.push({ field: 'amount', operator: 'gt', value: Number(values.minimum) });
  if (values.maximum !== '') filters.push({ field: 'amount', operator: 'lt', value: Number(values.maximum) });
  if (values.powerSearch) filters.push(...(parseFilterPowerSearch(values.powerSearch) ?? []));
  return filters;
}
