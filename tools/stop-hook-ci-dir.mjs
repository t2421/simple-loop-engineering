/**
 * Stop hook が CI（`npm run ci`）を回す対象ディレクトリを決めて標準出力に 1 行出す。
 *
 * `.claude/settings.json` の Stop hook はこれまで `$CLAUDE_PROJECT_DIR`（セッションの
 * 起動ルート）で CI を回していた。プライマリで起動して `.worktrees/<ブランチ名>/` で
 * 作業を続けたセッションでは、変更のある worktree ではなくプライマリに対して CI が
 * 走り、worktree 側が壊れていても hook が成功してしまう。緑が出ていることが、
 * 検証された証拠になっていない。
 *
 * ## 判定
 *
 * 1. hook の stdin（JSON）から `cwd` を読む
 * 2. `cwd` で `git rev-parse --show-toplevel` が返すディレクトリを出力する
 *    （worktree の中なら worktree のルートが返る。下位ディレクトリは top-level へ
 *    正規化される）
 * 3. `cwd` が読めない・git リポジトリ外なら `$CLAUDE_PROJECT_DIR` を出力する
 *    （従来の挙動へフォールバック。悪化させない）
 * 4. `$CLAUDE_PROJECT_DIR` も無ければ、何も出力せず終了コード非 0 で終わる。
 *    **推測でどこかを出力しない**
 *
 * CI 自体はここでは実行しない。hook 側が出力先へ移動して `npm run ci` を実行する
 * （検証コマンドが `.claude/settings.json` から見える形を保つ）。
 *
 * フォールバックするときは理由を stderr に 1 行出す。対象がすり替わったことに
 * 気づけないのが、いちばん悪い失敗の仕方である。
 *
 * 手動実行: `echo '{"cwd":"/path/to/checkout"}' | node tools/stop-hook-ci-dir.mjs`
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * hook の stdin（JSON）から `cwd` を読む純関数。
 * 解析できない・無い・文字列でないときは undefined を返す。
 *
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function readCwd(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (payload === null || typeof payload !== 'object') return undefined;
  const cwd = payload.cwd;
  return typeof cwd === 'string' && cwd !== '' ? cwd : undefined;
}

/**
 * CI を回す対象ディレクトリを決める純関数。git の呼び出しは注入する。
 *
 * @param {object} input
 * @param {unknown} input.raw - hook の stdin の中身
 * @param {(cwd: string) => string | undefined} input.gitTopLevel - `cwd` の
 *   git top-level を返す。取れないときは undefined
 * @param {unknown} input.projectDir - `$CLAUDE_PROJECT_DIR` の値
 * @returns {{dir: string, fallback?: string} | {error: string}}
 *   `dir` が対象。フォールバックしたときは `fallback` に理由が入る
 */
export function resolveCiDir({ raw, gitTopLevel, projectDir }) {
  const cwd = readCwd(raw);
  let fallback;
  if (cwd === undefined) {
    fallback = 'stdin から cwd を読めません';
  } else {
    const top = gitTopLevel(cwd);
    if (typeof top === 'string' && top !== '') return { dir: top };
    fallback = `cwd (${cwd}) の git top-level を解決できません`;
  }
  if (typeof projectDir === 'string' && projectDir !== '') {
    return { dir: projectDir, fallback };
  }
  return { error: `${fallback}。CLAUDE_PROJECT_DIR も未設定のため、対象を決められません` };
}

/**
 * `cwd` の git top-level を返す。git リポジトリ外・cwd が存在しない等では undefined。
 *
 * @param {string} cwd
 * @returns {string | undefined}
 */
export function gitTopLevel(cwd) {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === '' ? undefined : out;
  } catch {
    return undefined;
  }
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    raw = undefined;
  }

  const result = resolveCiDir({ raw, gitTopLevel, projectDir: process.env.CLAUDE_PROJECT_DIR });

  if ('error' in result) {
    console.error(`stop-hook-ci-dir: ${result.error}`);
    process.exit(1);
  }
  if (result.fallback !== undefined) {
    console.error(
      `stop-hook-ci-dir: ${result.fallback}。CLAUDE_PROJECT_DIR で CI を回します`,
    );
  }
  console.log(result.dir);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
