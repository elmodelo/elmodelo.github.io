import test from 'node:test';
import assert from 'node:assert/strict';
import { getCategorizeBackdrop } from '../src/lib/categorizeBackdrop.js';

const viewport = { width: 1000, height: 800 };
const clip = { left: 100, right: 900, top: 150, bottom: 700 };
function svgFor(rows) {
  const background = getCategorizeBackdrop(viewport, rows, clip);
  return decodeURIComponent(background.slice('url("data:image/svg+xml,'.length, -2));
}

test('leaves holes over each targeted row while dimming the rest of the viewport', () => {
  const svg = svgFor([
    { left: 100, right: 900, top: 200, bottom: 240 },
    { left: 100, right: 900, top: 400, bottom: 440 },
  ]);
  assert.match(svg, /fill-opacity=".25" fill-rule="evenodd"/);
  assert.match(svg, /d="M0 0H1000V800H0ZM100 200H900V240H100ZM100 400H900V440H100Z"/);
});

test('clips highlights to the scroll area below the sticky header and omits hidden rows', () => {
  const svg = svgFor([
    { left: -50, right: 1200, top: 120, bottom: 180 },
    { left: 100, right: 900, top: 680, bottom: 740 },
    { left: 100, right: 900, top: 50, bottom: 90 },
    { left: 100, right: 900, top: 750, bottom: 790 },
  ]);
  assert.match(svg, /d="M0 0H1000V800H0ZM100 150H900V180H100ZM100 680H900V700H100Z"/);
});

test('without target rows the complete viewport remains dimmed', () => {
  assert.match(svgFor([]), /d="M0 0H1000V800H0Z"/);
});
