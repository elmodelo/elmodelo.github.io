import { evaluateAssetExpression } from './decimalExpression.js';

// Inputs accept plain decimals, while numeric API responses can stringify
// small holdings as exponent notation. Preserve decimal strings when supplied.
function decimalText(value) {
  const text = String(value).trim().replace(/^\+/, '');
  const negative = text.startsWith('-');
  const magnitude = negative ? text.slice(1) : text;
  const sign = negative && /[1-9]/.test(magnitude.split(/[eE]/)[0]) ? '-' : '';
  if (!/[eE]/.test(magnitude)) return sign + magnitude;
  const [coefficient, exponent] = magnitude.toLowerCase().split('e');
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return sign + '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return sign + digits.slice(0, point) + '.' + digits.slice(point);
}

function validSign(value, type) {
  if (!['ASSET', 'LIABILITY'].includes(type)) return false;
  const canonical = canonicalDecimal(decimalText(value));
  return canonical === '0' || (type === 'LIABILITY' ? canonical.startsWith('-') : !canonical.startsWith('-'));
}

function snapshot(rows, metric, type = 'ASSET') {
  if (!Array.isArray(rows) || rows.length > 1) throw new Error('Invalid asset snapshot');
  if (!rows.length) return null;
  const row = rows[0];
  if (!['string', 'number'].includes(typeof row[metric]) || String(row[metric]).trim() === ''
    || !Number.isFinite(Number(row[metric])) || !validSign(row[metric], type)
    || typeof row.posted_at !== 'string' || !Number.isFinite(Date.parse(row.posted_at))) {
    throw new Error('Invalid asset snapshot');
  }
  return { amount: Number(row[metric]), rawAmount: decimalText(row[metric]), postedAt: row.posted_at };
}

export async function fetchLatestAssets(client, signal) {
  const assets = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.schema('finance').from('asset')
      .select('id,name,currency,type,asset_count(count,posted_at),asset_value(value,posted_at)')
      .order('id').range(offset, offset + 499)
      .order('posted_at', { referencedTable: 'asset_count', ascending: false })
      .limit(1, { referencedTable: 'asset_count' })
      .order('posted_at', { referencedTable: 'asset_value', ascending: false })
      .limit(1, { referencedTable: 'asset_value' }).abortSignal(signal);
    if (error || !Array.isArray(data)) throw new Error('Assets unavailable', { cause: error });
    for (const row of data) {
      if (typeof row.id !== 'string' || typeof row.name !== 'string' || !['CAD', 'USD'].includes(row.currency) || !['ASSET', 'LIABILITY'].includes(row.type)) {
        throw new Error('Invalid asset');
      }
      const count = snapshot(row.asset_count, 'count');
      const price = snapshot(row.asset_value, 'value', row.type);
      const amount = count && price ? (count.amount * price.amount || 0) : null;
      if (amount !== null && !Number.isFinite(amount)) throw new Error('Invalid asset total');
      assets.push({ id: row.id, name: row.name, currency: row.currency, type: row.type, kind: 'asset', count, price,
        snapshot: amount === null ? null : { amount, postedAt: price.postedAt } });
    }
    if (data.length < 500) return assets;
  }
}

// Keep decimals as strings through the write request, avoiding Number rounding.
export function assetSnapshotInput(count, value, postedAt, type = 'ASSET') {
  const parse = (text, allowNegative = false) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    return evaluateAssetExpression(trimmed, allowNegative);
  };
  const p_count = parse(count);
  const p_value = parse(value, true);
  if (!['ASSET', 'LIABILITY'].includes(type) || (p_value !== null && !validSign(p_value, type))) throw new Error('invalid');
  if ((p_count === null && p_value === null) || !postedAt || !Number.isFinite(Date.parse(postedAt))) {
    throw new Error('invalid');
  }
  return { p_count, p_value, p_posted_at: new Date(postedAt).toISOString() };
}

// Compare decimal text exactly, ignoring formatting differences without
// rounding high-precision values through Number.
function canonicalDecimal(text) {
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const decimals = fraction.replace(/0+$/, '');
  const magnitude = (whole.replace(/^0+/, '') || '0') + (decimals ? '.' + decimals : '');
  return negative && magnitude !== '0' ? '-' + magnitude : magnitude;
}

export function changedAssetSnapshotInput(asset, count, value, postedAt) {
  if (!count.trim() && !value.trim()) return null;
  const input = assetSnapshotInput(count, value, postedAt, asset.type ?? 'ASSET');
  for (const [key, previous] of [['p_count', asset.count], ['p_value', asset.price]]) {
    if (input[key] !== null && previous
      && canonicalDecimal(input[key]) === canonicalDecimal(decimalText(previous.rawAmount ?? previous.amount))) {
      input[key] = null;
    }
  }
  return input.p_count === null && input.p_value === null ? null : input;
}

export async function saveAssetSnapshot(client, assetId, input) {
  const { error } = await client.schema('finance').rpc('add_asset_snapshot', { p_asset: assetId, ...input });
  if (error) throw Object.assign(new Error('Asset save failed'), { code: error.code });
}

export function newAssetInput(name, currency, count, value, postedAt, type = 'ASSET') {
  const snapshot = assetSnapshotInput(count, value, postedAt, type);
  if (!name.trim() || !['CAD', 'USD'].includes(currency) || snapshot.p_count === null || snapshot.p_value === null) {
    throw new Error('invalid');
  }
  return { p_name: name.trim(), p_currency: currency, p_type: type, ...snapshot };
}

export async function createAsset(client, input) {
  const { data, error } = await client.schema('finance').rpc('create_asset', input);
  if (error) throw Object.assign(new Error('Asset creation failed'), { code: error.code });
  if (typeof data !== 'string' || !data) throw new Error('Could not confirm asset creation');
  return data;
}
