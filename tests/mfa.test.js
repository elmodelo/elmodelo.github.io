import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { hasMfaSession, enrollAuthenticator, loadMfaFactors, verifyAuthenticator } from '../src/lib/mfa.js';

const session = (claims) => ({ access_token: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature` });

test('only explicit AAL2 sessions unlock the app, including restored sessions', () => {
  assert.equal(hasMfaSession(session({ aal: 'aal2' })), true);
  for (const value of [null, {}, { access_token: 'malformed' }, { access_token: 'h.!.s' },
    session(null), session({}), session({ aal: 'aal1' }), session({ aal: 'AAL2' }),
    { user: { factors: [{ status: 'verified' }], app_metadata: { aal: 'aal2' } } },
  ]) assert.equal(hasMfaSession(value), false);
});

function clientWith(mfa) { return { auth: { mfa } }; }

test('offers only verified TOTP factors for login', async () => {
  const verified = { id: 'working', status: 'verified' };
  assert.deepEqual(await loadMfaFactors(clientWith({ listFactors: async () => ({ data: { totp: [verified, { id: 'pending', status: 'unverified' }] } }) })), [verified]);
  await assert.rejects(loadMfaFactors(clientWith({ listFactors: async () => ({ error: new Error('offline') }) })), /offline/);
});

test('enrollment cleans abandoned TOTP factors and preserves other factor types', async () => {
  const calls = [];
  const data = { id: 'new', totp: { secret: 'temporary-secret', qr_code: 'data:image/svg+xml,...' } };
  const client = clientWith({
    listFactors: async () => ({ data: { totp: [], all: [
      { id: 'pending', factor_type: 'totp', status: 'unverified' },
      { id: 'phone', factor_type: 'phone', status: 'verified' },
    ] } }),
    unenroll: async (args) => { calls.push(['unenroll', args]); return {}; },
    enroll: async (args) => { calls.push(['enroll', args]); return { data }; },
  });
  assert.equal(await enrollAuthenticator(client), data);
  assert.deepEqual(calls, [
    ['unenroll', { factorId: 'pending' }], ['enroll', { factorType: 'totp', issuer: 'elModelo' }],
  ]);
});

test('enrollment never replaces an existing verified authenticator', async () => {
  await assert.rejects(enrollAuthenticator(clientWith({
    listFactors: async () => ({ data: { totp: [{ status: 'verified' }], all: [] } }),
    unenroll: () => assert.fail('must not remove verified factors'),
    enroll: () => assert.fail('must not enroll another factor'),
  })), /already exists/);
});

test('enrollment fails closed if cleanup fails', async () => {
  await assert.rejects(enrollAuthenticator(clientWith({
    listFactors: async () => ({ data: { totp: [], all: [{ id: 'pending', factor_type: 'totp', status: 'unverified' }] } }),
    unenroll: async () => ({ error: new Error('cleanup failed') }),
    enroll: () => assert.fail('must not enroll after cleanup failure'),
  })), /cleanup failed/);
});

test('verification passes the selected factor and preserves leading zeroes; failed codes can retry', async () => {
  let attempts = 0;
  const client = clientWith({ challengeAndVerify: async (args) => {
    assert.deepEqual(args, { factorId: 'working', code: '012345' });
    return ++attempts === 1 ? { error: new Error('expired code') } : {};
  } });
  await assert.rejects(verifyAuthenticator(client, 'working', '012345'), /expired code/);
  await verifyAuthenticator(client, 'working', '012345');
  assert.equal(attempts, 2);
});
