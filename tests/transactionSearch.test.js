import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('transaction search keeps plain text fuzzy and validates complete backtick expressions', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { parseTransactionSearch: parse, resolveSearchNames: resolve } = await server.ssrLoadModule('/src/lib/transactionSearch.ts');
    assert.deepEqual(parse(' coffee shop '), {
      status: 'ready', filters: [{ field: 'description', operator: 'search', value: 'coffee shop' }], names: [],
    });
    assert.deepEqual(parse('`Groceries <-'), { status: 'open' });
    assert.deepEqual(parse('`"Home Office" épicerie >-100.25 <0 =-.50 !=+10 date:2024-02-01..2024-02-29`'), {
      status: 'ready',
      names: ['Home Office', 'épicerie'],
      filters: [
        { field: 'amount', operator: 'gt', value: '-100.25' },
        { field: 'amount', operator: 'lt', value: '0' },
        { field: 'amount', operator: 'eq', value: '-.50' },
        { field: 'amount', operator: 'neq', value: '+10' },
        { field: 'posted_at', operator: 'gte', value: '2024-02-01T00:00:00.000Z' },
        { field: 'posted_at', operator: 'lt', value: '2024-03-01T00:00:00.000Z' },
      ],
    });
    const [lower, upper] = parse('`date:2026-11-30`').filters;
    assert.deepEqual(lower, { field: 'posted_at', operator: 'gte', value: '2026-11-30T00:00:00.000Z' });
    assert.deepEqual(upper, { field: 'posted_at', operator: 'lt', value: '2026-12-01T00:00:00.000Z' });
    assert.deepEqual(parse('`date:2026-11-30..`').filters, [lower]);
    assert.deepEqual(parse('`date:..2026-11-30`').filters, [upper]);
    for (const expression of ['> 2', '<=2', '>=2', '!=', '>2e3', '>2<4', 'date:..', 'date:2025-02-29',
      'date:2026-12-02..2026-12-01', 'date:2026-01-01..2026-02-01..', '"Home Office', '" "', '"Food"Dining']) {
      assert.deepEqual(parse('`' + expression + '`'), { status: 'invalid' }, expression);
    }
    assert.deepEqual(parse('`Food` trailing'), { status: 'invalid' });
    const categories = [
      { id: 'c1', name: 'Home Office' }, { id: 'c2', name: 'Épicerie' }, { id: 'c3', name: 'Dining' },
    ];
    const accounts = [
      { id: 'a1', name: 'Home Office' }, { id: 'a2', name: 'Daily Banking' }, { id: 'a3', name: 'Daily Banking' },
    ];
    assert.deepEqual(resolve(['home office', 'E\u0301PICERIE', 'épicerie', 'Daily Banking', 'Missing'], categories, accounts), {
      filters: [
        { field: 'account', operator: 'in', value: ['a1', 'a2', 'a3'] },
        { field: 'category', operator: 'in', value: ['c1', 'c2'] },
      ],
      unknown: ['Missing'],
    });
    assert.deepEqual(resolve(['Daily Banking'], categories, accounts), {
      filters: [{ field: 'account', operator: 'in', value: ['a2', 'a3'] }], unknown: [],
    });
    assert.deepEqual(resolve(['Dining'], categories, accounts), {
      filters: [{ field: 'category', operator: 'in', value: ['c3'] }], unknown: [],
    });
  } finally {
    await server.close();
  }
});
