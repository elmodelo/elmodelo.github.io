import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('monthly charts render accessible localized values and preserve gaps in growth lines', async () => {
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: MonthlyChart } = await server.ssrLoadModule('/src/components/NetWorthMonthlyChart.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const rows = ['2024-01', '2024-02', '2024-03'].map((month, i) => ({ month, growth: i === 1 ? null : 0.1, average: null, netWorth: 100 + i, liabilities: -10 }));
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const markup = renderToStaticMarkup(createElement(MonthlyChart, {
        messages, title: messages.netWorthChartsGrowth, rows, percent: true,
        series: [{ key: 'growth', label: messages.netWorthChartsGrowth, color: '#2878b5' }, { key: 'average', label: messages.netWorthChartsAverage, color: '#cf6b29' }],
      }));
      assert.ok(markup.includes(messages.netWorthChartsData));
      assert.ok(markup.includes(messages.netWorthUnavailable));
      assert.match(markup, /<table/);
      assert.match(markup, /<caption>/);
      assert.match(markup, /tabindex="0" role="img" aria-label=/);
      assert.match(markup, /<path d="M[^L"]+ M[^L"]+"/);
      assert.match(markup, /stroke-dasharray="7 5"/);
      assert.doesNotMatch(markup, /NaN|Infinity/);
      const columns = renderToStaticMarkup(createElement(MonthlyChart, {
        messages, title: messages.netWorthChartsTotals, rows,
        series: [{ key: 'netWorth', label: messages.netWorth, color: '#2878b5' }, { key: 'liabilities', label: messages.netWorthLiabilities, color: '#cf6b29' }],
      }));
      assert.match(columns, /CAD/);
      assert.doesNotMatch(columns, /NaN|Infinity/);
      assert.ok(columns.includes(messages.netWorthLiabilities));
      const portfolio = renderToStaticMarkup(createElement(MonthlyChart, {
        messages, title: messages.netWorthChartsPortfolio, rows,
        series: [{ key: 'netWorth', label: messages.netWorthChartsPortfolio, color: '#2878b5' }],
      }));
      const monthPositions = (html) => [...html.matchAll(/class="net-worth-chart-month" x="([^"]+)"/g)].map((match) => Number(match[1]));
      assert.deepEqual(monthPositions(markup), [36, 108, 180]);
      assert.deepEqual(monthPositions(columns), monthPositions(markup));
      assert.deepEqual(monthPositions(portfolio), monthPositions(markup));
      const barWidths = (html) => [...html.matchAll(/<rect[^>]+clip-path="[^"]+"[^>]+width="([^"]+)"/g)].map((match) => Number(match[1]));
      assert.ok(barWidths(portfolio).every((width) => width > 48 && width < 72));
      assert.ok(barWidths(columns).every((width) => width === 16));
      assert.equal(barWidths(portfolio).length, 3);
      assert.match(portfolio, /class="net-worth-chart-y-axis"/);
    }
  } finally { await server.close(); }
});
