import assert from 'node:assert/strict';
import test from 'node:test';
import { addMonthlyGrowth, buildMonthlyNetWorth, fetchNetWorthHistory, loadMonthlyExchangeRates } from '../src/lib/netWorthCharts.js';

const account = (id, name = id, currency = 'CAD') => ({ id, name, currency });
const asset = (id, name = id, type = 'ASSET', currency = 'CAD') => ({ id, name, type, currency });
const balance = (account, balance, posted_at) => ({ account, balance, posted_at });
const count = (asset, count, posted_at) => ({ asset, count, posted_at });
const price = (asset, value, posted_at) => ({ asset, value, posted_at });
const empty = () => ({ accounts: [], assets: [], balances: [], counts: [], prices: [] });

test('monthly values select latest observations, carry forward gaps and independently carry quantity/price', () => {
  const history = {
    accounts: [account('cash'), account('debt'), account('resp', ' RESP ')],
    assets: [asset('house', ' House '), asset('stock'), asset('loan', 'Loan', 'LIABILITY'), asset('future')],
    balances: [balance('cash', 150, '2024-01-31T23:59:59.999Z'), balance('cash', 100, '2024-01-01'), balance('cash', 200, '2024-03-01'),
      balance('debt', -20, '2024-01-01'), balance('resp', 50, '2024-01-01'), balance('untracked', 99999, '2020-01-01')],
    counts: [count('house', 1, '2024-01-01'), count('stock', 2, '2024-01-01'), count('stock', 3, '2024-02-01'), count('loan', 1, '2024-01-01'), count('future', 1, '2024-03-01')],
    prices: [price('house', 1000, '2024-01-01'), price('stock', 10, '2024-01-01'), price('stock', 20, '2024-03-01'), price('loan', -100, '2024-01-01'), price('future', 10, '2024-03-01')],
  };
  const rows = buildMonthlyNetWorth(history);
  assert.deepEqual(rows.map(({ month, assets, liabilities, netWorth, portfolio }) => ({ month, assets, liabilities, netWorth, portfolio })), [
    { month: '2024-01', assets: 1170, liabilities: -120, netWorth: 1050, portfolio: 170 },
    { month: '2024-02', assets: 1180, liabilities: -120, netWorth: 1060, portfolio: 180 },
    { month: '2024-03', assets: 1270, liabilities: -120, netWorth: 1150, portfolio: 270 },
  ]);
  assert.equal(rows[0].growth, null);
  assert.equal(rows[1].growth, 10 / 1050);
  const withResp = buildMonthlyNetWorth(history, {}, true);
  assert.equal(withResp[0].netWorth, 1100);
  assert.equal(withResp[0].portfolio, 170, 'RESP excluded from portfolio regardless of preference');
  assert.equal(rows.at(-1).date, '2024-03-01');
  assert.equal(rows[1].date, '2024-02-29');
});

test('missing prices and exchange rates create gaps; missing excluded holdings do not hide portfolio', () => {
  const history = { ...empty(), accounts: [account('usd', 'USD', 'USD')], assets: [asset('house', 'House')],
    balances: [balance('usd', 100, '2024-01-10'), balance('usd', 0, '2024-02-10')], counts: [count('house', 1, '2024-01-01')] };
  const missing = buildMonthlyNetWorth(history);
  assert.equal(missing[0].netWorth, null);
  assert.equal(missing[0].portfolio, null);
  assert.equal(missing[1].portfolio, 0, 'zero balances need no exchange rate');
  const converted = buildMonthlyNetWorth(history, { '2024-01': { USD: 1.4 } });
  assert.equal(converted[0].portfolio, 140);
  assert.equal(converted[0].netWorth, null, 'partially observed asset is incomplete');
  assert.deepEqual(buildMonthlyNetWorth(empty()), []);
  assert.throws(() => buildMonthlyNetWorth({ ...empty(), accounts: [account('a')], balances: [balance('a', 'NaN', '2024-01-01')] }));
});

test('portfolio follows positive balances when an account crosses zero and excludes named RESP assets', () => {
  const history = { ...empty(), accounts: [account('a')], assets: [asset('r', 'RESP')],
    counts: [count('r', 1, '2024-01-01')], prices: [price('r', 100, '2024-01-01')],
    balances: [balance('a', -20, '2024-01-01'), balance('a', 30, '2024-02-01')] };
  const rows = buildMonthlyNetWorth(history);
  assert.equal(rows[0].portfolio, 0);
  assert.equal(rows[1].portfolio, 30);
  assert.equal(rows[0].liabilities, -20);
  assert.equal(rows[1].liabilities, 0);
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

test('history is paginated, selects only tracked accounts and handles empty selections/failure', async () => {
  const calls = [];
  const accounts = [account('tracked')];
  const client = { schema(schema) {
    assert.equal(schema, 'finance');
    return { from(table) {
      const call = { table }; calls.push(call);
      const query = {
        select() { return query; }, order(key) { assert.equal(key, 'id'); return query; },
        range(start, end) { call.start = start; assert.equal(end, start + 499); return query; },
        in(key, ids) { assert.equal(key, 'account'); assert.deepEqual(ids, ['tracked']); return query; },
        abortSignal() { return Promise.resolve({ data: table === 'balance' ? Array.from({ length: call.start === 0 ? 500 : 2 }, (_, i) => ({ id: String(call.start + i) })) : [] }); },
      };
      return query;
    } };
  } };
  const result = await fetchNetWorthHistory(client, accounts);
  assert.equal(result.balances.length, 502);
  assert.equal(calls.filter(({ table }) => table === 'balance').length, 2);
  calls.length = 0;
  await fetchNetWorthHistory(client, []);
  assert.equal(calls.some(({ table }) => table === 'balance'), false);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(() => fetchNetWorthHistory(client, [], aborted.signal));
});
