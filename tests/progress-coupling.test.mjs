import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BYPASS_LABEL,
  checkAttribution,
  classifyProgressChanges,
  evaluateCoupling,
  isActiveProgressPath,
  isImplementationPath,
  isWorkName,
  parseNameStatus,
  pathsFromChanges,
  progressWorks,
  readBranch,
  resolveCoupling,
  strayProgressPaths,
  unchangedProgressPaths,
} from '../tools/check-progress-coupling.mjs';
import { findViolations } from '../tools/check-protected-paths.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** その場で内容が変わった差分（M）に揃えるテスト用ヘルパ */
const modified = (...paths) => paths.map((p) => ({ status: 'M', path: p }));

/**
 * base に存在するパスを列挙するテスト用ヘルパ。
 * 実装 PR の時点で progress.md は計画用 docs PR 経由で base にある、という前提を表す。
 */
const baseWith = (...paths) => (p) => paths.includes(p);

/** base の中身を問わない検査で使う（存在する側に倒す） */
const anythingInBase = () => true;

/**
 * base と HEAD で中身（blob）が変わった、と答えるテスト用ヘルパ。
 *
 * 「差分に出ている＝中身が変わった」は成り立たない（モードだけの変更は blob 同一のまま
 * status `M` になる）。**中身が変わったかは注入で明示する。** 既定は fail-closed なので、
 * 渡さない検査は「変わっていない」側に倒れる。
 */
const anythingChanged = () => true;

// --- 仕様の「例」 ---

test('例1: src/math.mjs と task/0026-a/progress.md を変更した PR は通過', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.deepEqual(result.works, ['0026-a']);
});

test('例2: src/math.mjs のみ変更した PR は失敗', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('例3: progress 更新が 2 件の PR は失敗（1 PR = 1 作業）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md', 'task/0027-b/progress.md'),
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md', 'task/0027-b/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'multiple');
  assert.deepEqual(result.works, ['0026-a', '0027-b']);
});

test('例4: task/0026-a/spec.md のみ変更した docs だけの PR は通過', () => {
  const result = evaluateCoupling({
    changes: modified('task/0026-a/spec.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
});

test('例5: tools/x.mjs のみ変更し no-progress-needed ラベルが付いた PR は通過', () => {
  const result = evaluateCoupling({
    changes: modified('tools/x.mjs'),
    labels: [BYPASS_LABEL],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'bypass-label');
});

test('例6: archive の progress は progress 更新として数えない', () => {
  assert.equal(isActiveProgressPath('task/archive/0001-math-add/progress.md'), false);
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/archive/0001-math-add/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

// --- 抜け道（候補側に progress が残らない差分） ---

test('base に無い progress.md の新規追加（A）は数えない', () => {
  // 使い捨ての作業ディレクトリを 1 つ足すだけでゲートを通す抜け道
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'A', path: 'task/9999-disposable/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(result.works, []);
});

test('既存 progress.md を base に無い作業名へリネームしても数えない', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'R', path: 'task/9999-x/progress.md', oldPath: 'task/0026-a/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(result.works, []);
});

test('base に存在する progress.md のその場の更新（M）は通過する', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.deepEqual(result.works, ['0026-a']);
});

test('baseHas を渡し忘れたら通さない（既定は fail-closed）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(progressWorks(modified('task/0026-a/progress.md')), []);
});

test('progress.md の削除は progress 更新として数えない', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'D', path: 'task/0026-a/progress.md' },
    ],
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
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
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.deepEqual(result.works, []);
});

test('リネームは移動先が base にあっても数えない（数えるのは M だけ）', () => {
  const changes = [
    { status: 'R', path: 'task/0027-b/progress.md', oldPath: 'task/0026-a/progress.md' },
  ];
  // 移動先が base にある（＝別作業の progress を自作業の progress で上書きする）経路も、
  // 移動先が base に無い（使い捨ての作業名へ逃がす）経路も、どちらも数えない
  assert.deepEqual(progressWorks(changes, baseWith('task/0027-b/progress.md'), anythingChanged), []);
  assert.deepEqual(progressWorks(changes, baseWith('task/0026-a/progress.md'), anythingChanged), []);
  // 黙って捨てず、移動元・移動先の両方を拒否対象として拾う
  assert.deepEqual(strayProgressPaths(changes, baseWith('task/0027-b/progress.md')), [
    'task/0026-a/progress.md',
    'task/0027-b/progress.md',
  ]);
});

// --- モードだけの変更（差分に出るが blob は同一） ---

test('中身が変わっていない progress.md は数えない（モードだけの変更）', () => {
  // `git update-index --chmod=+x task/0026-a/progress.md` だけで status M になる経路
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: () => false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unchanged');
  assert.deepEqual(result.works, []);
  assert.deepEqual(result.unchanged, ['task/0026-a/progress.md']);
});

test('中身が変わっていない progress は黙って捨てず拒否する（同乗させても通らない）', () => {
  // 有効な更新 1 件に、別作業のモードだけの変更を相乗りさせる経路
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md', 'task/0027-b/progress.md'),
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md', 'task/0027-b/progress.md'),
    contentChanged: (p) => p === 'task/0026-a/progress.md',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unchanged');
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.unchanged, ['task/0027-b/progress.md']);
});

test('contentChanged を渡し忘れたら通さない（既定は fail-closed）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unchanged');
  assert.deepEqual(progressWorks(modified('task/0026-a/progress.md'), anythingInBase), []);
  assert.deepEqual(unchangedProgressPaths(modified('task/0026-a/progress.md'), anythingInBase), [
    'task/0026-a/progress.md',
  ]);
});

test('unchangedProgressPaths は base に無いもの・head に残らないものを拾わない', () => {
  const baseHas = baseWith('task/0026-a/progress.md');
  const never = () => false;
  // base に無い新規追加は stray の担当（ここでは拾わない）
  assert.deepEqual(
    unchangedProgressPaths([{ status: 'A', path: 'task/9999-x/progress.md' }], baseHas, never),
    [],
  );
  // 削除は head に残らない
  assert.deepEqual(
    unchangedProgressPaths([{ status: 'D', path: 'task/0026-a/progress.md' }], baseHas, never),
    [],
  );
  // archive の progress は対象外
  assert.deepEqual(
    unchangedProgressPaths(
      modified('task/archive/0001-math-add/progress.md'),
      anythingInBase,
      never,
    ),
    [],
  );
});

test('docs だけの PR とラベルはモードだけの変更を見ずに通る', () => {
  const docsOnly = evaluateCoupling({
    changes: modified('task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: () => false,
  });
  assert.equal(docsOnly.ok, true);
  assert.equal(docsOnly.reason, 'docs-only');

  const bypassed = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [BYPASS_LABEL],
    baseHas: anythingInBase,
    contentChanged: () => false,
  });
  assert.equal(bypassed.ok, true);
  assert.equal(bypassed.reason, 'bypass-label');
});

test('contentChanged を渡さないときは merge-base と HEAD の blob OID を比べる', () => {
  const calls = [];
  const execGit = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'diff') return 'M\0src/math.mjs\0M\0task/0026-a/progress.md\0';
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'rev-parse') {
      // モードだけの変更。base と head で blob が同じ
      return 'deadbeef\n';
    }
    if (args[0] === 'show') return '- **Branch:** `feature/a`\n';
    throw new Error(`想定外の git 呼び出し: ${args.join(' ')}`);
  };
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit,
    baseHas: anythingInBase,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unchanged');
  assert.ok(calls.includes('rev-parse abc123:task/0026-a/progress.md'));
  assert.ok(calls.includes('rev-parse HEAD:task/0026-a/progress.md'));
});

test('blob OID が読めないときは fail-closed（変わっていない側に倒す）', () => {
  const execGit = (args) => {
    if (args[0] === 'diff') return 'M\0src/math.mjs\0M\0task/0026-a/progress.md\0';
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'rev-parse') throw new Error('does not exist');
    if (args[0] === 'show') return '- **Branch:** `feature/a`\n';
    return '';
  };
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit,
    baseHas: anythingInBase,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unchanged');
});

// --- 同乗（有効な progress 更新 1 件に、別作業の progress を相乗りさせる） ---

test('P1-A: 有効な更新 1 件に、別作業の progress の新規追加を同乗させたら失敗', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
      { status: 'A', path: 'task/0028-c/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stray');
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.strays, ['task/0028-c/progress.md']);
});

test('P1-D: 有効な更新 1 件に、別作業の progress の削除を同乗させたら失敗', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
      { status: 'D', path: 'task/0027-b/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md', 'task/0027-b/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stray');
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.strays, ['task/0027-b/progress.md']);
});

test('P1-R: 有効な更新 1 件に、別作業の archive 移動を同乗させたら失敗', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
      {
        status: 'R',
        path: 'task/archive/0027-b/progress.md',
        oldPath: 'task/0027-b/progress.md',
      },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md', 'task/0027-b/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stray');
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.strays, ['task/0027-b/progress.md']);
});

test('数えない差分は黙って捨てず拒否する（strayProgressPaths）', () => {
  const baseHas = baseWith('task/0026-a/progress.md', 'task/0027-b/progress.md');
  // その場の更新だけなら stray は無い
  assert.deepEqual(strayProgressPaths(modified('task/0026-a/progress.md'), baseHas), []);
  // 新規追加・削除・作業外へのリネーム元・base に無いリネーム先はすべて拒否
  assert.deepEqual(
    strayProgressPaths(
      [
        { status: 'A', path: 'task/0028-c/progress.md' },
        { status: 'D', path: 'task/0027-b/progress.md' },
        { status: 'R', path: 'task/9999-x/progress.md', oldPath: 'task/0026-a/progress.md' },
      ],
      baseHas,
    ),
    [
      'task/0026-a/progress.md',
      'task/0027-b/progress.md',
      'task/0028-c/progress.md',
      'task/9999-x/progress.md',
    ],
  );
  // archive 側・作業の形でないパスは progress 更新ではないので stray にもしない
  assert.deepEqual(
    strayProgressPaths(
      [
        { status: 'A', path: 'task/archive/0001-math-add/progress.md' },
        { status: 'D', path: 'task/not-a-work/progress.md' },
        { status: 'A', path: 'task/0026-a/spec.md' },
      ],
      baseHas,
    ),
    [],
  );
});

test('docs だけの PR は progress を新規追加していても通過する（順序: docs-only が先）', () => {
  // 計画用ブランチの docs PR。新しい作業の spec + progress を足す
  const result = evaluateCoupling({
    changes: [
      { status: 'A', path: 'task/0028-c/spec.md' },
      { status: 'A', path: 'task/0028-c/progress.md' },
    ],
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
  // 拒否対象としては見えているが、docs だけの PR では判定に使わない
  assert.deepEqual(result.strays, ['task/0028-c/progress.md']);
});

test('docs だけの PR は archive 移動を含んでいても通過する', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'R', path: 'task/archive/0027-b/spec.md', oldPath: 'task/0027-b/spec.md' },
      {
        status: 'R',
        path: 'task/archive/0027-b/progress.md',
        oldPath: 'task/0027-b/progress.md',
      },
    ],
    labels: [],
    baseHas: baseWith('task/0027-b/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
});

test('no-progress-needed ラベルは stray があっても通す（人間の明示承認）', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'tools/x.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
      { status: 'A', path: 'task/0028-c/progress.md' },
    ],
    labels: [BYPASS_LABEL],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'bypass-label');
});

test('正当な実装 PR（実装 + base にある progress のその場更新）は通る', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'tests/add.test.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.deepEqual(result.strays, []);
});

test('作業の形をしていないディレクトリの progress.md は数えない', () => {
  assert.equal(isActiveProgressPath('task/not-a-work/progress.md'), false);
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/not-a-work/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
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

test('仕分けは進行中の progress に当たる差分を過不足なく 3 つに分ける', () => {
  // 隙間（黙って捨てられるもの）も重複も無いことを表明する。
  // `works` に入るのは `M` かつ base にあり blob が変わったものだけ。
  const changes = [
    { status: 'M', path: 'src/a.mjs' }, // 進捗ではない
    { status: 'M', path: 'task/0026-a/progress.md' }, // works
    { status: 'M', path: 'task/0027-b/progress.md' }, // unchanged（blob 同一）
    { status: 'T', path: 'task/0028-c/progress.md' }, // rejected（種別の変更）
    { status: 'A', path: 'task/0029-d/progress.md' }, // rejected
    { status: 'R', path: 'task/archive/0030-e/progress.md', oldPath: 'task/0030-e/progress.md' },
  ];
  const baseHas = baseWith(
    'task/0026-a/progress.md',
    'task/0027-b/progress.md',
    'task/0028-c/progress.md',
  );
  const result = classifyProgressChanges(
    changes,
    baseHas,
    (p) => p === 'task/0026-a/progress.md',
  );
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.unchanged, ['task/0027-b/progress.md']);
  assert.deepEqual(result.rejected, ['task/0028-c/progress.md', 'task/0029-d/progress.md', 'task/0030-e/progress.md']);

  // 進行中の progress に当たるパスは、必ずどれか 1 つに入る（隙間も重複も無い）
  const active = new Set();
  for (const c of changes) {
    if (isActiveProgressPath(c.path)) active.add(c.path);
    if (c.oldPath && isActiveProgressPath(c.oldPath)) active.add(c.oldPath);
  }
  const sorted = (xs) => [...xs].sort();
  const worksPaths = result.works.map((w) => `task/${w}/progress.md`);
  const classified = [...worksPaths, ...result.unchanged, ...result.rejected];
  assert.deepEqual(sorted(classified), sorted(active));
  assert.equal(new Set(classified).size, classified.length);
});

test('数えるのは status M だけ（ホワイトリスト。未知の status も数えない）', () => {
  // 7 回のレビューで毎回「別の status」が抜け道になった。列挙で塞ぐのをやめ、
  // `M` 以外はすべて数えない設計であることをここで固定する。
  const baseHas = anythingInBase;
  for (const status of ['A', 'D', 'T', 'R', 'C', 'X', 'U', 'B', '']) {
    const changes = [{ status, path: 'task/0026-a/progress.md', oldPath: undefined }];
    assert.deepEqual(
      progressWorks(changes, baseHas, anythingChanged),
      [],
      `status ${status} を数えてはならない`,
    );
    // 黙って捨てない。必ず拒否対象として現れる
    assert.deepEqual(
      strayProgressPaths(changes, baseHas),
      ['task/0026-a/progress.md'],
      `status ${status} は拒否対象に入らなければならない`,
    );
  }
  // `M` だけが数えられる
  assert.deepEqual(
    progressWorks([{ status: 'M', path: 'task/0026-a/progress.md' }], baseHas, anythingChanged),
    ['0026-a'],
  );
});

test('T（種別の変更＝symlink 置換）は実装 PR を通せない', () => {
  // 7 回目のレビューで実測された経路。progress.md を symlink に置き換えると、
  // 中身が消えて別作業へのポインタになるのに status は `D` ではなく `T` が出る。
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'T', path: 'task/0026-a/progress.md' },
    ],
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.works, []);
  assert.deepEqual(result.strays, ['task/0026-a/progress.md']);
});

test('T を有効な更新に同乗させても通せない', () => {
  const result = evaluateCoupling({
    changes: [
      { status: 'M', path: 'src/math.mjs' },
      { status: 'M', path: 'task/0026-a/progress.md' },
      { status: 'T', path: 'task/0027-b/progress.md' },
    ],
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'stray');
  assert.deepEqual(result.works, ['0026-a']);
  assert.deepEqual(result.strays, ['task/0027-b/progress.md']);
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
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
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
  const works = progressWorks(
    modified('task/0026-a/progress.md', 'task/0026-a/progress.md'),
    anythingInBase,
    anythingChanged,
  );
  assert.deepEqual(works, ['0026-a']);
});

test('ワークフローだけの PR は docs 扱いで通過する', () => {
  const result = evaluateCoupling({
    changes: modified('.github/workflows/guard.yml'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'docs-only');
});

test('ラベルが読めない（null）ときは通過させない', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs'),
    labels: null,
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
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

test('差分から判定する（base にある progress を更新していれば通過）', () => {
  const raw = 'M\0src/math.mjs\0M\0task/0026-a/progress.md\0';
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: () => raw,
    baseHas: baseWith('task/0026-a/progress.md'),
    contentChanged: anythingChanged,
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
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('baseHas を渡さないときは merge-base と cat-file で base の存在を問う', () => {
  const calls = [];
  // base の存在確認が実際に走る形（`M`）で問う。`A` は status だけで拒否されるので、
  // 配線の検証にならない（数えるのは `M` だけというホワイトリスト）。
  const raw = 'M\0src/math.mjs\0M\0task/9999-disposable/progress.md\0';
  const execGit = (args) => {
    calls.push(args);
    if (args[0] === 'diff') return raw;
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'cat-file') {
      // base にあるのは 0026-a だけ
      if (args[2] === 'abc123:task/0026-a/progress.md') return '';
      throw new Error('does not exist');
    }
    throw new Error(`想定外の git 呼び出し: ${args.join(' ')}`);
  };
  const result = resolveCoupling({ baseRef: 'origin/main', labels: [], execGit });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
  assert.ok(calls.some((c) => c[0] === 'merge-base'));
  assert.ok(calls.some((c) => c[0] === 'cat-file'));
});

test('merge-base が解決できないときは fail-closed', () => {
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    execGit: (args) =>
      args[0] === 'diff' ? 'M\0src/math.mjs\0M\0task/0026-a/progress.md\0' : '',
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'diff');
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

// --- CLI の配線（実際の git リポジトリで確かめる） ---

const CLI = path.join(rootDir, 'tools/check-progress-coupling.mjs');

/** 一時 git リポジトリで git を叩く */
const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};

/** テスト用の progress.md。**Branch** の行だけ本物の書式に揃える */
const progressText = (work, branch) =>
  `# Progress: \`${work}\`\n\n- **Branch:** \`${branch}\`\n- **Status:** \`In Progress\`\n`;

/**
 * base に `src/math.mjs` と `task/0026-a/progress.md` を持つリポジトリを作り、
 * `work` ブランチへ切り替えて返す。progress の **Branch** は既定で `work`。
 *
 * `baseProgress` で base 側の progress.md の中身を差し替えられる。帰属の照合は
 * **base 側**の **Branch** を読むので、「Branch の行が無い」ような性質は base 側に
 * 用意しないと確かめられない。
 */
function makeRepo(t, { baseProgress = progressText('0026-a', 'work') } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'coupling-repo-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'test');
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.mkdirSync(path.join(cwd, 'task/0026-a'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(cwd, 'task/0026-a/progress.md'), baseProgress);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  git(cwd, 'checkout', '-q', '-b', 'work');
  return cwd;
}

/**
 * CLI を走らせる。
 *
 * CI 由来の環境変数（`GITHUB_HEAD_REF`・`GITHUB_ACTIONS`）は**既定で落とす**。
 * 実行環境にたまたま入っていると判定が変わってしまうため、必要なテストだけが
 * `extra` で明示的に足す。
 */
const runCli = (cwd, extra = {}) => {
  const env = { ...process.env, PR_LABELS: '[]', ...extra };
  for (const key of ['GITHUB_HEAD_REF', 'GITHUB_ACTIONS']) {
    if (!(key in extra)) delete env[key];
  }
  return spawnSync(process.execPath, [CLI, 'main'], { cwd, encoding: 'utf8', env });
};

test('CLI: base にある progress を更新した実装 PR は通過する', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ちょうど 1 件/);
});

test('CLI: 使い捨ての progress.md を新規追加しても通せない', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.mkdirSync(path.join(cwd, 'task/9999-disposable'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'task/9999-disposable/progress.md'), '# x\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /更新が含まれていません/);
});

test('CLI: 既存 progress を使い捨ての作業名へリネームしても通せない', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.mkdirSync(path.join(cwd, 'task/9999-x'), { recursive: true });
  git(cwd, 'mv', 'task/0026-a/progress.md', 'task/9999-x/progress.md');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /更新が含まれていません/);
});

test('CLI/MODE: モードだけ変えた progress.md では通せない（blob は同一）', (t) => {
  // 6 回目のレビューで実測された経路。`git update-index --chmod=+x` は blob を変えずに
  // status M を作るので、進捗を 1 バイトも書かずにゲートを通せていた。
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  git(cwd, 'update-index', '--chmod=+x', 'task/0026-a/progress.md');
  git(cwd, 'add', 'src/math.mjs');
  git(cwd, 'commit', '-q', '-m', 'work');

  // 前提の確認: 差分には出るが blob は同一
  assert.match(git(cwd, 'diff', '--name-status', 'main...HEAD'), /M\ttask\/0026-a\/progress\.md/);
  assert.equal(
    git(cwd, 'rev-parse', 'main:task/0026-a/progress.md').trim(),
    git(cwd, 'rev-parse', 'HEAD:task/0026-a/progress.md').trim(),
  );

  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /中身が変わっていません/);
  assert.match(result.stderr, /task\/0026-a\/progress\.md/);
});

test('CLI/MODE: 中身も変えていればモードが変わっていても通る', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'update-index', '--chmod=+x', 'task/0026-a/progress.md');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ちょうど 1 件/);
});

test('CLI/T: progress.md を symlink に置き換えても通せない（種別の変更）', (t) => {
  // 7 回目のレビューで実測された経路。追跡下の progress.md を symlink に差し替えると、
  // 実体の中身は消えて別作業へのポインタになるのに、git の status は `D` ではなく `T`。
  // 数える status を `M` だけに絞る（ホワイトリスト）ことで塞ぐ。
  const cwd = makeRepo(t);
  fs.mkdirSync(path.join(cwd, 'task/0027-b'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'task/0027-b/notes.md'), '# notes\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'notes');
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.rmSync(path.join(cwd, 'task/0026-a/progress.md'));
  fs.symlinkSync('../0027-b/notes.md', path.join(cwd, 'task/0026-a/progress.md'));
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');

  // 前提の確認: git は `T`（種別の変更）を出し、HEAD の entry は symlink（120000）
  assert.match(git(cwd, 'diff', '--name-status', 'main...HEAD'), /T\ttask\/0026-a\/progress\.md/);
  assert.match(git(cwd, 'ls-tree', 'HEAD', 'task/0026-a/progress.md'), /^120000 blob /);

  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /task\/0026-a\/progress\.md/);
});

test('CLI/T: 有効な更新に別作業の symlink 置換を同乗させても通せない', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  fs.rmSync(path.join(cwd, 'task/0027-b/progress.md'));
  fs.symlinkSync('../0026-a/progress.md', path.join(cwd, 'task/0027-b/progress.md'));
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  assert.match(git(cwd, 'diff', '--name-status', 'main...HEAD'), /T\ttask\/0027-b\/progress\.md/);
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /その場の更新でない変更/);
  assert.match(result.stderr, /task\/0027-b\/progress\.md/);
});

/**
 * base に 2 つの作業（`0026-a`・`0027-b`）の progress.md を持つリポジトリを作り、
 * `work` ブランチへ切り替えて返す。同乗（stray）の経路を実 git で確かめるのに使う。
 */
function makeTwoWorkRepo(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'coupling-repo2-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q', '-b', 'main');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'user.name', 'test');
  fs.mkdirSync(path.join(cwd, 'src'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 1;\n');
  // 0026-a は `work` ブランチの作業、0027-b は別ブランチ（`other`）の作業。
  // 帰属（**Branch** と head ブランチの照合）を実 git で確かめるのに使う。
  for (const [work, branch] of [
    ['0026-a', 'work'],
    ['0027-b', 'other'],
  ]) {
    fs.mkdirSync(path.join(cwd, 'task', work), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'task', work, 'progress.md'), progressText(work, branch));
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'base');
  git(cwd, 'checkout', '-q', '-b', 'work');
  return cwd;
}

test('CLI/P1-A: 有効な更新に別作業の progress の新規追加を同乗させても通せない', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  fs.mkdirSync(path.join(cwd, 'task/0028-c'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'task/0028-c/progress.md'), '# 0028-c\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /その場の更新でない変更/);
  assert.match(result.stderr, /task\/0028-c\/progress\.md/);
});

test('CLI/P1-D: 有効な更新に別作業の progress の削除を同乗させても通せない', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'rm', '-q', 'task/0027-b/progress.md');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /その場の更新でない変更/);
  assert.match(result.stderr, /task\/0027-b\/progress\.md/);
});

test('CLI/P1-R: 有効な更新に別作業の archive 移動を同乗させても通せない', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  fs.mkdirSync(path.join(cwd, 'task/archive/0027-b'), { recursive: true });
  git(cwd, 'mv', 'task/0027-b/progress.md', 'task/archive/0027-b/progress.md');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /その場の更新でない変更/);
  assert.match(result.stderr, /task\/0027-b\/progress\.md/);
});

test('CLI: docs だけの PR は progress を新規追加していても通過する', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.mkdirSync(path.join(cwd, 'task/0028-c'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'task/0028-c/spec.md'), '# 0028-c\n');
  fs.writeFileSync(path.join(cwd, 'task/0028-c/progress.md'), '# 0028-c\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'docs');
  const result = runCli(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /対象外/);
});

test('CLI: no-progress-needed ラベルは stray があっても通す', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  fs.mkdirSync(path.join(cwd, 'task/0028-c'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'task/0028-c/progress.md'), '# 0028-c\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { PR_LABELS: JSON.stringify([BYPASS_LABEL]) });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /人間による明示承認/);
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

// --- 帰属（更新された progress が、その PR の作業のものか） ---

test('進捗の Branch が head ブランチと一致すれば通過する', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => 'feature/a',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.deepEqual(result.works, ['0026-a']);
});

test('別作業の progress だけを更新した実装 PR は失敗する（foreign）', () => {
  // レビュアーが実測で再現した経路。ブランチ feature/a が src/ を変え、
  // 更新するのは別作業 0027-b の progress だけ。数は 1 件なので従来は通っていた。
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0027-b/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => 'feature/b',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'foreign');
  assert.deepEqual(result.works, ['0027-b']);
  assert.equal(result.branch, 'feature/b');
  assert.equal(result.headBranch, 'feature/a');
});

test('進捗に Branch の行が無ければ失敗する（foreign）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'foreign');
  assert.equal(result.branch, null);
});

test('branchOf を渡し忘れたら通さない（既定は fail-closed）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'foreign');
});

test('head ブランチ名が無いときは帰属を照合しない（ローカル CLI 実行）', () => {
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: null,
    branchOf: () => 'まったく別のブランチ',
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
});

test('checkAttribution は head ブランチが空なら照合しない', () => {
  assert.deepEqual(checkAttribution('0026-a', { headBranch: '', branchOf: () => 'x' }), {
    ok: true,
    branch: null,
  });
  assert.deepEqual(checkAttribution('0026-a', { headBranch: 'x', branchOf: () => 'x' }), {
    ok: true,
    branch: 'x',
  });
  assert.deepEqual(checkAttribution('0026-a', { headBranch: 'x', branchOf: () => 'y' }), {
    ok: false,
    branch: 'y',
  });
});

test('readBranch は tools/archive.mjs と同じ書式解釈をする', () => {
  assert.equal(readBranch('- **Branch:** `feature/a`\n'), 'feature/a');
  assert.equal(readBranch('- **Branch:** feature/a  \n'), 'feature/a');
  assert.equal(readBranch('- **Branch:** ``\n'), null);
  assert.equal(readBranch('- **Status:** `In Progress`\n'), null);
  assert.equal(readBranch(undefined), null);
});

test('帰属の判定は multiple / stray より後に来る', () => {
  // 2 作業が混ざっているときは、帰属ではなく件数の理由で落とす（誘導が変わる）
  const result = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0026-a/progress.md', 'task/0027-b/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => 'feature/a',
  });
  assert.equal(result.reason, 'multiple');
});

test('docs だけの PR とラベルは帰属を見ずに通る', () => {
  const docsOnly = evaluateCoupling({
    changes: modified('task/0026-a/progress.md'),
    labels: [],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => 'まったく別のブランチ',
  });
  assert.equal(docsOnly.ok, true);
  assert.equal(docsOnly.reason, 'docs-only');

  const bypassed = evaluateCoupling({
    changes: modified('src/math.mjs', 'task/0027-b/progress.md'),
    labels: [BYPASS_LABEL],
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
    headBranch: 'feature/a',
    branchOf: () => 'feature/b',
  });
  assert.equal(bypassed.ok, true);
  assert.equal(bypassed.reason, 'bypass-label');
});

test('resolveCoupling は branchOf を渡さなければ merge-base の progress から Branch を読む', () => {
  const calls = [];
  const execGit = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'diff') {
      return ['M', 'src/math.mjs', 'M', 'task/0026-a/progress.md', ''].join('\0');
    }
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'show') return '- **Branch:** `feature/a`\n';
    return '';
  };
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    headBranch: 'feature/a',
    execGit,
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reason, 'coupled');
  assert.ok(calls.includes('show abc123:task/0026-a/progress.md'));
  // 候補側は読まない（読むと照合相手を同じ PR で書き換えられる）
  assert.ok(!calls.some((c) => c.startsWith('show HEAD:')));
});

test('base 側と head 側で Branch が違うときは base 側を使う', () => {
  // 攻撃者は同じ PR で HEAD 側の Branch 行を head ブランチ名に書き換えられる。
  // 読む先が base に固定されていれば、書き換えは判定を変えない。
  const execGit = (args) => {
    if (args[0] === 'diff') {
      return ['M', 'src/math.mjs', 'M', 'task/0027-b/progress.md', ''].join('\0');
    }
    if (args[0] === 'merge-base') return 'abc123\n';
    if (args[0] === 'show') {
      // HEAD 側は書き換え済み、base 側は着手時の値
      return args[1].startsWith('HEAD:')
        ? '- **Branch:** `feature/a`\n'
        : '- **Branch:** `feature/b`\n';
    }
    return '';
  };
  const result = resolveCoupling({
    baseRef: 'origin/main',
    labels: [],
    headBranch: 'feature/a',
    execGit,
    baseHas: anythingInBase,
    contentChanged: anythingChanged,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'foreign');
  assert.equal(result.branch, 'feature/b');
});

// --- CLI の帰属（実際の git リポジトリで確かめる） ---

test('CLI: head ブランチと進捗の Branch が一致する実装 PR は通過する', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ちょうど 1 件/);
});

test('CLI: 別作業の progress だけを更新した実装 PR は通せない', (t) => {
  // レビュアーが実測で再現した経路そのもの
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0027-b/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /この PR の作業のものではありません/);
  assert.match(result.stderr, /0027-b/);
});

test('CLI: base の進捗に Branch の行が無ければ通せない', (t) => {
  // 照合は base 側を読むので、Branch の欠落も base 側に用意する
  const cwd = makeRepo(t, { baseProgress: '# Progress: `0026-a`\n' });
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /行がありません/);
});

test('CLI/BYPASS: 別作業の progress の Branch 行を書き換えても通せない', (t) => {
  // 5 回目のレビューで実測された経路。0027-b（base の Branch は `other`）を触り、
  // かつ同じ PR でその Branch 行を head ブランチ名へ書き換える。HEAD 側から読むと
  // 一致してしまうが、base 側から読むので落ちる。
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.writeFileSync(
    path.join(cwd, 'task/0027-b/progress.md'),
    `${progressText('0027-b', 'work')}- [x] 実装\n`,
  );
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /この PR の作業のものではありません/);
  assert.match(result.stderr, /Branch（base 側）: other/);
});

test('CLI: 自分の作業の Branch 行を書き換えても、base 側が一致していれば通る', (t) => {
  // 裏面の確認。base 側だけを見るので、HEAD 側の書き換えは判定を変えない
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.writeFileSync(
    path.join(cwd, 'task/0026-a/progress.md'),
    `${progressText('0026-a', 'まったく別のブランチ')}- [x] 実装\n`,
  );
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_HEAD_REF: 'work' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ちょうど 1 件/);
});

test('CLI: GITHUB_ACTIONS の値の大小文字は問わない（TRUE でも fail-closed）', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_ACTIONS: 'TRUE', GITHUB_HEAD_REF: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GITHUB_HEAD_REF が空です/);
});

test('CLI: head ブランチ名が無いローカル実行では帰属を照合しない', (t) => {
  const cwd = makeTwoWorkRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0027-b/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ちょうど 1 件/);
});

test('CLI: GITHUB_ACTIONS で head ブランチ名が空なら fail-closed', (t) => {
  const cwd = makeRepo(t);
  fs.writeFileSync(path.join(cwd, 'src/math.mjs'), 'export const a = 2;\n');
  fs.appendFileSync(path.join(cwd, 'task/0026-a/progress.md'), '- [x] 実装\n');
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', 'work');
  const result = runCli(cwd, { GITHUB_ACTIONS: 'true', GITHUB_HEAD_REF: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GITHUB_HEAD_REF が空です/);
});

// --- ガードによる自己保護（`.claude/skills/add-protected-path` の手順 4） ---

const noScripts = { changes: [], baseScripts: {}, headScripts: {} };

test('ガードは tools/check-progress-coupling.mjs の変更を違反として検知する', () => {
  const changed = findViolations({
    ...noScripts,
    changes: [{ status: 'M', path: 'tools/check-progress-coupling.mjs' }],
  });
  assert.equal(changed.length, 1);
  assert.equal(changed[0].path, 'tools/check-progress-coupling.mjs');
});

test('ガードは tools/check-progress-coupling.mjs の新規追加を違反にしない', () => {
  const added = findViolations({
    ...noScripts,
    changes: [{ status: 'A', path: 'tools/check-progress-coupling.mjs' }],
  });
  assert.deepEqual(added, []);
});
