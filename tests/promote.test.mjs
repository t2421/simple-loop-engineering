import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  promote,
  isWorkName,
  stripBacklogLine,
  stripIncompleteLine,
  buildProgress,
  BACKLOG_LINE,
  INCOMPLETE_LINE,
  branchFor,
  isGitSafeRef,
} from '../loop-core/ledger/promote.mjs';
import { isValidBranchName } from '../loop-core/ledger/start-task.mjs';

/** 昇格前の backlog spec（backlog 行・未確定行・プレースホルダ入り） */
function backlogSpec() {
  return [
    '# 何かをする',
    '',
    '一行の要約。',
    '',
    '## 種別',
    '',
    '改善',
    '',
    '## 対象',
    '',
    '- 場所: `tools/foo.mjs`',
    '',
    '## 背景',
    '',
    BACKLOG_LINE,
    '',
    '本当の背景はここから始まる。',
    '',
    '## 仕様',
    '',
    '- 何かをする',
    '',
    '## 範囲外',
    '',
    '- 何かをしない',
    '',
    '## 失敗時',
    '',
    `${INCOMPLETE_LINE}候補:`,
    '',
    '- 入力が無い: 失敗する',
    '',
    '## 例',
    '',
    INCOMPLETE_LINE,
    '',
    '| 操作または入力 | 期待結果 |',
    '|---|---|',
    '| `<昇格時に記入>` | `<昇格時に記入>` |',
    '',
    '## 完了条件',
    '',
    INCOMPLETE_LINE,
    '',
    '次をすべて満たしたとき、この仕様は完了とする。',
    '',
    '1. 「対象」が仕様どおりに公開または修正されている。',
    '2. 「例」がすべて、テストまたは再現手順で同じ結果になる。',
    '3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。',
    '4. 「範囲外」を実装していない。',
    '5. <この変更固有の、検証可能な命題。>',
    '',
  ].join('\n');
}

/** 本物の `task/TEMPLATE-progress.md` と同じ形（`---` の上に説明、下に型） */
function progressTemplate() {
  return [
    '# 進捗テンプレート',
    '',
    '新しい進捗はこのファイルをコピーして `<...>` を埋める。',
    '',
    '---',
    '',
    '# Progress: `<作業名>`',
    '',
    '- **Target Spec:** `task/<id>-<slug>/spec.md`',
    '- **Branch:** `<ブランチ名>`',
    '- **PR:** `<未作成 | PR の URL>`',
    '- **Status:** `<Not Started | In Progress | Blocked | Done>` (Phase: `<現在の工程>`)',
    '- **Complexity:** `<S | M | L>`',
    '',
    '## タスクチェックリスト',
    '',
    '構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。',
    '',
    '- [ ] Specの要件・受け入れ条件の確認',
    '- [ ] テストの作成 (`<テストファイル>`)',
    '- [ ] 実装 (`<実装ファイル>`)',
    '- [ ] レビューサブエージェント (`<レビュアー名>`) の承認取得',
    '- [ ] PR作成（進捗の **PR** に URL を書く。）',
    '- [ ] PRマージ後のアーカイブ',
    '',
    '## 試行ログ・エラー履歴',
    '',
    '- `<HH:MM>` - `<やったこと。>`',
    '',
  ].join('\n');
}

/**
 * 一時ディレクトリに git リポジトリと `backlog/` `task/` の構造を模す。
 * backlog の中身はコミットしておく（`git mv` は追跡下のファイルにしか効かない）。
 */
function makeRepo({ backlogName = '0040-foo', withTemplate = true, spec = backlogSpec() } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  if (withTemplate) {
    fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-progress.md'), progressTemplate());
  }
  if (backlogName !== null) {
    fs.mkdirSync(path.join(root, 'backlog', backlogName), { recursive: true });
    fs.writeFileSync(path.join(root, 'backlog', backlogName, 'spec.md'), spec);
  }
  git('add', '-A');
  git('commit', '-qm', 'init');
  return root;
}

/**
 * `backlog/` と `task/` 配下を パス -> 中身 で写し取る。
 * ディレクトリも記録する（中身が同じでも空ディレクトリが残れば検知したい）。
 */
function snapshot(root) {
  const out = {};
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const dirent of fs.readdirSync(abs, { withFileTypes: true })) {
      const child = `${rel}/${dirent.name}`;
      if (dirent.isDirectory()) {
        out[`${child}/`] = null;
        walk(child);
      } else {
        out[child] = fs.readFileSync(path.join(root, child), 'utf8');
      }
    }
  };
  walk('backlog');
  walk('task');
  return out;
}

/** progress.md の `- **キー:** 値` を読む */
function meta(markdown, key) {
  const m = new RegExp(`^- \\*\\*${key}:\\*\\*\\s*(.+)$`, 'm').exec(markdown);
  return m === null ? null : m[1].trim();
}

/** `##` 見出しを順番に並べる */
function headings(markdown) {
  return [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
}

// --- isWorkName ---

test('isWorkName: ゼロ埋め 4 桁 + slug だけを受ける', () => {
  assert.equal(isWorkName('0040-foo'), true);
  assert.equal(isWorkName('0001-math-add'), true);
  assert.equal(isWorkName('abc'), false);
  assert.equal(isWorkName('40-foo'), false);
  assert.equal(isWorkName('0040'), false);
  assert.equal(isWorkName('TEMPLATE-spec.md'), false);
  assert.equal(isWorkName('0040-foo/../etc'), false);
  assert.equal(isWorkName(' 0040-foo'), false);
  assert.equal(isWorkName(undefined), false);
});

// --- 純関数の書き換え ---

test('stripBacklogLine: 背景の backlog 行と直後の空行だけを消す', () => {
  const after = stripBacklogLine(backlogSpec());
  assert.equal(after.includes(BACKLOG_LINE), false);
  assert.match(after, /## 背景\n\n本当の背景はここから始まる。/);
});

test('stripIncompleteLine: 完了条件の未確定行だけを消し、失敗時と例の前置きは残す', () => {
  const after = stripIncompleteLine(backlogSpec());
  assert.match(after, /## 完了条件\n\n次をすべて満たしたとき/);
  // 「失敗時」「例」の前置きは判断を要するので触らない（範囲外）
  assert.equal(after.includes(`${INCOMPLETE_LINE}候補:`), true);
  assert.match(after, /## 例\n\n未確定（incomplete）。昇格時に埋める。\n/);
  // 5 番のプレースホルダは残す（完了条件が未確定であることの印）
  assert.equal(after.includes('<この変更固有の、検証可能な命題。>'), true);
});

test('buildProgress: テンプレートの `---` より下からメタを埋めた進捗を作る', () => {
  const result = buildProgress({ template: progressTemplate(), name: '0040-foo' });
  assert.equal(result.ok, true);
  assert.match(result.text, /^# Progress: `0040-foo`\n/);
  assert.equal(meta(result.text, 'Target Spec'), '`task/0040-foo/spec.md`');
  assert.equal(meta(result.text, 'Branch'), '`feat/0040-foo`');
  assert.equal(meta(result.text, 'PR'), '`未作成`');
  assert.equal(meta(result.text, 'Status'), '`Not Started` (Phase: `Plan`)');
  // Complexity は判断を要するのでプレースホルダのまま
  assert.equal(meta(result.text, 'Complexity'), '`<S | M | L>`');
  // `---` より上（テンプレートの説明）は持ち込まない
  assert.equal(result.text.includes('# 進捗テンプレート'), false);
});

test('buildProgress: 見出し名と順番がテンプレートの `---` より下と同じ', () => {
  const template = progressTemplate();
  const below = template.slice(template.indexOf('\n---\n') + 5);
  const result = buildProgress({ template, name: '0040-foo' });
  assert.deepEqual(headings(result.text), headings(below));
});

test('buildProgress: メタ行を欠くテンプレートは失敗を返す', () => {
  const broken = progressTemplate().replace(/^- \*\*Status:\*\*.*$/m, '');
  const result = buildProgress({ template: broken, name: '0040-foo' });
  assert.equal(result.ok, false);
  assert.match(result.reason, /Status/);
});

// --- 例の表 ---

test('例1: backlog にある作業を昇格すると task へ移り、progress が生成される', () => {
  const root = makeRepo();

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, true, result.reason);
  assert.equal(fs.existsSync(path.join(root, 'backlog', '0040-foo')), false);

  const spec = fs.readFileSync(path.join(root, 'task', '0040-foo', 'spec.md'), 'utf8');
  assert.equal(spec.includes(BACKLOG_LINE), false);
  assert.match(spec, /## 完了条件\n\n次をすべて満たしたとき/);
  assert.equal(spec.includes('<この変更固有の、検証可能な命題。>'), true);
  assert.equal(spec.includes(`${INCOMPLETE_LINE}候補:`), true);

  const progress = fs.readFileSync(path.join(root, 'task', '0040-foo', 'progress.md'), 'utf8');
  assert.match(progress, /^# Progress: `0040-foo`\n/);
  assert.equal(meta(progress, 'Target Spec'), '`task/0040-foo/spec.md`');
  assert.equal(meta(progress, 'Branch'), '`feat/0040-foo`');
  assert.equal(meta(progress, 'PR'), '`未作成`');
  assert.equal(meta(progress, 'Status'), '`Not Started` (Phase: `Plan`)');
  assert.equal(meta(progress, 'Complexity'), '`<S | M | L>`');
});

test('例1: 移動は git の追跡下で行われる（git mv 相当）', () => {
  const root = makeRepo();

  assert.equal(promote('0040-foo', { root }).ok, true);

  const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  // spec は移動としてステージ済み（`R`）。中身を書き換えたので作業ツリー側は `M`。
  // progress は新規追加（未追跡）
  assert.match(status, /^RM? backlog\/0040-foo\/spec\.md -> task\/0040-foo\/spec\.md$/m);
  assert.match(status, /^\?\? task\/0040-foo\/progress\.md$/m);
});

test('例2: 同じコマンドを再実行すると、何も変更せず失敗する', () => {
  const root = makeRepo();
  assert.equal(promote('0040-foo', { root }).ok, true);
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /backlog\/0040-foo/);
  assert.deepEqual(snapshot(root), before);
});

test('例3: どこにも存在しない作業は、何も変更せず失敗する', () => {
  const root = makeRepo();
  const before = snapshot(root);

  const result = promote('9999-none', { root });

  assert.equal(result.ok, false);
  assert.deepEqual(snapshot(root), before);
});

test('例4: 形式が不正な引数は、何も変更せず失敗する', () => {
  const root = makeRepo();
  const before = snapshot(root);

  for (const name of ['abc', '', undefined, '40-foo', '0040-foo/../x']) {
    const result = promote(name, { root });
    assert.equal(result.ok, false, `name=${name}`);
  }
  assert.deepEqual(snapshot(root), before);
});

// --- 失敗時 ---

test('失敗時: 移動先の task/<id>-<slug>/ が既にあると、何も変更せず失敗する', () => {
  const root = makeRepo();
  fs.mkdirSync(path.join(root, 'task', '0040-foo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', '0040-foo', 'spec.md'), '既存の中身\n');
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /task\/0040-foo/);
  assert.deepEqual(snapshot(root), before);
});

test('失敗時: backlog/<id>-<slug>/spec.md が無いと、何も変更せず失敗する', () => {
  const root = makeRepo();
  fs.rmSync(path.join(root, 'backlog', '0040-foo', 'spec.md'));
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /spec\.md/);
  assert.deepEqual(snapshot(root), before);
});

test('失敗時: task/TEMPLATE-progress.md が無いと、何も変更せず失敗する', () => {
  const root = makeRepo({ withTemplate: false });
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /TEMPLATE-progress\.md/);
  assert.deepEqual(snapshot(root), before);
});

// --- 範囲外 ---

test('範囲外: 完了条件 5 のプレースホルダと Complexity を自動で埋めない', () => {
  const root = makeRepo();

  assert.equal(promote('0040-foo', { root }).ok, true);

  const spec = fs.readFileSync(path.join(root, 'task', '0040-foo', 'spec.md'), 'utf8');
  const progress = fs.readFileSync(path.join(root, 'task', '0040-foo', 'progress.md'), 'utf8');
  assert.equal(spec.includes('<この変更固有の、検証可能な命題。>'), true);
  assert.equal(meta(progress, 'Complexity'), '`<S | M | L>`');
});

test('範囲外: 逆方向（task → backlog）の降格は無い', () => {
  const root = makeRepo({ backlogName: null });
  fs.mkdirSync(path.join(root, 'task', '0040-foo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', '0040-foo', 'spec.md'), backlogSpec());
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.deepEqual(snapshot(root), before);
});

// --- レビュー指摘の回帰テスト ---

test('失敗時: backlog に progress.md があると、移動する前に何も変更せず失敗する', () => {
  // backlog は progress を持たない（CLAUDE.md）。あるまま昇格すると
  // 生成した progress で黙って上書きすることになる
  const root = makeRepo();
  const blocker = path.join(root, 'backlog', '0040-foo', 'progress.md');
  fs.writeFileSync(blocker, '手で置かれた progress\n');
  execFileSync('git', ['add', '-A'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'blocker'], { cwd: root });
  const before = snapshot(root);

  const result = promote('0040-foo', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /progress/);
  assert.deepEqual(snapshot(root), before);
});

test('失敗時: 生成する Branch がブランチ名として不正なら、移動する前に失敗する', () => {
  // start-task がこの Branch をそのまま `git worktree add -b` に渡すので、
  // 向こうの受理集合を通らない値を書いて「昇格はできたが開始できない」を作らない
  const root = makeRepo({ backlogName: '0040-foo bar' });
  const before = snapshot(root);

  const result = promote('0040-foo bar', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Branch/);
  assert.deepEqual(snapshot(root), before);
  assert.equal(isValidBranchName(branchFor('0040-foo')), true);
});

test('失敗時: 巻き戻しにも失敗したら、巻き戻したと報告しない', () => {
  const root = makeRepo();
  // 順方向の git mv は本物、逆方向だけ失敗させる
  const exec = (cmd, args, opts) => {
    if (cmd === 'git' && args[0] === 'mv' && args[1].startsWith('task/')) {
      throw new Error('git mv failed (injected)');
    }
    return execFileSync(cmd, args, { ...opts, encoding: 'utf8' });
  };
  const writeFile = (file, data) => {
    if (file.endsWith('spec.md')) throw new Error('write failed (injected)');
    fs.writeFileSync(file, data);
  };

  const result = promote('0040-foo', { root, exec, writeFile });

  assert.equal(result.ok, false);
  // 「巻き戻しました」と嘘をつかず、残骸があることを伝える
  assert.match(result.reason, /巻き戻しにも失敗/);
  assert.match(result.reason, /手で確認/);
});

test('コードフェンスの中の `## 完了条件` を節の先頭と誤認しない', () => {
  const fenced = backlogSpec().replace(
    '## 例\n',
    '## 例\n\n```\n## 完了条件\n\n未確定（incomplete）。昇格時に埋める。\n```\n',
  );

  const after = stripIncompleteLine(fenced);

  // フェンスの中は 1 文字も変えない
  assert.equal(after.includes('```\n## 完了条件\n\n未確定（incomplete）。昇格時に埋める。\n```'), true);
  // 本物の「完了条件」節の未確定行は消える
  assert.match(after, /## 完了条件\n\n次をすべて満たしたとき/);
});

test('コードフェンスの中の `## 背景` を節の先頭と誤認しない', () => {
  const fenced = backlogSpec().replace('## 種別\n', '## 種別\n\n```\n## 背景\n```\n');

  const after = stripBacklogLine(fenced);

  assert.equal(after.includes('```\n## 背景\n```'), true);
  assert.equal(after.includes(BACKLOG_LINE), false);
});

test('完了条件 6: 実物の task/TEMPLATE-progress.md に対して見出し名・順番が一致する', () => {
  // テスト内の手書き複製ではなく実ファイルを入力にする。
  // テンプレートが変わったらこのテストが落ちる
  const templatePath = new URL('../task/TEMPLATE-progress.md', import.meta.url);
  const template = fs.readFileSync(templatePath, 'utf8');
  const below = template.slice(template.indexOf('\n---\n') + 5);

  const result = buildProgress({ template, name: '0040-foo' });

  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(headings(result.text), headings(below));
  assert.match(result.text, /^# Progress: `0040-foo`\n/);
  assert.equal(meta(result.text, 'Target Spec'), '`task/0040-foo/spec.md`');
  assert.equal(meta(result.text, 'Branch'), '`feat/0040-foo`');
  assert.equal(meta(result.text, 'PR'), '`未作成`');
  assert.equal(meta(result.text, 'Status'), '`Not Started` (Phase: `Plan`)');
  assert.equal(meta(result.text, 'Complexity'), '`<S | M | L>`');
  assert.equal(result.text.includes('# 進捗テンプレート'), false);
});

test('失敗時: spec の書き込みだけが失敗しても、書きかけの progress を消して巻き戻す', () => {
  const root = makeRepo();
  const before = snapshot(root);
  // 順方向の spec 書き込みだけ失敗させる（巻き戻しの復元は成功させる）
  let first = true;
  const writeFile = (file, data) => {
    if (file.endsWith('spec.md') && first) {
      first = false;
      throw new Error('write failed (injected)');
    }
    fs.writeFileSync(file, data);
  };

  const result = promote('0040-foo', { root, writeFile });

  assert.equal(result.ok, false);
  // 完全に巻き戻せたので、残骸の警告は出さない
  assert.match(result.reason, /移動を巻き戻しました/);
  assert.equal(fs.existsSync(path.join(root, 'task', '0040-foo')), false);
  assert.deepEqual(snapshot(root), before);
});

test('isGitSafeRef: git が拒む形（末尾ドット・区切りの先頭ドット）を弾く', () => {
  assert.equal(isGitSafeRef('feat/0040-foo'), true);
  assert.equal(isGitSafeRef('feat/0040-foo.'), false);
  assert.equal(isGitSafeRef('feat/.hidden'), false);
  assert.equal(isGitSafeRef('.feat/foo'), false);
  assert.equal(isGitSafeRef(''), false);
  // isValidBranchName だけでは末尾ドットを弾けない（この上乗せが要る理由）
  assert.equal(isValidBranchName('feat/0040-foo.'), true);
});

test('失敗時: 末尾ドットの作業名は、移動する前に何も変更せず失敗する', () => {
  const root = makeRepo({ backlogName: '0040-foo.' });
  const before = snapshot(root);

  const result = promote('0040-foo.', { root });

  assert.equal(result.ok, false);
  assert.match(result.reason, /Branch/);
  assert.deepEqual(snapshot(root), before);
});

test('失敗時: 巻き戻しの spec 復元が失敗したら、巻き戻したと報告しない', () => {
  // 逆方向の git mv は成功するが、spec の復元が失敗する。ディレクトリは戻っても
  // 中身は壊れたままなので「巻き戻した」と言ってはいけない
  const root = makeRepo();
  const writeFile = (file, data) => {
    if (file.endsWith('spec.md')) throw new Error('write failed (injected)');
    fs.writeFileSync(file, data);
  };

  const result = promote('0040-foo', { root, writeFile });

  assert.equal(result.ok, false);
  assert.match(result.reason, /巻き戻しにも失敗/);
  assert.match(result.reason, /spec\.md を戻せませんでした/);
  assert.match(result.reason, /手で確認/);
});
