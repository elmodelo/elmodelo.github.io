import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fetchLatestAssets, assetSnapshotInput, changedAssetSnapshotInput, saveAssetSnapshot, newAssetInput, createAsset } from '../src/lib/assets.js';
import { loadNetWorth, netWorthAllocation } from '../src/lib/netWorth.js';

const holding = { id: 'asset', name: 'Fund', currency: 'USD', type: 'ASSET',
  asset_count: [{ count: '2.5', posted_at: '2026-11-20T00:00:00Z' }],
  asset_value: [{ value: '10.125', posted_at: '2026-11-21T00:00:00Z' }] };
function clientFor(handler) {
  return createClient('http://127.0.0.1:54321', 'test', { global: { fetch: async (url, init) => {
    const result = await handler(new URL(url), init);
    return new Response(JSON.stringify(result.data), { status: result.status ?? 200,
      headers: { 'content-type': 'application/json' } });
  } } });
}
const rates = async () => ({ date: '2026-11-21', cadPerUnit: { USD: 1.4 } });

test('asset query limits each snapshot independently, retains inactive assets, and cancels', async () => {
  const signal = new AbortController().signal;
  const client = clientFor((url, init) => {
    assert.equal(url.pathname, '/rest/v1/asset');
    assert.equal(url.searchParams.get('asset_count.order'), 'posted_at.desc');
    assert.equal(url.searchParams.get('asset_value.order'), 'posted_at.desc');
    assert.equal(url.searchParams.get('asset_count.limit'), '1');
    assert.equal(url.searchParams.get('asset_value.limit'), '1');
    assert.equal(url.searchParams.get('order'), 'id.asc');
    assert.equal(init.signal, signal);
    assert.equal(new Headers(init.headers).get('accept-profile'), 'finance');
    return { data: [holding, { ...holding, id: 'missing', asset_count: [] },
      { ...holding, id: 'zero', asset_count: [{ count: 0, posted_at: '2026-11-22' }] },
      { ...holding, id: 'tiny', asset_count: [{ count: 1e-8, posted_at: '2026-11-22' }] }] };
  });
  const rows = await fetchLatestAssets(client, signal);
  assert.equal(rows[0].snapshot.amount, 25.3125);
  assert.equal(rows[0].snapshot.postedAt, '2026-11-21T00:00:00Z');
  assert.equal(rows[0].count.postedAt, '2026-11-20T00:00:00Z');
  assert.equal(rows[1].snapshot, null);
  assert.equal(rows[2].snapshot.amount, 0);
  assert.equal(rows[3].count.rawAmount, '0.00000001');
  assert.equal(assetSnapshotInput(rows[3].count.rawAmount, rows[3].price.rawAmount, '2026-11-22').p_count, '0.00000001');
});

test('asset pagination loads holdings beyond the API row limit', async () => {
  const offsets = [];
  const rows = await fetchLatestAssets(clientFor((url) => {
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return { data: Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({ ...holding, id: String(offset + i) })) };
  }));
  assert.deepEqual(offsets, [0, 500]);
  assert.equal(rows.length, 501);
});

test('malformed snapshots and database errors are rejected', async () => {
  for (const data of [null, [{ ...holding, currency: 'EUR' }],
    [{ ...holding, asset_count: [{ count: '-1', posted_at: '2026-11-20' }] }],
    [{ ...holding, asset_value: [{ value: 'NaN', posted_at: '2026-11-20' }] }],
    [{ ...holding, asset_value: [{ value: 1, posted_at: 'invalid' }] }],
    [{ ...holding, asset_count: [holding.asset_count[0], holding.asset_count[0]] }]]) {
    await assert.rejects(fetchLatestAssets(clientFor(() => ({ data }))));
  }
  await assert.rejects(fetchLatestAssets(clientFor(() => ({ status: 403, data: { message: 'denied' } }))));
});

test('snapshot inputs preserve decimal strings, distinguish zero from blank, and reject invalid entries', () => {
  const date = '2026-11-21T12:34:56Z';
  assert.deepEqual(assetSnapshotInput(' 0 ', '123.123456789123456789', date), {
    p_count: '0', p_value: '123.123456789123456789', p_posted_at: '2026-11-21T12:34:56.000Z',
  });
  assert.equal(assetSnapshotInput('', '.125', date).p_count, null);
  assert.equal(assetSnapshotInput('2', '', date).p_value, null);
  for (const value of ['-1', 'NaN', 'Infinity', '-Infinity', '1,2', '1e2', '0x10']) {
    assert.throws(() => assetSnapshotInput(value, '', date));
  }
  assert.throws(() => assetSnapshotInput('', '', date));
  assert.throws(() => assetSnapshotInput('1', '', 'invalid'));
});

test('editing skips unchanged snapshots and date-only changes while saving only changed metrics', () => {
  const asset = { count: { amount: 2.5, rawAmount: '2.500' }, price: { amount: 10.125, rawAmount: '10.125' } };
  const date = '2026-11-22T00:00:00Z';
  assert.equal(changedAssetSnapshotInput(asset, '2.5', '10.125', date), null);
  assert.equal(changedAssetSnapshotInput(asset, '002.5000', '010.1250', date), null);
  assert.equal(changedAssetSnapshotInput(asset, '', '', date), null);
  assert.equal(changedAssetSnapshotInput(asset, '', '10.125', date), null);
  assert.deepEqual(changedAssetSnapshotInput(asset, '3', '10.125', date), {
    p_count: '3', p_value: null, p_posted_at: '2026-11-22T00:00:00.000Z',
  });
  assert.deepEqual(changedAssetSnapshotInput(asset, '2.5', '0', date), {
    p_count: null, p_value: '0', p_posted_at: '2026-11-22T00:00:00.000Z',
  });
  assert.deepEqual(changedAssetSnapshotInput(asset, '3', '11', date), {
    p_count: '3', p_value: '11', p_posted_at: '2026-11-22T00:00:00.000Z',
  });
  assert.equal(changedAssetSnapshotInput({ count: { amount: 0 }, price: { amount: 0 } }, '00.00', '.0', date), null);
  assert.equal(changedAssetSnapshotInput({ count: null, price: null }, '0', '', date).p_count, '0');
  const precise = { count: { amount: 1, rawAmount: '1.000000000000000001' }, price: null };
  assert.equal(changedAssetSnapshotInput(precise, '1.000000000000000002', '', date).p_count, '1.000000000000000002');
  assert.equal(changedAssetSnapshotInput(precise, '1.0000000000000000010', '', date), null);
  assert.throws(() => changedAssetSnapshotInput(asset, 'NaN', '10.125', date));
});

test('saving count and value uses one RPC and preserves timestamp conflict details', async () => {
  const input = assetSnapshotInput('2.5', '10.125', '2026-11-20T00:00:00Z');
  let requests = 0;
  await saveAssetSnapshot(clientFor((url, init) => {
    requests++;
    assert.equal(url.pathname, '/rest/v1/rpc/add_asset_snapshot');
    assert.equal(new Headers(init.headers).get('content-profile'), 'finance');
    assert.deepEqual(JSON.parse(init.body), { p_asset: 'asset', ...input });
    return { data: null };
  }), 'asset', input);
  assert.equal(requests, 1);
  await assert.rejects(saveAssetSnapshot(clientFor(() => ({ status: 409, data: { code: '23505', message: 'duplicate' } })),
    'asset', input), { code: '23505' });
});

test('assets contribute to CAD totals and allocation without tracked accounts', async () => {
  const client = clientFor(() => ({ data: [holding] }));
  const result = await loadNetWorth(client, [], undefined, rates, true);
  assert.equal(result.total, 25.3125 * 1.4);
  assert.equal(result.assetsError, false);
  assert.equal(result.accountsError, false);
  const allocation = netWorthAllocation(result);
  assert.equal(allocation.length, 1);
  assert.equal(allocation[0].name, 'Fund');
  assert.equal(allocation[0].pieShare, 1);
});

test('incomplete holdings remain editable data and mark the total incomplete without requiring FX', async () => {
  const result = await loadNetWorth(clientFor(() => ({ data: [{ ...holding, asset_count: [] }] })), [], undefined,
    () => assert.fail('No conversion for a missing holding'), true);
  assert.equal(result.total, 0);
  assert.equal(result.incomplete, true);
  assert.equal(result.rows[0].price.amount, 10.125);
  assert.equal(result.rows[0].snapshot, null);
});

test('asset and account values combine, with safe totals when either source or conversion fails', async () => {
  const accounts = [{ id: 'account', name: 'Checking', currency: 'CAD' }];
  for (const failure of [null, 'asset', 'account', 'rate']) {
    const client = clientFor((url) => url.pathname.endsWith(failure)
      ? { status: 403, data: { message: 'denied' } }
      : { data: url.pathname.endsWith('asset') ? [holding]
        : [{ id: 'account', balance: [{ balance: 100, posted_at: '2026-11-21' }] }] });
    const result = await loadNetWorth(client, accounts, undefined,
      failure === 'rate' ? async () => { throw new Error('offline'); } : rates, true);
    assert.equal(result.total, failure === null ? 100 + 25.3125 * 1.4 : null);
    assert.equal(result.accountsError, failure === 'account');
    assert.equal(result.assetsError, failure === 'asset');
    if (failure === 'account') assert.equal(result.rows[0].kind, 'asset');
    if (failure === 'asset') assert.equal(result.rows[0].id, 'account');
    if (failure === null) assert.equal(netWorthAllocation(result).length, 2);
  }
});

test('localized cards show quantities only above one, price dates, and writer-only dialog access', async () => {
  env.VITE_SUPABASE_URL = 'http://127.0.0.1:54321';
  env.VITE_SUPABASE_ANON_KEY = 'test-key';
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: Card } = await server.ssrLoadModule('/src/components/AssetCard.tsx');
    const { NetWorthTable } = await server.ssrLoadModule('/src/components/NetWorthPanel.tsx');
    const { default: Allocation } = await server.ssrLoadModule('/src/components/NetWorthAllocationCard.tsx');
    const { default: Dialog } = await server.ssrLoadModule('/src/components/AssetSnapshotDialog.tsx');
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    const [asset] = await fetchLatestAssets(clientFor(() => ({ data: [holding] })));
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const render = (role, count = 2.5) => renderToStaticMarkup(createElement(PermissionsProvider, { role },
        createElement(Card, { asset: { ...asset, count: { ...asset.count, amount: count } }, messages, onSaved() {} })));
      const result = await loadNetWorth(clientFor(() => ({ data: [holding] })), [], undefined, rates, true);
      const table = renderToStaticMarkup(createElement(NetWorthTable, { result, messages, titleId: 'balances' }));
      assert.ok(!table.includes('Fund'), 'Assets do not appear as account rows');
      const allocation = renderToStaticMarkup(createElement(Allocation, { result, messages }));
      assert.ok(allocation.includes('Fund'), 'Assets appear in allocation');
      const converted = renderToStaticMarkup(createElement(Card, { asset: result.rows[0], messages, onSaved() {} }));
      const cadFormat = new Intl.NumberFormat(language, { style: 'currency', currency: 'CAD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 });
      assert.ok(converted.includes('class="asset-valuation">' + cadFormat.format(result.rows[0].cad)));
      const usdFormat = new Intl.NumberFormat(language, { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 });
      assert.ok(converted.includes('class="asset-native-value">(' + usdFormat.format(asset.snapshot.amount) + ')</p>'));
      assert.ok(converted.includes(cadFormat.format(result.rows[0].cad)));
      assert.match(converted, /USD/);
      const zeroCad = renderToStaticMarkup(createElement(Card, { asset: { ...asset, cad: 0 }, messages, onSaved() {} }));
      assert.ok(zeroCad.includes(cadFormat.format(0)));
      const nativeCad = renderToStaticMarkup(createElement(Card, { asset: { ...asset, currency: 'CAD', cad: 25.3125 }, messages, onSaved() {} }));
      assert.ok(!nativeCad.includes('asset-native-value'), 'CAD assets need no duplicate native value');
      const reader = render('READER');
      assert.ok(reader.includes('Fund'));
      assert.match(reader, /USD/);
      assert.ok(reader.includes(messages.assetCadUnavailable));
      assert.match(reader, /×/);
      const unitPrice = new Intl.NumberFormat(language, { style: 'currency', currency: 'USD', currencyDisplay: 'code', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(10.125);
      assert.ok(reader.includes(unitPrice), 'Unit price displays without decimals');
      assert.match(reader, /dateTime="2026-11-21T00:00:00Z"/);
      assert.ok(reader.includes(messages.assetCountDate));
      assert.ok(!reader.includes(messages.assetUpdate));
      const writer = render('WRITER');
      assert.ok(writer.includes(messages.assetActions.replace('{name}', asset.name)));
      assert.match(writer, /aria-haspopup="menu"/);
      assert.ok(!writer.includes(messages.assetUpdate), 'Update holding is inside the closed overflow menu');
      assert.ok(!writer.includes('button button-secondary'), 'No standalone update button');
      assert.doesNotMatch(reader, /aria-haspopup="menu"/);
      assert.doesNotMatch(render('WRITER', 1), /×/);
      assert.doesNotMatch(render('WRITER', 0.5), /×/);
      const dialog = renderToStaticMarkup(createElement(Dialog, { asset, messages, onClose() {}, onSaved() {} }));
      assert.match(dialog, /<dialog/);
      assert.match(dialog, /datetime-local/);
      assert.ok(dialog.includes(messages.assetSnapshotHelp));
      assert.match(dialog, /value="2.5"/);
      assert.match(dialog, /value="10.125"/);
      const zero = renderToStaticMarkup(createElement(Dialog, {
        asset: { ...asset, count: { amount: 0, rawAmount: '0' }, price: null }, messages, onClose() {}, onSaved() {},
      }));
      assert.match(zero, /inputMode="text"[^>]*value="0"/);
      assert.match(zero, /inputMode="text"[^>]*value=""/);
      const precise = renderToStaticMarkup(createElement(Dialog, {
        asset: { ...asset, price: { amount: 10.123456789123457, rawAmount: '10.123456789123456789' } },
        messages, onClose() {}, onSaved() {},
      }));
      assert.match(precise, /value="10.123456789123456789"/);
    }
  } finally { await server.close(); }
});


test('new assets require a name, supported currency and both precise initial observations', () => {
  const date = '2026-11-21T12:34:56Z';
  assert.deepEqual(newAssetInput('  Home  ', 'CAD', '1', '123456.123456789123456789', date), {
    p_name: 'Home', p_currency: 'CAD', p_type: 'ASSET', p_count: '1', p_value: '123456.123456789123456789',
    p_posted_at: '2026-11-21T12:34:56.000Z',
  });
  assert.equal(newAssetInput('Empty holding', 'USD', '0', '0', date).p_value, '0');
  for (const args of [[' ', 'CAD', '1', '1'], ['Home', 'EUR', '1', '1'],
    ['Home', 'CAD', '', '1'], ['Home', 'CAD', '1', ''], ['Home', 'CAD', '-1', '1'],
    ['Home', 'CAD', '1', 'Infinity']]) {
    assert.throws(() => newAssetInput(...args, date));
  }
});

test('creation uses one atomic RPC and requires a confirmed asset ID', async () => {
  const input = newAssetInput('Home', 'CAD', '1', '123456.789', '2026-11-21T00:00:00Z');
  let requests = 0;
  const id = await createAsset(clientFor((url, init) => {
    requests++;
    assert.equal(url.pathname, '/rest/v1/rpc/create_asset');
    assert.equal(new Headers(init.headers).get('content-profile'), 'finance');
    assert.deepEqual(JSON.parse(init.body), input);
    return { data: 'new-asset-id' };
  }), input);
  assert.equal(id, 'new-asset-id');
  assert.equal(requests, 1);
  for (const code of ['23505', '42501']) {
    await assert.rejects(createAsset(clientFor(() => ({ status: 409, data: { code, message: 'denied' } })), input), { code });
  }
  await assert.rejects(createAsset(clientFor(() => ({ data: null })), input));
});

test('overflow menu is available to readers and writers and creation dialog requires all initial fields', async () => {
  const server = await createServer({ envDir: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: Actions } = await server.ssrLoadModule('/src/components/NetWorthActions.tsx');
    const { default: Dialog } = await server.ssrLoadModule('/src/components/AssetSnapshotDialog.tsx');
    const { PermissionsProvider } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const render = (role) => renderToStaticMarkup(createElement(PermissionsProvider, { role },
        createElement(Actions, { messages, onAdd() {}, showInactive: false, onShowInactiveChange() {}, includeResp: false, onIncludeRespChange() {} })));
      assert.match(render('READER'), /aria-haspopup="menu"/);
      assert.equal(render(null), '');
      const writer = render('WRITER');
      assert.match(writer, /aria-haspopup="menu"/);
      assert.match(writer, /aria-expanded="false"/);
      assert.ok(writer.includes(messages.netWorthActions));
      assert.ok(!writer.includes(messages.assetAdd), 'The action is tucked inside the closed overflow menu');
      const dialog = renderToStaticMarkup(createElement(Dialog, { messages, onClose() {}, onSaved() {} }));
      assert.ok(dialog.includes(messages.assetAdd));
      assert.ok(dialog.includes(messages.assetName));
      assert.ok(dialog.includes(messages.assetCurrency));
      assert.match(dialog, /value="CAD"/);
      assert.match(dialog, /value="USD"/);
      assert.equal((dialog.match(/required=""/g) ?? []).length, 5);
      assert.ok(dialog.includes(messages.assetCreateHelp));
    }
  } finally { await server.close(); }
});

test('RESP preference affects account balances without excluding a separately named RESP asset', async () => {
  const client = clientFor((url) => ({ data: url.pathname.endsWith('asset')
    ? [{ ...holding, name: 'RESP', currency: 'CAD' }]
    : [{ id: 'resp', balance: [{ balance: 200, posted_at: '2026-11-22' }] }] }));
  const accounts = [{ id: 'resp', name: 'RESP', currency: 'CAD' }];
  const excluded = await loadNetWorth(client, accounts, undefined, rates, true, false);
  assert.equal(excluded.total, 25.3125);
  assert.equal(netWorthAllocation(excluded).length, 1);
  const included = await loadNetWorth(client, accounts, undefined, rates, true, true);
  assert.equal(included.total, 225.3125);
  assert.equal(netWorthAllocation(included).length, 2);
});


test('liabilities retain signed prices, reduce net worth, and remain available after payoff', async () => {
  const loan = { ...holding, id: 'loan', name: 'Loan', type: 'LIABILITY', currency: 'CAD',
    asset_count: [{ count: '1', posted_at: '2026-11-22' }],
    asset_value: [{ value: '-20000.123456789123456789', posted_at: '2026-11-22' }] };
  const result = await loadNetWorth(clientFor(() => ({ data: [{ ...holding, currency: 'CAD' }, loan] })), [], undefined, rates, true);
  assert.equal(result.total, 25.3125 - Number(loan.asset_value[0].value.slice(1)));
  assert.deepEqual(netWorthAllocation(result).map(({ id }) => id), ['asset']);
  assert.equal(result.rows[1].type, 'LIABILITY');
  assert.equal(result.rows[1].price.rawAmount, '-20000.123456789123456789');
  const paid = await fetchLatestAssets(clientFor(() => ({ data: [{ ...loan,
    asset_count: [{ count: 0, posted_at: '2026-11-23' }] }] })));
  assert.equal(paid[0].snapshot.amount, 0);
  assert.equal(paid[0].price.rawAmount, loan.asset_value[0].value);
  const tiny = await fetchLatestAssets(clientFor(() => ({ data: [{ ...loan,
    asset_value: [{ value: -1e-8, posted_at: '2026-11-22' }] }] })));
  assert.equal(tiny[0].price.rawAmount, '-0.00000001');
  for (const invalid of [{ ...loan, type: 'OTHER' }, { ...loan, type: 'ASSET' },
    { ...loan, asset_value: holding.asset_value },
    { ...loan, asset_count: [{ count: '-1', posted_at: '2026-11-22' }] }]) {
    await assert.rejects(fetchLatestAssets(clientFor(() => ({ data: [invalid] }))));
  }
});

test('liability inputs enforce signs, preserve precision, and skip equivalent signed values', () => {
  const date = '2026-11-23';
  const input = newAssetInput('Loan', 'CAD', '1', '-20000.123456789123456789', date, 'LIABILITY');
  assert.equal(input.p_type, 'LIABILITY');
  assert.equal(input.p_value, '-20000.123456789123456789');
  const loan = { type: 'LIABILITY', count: { amount: 1 }, price: { rawAmount: input.p_value } };
  assert.equal(changedAssetSnapshotInput(loan, '1', '-020000.1234567891234567890', date), null);
  assert.equal(changedAssetSnapshotInput(loan, '0', input.p_value, date).p_count, '0');
  assert.equal(changedAssetSnapshotInput(loan, '', '-20000 + 500', date).p_value, '-19500');
  for (const type of ['ASSET', 'LIABILITY']) {
    assert.equal(newAssetInput('Zero', 'CAD', '0', '0', date, type).p_value, '0');
    assert.equal(assetSnapshotInput('1', '-0', date, type).p_value, '0');
  }
  for (const [count, value, type] of [['-1', '-2', 'LIABILITY'], ['1', '2', 'LIABILITY'],
    ['1', '-2', 'ASSET'], ['1', '0', 'OTHER']]) {
    assert.throws(() => newAssetInput('Loan', 'CAD', count, value, date, type));
  }
  // Sign checks use decimal text, including values smaller than Number can hold.
  assert.throws(() => assetSnapshotInput('1', '-0.' + '0'.repeat(330) + '1', date, 'ASSET'));
});

test('liability creation and update dialogs identify the type in each locale', async () => {
  const server = await createServer({ envDir: false, server: { ws: false } });
  try {
    const { default: Dialog } = await server.ssrLoadModule('/src/components/AssetSnapshotDialog.tsx');
    const { getLocaleMessages } = await server.ssrLoadModule('/src/locales/index.ts');
    for (const language of ['en', 'es']) {
      const messages = getLocaleMessages(language);
      const props = { messages, onClose() {}, onSaved() {} };
      const creation = renderToStaticMarkup(createElement(Dialog, { ...props, creationType: 'LIABILITY' }));
      assert.ok(creation.includes(messages.liabilityAdd));
      assert.ok(creation.includes(messages.liabilityName));
      assert.ok(creation.includes(messages.liabilityCreateHelp));
      assert.ok(!creation.includes(messages.assetAdd));
      const update = renderToStaticMarkup(createElement(Dialog, { ...props,
        asset: { id: 'loan', name: 'Loan', currency: 'CAD', type: 'LIABILITY', price: { amount: -20000 } } }));
      assert.ok(update.includes(messages.liabilitySnapshotHelp));
      assert.match(update, /value="-20000"/);
    }
  } finally { await server.close(); }
});
