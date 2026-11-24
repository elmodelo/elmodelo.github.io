import assert from 'node:assert/strict';
import test from 'node:test';
import { MONTH_WIDTH, visibleMonthRange, visibleChartDomain, createChartScrollCoordinator } from '../src/lib/netWorthChartViewport.js';

test('visible month slots include partial months and exclude offscreen outliers', () => {
  assert.equal(MONTH_WIDTH, 72);
  assert.deepEqual(visibleMonthRange(24, 72, 144), { first: 1, end: 3 });
  assert.deepEqual(visibleMonthRange(24, 73, 144), { first: 1, end: 4 });
  assert.deepEqual(visibleMonthRange(2, 0, 500), { first: 0, end: 2 });
  const rows = [1000000, 100, 200, 3000000].map((value) => ({ assets: value, liabilities: -value / 2, growth: value / 1000, average: null }));
  const viewport = { scrollLeft: 72, width: 144 };
  assert.deepEqual(visibleChartDomain(rows, ['assets', 'liabilities'], viewport), { min: -124, max: 224 });
  assert.deepEqual(visibleChartDomain(rows, ['growth', 'average'], viewport, true), { min: 0, max: 0.21600000000000003 });
  assert.ok(visibleChartDomain(rows, ['assets'], { scrollLeft: 0, width: 144 }).max > 1000000);
  const empty = visibleChartDomain([{ assets: null }], ['assets'], { scrollLeft: 0, width: 72 });
  assert.ok(Number.isFinite(empty.min) && empty.max > empty.min);
});


function harness(contentWidth = 720, initialWidth = 300) {
  const viewports = [], observers = [], callbacks = new Map();
  let nextFrame = 0, canceled = 0, layoutReads = 0;
  const frames = {
    request(callback) { callbacks.set(++nextFrame, callback); return nextFrame; },
    cancel(id) { canceled++; callbacks.delete(id); },
  };
  const coordinator = createChartScrollCoordinator((viewport) => viewports.push(viewport), contentWidth, (resize) => {
    const observer = { resize, observe() {}, disconnect() { observer.disconnected = true; } };
    observers.push(observer); return observer;
  }, frames);
  const elements = Array.from({ length: 3 }, () => {
    const listeners = new Map(); let left = 0;
    return { width: initialWidth, writes: 0,
      get clientWidth() { layoutReads++; return this.width; },
      get scrollLeft() { return left; },
      set scrollLeft(value) { this.writes++; left = value; },
      addEventListener(event, listener) { listeners.set(event, listener); },
      removeEventListener(event) { listeners.delete(event); },
      scroll() { listeners.get('scroll')?.(); },
      native(value) { left = value; this.scroll(); },
    };
  });
  const cleanup = elements.map(coordinator.register);
  return { viewports, observers, elements, cleanup,
    positions: () => elements.map(({ scrollLeft }) => scrollLeft),
    pending: () => callbacks.size,
    layoutReads: () => layoutReads,
    canceled: () => canceled,
    flush() { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach((callback) => callback()); },
  };
}

test('scroll bursts synchronize once per frame without rewriting the native source or measuring layout', () => {
  const h = harness();
  assert.deepEqual(h.positions(), [420, 420, 420], 'all three plots initially show the latest month');
  const reads = h.layoutReads();
  for (let index = 0; index < h.elements.length; index++) {
    h.elements.forEach((element) => { element.writes = 0; });
    const left = 72 * (index + 1);
    h.elements[index].native(left);
    h.elements[index].native(left + 2);
    assert.equal(h.pending(), 1);
    h.flush();
    assert.deepEqual(h.positions(), [left + 2, left + 2, left + 2]);
    assert.equal(h.elements[index].writes, 0, 'source retains control of momentum scrolling');
    assert.ok(h.elements.filter((_, i) => i !== index).every(({ writes }) => writes === 1));
    const count = h.viewports.length;
    h.elements.forEach((element) => element.scroll());
    assert.equal(h.pending(), 0, 'programmatic follower events do not create more frames');
    assert.equal(h.viewports.length, count);
  }
  assert.equal(h.layoutReads(), reads, 'scroll handling does not read clientWidth');
  h.cleanup.forEach((remove) => remove());
});

test('a delayed follower event cannot pull an ongoing gesture back to an older position', () => {
  const h = harness();
  h.elements[0].native(73); h.flush();
  h.elements[0].native(76);
  h.elements[1].scroll(); // Previous frame's programmatic follower event.
  h.flush();
  assert.deepEqual(h.positions(), [76, 76, 76]);
  h.elements[2].native(133.5); h.flush();
  assert.deepEqual(h.positions(), [133.5, 133.5, 133.5], 'gestures can originate on any chart');
  h.cleanup.forEach((remove) => remove());
});

test('React updates only when visible months or viewport width change', () => {
  const h = harness();
  h.elements[0].native(73); h.flush();
  const count = h.viewports.length;
  for (let left = 74; left < 90; left++) { h.elements[0].native(left); h.flush(); }
  assert.equal(h.viewports.length, count, 'pixel movement within the same month slots needs no rerender');
  assert.deepEqual(h.positions(), [89, 89, 89], 'native scroll positions still track every frame');
  h.elements[0].native(133); h.flush();
  assert.equal(h.viewports.length, count + 1, 'a newly visible month updates y-axis ranges');
  h.elements.forEach((element) => { element.width = 180; });
  h.observers[0].resize();
  assert.deepEqual(h.viewports.at(-1), { scrollLeft: 133, width: 180 });
  h.elements[0].native(200);
  assert.equal(h.pending(), 1);
  h.cleanup.forEach((remove) => remove());
  assert.equal(h.pending(), 0);
  assert.equal(h.canceled(), 1);
  assert.ok(h.observers.every(({ disconnected }) => disconnected));
  h.observers[0].resize();
  assert.equal(h.pending(), 0);
});

test('initial end position waits for measurement and avoids blank months in a short range', () => {
  const h = harness(216, 0);
  h.elements.forEach((element) => { element.width = 144; });
  h.observers[0].resize();
  assert.deepEqual(h.positions(), [72, 72, 72]);
  assert.deepEqual(h.viewports.at(-1), { scrollLeft: 72, width: 144 });
  h.cleanup.forEach((remove) => remove());
  const short = harness(72, 300);
  assert.deepEqual(short.positions(), [0, 0, 0]);
  short.cleanup.forEach((remove) => remove());
});
