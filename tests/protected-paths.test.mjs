import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNameStatus,
  findViolations,
  hasAllowLabel,
} from '../tools/check-protected-paths.mjs';
// ループの固有値はマニフェストが唯一の宣言である。テストも**実物のマニフェスト**を使う。
// テスト用の別表を持つと、宣言を変えてもテストが緑のままになる。
import { repoManifest, parseManifest } from '../tools/loop-manifest.mjs';
import { useManifest, validateManifestShape, scriptsChanged } from '../tools/check-protected-paths.mjs';
useManifest(repoManifest());


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
    baseScripts: { 'package.json': { test: 'node --test', ci: 'npm test' } },
    headScripts: { 'package.json': { test: 'node --test', ci: 'echo ok' } },
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'package.json');
});

test('package.json の scripts 以外だけの変更は違反にならない', () => {
  const v = findViolations({
    changes: [{ status: 'M', path: 'package.json' }],
    baseScripts: { 'package.json': { test: 'node --test' } },
    headScripts: { 'package.json': { test: 'node --test' } },
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
    baseScripts: { 'package.json': { ci: 'npm test' } },
    headScripts: { 'package.json': { ci: 'true' } },
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

// --- task/ レイアウトへの追随（0017-guard-task-paths） ---

test('task/ 配下の既存 spec.md の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'task/archive/0012-ci-lint/spec.md' }],
  });
  assert.equal(v.length, 1, '移行後は完了条件がここにある');
});

test('task/ 配下の spec.md 以外の関連ファイルも保護する', () => {
  const figma = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'task/archive/0003-calc-page/calc-page.figma.json' }],
  });
  assert.equal(figma.length, 1, '抽出物は見た目の完了条件の正であり、期待値そのもの');

  // 実際の攻撃は「新規追加（A）」である。M で試すと既存ファイルの変更として
  // 検知されてしまい、穴が塞がったように見える
  const aliasAdded = findViolations({
    ...empty,
    changes: [{ status: 'A', path: 'task/0017-foo/spec-v2.md' }],
  });
  assert.equal(aliasAdded.length, 1, '別名 spec の追加で Target Spec を付け替える迂回を塞ぐ');

  const aliasChanged = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'task/0017-foo/spec-v2.md' }],
  });
  assert.equal(aliasChanged.length, 1);
});

test('作業ディレクトリの spec.md / progress.md の新規追加は通る', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'task/0019-bar/spec.md' },
      { status: 'A', path: 'task/0019-bar/progress.md' },
      { status: 'A', path: 'task/0019-bar/bar.figma.json' },
    ],
  });
  assert.deepEqual(v, [], '新規作業と抽出物の追加は正当');
});

test('旧 specs/ のフラット命名は別名 spec 扱いしない', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'A', path: 'specs/foo.md' }] });
  assert.deepEqual(v, []);
});

test('跡地への外部からのリネームイン（すり替え）は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/archive/0017-foo/spec.md', oldPath: 'task/0017-foo/spec.md', similarity: 100 },
      { status: 'R', path: 'task/0017-foo/spec.md', oldPath: 'backlog/0099-x/spec.md', similarity: 90 },
    ],
  });
  assert.equal(v.length, 1);
});

test('archiveMove が false のディレクトリの違反メッセージは archive/ を案内しない', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'tests/archive/a.test.mjs', oldPath: 'tests/a.test.mjs', similarity: 100 }],
  });
  assert.equal(v.length, 1);
  assert.doesNotMatch(v[0].reason, /archive\/ への移動以外/, '存在しない逃げ道を案内しない');
});

test('exclude は作業ディレクトリ直下の progress.md だけを外す', () => {
  const top = findViolations({ ...empty, changes: [{ status: 'M', path: 'task/progress.md' }] });
  assert.equal(top.length, 1, 'task/ 直下は作業ディレクトリではない');

  const nested = findViolations({ ...empty, changes: [{ status: 'M', path: 'task/0017-foo/sub/progress.md' }] });
  assert.equal(nested.length, 1, '深い階層の progress.md は除外対象ではない');

  const proper = findViolations({ ...empty, changes: [{ status: 'M', path: 'task/0017-foo/progress.md' }] });
  assert.deepEqual(proper, []);

  const archived = findViolations({ ...empty, changes: [{ status: 'M', path: 'task/archive/0012-x/progress.md' }] });
  assert.deepEqual(archived, [], 'アーカイブ済みの進捗も除外');
});

test('task/ 配下の progress.md は保護しない', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'task/0017-foo/progress.md' }],
  });
  assert.deepEqual(v, [], '進捗は工程ごとに更新する。保護すると全作業 PR がラベルを要する');
});

test('spec.md が同一なら、progress.md を書き換えたアーカイブ移動は通る', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/archive/0019-bar/spec.md', oldPath: 'task/0019-bar/spec.md', similarity: 100 },
      { status: 'R', path: 'task/archive/0019-bar/progress.md', oldPath: 'task/0019-bar/progress.md', similarity: 88 },
    ],
  });
  assert.deepEqual(v, []);
});

test('task/ の型は変更も移動も削除も許さない', () => {
  for (const p of ['task/TEMPLATE-spec.md', 'task/TEMPLATE-progress.md']) {
    assert.equal(findViolations({ ...empty, changes: [{ status: 'M', path: p }] }).length, 1, p);
    assert.equal(findViolations({ ...empty, changes: [{ status: 'D', path: p }] }).length, 1, p);
  }
});

test('新規 task/ の spec.md 追加は違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'task/0019-bar/spec.md' },
      { status: 'A', path: 'task/0019-bar/progress.md' },
    ],
  });
  assert.deepEqual(v, []);
});

test('task/ 内の内容同一のアーカイブ移動は通る', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/archive/0019-bar/spec.md', oldPath: 'task/0019-bar/spec.md', similarity: 100 },
    ],
  });
  assert.deepEqual(v, []);
});

test('task/ の外へ spec.md を出す移動は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'docs/bar.md', oldPath: 'task/0019-bar/spec.md', similarity: 100 },
    ],
  });
  assert.equal(v.length, 1);
});

test('backlog/ は保護しない（完了条件が未確定の候補置き場）', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'backlog/0013-cloudflare-preview/spec.md' }],
  });
  assert.deepEqual(v, []);
});

test('task/ 配下の既存 spec.md の削除は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'task/archive/0012-ci-lint/spec.md' }],
  });
  assert.equal(v.length, 1);
});

test('アーカイブ移動以外のリネームは、保護ディレクトリ内でも違反になる', () => {
  const unarchive = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'task/0012-x/spec.md', oldPath: 'task/archive/0012-x/spec.md', similarity: 100 }],
  });
  assert.equal(unarchive.length, 1, 'archive/ から出せば凍結を解けてしまう');

  const reassign = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'task/0012-b/spec.md', oldPath: 'task/0012-a/spec.md', similarity: 100 }],
  });
  assert.equal(reassign.length, 1, '別作業へ付け替えられてしまう');
});

test('旧 specs/ のアーカイブ移動は引き続き通る', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'specs/archive/x.md', oldPath: 'specs/x.md', similarity: 100 }],
  });
  assert.deepEqual(v, []);
});

test('移動させた跡地への新規追加（すり替え）は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/archive/0012-x/spec.md', oldPath: 'task/0012-x/spec.md', similarity: 100 },
      { status: 'A', path: 'task/0012-x/spec.md' },
    ],
  });
  assert.equal(v.length, 1, '移動と新規追加の合わせ技で中身をすり替えられる');
});

test('アーカイブ移動と、無関係な新規追加の同居は通る', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/archive/0012-x/spec.md', oldPath: 'task/0012-x/spec.md', similarity: 100 },
      { status: 'A', path: 'task/0020-new/spec.md' },
    ],
  });
  assert.deepEqual(v, []);
});

test('すでに archive/ にあるものをさらに archive/ へ移すのは違反になる', () => {
  for (const [oldPath, path] of [
    ['task/archive/0012-x/spec.md', 'task/archive/archive/0012-x/spec.md'],
    ['specs/archive/x.md', 'specs/archive/archive/x.md'],
  ]) {
    const v = findViolations({ ...empty, changes: [{ status: 'R', path, oldPath, similarity: 100 }] });
    assert.equal(v.length, 1, `${oldPath} -> ${path}`);
  }
});

test('別名 spec を外から移し込む（R）のも違反になる', () => {
  const fromBacklog = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'task/0017-foo/spec-lenient.md', oldPath: 'backlog/0013-x/spec.md', similarity: 85 }],
  });
  assert.equal(fromBacklog.length, 1, '追加(A)だけ塞いでも移し込み(R)が残る');

  const fromSrc = findViolations({
    ...empty,
    changes: [{ status: 'R', path: 'task/0017-foo/spec-v2.md', oldPath: 'src/notes.md', similarity: 90 }],
  });
  assert.equal(fromSrc.length, 1);
});

test('backlog からの正規の昇格（spec.md のまま）は通る', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: 'task/0013-x/spec.md', oldPath: 'backlog/0013-x/spec.md', similarity: 75 },
      { status: 'A', path: 'task/0013-x/progress.md' },
    ],
  });
  assert.deepEqual(v, [], '昇格は spec.md のままなので別名 spec に当たらない');
});

test('作業ディレクトリの下の階層にある関連文書は別名 spec 扱いしない', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'task/0017-foo/notes/README.md' },
      { status: 'A', path: 'task/archive/0012-x/notes/memo.md' },
    ],
  });
  assert.deepEqual(v, [], '判定は作業ディレクトリ直下だけ');
});

test('アーカイブ済みの ID の再利用は違反になる（PR をまたぐすり替え）', () => {
  const baseArchivedIds = new Set(['0012']);
  const sameSlug = findViolations({
    ...empty,
    baseArchivedIds,
    changes: [{ status: 'A', path: 'task/0012-x/spec.md' }],
  });
  assert.equal(sameSlug.length, 1, 'PR1 でアーカイブ、PR2 で跡地に緩めた spec を置く 2 手を防ぐ');

  // 照合は ID で行う。名前で照合すると slug を変えるだけで迂回できる
  const otherSlug = findViolations({
    ...empty,
    baseArchivedIds,
    changes: [{ status: 'A', path: 'task/0012-other/spec.md' }],
  });
  assert.equal(otherSlug.length, 1, '同じ ID・別 slug も弾く');
});

test('アーカイブが無い新規作業の追加は通る', () => {
  const v = findViolations({
    ...empty,
    baseArchivedIds: new Set(['0001', '0002']),
    changes: [
      { status: 'A', path: 'task/0019-bar/spec.md' },
      { status: 'A', path: 'task/0019-bar/progress.md' },
    ],
  });
  assert.deepEqual(v, []);
});

test('ID 再利用の判定は specFile を持つディレクトリにだけ効く', () => {
  const v = findViolations({
    ...empty,
    baseArchivedIds: new Set(['0001']),
    changes: [{ status: 'A', path: 'tests/new.test.mjs' }],
  });
  assert.deepEqual(v, [], 'tests/ は作業ディレクトリではない');
});

// --- 持ち込みのチャネル行列 ---
//
// 保護パスに内容が入ってくる経路は A（新規追加）・R（保護外からの移し込み）・
// C（コピー）の 3 つある。過去に「A にだけ規則を書いて R に書き忘れる」抜けを
// 3 度作ったため、持ち込みに対する規則は必ず全チャネルで検証する。
// 新しい持ち込み規則を足すときは、この表に行を足すこと。

const INBOUND_CHANNELS = {
  A: (path) => ({ status: 'A', path }),
  R: (path) => ({ status: 'R', path, oldPath: 'docs/outside.md', similarity: 90 }),
  C: (path) => ({ status: 'C', path, oldPath: 'docs/outside.md', similarity: 90 }),
};

const INBOUND_CASES = [
  {
    name: '別名 spec の持ち込みは違反',
    path: 'task/0017-foo/spec-v2.md',
    ctx: {},
    want: 1,
  },
  {
    name: 'アーカイブ済み ID（同 slug）への持ち込みは違反',
    path: 'task/0012-x/spec.md',
    ctx: { baseArchivedIds: new Set(['0012']) },
    want: 1,
  },
  {
    name: 'アーカイブ済み ID（別 slug）への持ち込みは違反',
    path: 'task/0012-other/spec.md',
    ctx: { baseArchivedIds: new Set(['0012']) },
    want: 1,
  },
  {
    name: '立ち退かせた跡地への持ち込みは違反（同一差分のすり替え）',
    path: 'task/0017-foo/spec.md',
    ctx: {},
    extra: [
      { status: 'R', path: 'task/archive/0017-foo/spec.md', oldPath: 'task/0017-foo/spec.md', similarity: 100 },
    ],
    want: 1, // アーカイブ移動側は免除（0）、跡地への持ち込みが 1
  },
  {
    name: '新規作業の spec.md の持ち込みは通る',
    path: 'task/0019-bar/spec.md',
    ctx: {},
    want: 0,
  },
  {
    name: '作業ディレクトリ下層の関連文書の持ち込みは通る',
    path: 'task/0017-foo/notes/README.md',
    ctx: {},
    want: 0,
  },
];

for (const c of INBOUND_CASES) {
  for (const [channel, make] of Object.entries(INBOUND_CHANNELS)) {
    test(`持ち込み行列 [${channel}] ${c.name}`, () => {
      const changes = [...(c.extra ?? []), make(c.path)];
      const v = findViolations({ ...empty, ...c.ctx, changes });
      assert.equal(v.length, c.want, JSON.stringify(v));
    });
  }
}

// --- マニフェスト（固有値の宣言）自身の保護 ---
// これを守らないと、「ガードを編集する」代わりに「宣言を編集する」で同じ回避ができる。

test('マニフェストの内容変更は違反になる', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: 'loop.manifest.json' }] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop.manifest.json');
  assert.match(v[0].reason, /マニフェスト/);
});

test('マニフェストの削除・リネームも違反になる', () => {
  const deleted = findViolations({ ...empty, changes: [{ status: 'D', path: 'loop.manifest.json' }] });
  assert.equal(deleted.length, 1);
  const renamed = findViolations({
    ...empty,
    changes: [{ status: 'R', similarity: 100, path: 'other.json', oldPath: 'loop.manifest.json' }],
  });
  assert.equal(renamed.length, 1);
});

test('マニフェストの新規追加は違反にならない（導入 PR）', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'A', path: 'loop.manifest.json' }] });
  assert.deepEqual(v, []);
});

// --- 台帳の文書は許可リストで判定する（0044 の実測にもとづく） ---

test('台帳の許可リストにある文書の新規追加は違反にならない', () => {
  for (const name of ['spec.md', 'progress.md']) {
    const v = findViolations({ ...empty, changes: [{ status: 'A', path: `task/0099-x/${name}` }] });
    assert.deepEqual(v, [], name);
  }
});

test('台帳の許可リストに無い直下の .md は別名 spec として違反になる', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'A', path: 'task/0099-x/notes.md' }] });
  assert.equal(v.length, 1);
});

test('作業ディレクトリ直下でなければ別名 spec 判定に掛からない', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'A', path: 'task/0099-x/notes/port-log.md' }] });
  assert.deepEqual(v, []);
});

// --- 検証コマンドの定義は「消す」のが最も強い書き換えである ---
// 「読めないから比較しない」で通すと、定義ファイルごと消して検証を外せる。

test('検証定義のファイルを削除した差分は違反になる（fail-closed）', () => {
  const v = findViolations({
    changes: [{ status: 'D', path: 'package.json' }],
    baseScripts: { 'package.json': { ci: 'npm test' } },
    headScripts: {},
  });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /検証コマンドの定義が失われている/);
});

test('検証定義のファイルを改名した差分も違反になる', () => {
  const v = findViolations({
    changes: [{ status: 'R', similarity: 100, path: 'foo.json', oldPath: 'package.json' }],
    baseScripts: { 'package.json': { ci: 'npm test' } },
    headScripts: {},
  });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /検証コマンドの定義が失われている/);
});

test('base に定義が無いなら判定しない（定義を導入する PR）', () => {
  const v = findViolations({
    changes: [{ status: 'A', path: 'package.json' }],
    baseScripts: {},
    headScripts: { 'package.json': { ci: 'npm test' } },
  });
  assert.deepEqual(v, []);
});

// --- 骨抜きの宣言は、判定に使う前に拒む ---

test('骨抜きのマニフェストは validateManifestShape が拒む', () => {
  const manifest = JSON.parse(JSON.stringify(repoManifest()));
  manifest.protected.gateHelpers = [];
  manifest.protected.templates = [];
  manifest.protected.appendOnlyDirs = [];
  const reasons = validateManifestShape(manifest);
  assert.ok(reasons.length > 0, '空の保護一覧が通ってしまう');
  assert.ok(reasons.some((r) => r.includes('appendOnlyDirs')));
});

test('実物のマニフェストは validateManifestShape を通る', () => {
  assert.deepEqual(validateManifestShape(repoManifest()), []);
});

test('protected.self が自分自身でなければ拒む', () => {
  const manifest = JSON.parse(JSON.stringify(repoManifest()));
  manifest.protected.self = 'elsewhere.json';
  assert.ok(validateManifestShape(manifest).some((r) => r.includes('自分自身')));
});

// --- 呼び出しの所在も守る ---

test('verify.invokedIn のファイルの変更は違反になる', () => {
  for (const p of repoManifest().verify.invokedIn) {
    const v = findViolations({ ...empty, changes: [{ status: 'M', path: p }] });
    assert.equal(v.length, 1, p);
  }
});

// --- 2 つの検査実装の厳しさが一致していること ---
// ガード側（validateManifestShape）は import を持てないので検査が重複する。
// **緩いほうが実際にガードを回す側、という逆転を作らない。** 機械で固定する。

const BROKEN_MANIFESTS = [
  ['protected.gateHelpers = []', (m) => { m.protected.gateHelpers = []; }],
  ['protected.templates = []', (m) => { m.protected.templates = []; }],
  ['protected.appendOnlyDirs = []', (m) => { m.protected.appendOnlyDirs = []; }],
  ['protected.appendOnlyDirs = [{}]', (m) => { m.protected.appendOnlyDirs = [{}]; }],
  ['protected.checker = 42', (m) => { m.protected.checker = 42; }],
  ['protected.allowLabel = 1', (m) => { m.protected.allowLabel = 1; }],
  ['protected.self が別のパス', (m) => { m.protected.self = 'elsewhere.json'; }],
  ['ledger.dir = 5', (m) => { m.ledger.dir = 5; }],
  ['ledger.docs に specFile が無い', (m) => { m.ledger.docs = ['progress.md']; }],
  ['complexityModels = "x"', (m) => { m.complexityModels = 'x'; }],
  ['verify.definedIn = []', (m) => { m.verify.definedIn = []; }],
  ['verify.invokedIn = "x"', (m) => { m.verify.invokedIn = 'x'; }],
  ['workId.pattern = 1', (m) => { m.workId.pattern = 1; }],
  ['install = "npm ci"', (m) => { m.install = 'npm ci'; }],
  ['conditionalStages[0].triggers = [42]', (m) => { m.conditionalStages[0].triggers = [42]; }],
  ['conditionalStages[0].triggers = []', (m) => { m.conditionalStages[0].triggers = []; }],
  ['conditionalStages[0].command = 42', (m) => { m.conditionalStages[0].command = 42; }],
  ['conditionalStages[0].checker = 1', (m) => { m.conditionalStages[0].checker = 1; }],
  // 真偽値のフラグを既定値へ倒さない（"true" は `=== true` で false に落ちる）
  ['appendOnlyDirs[0].ledger = "true"', (m) => { m.protected.appendOnlyDirs[0].ledger = 'true'; }],
  ['appendOnlyDirs[0].ledger = 1', (m) => { m.protected.appendOnlyDirs[0].ledger = 1; }],
  ['appendOnlyDirs[0].ledger = null', (m) => { m.protected.appendOnlyDirs[0].ledger = null; }],
  ['appendOnlyDirs[0].archiveMove = "true"', (m) => { m.protected.appendOnlyDirs[0].archiveMove = 'true'; }],
  // 実装の宣言の要素型と、空の宣言
  ['implementation.dirs = [42]', (m) => { m.implementation.dirs = [42]; }],
  ['implementation.dirs = ["src/", 7]', (m) => { m.implementation.dirs = ['src/', 7]; }],
  ['implementation.dirs = [] かつ files = []', (m) => { m.implementation.dirs = []; m.implementation.files = []; }],
  ['implementation.files = [42]', (m) => { m.implementation.files = [42]; }],
  // **欠落も型不正と同じく拒む。** 空配列で補うと、呼び出し元が無保護になる
  ['verify.invokedIn 欠落', (m) => { delete m.verify.invokedIn; }],
  ['verify.invokedIn = []', (m) => { m.verify.invokedIn = []; }],
];

for (const [name, mutate] of BROKEN_MANIFESTS) {
  test(`2 実装とも拒む — ${name}`, () => {
    const broken = JSON.parse(JSON.stringify(repoManifest()));
    mutate(broken);
    assert.ok(
      validateManifestShape(broken).length > 0,
      `ガード側（validateManifestShape）が ${name} を通してしまう`,
    );
    assert.equal(
      parseManifest(JSON.stringify(broken)).ok,
      false,
      `宣言の読み取り側（parseManifest）が ${name} を通してしまう`,
    );
  });
}

// --- 宣言したキーが対象 JSON に無ければ、既定値で補わない ---

test('verify.definedIn の jsonKey が実在しなければ、宣言の読み取りが失敗する', () => {
  // `readVerifyDefinitions` は非 export（単体実行されるファイルなので入口を増やさない）。
  // ここでは「補われた結果」が違反を隠さないことを、判定側から固定する
  const v = findViolations({
    changes: [{ status: 'M', path: 'package.json' }],
    baseScripts: { 'package.json': { ci: 'npm run ci' } },
    headScripts: { 'package.json': { ci: 'true' } },
  });
  assert.equal(v.length, 1);
  assert.match(v[0].reason, /検証コマンドの定義が変わっている/);
});

// --- 検証定義の比較は「選ばれた値そのもの」を深く見る ---
// 1 段の `!==` 比較では、スカラーで常に false（凍結が空洞化）、
// 入れ子オブジェクトで常に true（常に落ちる）へ倒れる。

test('scriptsChanged: スカラーの変更を検知する', () => {
  assert.equal(scriptsChanged(1, 2), true);
  assert.equal(scriptsChanged('x', 'y'), true);
  assert.equal(scriptsChanged(1, 1), false);
});

test('scriptsChanged: 入れ子オブジェクトは中身で比べる（参照比較にしない）', () => {
  assert.equal(scriptsChanged({ a: { b: 1 } }, { a: { b: 1 } }), false);
  assert.equal(scriptsChanged({ a: { b: 1 } }, { a: { b: 2 } }), true);
});

test('scriptsChanged: キーの順番は結果を変えない', () => {
  assert.equal(scriptsChanged({ a: 1, b: 2 }, { b: 2, a: 1 }), false);
});

test('scriptsChanged: 平坦な文字列マップは従来どおり判定する', () => {
  assert.equal(scriptsChanged({ ci: 'npm test' }, { ci: 'npm test' }), false);
  assert.equal(scriptsChanged({ ci: 'npm test' }, { ci: 'true' }), true);
  assert.equal(scriptsChanged({ ci: 'x' }, { ci: 'x', extra: 'y' }), true);
});
