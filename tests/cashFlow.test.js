import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import {
  cashFlowPeriod, cashFlowYearOptions, fetchCashFlow, fetchCashFlowYears,
  cashFlowCellFilters, cashFlowCurrencyAccounts,
} from '../src/lib/cashFlow.js';
import { fetchTransactions } from '../src/lib/transactionQuery.js';

const response = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const clientFor = (data, inspect = () => {}) => createClient('http://127.0.0.1:54321', 'test-key', {
  global: { fetch: async (url, init) => { inspect(new URL(url), init); return response(data); } },
});
const row = (changes = {}) => ({ section: 'INCOME', row_kind: 'category', category_id: 'salary',
  category_name: 'Salary', currency: 'CAD', monthly_amounts: [1000, 0], monthly_average: 500, annual_total: 2000, ...changes });

test('current year ends at the current month; previous years have twelve months', () => {
  const now = new Date(2026, 10, 19);
  assert.deepEqual(cashFlowPeriod(2026, now), { year: 2026, firstMonth: 1, lastMonth: 11 });
  assert.deepEqual(cashFlowPeriod(2025, now), { year: 2025, firstMonth: 1, lastMonth: 12 });
  assert.equal(cashFlowPeriod(2026, new Date(2026, 0, 1)).lastMonth, 1);
  assert.equal(cashFlowPeriod(2026, new Date(2026, 11, 31)).lastMonth, 12);
  assert.deepEqual(cashFlowYearOptions([2020, 2025, 2025, 2027, 2026, 0], 2026), [2026, 2025, 2020]);
  assert.deepEqual(cashFlowYearOptions([], 2026), [2026]);
});

test('year discovery queries only tracked accounts and preserves gaps in available years', async () => {
  const signal = new AbortController().signal;
  const years = await fetchCashFlowYears(clientFor([{ year: 2025 }, { year: 2020 }], (url, init) => {
    assert.equal(url.pathname, '/rest/v1/rpc/cash_flow_years');
    assert.deepEqual(JSON.parse(init.body), { p_accounts: ['tracked'] });
    assert.equal(new Headers(init.headers).get('content-profile'), 'finance');
    assert.equal(init.signal, signal);
  }), ['tracked'], signal);
  assert.deepEqual(years, [2025, 2020]);
  await assert.rejects(fetchCashFlowYears(clientFor([{ year: 'invalid' }]), ['tracked']));
});

test('cash flow requests the visible months, retaining zero positions, signs, currencies, and annual totals', async () => {
  const signal = new AbortController().signal;
  const data = await fetchCashFlow(clientFor([row({ monthly_amounts: ['-100.5', 0], monthly_average: '-50.25' })], (url, init) => {
    assert.equal(url.pathname, '/rest/v1/rpc/cash_flow');
    assert.deepEqual(JSON.parse(init.body), { p_accounts: ['tracked'], p_year: 2026, p_first_month: 1, p_last_month: 2 });
    assert.equal(init.signal, signal);
  }), { trackedAccountIds: ['tracked'], year: 2026, firstMonth: 1, lastMonth: 2, signal });
  assert.deepEqual(data[0].monthly_amounts, [-100.5, 0]);
  assert.equal(data[0].monthly_average, -50.25);
  assert.equal(data[0].annual_total, 2000);
  assert.equal(data[0].currency, 'CAD');
});

test('empty accounts skip requests; RPC errors and malformed arrays cannot appear as zero cash flow', async () => {
  const never = { schema() { assert.fail('Unexpected request'); } };
  assert.deepEqual(await fetchCashFlowYears(never, []), []);
  assert.deepEqual(await fetchCashFlow(never, { trackedAccountIds: [] }), []);
  const options = { trackedAccountIds: ['tracked'], year: 2026, firstMonth: 1, lastMonth: 2 };
  for (const invalid of [null, [row({ monthly_amounts: { 0: 1000, 1: 0 } })], [row({ monthly_amounts: [1000] })],
    [row({ monthly_amounts: [null, 0] })], [row({ monthly_average: 'NaN' })]]) {
    await assert.rejects(fetchCashFlow(clientFor(invalid), options));
  }
  const failing = createClient('http://127.0.0.1:54321', 'test-key', {
    global: { fetch: async () => new Response(JSON.stringify({ code: 'PGRST202', message: 'Missing RPC' }),
      { status: 404, headers: { 'content-type': 'application/json' } }) },
  });
  await assert.rejects(fetchCashFlow(failing, options), (error) => error.cause.code === 'PGRST202');
  await assert.rejects(fetchCashFlowYears(failing, ['tracked']));
});

test('cell drill-down preserves tracked currency scope, UTC boundaries, and server pagination', async () => {
  const accounts = [
    { id: 'cad', currency: 'CAD' }, { id: 'usd', currency: 'USD' }, { id: 'untracked', currency: 'CAD' },
  ];
  const ids = cashFlowCurrencyAccounts(accounts, ['cad', 'usd'], 'CAD');
  assert.deepEqual(ids, ['cad']);
  assert.deepEqual(cashFlowCellFilters(2024, 2, 'salary'), [
    { field: 'category', operator: 'eq', value: 'salary' },
    { field: 'posted_at', operator: 'gte', value: '2024-02-01T00:00:00.000Z' },
    { field: 'posted_at', operator: 'lt', value: '2024-03-01T00:00:00.000Z' },
  ]);
  assert.equal(cashFlowCellFilters(2025, 12, 'salary')[2].value, '2026-01-01T00:00:00.000Z');
  assert.equal(cashFlowCellFilters(50, 1, 'salary')[1].value, '0050-01-01T00:00:00.000Z');
  let url;
  await fetchTransactions(clientFor([], (request) => { url = request; }), {
    trackedAccountIds: ids, filters: cashFlowCellFilters(2024, 2, 'salary'),
    sortColumn: 'posted_at', ascending: false, page: 1, pageSize: 50,
  });
  assert.equal(url.searchParams.get('account'), 'in.(cad)');
  assert.equal(url.searchParams.get('category'), 'eq.salary');
  assert.deepEqual(url.searchParams.getAll('posted_at'), ['gte.2024-02-01T00:00:00.000Z', 'lt.2024-03-01T00:00:00.000Z']);
  assert.equal(url.searchParams.get('offset'), '50');
  assert.equal(url.searchParams.get('limit'), '50');
});

test('localized table has separate currencies, three sections, and only category/month buttons', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: CashFlowTable } = await server.ssrLoadModule('/src/components/CashFlowTable.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const markup = renderToStaticMarkup(createElement(CashFlowTable, {
        messages, year: 2026, firstMonth: 1, lastMonth: 2, onCellClick() {}, rows: [
          row(), row({ row_kind: 'total', category_id: null, category_name: null }),
          row({ section: 'INVESTMENT', category_id: 'mortgage', category_name: 'Mortgage', monthly_amounts: [-100, -100] }),
          row({ section: 'EXPENSE', category_id: 'groceries', category_name: 'Groceries', monthly_amounts: [0, -10] }),
          row({ currency: 'USD' }),
        ],
      }));
      assert.equal((markup.match(/<table /g) ?? []).length, 2);
      assert.ok(markup.includes(messages.cashFlowIncomeTotal));
      assert.ok(markup.includes(messages.cashFlowAverage));
      assert.ok(markup.includes(messages.cashFlowAnnual));
      assert.ok(markup.indexOf(messages.cashFlowIncome) < markup.indexOf(messages.cashFlowInvestment));
      assert.ok(markup.indexOf(messages.cashFlowInvestment) < markup.indexOf(messages.cashFlowExpense));
      assert.equal((markup.match(/aria-haspopup="dialog"/g) ?? []).length, 8);
      assert.match(markup, /class="cash-flow-cell"[^>]*>0[.,]00<\/button>/);
      assert.doesNotMatch(markup, /class="cash-flow-summary"><button/);
      for (const totalRow of markup.matchAll(/<tr class="cash-flow-total">(.*?)<\/tr>/g)) {
        assert.doesNotMatch(totalRow[1], /<button/);
      }
      assert.match(markup, /class="cash-flow-table" aria-label="CAD"/);
      assert.match(markup, /class="cash-flow-table" aria-label="USD"/);
      assert.doesNotMatch(markup, /<caption/);
    }
  } finally { await server.close(); }
});

test('panel starts on the current year without inline loading or its own dialog', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: CashFlowPanel } = await server.ssrLoadModule('/src/components/CashFlowPanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const markup = renderToStaticMarkup(createElement(CashFlowPanel, { messages, accounts: [], cashFlowAccountIds: ['cad'] }));
      assert.ok(!markup.includes(messages.loadingCashFlow));
      assert.doesNotMatch(markup, /class="LoadingDialog"/);
      assert.ok(!markup.includes(messages.cashFlowLoadingYears));
      assert.ok(markup.includes(`value="${new Date().getFullYear()}"`));
      const empty = renderToStaticMarkup(createElement(CashFlowPanel, { messages, accounts: [], cashFlowAccountIds: [] }));
      assert.ok(empty.includes(messages.cashFlowNoAccounts));
      assert.ok(!empty.includes(messages.loadingCashFlow));
      assert.doesNotMatch(empty, /class="LoadingDialog"/);
    }
  } finally { await server.close(); }
});

test('cash flow popup uses one contextual heading and a close action without search or filters', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: Popup } = await server.ssrLoadModule('/src/components/CashFlowTransactionsPanel.tsx');
    const { PreferencesProvider } = await server.ssrLoadModule('/src/hooks/usePreferences.tsx');
    const { StatusMessagesProvider } = await server.ssrLoadModule('/src/hooks/useStatusMessages.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const markup = renderToStaticMarkup(createElement(StatusMessagesProvider, {}, createElement(PreferencesProvider, {},
        createElement(Popup, { messages, accounts: [], trackedAccountIds: ['cad'], year: 2026, month: 2,
          categoryId: 'groceries', categoryName: 'Groceries', onClose() {} }))));
      assert.equal((markup.match(/<h1 /g) ?? []).length, 1);
      assert.match(markup, /<h1[^>]*>Groceries · .*2026<\/h1>/);
      assert.ok(!markup.includes(`>${messages.transactions}</h1>`));
      assert.doesNotMatch(markup, /<h2|transaction-filter-tools|type="search"|transaction-filter-trigger|transaction-saved-filters-trigger/);
      assert.ok(markup.includes(`aria-label="${messages.close}"`));
      assert.match(markup, /class="transaction-heading-actions"><button[^>]*transaction-filter-close/);
      const headingId = markup.match(/<h1 id="([^"]+)"/)[1];
      assert.ok(markup.includes(`class="cash-flow-transactions-dialog" aria-labelledby="${headingId}"`));
    }
  } finally { await server.close(); }
});
