import { test } from 'node:test';
import assert from 'node:assert/strict';
import { div } from '../src/math.mjs';

test('div(6, 3) は 2 を返す', () => {
  assert.equal(div(6, 3), 2);
});

test('div(-6, 1.5) は -4 を返す', () => {
  assert.equal(div(-6, 1.5), -4);
});

test('div(0, 5) は 0 を返す', () => {
  assert.equal(div(0, 5), 0);
});

test('div(-4, -8) は 0.5 を返す', () => {
  assert.equal(div(-4, -8), 0.5);
});

test('1 は右単位元である: div(a, 1) === a', () => {
  assert.equal(div(7, 1), 7);
});

test('同じ数同士の商は 1 である: div(b, b) === 1', () => {
  assert.equal(div(9, 9), 1);
  assert.equal(div(-2.5, -2.5), 1);
});

test('交換法則は成り立たない: div(a, b) !== div(b, a)（a !== b、いずれも 0 でない場合）', () => {
  assert.notEqual(div(6, 3), div(3, 6));
});

test('div(1, 0) は RangeError を投げる', () => {
  assert.throws(() => div(1, 0), RangeError);
});

test('div(0, 0) は RangeError を投げる', () => {
  assert.throws(() => div(0, 0), RangeError);
});

test('除数 0 のエラーは Infinity や NaN を返さない', () => {
  assert.throws(() => div(1, 0), (err) => err instanceof RangeError && /0/.test(err.message));
});

test('引数を変更しない（純関数）', () => {
  const a = 6;
  const b = 3;
  div(a, b);
  assert.equal(a, 6);
  assert.equal(b, 3);
});
