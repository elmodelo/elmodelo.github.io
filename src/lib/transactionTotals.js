export const EXCHANGE_RATES_URL = 'https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1';
const CACHE_MS = 60 * 60 * 1000;

/** Cache public rates, never transaction data. Each fetcher owns its cache. */
export function createExchangeRateLoader(fetchRates = (...args) => fetch(...args), now = Date.now) {
  let cached;
  return async (signal) => {
    if (cached && now() - cached.fetchedAt < CACHE_MS) return cached.rates;
    const timeout = AbortSignal.timeout(10_000);
    const response = await fetchRates(EXCHANGE_RATES_URL, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error('Exchange rates unavailable');
    const data = await response.json();
    // Group responses include discontinued series and are not ordered by date.
    // Use only the latest day's rates so historical currencies cannot silently
    // enter a current-rate estimate.
    const observations = Array.isArray(data.observations) ? data.observations : [];
    const observation = observations.filter((entry) => entry && typeof entry.d === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(entry.d) && Number.isFinite(Date.parse(entry.d)))
      .reduce((latest, entry) => !latest || entry.d > latest.d ? entry : latest, null);
    if (!observation || !/^\d{4}-\d{2}-\d{2}$/.test(observation.d) || !Number.isFinite(Date.parse(observation.d))) throw new Error('Invalid exchange rate date');
    const rates = { date: observation.d, cadPerUnit: { CAD: 1 } };
    for (const [series, value] of Object.entries(observation)) {
      const match = /^FX([A-Z]{3})CAD$/.exec(series);
      if (!match) continue;
      const rate = Number(value?.v);
      if (Number.isFinite(rate) && rate > 0) rates.cadPerUnit[match[1]] = rate;
    }
    if (Object.keys(rates.cadPerUnit).length === 1) throw new Error('Missing exchange rates');
    cached = { fetchedAt: now(), rates };
    return rates;
  };
}
export const loadExchangeRates = createExchangeRateLoader();

export async function fetchTransactionTotals(client, { trackedAccountIds, filters, signal }) {
  if (!trackedAccountIds.length || filters.some((filter) => filter.operator === 'in' && !filter.value.length)) return [];
  const { data, error } = await client.schema('finance').rpc('filtered_transaction_totals', {
    p_accounts: trackedAccountIds, p_filters: filters,
  }).abortSignal(signal);
  if (error || !Array.isArray(data)) throw new Error('Transaction totals unavailable');
  return data.map(({ currency, amount }) => {
    if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
      || (typeof amount !== 'number' && typeof amount !== 'string') || String(amount).trim() === ''
      || !Number.isFinite(Number(amount))) throw new Error('Invalid transaction totals');
    return { currency, amount: Number(amount) };
  });
}

/** Keep signed subtotals; round only the final CAD total for display. */
export function convertTotalsToCad(totals, rates) {
  let amount = 0;
  for (const subtotal of totals) {
    const rate = subtotal.currency === 'CAD' ? 1 : rates?.cadPerUnit[subtotal.currency];
    if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Missing CAD rate for ${subtotal.currency}`);
    amount += subtotal.amount * rate;
  }
  if (!Number.isFinite(amount)) throw new Error('Invalid CAD total');
  return amount;
}

export async function loadTransactionTotal(client, options, rateLoader = loadExchangeRates) {
  const totals = await fetchTransactionTotals(client, options);
  if (!totals.some(({ currency }) => currency !== 'CAD')) {
    return { totals, cad: convertTotalsToCad(totals), rateDate: null, conversionError: false };
  }
  try {
    const rates = await rateLoader(options.signal);
    const cad = convertTotalsToCad(totals, rates);
    const exchangeRates = Object.fromEntries(totals.filter(({ currency }) => currency !== 'CAD')
      .map(({ currency }) => [currency, rates.cadPerUnit[currency]]));
    return { totals, cad, rateDate: rates.date, exchangeRates, conversionError: false };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { totals, cad: null, rateDate: null, conversionError: true };
  }
}

export function transactionTotalMessage(messages, result) {
  const format = (amount, currency) => new Intl.NumberFormat(messages.language, {
    style: 'currency', currency, currencyDisplay: 'code',
  }).format(amount);
  if (result.conversionError) return messages.transactionTotalConversionError.replace('{totals}',
    result.totals.map(({ amount, currency }) => format(amount, currency)).join(' + '));
  if (result.rateDate) {
    const rateFormatter = new Intl.NumberFormat(messages.language, { maximumFractionDigits: 20, useGrouping: false });
    const exchangeRates = Object.entries(result.exchangeRates).sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rate]) => `1 ${currency} = ${rateFormatter.format(rate)} CAD`).join('; ');
    return messages.transactionTotalEstimated.replace('{amount}', format(result.cad, 'CAD'))
      .replace('{date}', result.rateDate).replace('{rates}', exchangeRates);
  }
  return messages.transactionTotal.replace('{amount}', format(result.cad, 'CAD'));
}
