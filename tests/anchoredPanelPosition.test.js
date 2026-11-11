import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnchoredPanelPosition } from '../src/lib/anchoredPanelPosition.js';

const viewport = { left: 0, top: 0, width: 1000, height: 800 };

test('places the panel immediately below a row when it fits', () => {
  const row = { right: 680, top: 100, bottom: 144 };
  const result = getAnchoredPanelPosition(row, { width: 480, height: 300 }, viewport);
  assert.equal(result.left + 480, row.right);
  assert.equal(result.top, row.bottom + 8);
  assert.ok(result.top + 300 <= viewport.height - 12);
});

test('flips above a row when the panel does not fit below', () => {
  const row = { right: 680, top: 600, bottom: 644 };
  const result = getAnchoredPanelPosition(row, { width: 480, height: 300 }, viewport);
  assert.equal(result.top, row.top - 8 - 300);
  assert.ok(result.top >= 12);
  assert.ok(result.top + 300 < row.top);
  assert.equal(result.left + 480, row.right);
});

test('constrains tall panels to the larger available side without covering the row', () => {
  const panel = { width: 480, height: 1000 };
  for (const row of [
    { right: 680, top: 200, bottom: 244 },
    { right: 680, top: 500, bottom: 544 },
  ]) {
    const result = getAnchoredPanelPosition(row, panel, viewport);
    assert.ok(result.top >= 12);
    assert.ok(result.top + result.maxHeight <= 788);
    assert.ok(result.top >= row.bottom + 8 || result.top + result.maxHeight <= row.top - 8);
  }
});

test('keeps the panel inside horizontal viewport edges, including a shifted mobile viewport', () => {
  const panel = { width: 280, height: 200 };
  const mobile = { left: 50, top: 100, width: 320, height: 600 };
  for (const right of [100, 700]) {
    const result = getAnchoredPanelPosition({ right, top: 200, bottom: 244 }, panel, mobile);
    assert.ok(result.left >= mobile.left + 12);
    assert.ok(result.left + panel.width <= mobile.left + mobile.width - 12);
    assert.ok(result.top >= mobile.top + 12);
    assert.ok(result.top + panel.height <= mobile.top + mobile.height - 12);
  }
});
