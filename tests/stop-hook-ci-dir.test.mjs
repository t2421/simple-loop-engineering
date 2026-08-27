/**
 * `tools/stop-hook-ci-dir.mjs` のテスト。spec の「例」の各行を網羅する。
 *
 * - 判定の各行: `resolveCiDir` に stdin の中身と `CLAUDE_PROJECT_DIR` を注入する
 * - 配線（git top-level の解決）: 実 git リポジトリに worktree を足して、
 *   スクリプトを実際に起動して確かめる。純関数のテストだけでは配線を検証した
 *   ことにならない
 * - hook コマンド全体: `.claude/settings.json` の Stop hook コマンドをそのまま
 *   実行し、壊れた worktree で CI が失敗すること・スクリプト失敗時に CI を
 *   回さず hook が失敗することを確かめる
 * - ガードの 2 行: `tests/gate-helpers.test.mjs` と同じ判定を呼んで固定する
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCwd, resolveCiDir } from '../tools/stop-hook-ci-dir.mjs';
import { findViolations } from '../tools/check-protected-paths.mjs';
// ループの固有値はマニフェストが唯一の宣言である。テストも実物を使う
import { repoManifest } from '../tools/loop-manifest.mjs';
import { useManifest } from '../tools/check-protected-paths.mjs';
useManifest(repoManifest());

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(rootDir, 'tools', 'stop-hook-ci-dir.mjs');

// --- 純関数: stdin と CLAUDE_PROJECT_DIR を注入して「例」の各行を固定する ---

/** 記録付きの gitTopLevel スタブ。`map` に無い cwd は undefined（git 外） */
function stubGit(map, calls = []) {
  return (cwd) => {
    calls.push(cwd);
    return map[cwd];
  };
}

test('worktree の cwd を与えると worktree のパスを出力する（プライマリではない）', () => {
  const wt = '/repo/.worktrees/feature/x';
  const r = resolveCiDir({
    raw: JSON.stringify({ cwd: wt }),
    gitTopLevel: stubGit({ [wt]: wt }),
    projectDir: '/repo',
  });
  assert.deepEqual(r, { dir: wt });
});

test('プライマリの cwd を与えるとプライマリを出力する', () => {
  const r = resolveCiDir({
    raw: JSON.stringify({ cwd: '/repo' }),
    gitTopLevel: stubGit({ '/repo': '/repo' }),
    projectDir: '/repo',
  });
  assert.deepEqual(r, { dir: '/repo' });
});

test('リポジトリ内の下位ディレクトリは git top-level へ正規化する', () => {
  const r = resolveCiDir({
    raw: JSON.stringify({ cwd: '/repo/src' }),
    gitTopLevel: stubGit({ '/repo/src': '/repo' }),
    projectDir: '/other',
  });
  assert.deepEqual(r, { dir: '/repo' });
});

test('cwd の無い JSON は CLAUDE_PROJECT_DIR を出力する（git は呼ばない）', () => {
  const calls = [];
  const r = resolveCiDir({
    raw: JSON.stringify({ session_id: 'abc' }),
    gitTopLevel: stubGit({}, calls),
    projectDir: '/repo',
  });
  assert.equal(r.dir, '/repo');
  assert.notEqual(r.fallback, undefined);
  assert.deepEqual(calls, []);
});

test('壊れた JSON は CLAUDE_PROJECT_DIR を出力する', () => {
  const r = resolveCiDir({ raw: '{broken', gitTopLevel: stubGit({}), projectDir: '/repo' });
  assert.equal(r.dir, '/repo');
  assert.notEqual(r.fallback, undefined);
});

test('cwd が git リポジトリ外なら CLAUDE_PROJECT_DIR を出力する', () => {
  const r = resolveCiDir({
    raw: JSON.stringify({ cwd: '/not-a-repo' }),
    gitTopLevel: stubGit({}),
    projectDir: '/repo',
  });
  assert.equal(r.dir, '/repo');
  assert.notEqual(r.fallback, undefined);
});

test('CLAUDE_PROJECT_DIR が未設定で cwd も使えないなら error になる（推測で出力しない）', () => {
  for (const projectDir of [undefined, '']) {
    const r = resolveCiDir({ raw: '{broken', gitTopLevel: stubGit({}), projectDir });
    assert.equal('dir' in r, false);
    assert.notEqual(r.error, undefined);
  }
});

test('readCwd は文字列以外・空文字列・非オブジェクトを undefined にする', () => {
  assert.equal(readCwd(undefined), undefined);
  assert.equal(readCwd(''), undefined);
  assert.equal(readCwd('42'), undefined);
  assert.equal(readCwd('null'), undefined);
  assert.equal(readCwd(JSON.stringify({ cwd: 7 })), undefined);
  assert.equal(readCwd(JSON.stringify({ cwd: '' })), undefined);
  assert.equal(readCwd(JSON.stringify({ cwd: '/x' })), '/x');
});

// --- ガードの 2 行: gate-helpers と同じ判定で固定する ---

const emptyDiff = { changes: [], baseScripts: {}, headScripts: {} };

test('tools/stop-hook-ci-dir.mjs を変更した差分はガードが違反として検知する', () => {
  const v = findViolations({
    ...emptyDiff,
    changes: [{ status: 'M', path: 'tools/stop-hook-ci-dir.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'tools/stop-hook-ci-dir.mjs');
});

test('tools/stop-hook-ci-dir.mjs を新規追加した差分はガードの違反にならない（導入 PR）', () => {
  const v = findViolations({
    ...emptyDiff,
    changes: [{ status: 'A', path: 'tools/stop-hook-ci-dir.mjs' }],
  });
  assert.deepEqual(v, []);
});

// --- 配線: 実 git リポジトリ + worktree でスクリプトを起動する ---

/** テスト用の git 実行。ID はリポジトリ設定に依存させない */
function git(cwd, ...args) {
  return execFileSync(
    'git',
    ['-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

/** プライマリ + worktree の一時リポジトリを作る。`files` はコミットに含める */
function makeRepoWithWorktree(files = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-hook-ci-dir-'));
  const primary = path.join(base, 'repo');
  fs.mkdirSync(primary);
  git(primary, 'init', '-q', '-b', 'main');
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(primary, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  fs.writeFileSync(path.join(primary, 'README.md'), 'fixture\n');
  git(primary, 'add', '-A');
  git(primary, 'commit', '-q', '-m', 'init');
  const worktree = path.join(primary, '.worktrees', 'feature', 'x');
  git(primary, 'worktree', 'add', '-q', worktree, '-b', 'feature/x');
  return { base, primary: fs.realpathSync(primary), worktree: fs.realpathSync(worktree) };
}

/** スクリプト本体を起動する。`projectDir` が undefined なら環境変数ごと外す */
function runScript(input, projectDir) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir !== undefined) env.CLAUDE_PROJECT_DIR = projectDir;
  return spawnSync(process.execPath, [SCRIPT], { input, env, encoding: 'utf8' });
}

test('実 git リポジトリ: worktree の cwd で worktree 側のパスが返る', () => {
  const { base, primary, worktree } = makeRepoWithWorktree();
  try {
    const r = runScript(JSON.stringify({ cwd: worktree }), primary);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), worktree);
    assert.notEqual(r.stdout.trim(), primary);

    // 下位ディレクトリは worktree の top-level へ正規化される
    const sub = path.join(worktree, 'sub');
    fs.mkdirSync(sub);
    const r2 = runScript(JSON.stringify({ cwd: sub }), primary);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(r2.stdout.trim(), worktree);

    // プライマリの cwd ならプライマリが返る
    const r3 = runScript(JSON.stringify({ cwd: primary }), primary);
    assert.equal(r3.status, 0, r3.stderr);
    assert.equal(r3.stdout.trim(), primary);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('実行時: git 外の cwd はフォールバック、CLAUDE_PROJECT_DIR も無ければ非 0 で何も出力しない', () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-hook-outside-'));
  try {
    const r = runScript(JSON.stringify({ cwd: outside }), '/project-dir');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), '/project-dir');

    const r2 = runScript(JSON.stringify({ cwd: outside }), undefined);
    assert.notEqual(r2.status, 0);
    assert.equal(r2.stdout, '');
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

// --- hook コマンド全体: .claude/settings.json の Stop hook をそのまま実行する ---

function stopHookCommand() {
  const settings = JSON.parse(
    fs.readFileSync(path.join(rootDir, '.claude', 'settings.json'), 'utf8'),
  );
  const commands = settings.hooks.Stop.flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.equal(commands.length, 1);
  return commands[0];
}

/** hook コマンドを Stop hook と同じ形（stdin に JSON、env に CLAUDE_PROJECT_DIR）で実行 */
function runHook(command, input, projectDir, cwd) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir !== undefined) env.CLAUDE_PROJECT_DIR = projectDir;
  return spawnSync('/bin/sh', ['-c', command], { input, env, encoding: 'utf8', cwd });
}

test('Stop hook はスクリプトの出力先で npm run ci を実行する形になっている', () => {
  const command = stopHookCommand();
  assert.match(command, /stop-hook-ci-dir\.mjs/);
  assert.match(command, /npm run ci/);
});

test('壊れた worktree の cwd を与えると worktree 側で CI が走り hook が失敗する', () => {
  const okCi = 'node -e "require(\'fs\').writeFileSync(\'ci-ran.txt\',\'primary\')"';
  const brokenCi =
    'node -e "require(\'fs\').writeFileSync(\'ci-ran.txt\',\'worktree\');process.exit(1)"';
  const { base, primary, worktree } = makeRepoWithWorktree({
    'package.json': `${JSON.stringify({ name: 'fixture', private: true, scripts: { ci: okCi } }, null, 2)}\n`,
    'tools/stop-hook-ci-dir.mjs': fs.readFileSync(SCRIPT, 'utf8'),
  });
  try {
    // worktree 側だけを壊す（未コミットの変更。これが検証したい状況そのもの）
    fs.writeFileSync(
      path.join(worktree, 'package.json'),
      `${JSON.stringify({ name: 'fixture', private: true, scripts: { ci: brokenCi } }, null, 2)}\n`,
    );

    const r = runHook(stopHookCommand(), JSON.stringify({ cwd: worktree }), primary, primary);
    // worktree の CI が実行され、その失敗が hook の失敗になる
    assert.notEqual(r.status, 0);
    assert.equal(fs.readFileSync(path.join(worktree, 'ci-ran.txt'), 'utf8'), 'worktree');
    // プライマリでは CI が走っていない
    assert.equal(fs.existsSync(path.join(primary, 'ci-ran.txt')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('スクリプトが失敗すると hook は CI を回さずに失敗する（成功扱いにならない）', () => {
  const okCi = 'node -e "require(\'fs\').writeFileSync(\'ci-ran.txt\',\'primary\')"';
  const { base, primary } = makeRepoWithWorktree({
    'package.json': `${JSON.stringify({ name: 'fixture', private: true, scripts: { ci: okCi } }, null, 2)}\n`,
    'tools/stop-hook-ci-dir.mjs': fs.readFileSync(SCRIPT, 'utf8'),
  });
  try {
    // CLAUDE_PROJECT_DIR 無し + 壊れた stdin: スクリプト（の起動）が失敗する状況
    const r = runHook(stopHookCommand(), '{broken', undefined, primary);
    assert.notEqual(r.status, 0);
    // どのチェックアウトでも CI は走っていない
    assert.equal(fs.existsSync(path.join(primary, 'ci-ran.txt')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});
