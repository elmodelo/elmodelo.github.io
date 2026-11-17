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
      assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"><\/div>$/);
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
