import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchLatestBalances, loadNetWorth, netWorthRateMessage, netWorthAllocation, sortNetWorthAccounts } from '../src/lib/netWorth.js';

const accounts = [
  { id: 'usd', name: 'Z savings', currency: 'USD' },
  { id: 'cad', name: 'A checking', currency: 'CAD' },
  { id: 'missing', name: 'Missing', currency: 'CAD' },
];
const snapshots = [
  { id: 'usd', balance: [{ balance: '-10.25', posted_at: '2026-11-20T00:00:00Z' }] },
  { id: 'cad', balance: [{ balance: '100', posted_at: '2026-11-19T00:00:00Z' }] },
  { id: 'missing', balance: [] },
];
function clientFor(data, inspect = () => {}) {
  return createClient('http://127.0.0.1:54321', 'test', {
    global: { fetch: async (url, init) => {
      inspect(new URL(url), init);
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    } },
  });
}
const rates = async () => ({ date: '2026-11-20', cadPerUnit: { USD: 1.375 } });

test('latest balance query limits each account relation, retains missing accounts, and cancels', async () => {
  const signal = new AbortController().signal;
  let requests = 0;
  const rows = await fetchLatestBalances(clientFor(snapshots, (url, init) => {
    requests++;
    assert.equal(url.pathname, '/rest/v1/account');
    assert.equal(url.searchParams.get('select'), 'id,balance(balance,posted_at)');
    assert.equal(url.searchParams.get('balance.order'), 'posted_at.desc');
    assert.equal(url.searchParams.get('balance.limit'), '1');
    assert.equal(url.searchParams.has('limit'), false);
    assert.equal(url.searchParams.get('id'), 'in.(usd,cad,missing)');
    assert.equal(init.signal, signal);
    assert.equal(new Headers(init.headers).get('accept-profile'), 'finance');
  }), accounts, signal);
  assert.equal(requests, 1);
  assert.equal(rows[0].snapshot.amount, -10.25);
  assert.equal(rows[2].snapshot, null);
});

test('signed USD conversion sums without intermediate rounding and flags missing balances', async () => {
  const result = await loadNetWorth(clientFor(snapshots), accounts, undefined, rates);
  assert.equal(result.total, 100 - 10.25 * 1.375);
  assert.equal(result.rows[0].snapshot.amount, -10.25);
  assert.equal(result.rows[0].cad, -14.09375);
  assert.equal(result.incomplete, true);
  assert.equal(result.conversionError, false);
  assert.equal(result.rateDate, '2026-11-20');
});

test('outage or missing USD rate retains original balances and suppresses partial total', async () => {
  for (const loader of [async () => { throw new Error('offline'); }, async () => ({ date: '2026-11-20', cadPerUnit: {} })]) {
    const result = await loadNetWorth(clientFor(snapshots), accounts, undefined, loader);
    assert.equal(result.total, null);
    assert.equal(result.conversionError, true);
    assert.equal(result.rows[0].snapshot.amount, -10.25);
    assert.equal(result.rows[0].cad, null);
    assert.equal(result.rows[1].cad, 100);
  }
});

test('zero and CAD-only balances require no rates; empty accounts require no requests', async () => {
  const noRates = () => assert.fail('Unexpected rate request');
  const zero = await loadNetWorth(clientFor([{ id: 'cad', balance: [{ balance: '0', posted_at: '2026-11-20' }] }]), [accounts[1]], undefined, noRates);
  assert.equal(zero.total, 0);
  assert.equal(zero.incomplete, false);
  assert.equal(zero.rows[0].cad, 0);
  const empty = await loadNetWorth({ schema() { assert.fail('Unexpected query'); } }, [], undefined, noRates);
  assert.equal(empty.total, 0);
});

test('bad data and database failures do not produce a misleading total', async () => {
  for (const invalid of [null, { message: 'denied' }, [{ id: 'usd', balance: [{ balance: null, posted_at: '2026-11-20' }] }],
    [{ id: 'usd', balance: [{ balance: 'NaN', posted_at: '2026-11-20' }] }],
    [{ id: 'usd', balance: [{ balance: 1, posted_at: 'invalid' }] }]]) {
    await assert.rejects(loadNetWorth(clientFor(invalid), accounts, undefined, rates));
  }
});

test('account batches avoid truncation of balance results', async () => {
  const many = Array.from({ length: 205 }, (_, i) => ({ id: `account-${i}`, name: `Account ${i}`, currency: 'CAD' }));
  const requests = [];
  const result = await fetchLatestBalances(clientFor([], (url) => requests.push(url.searchParams.get('id'))), many);
  assert.equal(requests.length, 3);
  assert.ok(requests[2].includes('account-204'));
  assert.equal(result.length, 205);
});

test('localized account table retains USD and CAD, sorts names, and reports exact rate', async () => {
  // Importing the panel initializes its client; rendering the table makes no requests.
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { NetWorthTable } = await server.ssrLoadModule('/src/components/NetWorthPanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const result = await loadNetWorth(clientFor(snapshots), accounts, undefined, rates);
    for (const locale of ['en', 'es']) {
      const messages = getLocaleMessages(locale);
      const markup = renderToStaticMarkup(createElement(NetWorthTable, { messages, result, titleId: 'net-worth' }));
      assert.ok(markup.indexOf('A checking') < markup.indexOf('Z savings'));
      assert.equal((markup.match(/class="sort-button"/g) ?? []).length, 4);
      assert.match(markup, /aria-sort="descending"/);
      const reorderedNames = { ...result, rows: result.rows.map((row) => ({ ...row,
        name: row.id === 'cad' ? 'Z highest' : row.id === 'usd' ? 'A negative' : row.name })) };
      const sorted = renderToStaticMarkup(createElement(NetWorthTable, { messages, result: reorderedNames, titleId: 'sorted' }));
      assert.ok(sorted.indexOf('Z highest') < sorted.indexOf('A negative'), 'Default sorting uses CAD balance rather than name');
      assert.match(markup, /USD/);
      assert.match(markup, /CAD/);
      const format = (amount, currency) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);
      assert.ok(markup.includes(format(-10.25, 'USD')));
      assert.ok(markup.includes(format(-14.09375, 'CAD')));
      assert.ok(markup.includes(messages.netWorthMissing));
      assert.match(markup, /dateTime="2026-11-20T00:00:00Z"/);
      const message = netWorthRateMessage(messages, result);
      assert.ok(message.includes('2026-11-20'));
      assert.ok(message.includes(locale === 'en' ? '1 USD = 1.375 CAD' : '1 USD = 1,375 CAD'));
    }
  } finally { await server.close(); }
});


test('allocation excludes nonpositive balances and uses signed CAD net worth for labels', () => {
  const rows = [
    { id: 'usd', name: 'USD savings', cad: 150 },
    { id: 'cad', name: 'CAD savings', cad: 50 },
    { id: 'debt', name: 'Debt', cad: -100 },
    { id: 'zero', name: 'Empty', cad: 0 },
    { id: 'missing', name: 'Missing', cad: null },
  ];
  const allocation = netWorthAllocation({ rows, total: 100 });
  assert.deepEqual(allocation.map(({ id, pieShare, netWorthShare }) => ({ id, pieShare, netWorthShare })), [
    { id: 'usd', pieShare: 0.75, netWorthShare: 1.5 },
    { id: 'cad', pieShare: 0.25, netWorthShare: 0.5 },
  ]);
  for (const total of [0, -50, null]) {
    assert.ok(netWorthAllocation({ rows, total }).every(({ netWorthShare }) => netWorthShare === null));
  }
  assert.deepEqual(netWorthAllocation({ rows: rows.slice(2), total: -100 }), []);
});

test('allocation card renders a single-account pie, debt shares, and safe empty/error states', async () => {
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: Card } = await server.ssrLoadModule('/src/components/NetWorthAllocationCard.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const render = (result) => renderToStaticMarkup(createElement(Card, { messages, result }));
      const single = { rows: [{ id: 'positive', name: 'Savings', cad: 150 }], total: 150, incomplete: false, conversionError: false };
      const markup = render(single);
      assert.match(markup, /<circle/);
      assert.match(markup, /role="img"/);
      assert.match(markup, /100/);
      const debt = render({ ...single, rows: [...single.rows, { id: 'negative', name: 'Debt account', cad: -50 }], total: 100 });
      assert.match(debt, /150/);
      assert.ok(debt.includes(messages.netWorthAllocationDebt));
      assert.ok(!debt.includes('Debt account'));
      const zero = render({ ...single, total: 0 });
      assert.ok(zero.includes(messages.netWorthAllocationNonpositive));
      assert.doesNotMatch(zero, /NaN|Infinity/);
      const incomplete = render({ ...single, incomplete: true });
      assert.ok(incomplete.includes(messages.netWorthIncomplete));
      const outage = render({ ...single, total: null, conversionError: true });
      assert.ok(outage.includes(messages.netWorthAllocationUnavailable));
      assert.doesNotMatch(outage, /<svg/);
      const empty = render({ ...single, rows: [], total: 0 });
      assert.ok(empty.includes(messages.netWorthAllocationEmpty));
      assert.doesNotMatch(empty, /<svg/);
      const multiple = render({ ...single, rows: [...single.rows, { id: 'second', name: 'Other', cad: 50 }], total: 200 });
      assert.equal((multiple.match(/<path /g) ?? []).length, 2);
      assert.match(multiple, /75/);
      assert.match(multiple, /25/);
    }
  } finally { await server.close(); }
});


test('account balance sorting handles dates, names, signed amounts and missing values in both directions', () => {
  const rows = [
    { id: 'a', name: 'Alpha', cad: -5, snapshot: { amount: -10, postedAt: '2026-11-20T00:00:00Z' } },
    { id: 'z', name: 'Zulu', cad: 100, snapshot: { amount: 80, postedAt: '2026-11-19T00:00:00Z' } },
    { id: 'b', name: 'Beta', cad: 0, snapshot: { amount: 0, postedAt: '2026-11-21T00:00:00Z' } },
    { id: 'm', name: 'Missing', cad: null, snapshot: null },
    { id: 'asset', name: 'Asset', kind: 'asset', cad: 999, snapshot: { amount: 999, postedAt: '2026-11-22T00:00:00Z' } },
  ];
  const ids = (column, ascending) => sortNetWorthAccounts(rows, 'en', column, ascending).map(({ id }) => id);
  assert.deepEqual(sortNetWorthAccounts(rows, 'en').map(({ id }) => id), ['z', 'b', 'a', 'm']);
  for (const column of ['cad', 'balance']) {
    assert.deepEqual(ids(column, true), ['a', 'b', 'z', 'm']);
    assert.deepEqual(ids(column, false), ['z', 'b', 'a', 'm']);
  }
  assert.deepEqual(ids('postedAt', false), ['b', 'a', 'z', 'm']);
  assert.deepEqual(ids('postedAt', true), ['z', 'a', 'b', 'm']);
  assert.deepEqual(ids('name', true), ['a', 'b', 'm', 'z']);
  assert.deepEqual(ids('name', false), ['z', 'm', 'b', 'a']);
  assert.equal(rows[0].id, 'a', 'Sorting must not mutate the loaded rows');
  const tied = [{ ...rows[0], id: '2' }, { ...rows[0], id: '1' }];
  assert.deepEqual(sortNetWorthAccounts(tied, 'en').map(({ id }) => id), ['1', '2']);
});
