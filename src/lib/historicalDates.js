const DAY_MS = 86400000;

export function validHistoricalDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function shiftHistoricalDate(date, days) {
  if (!validHistoricalDate(date)) throw new Error('Invalid historical date');
  return new Date(Date.parse(date) + days * DAY_MS).toISOString().slice(0, 10);
}

// Use an exclusive UTC next-day boundary, retaining all observations on the
// selected calendar day without truncating fractional seconds.
export function historicalCutoff(date) {
  return date == null ? null : `${shiftHistoricalDate(date, 1)}T00:00:00.000Z`;
}

export function historicalDateChoices(bounds, date) {
  const [year, month] = date.split('-').map(Number);
  const [firstYear, firstMonth, firstDay] = bounds.min.split('-').map(Number);
  const [lastYear, lastMonth, lastDay] = bounds.max.split('-').map(Number);
  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return {
    years: range(firstYear, lastYear),
    months: range(year === firstYear ? firstMonth : 1, year === lastYear ? lastMonth : 12),
    days: range(year === firstYear && month === firstMonth ? firstDay : 1,
      year === lastYear && month === lastMonth ? lastDay : new Date(Date.UTC(year, month, 0)).getUTCDate()),
  };
}

export function clampHistoricalDate(bounds, year, month, day) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const date = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  return date < bounds.min ? bounds.min : date > bounds.max ? bounds.max : date;
}

export async function fetchNetWorthDateBounds(client, accounts, signal) {
  const queries = [];
  const addBounds = (table, ids) => {
    for (const ascending of [true, false]) {
      let query = client.schema('finance').from(table).select('posted_at');
      if (ids) query = query.in('account', ids);
      queries.push(query.order('posted_at', { ascending }).limit(1).abortSignal(signal));
    }
  };
  for (let offset = 0; offset < accounts.length; offset += 100) {
    addBounds('balance', accounts.slice(offset, offset + 100).map(({ id }) => id));
  }
  addBounds('asset_count');
  addBounds('asset_value');
  const responses = await Promise.all(queries);
  if (signal?.aborted) throw new Error('Aborted');
  const dates = responses.flatMap(({ data, error }) => {
    if (error || !Array.isArray(data) || data.length > 1) throw new Error('Historical bounds unavailable', { cause: error });
    return data.map(({ posted_at }) => {
      if (typeof posted_at !== 'string' || !Number.isFinite(Date.parse(posted_at))) throw new Error('Invalid historical bounds');
      return new Date(posted_at).toISOString().slice(0, 10);
    });
  }).sort();
  return dates.length ? { min: dates[0], max: dates.at(-1) } : null;
}
