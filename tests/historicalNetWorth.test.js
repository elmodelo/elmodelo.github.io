import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchLatestBalances, loadNetWorth } from '../src/lib/netWorth.js';
import { fetchLatestAssets } from '../src/lib/assets.js';
import { fetchNetWorthDateBounds, historicalCutoff, historicalDateChoices, clampHistoricalDate } from '../src/lib/historicalDates.js';
import { createHistoricalExchangeRateLoader } from '../src/lib/historicalExchangeRates.js';

const accounts = [{ id: 'checking', name: 'Checking', currency: 'CAD' }];
const clientFor = (handler) => createClient('http://127.0.0.1:54321', 'test', {
  global: { fetch: async (url, init) => {
    const response = await handler(new URL(url), init);
    return new Response(JSON.stringify(response.data ?? response), { status: response.status ?? 200,
      headers: { 'content-type': 'application/json' } });
  } },
});
const ratesResponse = (observations) => new Response(JSON.stringify({ observations }));
const rate = (d, v = '1.35') => ({ d, FXUSDCAD: { v } });

test('UTC calendar cutoff includes the selected day and validates leap days', () => {
  assert.equal(historicalCutoff('2024-02-29'), '2024-03-01T00:00:00.000Z');
  assert.equal(historicalCutoff('2023-12-31'), '2024-01-01T00:00:00.000Z');
  assert.equal(historicalCutoff(null), null);
  for (const date of ['2023-02-29', '2024-02-30', '', '2024-1-01', 'garbage']) assert.throws(() => historicalCutoff(date));
});

test('year/month/day choices honor both database bounds and clamp month changes', () => {
  const bounds = { min: '2020-08-23', max: '2026-11-01' };
  assert.deepEqual(historicalDateChoices(bounds, bounds.min).years, [2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(historicalDateChoices(bounds, bounds.min).months, [8, 9, 10, 11, 12]);
  assert.equal(historicalDateChoices(bounds, bounds.min).days[0], 23);
  assert.equal(historicalDateChoices(bounds, bounds.max).months.at(-1), 11);
  assert.deepEqual(historicalDateChoices(bounds, bounds.max).days, [1]);
  assert.equal(clampHistoricalDate(bounds, 2024, 2, 31), '2024-02-29');
  assert.equal(clampHistoricalDate(bounds, 2023, 2, 31), '2023-02-28');
  assert.equal(clampHistoricalDate(bounds, 2020, 1, 1), bounds.min);
  assert.equal(clampHistoricalDate(bounds, 2026, 12, 31), bounds.max);
});

test('bounds query only requests first/last timestamps for tracked balances and both asset histories', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const bounds = await fetchNetWorthDateBounds(clientFor((url, init) => {
    calls.push(url);
    assert.equal(url.searchParams.get('select'), 'posted_at');
    assert.equal(url.searchParams.get('limit'), '1');
    assert.equal(init.signal, signal);
    if (url.pathname.endsWith('/balance')) assert.equal(url.searchParams.get('account'), 'in.(checking)');
    const early = url.searchParams.get('order') === 'posted_at.asc';
    return [{ posted_at: early ? (url.pathname.endsWith('/asset_value') ? '2020-08-23T17:00:00Z' : '2022-01-01T17:00:00Z') : '2026-11-23T17:00:00Z' }];
  }), accounts, signal);
  assert.deepEqual(bounds, { min: '2020-08-23', max: '2026-11-23' });
  assert.equal(calls.length, 6);
  assert.ok(calls.every((url) => !url.pathname.includes('/rpc/')));
  assert.equal(await fetchNetWorthDateBounds(clientFor(() => []), []), null);
  await assert.rejects(fetchNetWorthDateBounds(clientFor(() => ({ data: { message: 'denied' }, status: 403 })), accounts));
});

test('historical queries filter each embedded series before limiting and preserve zero and missing data', async () => {
  const signal = new AbortController().signal;
  const balance = await fetchLatestBalances(clientFor((url, init) => {
    assert.equal(url.searchParams.get('balance.posted_at'), 'lt.2024-03-01T00:00:00.000Z');
    assert.equal(url.searchParams.get('balance.order'), 'posted_at.desc');
    assert.equal(url.searchParams.get('balance.limit'), '1');
    assert.equal(init.signal, signal);
    return [{ id: 'checking', balance: [{ balance: 0, posted_at: '2024-01-01T17:00:00Z' }] }];
  }), accounts, signal, '2024-02-29');
  assert.equal(balance[0].snapshot.amount, 0);
  const assets = await fetchLatestAssets(clientFor((url) => {
    for (const table of ['asset_count', 'asset_value']) {
      assert.equal(url.searchParams.get(`${table}.posted_at`), 'lt.2024-03-01T00:00:00.000Z');
      assert.equal(url.searchParams.get(`${table}.limit`), '1');
    }
    return [{ id: 'loan', name: 'Loan', currency: 'CAD', type: 'LIABILITY',
      asset_count: [{ count: 1, posted_at: '2023-01-01T17:00:00Z' }],
      asset_value: [{ value: 0, posted_at: '2024-01-01T17:00:00Z' }] },
    { id: 'new', name: 'Later asset', currency: 'USD', type: 'ASSET', asset_count: [], asset_value: [] }];
  }), signal, '2024-02-29');
  assert.equal(assets[0].snapshot.amount, 0);
  assert.equal(assets[0].count.postedAt, '2023-01-01T17:00:00Z');
  assert.equal(assets[0].price.postedAt, '2024-01-01T17:00:00Z');
  assert.equal(assets[1].snapshot, null);
});

test('historical view excludes nonexistent accounts/assets/liabilities before computing completeness', async () => {
  const selection = [...accounts, { id: 'later-account', name: 'Later account', currency: 'CAD' }];
  const client = clientFor((url) => url.pathname.endsWith('/account') ? [
    { id: 'checking', balance: [{ balance: 100, posted_at: '2023-01-01T17:00:00Z' }] },
    { id: 'later-account', balance: [] },
  ] : [
    ...['ASSET', 'LIABILITY'].map((type) => ({ id: `later-${type}`, name: `Later ${type}`, currency: 'CAD', type, asset_count: [], asset_value: [] })),
    { id: 'zero', name: 'Paid off', currency: 'CAD', type: 'LIABILITY',
      asset_count: [{ count: 1, posted_at: '2023-01-01T17:00:00Z' }], asset_value: [{ value: 0, posted_at: '2023-01-01T17:00:00Z' }] },
  ]);
  const historical = await loadNetWorth(client, selection, undefined, null, true, false, '2024-02-29');
  assert.deepEqual(historical.rows.map(({ id }) => id), ['checking', 'zero']);
  assert.equal(historical.total, 100);
  assert.equal(historical.incomplete, false);
  const current = await loadNetWorth(client, selection, undefined, null, true);
  assert.equal(current.rows.length, 5);
  assert.equal(current.incomplete, true);
});

test('an asset with one historical metric still exists and is flagged incomplete', async () => {
  const result = await loadNetWorth(clientFor(() => [{ id: 'partial', name: 'Partial', currency: 'CAD', type: 'ASSET',
    asset_count: [{ count: 1, posted_at: '2023-01-01T17:00:00Z' }], asset_value: [] }]), [], undefined, null, true, false, '2024-02-29');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].snapshot, null);
  assert.equal(result.incomplete, true);
});

test('historical totals use selected-date FX, not the snapshot date, and retain RESP exclusion', async () => {
  const selection = [{ id: 'checking', name: 'Checking', currency: 'USD' }, { id: 'resp', name: 'RESP', currency: 'CAD' }];
  const result = await loadNetWorth(clientFor(() => [
    { id: 'checking', balance: [{ balance: 100, posted_at: '2020-01-01T17:00:00Z' }] },
    { id: 'resp', balance: [{ balance: 500, posted_at: '2024-02-28T17:00:00Z' }] },
  ]), selection, undefined, createHistoricalExchangeRateLoader(async () => ratesResponse([rate('2024-02-29', '1.4')])).bind(null, '2024-02-29'), false, false, '2024-02-29');
  assert.equal(result.total, 140);
  assert.equal(result.rateDate, '2024-02-29');
  assert.equal(result.rows[1].excludedFromNetWorth, true);
});

test('BoC uses +/-3 days, nearest valid observation, earlier tie, and date-specific cache', async () => {
  let calls = 0;
  const loader = createHistoricalExchangeRateLoader(async (url) => {
    calls++;
    const parsed = new URL(url);
    assert.ok(parsed.pathname.endsWith('/FXUSDCAD/json'));
    assert.equal(parsed.searchParams.get('start_date'), '2023-06-07');
    assert.equal(parsed.searchParams.get('end_date'), '2023-06-13');
    return ratesResponse([rate('2023-06-11', '1.4'), rate('2023-06-09', '1.3'), rate('2023-06-10', 'NaN'), rate('invalid'), rate('2023-06-10', '0')]);
  });
  const result = await loader('2023-06-10');
  assert.equal(result.date, '2023-06-09');
  assert.equal(result.cadPerUnit.USD, 1.3);
  assert.deepEqual(await loader('2023-06-10'), result);
  assert.equal(calls, 1);
});

test('empty BoC windows expand; failures are not cached and exhaustion fails', async () => {
  const windows = [];
  const loader = createHistoricalExchangeRateLoader(async (url) => {
    windows.push(new URL(url).searchParams.get('start_date'));
    return ratesResponse(windows.length === 1 ? [] : [rate('2023-06-06')]);
  });
  assert.equal((await loader('2023-06-10')).date, '2023-06-06');
  assert.deepEqual(windows, ['2023-06-07', '2023-06-03']);
  let calls = 0;
  const retry = createHistoricalExchangeRateLoader(async () => {
    if (++calls === 1) throw new Error('offline');
    return ratesResponse([rate('2023-06-10')]);
  });
  await assert.rejects(retry('2023-06-10'));
  assert.equal((await retry('2023-06-10')).date, '2023-06-10');
  assert.equal(calls, 2);
  await assert.rejects(createHistoricalExchangeRateLoader(async () => ratesResponse([]))('2023-06-10'));
});

test('near-today cache expires after an hour; historical cache stays valid across dates', async () => {
  let now = Date.parse('2026-11-23T18:00:00Z');
  let calls = 0;
  const loader = createHistoricalExchangeRateLoader(async (url) => {
    calls++;
    const start = new URL(url).searchParams.get('start_date');
    return ratesResponse([rate(start === '2026-11-19' ? '2026-11-22' : '2020-01-01')]);
  }, () => now);
  await loader('2026-11-22');
  await loader('2020-01-01');
  now += 3600001;
  await loader('2026-11-22');
  await loader('2020-01-01');
  assert.equal(calls, 3);
});

test('same-date concurrent callers share a fetch; canceling one leaves the other working', async () => {
  let release;
  let calls = 0;
  const loader = createHistoricalExchangeRateLoader(() => { calls++; return new Promise((resolve) => { release = resolve; }); });
  const controller = new AbortController();
  const first = loader('2023-06-10', controller.signal);
  const second = loader('2023-06-10');
  const rejected = assert.rejects(first, { name: 'AbortError' });
  controller.abort();
  release(ratesResponse([rate('2023-06-09')]));
  await rejected;
  assert.equal((await second).date, '2023-06-09');
  assert.equal(calls, 1);
});

test('localized bounded date form and read-only asset card retain accessible labels', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { HistoricalDateForm } = await server.ssrLoadModule('/src/components/HistoricalNetWorthDialog.tsx');
    const { default: Card } = await server.ssrLoadModule('/src/components/AssetCard.tsx');
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const form = renderToStaticMarkup(createElement(HistoricalDateForm, {
        bounds: { min: '2024-02-28', max: '2024-03-01' }, selectedDate: '2024-02-29', messages, onSelect() {}, onClose() {},
      }));
      assert.equal((form.match(/<select/g) ?? []).length, 3);
      assert.match(form, /value="29" selected/);
      assert.doesNotMatch(form, /value="2023"|value="2025"|value="30"/);
      assert.ok(form.includes(messages.netWorthHistoryApply));
      const asset = { id: 'house', name: 'House', currency: 'CAD', kind: 'asset', type: 'ASSET', count: null, price: null, snapshot: null };
      const card = renderToStaticMarkup(createElement(PermissionsProvider, { role: 'WRITER' }, createElement(Card, { asset, messages, readOnly: true, onSaved() {} })));
      assert.ok(card.includes(messages.assetMissing));
      assert.doesNotMatch(card, /aria-haspopup/);
    }
  } finally { await server.close(); }
});
