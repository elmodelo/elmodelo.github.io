import test from 'node:test';
import assert from 'node:assert/strict';
import { categorizeTransactions, fetchCategories } from '../src/lib/transactionCategorization.js';

test('loads all category pages and surfaces load errors', async () => {
  const ranges = [];
  const signal = new AbortController().signal;
  const batch = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: String(i) }));
  let fail = false;
  const query = {
    select() { return this; }, order() { return this; },
    range(start, end) { ranges.push([start, end]); return this; },
    async abortSignal(actual) {
      assert.equal(actual, signal);
      if (fail) return { data: null, error: new Error('Failed') };
      return { data: ranges.length === 1 ? batch : [{ id: 'last', name: 'Last' }], error: null };
    },
  };
  const client = { schema() { return { from() { return query; } }; } };
  assert.equal((await fetchCategories(client, signal)).length, 501);
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  fail = true;
  await assert.rejects(fetchCategories(client, signal), /Could not load categories/);
});

test('saves the entire selection with exactly one RPC for every rule option', async () => {
  const calls = [];
  const client = { schema(schema) {
    assert.equal(schema, 'finance');
    return { async rpc(name, args) {
      calls.push({ name, args });
      return { data: args.p_transactions.length, error: null };
    } };
  } };
  for (const [insertRule, applyRule] of [[false, false], [true, false], [false, true], [true, true]]) {
    calls.length = 0;
    await categorizeTransactions(client, ['a', 'b', 'c'], 'category', insertRule, applyRule);
    assert.deepEqual(calls, [{
      name: 'set_transaction_categories',
      args: { p_transactions: ['a', 'b', 'c'], p_category: 'category',
        p_insert_rule: insertRule, p_apply_rule: insertRule && applyRule },
    }]);
  }
});

test('database failures reject the whole save and retry resubmits the complete selection', async () => {
  const calls = [];
  let fail = true;
  const client = { schema() { return { async rpc(_name, args) {
    calls.push(args.p_transactions);
    return fail ? { data: null, error: new Error('Database error') }
      : { data: args.p_transactions.length, error: null };
  } }; } };
  await assert.rejects(categorizeTransactions(client, ['a', 'b'], 'category', true, true));
  fail = false;
  await categorizeTransactions(client, ['a', 'b'], 'category', true, true);
  assert.deepEqual(calls, [['a', 'b'], ['a', 'b']]);
});

test('network failures and invalid responses never report a successful save', async () => {
  for (const result of [null, 0, 1]) {
    const client = { schema() { return { async rpc() { return { data: result, error: null }; } }; } };
    await assert.rejects(categorizeTransactions(client, ['a', 'b'], 'category', false));
  }
  const client = { schema() { return { async rpc() { throw new Error('Network error'); } }; } };
  await assert.rejects(categorizeTransactions(client, ['a', 'b'], 'category', false), /Network error/);
});

test('single selections use the bulk path, duplicate IDs are removed, and empty selections do not write', async () => {
  const calls = [];
  const client = { schema() { return { async rpc(name, args) {
    calls.push({ name, args });
    return { data: args.p_transactions.length, error: null };
  } }; } };
  await categorizeTransactions(client, [], 'category', false);
  assert.equal(calls.length, 0);
  await categorizeTransactions(client, ['a', 'a'], 'category', false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'set_transaction_categories');
  assert.deepEqual(calls[0].args.p_transactions, ['a']);
});
