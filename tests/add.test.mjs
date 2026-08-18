import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/math.mjs';

test('add(2, 3) は 5 を返す', () => {
  assert.equal(add(2, 3), 5);
});

test('add(-1.5, 0.5) は -1 を返す', () => {
  assert.equal(add(-1.5, 0.5), -1);
});

test('add(0, 0) は 0 を返す', () => {
  assert.equal(add(0, 0), 0);
});

test('add(-4, -6) は -10 を返す', () => {
  assert.equal(add(-4, -6), -10);
});

test('交換法則が成り立つ: add(a, b) === add(b, a)', () => {
  assert.equal(add(3, 7), add(7, 3));
});

test('0 は単位元である: add(a, 0) === a, add(0, a) === a', () => {
  assert.equal(add(5, 0), 5);
  assert.equal(add(0, 5), 5);
});

test('引数を変更しない（純関数）', () => {
  const a = 2;
  const b = 3;
  add(a, b);
  assert.equal(a, 2);
  assert.equal(b, 3);
});
