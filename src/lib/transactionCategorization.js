export async function fetchCategories(client, signal) {
  const categories = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const { data, error } = await client.schema('finance').from('category')
      .select('id, name').order('name').order('id')
      .range(offset, offset + batchSize - 1).abortSignal(signal);
    if (error || !data) throw new Error('Could not load categories');
    categories.push(...data);
    if (data.length < batchSize) return categories;
  }
}

// One RPC saves the entire selection and optional rule application atomically.
export async function categorizeTransactions(client, transactionIds, categoryId, insertRule, applyRule = false) {
  const ids = [...new Set(transactionIds)];
  if (!ids.length) return;
  const { data, error } = await client.schema('finance').rpc('set_transaction_categories', {
    p_transactions: ids,
    p_category: categoryId,
    p_insert_rule: insertRule,
    p_apply_rule: insertRule && applyRule,
  });
  if (error || data === null || Number(data) !== ids.length) throw new Error('Could not confirm category save');
}
