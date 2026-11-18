import { isTransactionDateRange } from './transactionSearch';
import type { TransactionFilterValues } from './transactionFilterPresets';
import type { TransactionFilters } from './transactionFilters';

/** Move search clauses into controls only when the resulting filter is equivalent. */
export function projectTransactionSearch(
  values: TransactionFilterValues,
  search: string,
  filters: TransactionFilters,
): TransactionFilterValues {
  if (!search) return values;
  const draft = { ...values, sourceSearch: search };
  const remaining = draft.powerSearch?.trim() ? [draft.powerSearch.trim()] : [];

  for (const filter of filters) {
    switch (filter.field) {
      case 'account':
      case 'category': {
        if (filter.operator !== 'in') break;
        const key = filter.field === 'account' ? 'accounts' : 'categories';
        const ids = new Set(filter.value.map(String));
        draft[key] = draft[key]?.filter((id) => ids.has(id)) ?? [...ids];
        break;
      }
      case 'description':
        if (filter.operator === 'search' && !draft.search.trim() && !/[\r\n]/.test(filter.value)) {
          draft.search = filter.value;
        } else if (filter.operator === 'search' || filter.operator === 'search.any') {
          const terms = filter.operator === 'search' ? [filter.value] : filter.value;
          remaining.push(terms.map((term) => 'text:"' + term.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '\\$&') + '"').join(' '));
        }
        break;
      case 'amount': {
        if (filter.operator !== 'eq' && filter.operator !== 'neq'
          && filter.operator !== 'gt' && filter.operator !== 'lt') break;
        const amount = String(filter.value);
        const key = filter.operator === 'gt' ? 'minimum' : 'maximum';
        const other = key === 'minimum' ? draft.maximum : draft.minimum;
        if ((filter.operator === 'gt' || filter.operator === 'lt')
          && canonicalDecimal(amount) === canonicalDecimal(String(Number(amount)))) {
          const bound = Number(amount);
          const isMinimum = key === 'minimum';
          const fits = !other || (isMinimum ? bound < Number(other) : bound > Number(other));
          if (fits) {
            const previous = draft[key];
            if (!previous || (isMinimum ? bound > Number(previous) : bound < Number(previous))) draft[key] = String(bound);
            break;
          }
        }
        const symbol = { eq: '=', neq: '!=', gt: '>', lt: '<' }[filter.operator];
        remaining.push(symbol + amount);
        break;
      }
      case 'posted_at': {
        if (filter.operator !== 'gte' && filter.operator !== 'lt') break;
        const day = new Date(filter.value);
        if (filter.operator === 'lt') day.setUTCDate(day.getUTCDate() - 1);
        const date = day.toISOString().slice(0, 10);
        const from = filter.operator === 'gte' && date > draft.from ? date : draft.from;
        const to = filter.operator === 'lt' && (!draft.to || date < draft.to) ? date : draft.to;
        if (isTransactionDateRange(from, to)) {
          draft.from = from;
          draft.to = to;
        } else {
          remaining.push(filter.operator === 'gte' ? 'date:' + date + '..' : 'date:..' + date);
        }
        break;
      }
    }
  }
  draft.powerSearch = remaining.join('\n');
  return draft;
}

function canonicalDecimal(value: string) {
  return value.replace(/^\+/, '').replace(/^(-?)\./, '$10.').replace(/^(-?)0+(?=\d)/, '$1')
    .replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '').replace(/^-0$/, '0');
}
