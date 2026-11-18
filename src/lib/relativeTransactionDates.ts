import type { TransactionFilters } from './transactionFilters';

export type RelativeDateRange = { kind: 'last-days'; days: number } | { kind: 'last-month' };
export const MAX_RELATIVE_DAYS = 36500;

export function isRelativeDateRange(value: unknown): value is RelativeDateRange {
  if (!value || typeof value !== 'object') return false;
  const range = value as Partial<{ kind: string; days: number }>;
  return range.kind === 'last-month' || (
    range.kind === 'last-days' && typeof range.days === 'number' && Number.isInteger(range.days)
    && range.days >= 1 && range.days <= MAX_RELATIVE_DAYS
  );
}

export function parseRelativeDateRange(text: string): RelativeDateRange | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  if (normalized === 'last month') return { kind: 'last-month' };
  const match = /^last (\d+) days?$/.exec(normalized);
  if (!match) return null;
  const range = { kind: 'last-days', days: Number(match[1]) } as const;
  return isRelativeDateRange(range) ? range : null;
}

export function relativeDateExpression(range: RelativeDateRange): string {
  return range.kind === 'last-month' ? 'date:"last month"' : 'date:"last ' + range.days + ' days"';
}

/** Match the UTC calendar used by posted dates. The upper bound is exclusive. */
export function buildRelativeDateFilters(range: RelativeDateRange, asOf: Date): TransactionFilters {
  const end = new Date(asOf.getTime());
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime());
  if (range.kind === 'last-month') {
    end.setUTCDate(1);
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 1);
  } else {
    start.setUTCDate(start.getUTCDate() - range.days + 1);
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return [
    { field: 'posted_at', operator: 'gte', value: start.toISOString() },
    { field: 'posted_at', operator: 'lt', value: end.toISOString() },
  ];
}
