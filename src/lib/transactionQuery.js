export function fetchTransactions(client, { trackedAccountIds, sortColumn, ascending, postedAtAscending = false, page, pageSize, signal }) {
  if (trackedAccountIds.length === 0) return Promise.resolve({ data: [], count: 0, error: null });
  let query = client
    .schema('finance')
    .from('transaction')
    .select('id, posted_at, amount, account:account(name, currency), description:transaction_description(name, memo), category:category(name)', { count: 'exact' })
    .in('account', trackedAccountIds)
    .order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn !== 'posted_at') {
    query = query.order('posted_at', { ascending: postedAtAscending, nullsFirst: false });
  }
  return query
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .abortSignal(signal);
}
