import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const makeServer = () => createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });

test('database preferences validate fields, retain unknown keys, and preserve date ordering', async () => {
  const server = await makeServer();
  try {
    const { parsePreferences } = await server.ssrLoadModule('/src/lib/preferences.ts');
    const { DEFAULT_TRANSACTION_PREFERENCES: defaults, isTransactionPreferences: validate, changeTransactionSort } = await server.ssrLoadModule('/src/lib/transactionPreferences.ts');
    assert.deepEqual(parsePreferences(null), { theme: null, language: null, trackedAccounts: null, cashFlowAccounts: null, transactions: defaults, transaction_filters: [] });
    const saved = { transaction_filters: [], theme: 'dark', language: 'es', trackedAccounts: [], cashFlowAccounts: ['cash-only'], transactions: { ...defaults, pageSize: 100 }, future: { enabled: true } };
    assert.deepEqual(parsePreferences(saved), saved);
    assert.deepEqual(parsePreferences({ ...saved, theme: 'unknown', trackedAccounts: [1] }), { ...saved, theme: null, trackedAccounts: null });
    for (const cashFlowAccounts of [null, [], ['cash-only']]) {
      const parsed = parsePreferences({ ...saved, trackedAccounts: ['transactions-only'], cashFlowAccounts });
      assert.deepEqual(parsed.cashFlowAccounts, cashFlowAccounts);
      assert.deepEqual(parsed.trackedAccounts, ['transactions-only']);
      assert.deepEqual(parsePreferences(JSON.parse(JSON.stringify(parsed))), parsed);
    }
    assert.equal(parsePreferences({ trackedAccounts: ['transactions-only'] }).cashFlowAccounts, null);
    assert.equal(parsePreferences({ ...saved, cashFlowAccounts: [1] }).cashFlowAccounts, null);
    for (const invalid of [null, [], { ...defaults, pageSize: 20 }, { ...defaults, sortColumn: 'unknown' }, { ...defaults, ascending: 'false' }, { ...defaults, postedAtAscending: 1 }, { ...defaults, postedAtAscending: true }]) {
      assert.equal(validate(invalid), false);
      assert.deepEqual(parsePreferences({ ...saved, transactions: invalid }), { ...saved, transactions: defaults, transaction_filters: [] });
    }
    for (const dateAscending of [true, false]) {
      let preferences = { ...defaults, ascending: dateAscending, postedAtAscending: dateAscending };
      preferences = changeTransactionSort(preferences, 'amount');
      assert.equal(preferences.ascending, true);
      assert.equal(preferences.postedAtAscending, dateAscending);
      preferences = changeTransactionSort(preferences, 'amount');
      assert.equal(preferences.ascending, false);
      preferences = changeTransactionSort(preferences, 'account(name)');
      preferences = changeTransactionSort(preferences, 'posted_at');
      assert.equal(preferences.ascending, dateAscending);
      preferences = changeTransactionSort(preferences, 'posted_at');
      assert.equal(preferences.ascending, !dateAscending);
      assert.equal(preferences.postedAtAscending, !dateAscending);
    }
  } finally { await server.close(); }
});

test('preferences saves run in order, recover after errors, and isolate writers', async () => {
  const server = await makeServer();
  try {
    const { createPreferencesWriter, parsePreferences } = await server.ssrLoadModule('/src/lib/preferences.ts');
    let finishFirst;
    const firstPending = new Promise((resolve) => { finishFirst = resolve; });
    const writes = [];
    const writer = createPreferencesWriter(async (preferences) => {
      writes.push(preferences.language);
      if (writes.length === 1) await firstPending;
      if (preferences.language === 'es') throw new Error('Save failed');
    });
    const first = writer(parsePreferences({ language: 'en' }));
    const second = writer(parsePreferences({ language: 'es' }));
    const rejected = assert.rejects(second, /Save failed/);
    const third = writer(parsePreferences({ language: 'en' }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(writes, ['en']);
    const otherWrites = [];
    const otherWriter = createPreferencesWriter(async (preferences) => { otherWrites.push(preferences.theme); });
    await otherWriter(parsePreferences({ theme: 'dark' }));
    assert.deepEqual(otherWrites, ['dark']);
    finishFirst();
    await Promise.all([first, rejected, third]);
    assert.deepEqual(writes, ['en', 'es', 'en']);
  } finally { await server.close(); }
});

test('preferences maps activity to localized messages, retries, and timed success', async () => {
  const server = await makeServer();
  try {
    const { preferencesStatusMessage } = await server.ssrLoadModule('/src/components/PreferencesStatus.tsx');
    const { default: StatusMessage } = await server.ssrLoadModule('/src/components/StatusMessage.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      for (const [status, text] of [
        ['loading', messages.loadingPreferences], ['saving', messages.savingPreferences],
        ['saved', messages.preferencesSaved], ['save-error', messages.preferencesSaveError],
        ['load-error', messages.preferencesLoadError],
      ]) {
        const markup = renderToStaticMarkup(createElement(StatusMessage, preferencesStatusMessage({ messages, status, onRetry() {} })));
        assert.ok(markup.includes(text));
        if (status.endsWith('error')) assert.ok(markup.includes(messages.retry));
        else assert.ok(!markup.includes('<button'));
      }
      const idle = renderToStaticMarkup(createElement(StatusMessage, preferencesStatusMessage({ messages, status: 'idle', onRetry() {} })));
      assert.match(idle, /><\/div>$/);
      assert.ok(!idle.includes(messages.preferencesSaved));
      assert.equal(preferencesStatusMessage({ messages, status: 'saved', onRetry() {} }).durationSeconds, 4);
      assert.equal(preferencesStatusMessage({ messages, status: 'save-error', onRetry() {} }).durationSeconds, undefined);
    }
  } finally { await server.close(); }
});


test('account preferences expose separate localized selections over all available accounts', async () => {
  const server = await makeServer();
  try {
    const { default: PreferencesPanel } = await server.ssrLoadModule('/src/components/PreferencesPanel.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const markup = renderToStaticMarkup(createElement(PreferencesPanel, {
        messages, theme: 'light', accountsStatus: 'ready', savedFilters: [],
        accounts: [{ id: 'checking', name: 'Checking', currency: 'CAD' }, { id: 'savings', name: 'Savings', currency: 'CAD' }],
        trackedAccountIds: ['checking'], cashFlowAccountIds: ['savings'],
        onTrackedAccountIdsChange() {}, onCashFlowAccountIdsChange() {},
      }));
      assert.ok(markup.includes(messages.cashFlowAccounts));
      assert.match(markup, /name="trackedAccounts" checked="" value="checking"/);
      assert.doesNotMatch(markup, /name="trackedAccounts" checked="" value="savings"/);
      assert.match(markup, /name="cashFlowAccounts" checked="" value="savings"/);
      assert.doesNotMatch(markup, /name="cashFlowAccounts" checked="" value="checking"/);
    }
  } finally { await server.close(); }
});
