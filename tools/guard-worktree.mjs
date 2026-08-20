/**
 * プライマリチェックアウトでの実装ファイル編集をブロックする PreToolUse hook。
 *
 * CLAUDE.md の「実装は worktree で行う」を、規律ではなく機構で強制する。
 * Claude Code が Write / Edit の直前に stdin の JSON でこのスクリプトを呼ぶ。
 * ブロックするときだけ終了コード 2 で終わり、stderr の内容がセッションへ戻る。
 *
 * ## 判定
 *
 * リポジトリのルート（＝プライマリチェックアウト）から見た相対パスで決める。
 *
 * - `.worktrees/` 配下          → 通過（worktree での作業）
 * - `src/` `tests/` `tools/` 配下 → ブロック（プライマリでの実装）
 * - それ以外                     → 通過（spec・progress・ルール・CI 設定）
 *
 * ルートは `git rev-parse --git-common-dir` から求める。worktree の中から
 * 呼ばれてもプライマリの `.git` を指すので、同じ 1 つの基準で判定できる。
 *
 * ## fail-open
 *
 * stdin が読めない・JSON にならない・`file_path` が無い・ルートが分からない、
 * のいずれでもブロックしない。誤爆で docs 作業を止めるより素通りを許す。
 * ガードの本丸は CI 側（`.github/workflows/guard.yml`）にある。
 *
 * 手動実行: `echo '{"tool_input":{"file_path":"..."}}' | node tools/guard-worktree.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** worktree を置くディレクトリ。ここから下はプライマリでの編集ではない */
export const WORKTREES_DIR = '.worktrees';

/** worktree で編集すべき実装のディレクトリ */
export const IMPLEMENTATION_DIRS = ['src', 'tests', 'tools'];

/** ブロックの終了コード。Claude Code はこれを見て stderr をセッションへ戻す */
export const BLOCK_EXIT_CODE = 2;

/**
 * ブロック時に stderr へ出す文言を組む純関数。
 *
 * @param {string} filePath - ブロックした対象
 * @returns {string}
 */
export function blockMessage(filePath) {
  return [
    `プライマリチェックアウトの実装ファイルは編集できません: ${filePath}`,
    '実装は worktree で行う。`node tools/start-task.mjs` で開始する。',
  ].join('\n');
}

/**
 * hook の stdin（JSON）から `tool_input.file_path` を読む純関数。
 * 解析できない・無い・文字列でないときは undefined を返す（ブロックしない）。
 *
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function readFilePath(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (payload === null || typeof payload !== 'object') return undefined;
  const filePath = payload.tool_input?.file_path;
  return typeof filePath === 'string' && filePath !== '' ? filePath : undefined;
}

/**
 * `git rev-parse --path-format=absolute --git-common-dir` の出力から
 * プライマリチェックアウトのルートを求める純関数。
 *
 * worktree の中で実行しても共通の `.git` を指すので、その親がルートになる。
 *
 * @param {string} gitCommonDir
 * @returns {string}
 */
export function resolvePrimaryRoot(gitCommonDir) {
  return path.dirname(gitCommonDir);
}

/**
 * 編集対象のパスを分類する純関数。判定はこの関数だけが持つ。
 *
 * @param {object} input
 * @param {unknown} input.filePath - hook が渡した `tool_input.file_path`
 * @param {unknown} input.rootDir - プライマリチェックアウトのルート（絶対パス）
 * @returns {{blocked: boolean, reason: 'no-file-path'|'no-root'|'outside-repo'|'worktree'|'implementation-in-primary'|'not-implementation'}}
 */
export function classifyEdit({ filePath, rootDir }) {
  if (typeof filePath !== 'string' || filePath === '') {
    return { blocked: false, reason: 'no-file-path' };
  }
  if (typeof rootDir !== 'string' || rootDir === '') {
    return { blocked: false, reason: 'no-root' };
  }

  const relative = path.relative(rootDir, path.resolve(rootDir, filePath));
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { blocked: false, reason: 'outside-repo' };
  }

  const segments = relative.split(path.sep);
  if (segments[0] === WORKTREES_DIR) return { blocked: false, reason: 'worktree' };
  if (IMPLEMENTATION_DIRS.includes(segments[0])) {
    return { blocked: true, reason: 'implementation-in-primary' };
  }
  return { blocked: false, reason: 'not-implementation' };
}

/**
 * プライマリチェックアウトのルートを実行時に求める。求まらなければ undefined。
 *
 * @returns {string | undefined}
 */
function primaryRoot() {
  try {
    const out = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out === '') return undefined;
    return fs.realpathSync(resolvePrimaryRoot(out));
  } catch {
    return undefined;
  }
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    // stdin が読めない（対話起動など）。ブロックしない
    return;
  }

  const filePath = readFilePath(raw);
  if (filePath === undefined) return;

  const { blocked } = classifyEdit({ filePath, rootDir: primaryRoot() });
  if (!blocked) return;

  console.error(blockMessage(filePath));
  process.exit(BLOCK_EXIT_CODE);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  try {
    main();
  } catch (err) {
    // hook 自体の障害で作業を止めない（fail-open）
    console.error(`guard-worktree: ${err.message}`);
  }
}
