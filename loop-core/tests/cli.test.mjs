import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseLoopArgs, USAGE } from '../bin/loop.mjs';
import { installCore } from '../install.mjs';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(CORE_ROOT, 'bin', 'loop.mjs');

function runLoop(cwd, args, extraEnv = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('parseLoopArgs: help とコマンドを分ける', () => {
  assert.deepEqual(parseLoopArgs(['--help']), { command: null, args: [], help: true });
  assert.deepEqual(parseLoopArgs(['start-task', '--next-id']), {
    command: 'start-task',
    args: ['--next-id'],
    help: false,
  });
});

test('USAGE は CLI 入口を示す', () => {
  assert.match(USAGE, /loop-core\/bin\/loop\.mjs/);
});

test('マニフェストが無いリポジトリで start-task は何も書かず非 0', () => {
  const dir = tmpDir('loop-cli-nomf-');
  try {
    const before = fs.readdirSync(dir);
    const r = runLoop(dir, ['start-task']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /マニフェストが無い|loop\.manifest\.json/);
    assert.deepEqual(fs.readdirSync(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('マニフェストが無いリポジトリで任意のゲートコマンドも非 0・無書き込み', () => {
  const dir = tmpDir('loop-cli-nomf-gate-');
  try {
    const before = fs.readdirSync(dir);
    const r = runLoop(dir, ['check-protected-paths', 'HEAD']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /マニフェストが無い|loop\.manifest\.json/);
    assert.deepEqual(fs.readdirSync(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('task/ とテンプレが無いリポジトリで start-task は欠けを列挙して非 0', () => {
  const dir = tmpDir('loop-cli-nostruct-');
  try {
    fs.writeFileSync(
      path.join(dir, 'loop.manifest.json'),
      `${JSON.stringify({
        install: { argv: ['true'] },
        verify: { command: 'true', definedIn: ['loop.manifest.json'] },
        protectedPaths: ['loop.manifest.json'],
      })}\n`,
    );
    const before = new Set(fs.readdirSync(dir));
    const r = runLoop(dir, ['start-task']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /構造がありません/);
    assert.match(r.stderr, /task\//);
    assert.match(r.stderr, /TEMPLATE-spec/);
    assert.match(r.stderr, /TEMPLATE-progress/);
    const after = fs.readdirSync(dir);
    assert.deepEqual(after.filter((n) => !before.has(n)), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('パッケージマネージャ無しの木へ install でき、CLI が npm 無しで起動する', () => {
  const dest = tmpDir('loop-cli-install-');
  try {
    assert.equal(fs.existsSync(path.join(dest, 'package.json')), false);
    const result = installCore(dest, { layer: 'all', source: CORE_ROOT });
    assert.equal(result.ok, true);
    const installed = path.join(dest, 'loop-core', 'bin', 'loop.mjs');
    assert.equal(fs.existsSync(installed), true);
    const help = spawnSync(process.execPath, [installed, '--help'], {
      cwd: dest,
      encoding: 'utf8',
    });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /loop-core\/bin\/loop\.mjs/);
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
});
