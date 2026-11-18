import { buildTransactionFilters, EMPTY_TRANSACTION_FILTER, isTransactionFilterValues } from './transactionFilterPresets';
import type { TransactionFilters } from './transactionFilters';

type TransactionSearch =
  | { status: 'open' | 'invalid' }
  | { status: 'ready'; filters: TransactionFilters; names: string[] };

const amountOperators = { '<': 'lt', '>': 'gt', '=': 'eq', '!=': 'neq' } as const;

export function parseTransactionSearch(input: string): TransactionSearch {
  const text = input.trim();
  if (!text.includes('`')) {
    return {
      status: 'ready',
      filters: text ? [{ field: 'description', operator: 'search', value: text }] : [],
      names: [],
    };
  }
  if (!text.startsWith('`')) return { status: 'invalid' };
  const closing = text.indexOf('`', 1);
  if (closing === -1) return { status: 'open' };
  if (closing !== text.length - 1) return { status: 'invalid' };

  const filters: TransactionFilters[number][] = [];
  const names: string[] = [];
  let remaining = text.slice(1, closing).trim();
  while (remaining) {
    const token = /^(?:"(?:[^"\\]|\\["\\])*"|[^\s"]+)(?=\s|$)/u.exec(remaining)?.[0];
    if (!token) return { status: 'invalid' };
    remaining = remaining.slice(token.length).trimStart();

    if (token.startsWith('"')) {
      const name = token.slice(1, -1).replace(/\\(["\\])/g, '$1').trim();
      if (!name) return { status: 'invalid' };
      names.push(name);
    } else if (token.startsWith('date:')) {
      const date = token.slice(5);
      const [from, to = from, ...extra] = date.split('..');
      const values = { ...EMPTY_TRANSACTION_FILTER, from, to };
      if (extra.length || (!from && !to) || from.startsWith('0000-') || to.startsWith('0000-')
        || !isTransactionFilterValues(values)) return { status: 'invalid' };
      filters.push(...buildTransactionFilters(values));
    } else if (/^\p{L}[\p{L}\p{M}]*$/u.test(token)) {
      names.push(token);
    } else {
      const amount = /^(?<operator>!=|[<>=])(?<value>[+-]?(?:\d+(?:\.\d+)?|\.\d+))$/.exec(token);
      if (!amount?.groups || !Number.isFinite(Number(amount.groups.value))) return { status: 'invalid' };
      const operator = amountOperators[amount.groups.operator as keyof typeof amountOperators];
      filters.push({ field: 'amount', operator, value: amount.groups.value });
    }
  }
  return { status: 'ready', filters, names };
}

type NamedItem = { id: string; name: string };

export function resolveSearchNames(names: string[], categories: NamedItem[], accounts: NamedItem[]) {
  const categoryIds = new Set<string>();
  const accountIds = new Set<string>();
  const unknown: string[] = [];
  const normalize = (name: string) => name.trim().normalize().toLowerCase();

  for (const name of new Set(names)) {
    const normalized = normalize(name);
    const matchingCategories = categories.filter((category) => normalize(category.name) === normalized);
    const matchingAccounts = accounts.filter((account) => normalize(account.name) === normalized);
    if (!matchingCategories.length && !matchingAccounts.length) unknown.push(name);
    for (const category of matchingCategories) categoryIds.add(category.id);
    for (const account of matchingAccounts) accountIds.add(account.id);
  }

  const filters = buildTransactionFilters({
    ...EMPTY_TRANSACTION_FILTER,
    categories: categoryIds.size ? [...categoryIds].sort() : null,
    accounts: accountIds.size ? [...accountIds].sort() : null,
  });
  return { filters, unknown };
}
