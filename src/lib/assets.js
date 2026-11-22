function snapshot(rows, metric) {
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid asset snapshot');
  if (!rows.length) return null;
  const row = rows[0];
  if (!['string', 'number'].includes(typeof row[metric]) || String(row[metric]).trim() === ''
    || !Number.isFinite(Number(row[metric])) || Number(row[metric]) < 0
    || typeof row.posted_at !== 'string' || !Number.isFinite(Date.parse(row.posted_at))) {
    throw new Error('Invalid asset snapshot');
  }
  return { amount: Number(row[metric]), postedAt: row.posted_at };
}

export async function fetchLatestAssets(client, signal) {
  const assets = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.schema('finance').from('asset')
      .select('id,name,currency,asset_count(count,posted_at),asset_value(value,posted_at)')
      .order('id').range(offset, offset + 499)
      .order('posted_at', { referencedTable: 'asset_count', ascending: false })
      .limit(1, { referencedTable: 'asset_count' })
      .order('posted_at', { referencedTable: 'asset_value', ascending: false })
      .limit(1, { referencedTable: 'asset_value' }).abortSignal(signal);
    if (error || !Array.isArray(data)) throw new Error('Assets unavailable', { cause: error });
    for (const row of data) {
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || !['CAD', 'USD'].includes(row.currency)) {
        throw new Error('Invalid asset');
      }
      const count = snapshot(row.asset_count, 'count');
      const price = snapshot(row.asset_value, 'value');
      const amount = count && price ? count.amount * price.amount : null;
      if (amount !== null && !Number.isFinite(amount)) throw new Error('Invalid asset total');
      assets.push({ id: row.id, name: row.name, currency: row.currency, kind: 'asset', count, price,
        snapshot: amount === null ? null : { amount, postedAt: price.postedAt } });
    }
    if (data.length < 500) return assets;
  }
}

// Keep decimals as strings through the write request, avoiding Number rounding.
export function assetSnapshotInput(count, value, postedAt) {
  const parse = (text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (!/^(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(trimmed) || !Number.isFinite(Number(trimmed))) {
      throw new Error('invalid');
    }
    return trimmed;
  };
  const p_count = parse(count);
  const p_value = parse(value);
  if ((p_count === null && p_value === null) || !postedAt || !Number.isFinite(Date.parse(postedAt))) {
    throw new Error('invalid');
  }
  return { p_count, p_value, p_posted_at: new Date(postedAt).toISOString() };
}

export async function saveAssetSnapshot(client, assetId, input) {
  const { error } = await client.schema('finance').rpc('add_asset_snapshot', { p_asset: assetId, ...input });
  if (error) throw Object.assign(new Error('Asset save failed'), { code: error.code });
}
