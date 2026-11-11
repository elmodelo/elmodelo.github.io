import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { getRolePermissions, getSessionAppRole } from '../src/lib/permissions.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('read access includes both roles while write access requires WRITER', () => {
  assert.deepEqual(getRolePermissions('READER'), {
    role: 'READER', isReader: true, isWriter: false, canRead: true, canWrite: false,
  });
  assert.deepEqual(getRolePermissions('WRITER'), {
    role: 'WRITER', isReader: false, isWriter: true, canRead: true, canWrite: true,
  });
  for (const role of [null, undefined, '', 'ADMIN', 'writer']) {
    assert.deepEqual(getRolePermissions(role), {
      role: null, isReader: false, isWriter: false, canRead: false, canWrite: false,
    });
  }
});

test('descendants read shared permissions; absent and nested providers default or override correctly', async () => {
  const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' });
  try {
    const { PermissionsProvider, usePermissions } = await server.ssrLoadModule('/src/hooks/usePermissions.tsx');
    function Consumer() {
      const permissions = usePermissions();
      return createElement('span', null, JSON.stringify(permissions));
    }
    function markup(role) {
      return renderToStaticMarkup(createElement('span', null, JSON.stringify(getRolePermissions(role))));
    }
    assert.equal(renderToStaticMarkup(createElement(Consumer)), markup(null));
    for (const role of ['READER', 'WRITER', null]) {
      assert.equal(renderToStaticMarkup(createElement(PermissionsProvider, { role }, createElement('div', null, createElement(Consumer)))), `<div>${markup(role)}</div>`);
    }
    assert.equal(renderToStaticMarkup(createElement(PermissionsProvider, { role: 'WRITER' },
      createElement(PermissionsProvider, { role: 'READER' }, createElement(Consumer)))), markup('READER'));
  } finally {
    await server.close();
  }
});

function sessionFor(claims) {
  return {
    access_token: `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`,
    user: { app_metadata: { app_role: 'WRITER' } },
  };
}

test('reads roles from access-token hook claims rather than the user object', () => {
  assert.equal(getSessionAppRole(sessionFor({ app_metadata: { app_role: 'WRITER' } })), 'WRITER');
  assert.equal(getSessionAppRole(sessionFor({ app_metadata: { app_role: 'READER' } })), 'READER');
  assert.equal(getSessionAppRole(sessionFor({})), null);
  assert.equal(getSessionAppRole(sessionFor({ user_metadata: { app_role: 'WRITER' } })), null);
});

test('missing, unknown, and malformed role claims never enable categorization', () => {
  for (const session of [null, {}, { access_token: 'invalid' }, { access_token: 'a.invalid.c' },
    sessionFor(null), sessionFor({ app_metadata: null }),
    sessionFor({ app_metadata: { app_role: 'ADMIN' } }),
  ]) assert.equal(getSessionAppRole(session), null);
});
