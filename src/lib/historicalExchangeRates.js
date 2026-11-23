import { shiftHistoricalDate, validHistoricalDate } from './historicalDates.js';

const DAY_MS = 86400000;
const HOUR_MS = 3600000;

function withCancellation(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Public rates only. Shared requests have their own timeout, so canceling an
 * obsolete panel selection does not cancel another consumer of the same date. */
export function createHistoricalExchangeRateLoader(fetchRates = (...args) => fetch(...args), now = Date.now) {
  const cache = new Map();
  const pending = new Map();
  const fetchDate = async (date) => {
    for (const days of [3, 7, 14]) {
      const url = new URL('https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json');
      url.searchParams.set('start_date', shiftHistoricalDate(date, -days));
      url.searchParams.set('end_date', shiftHistoricalDate(date, days));
      const response = await fetchRates(url.toString(), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Historical exchange rates unavailable');
      const data = await response.json();
      const observations = (Array.isArray(data.observations) ? data.observations : [])
        .filter((row) => validHistoricalDate(row?.d) && row.d >= shiftHistoricalDate(date, -days)
          && row.d <= shiftHistoricalDate(date, days) && Number.isFinite(Number(row.FXUSDCAD?.v)) && Number(row.FXUSDCAD?.v) > 0)
        .sort((a, b) => Math.abs(Date.parse(a.d) - Date.parse(date)) - Math.abs(Date.parse(b.d) - Date.parse(date))
          || a.d.localeCompare(b.d));
      if (observations.length) {
        const observation = observations[0];
        const rates = { date: observation.d, cadPerUnit: { CAD: 1, USD: Number(observation.FXUSDCAD.v) } };
        cache.set(date, { rates, fetchedAt: now() });
        if (cache.size > 256) cache.delete(cache.keys().next().value);
        return rates;
      }
    }
    throw new Error('No nearby USD exchange rate');
  };
  return async (date, signal) => {
    if (!validHistoricalDate(date)) throw new Error('Invalid historical date');
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    const cached = cache.get(date);
    const old = now() - Date.parse(date) > 7 * DAY_MS;
    if (cached && (old || now() - cached.fetchedAt < HOUR_MS)) return cached.rates;
    if (!pending.has(date)) {
      const request = fetchDate(date).finally(() => pending.delete(date));
      pending.set(date, request);
    }
    return withCancellation(pending.get(date), signal);
  };
}

export const loadHistoricalExchangeRates = createHistoricalExchangeRateLoader();
