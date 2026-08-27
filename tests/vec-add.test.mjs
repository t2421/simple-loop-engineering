import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addVec } from '../src/math.mjs';

test('addVec([2, 3], [4, 5]) は [6, 8] を返す', () => {
  assert.deepEqual(addVec([2, 3], [4, 5]), [6, 8]);
});

test('addVec([-1.5, 0.5], [0.5, -0.5]) は [-1, 0] を返す', () => {
  assert.deepEqual(addVec([-1.5, 0.5], [0.5, -0.5]), [-1, 0]);
});

test('addVec([0, 0], [0, 0]) は [0, 0] を返す', () => {
  assert.deepEqual(addVec([0, 0], [0, 0]), [0, 0]);
});

test('addVec([-4, -6], [1, 2]) は [-3, -4] を返す', () => {
  assert.deepEqual(addVec([-4, -6], [1, 2]), [-3, -4]);
});

test('addVec([1, 2], [3]) は TypeError を投げる', () => {
  assert.throws(() => addVec([1, 2], [3]), TypeError);
});

test('addVec([1, 2, 3], [4, 5, 6]) は TypeError を投げる', () => {
  assert.throws(() => addVec([1, 2, 3], [4, 5, 6]), TypeError);
});

test('長さ 2 の配列でない入力は TypeError を投げる', () => {
  assert.throws(() => addVec({ 0: 1, 1: 2 }, [3, 4]), TypeError);
  assert.throws(() => addVec([1, 2], null), TypeError);
  assert.throws(() => addVec([1], [2, 3]), TypeError);
});

test('交換法則が成り立つ: addVec(a, b) と addVec(b, a) は要素ごとに等しい', () => {
  assert.deepEqual(addVec([2, 3], [4, 5]), addVec([4, 5], [2, 3]));
});

test('ゼロベクトル [0, 0] は単位元である', () => {
  assert.deepEqual(addVec([2, 3], [0, 0]), [2, 3]);
  assert.deepEqual(addVec([0, 0], [2, 3]), [2, 3]);
});

test('引数を変更しない（純関数）', () => {
  const a = [2, 3];
  const b = [4, 5];
  addVec(a, b);
  assert.deepEqual(a, [2, 3]);
  assert.deepEqual(b, [4, 5]);
});

test('戻り値は入力とは別の新しい配列である', () => {
  const a = [2, 3];
  const b = [4, 5];
  const result = addVec(a, b);
  assert.notEqual(result, a);
  assert.notEqual(result, b);
});
