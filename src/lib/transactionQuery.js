/** @type {import('./transactionFilters').TransactionFilters} */
export const NO_TRANSACTION_FILTERS = Object.freeze([]);

/** @type {import('./transactionFilters').TransactionFilters} */
export const UNCATEGORIZED_TRANSACTION_FILTERS = Object.freeze([
  Object.freeze({ field: 'category', operator: 'is', value: null }),
]);

/** Apply all conditions before ordering, counting, or pagination. */
function applyTransactionFilters(query, filters) {
  for (const { field, operator, value } of filters) {
    switch (operator) {
      case 'in':
        query = query.in(field, value);
        break;
      case 'is':
        query = query.is(field, value);
        break;
      case 'not.is':
        query = query.not(field, 'is', value);
        break;
      case 'eq': case 'neq': case 'gt': case 'gte': case 'lt': case 'lte':
        query = query.filter(field, operator, value);
        break;
      default:
        throw new Error(`Unsupported transaction filter operator: ${operator}`);
    }
  }
  return query;
}

export function fetchUncategorizedTransactions(client, trackedAccountIds, signal) {
  if (trackedAccountIds.length === 0) return Promise.resolve({ data: [], error: null });
  const query = client.schema('finance').from('transaction').select('id').in('account', trackedAccountIds);
  return applyTransactionFilters(query, UNCATEGORIZED_TRANSACTION_FILTERS).limit(1).abortSignal(signal);
}

export function fetchTransactions(client, { trackedAccountIds, sortColumn, ascending, postedAtAscending = false, page, pageSize, signal, filters = NO_TRANSACTION_FILTERS }) {
  if (trackedAccountIds.length === 0) return Promise.resolve({ data: [], count: 0, error: null });
  let query = client
    .schema('finance')
    .from('transaction')
    .select('id, posted_at, amount, account:account(name, currency), description:transaction_description(name, memo), category:category(name)', { count: 'exact' })
    .in('account', trackedAccountIds);
  query = applyTransactionFilters(query, filters);
  query = query.order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn !== 'posted_at') {
    query = query.order('posted_at', { ascending: postedAtAscending, nullsFirst: false });
  }
  return query
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .abortSignal(signal);
}
