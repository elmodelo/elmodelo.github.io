import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { fetchTransactions } from '../src/lib/transactionQuery.js';

const columns = [
  'posted_at',
  'account(name)',
  'description(name)',
  'description(memo)',
  'category(name)',
  'amount',
];

test('queries every column and direction with server-side pagination and stable ordering', async () => {
  const requests = [];
  const client = createClient('http://127.0.0.1:54321', 'test-key', {
    global: {
      fetch: async (url, options) => {
        requests.push({ url: new URL(url), options });
        return new Response('[]', {
          status: 200,
          headers: { 'content-range': '50-99/127', 'content-type': 'application/json' },
        });
      },
    },
  });
  const controller = new AbortController();

  for (const column of columns) {
    for (const ascending of [true, false]) {
      for (const postedAtAscending of [true, false]) {
        const { data, count, error } = await fetchTransactions(client, {
          sortColumn: column, ascending, postedAtAscending, page: 1, pageSize: 50, signal: controller.signal,
        });
        assert.equal(error, null);
        assert.deepEqual(data, []);
        assert.equal(count, 127);
        const { url, options } = requests.at(-1);
        assert.equal(url.pathname, '/rest/v1/transaction');
        const dateOrder = column === 'posted_at' ? '' : `,posted_at.${postedAtAscending ? 'asc' : 'desc'}.nullslast`;
        assert.equal(url.searchParams.get('order'), `${column}.${ascending ? 'asc' : 'desc'}.nullslast${dateOrder},id.asc`);
        assert.equal(url.searchParams.get('offset'), '50');
        assert.equal(url.searchParams.get('limit'), '50');
        assert.match(url.searchParams.get('select'), /account:account\(name,currency\)/);
        assert.match(url.searchParams.get('select'), /description:transaction_description\(name,memo\)/);
        assert.match(url.searchParams.get('select'), /category:category\(name\)/);
        const headers = new Headers(options.headers);
        assert.equal(headers.get('accept-profile'), 'finance');
        assert.match(headers.get('prefer'), /count=exact/);
        assert.equal(options.signal, controller.signal);
      }
    }
  }
});

test('returns database errors instead of a successful result', async () => {
  const client = createClient('http://127.0.0.1:54321', 'test-key', {
    global: {
      fetch: async () => new Response(JSON.stringify({ message: 'query failed' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    },
  });
  const { data, error } = await fetchTransactions(client, {
    sortColumn: 'posted_at',
    ascending: false,
    page: 0,
    pageSize: 50,
    signal: new AbortController().signal,
  });
  assert.equal(data, null);
  assert.equal(error.message, 'query failed');
});
