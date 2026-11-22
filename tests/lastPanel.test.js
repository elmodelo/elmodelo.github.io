import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('last panel restores per user, validates pinned filters and tolerates unavailable storage', async () => {
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { restoreLastPanel, rememberLastPanel } = await server.ssrLoadModule('/src/lib/lastPanel.ts');
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    assert.equal(restoreLastPanel('user-a', [], storage), 'transactions');
    for (const section of ['transactions', 'net-worth', 'cash-flow', 'uncategorized', 'preferences', 'account']) {
      rememberLastPanel('user-a', section, storage);
      assert.equal(restoreLastPanel('user-a', [], storage), section);
    }
    rememberLastPanel('user-b', 'cash-flow', storage);
    rememberLastPanel('user-a', 'net-worth', storage);
    assert.equal(restoreLastPanel('user-a', [], storage), 'net-worth');
    assert.equal(restoreLastPanel('user-b', [], storage), 'cash-flow');
    rememberLastPanel('user-a', 'saved-filter:favorite', storage);
    assert.equal(restoreLastPanel('user-a', ['favorite'], storage), 'saved-filter:favorite');
    assert.equal(restoreLastPanel('user-a', [], storage), 'transactions', 'Deleted or unpinned filters fall back');
    for (const value of ['', 'invalid-panel', 'saved-filter:', '{"section":"cash-flow"}']) {
      rememberLastPanel('user-a', value, storage);
      assert.equal(restoreLastPanel('user-a', [], storage), 'transactions');
    }
    const denied = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
    assert.equal(restoreLastPanel('user-a', [], denied), 'transactions');
    assert.doesNotThrow(() => rememberLastPanel('user-a', 'net-worth', denied));
    assert.equal(restoreLastPanel('user-a', []), 'transactions', 'Rendering without browser storage is safe');
    assert.doesNotThrow(() => rememberLastPanel('user-a', 'net-worth'));
  } finally { await server.close(); }
});
