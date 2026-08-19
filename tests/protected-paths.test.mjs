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
  const out = parseNameStatus('A\0src/new.mjs\0M\0src/math.mjs\0D\0src/old.mjs\0');
  assert.deepEqual(out, [
    { status: 'A', path: 'src/new.mjs' },
    { status: 'M', path: 'src/math.mjs' },
    { status: 'D', path: 'src/old.mjs' },
  ]);
});

test('parseNameStatus: 内容同一の移動は similarity 100 として読む', () => {
  const out = parseNameStatus('R100\0specs/x.md\0specs/archive/x.md\0');
  assert.deepEqual(out, [
    { status: 'R', path: 'specs/archive/x.md', oldPath: 'specs/x.md', similarity: 100 },
  ]);
});

test('parseNameStatus: 内容が変わった移動は similarity < 100 として読む', () => {
  const out = parseNameStatus('R087\0tests/a.test.mjs\0tests/b.test.mjs\0');
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

test('parseNameStatus: -z なのでタブや非 ASCII を含むパスも壊れない', () => {
  const out = parseNameStatus('M\0tests/名前に\tタブ.test.mjs\0');
  assert.deepEqual(out, [{ status: 'M', path: 'tests/名前に\tタブ.test.mjs' }]);
});

test('C クォートされたパスも元に戻して判定する', () => {
  const out = parseNameStatus('M\0"tests/\\343\\201\\202.test.mjs"\0');
  assert.equal(out[0].path, 'tests/あ.test.mjs');
  const v = findViolations({ ...empty, changes: out });
  assert.equal(v.length, 1, 'クォートを解かないと tests/ 判定を外れて素通りする');
});

test('既存テストを tests/ の外へリネームすると違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'docs/add.test.mjs', oldPath: 'tests/add.test.mjs', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1, 'tests/ の外へ出せばテストを消せてしまう');
});

test('既存ワークフローをリネームで退避すると違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'ci.yml.disabled',
        oldPath: '.github/workflows/ci.yml',
        similarity: 100,
      },
    ],
  });
  assert.equal(v.length, 1, 'リネームで退避すれば CI 検証そのものを無効化できてしまう');
});

test('tests/ 内での内容同一のリネームも違反になる（アーカイブ免除は specs/ だけ）', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'tests/b.test.mjs', oldPath: 'tests/a.test.mjs', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1);
});

test('specs/ の外へ出す移動は内容同一でも違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'docs/math-add.md', oldPath: 'specs/math-add.md', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1);
});

test('保護ディレクトリの外から中への移動は新規追加と同じく違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'tests/moved.test.mjs', oldPath: 'draft/moved.test.mjs', similarity: 100 },
    ],
  });
  assert.deepEqual(v, []);
});

test('コピー（C100）でも保護ディレクトリの外へ出せば違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'C', path: 'docs/ci.yml', oldPath: '.github/workflows/ci.yml', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1);
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

test('途中で切れた差分出力を「変更なし」と読まず、例外にする', () => {
  assert.throws(() => parseNameStatus('M\0'), /途中で切れ/);
  assert.throws(() => parseNameStatus('R100\0specs/x.md\0'), /途中で切れ/);
});

test('空の差分出力は空配列になる', () => {
  assert.deepEqual(parseNameStatus(''), []);
});

test('末尾が単独のバックスラッシュでも unquotePath が壊れない', () => {
  const out = parseNameStatus('M\0"tests/a\\\\"\0');
  assert.equal(typeof out[0].path, 'string');
});

test('ガードの判定ロジック自体の変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/check-protected-paths.mjs' }],
  });
  assert.equal(v.length, 1, 'base 由来で実行される以上、このファイルが信頼の根拠になる');
});

test('ガードの判定ロジックの削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'tools/check-protected-paths.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'tools/x.mjs', oldPath: 'tools/check-protected-paths.mjs', similarity: 100 },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('tools/ の他のファイルは保護対象ではない', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'tools/archive.mjs' }] });
  assert.deepEqual(v, []);
});

test('ガードの判定ロジックの新規追加は違反にならない（導入 PR）', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'A', path: 'tools/check-protected-paths.mjs' }],
  });
  assert.deepEqual(v, []);
});

test('別ファイルをチェッカーのパスへ上書きリネームするのも違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/check-protected-paths.mjs',
        oldPath: 'tools/x.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(v.length, 1, '外から差し替える経路も塞ぐ');
});
