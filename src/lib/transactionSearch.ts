import { buildRelativeDateFilters, parseRelativeDateRange, type RelativeDateRange } from './relativeTransactionDates';
import type { TransactionFilters } from './transactionFilters';

type TransactionSearch =
  | { status: 'open' | 'invalid' }
  | { status: 'ready'; filters: TransactionFilters; names: string[]; relativeDates?: RelativeDateRange[] };

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
  const relativeDates: RelativeDateRange[] = [];
  let remaining = text.slice(opening + 1, closing).trim();
  while (remaining) {
    const token = /^(?:(?:(?:text|date):)?"(?:[^"\\]|\\["\\])*"|[^\s"]+)(?=\s|$)/u.exec(remaining)?.[0];
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
      const term = token.slice(5);
      if (term.startsWith('"')) {
        const range = parseRelativeDateRange(unquote(term));
        if (!range) return { status: 'invalid' };
        relativeDates.push(range);
        continue;
      }
      const [from, to = from, ...extra] = term.split('..').map(normalizeDate);
      if (extra.length || (!from && !to) || from.startsWith('0000-') || to.startsWith('0000-')
        || !isTransactionDateRange(from, to)) return { status: 'invalid' };
      filters.push(...buildTransactionDateFilters(from, to));
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
  return { status: 'ready', filters, names, ...(relativeDates.length ? { relativeDates } : {}) };
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value));
}

export function isTransactionDateRange(from: unknown, to: unknown) {
  return validDate(from) && validDate(to) && (!from || !to || from <= to);
}

export function buildTransactionDateFilters(from: string, to: string): TransactionFilters {
  const filters: TransactionFilters[number][] = [];
  if (from) filters.push({ field: 'posted_at', operator: 'gte', value: from + 'T00:00:00.000Z' });
  if (to) {
    const nextDay = new Date(to + 'T00:00:00.000Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    filters.push({ field: 'posted_at', operator: 'lt', value: nextDay.toISOString() });
  }
  return filters;
}

export function parseFilterPowerSearch(text: string, asOf = new Date()): TransactionFilters | null {
  const filters: TransactionFilters[number][] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parsed = parseTransactionSearch('`' + line.trim() + '`');
    if (parsed.status !== 'ready' || parsed.names.length) return null;
    filters.push(...parsed.filters);
    for (const range of parsed.relativeDates ?? []) filters.push(...buildRelativeDateFilters(range, asOf));
  }
  return filters;
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

  const filters: TransactionFilters[number][] = [];
  if (accountIds.size) filters.push({ field: 'account', operator: 'in', value: [...accountIds].sort() });
  if (categoryIds.size) filters.push({ field: 'category', operator: 'in', value: [...categoryIds].sort() });
  return { filters, unknown };
}
