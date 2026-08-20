import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BYPASS_LABEL,
  evaluateCoupling,
  headPaths,
  isActiveProgressPath,
  isImplementationPath,
  isWorkName,
  parseNameStatus,
  pathsFromChanges,
  progressWorks,
  resolveCoupling,
} from '../tools/check-progress-coupling.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** その場で内容が変わった差分（M）に揃えるテスト用ヘルパ */
const modified = (...paths) => paths.map((p) => ({ status: 'M', path: p }));

// --- 仕様の「例」 ---

test('例1: src/math.mjs と task/0026-a/progress.md を変更した PR は通過', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.deepEqual(result.works, ['0026-a']);
});

test('例2: src/math.mjs のみ変更した PR は失敗', () => {
  const result = evaluateCoupling({ changes: modified('src/math.mjs'), labels: [] });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('例3: progress 更新が 2 件の PR は失敗（1 PR = 1 作業）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md', 'task/0027-b/progress.md'),
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'multiple');
  assert.deepEqual(result.works, ['0026-a', '0027-b']);
});

test('例4: task/0026-a/spec.md のみ変更した docs だけの PR は通過', () => {
  const result = evaluateCoupling({ changes: modified('task/0026-a/spec.md'), labels: [] });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
});

test('例5: tools/x.mjs のみ変更し no-progress-needed ラベルが付いた PR は通過', () => {
  const result = evaluateCoupling({ changes: modified('tools/x.mjs'), labels: [BYPASS_LABEL] });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'bypass-label');
});

test('例6: archive の progress は progress 更新として数えない', () => {
  assert.equal(isActiveProgressPath('task/archive/0001-math-add/progress.md'), false);
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/archive/0001-math-add/progress.md'),
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

// --- 抜け道（候補側に progress が残らない差分） ---

test('progress.md の削除は progress 更新として数えない', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'D', path: 'task/0026-a/progress.md' },
    ],
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(result.works, []);
});

test('progress.md を archive へ移すリネームは progress 更新として数えない', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      {
        status: 'R',
        path: 'task/archive/0026-a/progress.md',
        oldPath: 'task/0026-a/progress.md',
      },
    ],
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(result.works, []);
});

test('進行中の作業どうしの移動は移動先の 1 作業だけを数える', () => {
  const changes = [
    { status: 'R', path: 'task/0027-b/progress.md', oldPath: 'task/0026-a/progress.md' },
  ];
  assert.deepEqual(progressWorks(changes), ['0027-b']);
});

test('作業の形をしていないディレクトリの progress.md は数えない', () => {
  assert.equal(isActiveProgressPath('task/not-a-work/progress.md'), false);
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/not-a-work/progress.md'),
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('slug の文字種は絞らない（正当な作業を誤って弾かない）', () => {
  assert.equal(isWorkName('0026-api_v2'), true);
  assert.equal(isWorkName('0026-日本語 slug'), true);
  assert.equal(isWorkName('0026'), false);
  assert.equal(isWorkName('026-a'), false);
  assert.equal(isWorkName(' 0026-a'), false);
  assert.equal(isActiveProgressPath('task/0026-api_v2/progress.md'), true);
});

test('headPaths は削除と移動元を落とす', () => {
  const changes = [
    { status: 'M', path: 'src/a.mjs' },
    { status: 'D', path: 'src/b.mjs' },
    { status: 'R', path: 'src/d.mjs', oldPath: 'src/c.mjs' },
  ];
  assert.deepEqual(headPaths(changes), ['src/a.mjs', 'src/d.mjs']);
});

// --- 対象パスの判定 ---

test('src/・tests/・tools/ は実装変更として数える', () => {
  assert.equal(isImplementationPath('src/calc.css'), true);
  assert.equal(isImplementationPath('tests/add.test.mjs'), true);
  assert.equal(isImplementationPath('tools/archive.mjs'), true);
});

test('task/・backlog/・CLAUDE.md・ワークフローは実装変更として数えない', () => {
  assert.equal(isImplementationPath('task/0026-a/spec.md'), false);
  assert.equal(isImplementationPath('backlog/0030-x/spec.md'), false);
  assert.equal(isImplementationPath('CLAUDE.md'), false);
  assert.equal(isImplementationPath('.github/workflows/guard.yml'), false);
});

test('実装ファイルを外へ移すリネームも実装変更として数える', () => {
  const result = evaluateCoupling({
    changes: [{ status: 'R', path: 'docs/old.mjs', oldPath: 'src/old.mjs' }],
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('progress として数えるのは task/<id>-<slug>/progress.md だけ', () => {
  assert.equal(isActiveProgressPath('task/0026-a/progress.md'), true);
  assert.equal(isActiveProgressPath('task/0026-a/spec.md'), false);
  assert.equal(isActiveProgressPath('task/progress.md'), false);
  assert.equal(isActiveProgressPath('task/0026-a/notes/progress.md'), false);
  // 旧 progress/ レイアウトは対象外
  assert.equal(isActiveProgressPath('progress/calc-page.md'), false);
});

test('同じ作業の progress を 2 度数えない', () => {
  const works = progressWorks(modified('task/0026-a/progress.md', 'task/0026-a/progress.md'));
  assert.deepEqual(works, ['0026-a']);
});

test('ワークフローだけの PR は docs 扱いで通過する', () => {
  const result = evaluateCoupling({ changes: modified('.github/workflows/guard.yml'), labels: [] });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
});

test('ラベルが読めない（null）ときは通過させない', () => {
  const result = evaluateCoupling({ changes: modified('src/math.mjs'), labels: null });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

// --- 差分の読み取り ---

test('name-status は status を保持し、リネームは移動元も持つ', () => {
  const changes = parseNameStatus('R100\0src/old.mjs\0src/new.mjs\0');
  assert.deepEqual(changes, [{ status: 'R', path: 'src/new.mjs', oldPath: 'src/old.mjs' }]);
  assert.deepEqual(pathsFromChanges(changes), ['src/new.mjs', 'src/old.mjs']);
});

test('name-status の削除は status D として読む', () => {
  assert.deepEqual(parseNameStatus('D\0task/0026-a/progress.md\0'), [
    { status: 'D', path: 'task/0026-a/progress.md' },
  ]);
});

test('name-status が途中で切れていたら例外にする（差分なしと読まない）', () => {
  assert.throws(() => parseNameStatus('M\0'), /途中で切れています/);
});

test('差分から判定する（progress が付いていれば通過）', () => {
  const raw = 'M\0src/math.mjs\0M\0task/0026-a/progress.md\0';
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: () => raw,
  });
  assert.equal(result.ok, true);
  assert.equal(result.error, null);
});

test('差分から判定する（progress を消しただけなら失敗）', () => {
  const raw = 'M\0src/math.mjs\0D\0task/0026-a/progress.md\0';
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: () => raw,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('差分が取れないときは fail-closed（チェック失敗）', () => {
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: () => {
      throw new Error('shallow clone');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'diff');
});

test('差分が壊れていても fail-closed', () => {
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: () => 'M\0',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'diff');
});

test('base ref が無いときは usage エラー', () => {
  const result = resolveCoupling({ baseRef: undefined, labels: [], execGit: () => '' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'usage');
});

test('CLI に base ref が無いと終了コード非 0 で使い方を出す', () => {
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'tools/check-progress-coupling.mjs')],
    { encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /使い方:/);
});

test('CLI は base との差分が取れないと終了コード非 0 で終わる', (t) => {
  // git リポジトリでない一時ディレクトリで走らせる。存在しない ref 名を渡すと
  // 環境によっては解決の待ちが入って遅い。ローカルで即座に失敗する形にする。
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'coupling-cli-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, 'tools/check-progress-coupling.mjs'), 'origin/main'],
    { encoding: 'utf8', cwd },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /差分を取得できませんでした/);
});
