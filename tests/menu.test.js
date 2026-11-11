import assert from 'node:assert/strict';
import { env } from 'node:process';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('menu renders localized sections, their separator, and the active item', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: Menu } = await server.ssrLoadModule('/src/components/Menu.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const [locale, labels] of [
      ['en', ['Transactions', 'Settings', 'My Account']],
      ['es', ['Transacciones', 'Configuración', 'Mi cuenta']],
    ]) {
      const markup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'transactions', onSelect() {}, toggleTarget: null,
      }));
      const positions = labels.map((label) => markup.indexOf(`>${label}</button>`));
      assert.ok(positions.every((position) => position >= 0));
      assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
      assert.match(markup, /aria-current="page">(?:Transactions|Transacciones)<\/button>/);
      assert.match(markup, /menu-item-separated/);
      assert.match(markup, /id="[^"]+" class="menu-items" data-expanded="false"/);
      assert.doesNotMatch(markup, /menu-subsection/);
      const filteredMarkup = renderToStaticMarkup(createElement(Menu, {
        messages: getLocaleMessages(locale), section: 'uncategorized', onSelect() {}, toggleTarget: null,
        uncategorizedCount: 34,
      }));
      const uncategorizedLabel = `${locale === 'es' ? 'Sin categoría' : 'Uncategorized'} (34)`;
      assert.ok(filteredMarkup.indexOf(`>${labels[0]}</button>`) < filteredMarkup.indexOf(`>${uncategorizedLabel}</button>`));
      assert.ok(filteredMarkup.indexOf(`>${uncategorizedLabel}</button>`) < filteredMarkup.indexOf(`>${labels[1]}</button>`));
      assert.ok(filteredMarkup.includes(`class="menu-button menu-subsection" aria-current="page">${uncategorizedLabel}</button>`));
    }
  } finally {
    await server.close();
  }
});

test('transaction panel initially renders a localized loading state', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: TransactionsPanel } = await server.ssrLoadModule('/src/components/TransactionsPanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const markup = renderToStaticMarkup(createElement(TransactionsPanel, {
      messages: getLocaleMessages('es'),
      userId: 'test-user',
      trackedAccountIds: ['account-a'],
    }));
    assert.match(markup, /Transacciones/);
    assert.match(markup, /role="status"/);
    assert.match(markup, /Cargando transacciones/);
    const filteredMarkup = renderToStaticMarkup(createElement(TransactionsPanel, {
      messages: getLocaleMessages('es'), userId: 'test-user', trackedAccountIds: ['account-a'],
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

test('category actions use shared permissions and are hidden without a provider', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: TransactionsPanel } = await server.ssrLoadModule('/src/components/TransactionsPanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const props = { messages: getLocaleMessages('en'), userId: 'test-user', trackedAccountIds: [] };
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    assert.ok(!renderToStaticMarkup(createElement(TransactionsPanel, props)).includes('Auto-categorize'));
    for (const role of [null, 'READER', 'WRITER']) {
      const markup = renderToStaticMarkup(createElement(PermissionsProvider, { role }, createElement(TransactionsPanel, props)));
      assert.equal(markup.includes('Auto-categorize'), role === 'WRITER');
    }
  } finally {
    await server.close();
  }
});
