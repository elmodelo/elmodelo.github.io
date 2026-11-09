import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('preferences validate stored data, isolate users, and retain independent date ordering', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    const storage = new Map();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      } },
    });
    const { preferenceKey, readStoredData, writeStoredData } = await server.ssrLoadModule('/src/lib/storage.ts');
    const { usePersistedState } = await server.ssrLoadModule('/src/hooks/usePersistedState.ts');
    const {
      DEFAULT_TRANSACTION_PREFERENCES: defaults, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS,
      isTransactionPreferences: validate, changeTransactionSort,
    } = await server.ssrLoadModule('/src/lib/transactionPreferences.ts');

    assert.equal(DEFAULT_PAGE_SIZE, 25);
    assert.ok(PAGE_SIZE_OPTIONS.includes(DEFAULT_PAGE_SIZE));
    const aliceKey = preferenceKey('transactions', 'alice');
    const bobKey = preferenceKey('transactions', 'bob');
    const guestKey = preferenceKey('transactions');
    assert.equal(new Set([aliceKey, bobKey, guestKey]).size, 3);
    const saved = { ...defaults, pageSize: 100, sortColumn: 'amount', ascending: true };
    writeStoredData(aliceKey, saved);
    assert.deepEqual(readStoredData(aliceKey, defaults, validate), saved);
    assert.deepEqual(readStoredData(bobKey, defaults, validate), defaults);

    function PreferenceProbe({ userId }) {
      const [value] = usePersistedState('transactions', defaults, validate, userId);
      return createElement('span', null, String(value.pageSize));
    }
    assert.equal(renderToStaticMarkup(createElement(PreferenceProbe, { userId: 'alice' })), '<span>100</span>');
    assert.equal(renderToStaticMarkup(createElement(PreferenceProbe, { userId: 'bob' })), '<span>25</span>');

    function AccountSwitchProbe() {
      const [userId, setUserId] = useState('alice');
      const [value] = usePersistedState('transactions', defaults, validate, userId);
      if (userId === 'alice') setUserId('bob');
      return createElement('span', null, String(value.pageSize));
    }
    assert.equal(renderToStaticMarkup(createElement(AccountSwitchProbe)), '<span>25</span>');
    assert.deepEqual(readStoredData(aliceKey, defaults, validate), saved);

    const { useLanguage } = await server.ssrLoadModule('/src/hooks/useLanguage.ts');
    const { useTheme } = await server.ssrLoadModule('/src/hooks/useTheme.ts');
    window.matchMedia = () => ({ matches: false });
    storage.set('language', 'en');
    storage.set('theme', 'light');
    writeStoredData(preferenceKey('language', 'alice'), 'es');
    writeStoredData(preferenceKey('theme', 'alice'), 'dark');
    function AppearanceProbe({ userId }) {
      const { messages } = useLanguage(userId);
      const { theme } = useTheme(userId);
      return createElement('span', null, `${messages.language}:${theme}`);
    }
    assert.equal(renderToStaticMarkup(createElement(AppearanceProbe, { userId: 'alice' })), '<span>es:dark</span>');
    assert.equal(renderToStaticMarkup(createElement(AppearanceProbe)), '<span>en:light</span>');

    for (const invalid of [
      null, [], { ...defaults, pageSize: 20 }, { ...defaults, sortColumn: 'unknown' },
      { ...defaults, ascending: 'false' }, { ...defaults, postedAtAscending: 1 },
      { ...defaults, postedAtAscending: true },
    ]) {
      storage.set(aliceKey, JSON.stringify(invalid));
      assert.deepEqual(readStoredData(aliceKey, defaults, validate), defaults);
    }
    storage.set(aliceKey, '{broken json');
    assert.deepEqual(readStoredData(aliceKey, defaults, validate), defaults);

    for (const dateAscending of [true, false]) {
      let settings = { ...defaults, ascending: dateAscending, postedAtAscending: dateAscending };
      settings = changeTransactionSort(settings, 'amount');
      assert.equal(settings.ascending, true);
      assert.equal(settings.postedAtAscending, dateAscending);
      settings = changeTransactionSort(settings, 'amount');
      assert.equal(settings.ascending, false);
      assert.equal(settings.postedAtAscending, dateAscending);
      settings = changeTransactionSort(settings, 'account(name)');
      assert.equal(settings.postedAtAscending, dateAscending);
      settings = changeTransactionSort(settings, 'posted_at');
      assert.equal(settings.ascending, dateAscending);
      settings = changeTransactionSort(settings, 'posted_at');
      assert.equal(settings.ascending, !dateAscending);
      assert.equal(settings.postedAtAscending, !dateAscending);
    }

    window.localStorage.getItem = () => { throw new Error('Storage blocked'); };
    window.localStorage.setItem = () => { throw new Error('Storage full'); };
    assert.deepEqual(readStoredData(aliceKey, defaults, validate), defaults);
    assert.doesNotThrow(() => writeStoredData(aliceKey, saved));
    Reflect.deleteProperty(globalThis, 'window');
    assert.deepEqual(readStoredData(aliceKey, defaults, validate), defaults);
    assert.doesNotThrow(() => writeStoredData(aliceKey, saved));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    await server.close();
  }
});
