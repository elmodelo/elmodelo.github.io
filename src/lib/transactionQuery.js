export function fetchTransactions(client, { sortColumn, ascending, page, pageSize, signal }) {
  return client
    .schema('finance')
    .from('transaction')
    .select('id, posted_at, amount, account:account(name, currency), description:transaction_description(name, memo), category:category(name)', { count: 'exact' })
    .order(sortColumn, { ascending, nullsFirst: false })
    .order('id', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1)
    .abortSignal(signal);
}
