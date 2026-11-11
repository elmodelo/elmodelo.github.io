import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { fetchTransactions, fetchUncategorizedTransactionCount, UNCATEGORIZED_TRANSACTION_FILTERS } from '../src/lib/transactionQuery.js';

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
          trackedAccountIds: ['account-a', 'account-b'],
          sortColumn: column, ascending, postedAtAscending, page: 1, pageSize: 50, signal: controller.signal,
        });
        assert.equal(error, null);
        assert.deepEqual(data, []);
        assert.equal(count, 127);
        const { url, options } = requests.at(-1);
        assert.equal(url.pathname, '/rest/v1/transaction');
        assert.equal(url.searchParams.get('account'), 'in.(account-a,account-b)');
        assert.equal(url.searchParams.has('category'), false);
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
    trackedAccountIds: ['account-a'],
    sortColumn: 'posted_at',
    ascending: false,
    page: 0,
    pageSize: 50,
    signal: new AbortController().signal,
  });
  assert.equal(data, null);
  assert.equal(error.message, 'query failed');
});

test('tracking no accounts returns no transactions without querying the database', async () => {
  const client = { schema() { assert.fail('An empty selection must not query all accounts'); } };
  const result = await fetchTransactions(client, {
    trackedAccountIds: [], sortColumn: 'posted_at', ascending: false, page: 0, pageSize: 25,
  });
  assert.deepEqual(result, { data: [], count: 0, error: null });
  assert.deepEqual(await fetchUncategorizedTransactionCount(client, []), { count: 0, error: null });
});

test('uncategorized count includes all matching rows in tracked accounts without fetching them', async () => {
  const requests = [];
  const client = createClient('http://127.0.0.1:54321', 'test-key', {
    global: {
      fetch: async (url, options) => {
        requests.push(new URL(url));
        if (options.method === 'HEAD') {
          assert.match(new Headers(options.headers).get('prefer'), /count=exact/);
          return new Response(null, {
            status: 200, headers: { 'content-range': '*/1234' },
          });
        }
        return new Response('[{"id":"uncategorized-transaction"}]', {
          status: 200,
          headers: { 'content-range': '0-0/1', 'content-type': 'application/json' },
        });
      },
    },
  });
  const signal = new AbortController().signal;
  const result = await fetchUncategorizedTransactionCount(client, ['tracked-account'], signal);
  assert.equal(result.error, null);
  assert.equal(result.count, 1234);
  assert.equal(result.data, null);
  const existenceUrl = requests.at(-1);
  assert.equal(existenceUrl.searchParams.get('account'), 'in.(tracked-account)');
  assert.equal(existenceUrl.searchParams.get('category'), 'is.null');
  assert.equal(existenceUrl.searchParams.has('limit'), false);
  assert.equal(existenceUrl.searchParams.has('offset'), false);

  const page = await fetchTransactions(client, {
    trackedAccountIds: ['tracked-account'], filters: UNCATEGORIZED_TRANSACTION_FILTERS,
    sortColumn: 'amount', ascending: true, page: 2, pageSize: 25, signal,
  });
  assert.equal(page.error, null);
  assert.equal(page.count, 1);
  const pageUrl = requests.at(-1);
  assert.equal(pageUrl.searchParams.get('account'), 'in.(tracked-account)');
  assert.equal(pageUrl.searchParams.get('category'), 'is.null');
  assert.equal(pageUrl.searchParams.get('offset'), '50');
  assert.equal(pageUrl.searchParams.get('limit'), '25');
  assert.equal(pageUrl.searchParams.get('order'), 'amount.asc.nullslast,posted_at.desc.nullslast,id.asc');
});

test('combines conditions with AND while preserving tracked accounts, counts, and pagination', async () => {
  let request;
  const client = createClient('http://127.0.0.1:54321', 'test-key', {
    global: {
      fetch: async (url, options) => {
        request = { url: new URL(url), options };
        return new Response('[]', {
          status: 200,
          headers: { 'content-range': '25-49/60', 'content-type': 'application/json' },
        });
      },
    },
  });
  const filters = [
    { field: 'category', operator: 'in', value: ['category-a', 'category-b'] },
    { field: 'category', operator: 'not.is', value: null },
    { field: 'account', operator: 'eq', value: 'account-b' },
    { field: 'description', operator: 'neq', value: 'excluded-description' },
    { field: 'posted_at', operator: 'gte', value: '2026-01-01' },
    { field: 'posted_at', operator: 'lt', value: '2027-01-01' },
    { field: 'amount', operator: 'gt', value: -100 },
    { field: 'amount', operator: 'lte', value: 0 },
  ];
  const originalFilters = structuredClone(filters);
  const result = await fetchTransactions(client, {
    trackedAccountIds: ['account-a', 'account-b'], filters,
    sortColumn: 'posted_at', ascending: false, page: 1, pageSize: 25,
    signal: new AbortController().signal,
  });
  assert.equal(result.error, null);
  assert.equal(result.count, 60);
  const { url, options } = request;
  assert.deepEqual(url.searchParams.getAll('account'), ['in.(account-a,account-b)', 'eq.account-b']);
  assert.deepEqual(url.searchParams.getAll('category'), ['in.(category-a,category-b)', 'not.is.null']);
  assert.equal(url.searchParams.get('description'), 'neq.excluded-description');
  assert.deepEqual(url.searchParams.getAll('posted_at'), ['gte.2026-01-01', 'lt.2027-01-01']);
  assert.deepEqual(url.searchParams.getAll('amount'), ['gt.-100', 'lte.0']);
  assert.equal(url.searchParams.get('offset'), '25');
  assert.equal(url.searchParams.get('limit'), '25');
  assert.match(new Headers(options.headers).get('prefer'), /count=exact/);
  assert.deepEqual(filters, originalFilters);
});

test('filters do not query transactions when no accounts are tracked', async () => {
  const client = { schema() { assert.fail('Filters must not bypass an empty tracked-account selection'); } };
  const result = await fetchTransactions(client, {
    trackedAccountIds: [], filters: [{ field: 'account', operator: 'eq', value: 'untracked' }],
    sortColumn: 'posted_at', ascending: false, page: 0, pageSize: 25,
  });
  assert.deepEqual(result, { data: [], count: 0, error: null });
});
