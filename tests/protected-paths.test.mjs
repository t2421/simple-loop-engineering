import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNameStatus,
  findViolations,
  hasAllowLabel,
} from '../tools/check-protected-paths.mjs';

/** 差分もラベルも無い、素の入力 */
const empty = { changes: [], baseScripts: {}, headScripts: {} };

test('parseNameStatus: 追加・変更・削除を読む', () => {
  const out = parseNameStatus('A\tsrc/new.mjs\nM\tsrc/math.mjs\nD\tsrc/old.mjs\n');
  assert.deepEqual(out, [
    { status: 'A', path: 'src/new.mjs' },
    { status: 'M', path: 'src/math.mjs' },
    { status: 'D', path: 'src/old.mjs' },
  ]);
});

test('parseNameStatus: 内容同一の移動は similarity 100 として読む', () => {
  const out = parseNameStatus('R100\tspecs/x.md\tspecs/archive/x.md\n');
  assert.deepEqual(out, [
    { status: 'R', path: 'specs/archive/x.md', oldPath: 'specs/x.md', similarity: 100 },
  ]);
});

test('parseNameStatus: 内容が変わった移動は similarity < 100 として読む', () => {
  const out = parseNameStatus('R087\ttests/a.test.mjs\ttests/b.test.mjs\n');
  assert.deepEqual(out, [
    { status: 'R', path: 'tests/b.test.mjs', oldPath: 'tests/a.test.mjs', similarity: 87 },
  ]);
});

test('既存 tests/ の期待値を変更した差分は違反になる', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'tests/add.test.mjs' }] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'tests/add.test.mjs');
});

test('package.json の scripts を変更した差分は違反になる', () => {
  const v = findViolations({
    changes: [{ status: 'M', path: 'package.json' }],
    baseScripts: { test: 'node --test', ci: 'npm test' },
    headScripts: { test: 'node --test', ci: 'echo ok' },
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'package.json');
});

test('package.json の scripts 以外だけの変更は違反にならない', () => {
  const v = findViolations({
    changes: [{ status: 'M', path: 'package.json' }],
    baseScripts: { test: 'node --test' },
    headScripts: { test: 'node --test' },
  });
  assert.deepEqual(v, []);
});

test('specs/TEMPLATE.md を変更した差分は違反になる', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'specs/TEMPLATE.md' }] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'specs/TEMPLATE.md');
});

test('progress/TEMPLATE.md を変更した差分は違反になる', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'progress/TEMPLATE.md' }] });
  assert.equal(v.length, 1);
});

test('TEMPLATE.md の移動は内容同一でも違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'specs/archive/TEMPLATE.md', oldPath: 'specs/TEMPLATE.md', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1);
});

test('新規 specs/ と 新規 tests/ の追加だけなら違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'specs/foo.md' },
      { status: 'A', path: 'tests/foo.test.mjs' },
    ],
  });
  assert.deepEqual(v, []);
});

test('specs/ を内容同一のまま archive/ へ移動した差分は違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'specs/archive/x.md', oldPath: 'specs/x.md', similarity: 100 },
    ],
  });
  assert.deepEqual(v, []);
});

test('specs/ の移動でも内容が変わっていれば違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'specs/archive/x.md', oldPath: 'specs/x.md', similarity: 87 },
    ],
  });
  assert.equal(v.length, 1);
});

test('specs/ の既存ファイルの内容変更・削除は違反になる', () => {
  const changed = findViolations({ ...empty, changes: [{ status: 'M', path: 'specs/ci-lint.md' }] });
  assert.equal(changed.length, 1);
  const deleted = findViolations({ ...empty, changes: [{ status: 'D', path: 'specs/ci-lint.md' }] });
  assert.equal(deleted.length, 1);
});

test('src/ のみの変更は違反にならない', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'src/math.mjs' }] });
  assert.deepEqual(v, []);
});

test('progress/ の更新は違反にならない', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'progress/ci-lint.md' }] });
  assert.deepEqual(v, []);
});

test('.github/workflows/ の既存ワークフローの変更・削除は違反になる', () => {
  const changed = findViolations({
    ...empty,
    changes: [{ status: 'M', path: '.github/workflows/ci.yml' }],
  });
  assert.equal(changed.length, 1);
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: '.github/workflows/ci.yml' }],
  });
  assert.equal(deleted.length, 1);
});

test('.github/workflows/ への新規追加は違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'A', path: '.github/workflows/guard.yml' }],
  });
  assert.deepEqual(v, []);
});

test('複数の違反をすべて報告する', () => {
  const v = findViolations({
    changes: [
      { status: 'M', path: 'tests/add.test.mjs' },
      { status: 'M', path: 'specs/TEMPLATE.md' },
      { status: 'M', path: 'package.json' },
      { status: 'A', path: 'src/new.mjs' },
    ],
    baseScripts: { ci: 'npm test' },
    headScripts: { ci: 'true' },
  });
  assert.equal(v.length, 3);
});

test('hasAllowLabel: allow-protected-change があれば true', () => {
  assert.equal(hasAllowLabel(['bug', 'allow-protected-change']), true);
});

test('hasAllowLabel: 無ければ false', () => {
  assert.equal(hasAllowLabel(['bug']), false);
});

test('hasAllowLabel: ラベル情報が取得できないときは安全側に倒して false', () => {
  assert.equal(hasAllowLabel(null), false);
  assert.equal(hasAllowLabel(undefined), false);
});
