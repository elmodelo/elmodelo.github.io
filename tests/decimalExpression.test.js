import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAssetExpression } from '../src/lib/decimalExpression.js';
import { assetSnapshotInput, changedAssetSnapshotInput, newAssetInput } from '../src/lib/assets.js';

test('arithmetic supports the four operations, precedence, parentheses and signed intermediate values', () => {
  for (const [input, expected] of [
    ['110 + 23.32', '133.32'], ['110 - 23.32', '86.68'],
    ['12.5 * 4', '50'], ['133.32 / 4', '33.33'],
    ['2 + 3 * 4', '14'], ['(2 + 3) * 4', '20'],
    ['20 / 2 * 5', '50'], ['20 - 5 - 3', '12'],
    ['-2 + 3', '1'], ['2 * -3 + 10', '4'], ['2 - -3', '5'],
    ['(-2) * (-3)', '6'], [' + .5 + .25 ', '0.75'],
    ['110 - 110', '0'], ['1000 + 0', '1000'],
  ]) assert.equal(evaluateAssetExpression(input), expected, input);
});

test('arithmetic retains decimal precision and rounds recurring division to 20 places', () => {
  assert.equal(evaluateAssetExpression('0.1 + 0.2'), '0.3');
  assert.equal(evaluateAssetExpression('1.000000000000000001 + 0.000000000000000001'), '1.000000000000000002');
  assert.equal(evaluateAssetExpression('9007199254740993 + 1'), '9007199254740994');
  assert.equal(evaluateAssetExpression('0.000000000000000000001 / 2'), '0.0000000000000000000005');
  assert.equal(evaluateAssetExpression('1 / 3'), '0.33333333333333333333');
  assert.equal(evaluateAssetExpression('2 / 3'), '0.66666666666666666667');
  assert.equal(evaluateAssetExpression('1 / 3 * 3'), '1', 'Round only the final result');
  assert.equal(evaluateAssetExpression(' 123.123456789123456789 '), '123.123456789123456789');
});

test('invalid expressions cannot execute code, divide by zero or produce negative final holdings', () => {
  for (const input of ['', ' ', '1 / 0', '0 / 0', '3 / (2 - 2)', '1 - 2',
    '1 +', '* 2', '1 2', '(1 + 2', '1 + 2)', '2(3)', '2 ** 3', '2 // 3',
    'NaN', 'Infinity', '1e2', '0x10', '1,000', 'Math.max(1, 2)',
    'globalThis.value = 1', '1; alert(1)', '1 + "2"',
    '('.repeat(40) + '1' + ')'.repeat(40), '1'.repeat(4097)]) {
    assert.throws(() => evaluateAssetExpression(input), /invalid/, input);
  }
});

test('both creation and updates submit evaluated decimal strings and still skip equivalent holdings', () => {
  const date = '2026-11-22T00:00:00Z';
  assert.deepEqual(assetSnapshotInput('110 + 23.32', '20 * 2', date), {
    p_count: '133.32', p_value: '40', p_posted_at: '2026-11-22T00:00:00.000Z',
  });
  assert.equal(newAssetInput('Stock', 'USD', '10 / 4', '100 - 5', date).p_count, '2.5');
  const asset = { count: { amount: 2.5, rawAmount: '2.5' }, price: { amount: 40, rawAmount: '40' } };
  assert.equal(changedAssetSnapshotInput(asset, '10 / 4', '20 * 2', date), null);
  assert.deepEqual(changedAssetSnapshotInput(asset, '10 / 4', '20 * 3', date), {
    p_count: null, p_value: '60', p_posted_at: '2026-11-22T00:00:00.000Z',
  });
  assert.equal(assetSnapshotInput('', '110 + 23.32', date).p_count, null);
  assert.equal(changedAssetSnapshotInput(asset, '2.5 - 2.5', '', date).p_count, '0');
});
