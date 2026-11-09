export function fetchTransactions(client, { sortColumn, ascending, postedAtAscending = false, page, pageSize, signal }) {
  let query = client
    .schema('finance')
    .from('transaction')
    .select('id, posted_at, amount, account:account(name, currency), description:transaction_description(name, memo), category:category(name)', { count: 'exact' })
    .order(sortColumn, { ascending, nullsFirst: false });
  if (sortColumn !== 'posted_at') {
    query = query.order('posted_at', { ascending: postedAtAscending, nullsFirst: false });
  }
  return query
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .abortSignal(signal);
}
