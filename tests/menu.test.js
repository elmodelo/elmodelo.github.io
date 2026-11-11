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
        hasUncategorizedTransactions: true,
      }));
      const uncategorizedLabel = locale === 'es' ? 'Sin categoría' : 'Uncategorized';
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
