import { shiftHistoricalDate, validHistoricalDate } from './historicalDates.js';

// Read flat histories with stable pagination; embedded relations are row-limited.
async function history(client, table, columns, signal, ids = null) {
  const result = [];
  const batches = ids === null ? [null] : Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  for (const batch of batches) {
    for (let offset = 0; ; offset += 500) {
      let query = client.schema('finance').from(table).select(columns).order('id').range(offset, offset + 499);
      if (batch) query = query.in('account', batch);
      const { data, error } = await query.abortSignal(signal);
      if (error || !Array.isArray(data)) throw new Error('Chart history unavailable', { cause: error });
      result.push(...data);
      if (data.length < 500) break;
    }
  }
  return result;
}

export async function fetchNetWorthHistory(client, accounts, signal) {
  const [balances, assets, counts, prices] = await Promise.all([
    history(client, 'balance', 'id,account,balance,posted_at', signal, accounts.map(({ id }) => id)),
    history(client, 'asset', 'id,name,currency,type', signal),
    history(client, 'asset_count', 'id,asset,count,posted_at', signal),
    history(client, 'asset_value', 'id,asset,value,posted_at', signal),
  ]);
  if (signal?.aborted) throw new Error('Aborted');
  return { accounts, balances, assets, counts, prices };
}

const monthOf = (date) => new Date(date).toISOString().slice(0, 7);
const nextMonth = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
const monthEnd = (month) => shiftHistoricalDate(`${nextMonth(month)}-01`, -1);
const isResp = (row) => row.name.trim().toUpperCase() === 'RESP';

function observations(rows, field, foreignKey, items) {
  const ids = new Set(items.map(({ id }) => id));
  const result = new Map();
  for (const row of rows) {
    if (!ids.has(row[foreignKey])) continue;
    if (typeof row.posted_at !== 'string' || !Number.isFinite(Date.parse(row.posted_at))
      || !['number', 'string'].includes(typeof row[field]) || String(row[field]).trim() === '' || !Number.isFinite(Number(row[field]))) {
      throw new Error('Invalid chart observation');
    }
    const list = result.get(row[foreignKey]) ?? [];
    list.push({ date: new Date(row.posted_at).toISOString(), value: Number(row[field]) });
    result.set(row[foreignKey], list);
  }
  for (const list of result.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}

/** Select snapshots independently for quantities and prices and carry forward.
 * Undefined conversion returns a gap, never a fabricated zero. */
export function buildMonthlyNetWorth(history, rates = {}, includeResp = false) {
  const { accounts, assets } = history;
  const balances = observations(history.balances, 'balance', 'account', accounts);
  const counts = observations(history.counts, 'count', 'asset', assets);
  const prices = observations(history.prices, 'value', 'asset', assets);
  const dates = [balances, counts, prices].flatMap((map) => [...map.values()].flatMap((list) => list.map(({ date }) => date))).sort();
  if (!dates.length) return [];
  const first = monthOf(dates[0]);
  const last = monthOf(dates.at(-1));
  // Cursors make aggregation linear in observations plus months × items.
  const cursors = new Map();
  const latest = (map, id, cutoff) => {
    const list = map.get(id) ?? [];
    let index = cursors.get(list) ?? -1;
    while (index + 1 < list.length && list[index + 1].date < cutoff) index++;
    cursors.set(list, index);
    return index < 0 ? null : list[index].value;
  };
  const rows = [];
  for (let month = first; month <= last; month = nextMonth(month)) {
    const cutoff = `${nextMonth(month)}-01T00:00:00.000Z`;
    let assetsTotal = 0, liabilities = 0, portfolio = 0;
    let complete = true, portfolioComplete = true;
    for (const item of [...accounts.map((row) => ({ ...row, kind: 'account' })), ...assets.map((row) => ({ ...row, kind: 'asset' }))]) {
      const asset = item.kind === 'asset';
      const count = asset ? latest(counts, item.id, cutoff) : null;
      const price = asset ? latest(prices, item.id, cutoff) : null;
      const amount = asset ? count === null || price === null ? null : count * price : latest(balances, item.id, cutoff);
      // Items with no observations yet did not exist in this month's history.
      if (asset ? count === null && price === null : amount === null) continue;
      const inNetWorth = includeResp || asset || !isResp(item);
      const inPortfolio = !isResp(item) && (!asset || (item.type === 'ASSET' && item.name.trim().toLowerCase() !== 'house'))
        && (amount === null || amount > 0);
      const rate = item.currency === 'CAD' ? 1 : rates[month]?.[item.currency];
      const cad = amount === 0 ? 0 : amount !== null && Number.isFinite(rate) && rate > 0 ? amount * rate : null;
      if (cad === null || !Number.isFinite(cad)) {
        if (inNetWorth) complete = false;
        if (inPortfolio) portfolioComplete = false;
        continue;
      }
      if (inNetWorth) {
        if (asset ? item.type === 'LIABILITY' : cad < 0) liabilities += cad;
        else assetsTotal += cad;
      }
      if (inPortfolio) portfolio += cad;
    }
    rows.push({ month, date: month === last ? dates.at(-1).slice(0, 10) : monthEnd(month),
      assets: complete ? assetsTotal : null, liabilities: complete ? liabilities : null,
      netWorth: complete ? assetsTotal + liabilities : null, portfolio: portfolioComplete ? portfolio : null });
  }
  return addMonthlyGrowth(rows);
}

export function addMonthlyGrowth(rows) {
  const result = rows.map((row, i) => {
    const previous = rows[i - 1]?.netWorth;
    const growth = row.netWorth !== null && Number.isFinite(previous) && previous > 0 ? (row.netWorth - previous) / previous : null;
    return { ...row, growth: Number.isFinite(growth) ? growth : null, average: null };
  });
  return result.map((row, i) => {
    const window = result.slice(i - 11, i + 1);
    return { ...row, average: i >= 11 && window.length === 12 && window.every(({ growth }) => growth !== null)
      ? window.reduce((sum, { growth }) => sum + growth, 0) / 12 : null };
  });
}

/** One public FX request for the entire period instead of one per month.
 * Match the historical view's closest available rate (earlier wins ties). */
export async function loadMonthlyExchangeRates(rows, signal, fetchRates = fetch) {
  if (!rows.length) return {};
  const url = new URL('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json');
  url.searchParams.set('start_date', shiftHistoricalDate(rows[0].date, -14));
  url.searchParams.set('end_date', shiftHistoricalDate(rows.at(-1).date, 14));
  const response = await fetchRates(url.toString(), { signal });
  if (!response.ok) throw new Error('Chart exchange rates unavailable');
  const data = await response.json();
  const observations = (data.observations ?? []).filter((row) => validHistoricalDate(row?.d) && Number(row.FXUSDCAD?.v) > 0 && Number.isFinite(Number(row.FXUSDCAD.v)));
  return Object.fromEntries(rows.map(({ month, date }) => {
    const nearest = observations.filter((row) => Math.abs(Date.parse(row.d) - Date.parse(date)) <= 14 * 86400000)
      .sort((a, b) => Math.abs(Date.parse(a.d) - Date.parse(date)) - Math.abs(Date.parse(b.d) - Date.parse(date)) || a.d.localeCompare(b.d))[0];
    return [month, nearest ? { USD: Number(nearest.FXUSDCAD.v) } : {}];
  }));
}

export async function loadNetWorthCharts(client, accounts, signal) {
  const history = await fetchNetWorthHistory(client, accounts, signal);
  const preliminary = buildMonthlyNetWorth(history);
  let rates = {}, conversionError = false;
  if ([...accounts, ...history.assets].some(({ currency }) => currency !== 'CAD') && preliminary.length) {
    try { rates = await loadMonthlyExchangeRates(preliminary, signal); }
    catch (error) { if (signal?.aborted) throw error; conversionError = true; }
  }
  return { history, rates, conversionError };
}
