import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleSession, getSessionId } from '../src/lib/idleSession.js';
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

function setup({ initial = 'active', timeout = IDLE_TIMEOUT_MS } = {}) {
  let clock = 100000000;
  let serverExpiry = clock + timeout;
  let serverState = initial;
  let fail = false;
  const calls = [];
  const states = [];
  let expired = 0;
  let broadcast = 0;
  const client = { schema: (schema) => {
    assert.equal(schema, 'app');
    return { rpc: async (name) => {
      calls.push(name);
      if (fail) return { error: new Error('offline') };
      if (serverState === 'active' && clock >= serverExpiry) serverState = 'expired';
      if (name === 'touch_session' && serverState !== 'expired') {
        serverState = 'active'; serverExpiry = clock + timeout;
      }
      return { data: { state: serverState, expires_at: new Date(serverExpiry).toISOString(), server_time: new Date(clock).toISOString() } };
    } };
  } };
  const idle = createIdleSession({ client, now: () => clock, onChange: (state) => states.push(state),
    onExpire: () => { expired++; }, onActivityRecorded: () => { broadcast++; } });
  return { idle, calls, states, advance: (ms) => { clock += ms; }, expiry: () => serverExpiry,
    expired: () => expired, broadcast: () => broadcast, fail: (value) => { fail = value; },
    configureTimeout: (value) => { serverExpiry += value - timeout; timeout = value; },
    serverActivity: () => { serverExpiry = clock + timeout; } };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('server configuration controls shorter and longer deadlines without a client timeout limit', async () => {
  const s = setup({ timeout: 4 * 60 * 60 * 1000 });
  await s.idle.start();
  assert.equal(s.states.at(-1).status, 'active');
  s.configureTimeout(10 * 60 * 1000);
  await s.idle.check();
  s.advance(9 * 60 * 1000); s.idle.tick(); await settle();
  assert.equal(s.states.at(-1).status, 'warning');
  assert.equal(s.states.at(-1).seconds, 60);
  s.configureTimeout(3 * 60 * 60 * 1000);
  await s.idle.check();
  assert.equal(s.states.at(-1).status, 'active');
  s.advance(3 * 60 * 60 * 1000); s.idle.tick(); await settle();
  assert.equal(s.expired(), 1);
});

test('only a server-confirmed new session bootstraps; restored sessions do not count as activity', async () => {
  const fresh = setup({ initial: 'new' }); await fresh.idle.start();
  assert.deepEqual(fresh.calls, ['session_status', 'touch_session']);
  const restored = setup(); await restored.idle.start();
  assert.deepEqual(restored.calls, ['session_status']);
  assert.equal(restored.states.at(-1).hasAccess, true);
});

test('background polling never extends expiry and warning appears in the last minute', async () => {
  const s = setup(); await s.idle.start(); const deadline = s.expiry();
  s.advance(IDLE_TIMEOUT_MS - 60000); s.idle.tick(); await settle();
  assert.equal(s.states.at(-1).status, 'warning');
  assert.equal(s.states.at(-1).seconds, 60);
  assert.equal(s.expiry(), deadline);
  assert.ok(s.calls.every((name) => name === 'session_status'));
  s.advance(60000); s.idle.tick(); await settle();
  assert.equal(s.states.at(-1).status, 'expired');
  assert.equal(s.states.at(-1).hasAccess, false);
  assert.equal(s.expired(), 1);
  await s.idle.stay(); s.idle.activity(); s.idle.tick();
  assert.equal(s.expired(), 1, 'Expired controllers cannot be revived or sign out repeatedly');
});

test('user activity renews server state, throttles continuous events, and notifies other tabs', async () => {
  const s = setup(); await s.idle.start(); s.advance(1000);
  s.idle.activity(); await settle(); const renewed = s.expiry();
  assert.equal(s.calls.filter((name) => name === 'touch_session').length, 1);
  assert.equal(s.broadcast(), 1);
  for (let i = 0; i < 20; i++) s.idle.activity();
  await settle(); assert.equal(s.expiry(), renewed);
  s.advance(60000); s.idle.tick(); await settle();
  assert.equal(s.calls.filter((name) => name === 'touch_session').length, 2);
});

test('suspension discards old queued activity instead of renewing on wake', async () => {
  const s = setup(); await s.idle.start();
  s.idle.activity(); await settle();
  s.advance(1000); s.idle.activity();
  const deadline = s.expiry();
  s.advance(IDLE_TIMEOUT_MS - 120000); s.idle.tick(); await settle();
  assert.equal(s.expiry(), deadline, 'Old queued activity must not keep an idle session alive');
  assert.equal(s.calls.filter((name) => name === 'touch_session').length, 1);
});

test('Stay signed in renews during warning but cannot revive a server-expired session', async () => {
  const s = setup(); await s.idle.start();
  s.advance(IDLE_TIMEOUT_MS - 30000); s.idle.tick(); await settle();
  await s.idle.stay(); assert.equal(s.states.at(-1).status, 'active');
  s.advance(IDLE_TIMEOUT_MS + 1); await s.idle.stay();
  assert.equal(s.states.at(-1).status, 'expired');
});

test('resume validates before showing data and does not renew a closed or sleeping session', async () => {
  const s = setup(); await s.idle.start();
  s.advance(IDLE_TIMEOUT_MS + 1);
  const request = s.idle.check();
  assert.equal(s.states.at(-1).status, 'checking');
  await request;
  assert.equal(s.states.at(-1).hasAccess, false);
  assert.equal(s.expired(), 1);
  assert.ok(s.calls.every((name) => name === 'session_status'));
});

test('activity in another tab is confirmed on server without creating another touch', async () => {
  const s = setup(); await s.idle.start();
  s.advance(IDLE_TIMEOUT_MS - 1000); s.serverActivity();
  s.advance(2000); s.idle.tick(); await settle();
  assert.equal(s.states.at(-1).status, 'active');
  assert.equal(s.expired(), 0);
  assert.ok(s.calls.every((name) => name === 'session_status'));
});

test('network failures sign out once and cannot resume the same session', async () => {
  const s = setup(); await s.idle.start();
  s.fail(true); await s.idle.check();
  assert.equal(s.states.at(-1).status, 'error');
  assert.equal(s.states.at(-1).hasAccess, false);
  assert.equal(s.expired(), 1);
  const calls = s.calls.length;
  s.fail(false); await s.idle.check();
  await s.idle.stay(); s.idle.activity(); s.idle.tick();
  assert.equal(s.states.at(-1).status, 'error');
  assert.equal(s.calls.length, calls);
  assert.equal(s.expired(), 1);
});

test('stopping a controller ignores in-flight results from a previous user/session', async () => {
  const s = setup({ initial: 'new' }); const request = s.idle.start();
  s.idle.stop(); await request;
  assert.deepEqual(s.states, []);
  assert.deepEqual(s.calls, ['session_status'], 'Disposed sessions must not bootstrap');
  assert.equal(s.expired(), 0);
});

test('session identity survives token refresh and missing claims fail closed', () => {
  const session = { access_token: `h.${btoa(JSON.stringify({ session_id: 'same-session', iat: 1 }))}.s` };
  assert.equal(getSessionId(session), 'same-session');
  session.access_token = `h.${btoa(JSON.stringify({ session_id: 'same-session', iat: 2 }))}.s`;
  assert.equal(getSessionId(session), 'same-session');
  for (const value of [null, {}, { access_token: 'invalid' }, { access_token: 'h.bad.s' }]) assert.equal(getSessionId(value), null);
});
