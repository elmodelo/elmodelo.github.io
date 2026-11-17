import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import {
  createExchangeRateLoader, EXCHANGE_RATES_URL, fetchTransactionTotals,
  convertTotalsToCad, loadTransactionTotal, transactionTotalMessage,
} from '../src/lib/transactionTotals.js';

const options = { trackedAccountIds: ['tracked'], filters: [{ field: 'amount', operator: 'lt', value: 0 }] };
const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
function clientFor(rows, onRequest = () => {}) {
  return createClient('http://127.0.0.1:54321', 'test-key', {
    global: { fetch: async (url, init) => { onRequest(new URL(url), init); return json(rows); } },
  });
}

test('totals use one aggregate RPC for the complete filter, retaining tracked accounts and cancellation', async () => {
  const signal = new AbortController().signal;
  const filters = [
    ...options.filters, { field: 'category', operator: 'is', value: null },
    { field: 'description', operator: 'search', value: 'coffee shop' },
  ];
  let requests = 0;
  const client = clientFor([{ currency: 'USD', amount: '-10.50' }, { currency: 'CAD', amount: 25 }], (url, init) => {
    requests++;
    assert.equal(url.pathname, '/rest/v1/rpc/filtered_transaction_totals');
    assert.deepEqual(JSON.parse(init.body), { p_accounts: ['tracked'], p_filters: filters });
    assert.equal(new Headers(init.headers).get('content-profile'), 'finance');
    assert.equal(init.signal, signal);
    assert.equal(url.searchParams.has('limit'), false);
    assert.equal(url.searchParams.has('offset'), false);
  });
  assert.deepEqual(await fetchTransactionTotals(client, { ...options, filters, signal }), [
    { currency: 'USD', amount: -10.5 }, { currency: 'CAD', amount: 25 },
  ]);
  assert.equal(requests, 1);
});

test('no tracked accounts or an explicit empty multiselect returns zero without database or exchange requests', async () => {
  const client = { schema() { assert.fail('Unexpected database query'); } };
  for (const empty of [
    { trackedAccountIds: [], filters: [] },
    { ...options, filters: [{ field: 'account', operator: 'in', value: [] }] },
    { ...options, filters: [{ field: 'category', operator: 'in', value: [] }] },
  ]) {
    assert.deepEqual(await loadTransactionTotal(client, empty, () => assert.fail('Unexpected rate request')),
      { totals: [], cad: 0, rateDate: null, conversionError: false });
  }
});

test('CAD-only totals never need exchange rates; mixed currencies retain signs and convert once', async () => {
  const cad = await loadTransactionTotal(clientFor([{ currency: 'CAD', amount: '-15.25' }]), options,
    () => assert.fail('CAD needs no exchange rate'));
  assert.equal(cad.cad, -15.25);
  assert.equal(cad.rateDate, null);
  const mixed = await loadTransactionTotal(clientFor([
    { currency: 'CAD', amount: 100 }, { currency: 'USD', amount: -10 },
  ]), options, async () => ({ date: '2026-11-16', cadPerUnit: { USD: 1.375 } }));
  assert.equal(mixed.cad, 86.25);
  assert.equal(mixed.rateDate, '2026-11-16');
  assert.deepEqual(mixed.exchangeRates, { USD: 1.375 });
  assert.equal(convertTotalsToCad([{ currency: 'USD', amount: 0.01 }], { cadPerUnit: { USD: 1.375 } }), 0.01375);
});

test('rate outages and missing currencies preserve native subtotals without reporting a partial CAD total', async () => {
  const rows = [{ currency: 'CAD', amount: 10 }, { currency: 'USD', amount: -5 }];
  for (const loader of [
    async () => { throw new Error('Offline'); },
    async () => ({ date: '2026-11-16', cadPerUnit: { EUR: 1.5 } }),
  ]) {
    const result = await loadTransactionTotal(clientFor(rows), options, loader);
    assert.deepEqual(result, { totals: rows, cad: null, rateDate: null, conversionError: true });
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadTransactionTotal(clientFor(rows), { ...options, signal: controller.signal }, async () => {
    throw new Error('Aborted');
  }));
});

test('public rates are parsed as CAD per foreign unit and cached for one hour, preserving the observation date', async () => {
  let now = 0;
  let requests = 0;
  const load = createExchangeRateLoader(async (url, init) => {
    assert.equal(url, EXCHANGE_RATES_URL);
    assert.ok(init.signal instanceof AbortSignal);
    requests++;
    return json({ observations: [{ d: '2026-11-16', FXUSDCAD: { v: '1.3750' }, FXEURCAD: { v: '1.5' }, FXBADCAD: { v: '-1' } }] });
  }, () => now);
  const first = await load();
  assert.deepEqual(first, { date: '2026-11-16', cadPerUnit: { CAD: 1, USD: 1.375, EUR: 1.5 } });
  now = 3599999;
  assert.equal(await load(), first);
  assert.equal(requests, 1);
  now = 3600000;
  await load();
  assert.equal(requests, 2);
});

test('live API response shape: newest daily rates can precede older discontinued-currency observations', async () => {
  const observations = [
    { d: '2019-12-31', FXVNDCAD: { v: '0.000056' } },
    { d: '2026-11-17', FXUSDCAD: { v: '1.4291' }, FXEURCAD: { v: '1.5726' } },
    { d: '2026-04-30', FXRUBCAD: { v: '0.01819' }, FXSARCAD: { v: '0.3633' } },
  ];
  for (const entries of [observations, [...observations].reverse()]) {
    const load = createExchangeRateLoader(async () => json({ observations: entries }));
    const rates = await load();
    assert.equal(rates.date, '2026-11-17');
    assert.equal(rates.cadPerUnit.USD, 1.4291);
    assert.equal(rates.cadPerUnit.RUB, undefined);
    assert.equal(rates.cadPerUnit.VND, undefined);
    const result = await loadTransactionTotal(clientFor([{ currency: 'USD', amount: 100 }]), options, load);
    assert.equal(result.conversionError, false);
    assert.equal(result.cad, 142.91);
    assert.equal(result.rateDate, '2026-11-17');
  }
});

test('invalid rate responses and invalid aggregate data fail visibly and can be retried', async () => {
  for (const data of [{}, { observations: [] }, { observations: [{ d: 'invalid', FXUSDCAD: { v: '1.4' } }] },
    { observations: [{ d: '2026-11-16', FXUSDCAD: { v: '0' } }] }]) {
    let calls = 0;
    const load = createExchangeRateLoader(async () => { calls++; return json(data); });
    await assert.rejects(load());
    await assert.rejects(load());
    assert.equal(calls, 2);
  }
  await assert.rejects(createExchangeRateLoader(async () => new Response('', { status: 503 }))());
  for (const data of [null, [{ currency: null, amount: 1 }], [{ currency: 'CAD', amount: null }],
    [{ currency: 'CAD', amount: 'NaN' }], [{ currency: 'CAD', amount: ' ' }]]) {
    await assert.rejects(fetchTransactionTotals(clientFor(data), options));
  }
  const errorClient = createClient('http://127.0.0.1:54321', 'test-key', {
    global: { fetch: async () => new Response('{"message":"denied"}', { status: 403 }) },
  });
  await assert.rejects(fetchTransactionTotals(errorClient, options));
});

test('total messages localize currencies, distinguish estimated totals, and disclose the actual rate date', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const locale of ['en', 'es']) {
      const messages = getLocaleMessages(locale);
      assert.match(transactionTotalMessage(messages, { cad: 5, rateDate: null }), /CAD/);
      const converted = transactionTotalMessage(messages, { cad: 5, rateDate: '2026-11-16', exchangeRates: { USD: 1.4291, JPY: 0.00897 } });
      assert.match(converted, /2026-11-16/);
      assert.match(converted, /estimat|estimado/i);
      assert.ok(converted.includes(locale === 'en' ? '1 USD = 1.4291 CAD' : '1 USD = 1,4291 CAD'));
      assert.ok(converted.includes(locale === 'en' ? '1 JPY = 0.00897 CAD' : '1 JPY = 0,00897 CAD'));
      assert.ok(!converted.includes('1 CAD ='));
      assert.ok(!converted.includes('{rates}'));
      const fallback = transactionTotalMessage(messages, { conversionError: true, totals: [{ currency: 'CAD', amount: 5 }, { currency: 'USD', amount: -2 }] });
      assert.match(fallback, /CAD/);
      assert.match(fallback, /USD/);
      assert.ok(!fallback.includes('undefined'));
    }
  } finally { await server.close(); }
});
