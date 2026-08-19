import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  matchesE2ePath,
  e2eNeeded,
  pathsFromChanges,
  resolveNeeded,
} from '../tools/e2e-needed.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('差分が tools/archive.mjs だけなら e2e は不要', () => {
  assert.equal(e2eNeeded(['tools/archive.mjs']), false);
});

test('差分が src/calc.css を含むなら e2e が要る', () => {
  assert.equal(matchesE2ePath('src/calc.css'), true);
  assert.equal(e2eNeeded(['task/0017-guard-task-paths/spec.md', 'src/calc.css']), true);
});

test('差分が src/math.mjs を含むなら e2e が要る', () => {
  assert.equal(matchesE2ePath('src/math.mjs'), true);
  assert.equal(e2eNeeded(['src/math.mjs']), true);
});

test('差分が tests/calc-page.test.mjs を含むなら e2e が要る', () => {
  assert.equal(matchesE2ePath('tests/calc-page.test.mjs'), true);
  assert.equal(e2eNeeded(['tests/calc-page.test.mjs']), true);
});

test('差分が tests/add.test.mjs だけなら e2e は不要', () => {
  assert.equal(e2eNeeded(['tests/add.test.mjs']), false);
});

test('差分が package.json を含むなら e2e が要る', () => {
  assert.equal(matchesE2ePath('package.json'), true);
  assert.equal(e2eNeeded(['package.json']), true);
});

test('差分が task/archive/0003-calc-page/calc-page.png を含むなら e2e が要る', () => {
  assert.equal(matchesE2ePath('task/archive/0003-calc-page/calc-page.png'), true);
  assert.equal(e2eNeeded(['task/archive/0003-calc-page/calc-page.png']), true);
});

test('差分が task/0017-guard-task-paths/spec.md だけなら e2e は不要', () => {
  assert.equal(e2eNeeded(['task/0017-guard-task-paths/spec.md']), false);
});

test('移動は移動元も見るので src/ から外へ出しても e2e が要る', () => {
  const paths = pathsFromChanges([
    { status: 'R', path: 'docs/calc.css', oldPath: 'src/calc.css' },
  ]);
  assert.equal(e2eNeeded(paths), true);
});

test('base ref が無いときは usage エラー', () => {
  const result = resolveNeeded({ baseRef: undefined, execGit: () => '' });
  assert.deepEqual(result, { needed: null, error: 'usage' });
});

test('CLI に base ref が無いと終了コード非 0 で使い方を出す', () => {
  const result = spawnSync(process.execPath, [path.join(rootDir, 'tools/e2e-needed.mjs')], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /使い方:/);
});

test('差分が取れないときは間引かず needed=true', () => {
  const result = resolveNeeded({
    baseRef: 'origin/main',
    execGit: () => {
      throw new Error('shallow clone');
    },
  });
  assert.deepEqual(result, { needed: true, error: 'diff' });
});
