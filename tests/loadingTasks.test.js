import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoadingTasks } from '../src/lib/loadingTasks.ts';

test('fast waits block interaction without flashing a dialog; slow waits reveal at 200 ms', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createLoadingTasks();
  const finishFast = store.register('fast', 'Loading accounts…');
  assert.equal(store.getSnapshot().pending, true);
  t.mock.timers.tick(100);
  assert.equal(store.getSnapshot().visible, false);
  finishFast();
  t.mock.timers.tick(0);
  assert.equal(store.getSnapshot().pending, false);
  const finishSlow = store.register('slow', 'Loading transactions…');
  t.mock.timers.tick(199);
  assert.equal(store.getSnapshot().visible, false);
  t.mock.timers.tick(1);
  assert.equal(store.getSnapshot().visible, true);
  finishSlow();
  t.mock.timers.tick(0);
  assert.equal(store.getSnapshot().visible, false);
});

test('sequential stages share the delay and never publish an idle gap', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let starts = 0;
  const store = createLoadingTasks(() => { starts++; });
  const states = [];
  store.subscribe(() => states.push(store.getSnapshot()));
  const finishSession = store.register('session', 'Loading session…');
  t.mock.timers.tick(150);
  finishSession();
  const finishPreferences = store.register('preferences', 'Loading preferences…');
  t.mock.timers.tick(50);
  assert.equal(store.getSnapshot().visible, true);
  assert.equal(store.getSnapshot().label, 'Loading preferences…');
  finishPreferences();
  const finishAccounts = store.register('accounts', 'Loading accounts…');
  t.mock.timers.tick(0);
  assert.equal(store.getSnapshot().visible, true);
  assert.ok(states.every(({ pending }) => pending));
  assert.equal(starts, 1, 'Capture the initiating focus once across stage changes');
  finishAccounts();
  t.mock.timers.tick(0);
  assert.deepEqual(store.getSnapshot(), { pending: false, visible: false, label: '' });
});

test('parallel waits settle only after the final task, preserving stage priority', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createLoadingTasks();
  const finishAccounts = store.register('accounts', 'Loading accounts…', 80);
  const finishReport = store.register('report', 'Loading report…');
  t.mock.timers.tick(200);
  assert.equal(store.getSnapshot().label, 'Loading accounts…');
  finishAccounts();
  assert.equal(store.getSnapshot().label, 'Loading report…');
  t.mock.timers.tick(1000);
  assert.equal(store.getSnapshot().visible, true);
  finishReport();
  t.mock.timers.tick(0);
  assert.equal(store.getSnapshot().pending, false);
});

test('effect cleanup and immediate remount retain one wait without leaked tasks', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createLoadingTasks();
  store.register('strict', 'Loading session…')();
  const finish = store.register('strict', 'Loading session…');
  t.mock.timers.tick(200);
  assert.equal(store.getSnapshot().visible, true);
  finish();
  t.mock.timers.tick(0);
  assert.equal(store.getSnapshot().pending, false);
});
