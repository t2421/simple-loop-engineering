import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sub } from '../src/math.mjs';

test('sub(5, 3) は 2 を返す', () => {
  assert.equal(sub(5, 3), 2);
});

test('sub(-1.5, 0.5) は -2 を返す', () => {
  assert.equal(sub(-1.5, 0.5), -2);
});

test('sub(0, 0) は 0 を返す', () => {
  assert.equal(sub(0, 0), 0);
});

test('sub(-4, -6) は 2 を返す', () => {
  assert.equal(sub(-4, -6), 2);
});

test('0 は右単位元である: sub(a, 0) === a', () => {
  assert.equal(sub(7, 0), 7);
});

test('同じ数同士の差は 0 である: sub(a, a) === 0', () => {
  assert.equal(sub(9, 9), 0);
});

test('交換法則は成り立たない: sub(a, b) !== sub(b, a)（a !== b の場合）', () => {
  assert.notEqual(sub(5, 3), sub(3, 5));
});

test('引数を変更しない（純関数）', () => {
  const a = 5;
  const b = 3;
  sub(a, b);
  assert.equal(a, 5);
  assert.equal(b, 3);
});
