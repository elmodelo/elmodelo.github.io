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
        messages: getLocaleMessages(locale), section: 'transactions', onSelect() {},
      }));
      const positions = labels.map((label) => markup.indexOf(`>${label}</button>`));
      assert.ok(positions.every((position) => position >= 0));
      assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
      assert.match(markup, /aria-current="page">(?:Transactions|Transacciones)<\/button>/);
      assert.match(markup, /menu-item-separated/);
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
    }));
    assert.match(markup, /Transacciones/);
    assert.match(markup, /role="status"/);
    assert.match(markup, /Cargando transacciones/);
  } finally {
    await server.close();
  }
});
