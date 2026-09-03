/**
 * `tools/lint-docs.mjs` のテスト。
 *
 * 判定は一時ディレクトリ上にレイアウトを組んで行う。リポジトリの現状に
 * 依存させない（現状が壊れたときに、壊れたことをテストが隠さないため）。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  SPEC_HEADINGS,
  STATUS_VALUES,
  COMPLEXITY_VALUES,
  METADATA_KEYS,
  BACKLOG_INCOMPLETE_LINE,
  LEGACY_PROGRESS_WITHOUT_PR,
  extractHeadings,
  linesOutsideFences,
  matchWorkDirName,
  parseMetadata,
  normalizeStatus,
  findBadCheckboxes,
  checkBacklogCompletion,
  lintDocs,
} from '../loop-core/ledger/lint-docs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repoRoot, 'loop-core', 'ledger', 'lint-docs.mjs');

/** 一時ディレクトリを作り、テスト終了時に消す */
function makeRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-docs-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const SPEC_BODIES = {
  種別: '機能追加',
  対象: '- 場所: `src/x.mjs`\n- 公開面: `x()`',
  背景: '今は無くて困る。',
  仕様: '`x()` は 1 を返す。',
  範囲外: 'なし',
  失敗時: 'なし',
  例: 'なし',
};

/** テンプレート準拠の spec.md を組み立てる */
function specMarkdown({ title = 'x の追加', backlog = false, omit = [], extra = '' } = {}) {
  const completion = backlog
    ? BACKLOG_INCOMPLETE_LINE
    : '次をすべて満たしたとき、この仕様は完了とする。\n\n1. 「対象」が仕様どおりに公開されている。';
  let out = `# ${title}\n\n一文で、何をどう変えるか。\n`;
  for (const heading of SPEC_HEADINGS) {
    if (omit.includes(heading)) continue;
    const body = heading === '完了条件' ? completion : SPEC_BODIES[heading];
    out += `\n## ${heading}\n\n${body}\n`;
  }
  return out + extra;
}

/** テンプレート準拠の progress.md を組み立てる */
function progressMarkdown({
  name = '0030-a',
  targetSpec = 'task/0030-a/spec.md',
  branch = 'feature/a',
  pr = '未作成',
  status = 'In Progress',
  complexity,
  omit = [],
  checkbox = '[ ]',
} = {}) {
  const meta = [
    ['Target Spec', `\`${targetSpec}\``],
    ['Branch', `\`${branch}\``],
    ['PR', `\`${pr}\``],
    ['Status', `\`${status}\` (Phase: \`Implement\`)`],
    // 省くと **Complexity** 行の無い進捗（既存分と同じ形）になる
    ...(complexity === undefined ? [] : [['Complexity', `\`${complexity}\``]]),
  ]
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `- **${key}:** ${value}`)
    .join('\n');
  return [
    `# Progress: \`${name}\``,
    '',
    meta,
    '',
    '## タスクチェックリスト',
    '',
    `- ${checkbox} Specの要件・受け入れ条件の確認`,
    '',
    '## 試行ログ・エラー履歴',
    '',
    '- `05:55` - 作成した。',
    '',
  ].join('\n');
}

/** 準拠した task 作業を 1 つ置く */
function putTask(root, name, { archived = false, ...progressOptions } = {}) {
  const relDir = archived ? `task/archive/${name}` : `task/${name}`;
  write(root, `${relDir}/spec.md`, specMarkdown({ title: name }));
  write(
    root,
    `${relDir}/progress.md`,
    progressMarkdown({ name, targetSpec: `${relDir}/spec.md`, ...progressOptions }),
  );
  return relDir;
}

/** 準拠した backlog 候補を 1 つ置く */
function putBacklog(root, name) {
  const relDir = `backlog/${name}`;
  write(root, `${relDir}/spec.md`, specMarkdown({ title: name, backlog: true }));
  return relDir;
}

/** すべて準拠したレイアウトを組む */
function putValidLayout(root) {
  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  fs.mkdirSync(path.join(root, 'backlog'), { recursive: true });
  putTask(root, '0030-a');
  putTask(root, '0031-b', { archived: true, status: 'Done', pr: 'https://example.test/pull/1' });
  putBacklog(root, '0032-c');
  // テンプレート自身は検証対象外。置いても違反にならないこと
  write(root, 'task/TEMPLATE-spec.md', '# 仕様テンプレート\n\n---\n\n# `<タイトル>`\n\n## 種別\n');
  write(root, 'task/TEMPLATE-progress.md', '# 進捗テンプレート\n\n---\n\n# Progress: `<作業名>`\n');
  // 旧レイアウトも検証対象外
  write(root, 'specs/TEMPLATE.md', '# 旧仕様テンプレート\n');
  write(root, 'progress/TEMPLATE.md', '# 旧進捗テンプレート\n');
  return root;
}

function paths(violations) {
  return violations.map((v) => v.path);
}

function reasonsFor(violations, target) {
  return violations.filter((v) => v.path === target).map((v) => v.reason);
}

function runCli(root) {
  return spawnSync(process.execPath, [CLI, root], { encoding: 'utf8' });
}

// --- 例の各行 ---

test('例1: すべて準拠している状態で実行 → 違反なし、終了コード 0', (t) => {
  const root = putValidLayout(makeRoot(t));

  assert.deepEqual(lintDocs(root), []);

  const cli = runCli(root);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /違反はありません/);
});

test('例2: spec.md の「範囲外」見出しを削除 → 見出し不一致が列挙され、非 0', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/0030-a/spec.md', specMarkdown({ title: '0030-a', omit: ['範囲外'] }));

  const violations = lintDocs(root);
  const target = 'task/0030-a/spec.md';
  assert.ok(paths(violations).includes(target), JSON.stringify(violations));
  assert.ok(
    reasonsFor(violations, target).some((r) => r.includes('見出し不一致')),
    JSON.stringify(violations),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /task\/0030-a\/spec\.md/);
  assert.match(cli.stderr, /見出し不一致/);
});

test('例3: progress.md の Status を WIP → Status が不正が列挙され、非 0', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/0030-a/progress.md', progressMarkdown({ status: 'WIP' }));

  const violations = lintDocs(root);
  const target = 'task/0030-a/progress.md';
  assert.ok(
    reasonsFor(violations, target).some((r) => r.includes('Status が不正')),
    JSON.stringify(violations),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /Status が不正/);
});

test('例4: progress.md の Target Spec が実在しない → 該当パスが列挙され、非 0', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(
    root,
    'task/0030-a/progress.md',
    progressMarkdown({ targetSpec: 'task/0099-nope/spec.md' }),
  );

  const violations = lintDocs(root);
  const target = 'task/0030-a/progress.md';
  assert.ok(
    reasonsFor(violations, target).some((r) => r.includes('Target Spec')),
    JSON.stringify(violations),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /task\/0030-a\/progress\.md/);
});

test('例5: task/0030-a と backlog/0030-b の並存 → ID 重複として両パスが列挙され、非 0', (t) => {
  const root = putValidLayout(makeRoot(t));
  putBacklog(root, '0030-b');

  const violations = lintDocs(root);
  const duplicated = violations.filter((v) => v.reason.includes('ID 重複'));
  assert.deepEqual(paths(duplicated).sort(), ['backlog/0030-b', 'task/0030-a']);

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /ID 重複/);
});

test('例6: backlog に progress.md を置く → 該当パスが列挙され、非 0', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'backlog/0032-c/progress.md', progressMarkdown({ name: '0032-c' }));

  const violations = lintDocs(root);
  const target = 'backlog/0032-c/progress.md';
  assert.ok(paths(violations).includes(target), JSON.stringify(violations));
  assert.ok(
    reasonsFor(violations, target).some((r) => r.includes('progress.md')),
    JSON.stringify(violations),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /backlog\/0032-c\/progress\.md/);
});

test('例7: npm run ci が lint:docs を実行する', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['lint:docs'], /loop-core\/bin\/loop\.mjs lint-docs/);
  assert.match(pkg.scripts.ci, /\blint:docs\b/);
});

// --- 失敗時 ---

test('失敗時: 対象ディレクトリを読めない → 理由を出力して非 0', (t) => {
  const root = makeRoot(t);
  // task/ が無い＝対象ディレクトリの読み取りに失敗する
  assert.throws(() => lintDocs(root));

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /読み取りに失敗/);
});

// --- 仕様の残りの規則 ---

test('progress.md のメタ情報が欠けていれば違反', (t) => {
  for (const key of METADATA_KEYS) {
    const root = putValidLayout(makeRoot(t));
    write(root, 'task/0030-a/progress.md', progressMarkdown({ omit: [key] }));
    const reasons = reasonsFor(lintDocs(root), 'task/0030-a/progress.md');
    assert.ok(reasons.some((r) => r.includes(key)), `${key}: ${JSON.stringify(reasons)}`);
  }
});

test('progress.md が無ければ違反', (t) => {
  const root = putValidLayout(makeRoot(t));
  fs.rmSync(path.join(root, 'task/0030-a/progress.md'));
  const reasons = reasonsFor(lintDocs(root), 'task/0030-a/progress.md');
  assert.ok(reasons.some((r) => r.includes('無い')), JSON.stringify(reasons));
});

test('spec.md が無ければ違反', (t) => {
  const root = putValidLayout(makeRoot(t));
  fs.rmSync(path.join(root, 'task/0030-a/spec.md'));
  const violations = lintDocs(root);
  assert.ok(paths(violations).includes('task/0030-a/spec.md'), JSON.stringify(violations));
});

test('Status は 4 つの値だけを許す', (t) => {
  for (const status of STATUS_VALUES) {
    const root = putValidLayout(makeRoot(t));
    write(root, 'task/0030-a/progress.md', progressMarkdown({ status }));
    assert.deepEqual(lintDocs(root), [], status);
  }
});

test('Complexity は S / M / L を許す', (t) => {
  for (const complexity of COMPLEXITY_VALUES) {
    const root = putValidLayout(makeRoot(t));
    write(root, 'task/0030-a/progress.md', progressMarkdown({ complexity }));
    assert.deepEqual(lintDocs(root), [], complexity);
  }
});

test('Complexity が無い進捗（既存分）は違反にしない', (t) => {
  const root = putValidLayout(makeRoot(t));
  const md = progressMarkdown();
  assert.equal(/Complexity/.test(md), false);
  write(root, 'task/0030-a/progress.md', md);
  assert.deepEqual(lintDocs(root), []);
});

test('Complexity が S / M / L 以外なら違反', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/0030-a/progress.md', progressMarkdown({ complexity: 'XL' }));

  const violations = lintDocs(root);
  const target = 'task/0030-a/progress.md';
  assert.ok(
    reasonsFor(violations, target).some((r) => r.includes('Complexity が不正')),
    JSON.stringify(violations),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /Complexity が不正/);
});

test('Status はバッククォート無しでも Phase 無しでも読める', (t) => {
  const root = putValidLayout(makeRoot(t));
  const md = progressMarkdown().replace(
    /- \*\*Status:\*\*.*/,
    '- **Status:** Done',
  );
  write(root, 'task/0030-a/progress.md', md);
  assert.deepEqual(lintDocs(root), []);
});

test('チェックボックスは [ ] / [/] / [x] だけを許す', (t) => {
  for (const checkbox of ['[ ]', '[/]', '[x]']) {
    const root = putValidLayout(makeRoot(t));
    write(root, 'task/0030-a/progress.md', progressMarkdown({ checkbox }));
    assert.deepEqual(lintDocs(root), [], checkbox);
  }
  for (const checkbox of ['[X]', '[-]', '[]']) {
    const root = putValidLayout(makeRoot(t));
    write(root, 'task/0030-a/progress.md', progressMarkdown({ checkbox }));
    const reasons = reasonsFor(lintDocs(root), 'task/0030-a/progress.md');
    assert.ok(reasons.some((r) => r.includes('チェックボックス')), `${checkbox}: ${reasons}`);
  }
});

test('backlog の完了条件は「未確定」の 1 行で始まる', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'backlog/0032-c/spec.md', specMarkdown({ title: '0032-c' }));
  const reasons = reasonsFor(lintDocs(root), 'backlog/0032-c/spec.md');
  assert.ok(reasons.some((r) => r.includes('未確定')), JSON.stringify(reasons));
});

test('backlog の spec.md も見出し規則は task と同じ', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'backlog/0032-c/spec.md', specMarkdown({ title: '0032-c', backlog: true, omit: ['例'] }));
  const reasons = reasonsFor(lintDocs(root), 'backlog/0032-c/spec.md');
  assert.ok(reasons.some((r) => r.includes('見出し不一致')), JSON.stringify(reasons));
});

test('ディレクトリ名は NNNN-slug でなければ違反', (t) => {
  const root = putValidLayout(makeRoot(t));
  putTask(root, 'no-id');
  const reasons = reasonsFor(lintDocs(root), 'task/no-id');
  assert.ok(reasons.some((r) => r.includes('ディレクトリ名')), JSON.stringify(reasons));
});

const WIDE_SLUG_NAMES = ['0026-api_v2', '0026-v1.2', '0026-日本語', '0026-Mixed-Case'];

test('matchWorkDirName: slug の文字種は絞らない（選択側・アーカイブ側と同じ広さにする）', () => {
  // tools/start-task.mjs は `^(\d{4})-(.+)$` を作業として選び、
  // tools/archive.mjs は `^\d{4}-[^/\\]+$` をアーカイブする。
  // ここで絞ると「選べてアーカイブもできるのに lint だけ落ちる」作業が生まれ、
  // そのリポジトリの全 PR が緑にならなくなる。
  for (const name of WIDE_SLUG_NAMES) {
    assert.ok(matchWorkDirName(name), name);
    assert.equal(matchWorkDirName(name)[1], '0026', name);
  }
  // 緩めたのは文字種だけ。型・パス区切り・前後空白は引き続き拒む
  assert.equal(matchWorkDirName('TEMPLATE-spec'), null);
  assert.equal(matchWorkDirName('0026-a/b'), null);
  assert.equal(matchWorkDirName('0026-a\\b'), null);
  assert.equal(matchWorkDirName(' 0026-a'), null);
  assert.equal(matchWorkDirName('0026-a '), null);
  assert.equal(matchWorkDirName('0026-'), null);
});

test('文字種の広い slug の作業ディレクトリは lint を通る', (t) => {
  for (const name of WIDE_SLUG_NAMES) {
    const root = putValidLayout(makeRoot(t));
    putTask(root, name);
    assert.deepEqual(lintDocs(root), [], name);
  }
});

test('task と task/archive の間でも ID 重複を見る', (t) => {
  const root = putValidLayout(makeRoot(t));
  putTask(root, '0030-dup', { archived: true, status: 'Done' });
  const duplicated = lintDocs(root).filter((v) => v.reason.includes('ID 重複'));
  assert.deepEqual(paths(duplicated).sort(), ['task/0030-a', 'task/archive/0030-dup']);
});

test('# 見出しが 2 つある spec.md は違反', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/0030-a/spec.md', `${specMarkdown({ title: '0030-a' })}\n# 余分な見出し\n`);
  const reasons = reasonsFor(lintDocs(root), 'task/0030-a/spec.md');
  assert.ok(reasons.some((r) => r.includes('見出し不一致')), JSON.stringify(reasons));
});

test('コードフェンス内の # は見出しとして数えない', (t) => {
  const root = putValidLayout(makeRoot(t));
  const extra = '\n```\n# これはコメント\n## これも\n```\n';
  write(root, 'task/0030-a/spec.md', specMarkdown({ title: '0030-a', extra }));
  assert.deepEqual(lintDocs(root), []);
});

test('コードフェンス内に貼ったコマンド出力は文書構造として読まない', (t) => {
  const root = putValidLayout(makeRoot(t));
  // CLAUDE.md「報告の作法」が要求するとおり、progress にはコマンド出力を貼る。
  // その中の `- **Status:** …`・`- [X] …`・`#` は進捗のメタ情報でもチェックでもない
  const pasted = [
    '',
    '```',
    '- **Status:** WIP',
    '- **Target Spec:** `task/0099-nope/spec.md`',
    '- [X] 出力の中のチェック',
    '# 出力の中の見出し',
    '```',
    '',
  ].join('\n');
  write(root, 'task/0030-a/progress.md', progressMarkdown() + pasted);
  assert.deepEqual(lintDocs(root), []);
});

test('コードフェンス内の「完了条件」節は backlog 判定に使わない', (t) => {
  const root = putValidLayout(makeRoot(t));
  const extra = ['', '```', '## 完了条件', '', 'これは出力の一部である。', '```', ''].join('\n');
  write(root, 'backlog/0032-c/spec.md', specMarkdown({ title: '0032-c', backlog: true, extra }));
  assert.deepEqual(lintDocs(root), []);
});

test('テンプレートと旧レイアウトは検証しない', (t) => {
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/TEMPLATE-spec.md', '# 壊れた型\n\n## 存在しない見出し\n');
  write(root, 'specs/TEMPLATE.md', '# 壊れた旧型\n\n## 存在しない見出し\n');
  write(root, 'progress/archive/old.md', '- **Status:** WIP\n');
  assert.deepEqual(lintDocs(root), []);
});

// --- 移行前の例外 ---

test('PR 行を欠く例外は列挙した 2 ファイルだけで、他は違反になる', (t) => {
  assert.deepEqual([...LEGACY_PROGRESS_WITHOUT_PR].sort(), [
    'task/archive/0001-math-add/progress.md',
    'task/archive/0002-math-sub/progress.md',
  ]);

  // 同じ形でも別パスなら違反する（例外が横に広がらないこと）
  const root = putValidLayout(makeRoot(t));
  write(root, 'task/archive/0031-b/progress.md', progressMarkdown({
    name: '0031-b',
    targetSpec: 'task/archive/0031-b/spec.md',
    status: 'Done',
    omit: ['PR'],
  }));
  const reasons = reasonsFor(lintDocs(root), 'task/archive/0031-b/progress.md');
  assert.ok(reasons.some((r) => r.includes('PR')), JSON.stringify(reasons));
});

// --- 純関数 ---

test('extractHeadings は水準と本文を返す', () => {
  assert.deepEqual(extractHeadings('# a\n\n本文\n\n## b\n### c\n'), [
    { level: 1, text: 'a' },
    { level: 2, text: 'b' },
    { level: 3, text: 'c' },
  ]);
});

test('parseMetadata は最初の定義を採る', () => {
  const meta = parseMetadata('- **PR:** `未作成`\n- **PR:** `後勝ちにしない`\n');
  assert.equal(meta.get('PR'), '`未作成`');
});

test('normalizeStatus はバッククォートと Phase を落とす', () => {
  assert.equal(normalizeStatus('`In Progress` (Phase: `Implement`)'), 'In Progress');
  assert.equal(normalizeStatus('Done'), 'Done');
  assert.equal(normalizeStatus('`Done`'), 'Done');
});

test('findBadCheckboxes はリンク記法を拾わない', () => {
  assert.deepEqual(findBadCheckboxes('- [x] ok\n- [説明](https://example.test)\n'), []);
  assert.deepEqual(
    findBadCheckboxes('- [X] ng\n').map((c) => c.token),
    ['[X]'],
  );
});

test('linesOutsideFences はフェンスの中を落とし、行番号は元のまま返す', () => {
  const md = ['外1', '```sh', '中', '```', '外2', '~~~', '中2', '~~~', '外3'].join('\n');
  assert.deepEqual(linesOutsideFences(md), [
    { number: 1, text: '外1' },
    { number: 5, text: '外2' },
    { number: 9, text: '外3' },
  ]);
});

test('フェンス内はメタ情報・チェックボックス・完了条件の走査から外れる', () => {
  const fenced = '```\n- **PR:** `フェンスの中`\n- [X] フェンスの中\n```\n';
  assert.equal(parseMetadata(`${fenced}- **PR:** \`未作成\`\n`).get('PR'), '`未作成`');
  assert.deepEqual(findBadCheckboxes(fenced), []);
  assert.deepEqual(
    checkBacklogCompletion(`## 完了条件\n\n${BACKLOG_INCOMPLETE_LINE}\n\n\`\`\`\n## 完了条件\n\n別物\n\`\`\`\n`),
    [],
  );
});
