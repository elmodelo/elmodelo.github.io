import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('menu renders localized sections, their separator, and the active item', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Menu, savedFilterSection } = await server.ssrLoadModule('/src/components/Menu.tsx');
    const { EMPTY_TRANSACTION_FILTER: values, sortSavedTransactionFilters } =
      await server.ssrLoadModule('/src/lib/transactionFilterPresets.ts');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const [locale, labels] of [
      ['en', ['Transactions', 'Net Worth', 'Cash Flow', 'Preferences', 'My Account']],
      ['es', ['Transacciones', 'Patrimonio neto', 'Flujo de caja', 'Configuración', 'Mi cuenta']],
    ]) {
      const markup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'transactions', onSelect() {}, toggleTarget: null,
      }));
      const positions = labels.map((label) => markup.indexOf(`>${label}</button>`));
      assert.ok(positions.every((position) => position >= 0));
      assert.ok(positions.every((position, index) => !index || position > positions[index - 1]));
      const netWorthMarkup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'net-worth', onSelect() {}, toggleTarget: null,
      }));
      assert.match(netWorthMarkup, /aria-current="page">(?:Net Worth|Patrimonio neto)<\/button>/);
      const cashFlowMarkup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'cash-flow', onSelect() {}, toggleTarget: null,
      }));
      assert.match(cashFlowMarkup, /aria-current="page">(?:Cash Flow|Flujo de caja)<\/button>/);
      assert.match(markup, /aria-current="page">(?:Transactions|Transacciones)<\/button>/);
      assert.match(markup, /menu-item-separated/);
      assert.match(markup, /id="[^"]+" class="menu-items" data-expanded="false"/);
      assert.match(markup, /class="menu-button menu-subsection">(?:Charts|Gráficos)<\/button>/);
      const chartsMarkup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'net-worth-charts', onSelect() {}, toggleTarget: null,
      }));
      assert.match(chartsMarkup, /class="menu-button menu-subsection" aria-current="page">(?:Charts|Gráficos)<\/button>/);
      const chartsLabel = locale === 'es' ? 'Gráficos' : 'Charts';
      assert.ok(markup.indexOf(`>${labels[1]}</button>`) < markup.indexOf(`>${chartsLabel}</button>`));
      assert.ok(markup.indexOf(`>${chartsLabel}</button>`) < markup.indexOf(`>${labels[2]}</button>`));
      const filteredMarkup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'uncategorized', onSelect() {}, toggleTarget: null,
        uncategorizedCount: 34,
      }));
      const uncategorizedLabel = `${locale === 'es' ? 'Sin categoría' : 'Uncategorized'} (34)`;
      assert.ok(filteredMarkup.indexOf(`>${labels[0]}</button>`) < filteredMarkup.indexOf(`>${uncategorizedLabel}</button>`));
      assert.ok(filteredMarkup.indexOf(`>${uncategorizedLabel}</button>`) < filteredMarkup.indexOf(`>${labels[1]}</button>`));
      assert.ok(filteredMarkup.includes(`class="menu-button menu-subsection" aria-current="page">${uncategorizedLabel}</button>`));
      const pinnedFilters = sortSavedTransactionFilters([
        { id: 'z', name: 'Zebra', values, pin_to_menu: true },
        { id: 'a', name: 'Alpha', values, pin_to_menu: true },
      ], locale);
      for (const uncategorizedCount of [0, 34]) {
        const pinnedMarkup = renderToStaticMarkup(createElement(Menu, {
          messages: getLocaleMessages(locale), section: savedFilterSection('a'), onSelect() {}, toggleTarget: null,
          pinnedFilters, uncategorizedCount,
        }));
        const ordered = [labels[0], ...(uncategorizedCount ? [uncategorizedLabel] : []), 'Alpha', 'Zebra', labels[1]];
        const order = ordered.map((label) => pinnedMarkup.indexOf(`>${label}</button>`));
        assert.ok(order.every((position, index) => position >= 0 && (!index || position > order[index - 1])));
        assert.match(pinnedMarkup, /aria-current="page">Alpha<\/button>/);
        assert.doesNotMatch(pinnedMarkup, /aria-current="page">Zebra<\/button>/);
      }
    }
  } finally {
    await server.close();
  }
});

test('saved-filter preferences show pin state and default older filters to unchecked', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: PreferencesPanel } = await server.ssrLoadModule('/src/components/PreferencesPanel.tsx');
    const { EMPTY_TRANSACTION_FILTER: values } = await server.ssrLoadModule('/src/lib/transactionFilterPresets.ts');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const markup = renderToStaticMarkup(createElement(PreferencesPanel, {
      messages: getLocaleMessages('en'), theme: 'light', accounts: [], trackedAccountIds: [], accountsStatus: 'ready',
      savedFilters: [
        { id: 'alpha', name: 'Alpha', values, pin_to_menu: true },
        { id: 'beta', name: 'Beta', values },
      ],
    }));
    assert.match(markup, /<legend>Saved filters<\/legend>/);
    assert.match(markup, /<input[^>]*aria-label="Pin to menu: Alpha"[^>]*checked=""/);
    assert.doesNotMatch(markup, /<input[^>]*aria-label="Pin to menu: Beta"[^>]*checked=""/);
  } finally {
    await server.close();
  }
});

test('transaction panel initially renders a localized loading state', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Panel } = await server.ssrLoadModule('/src/components/TransactionsPanel.tsx');
    const { PreferencesProvider } = await server.ssrLoadModule('/src/hooks/usePreferences.tsx');
    const { StatusMessagesProvider } = await server.ssrLoadModule('/src/hooks/useStatusMessages.tsx');
    const TransactionsPanel = (props) => createElement(StatusMessagesProvider, {}, createElement(PreferencesProvider, {}, createElement(Panel, props)));
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const markup = renderToStaticMarkup(createElement(TransactionsPanel, {
      messages: getLocaleMessages('es'),
      accounts: [],
      trackedAccountIds: ['account-a'],
    }));
    assert.match(markup, /Transacciones/);
    assert.match(markup, /role="status"/);
    assert.match(markup, /Cargando transacciones/);
    const filteredMarkup = renderToStaticMarkup(createElement(TransactionsPanel, {
      messages: getLocaleMessages('es'), accounts: [], trackedAccountIds: ['account-a'],
      filters: [{ field: 'category', operator: 'is', value: null }], title: 'Sin categoría',
    }));
    assert.match(filteredMarkup, /<h1 id="transactions-title">Sin categoría<\/h1>/);
  } finally {
    await server.close();
  }
});

test('categorization dialog distinguishes single clicks from selections and defaults rule creation off', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: CategorizePanel } = await server.ssrLoadModule('/src/components/CategorizePanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const [ids, isSelection, title] of [
      [['a'], false, 'Categorize transaction'],
      [['a'], true, 'Categorize (1 selected transactions)'],
      [['a', 'b'], true, 'Categorize (2 selected transactions)'],
    ]) {
      const markup = renderToStaticMarkup(createElement(CategorizePanel, {
        messages: getLocaleMessages('en'), transactionIds: ids, isSelection, onClose() {},
      }));
      assert.ok(markup.includes(`<h2 id="categorize-title">${title}</h2>`));
      assert.match(markup, /type="checkbox"[^>]*aria-describedby="category-rule-help"/);
      assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
      assert.match(markup, /Leaving this unchecked changes only these transactions/);
      assert.match(markup, /type="checkbox"[^>]*disabled=""[^>]*aria-describedby="apply-category-rule-help"/);
      assert.match(markup, /Apply this rule to existing uncategorized transactions/);
      assert.match(markup, /type="submit"[^>]*disabled/);
    }
  } finally {
    await server.close();
  }
});

test('transaction panel has no auto-categorize button for any role', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Panel } = await server.ssrLoadModule('/src/components/TransactionsPanel.tsx');
    const { PreferencesProvider } = await server.ssrLoadModule('/src/hooks/usePreferences.tsx');
    const { StatusMessagesProvider } = await server.ssrLoadModule('/src/hooks/useStatusMessages.tsx');
    const TransactionsPanel = (props) => createElement(StatusMessagesProvider, {}, createElement(PreferencesProvider, {}, createElement(Panel, props)));
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const props = { messages: getLocaleMessages('en'), userId: 'test-user', accounts: [], trackedAccountIds: [] };
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    assert.ok(!renderToStaticMarkup(createElement(TransactionsPanel, props)).includes('Auto-categorize'));
    for (const role of [null, 'READER', 'WRITER']) {
      const markup = renderToStaticMarkup(createElement(PermissionsProvider, { role }, createElement(TransactionsPanel, props)));
      assert.ok(!markup.includes('Auto-categorize'));
    }
  } finally {
    await server.close();
  }
});
