import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

const makeServer = () => createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });

test('filter values preserve all versus none, inclusive UTC dates, signed amounts and shared search', async () => {
  const server = await makeServer();
  try {
    const { EMPTY_TRANSACTION_FILTER: empty, buildTransactionFilters: build } = await server.ssrLoadModule('/src/lib/transactionFilterPresets.ts');
    assert.deepEqual(build(empty), []);
    assert.deepEqual(build({ ...empty, accounts: [], categories: [] }), [
      { field: 'account', operator: 'in', value: [] },
      { field: 'category', operator: 'in', value: [] },
    ]);
    assert.deepEqual(build({
      ...empty, accounts: ['a'], categories: ['c'], from: '2024-02-01', to: '2024-02-29',
      search: '  coffee shop  ', minimum: '-100.25', maximum: '0',
    }), [
      { field: 'account', operator: 'in', value: ['a'] },
      { field: 'category', operator: 'in', value: ['c'] },
      { field: 'posted_at', operator: 'gte', value: '2024-02-01T00:00:00.000Z' },
      { field: 'posted_at', operator: 'lt', value: '2024-03-01T00:00:00.000Z' },
      { field: 'description', operator: 'search', value: 'coffee shop' },
      { field: 'amount', operator: 'gt', value: -100.25 },
      { field: 'amount', operator: 'lt', value: 0 },
    ]);
    assert.deepEqual(build({ ...empty, to: '2026-12-31', maximum: '15' }), [
      { field: 'posted_at', operator: 'lt', value: '2027-01-01T00:00:00.000Z' },
      { field: 'amount', operator: 'lt', value: 15 },
    ]);
  } finally { await server.close(); }
});

test('persisted filters round-trip and invalid presets cannot create broken queries', async () => {
  const server = await makeServer();
  try {
    const { EMPTY_TRANSACTION_FILTER: empty, isTransactionFilterValues: valid, buildTransactionFilters: build } = await server.ssrLoadModule('/src/lib/transactionFilterPresets.ts');
    const { parsePreferences } = await server.ssrLoadModule('/src/lib/preferences.ts');
    const preset = { id: 'preset', name: 'Coffee', values: { ...empty, search: 'coffee', categories: ['food'] } };
    assert.deepEqual(parsePreferences({ transaction_filters: [preset] }).transaction_filters, [preset]);
    for (const invalid of [null, {}, { ...empty, accounts: [1] }, { ...empty, categories: undefined },
      { ...empty, from: '2025-02-30' }, { ...empty, from: '2026-02-01', to: '2026-01-01' },
      { ...empty, minimum: 'NaN' }, { ...empty, minimum: 'Infinity' }, { ...empty, minimum: ' ' },
      { ...empty, minimum: '2', maximum: '2' }, { ...empty, minimum: '3', maximum: '-1' }]) {
      assert.equal(valid(invalid), false);
      assert.throws(() => build(invalid));
      assert.deepEqual(parsePreferences({ transaction_filters: [{ ...preset, values: invalid }] }).transaction_filters, []);
    }
    assert.deepEqual(parsePreferences({ transaction_filters: [preset, preset, null, { ...preset, id: 'blank', name: ' ' }] }).transaction_filters, [preset]);
    assert.deepEqual(parsePreferences({ transaction_filters: {} }).transaction_filters, []);
  } finally { await server.close(); }
});
