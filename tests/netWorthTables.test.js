import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'node:process';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupNetWorthRows, sortNetWorthRows } from '../src/lib/netWorth.js';

const observed = (amount, postedAt = '2026-11-23T17:00:00Z') => ({ amount, postedAt });
const account = (id, amount) => ({ id, name: id, currency: 'CAD', snapshot: amount === null ? null : observed(amount), cad: amount });
const asset = (id, amount, type = 'ASSET', count = 1) => ({ ...account(id, amount), kind: 'asset', type,
  count: observed(count, '2026-11-20T17:00:00Z'), price: observed(amount / (count || 1)),
});

test('grouping uses native account signs and immutable holding types; zeros are opt-in and missing rows stay explicit', () => {
  const rows = [account('positive', 100), { ...account('negative', -100), cad: null }, account('zero-account', 0), account('unknown', null),
    asset('fund', 200), asset('loan', -500, 'LIABILITY'), asset('paid', 0, 'LIABILITY', 0), asset('zero-asset', 0), asset('missing-loan', null, 'LIABILITY')];
  const active = groupNetWorthRows(rows);
  assert.deepEqual(active.assets.map(({ id }) => id), ['positive', 'unknown', 'fund']);
  assert.deepEqual(active.liabilities.map(({ id }) => id), ['negative', 'loan', 'missing-loan']);
  const all = groupNetWorthRows(rows, true);
  assert.deepEqual(all.assets.map(({ id }) => id), ['positive', 'zero-account', 'unknown', 'fund', 'zero-asset']);
  assert.deepEqual(all.liabilities.map(({ id }) => id), ['negative', 'loan', 'paid', 'missing-loan']);
  assert.equal(rows.length, 9);
});

test('shared sorting includes both kinds, keeps unavailable values last and uses unit-price dates', () => {
  const fund = asset('fund', 300);
  const loan = asset('loan', -500, 'LIABILITY');
  const rows = [account('cash', 100), fund, loan, account('missing', null)];
  assert.deepEqual(sortNetWorthRows(rows, 'en').map(({ id }) => id), ['fund', 'cash', 'loan', 'missing']);
  assert.deepEqual(sortNetWorthRows(rows, 'en', 'cad', true).map(({ id }) => id), ['loan', 'cash', 'fund', 'missing']);
  const dated = [{ ...fund, price: observed(1, '2026-01-01'), count: observed(300, '2026-12-01') },
    { ...loan, price: observed(-500, '2026-06-01') }];
  assert.deepEqual(sortNetWorthRows(dated, 'en', 'postedAt', false).map(({ id }) => id), ['loan', 'fund']);
  assert.equal(rows[0].id, 'cash', 'Sorting does not mutate input');
});

test('table cards share four sortable headers, rounded counts, date details, and writer-only dialog buttons', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: Card } = await server.ssrLoadModule('/src/components/NetWorthTableCard.tsx');
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const rows = [account('cash', 100), { ...asset('INTU N', 490, 'ASSET', 245), currency: 'USD', cad: 686 },
        asset('fraction', 5, 'ASSET', 0.5), asset('unit', 7), asset('paid', 0, 'LIABILITY', 0)];
      const render = (role, readOnly = false, overrides = {}) => renderToStaticMarkup(createElement(PermissionsProvider, { role },
        createElement(Card, { title: messages.netWorthAssets, emptyMessage: messages.netWorthAssetsEmpty, rows, messages, readOnly, onSaved() {}, ...overrides })));
      const writer = render('WRITER');
      assert.equal((writer.match(/class="sort-button"/g) ?? []).length, 4);
      for (const label of [messages.netWorthTableDate, messages.netWorthTableName, messages.netWorthTableAmount, messages.netWorthTableCad]) assert.ok(writer.includes(label));
      assert.match(writer, /INTU N.*\(x245\)/);
      assert.doesNotMatch(writer, /\(x0[.,]?/);
      assert.doesNotMatch(writer, /\(x1\)/);
      const precise = render('READER', false, { rows: [{ ...asset('precise', 5, 'ASSET', 2.5),
        count: { ...observed(2.5), rawAmount: '2.500000000000000000001' } }] });
      assert.ok(precise.includes('(x3)'));
      const rounding = render('READER', false, { rows: [asset('down', 5, 'ASSET', 245.49), asset('up', 5, 'ASSET', 245.5)] });
      assert.match(rounding, /\(x245\)/);
      assert.match(rounding, /\(x246\)/);
      assert.doesNotMatch(rounding, /\(x\d+[.,]/);
      assert.ok(writer.includes(messages.assetCountDate));
      assert.match(writer, /dateTime="2026-11-20T17:00:00Z"/);
      const format = (value, currency) => new Intl.NumberFormat(language, { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(value);
      assert.ok(writer.includes(format(490, 'USD')), 'Amount is count times price, not the unit price');
      assert.ok(writer.includes(format(686, 'CAD')));
      assert.equal((writer.match(/aria-haspopup="dialog"/g) ?? []).length, 4, 'Accounts have no holding update action');
      assert.doesNotMatch(writer, /aria-haspopup="menu"|role="menuitem"/);
      assert.doesNotMatch(render('READER'), /aria-haspopup/);
      assert.doesNotMatch(render('WRITER', true), /aria-haspopup/);
      const empty = render('READER', false, { rows: [] });
      assert.ok(empty.includes(messages.netWorthAssetsEmpty));
      assert.doesNotMatch(empty, /<table/);
      const debt = render('READER', false, { rows: [asset('Small debt', -5, 'LIABILITY'), asset('Large debt', -500, 'LIABILITY')], title: messages.netWorthLiabilities, defaultAscending: true });
      assert.ok(debt.indexOf('Large debt') < debt.indexOf('Small debt'));
      assert.match(debt, /aria-sort="ascending"/);
      const footer = (markup) => markup.match(/<tfoot>([\s\S]*?)<\/tfoot>/)[1];
      const total = footer(render('READER', false, { rows: [account('cash', 10.49),
        { ...asset('USD holding', 1), currency: 'USD', cad: 1.4 },
        { ...account('RESP', 100), excludedFromNetWorth: true }] }));
      assert.match(total, /colSpan="3"/);
      assert.ok(total.includes(messages.netWorthTableTotal));
      assert.ok(total.includes(format(11.89, 'CAD')), 'Sum converted values before rounding; exclude RESP');
      assert.ok(footer(debt).includes(format(-505, 'CAD')));
      assert.match(footer(debt), /data-negative="true"/);
      const missing = footer(render('READER', false, { rows: [account('cash', 10), account('missing', null)] }));
      assert.ok(missing.includes(messages.netWorthUnavailable), 'Never present a partial sum as the total');
      const excludedMissing = footer(render('READER', false, { rows: [account('cash', 10),
        { ...account('RESP', null), excludedFromNetWorth: true }] }));
      assert.ok(excludedMissing.includes(format(10, 'CAD')));
      const failed = footer(render('READER', false, { rows: [account('cash', 10)], notice: createElement('p', {}, 'Source unavailable') }));
      assert.ok(failed.includes(messages.netWorthUnavailable), 'Source failures suppress the total');
    }
  } finally { await server.close(); }
});
