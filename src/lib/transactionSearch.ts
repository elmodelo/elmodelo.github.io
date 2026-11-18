import { buildTransactionFilters, EMPTY_TRANSACTION_FILTER, isTransactionFilterValues } from './transactionFilterPresets';
import type { TransactionFilters } from './transactionFilters';

type TransactionSearch =
  | { status: 'open' | 'invalid' }
  | { status: 'ready'; filters: TransactionFilters; names: string[] };

const amountOperators = { '<': 'lt', '>': 'gt', '=': 'eq', '!=': 'neq' } as const;

export function parseTransactionSearch(input: string): TransactionSearch {
  const text = input.trim();
  const opening = text.indexOf('`');
  if (opening === -1) {
    return {
      status: 'ready',
      filters: text ? [{ field: 'description', operator: 'search', value: text }] : [],
      names: [],
    };
  }
  const closing = text.indexOf('`', opening + 1);
  if (closing === -1) return { status: 'open' };
  if (text.includes('`', closing + 1)) return { status: 'invalid' };

  const filters: TransactionFilters[number][] = [];
  const plainText = [text.slice(0, opening).trim(), text.slice(closing + 1).trim()].filter(Boolean).join(' ');
  if (plainText) filters.push({ field: 'description', operator: 'search', value: plainText });
  const names: string[] = [];
  const descriptionTerms: string[] = [];
  let remaining = text.slice(opening + 1, closing).trim();
  while (remaining) {
    const token = /^(?:(?:text:)?"(?:[^"\\]|\\["\\])*"|[^\s"]+)(?=\s|$)/u.exec(remaining)?.[0];
    if (!token) return { status: 'invalid' };
    remaining = remaining.slice(token.length).trimStart();

    if (token.startsWith('text:')) {
      const term = unquote(token.slice(5));
      if (!term) return { status: 'invalid' };
      descriptionTerms.push(term);
    } else if (token.startsWith('"')) {
      const name = unquote(token);
      if (!name) return { status: 'invalid' };
      names.push(name);
    } else if (token.startsWith('date:')) {
      const [from, to = from, ...extra] = token.slice(5).split('..').map(normalizeDate);
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
  const uniqueTerms = [...new Set(descriptionTerms)];
  if (uniqueTerms.length === 1) {
    filters.push({ field: 'description', operator: 'search', value: uniqueTerms[0] });
  } else if (uniqueTerms.length > 1) {
    filters.push({ field: 'description', operator: 'search.any', value: uniqueTerms });
  }
  return { status: 'ready', filters, names };
}

function normalizeDate(date: string) {
  return date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
}

function unquote(token: string) {
  return token.startsWith('"') ? token.slice(1, -1).replace(/\\(["\\])/g, '$1').trim() : token;
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
