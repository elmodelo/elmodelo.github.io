import { shiftHistoricalDate, validHistoricalDate } from './historicalDates.js';

/** One read-only RPC returns every month, including zero/partial months. */
export async function fetchMonthlyNetWorth(client, accounts, signal, includeResp = false) {
  const { data, error } = await client.schema('finance').rpc('net_worth_monthly', {
    p_accounts: accounts.map(({ id }) => id), p_include_resp: includeResp,
  }).abortSignal(signal);
  if (signal?.aborted) throw new Error('Aborted');
  if (error) throw new Error('Chart history unavailable', { cause: error });
  return validateMonthlyNetWorth(data);
}

function validateMonthlyNetWorth(data) {
  const invalid = () => { throw new Error('Invalid monthly chart data'); };
  if (!data || data.version !== 1 || !Array.isArray(data.rows)) invalid();
  if (!data.rows.length) {
    if (data.min_month !== null || data.max_month !== null || data.latest_date !== null) invalid();
    return [];
  }
  const validMonth = (month) => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    && validHistoricalDate(`${month}-01`);
  if (!validMonth(data.min_month) || !validMonth(data.max_month) || data.min_month > data.max_month
    || !validHistoricalDate(data.latest_date) || data.latest_date.slice(0, 7) !== data.max_month) invalid();
  const rows = data.rows;
  const currencies = new Set();
  let previous = '';
  for (const row of rows) {
    if (!row || !validMonth(row.month) || row.month < data.min_month || row.month > data.max_month
      || !validHistoricalDate(row.valuation_date) || row.valuation_date.slice(0, 7) !== row.month
      || !['CAD', 'USD'].includes(row.currency) || typeof row.net_worth_complete !== 'boolean'
      || typeof row.portfolio_complete !== 'boolean') invalid();
    for (const field of ['assets', 'liabilities', 'portfolio']) {
      if (!['number', 'string'].includes(typeof row[field]) || String(row[field]).trim() === ''
        || !Number.isFinite(Number(row[field])) || (field === 'liabilities' ? Number(row[field]) > 0 : Number(row[field]) < 0)) invalid();
    }
    const key = `${row.month}:${row.currency}`;
    if (key <= previous) invalid();
    previous = key;
    currencies.add(row.currency);
    const expectedDate = row.month === data.max_month ? data.latest_date
      : shiftHistoricalDate(`${nextMonth(row.month)}-01`, -1);
    if (row.valuation_date !== expectedDate) invalid();
  }
  // Detect omitted months/currencies rather than quietly rendering truncated totals.
  let index = 0;
  for (let month = data.min_month; month <= data.max_month; month = nextMonth(month)) {
    for (const currency of [...currencies].sort()) {
      if (rows[index]?.month !== month || rows[index]?.currency !== currency) invalid();
      index++;
    }
  }
  if (index !== rows.length) invalid();
  return rows;
}

const nextMonth = (month) => {
  const [year, number] = month.split('-').map(Number);
  return `${String(year + (number === 12 ? 1 : 0)).padStart(4, '0')}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}`;
};

/** FX stays client-side; aggregate each currency before converting, with
 * independent completeness for net worth and the positive-only portfolio. */
export function buildMonthlyNetWorth(monthly, rates = {}) {
  const grouped = new Map();
  for (const row of monthly) {
    const group = grouped.get(row.month) ?? { month: row.month, date: row.valuation_date,
      assets: 0, liabilities: 0, portfolio: 0, complete: true, portfolioComplete: true };
    const rate = row.currency === 'CAD' ? 1 : rates[row.month]?.[row.currency];
    const convert = (value) => Number(value) === 0 ? 0
      : Number.isFinite(rate) && rate > 0 ? Number(value) * rate : null;
    const assets = convert(row.assets), liabilities = convert(row.liabilities), portfolio = convert(row.portfolio);
    if (!row.net_worth_complete || assets === null || liabilities === null) group.complete = false;
    if (!row.portfolio_complete || portfolio === null) group.portfolioComplete = false;
    group.assets += assets ?? 0;
    group.liabilities += liabilities ?? 0;
    group.portfolio += portfolio ?? 0;
    grouped.set(row.month, group);
  }
  return addMonthlyGrowth([...grouped.values()].map((group) => {
    const complete = group.complete && Number.isFinite(group.assets) && Number.isFinite(group.liabilities)
      && Number.isFinite(group.assets + group.liabilities);
    return { month: group.month, date: group.date,
      assets: complete ? group.assets : null, liabilities: complete ? group.liabilities : null,
      netWorth: complete ? group.assets + group.liabilities : null,
      portfolio: group.portfolioComplete && Number.isFinite(group.portfolio) ? group.portfolio : null };
  }));
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

export async function loadNetWorthCharts(client, accounts, signal, includeResp = false) {
  const monthly = await fetchMonthlyNetWorth(client, accounts, signal, includeResp);
  const preliminary = buildMonthlyNetWorth(monthly);
  let rates = {}, conversionError = false;
  if (monthly.some((row) => row.currency !== 'CAD' && (Number(row.assets) || Number(row.liabilities) || Number(row.portfolio)))) {
    try { rates = await loadMonthlyExchangeRates(preliminary, signal); }
    catch (error) { if (signal?.aborted) throw error; conversionError = true; }
  }
  return { monthly, rates, conversionError };
}
