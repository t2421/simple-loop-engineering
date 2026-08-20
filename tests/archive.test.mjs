import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archive, isWorkName, rewriteProgress } from '../tools/archive.mjs';

const NAME = '0019-bar';

/**
 * 一時ディレクトリに `task/` レイアウトのリポジトリ骨格を作る。
 *
 * @param {object} [opts]
 * @param {string} [opts.pr] - 進捗の PR 欄に書く値
 * @param {string[]} [opts.extras] - 作業ディレクトリに置く関連ファイル（Figma 抽出物など）
 * @param {string} [opts.name] - 作業名
 * @returns {string} 作った root のパス
 */
function makeRepo({ pr = 'https://github.com/t2421/simple-loop-engineering/pull/1', extras = [], name = NAME } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-test-'));
  fs.mkdirSync(path.join(root, 'task', name), { recursive: true });
  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', name, 'spec.md'), `# ${name} の仕様\n`);
  fs.writeFileSync(
    path.join(root, 'task', name, 'progress.md'),
    [
      `# Progress: \`${name}\``,
      '',
      `- **Target Spec:** \`task/${name}/spec.md\``,
      '- **Branch:** `feature/bar`',
      `- **PR:** ${pr}`,
      '- **Status:** `In Progress` (Phase: `Verify (外部)`)',
      '',
      '## タスクチェックリスト',
      '',
      '- [ ] PRマージ後のアーカイブ',
      '',
      '## 試行ログ・エラー履歴',
      '',
      '- 00:00 - 着手',
      '',
    ].join('\n'),
  );
  // 型は移動対象にしてはならない
  fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-spec.md'), '# 仕様テンプレート\n');
  fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-progress.md'), '# 進捗テンプレート\n');
  for (const file of extras) {
    fs.writeFileSync(path.join(root, 'task', name, file), 'extract');
  }
  return root;
}

/** 常にマージ済みと答える PR 確認。実行時に gh を呼ばないための注入口 */
const merged = async () => ({ merged: true, headRefName: 'feature/bar' });
/** 実行中のリポジトリ。gh を呼ばないための注入口 */
const thisRepo = async () => ({ owner: 't2421', repo: 'simple-loop-engineering' });
/** 常に未マージと答える PR 確認 */
const notMerged = async () => ({ merged: false, reason: 'PR がマージされていません' });

/** ディレクトリ内の名前を並べる */
const ls = (dir) => fs.readdirSync(dir).sort();

// --- spec の「例」 ---

test('マージ済み PR を持つ作業を task/archive/ へディレクトリごと移す', async () => {
  const root = makeRepo({ extras: ['bar.figma.json', 'bar.png'] });
  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, true);
  assert.deepEqual(ls(path.join(root, 'task')), ['TEMPLATE-progress.md', 'TEMPLATE-spec.md', 'archive']);
  assert.deepEqual(ls(path.join(root, 'task/archive')), [NAME]);
  // 関連ファイルも同行する
  assert.deepEqual(ls(path.join(root, 'task/archive', NAME)), [
    'bar.figma.json',
    'bar.png',
    'progress.md',
    'spec.md',
  ]);

  const moved = fs.readFileSync(path.join(root, 'task/archive', NAME, 'progress.md'), 'utf8');
  assert.match(moved, /^- \*\*Status:\*\* `Done`$/m);
  assert.match(moved, new RegExp(`^- \\*\\*Target Spec:\\*\\* \`task/archive/${NAME}/spec\\.md\`$`, 'm'));
  assert.match(moved, /^- \[x\] PRマージ後のアーカイブ$/m);
  // 試行ログは消さない
  assert.match(moved, /00:00 - 着手/);
});

test('移動先がすでにあるなら、上書きせず何も変更せずに失敗する', async () => {
  const root = makeRepo();
  fs.mkdirSync(path.join(root, 'task/archive', NAME), { recursive: true });
  fs.writeFileSync(path.join(root, 'task/archive', NAME, 'spec.md'), '# 先にあったアーカイブ\n');

  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.match(result.reason, /移動先/);
  assert.equal(
    fs.readFileSync(path.join(root, 'task/archive', NAME, 'spec.md'), 'utf8'),
    '# 先にあったアーカイブ\n',
    '既存のアーカイブを壊さない',
  );
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')), '移動対象は動いていない');
});

test('存在しない作業名なら何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive('0099-nope', { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME)));
});

test('TEMPLATE-spec を指定すると何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive('TEMPLATE-spec', { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.ok(fs.existsSync(path.join(root, 'task/TEMPLATE-spec.md')));
  assert.ok(fs.existsSync(path.join(root, 'task/TEMPLATE-progress.md')));
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('PR が未マージなら何も変更せず失敗する', async () => {
  const root = makeRepo();
  const result = await archive(NAME, { root, checkPr: notMerged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
  const untouched = fs.readFileSync(path.join(root, 'task', NAME, 'progress.md'), 'utf8');
  assert.match(untouched, /^- \*\*Status:\*\* `In Progress`/m, '進捗も書き換えない');
});

// --- spec の「失敗時」 ---

test('PR が 未作成 なら PR 確認を呼ばずに失敗する', async () => {
  const root = makeRepo({ pr: '未作成' });
  let called = false;
  const result = await archive(NAME, {
    root,
    getRepo: thisRepo,
    checkPr: async () => {
      called = true;
      return { merged: true, headRefName: 'feature/bar' };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('引数が <id>-<slug> の形でなければ何も変更せず失敗する', async () => {
  const root = makeRepo();
  for (const bad of ['bar', '19-bar', '0019', '../0019-bar', 'task/0019-bar', '']) {
    const result = await archive(bad, { root, checkPr: merged, getRepo: thisRepo });
    assert.equal(result.ok, false, `${JSON.stringify(bad)} は不正`);
  }
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME)));
});

test('spec.md が無ければ何も変更せず失敗する', async () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, 'task', NAME, 'spec.md'));
  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'progress.md')));
});

test('progress.md が無ければ何も変更せず失敗する', async () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, 'task', NAME, 'progress.md'));
  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('Status / Target Spec の行が無い進捗は、動かす前に失敗する', async () => {
  const root = makeRepo();
  fs.writeFileSync(
    path.join(root, 'task', NAME, 'progress.md'),
    `# Progress\n\n- **Branch:** \`feature/bar\`\n- **PR:** https://github.com/t2421/simple-loop-engineering/pull/1\n- **Status**: In Progress\n`,
  );

  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Status/);
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
});

test('失敗時は理由を返す', async () => {
  const root = makeRepo();
  const result = await archive('0099-nope', { root, checkPr: merged, getRepo: thisRepo });
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length > 0);
});

// --- 保つべき性質の回帰テスト ---

test('移動後の進捗書き換えに失敗したら巻き戻し、中途半端な状態を残さない', async () => {
  const root = makeRepo();
  // 一時ファイルと同じ名前のディレクトリを置き、移動後の書き込みだけを失敗させる。
  // chmod と違い root でも再現でき、移動そのものは成功する経路を通せる
  fs.mkdirSync(path.join(root, 'task', NAME, 'progress.md.tmp'));

  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.match(result.reason, /巻き戻/);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')), '元の位置に戻っている');
  assert.deepEqual(ls(path.join(root, 'task/archive')), [], 'archive に取り残されていない');

  const untouched = fs.readFileSync(path.join(root, 'task', NAME, 'progress.md'), 'utf8');
  assert.match(untouched, /^- \*\*Status:\*\* `In Progress`/m, 'Status も戻っている');
});

test('移動そのものに失敗しても例外を投げず、理由を返して何も変更しない', async () => {
  const root = makeRepo();
  // task/archive がファイルなら mkdir / rename が失敗する
  fs.rmSync(path.join(root, 'task', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', 'archive'), 'not a directory');

  const result = await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.equal(result.ok, false);
  assert.match(result.reason, /移動できません/);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
});

test('進捗の書き換えは一時ファイル経由で置き換える（.tmp を残さない）', async () => {
  const root = makeRepo();
  await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.deepEqual(ls(path.join(root, 'task/archive', NAME)), ['progress.md', 'spec.md']);
});

test('他の作業ディレクトリは巻き込まない', async () => {
  const root = makeRepo();
  fs.mkdirSync(path.join(root, 'task', '0019-bar-extra'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', '0019-bar-extra', 'spec.md'), '# 別作業\n');

  await archive(NAME, { root, checkPr: merged, getRepo: thisRepo });

  assert.ok(fs.existsSync(path.join(root, 'task', '0019-bar-extra', 'spec.md')));
  assert.deepEqual(ls(path.join(root, 'task/archive')), [NAME]);
});

// --- 純関数 ---

test('isWorkName: <id>-<slug> だけを受ける', () => {
  assert.equal(isWorkName('0019-bar'), true);
  assert.equal(isWorkName('0003-calc-page'), true);
  assert.equal(isWorkName('TEMPLATE-spec'), false);
  assert.equal(isWorkName('19-bar'), false);
  assert.equal(isWorkName('0019'), false);
  assert.equal(isWorkName('0019-'), false);
  assert.equal(isWorkName('../0019-bar'), false);
  assert.equal(isWorkName('task/0019-bar'), false);
  assert.equal(isWorkName(''), false);
});

test('rewriteProgress: 当たらなかった行を missing で返す', () => {
  const ok = rewriteProgress(
    '- **Target Spec:** `task/0019-bar/spec.md`\n- **Status:** `In Progress`\n',
    NAME,
  );
  assert.deepEqual(ok.missing, []);
  assert.match(ok.text, /- \*\*Status:\*\* `Done`/);
  assert.match(ok.text, /- \*\*Target Spec:\*\* `task\/archive\/0019-bar\/spec\.md`/);

  const bad = rewriteProgress('- **Status**: In Progress\n', NAME);
  assert.deepEqual(bad.missing.sort(), ['Status', 'Target Spec']);
});
