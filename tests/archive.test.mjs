import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archive, collectArtifacts, rewriteProgress } from '../tools/archive.mjs';

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

// --- レビュー指摘の回帰テスト ---

test('移動先に既存のアーカイブがあれば、上書きせず何も変更せずに失敗する', async () => {
  const root = makeRepo();
  fs.writeFileSync(path.join(root, 'specs/archive/foo.md'), '# 先にあったアーカイブ\n');

  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.match(result.reason, /移動先/);
  // 既存のアーカイブが残っている
  assert.equal(
    fs.readFileSync(path.join(root, 'specs/archive/foo.md'), 'utf8'),
    '# 先にあったアーカイブ\n',
  );
  // 移動対象は動いていない
  assert.ok(fs.existsSync(path.join(root, 'specs/foo.md')));
  assert.ok(fs.existsSync(path.join(root, 'progress/foo.md')));
});

test('抽出物の移動先が衝突していても、spec を動かす前に失敗する', async () => {
  const root = makeRepo({ extras: ['foo.png'] });
  fs.writeFileSync(path.join(root, 'progress/archive/foo.png'), 'old');

  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.ok(fs.existsSync(path.join(root, 'specs/foo.md')), 'spec が先に動いてはいけない');
  assert.equal(fs.readFileSync(path.join(root, 'progress/archive/foo.png'), 'utf8'), 'old');
});

test('移動の途中で失敗したら巻き戻し、中途半端な状態を残さない', {
  // root はモードビットを無視して rename できてしまう（コンテナ実行の CI 等）
  skip: process.getuid?.() === 0 ? 'root では chmod による失敗を再現できない' : false,
}, async () => {
  const root = makeRepo({ extras: ['foo.png'] });
  // progress/archive/ を書き込めなくして、spec の移動後に失敗させる
  const blocked = path.join(root, 'progress/archive');
  fs.chmodSync(blocked, 0o500);
  try {
    const result = await archive('foo', { root, checkPr: merged });

    assert.equal(result.ok, false);
    assert.match(result.reason, /巻き戻し/);
    // spec が archive/ に取り残されていない
    assert.ok(fs.existsSync(path.join(root, 'specs/foo.md')), 'spec が元の位置に戻っている');
    assert.ok(!fs.existsSync(path.join(root, 'specs/archive/foo.md')));
    assert.ok(fs.existsSync(path.join(root, 'progress/foo.md')));
  } finally {
    fs.chmodSync(blocked, 0o700);
  }
});

test('Status / Target Spec の行が無い進捗は、動かす前に失敗する', async () => {
  const root = makeRepo();
  fs.writeFileSync(
    path.join(root, 'progress/foo.md'),
    '# Progress: foo\n\n- **PR:** https://github.com/o/r/pull/1\n- **Status**: In Progress\n',
  );

  const result = await archive('foo', { root, checkPr: merged });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Status/);
  assert.ok(fs.existsSync(path.join(root, 'specs/foo.md')));
  assert.deepEqual(ls(path.join(root, 'progress/archive')), []);
});

test('ドット区切りの別作業を巻き込まない', async () => {
  const root = makeRepo({ extras: ['foo.png', 'foo.v2.md', 'foo.v2.png'] });
  await archive('foo', { root, checkPr: merged });

  // foo.v2 は別作業。progress/ に残る
  assert.ok(fs.existsSync(path.join(root, 'progress/foo.v2.md')));
  assert.ok(fs.existsSync(path.join(root, 'progress/foo.v2.png')));
  assert.deepEqual(ls(path.join(root, 'progress/archive')), ['foo.md', 'foo.png']);
});

test('collectArtifacts: 進捗本体と抽出物だけを拾う', () => {
  const entries = ['foo.md', 'foo.png', 'foo.figma.json', 'foo.v2.md', 'foo-bar.md', 'other.md'];
  assert.deepEqual(collectArtifacts(entries, 'foo'), ['foo.figma.json', 'foo.md', 'foo.png']);
});

test('rewriteProgress: 当たらなかった行を missing で返す', () => {
  const ok = rewriteProgress('- **Target Spec:** `specs/foo.md`\n- **Status:** In Progress\n', 'foo');
  assert.deepEqual(ok.missing, []);
  assert.match(ok.text, /- \*\*Status:\*\* Done/);

  const bad = rewriteProgress('- **Status**: In Progress\n', 'foo');
  assert.deepEqual(bad.missing.sort(), ['Status', 'Target Spec']);
});

test('アーカイブのチェック項目が [x] になる', async () => {
  const root = makeRepo();
  const p = path.join(root, 'progress/foo.md');
  fs.writeFileSync(fs.readFileSync(p, 'utf8') ? p : p,
    fs.readFileSync(p, 'utf8') + '\n- [ ] PRマージ後のアーカイブ\n');

  await archive('foo', { root, checkPr: merged });

  const moved = fs.readFileSync(path.join(root, 'progress/archive/foo.md'), 'utf8');
  assert.match(moved, /^- \[x\] PRマージ後のアーカイブ$/m);
});

test('進捗の書き換えは一時ファイル経由で置き換える（途中で壊さない）', async () => {
  const root = makeRepo();
  await archive('foo', { root, checkPr: merged });

  // .tmp が残っていない
  assert.deepEqual(ls(path.join(root, 'progress/archive')), ['foo.md']);
});
