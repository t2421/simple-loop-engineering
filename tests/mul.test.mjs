import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mul } from '../src/math.mjs';

test('mul(2, 3) は 6 を返す', () => {
  assert.equal(mul(2, 3), 6);
});

test('mul(-1.5, 4) は -6 を返す', () => {
  assert.equal(mul(-1.5, 4), -6);
});

test('mul(0, 7) は 0 を返す', () => {
  assert.equal(mul(0, 7), 0);
});

test('mul(-4, -6) は 24 を返す', () => {
  assert.equal(mul(-4, -6), 24);
});

test('交換法則が成り立つ: mul(a, b) === mul(b, a)', () => {
  assert.equal(mul(3, 7), mul(7, 3));
  assert.equal(mul(-2.5, 4), mul(4, -2.5));
});

test('1 は単位元である: mul(a, 1) === a, mul(1, a) === a', () => {
  assert.equal(mul(7, 1), 7);
  assert.equal(mul(1, 7), 7);
});

test('0 は吸収元である: mul(a, 0) === 0, mul(0, a) === 0', () => {
  assert.equal(mul(7, 0), 0);
  assert.equal(mul(0, 7), 0);
});

test('引数を変更しない（純関数）', () => {
  const a = 2;
  const b = 3;
  mul(a, b);
  assert.equal(a, 2);
  assert.equal(b, 3);
});
