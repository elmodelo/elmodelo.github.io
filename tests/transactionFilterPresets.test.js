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

test('a search saved through the filter controls keeps conjunctions, alternatives, and the source query', async () => {
  const server = await makeServer();
  try {
    const { parseTransactionSearch: parse, resolveSearchNames } = await server.ssrLoadModule('/src/lib/transactionSearch.ts');
    const { projectTransactionSearch: project } = await server.ssrLoadModule('/src/lib/projectTransactionSearch.ts');
    const { EMPTY_TRANSACTION_FILTER: empty, buildTransactionFilters: build, parseSavedTransactionFilters } =
      await server.ssrLoadModule('/src/lib/transactionFilterPresets.ts');

    const source = 'costco `Groceries Checking >50 !=75 text:receipt text:"food court" date:20261101..20261130`';
    const parsed = parse(source);
    const resolved = resolveSearchNames(parsed.names, [{ id: 'groceries', name: 'Groceries' }], [{ id: 'checking', name: 'Checking' }]);
    const values = project({ ...empty, accounts: ['checking', 'savings'], from: '2026-11-05', minimum: '35' },
      source, [...parsed.filters, ...resolved.filters]);

    assert.deepEqual(values, {
      ...empty, accounts: ['checking'], categories: ['groceries'], from: '2026-11-05', to: '2026-11-30',
      search: 'costco', minimum: '50', powerSearch: '!=75\ntext:"receipt" text:"food court"', sourceSearch: source,
    });
    const preset = { id: 'saved', name: 'Costco receipts', values };
    const [reloaded] = parseSavedTransactionFilters(JSON.parse(JSON.stringify([preset])));
    assert.deepEqual(reloaded, preset);
    assert.deepEqual(build(reloaded.values), [
      { field: 'account', operator: 'in', value: ['checking'] },
      { field: 'category', operator: 'in', value: ['groceries'] },
      { field: 'posted_at', operator: 'gte', value: '2026-11-05T00:00:00.000Z' },
      { field: 'posted_at', operator: 'lt', value: '2026-12-01T00:00:00.000Z' },
      { field: 'description', operator: 'search', value: 'costco' },
      { field: 'amount', operator: 'gt', value: 50 },
      { field: 'amount', operator: 'neq', value: '75' },
      { field: 'description', operator: 'search.any', value: ['receipt', 'food court'] },
    ]);
    const contradictory = project({ ...empty, maximum: '5', to: '2026-10-01', search: 'first' },
      'second `>10 date:20261118..`', parse('second `>10 date:20261118..`').filters);
    assert.equal(contradictory.powerSearch, 'text:"second"\n>10\ndate:2026-11-18..');
    const precise = project(empty, '`>1.0000000000000001`', parse('`>1.0000000000000001`').filters);
    assert.equal(precise.minimum, '');
    assert.deepEqual(build(precise), [{ field: 'amount', operator: 'gt', value: '1.0000000000000001' }]);
    assert.deepEqual(parseSavedTransactionFilters([{ ...preset, values: { ...values, powerSearch: 'text:' } }]), []);
  } finally { await server.close(); }
});
