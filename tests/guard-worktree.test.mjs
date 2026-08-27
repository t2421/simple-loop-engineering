import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  classifyEdit,
  readFilePath,
  resolvePrimaryRoot,
  blockMessage,
} from '../tools/guard-worktree.mjs';
import { repoManifest } from '../tools/loop-manifest.mjs';
import { implementationFrom } from '../tools/guard-worktree.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardCli = path.join(rootDir, 'tools/guard-worktree.mjs');

/** 判定に使う「プライマリチェックアウト」。テストは git から独立に求める */
const primaryRoot = path.dirname(
  execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim(),
);

/** 判定だけを見る。ルートは固定の文字列でよい（ファイルの存在を見ない純関数） */
// 実装の宣言は**実物のマニフェスト**から採る。ここでのルートは架空のパスなので、
// ファイルシステムからは読めない。純関数に明示的に渡す
const IMPL = implementationFrom(repoManifest());

const ROOT = '/repo';
const at = (rel) => path.join(ROOT, rel);

// --- 例: プライマリチェックアウトで src/math.mjs を Edit → ブロック ---

test('プライマリチェックアウトの src/math.mjs はブロックする', () => {
  assert.deepEqual(classifyEdit({ filePath: at('src/math.mjs'), rootDir: ROOT, implementation: IMPL }), {
    blocked: true,
    reason: 'implementation-in-primary',
  });
});

test('プライマリチェックアウトの tests/ と tools/ もブロックする', () => {
  assert.equal(classifyEdit({ filePath: at('tests/add.test.mjs'), rootDir: ROOT, implementation: IMPL }).blocked, true);
  assert.equal(classifyEdit({ filePath: at('tools/archive.mjs'), rootDir: ROOT, implementation: IMPL }).blocked, true);
});

test('相対パスで渡されてもルート起点で解決してブロックする', () => {
  assert.equal(classifyEdit({ filePath: 'src/calc.css', rootDir: ROOT, implementation: IMPL }).blocked, true);
});

// --- 例: .worktrees/feature/x/src/math.mjs を Edit → 通過 ---

test('.worktrees 配下の実装ファイルは通過させる', () => {
  assert.deepEqual(
    classifyEdit({ filePath: at('.worktrees/feature/x/src/math.mjs'), rootDir: ROOT, implementation: IMPL }),
    { blocked: false, reason: 'worktree' },
  );
});

test('.worktrees 配下なら tests/ と tools/ も通過させる', () => {
  assert.equal(
    classifyEdit({ filePath: at('.worktrees/feature/x/tools/archive.mjs'), rootDir: ROOT, implementation: IMPL }).blocked,
    false,
  );
  assert.equal(
    classifyEdit({ filePath: at('.worktrees/feature/x/tests/add.test.mjs'), rootDir: ROOT, implementation: IMPL }).blocked,
    false,
  );
});

// --- 例: プライマリチェックアウトで task/0022-a/spec.md を Write → 通過 ---

test('task/ の spec は通過させる', () => {
  assert.deepEqual(classifyEdit({ filePath: at('task/0022-a/spec.md'), rootDir: ROOT, implementation: IMPL }), {
    blocked: false,
    reason: 'not-implementation',
  });
});

test('backlog/・specs/・progress/・.claude/・.github/ は通過させる', () => {
  for (const rel of [
    'backlog/0023-b/spec.md',
    'specs/ci-lint.md',
    'progress/ci-lint.md',
    '.claude/settings.json',
    '.github/workflows/ci.yml',
  ]) {
    assert.equal(classifyEdit({ filePath: at(rel), rootDir: ROOT, implementation: IMPL }).blocked, false, rel);
  }
});

// --- 例: プライマリチェックアウトで CLAUDE.md を Edit → 通過 ---

test('CLAUDE.md は通過させる', () => {
  assert.equal(classifyEdit({ filePath: at('CLAUDE.md'), rootDir: ROOT, implementation: IMPL }).blocked, false);
});

test('リポジトリの外のパスは通過させる', () => {
  assert.deepEqual(classifyEdit({ filePath: '/elsewhere/src/math.mjs', rootDir: ROOT, implementation: IMPL }), {
    blocked: false,
    reason: 'outside-repo',
  });
});

// --- 例: file_path の無い入力 → 通過（ブロックしない） ---

test('file_path が無い入力はブロックしない', () => {
  assert.deepEqual(classifyEdit({ filePath: undefined, rootDir: ROOT, implementation: IMPL }), {
    blocked: false,
    reason: 'no-file-path',
  });
  assert.equal(readFilePath(JSON.stringify({ tool_name: 'Edit', tool_input: {} })), undefined);
  assert.equal(readFilePath(JSON.stringify({ tool_name: 'Edit' })), undefined);
});

test('file_path が文字列でない入力はブロックしない', () => {
  assert.equal(readFilePath(JSON.stringify({ tool_input: { file_path: 42 } })), undefined);
  assert.equal(classifyEdit({ filePath: 42, rootDir: ROOT, implementation: IMPL }).blocked, false);
});

test('JSON として解析できない入力はブロックしない', () => {
  assert.equal(readFilePath('not json'), undefined);
  assert.equal(readFilePath(''), undefined);
  assert.equal(readFilePath(undefined), undefined);
});

test('ルートが分からないときはブロックしない', () => {
  assert.deepEqual(classifyEdit({ filePath: at('src/math.mjs'), rootDir: undefined, implementation: IMPL }), {
    blocked: false,
    reason: 'no-root',
  });
});

test('hook の JSON から file_path を読める', () => {
  const raw = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: '/repo/src/math.mjs', old_string: 'a', new_string: 'b' },
  });
  assert.equal(readFilePath(raw), '/repo/src/math.mjs');
});

test('git-common-dir からプライマリチェックアウトを求める', () => {
  assert.equal(resolvePrimaryRoot('/repo/.git'), '/repo');
});

test('ブロックメッセージは worktree での開始手順を示す', () => {
  const message = blockMessage('/repo/src/math.mjs');
  assert.match(message, /worktree/);
  assert.match(message, /tools\/start-task\.mjs/);
  assert.match(message, /\/repo\/src\/math\.mjs/);
});

// --- CLI（hook 実体）としての振る舞い ---

const runGuard = (input) =>
  spawnSync(process.execPath, [guardCli], { cwd: rootDir, input, encoding: 'utf8' });

test('CLI: プライマリチェックアウトの実装ファイルは終了コード 2 でブロックする', () => {
  const result = runGuard(
    JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(primaryRoot, 'src/math.mjs') },
    }),
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /worktree/);
  assert.match(result.stderr, /tools\/start-task\.mjs/);
});

test('CLI: .worktrees 配下の実装ファイルは終了コード 0 で通過させる', () => {
  const result = runGuard(
    JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(primaryRoot, '.worktrees/feature/x/src/math.mjs') },
    }),
  );
  assert.equal(result.status, 0);
});

test('CLI: task/ の spec は終了コード 0 で通過させる', () => {
  const result = runGuard(
    JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: path.join(primaryRoot, 'task/0022-a/spec.md') },
    }),
  );
  assert.equal(result.status, 0);
});

test('CLI: 解析できない stdin はブロックしない（fail-open）', () => {
  const result = runGuard('not json');
  assert.equal(result.status, 0);
});

// --- 宣言は入れ子のパスも表せる（先頭セグメントだけで照合しない） ---
// 同じ宣言を読む進捗結合の検査は prefix 一致で入れ子を扱う。2 実装で意味を食い違わせない。

test('入れ子のディレクトリ・ファイルを宣言してもプライマリではブロックする', () => {
  const nested = { dirs: ['app/src'], files: ['config/tool.mjs'] };
  assert.equal(
    classifyEdit({ filePath: at('app/src/x.mjs'), rootDir: ROOT, implementation: nested }).blocked,
    true,
  );
  assert.equal(
    classifyEdit({ filePath: at('config/tool.mjs'), rootDir: ROOT, implementation: nested }).blocked,
    true,
  );
  assert.equal(
    classifyEdit({ filePath: at('app/docs/x.md'), rootDir: ROOT, implementation: nested }).blocked,
    false,
  );
});

test('宣言そのもの（マニフェスト）もプライマリではブロックする', () => {
  assert.equal(classifyEdit({ filePath: at('loop.manifest.json'), rootDir: ROOT, implementation: IMPL }).blocked, true);
});
