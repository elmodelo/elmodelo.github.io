import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { cashFlowCsv, cashFlowRowsInDisplayOrder, downloadCashFlowCsv } from '../src/lib/cashFlowCsv.js';

const messages = { language: 'en', cashFlowYear: 'Year', cashFlowCurrency: 'Currency', cashFlowSection: 'Section',
  transactionCategory: 'Category', cashFlowAverage: 'Monthly average', cashFlowAnnual: 'Annual total',
  cashFlowIncome: 'Income', cashFlowInvestment: 'Investment', cashFlowExpense: 'Expenses',
  cashFlowIncomeTotal: 'Total income', cashFlowInvestmentTotal: 'Total investment', cashFlowExpenseTotal: 'Total expenses',
  cashFlowExportFilename: 'cash-flow-{year}.csv' };
const options = { year: 2026, firstMonth: 2, lastMonth: 3, messages };
const salary = { section: 'INCOME', row_kind: 'category', category_name: 'Salary', currency: 'CAD',
  monthly_amounts: [2500, 0], monthly_average: 1250, annual_total: 30000 };
const expense = { section: 'EXPENSE', row_kind: 'category', category_name: 'Food', currency: 'USD',
  monthly_amounts: [-5.25, 0], monthly_average: -2.625, annual_total: -99.333333 };

test('CSV exports visible month columns, totals, original currencies, zeroes, and unrounded numbers', () => {
  const total = { ...expense, row_kind: 'total', category_name: null };
  assert.equal(cashFlowCsv([total, expense, salary], options), '\uFEFF' + [
    'Year,Currency,Section,Category,2026-02,2026-03,Monthly average,Annual total',
    '2026,CAD,Income,Salary,2500,0,1250,30000',
    '2026,USD,Expenses,Food,-5.25,0,-2.625,-99.333333',
    '2026,USD,Expenses,Total expenses,-5.25,0,-2.625,-99.333333',
    '',
  ].join('\r\n'));
  assert.equal(cashFlowCsv([salary], { ...options, firstMonth: 1, lastMonth: 12 }).split('\r\n')[0].split(',').length, 18);
});

test('CSV safely quotes commas, double quotes, newlines, and spreadsheet formula labels', () => {
  const csv = cashFlowCsv([{ ...salary, category_name: 'Food, "fresh"\nmarket' }], options);
  assert.ok(csv.includes('"Food, ""fresh""\nmarket"'));
  for (const name of ['=SUM(1+1)', '+cmd', '-formula', '@SUM(1)', '\t=SUM(1)', '  =SUM(1)']) {
    assert.ok(cashFlowCsv([{ ...salary, category_name: name }], options).includes(",\u0027" + name + ',2500,0,1250,30000'));
  }
  const rows = [expense, { ...salary, row_kind: 'total' }, { ...salary, section: 'INVESTMENT', category_name: 'Mortgage' }, salary];
  assert.deepEqual(cashFlowRowsInDisplayOrder(rows, 'en').map(({ section, row_kind }) => [section, row_kind]),
    [['INCOME', 'category'], ['INCOME', 'total'], ['INVESTMENT', 'category'], ['EXPENSE', 'category']]);
  assert.equal(rows[0], expense, 'Sorting cannot mutate the loaded report');
});

test('CSV headers, sections, and total labels use the selected locale', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const locale = getLocaleMessages(language);
      const csv = cashFlowCsv([{ ...salary, row_kind: 'total' }], { ...options, messages: locale });
      assert.ok(csv.includes(locale.cashFlowCurrency));
      assert.ok(csv.includes(locale.cashFlowSection));
      assert.ok(csv.includes(locale.cashFlowIncomeTotal));
      assert.ok(csv.includes(locale.cashFlowAverage));
      assert.ok(csv.includes(locale.cashFlowAnnual));
    }
  } finally { await server.close(); }
});

test('download uses a CSV blob and year-specific filename, then removes and releases the link', async () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  let blob, clicked = false, removed = false, cleanup, revoked;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  try {
    globalThis.document = { createElement: () => link, body: { append() {} } };
    globalThis.window = { setTimeout(callback) { cleanup = callback; } };
    URL.createObjectURL = (value) => { blob = value; return 'blob:csv-download'; };
    URL.revokeObjectURL = (value) => { revoked = value; };
    downloadCashFlowCsv([salary], options);
    assert.equal(link.download, 'cash-flow-2026.csv');
    assert.equal(link.href, 'blob:csv-download');
    assert.equal(blob.type, 'text/csv;charset=utf-8');
    assert.ok((await blob.text()).includes('2026,CAD,Income,Salary,2500,0,1250,30000'));
    assert.ok(clicked && removed);
    cleanup();
    assert.equal(revoked, 'blob:csv-download');
  } finally {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
