import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('generic status supports workflow messages, tones, optional actions, and an empty idle region', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { default: StatusMessage } = await server.ssrLoadModule('/src/components/StatusMessage.tsx');
    const render = (props) => renderToStaticMarkup(createElement(StatusMessage, props));
    for (const message of [undefined, null, '']) {
      const markup = render({ message, action: { label: 'Retry upload', onClick() {} } });
      assert.match(markup, /><\/div>$/);
      assert.ok(!markup.includes('<button'));
    }
    const progress = render({ message: 'Uploading file…' });
    assert.ok(progress.includes('Uploading file…'));
    assert.match(progress, /status-message-info/);
    assert.ok(!progress.includes('<button'));
    const success = render({ message: 'Upload complete', tone: 'success' });
    assert.match(success, /status-message-success/);
    assert.match(success, /aria-hidden="true">✓ /);
    const failure = render({ message: 'Upload failed', tone: 'error', action: { label: 'Retry upload', onClick() {}, disabled: true } });
    assert.match(failure, /status-message-error/);
    assert.match(failure, /type="button" disabled="">Retry upload<\/button>/);
  } finally { await server.close(); }
});


test('status strip orders newest first, expires entries independently, and removes panel status', async (t) => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { createStatusMessages } = await server.ssrLoadModule('/src/lib/statusMessages.ts');
    const { StatusMessagesProvider } = await server.ssrLoadModule('/src/hooks/useStatusMessages.tsx');
    const { default: StatusBar } = await server.ssrLoadModule('/src/components/StatusBar.tsx');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const store = createStatusMessages();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => { notifications++; });
    const leavePanel = store.publish({ message: '125 transactions' });
    store.publish({ message: 'Preferences saved', tone: 'success', durationSeconds: 4 });
    store.publish({ message: 'Upload finished', durationSeconds: 2 });
    assert.deepEqual(store.getSnapshot().map((entry) => entry.message), ['Upload finished', 'Preferences saved', '125 transactions']);
    const markup = renderToStaticMarkup(createElement(StatusMessagesProvider, { store }, createElement(StatusBar)));
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.ok(markup.indexOf('Upload finished') < markup.indexOf('Preferences saved'));
    assert.ok(markup.indexOf('Preferences saved') < markup.indexOf('125 transactions'));
    t.mock.timers.tick(2000);
    assert.deepEqual(store.getSnapshot().map((entry) => entry.message), ['Preferences saved', '125 transactions']);
    t.mock.timers.tick(2000);
    assert.deepEqual(store.getSnapshot().map((entry) => entry.message), ['125 transactions']);
    leavePanel();
    assert.deepEqual(store.getSnapshot(), []);
    const snapshot = store.getSnapshot();
    leavePanel();
    assert.equal(store.getSnapshot(), snapshot);
    assert.equal(notifications, 6);
    store.publish({ message: 'Pending notification', durationSeconds: 10 });
    store.clear();
    const cleared = store.getSnapshot();
    t.mock.timers.tick(10000);
    assert.equal(store.getSnapshot(), cleared);
    assert.deepEqual(cleared, []);
    unsubscribe();
    t.mock.timers.reset();
  } finally { await server.close(); }
});
