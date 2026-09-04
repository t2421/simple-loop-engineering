/**
 * `tools/check-examples.mjs` と、archive 配線（失敗する評価可能行はアーカイブしない）のテスト。
 *
 * 既存 `tests/archive.test.mjs` は触らない。archive 配線のケースはこのファイルに足す。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  checkExamples,
  classifyRow,
  extractCommand,
  formatReport,
  isAllowedCommand,
  parseSafeCommand,
  parseStdoutInt,
  splitPipelineStages,
} from '../tools/check-examples.mjs';
import { archive } from '../loop-core/ledger/archive.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repoRoot, 'tools', 'check-examples.mjs');

function runCli(name, { cwd = repoRoot } = {}) {
  return spawnSync(process.execPath, [CLI, name], { cwd, encoding: 'utf8' });
}

function makeRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-examples-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function specWithExamples(title, examplesBody) {
  return [
    `# ${title}`,
    '',
    '一文。',
    '',
    '## 種別',
    '',
    '改善',
    '',
    '## 対象',
    '',
    '- 場所: `tools/x.mjs`',
    '',
    '## 背景',
    '',
    '背景。',
    '',
    '## 仕様',
    '',
    '- 仕様。',
    '',
    '## 範囲外',
    '',
    'なし',
    '',
    '## 失敗時',
    '',
    'なし',
    '',
    '## 例',
    '',
    examplesBody,
    '',
    '## 完了条件',
    '',
    '次をすべて満たしたとき、この仕様は完了とする。',
    '',
  ].join('\n');
}

const ARCHIVE_NAME = '0019-bar';

function makeArchiveRepo({
  name = ARCHIVE_NAME,
  spec = `# ${name} の仕様\n`,
  pr = 'https://github.com/t2421/simple-loop-engineering/pull/1',
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-examples-archive-'));
  fs.mkdirSync(path.join(root, 'task', name), { recursive: true });
  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', name, 'spec.md'), spec);
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
  fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-spec.md'), '# 仕様テンプレート\n');
  fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-progress.md'), '# 進捗テンプレート\n');
  return root;
}

const merged = async () => ({ merged: true, headRefName: 'feature/bar' });
const thisRepo = async () => ({ owner: 't2421', repo: 'simple-loop-engineering' });
const ls = (dir) => fs.readdirSync(dir).sort();

// --- spec の「例」（リポジトリルートでの再現） ---

test('grep -c の stdout は 18（0052 の期待。書き換えない）', () => {
  const r = spawnSync('grep', ['-c', '^### 2\\.', '.claude/skills/loop-port/SKILL.md'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.replace(/\n+$/, ''), '18');
});

test('CLI: 0052-loop-port-catalog-revision は終了コード 0。定性行は落とさない', () => {
  const r = runCli('0052-loop-port-catalog-revision');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /検査: task\/archive\/0052-loop-port-catalog-revision\/spec.md/);
  assert.match(r.stdout, /合格:.*grep -c '\^### 2\\\.'/);
  assert.match(r.stdout, /対象外:.*allow-protected-change/);
  assert.match(r.stdout, /対象外:.*git diff/);
  assert.match(r.stdout, /定性的|この順に|解釈しない/);
  assert.doesNotMatch(r.stdout, /^失敗:/m);
});

test('CLI: 0046-ci-evidence-freshness は終了コード 0（定性行は必須にしない）', () => {
  const r = runCli('0046-ci-evidence-freshness');
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /対象外|評価可能な行は 0 件/);
  assert.doesNotMatch(out, /^失敗:/m);
});

test('CLI: 0099-missing は終了コード非 0。ディレクトリが無い旨を出す', () => {
  const r = runCli('0099-missing');
  assert.notEqual(r.status, 0);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /作業ディレクトリがありません/);
  assert.match(out, /0099-missing/);
});

test('incomplete な 0046 型 backlog は対象外と明示して終了コード 0', (t) => {
  const root = makeRoot(t);
  write(
    root,
    'backlog/0046-ci-evidence-freshness/spec.md',
    specWithExamples(
      '実測 CI 結果の鮮度',
      [
        '未確定（incomplete）。昇格時に埋める。',
        '',
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `<昇格時に記入>` | `<昇格時に記入>` |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0046-ci-evidence-freshness', { root });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.incomplete, true);
  const report = formatReport(result);
  assert.match(report, /対象外/);
  assert.match(report, /未確定（incomplete）/);
});

test('評価可能な行が 0 件の spec は検査成功', (t) => {
  const root = makeRoot(t);
  write(root, 'task/0019-bar/spec.md', '# 0019-bar の仕様\n');
  const result = checkExamples('0019-bar', { root });
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.rows, []);
  assert.match(formatReport(result), /評価可能な行は 0 件です（検査成功）/);
});

test('定性行はスキップし、整数行の不一致だけ失敗する', (t) => {
  const root = makeRoot(t);
  write(
    root,
    'task/0061-eval/spec.md',
    specWithExamples(
      '検査',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `echo 18` | `18` |',
        '| `echo 1` | 5 行。この順に a / b / c |',
        '| `echo 4` | `3` 以上 |',
        '| 手順文だけ | 何かをする |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-eval', { root });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.rows.filter((r) => r.status === 'pass').length, 1);
  assert.equal(result.rows.filter((r) => r.status === 'skip').length, 3);
  assert.equal(result.rows.filter((r) => r.status === 'fail').length, 0);
});

test('CLI: stdout 不一致は非 0 でどの行かを示し、期待値は書き換えない', (t) => {
  const root = makeRoot(t);
  const spec = specWithExamples(
    '検査',
    [
      '| 操作または入力 | 期待結果 |',
      '|---|---|',
      '| `echo 99` | `0` |',
    ].join('\n'),
  );
  write(root, 'task/0061-mismatch/spec.md', spec);
  const r = runCli('0061-mismatch', { cwd: root });
  assert.notEqual(r.status, 0);
  const out = `${r.stdout}${r.stderr}`;
  assert.match(out, /echo 99/);
  assert.match(out, /期待: "0"/);
  assert.match(out, /実際: "99"/);
  assert.equal(fs.readFileSync(path.join(root, 'task/0061-mismatch/spec.md'), 'utf8'), spec);
});

test('stdout 不一致は終了コード非 0。どの行かを示し、期待値は書き換えない', (t) => {
  const root = makeRoot(t);
  const spec = specWithExamples(
    '検査',
    [
      '| 操作または入力 | 期待結果 |',
      '|---|---|',
      '| `echo 99` | `0` |',
    ].join('\n'),
  );
  write(root, 'task/0061-mismatch/spec.md', spec);
  const result = checkExamples('0061-mismatch', { root });
  assert.equal(result.ok, false);
  assert.match(result.reason, /stdout が期待と違います/);
  assert.match(result.reason, /期待: "0"/);
  assert.match(result.reason, /実際: "99"/);
  assert.equal(fs.readFileSync(path.join(root, 'task/0061-mismatch/spec.md'), 'utf8'), spec);
});

test('終了コード 0 / 非 0 の行を評価する', (t) => {
  const root = makeRoot(t);
  write(
    root,
    'task/0061-exit/spec.md',
    specWithExamples(
      '検査',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `true` | 終了コード 0 |',
        '| `false` | 終了コード非 0 |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-exit', { root });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.rows.filter((r) => r.status === 'pass').length, 2);
});

test('classifyRow: git diff と定性は skip、整数は stdout-int', () => {
  assert.equal(classifyRow('手順', '18').kind, 'skip');
  assert.equal(
    classifyRow('`git diff main...HEAD -- a \\| grep -c`', '`0`（削除行なし）').kind,
    'skip',
  );
  assert.equal(parseStdoutInt('`3` 以上（変更前は `2`）'), null);
  assert.equal(parseStdoutInt('5 行。この順に a / b'), null);
  assert.equal(parseStdoutInt('`18`'), '18');
  assert.equal(parseStdoutInt('stdout が `18`。終了コード 0'), '18');
  assert.equal(classifyRow('`echo 1`', '終了コード 0').kind, 'zero-exit');
  assert.equal(classifyRow('`echo 1`', '終了コード非 0。ディレクトリが無い旨を出す').kind, 'nonzero-exit');
});

test('extractCommand: 引用符の外の \\| だけをパイプに戻す', () => {
  const cmd = extractCommand(
    "`grep -n '^### 2\\.\\(1[0-3]\\|[1-9]\\) ' file \\| wc -l`",
  );
  assert.equal(cmd, "grep -n '^### 2\\.\\(1[0-3]\\|[1-9]\\) ' file | wc -l");
});

test('parseSafeCommand: grep と grep|wc は argv になり、危険なトークンは拒否する', () => {
  const grep = parseSafeCommand("grep -c '^### 2\\.' .claude/skills/loop-port/SKILL.md");
  assert.equal(grep.ok, true);
  assert.deepEqual(grep.pipeline, [
    { file: 'grep', args: ['-c', '^### 2\\.', '.claude/skills/loop-port/SKILL.md'] },
  ]);
  const piped = parseSafeCommand("grep -n '^### 2\\.\\(1[0-3]\\|[1-9]\\) ' file | wc -l");
  assert.equal(piped.ok, true);
  assert.deepEqual(piped.pipeline, [
    { file: 'grep', args: ['-n', '^### 2\\.\\(1[0-3]\\|[1-9]\\) ', 'file'] },
    { file: 'wc', args: ['-l'] },
  ]);
  assert.equal(parseSafeCommand('echo 1; rm -rf /').ok, false);
  assert.equal(parseSafeCommand('echo 1 && echo 2').ok, false);
  assert.equal(parseSafeCommand('echo hi > pwned').ok, false);
  assert.equal(parseSafeCommand('echo `whoami`').ok, false);
  assert.equal(parseSafeCommand('rm -rf .').ok, false);
  assert.equal(parseSafeCommand('cat /etc/passwd').ok, false);
  assert.equal(parseSafeCommand('/bin/rm -rf .').ok, false);
  assert.equal(parseSafeCommand('node -e "process.exit(0)"').ok, false);
  assert.equal(parseSafeCommand('node tools/check-examples.mjs 0099-missing').ok, true);
  assert.equal(parseSafeCommand('grep -n secret /etc/passwd').ok, false);
  assert.equal(parseSafeCommand('grep -c x ../outside').ok, false);
  assert.equal(parseSafeCommand('echo 1 | | wc -l').ok, false);
  assert.equal(parseSafeCommand('echo 1 |').ok, false);
});

test('isAllowedCommand: grep/wc の絶対パスと .. セグメントを拒否する', () => {
  assert.equal(isAllowedCommand('grep', ['-n', 'secret', '/etc/passwd']), false);
  assert.equal(isAllowedCommand('grep', ['-c', 'x', '../outside']), false);
  assert.equal(isAllowedCommand('grep', ['-c', 'x', 'foo/../bar']), false);
  assert.equal(isAllowedCommand('wc', ['-l', '/etc/passwd']), false);
  assert.equal(isAllowedCommand('grep', ['-c', '^x', '.claude/skills/loop-port/SKILL.md']), true);
  assert.equal(isAllowedCommand('echo', ['/etc/passwd']), true);
});

test('splitPipelineStages: 空のパイプ段は失敗し、黙って落とさない', () => {
  assert.equal(splitPipelineStages('echo 1 | | wc -l').ok, false);
  assert.equal(splitPipelineStages('echo 1 |').ok, false);
  assert.equal(splitPipelineStages('| echo 1').ok, false);
  const ok = splitPipelineStages('echo 1 | wc -l');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.stages, ['echo 1', 'wc -l']);
});

test('危険なコマンドは実行せず拒否する', (t) => {
  const root = makeRoot(t);
  const marker = path.join(root, 'PWNED');
  write(
    root,
    'task/0061-unsafe/spec.md',
    specWithExamples(
      '危険',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `echo pwned > PWNED` | 終了コード 0 |',
        '| `rm -rf PWNED` | 終了コード 0 |',
        '| `echo 1; echo 2` | `2` |',
        '| `echo 1 && echo 2` | `2` |',
        '| `echo 1 \\|\\| echo 2` | `1` |',
        '| `echo 1 \\| rm` | 終了コード 0 |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-unsafe', { root });
  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(marker), false, 'リダイレクトを実行していない');
  assert.equal(result.rows.length, 6);
  for (const row of result.rows) {
    assert.equal(row.status, 'fail', row.input);
    assert.match(row.detail, /許可されていない|危険なトークン/);
  }
});

test('grep の絶対パスと .. は実行せず拒否する', (t) => {
  const root = makeRoot(t);
  const token = `LEAK_${path.basename(root)}`;
  const absLeak = path.join(os.tmpdir(), `${token}.txt`);
  const outsideName = `${token}-outside.txt`;
  const outside = path.join(root, '..', outsideName);
  t.after(() => {
    fs.rmSync(absLeak, { force: true });
    fs.rmSync(outside, { force: true });
  });
  fs.writeFileSync(absLeak, `${token}\n`);
  fs.writeFileSync(outside, `${token}\n`);
  write(
    root,
    'task/0061-paths/spec.md',
    specWithExamples(
      'paths',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        `| \`grep -c ${token} ${absLeak}\` | \`1\` |`,
        `| \`grep -c ${token} ../${outsideName}\` | \`1\` |`,
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-paths', { root });
  assert.equal(result.ok, false);
  assert.equal(result.rows.length, 2);
  for (const row of result.rows) {
    assert.equal(row.status, 'fail', row.input);
    assert.match(row.detail, /リポジトリ外/);
    assert.doesNotMatch(row.detail, /stdout/);
  }
});

test('空のパイプ段は実行せず失敗する', (t) => {
  const root = makeRoot(t);
  write(
    root,
    'task/0061-empty-pipe/spec.md',
    specWithExamples(
      'empty-pipe',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `echo 1 \\| \\| wc -l` | `1` |',
        '| `echo 1 \\|` | 終了コード 0 |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-empty-pipe', { root });
  assert.equal(result.ok, false);
  assert.equal(result.rows.length, 2);
  for (const row of result.rows) {
    assert.equal(row.status, 'fail', row.input);
    assert.match(row.detail, /空のパイプ段/);
  }
});

test('stdout-int で終了コード非 0 のとき stderr を detail に含める', (t) => {
  const root = makeRoot(t);
  write(
    root,
    'task/0061-stderr/spec.md',
    specWithExamples(
      'stderr',
      [
        '| 操作または入力 | 期待結果 |',
        '|---|---|',
        '| `grep -c ^x$ no-such-file` | `0` |',
      ].join('\n'),
    ),
  );
  const result = checkExamples('0061-stderr', { root });
  assert.equal(result.ok, false);
  assert.match(result.reason, /終了コードが 0 ではない/);
  assert.match(result.reason, /stderr:/);
  assert.match(result.reason, /no-such-file|No such file|No such/);
});

// --- archive 配線（既存 tests/archive.test.mjs は触らない） ---

test('評価可能な「例」が失敗している作業はアーカイブせず何も変更しない', async () => {
  const spec = specWithExamples(
    '失敗する例',
    ['| 操作または入力 | 期待結果 |', '|---|---|', '| `echo 99` | `0` |'].join('\n'),
  );
  const root = makeArchiveRepo({ spec });
  try {
    const result = await archive(ARCHIVE_NAME, { root, checkPr: merged, getRepo: thisRepo });
    assert.equal(result.ok, false);
    assert.match(result.reason, /「例」の検査が失敗しました/);
    assert.match(result.reason, /stdout が期待と違います/);
    assert.ok(fs.existsSync(path.join(root, 'task', ARCHIVE_NAME, 'spec.md')), '移動していない');
    assert.deepEqual(ls(path.join(root, 'task/archive')), []);
    const untouched = fs.readFileSync(path.join(root, 'task', ARCHIVE_NAME, 'progress.md'), 'utf8');
    assert.match(untouched, /^- \*\*Status:\*\* `In Progress`/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('評価可能な行が 0 件の spec はアーカイブを止めない', async () => {
  const root = makeArchiveRepo();
  try {
    const result = await archive(ARCHIVE_NAME, { root, checkPr: merged, getRepo: thisRepo });
    assert.equal(result.ok, true, result.reason);
    assert.deepEqual(ls(path.join(root, 'task/archive')), [ARCHIVE_NAME]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
