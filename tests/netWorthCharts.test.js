import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonthlyGrowth, buildMonthlyNetWorth, fetchMonthlyNetWorth, loadMonthlyExchangeRates, loadNetWorthCharts } from '../src/lib/netWorthCharts.js';

const row = (month, currency = 'CAD', overrides = {}) => ({ month, currency,
  valuation_date: month === '2024-01' ? '2024-01-31' : '2024-02-29',
  assets: 100, liabilities: -20, portfolio: 50, net_worth_complete: true, portfolio_complete: true, ...overrides });
const envelope = (rows = [row('2024-01')]) => ({ version: 1, min_month: rows[0]?.month ?? null,
  max_month: rows.at(-1)?.month ?? null, latest_date: rows.at(-1)?.valuation_date ?? null, rows });
const clientFor = (data, error = null, inspect = () => {}) => ({ schema(schema) {
  assert.equal(schema, 'finance');
  return { rpc(name, args) {
    assert.equal(name, 'net_worth_monthly'); inspect(args);
    return { abortSignal: async () => ({ data, error }) };
  } };
} });

test('monthly currency totals convert to CAD before net worth and growth calculations', () => {
  const rows = buildMonthlyNetWorth([
    row('2024-01'), row('2024-01', 'USD'),
    row('2024-02', 'CAD', { assets: 200 }), row('2024-02', 'USD'),
  ], { '2024-01': { USD: 1.4 }, '2024-02': { USD: 1.5 } });
  assert.equal(rows[0].assets, 240);
  assert.equal(rows[0].liabilities, -48);
  assert.equal(rows[0].netWorth, 192);
  assert.equal(rows[0].portfolio, 120);
  assert.equal(rows[1].netWorth, 300);
  assert.equal(rows[1].growth, 108 / 192);
  assert.deepEqual(buildMonthlyNetWorth([]), []);
});

test('missing rates, incomplete sources, zero totals and overflow never fabricate values', () => {
  const missingFx = buildMonthlyNetWorth([row('2024-01', 'USD')])[0];
  assert.equal(missingFx.netWorth, null); assert.equal(missingFx.portfolio, null);
  const noPortfolioFx = buildMonthlyNetWorth([row('2024-01', 'USD', { portfolio: 0 })])[0];
  assert.equal(noPortfolioFx.netWorth, null); assert.equal(noPortfolioFx.portfolio, 0);
  const incomplete = buildMonthlyNetWorth([row('2024-01', 'CAD', { net_worth_complete: false })])[0];
  assert.equal(incomplete.netWorth, null); assert.equal(incomplete.portfolio, 50);
  const portfolioGap = buildMonthlyNetWorth([row('2024-01', 'CAD', { portfolio_complete: false })])[0];
  assert.equal(portfolioGap.netWorth, 80); assert.equal(portfolioGap.portfolio, null);
  const overflow = buildMonthlyNetWorth([row('2024-01', 'USD', { assets: 1e308 })], { '2024-01': { USD: 100 } })[0];
  assert.equal(overflow.netWorth, null);
});

test('growth requires positive baseline; full 12-month averages include history before a selected range', () => {
  const rows = addMonthlyGrowth(Array.from({ length: 14 }, (_, i) => ({ netWorth: 100 * 1.1 ** i })));
  assert.equal(rows[0].growth, null);
  assert.equal(rows[11].average, null);
  assert.ok(Math.abs(rows[12].average - 0.1) < 1e-12);
  assert.ok(Math.abs(rows.slice(13)[0].average - 0.1) < 1e-12);
  const gaps = addMonthlyGrowth([0, 100, -10, 50, null, 200].map((netWorth) => ({ netWorth })));
  assert.deepEqual(gaps.map(({ growth }) => growth), [null, null, -1.1, null, null, null]);
});

test('FX uses a single range request, closest rate, earlier tie, and no distant rate', async () => {
  let calls = 0;
  const rows = [{ month: '2024-01', date: '2024-01-31' }, { month: '2024-02', date: '2024-02-29' }, { month: '2024-03', date: '2024-03-10' }];
  const rates = await loadMonthlyExchangeRates(rows, undefined, async (url) => {
    calls++;
    assert.equal(new URL(url).searchParams.get('start_date'), '2024-01-17');
    assert.equal(new URL(url).searchParams.get('end_date'), '2024-03-24');
    return { ok: true, json: async () => ({ observations: [
      { d: '2024-02-01', FXUSDCAD: { v: '1.4' } }, { d: '2024-01-30', FXUSDCAD: { v: '1.3' } },
      { d: '2024-02-29', FXUSDCAD: { v: '-1' } },
    ] }) };
  });
  assert.equal(calls, 1);
  assert.deepEqual(rates, { '2024-01': { USD: 1.3 }, '2024-02': {}, '2024-03': {} });
  await assert.rejects(() => loadMonthlyExchangeRates(rows, undefined, async () => ({ ok: false })));
});


test('one RPC returns the complete range and forwards selection, RESP and cancellation', async () => {
  let calls = 0;
  const data = envelope([row('2024-01'), row('2024-01', 'USD'), row('2024-02'), row('2024-02', 'USD')]);
  const client = clientFor(data, null, (args) => {
    calls++; assert.deepEqual(args, { p_accounts: ['tracked'], p_include_resp: true });
  });
  assert.deepEqual(await fetchMonthlyNetWorth(client, [{ id: 'tracked' }], undefined, true), data.rows);
  assert.equal(calls, 1);
  assert.deepEqual(await fetchMonthlyNetWorth(clientFor(envelope([])), []), []);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => fetchMonthlyNetWorth(client, [{ id: 'tracked' }], aborted.signal, true), /Aborted/);
  await assert.rejects(() => fetchMonthlyNetWorth(clientFor(null, { code: 'PGRST202' }), []), /unavailable/);
  const cadOnly = await loadNetWorthCharts(clientFor(envelope()), []);
  assert.equal(cadOnly.conversionError, false);
  assert.equal(cadOnly.monthly.length, 1);
});

test('invalid or truncated RPC responses fail instead of rendering misleading totals', async () => {
  const invalid = [null, {}, { ...envelope(), version: 2 },
    envelope([row('2024-01'), row('2024-01')]),
    envelope([row('2024-01', 'CAD', { assets: 'NaN' })]),
    envelope([row('2024-01', 'CAD', { liabilities: 1 })]),
    envelope([row('2024-01', 'CAD', { net_worth_complete: null })]),
    envelope([row('2024-01', 'EUR')]),
    { ...envelope(), latest_date: '2024-02-01' },
    { ...envelope([]), min_month: '2024-01' },
    { ...envelope(), min_month: '2023-12' },
    envelope([row('2024-01'), row('2024-01', 'USD'), row('2024-02')]),
  ];
  for (const data of invalid) await assert.rejects(() => fetchMonthlyNetWorth(clientFor(data), []), /Invalid monthly/);
});
