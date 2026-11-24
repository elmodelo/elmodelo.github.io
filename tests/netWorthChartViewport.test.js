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

test('scrolling any of three plots synchronizes all positions, avoids feedback and handles resize/cleanup', () => {
  const viewports = [];
  const observers = [];
  const coordinator = createChartScrollCoordinator((viewport) => viewports.push(viewport), 720, (resize) => {
    const observer = { resize, observe() {}, disconnect() { observer.disconnected = true; } };
    observers.push(observer);
    return observer;
  });
  const elements = Array.from({ length: 3 }, () => {
    const listeners = new Map();
    return { clientWidth: 300, scrollWidth: 720, scrollLeft: 0,
      addEventListener(event, listener) { listeners.set(event, listener); },
      removeEventListener(event) { listeners.delete(event); },
      scroll() { listeners.get('scroll')?.(); },
    };
  });
  const cleanup = elements.map(coordinator.register);
  assert.deepEqual(viewports.at(-1), { scrollLeft: 420, width: 300 });
  assert.deepEqual(elements.map(({ scrollLeft }) => scrollLeft), [420, 420, 420], 'all three plots initially show the latest month');
  for (let index = 0; index < elements.length; index++) {
    const left = 72 * (index + 1);
    elements[index].scrollLeft = left;
    elements[index].scroll();
    assert.deepEqual(elements.map(({ scrollLeft }) => scrollLeft), [left, left, left]);
    assert.deepEqual(viewports.at(-1), { scrollLeft: left, width: 300 });
    const count = viewports.length;
    elements.forEach((element) => element.scroll());
    assert.equal(viewports.length, count, 'programmatic scroll events do not create a feedback loop');
  }
  elements.forEach((element) => { element.clientWidth = 180; });
  observers[0].resize();
  assert.deepEqual(viewports.at(-1), { scrollLeft: 216, width: 180 });
  cleanup.forEach((remove) => remove());
  assert.ok(observers.every(({ disconnected }) => disconnected));
  const count = viewports.length;
  elements[0].scrollLeft = 0;
  elements[0].scroll();
  assert.equal(viewports.length, count);
});

test('initial end position uses month content width and waits for a measurable viewport', () => {
  let resize;
  const viewports = [];
  const coordinator = createChartScrollCoordinator((viewport) => viewports.push(viewport), 216, (callback) => {
    resize = callback;
    return { observe() {}, disconnect() {} };
  });
  const element = { clientWidth: 0, scrollWidth: 720, scrollLeft: 0, addEventListener() {}, removeEventListener() {} };
  const remove = coordinator.register(element);
  element.clientWidth = 144;
  resize();
  assert.equal(element.scrollLeft, 72, 'initial placeholder SVG width does not add blank months');
  assert.deepEqual(viewports.at(-1), { scrollLeft: 72, width: 144 });
  remove();

  const short = createChartScrollCoordinator(() => {}, 72, () => ({ observe() {}, disconnect() {} }));
  const fitting = { ...element, clientWidth: 300, scrollLeft: 0 };
  short.register(fitting)();
  assert.equal(fitting.scrollLeft, 0, 'a range that fits needs no scrolling');
});
