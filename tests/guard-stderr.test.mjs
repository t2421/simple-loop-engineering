/**
 * `0027-guard-stderr-noise` の回帰テスト。
 *
 * base に `task/archive` が無いとき、`readBaseArchivedIds` の git 呼び出しが失敗し、
 * catch が空集合として正しく続行する。判定と終了コードは正しいが、git の stderr が
 * 親へ素通しなので `fatal: Not a valid object name …:task/archive` が CI ログに出て
 * 失敗と誤読される。表示だけを抑止したことを、実際にガードを実行して確かめる。
 *
 * 凍結済みの `tests/protected-paths.test.mjs` には触れず、新しいファイルに置く。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeManifest } from './manifest-fixture.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = path.join(repoRoot, 'tools', 'check-protected-paths.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * base に `task/archive` が無いリポジトリを作る。
 * main に package.json（scripts の読み取りに要る）だけを置き、feat で無害な変更を 1 つ加える。
 */
function makeRepoWithoutArchive(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-stderr-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  git(dir, 'init', '-q', '.');
  git(dir, 'config', 'user.email', 'test@example.test');
  git(dir, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"ci":"echo ci"}}\n');
  writeManifest(dir);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'base');
  git(dir, 'branch', '-M', 'main');

  git(dir, 'checkout', '-qb', 'feat');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'x\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'change');
  return dir;
}

test('例 1: base に task/archive が無くても stderr に fatal: が出ない', (t) => {
  const dir = makeRepoWithoutArchive(t);
  const run = spawnSync(process.execPath, [CHECKER, 'main'], { cwd: dir, encoding: 'utf8' });

  assert.equal(run.status, 0, `終了コードは 0 のまま: ${run.stderr}`);
  assert.match(run.stdout, /保護パスの変更はありません/);
  assert.ok(!/fatal:/.test(run.stderr), `stderr に fatal: が出ない。実際: ${JSON.stringify(run.stderr)}`);
  assert.ok(!/task\/archive/.test(run.stderr), `stderr に task/archive の診断が出ない。実際: ${JSON.stringify(run.stderr)}`);
});

test('抑止したのは表示だけで、判定は変わっていない（アーカイブ済み ID の再利用は検知する）', (t) => {
  const dir = makeRepoWithoutArchive(t);
  // base に task/archive/0001-a を持たせると、head での 0001 再利用は違反になる
  git(dir, 'checkout', '-q', 'main');
  fs.mkdirSync(path.join(dir, 'task', 'archive', '0001-a'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task', 'archive', '0001-a', 'spec.md'), '# a\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'archive 0001');

  git(dir, 'checkout', '-q', 'feat');
  git(dir, 'rebase', '-q', 'main');
  fs.mkdirSync(path.join(dir, 'task', '0001-b'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'task', '0001-b', 'spec.md'), '# b\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'reuse 0001');

  const run = spawnSync(process.execPath, [CHECKER, 'main'], { cwd: dir, encoding: 'utf8' });
  assert.equal(run.status, 1, `ID 再利用は違反として検知する: ${run.stdout}${run.stderr}`);
  // 違反の報告先（stdout / stderr）はこの作業で変えていないので、どちらでもよい
  assert.match(`${run.stdout}${run.stderr}`, /0001/);
});
