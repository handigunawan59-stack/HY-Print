import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePageRange } from '../src/page-range.js';

test('parses individual pages and inclusive ranges', () => {
  assert.deepEqual(parsePageRange('1-3, 5, 8-10', 12), [1, 2, 3, 5, 8, 9, 10]);
});

test('sorts pages and removes repeated or overlapping entries', () => {
  assert.deepEqual(parsePageRange('7, 2-4, 3, 1-2', 8), [1, 2, 3, 4, 7]);
});

test('allows spaces around commas and dashes', () => {
  assert.deepEqual(parsePageRange(' 1 - 2 , 4 ', 4), [1, 2, 4]);
});

test('rejects empty or malformed input', () => {
  for (const input of ['', ' ', '1,,3', ',1', '1,', '1-', '-2', '1-2-3', '1.5', '1a', '1 2']) {
    assert.throws(() => parsePageRange(input, 10), Error, `input ${JSON.stringify(input)}`);
  }
});

test('rejects zero, descending ranges, and numbers beyond page count', () => {
  for (const input of ['0', '0-2', '3-2', '11', '9-11', '1-999999999999999999999999999']) {
    assert.throws(() => parsePageRange(input, 10), Error, `input ${input}`);
  }
});

test('rejects invalid page counts', () => {
  for (const n of [0, -1, 1.5, NaN, Infinity, 1e15]) {
    assert.throws(() => parsePageRange('1', n), Error, `count ${n}`);
  }
});

test('accepts copied page ranges with en dashes', () => {
  assert.deepEqual(parsePageRange('1–3, 5', 5), [1, 2, 3, 5]);
});
