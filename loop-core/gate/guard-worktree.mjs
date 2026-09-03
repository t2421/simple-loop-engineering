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
 * ただし**黙って**無効化はしない。想定外で素通りしたときは理由を stderr に 1 行出す。
 * ガードが効いていないことに気づけないのが、いちばん悪い失敗の仕方である。
 *
 * 手動実行: `echo '{"tool_input":{"file_path":"..."}}' | node tools/guard-worktree.mjs`
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  IMPLEMENTATION_DIR_NAMES,
  WORKTREES_DIR as LAYOUT_WORKTREES_DIR,
} from '../lib/layout.mjs';
import { blockImplementationMessage } from '../lib/messages.mjs';

/** worktree を置くディレクトリ。ここから下はプライマリでの編集ではない */
export const WORKTREES_DIR = LAYOUT_WORKTREES_DIR;

/** worktree で編集すべき実装のディレクトリ */
export const IMPLEMENTATION_DIRS = [...IMPLEMENTATION_DIR_NAMES];

/** ブロックの終了コード。Claude Code はこれを見て stderr をセッションへ戻す */
export const BLOCK_EXIT_CODE = 2;

/**
 * ブロック時に stderr へ出す文言を組む純関数。
 *
 * @param {string} filePath - ブロックした対象
 * @returns {string}
 */
export function blockMessage(filePath) {
  return blockImplementationMessage(filePath);
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
 * ファイルシステムを見ない。symlink の解決（`realPathOrSelf`）は呼び出し側の
 * 責任で、両引数に同じ解決を掛けてから渡す。
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
 * 実在する最も深い祖先まで symlink を解決し、残りの部分を継ぎ足す。
 *
 * `fs.realpathSync` は存在しないパスで投げる。Write は「まだ無いファイル」に
 * 対しても走るので、そのまま使えない。ルート側だけ解決して対象側を素通しにすると、
 * symlink 経由のパス（`/tmp/...` → `/private/tmp/...` など）が全部 `outside-repo`
 * になり、ガードが無言で無効化される。両側を同じ関数に通して揃える。
 *
 * @param {string} target - 絶対パス
 * @returns {string} 解決後の絶対パス。解決できない部分は与えられたまま残す
 */
export function realPathOrSelf(target) {
  const absolute = path.resolve(target);
  let current = absolute;
  const rest = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...rest);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      rest.unshift(path.basename(current));
      current = parent;
    }
  }
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
    if (out === '') {
      warnFailOpen('git がリポジトリのルートを返しませんでした');
      return undefined;
    }
    return realPathOrSelf(resolvePrimaryRoot(out));
  } catch (err) {
    warnFailOpen(`リポジトリのルートを特定できません: ${err.message}`);
    return undefined;
  }
}

/**
 * 素通りさせた理由を stderr に 1 行出す。ブロックはしない（fail-open）。
 *
 * @param {string} reason
 */
function warnFailOpen(reason) {
  console.error(`guard-worktree: ガードを適用せず通過させます（${reason}）`);
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (err) {
    // stdin が読めない（対話起動など）。ブロックしないが、黙ってはいない
    warnFailOpen(`stdin を読めません: ${err.message}`);
    return;
  }

  const filePath = readFilePath(raw);
  if (filePath === undefined) return;

  const rootDir = primaryRoot();
  const resolved =
    rootDir === undefined ? filePath : realPathOrSelf(path.resolve(rootDir, filePath));

  const { blocked } = classifyEdit({ filePath: resolved, rootDir });
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
