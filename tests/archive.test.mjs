import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archive } from '../tools/archive.mjs';

/**
 * 一時ディレクトリに specs/ と progress/ を持つリポジトリの骨格を作る。
 *
 * @param {object} [opts]
 * @param {string} [opts.pr] - 進捗の PR 欄に書く値
 * @param {string[]} [opts.extras] - 進捗と同じベース名で置く抽出物のファイル名
 * @returns {string} 作った root のパス
 */
function makeRepo({ pr = 'https://github.com/o/r/pull/1', extras = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
  for (const d of ['specs', 'specs/archive', 'progress', 'progress/archive']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
  fs.writeFileSync(path.join(root, 'specs/foo.md'), '# foo の仕様\n');
  fs.writeFileSync(
    path.join(root, 'progress/foo.md'),
    [
      '# Progress: foo',
      '',
      '- **Target Spec:** `specs/foo.md`',
      '- **Branch:** `feature/foo`',
      `- **PR:** ${pr}`,
      '- **Status:** In Progress',
      '',
      '## 試行ログ・エラー履歴',
      '',
      '- 00:00 - 着手',
      '',
    ].join('\n'),
  );
  // TEMPLATE は移動対象にしてはならない
  fs.writeFileSync(path.join(root, 'specs/TEMPLATE.md'), '# 仕様テンプレート\n');
  fs.writeFileSync(path.join(root, 'progress/TEMPLATE.md'), '# 進捗テンプレート\n');
  for (const name of extras) {
    fs.writeFileSync(path.join(root, 'progress', name), 'extract');
  }
  return root;
}

/** 常にマージ済みと答える PR 確認。実行時に gh を呼ばないための注入口 */
const merged = async () => ({ merged: true });
/** 常に未マージと答える PR 確認 */
const notMerged = async () => ({ merged: false, reason: 'PR がマージされていません' });

/** ディレクトリ内のファイル名を並べる */
const ls = (dir) => fs.readdirSync(dir).sort();

test('マージ済み PR を持つ作業名で実行すると Status が Done になり archive/ へ移動する', async () => {
  const root = makeRepo();
  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, true);
  assert.deepEqual(ls(path.join(root, 'specs')), ['TEMPLATE.md', 'archive']);
  assert.deepEqual(ls(path.join(root, 'specs/archive')), ['foo.md']);
  assert.deepEqual(ls(path.join(root, 'progress')), ['TEMPLATE.md', 'archive']);
  assert.deepEqual(ls(path.join(root, 'progress/archive')), ['foo.md']);

  const moved = fs.readFileSync(path.join(root, 'progress/archive/foo.md'), 'utf8');
  assert.match(moved, /^- \*\*Status:\*\* Done$/m);
  assert.match(moved, /^- \*\*Target Spec:\*\* `specs\/archive\/foo\.md`$/m);
  // 試行ログは消さない
  assert.match(moved, /00:00 - 着手/);
});

test('同じベース名の抽出物も progress/archive/ へ移動する', async () => {
  const root = makeRepo({ extras: ['foo.figma.json', 'foo.png'] });
  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, true);
  assert.deepEqual(ls(path.join(root, 'progress/archive')), [
    'foo.figma.json',
    'foo.md',
    'foo.png',
  ]);
  assert.deepEqual(ls(path.join(root, 'progress')), ['TEMPLATE.md', 'archive']);
});

test('別作業の似た名前のファイルは巻き込まない', async () => {
  const root = makeRepo({ extras: ['foo-bar.md'] });
  await archive('foo', { root, checkPr: merged });

  assert.ok(fs.existsSync(path.join(root, 'progress/foo-bar.md')));
  assert.ok(!fs.existsSync(path.join(root, 'progress/archive/foo-bar.md')));
});

test('PR が未マージなら何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive('foo', { root, checkPr: notMerged });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'specs')), ['TEMPLATE.md', 'archive', 'foo.md']);
  assert.deepEqual(ls(path.join(root, 'specs/archive')), []);
  assert.deepEqual(ls(path.join(root, 'progress/archive')), []);
  const untouched = fs.readFileSync(path.join(root, 'progress/foo.md'), 'utf8');
  assert.match(untouched, /^- \*\*Status:\*\* In Progress$/m);
});

test('PR が 未作成 なら PR 確認を呼ばずに失敗する', async () => {
  const root = makeRepo({ pr: '未作成' });
  let called = false;
  const result = await archive('foo', {
    root,
    checkPr: async () => {
      called = true;
      return { merged: true };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.deepEqual(ls(path.join(root, 'specs/archive')), []);
});

test('存在しない作業名なら何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive('nope', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'specs')), ['TEMPLATE.md', 'archive', 'foo.md']);
  assert.deepEqual(ls(path.join(root, 'specs/archive')), []);
});

test('spec だけ無い場合も何も変更せず失敗する', async () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, 'specs/foo.md'));
  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'progress/archive')), []);
  assert.ok(fs.existsSync(path.join(root, 'progress/foo.md')));
});

test('TEMPLATE を指定すると何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive('TEMPLATE', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.ok(fs.existsSync(path.join(root, 'specs/TEMPLATE.md')));
  assert.ok(fs.existsSync(path.join(root, 'progress/TEMPLATE.md')));
  assert.deepEqual(ls(path.join(root, 'specs/archive')), []);
});

test('失敗時は理由を返す', async () => {
  const root = makeRepo();
  const result = await archive('nope', { root, checkPr: merged });
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0);
});
