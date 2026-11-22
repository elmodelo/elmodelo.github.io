import { fetchLatestAssets } from './assets.js';
import { loadExchangeRates } from './transactionTotals.js';

/** Limit the embedded relation, not the account list or the full balance history. */
export async function fetchLatestBalances(client, accounts, signal) {
  const balances = new Map();
  for (let offset = 0; offset < accounts.length; offset += 100) {
    const ids = accounts.slice(offset, offset + 100).map(({ id }) => id);
    const { data, error } = await client.schema('finance').from('account')
      .select('id,balance(balance,posted_at)').in('id', ids)
      .order('posted_at', { referencedTable: 'balance', ascending: false })
      .limit(1, { referencedTable: 'balance' }).abortSignal(signal);
    if (error) throw new Error('Balances unavailable', { cause: error });
    if (!Array.isArray(data)) throw new Error('Invalid balances');
    for (const row of data) {
      if (!ids.includes(row.id) || !Array.isArray(row.balance) || row.balance.length > 1) throw new Error('Invalid balances');
      const latest = row.balance[0];
      if (!latest) continue;
      if (!['number', 'string'].includes(typeof latest.balance) || String(latest.balance).trim() === ''
        || !Number.isFinite(Number(latest.balance)) || typeof latest.posted_at !== 'string'
        || !Number.isFinite(Date.parse(latest.posted_at))) throw new Error('Invalid balance');
      balances.set(row.id, { amount: Number(latest.balance), postedAt: latest.posted_at });
    }
  }
  return accounts.map((account) => ({ ...account, snapshot: balances.get(account.id) ?? null }));
}

export async function loadNetWorth(client, accounts, signal, rateLoader = loadExchangeRates, includeAssets = false) {
  const sources = await Promise.allSettled([
    fetchLatestBalances(client, accounts, signal),
    includeAssets ? fetchLatestAssets(client, signal) : Promise.resolve([]),
  ]);
  if (signal?.aborted) throw new Error('Aborted');
  if (!includeAssets && sources[0].status === 'rejected') throw sources[0].reason;
  const accountsError = sources[0].status === 'rejected';
  const assetsError = sources[1].status === 'rejected';
  const rows = [
    ...(accountsError ? [] : sources[0].value),
    ...(assetsError ? [] : sources[1].value),
  ];
  let rates = null;
  if (rows.some(({ currency, snapshot }) => snapshot && currency !== 'CAD')) {
    try { rates = await rateLoader(signal); }
    catch (error) { if (signal?.aborted) throw error; }
  }
  let conversionError = false;
  const converted = rows.map((row) => {
    const rate = row.currency === 'CAD' ? 1 : rates?.cadPerUnit[row.currency];
    const cad = row.snapshot && Number.isFinite(rate) && rate > 0 ? row.snapshot.amount * rate : null;
    if (row.snapshot && (cad === null || !Number.isFinite(cad))) conversionError = true;
    return { ...row, cad: Number.isFinite(cad) ? cad : null };
  });
  const total = converted.reduce((sum, { cad }) => sum + (cad ?? 0), 0);
  if (!Number.isFinite(total)) conversionError = true;
  const exchangeRates = Object.fromEntries(rows.filter(({ currency, snapshot }) => snapshot && currency !== 'CAD'
    && Number.isFinite(rates?.cadPerUnit[currency]) && rates.cadPerUnit[currency] > 0)
    .map(({ currency }) => [currency, rates.cadPerUnit[currency]]));
  return { rows: converted, total: conversionError || accountsError || assetsError ? null : total, conversionError, accountsError, assetsError,
    incomplete: accountsError || assetsError || rows.some(({ snapshot }) => !snapshot), rateDate: rates?.date ?? null, exchangeRates };
}

export function netWorthRateMessage(messages, result) {
  if (!result) return null;
  if (!Object.keys(result.exchangeRates).length) return result.conversionError ? messages.netWorthConversionError : messages.netWorthNoConversion;
  const format = new Intl.NumberFormat(messages.language, { maximumFractionDigits: 20, useGrouping: false });
  return messages.netWorthRate.replace('{date}', result.rateDate).replace('{rates}',
    Object.entries(result.exchangeRates).sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rate]) => `1 ${currency} = ${format.format(rate)} CAD`).join('; '));
}

/** Pie slices and labels both use the sum of positive CAD holdings. */
export function netWorthAllocation(result) {
  const accounts = result.rows.filter(({ cad }) => cad !== null && cad > 0)
    .sort((a, b) => b.cad - a.cad || a.id.localeCompare(b.id));
  const positiveTotal = accounts.reduce((sum, { cad }) => sum + cad, 0);
  return accounts.map((account) => ({ ...account,
    pieShare: account.cad / positiveTotal,
  }));
}


export function sortNetWorthAccounts(rows, language, column = 'cad', ascending = false) {
  const value = (row) => column === 'name' ? row.name : column === 'postedAt'
    ? (row.snapshot ? Date.parse(row.snapshot.postedAt) : null)
    : column === 'balance' ? (row.snapshot?.amount ?? null) : row.cad;
  return rows.filter((row) => row.kind !== 'asset').sort((a, b) => {
    const left = value(a);
    const right = value(b);
    // Missing balances and conversions always come last, in either direction.
    if (left == null && right != null) return 1;
    if (left != null && right == null) return -1;
    const order = left == null || right == null ? 0 : column === 'name'
      ? left.localeCompare(right, language) : left < right ? -1 : left > right ? 1 : 0;
    return order * (ascending ? 1 : -1)
      || a.name.localeCompare(b.name, language) || a.id.localeCompare(b.id);
  });
}
