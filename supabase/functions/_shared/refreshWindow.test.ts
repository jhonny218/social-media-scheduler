import assert from 'node:assert/strict';
import { clampWithinDays, DEFAULT_WITHIN_DAYS, MAX_WITHIN_DAYS } from './refreshWindow.ts';

Deno.test('a caller cannot widen the refresh window past the cap', () => {
  assert.equal(clampWithinDays(100000), MAX_WITHIN_DAYS);
  assert.equal(clampWithinDays(Infinity), DEFAULT_WITHIN_DAYS);
  assert.equal(clampWithinDays(31), 30);
});

Deno.test('odd values fall back or are bounded', () => {
  assert.equal(clampWithinDays('20'), DEFAULT_WITHIN_DAYS);
  assert.equal(clampWithinDays(NaN), DEFAULT_WITHIN_DAYS);
  assert.equal(clampWithinDays(null), DEFAULT_WITHIN_DAYS);
  assert.equal(clampWithinDays(0), 1);
  assert.equal(clampWithinDays(-5), 1);
  assert.equal(clampWithinDays(7.9), 7);
  assert.equal(clampWithinDays(20), 20);
});
