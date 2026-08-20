/**
 * 作業開始を 1 コマンドにする。
 *
 * 開始は「タスクを選ぶ → ブランチ名を決める → worktree を作る → npm ci」という
 * 複数手順の連なりで、手順である限り一部の省略が起こる（実際に worktree の
 * 作成が飛ばされる事故が繰り返された）。選択と採番を計算に置き換え、開始を
 * このコマンドに畳む。
 *
 * 使い方:
 *   node tools/start-task.mjs            次の作業を選び、worktree を用意する
 *   node tools/start-task.mjs --next-id  新規作業に使う次の ID を出す
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** progress の Status のうち、選択の対象にしない値 */
const UNSELECTABLE = new Set(['Blocked', 'Done']);

const WORK_DIR_RE = /^(\d{4})-(.+)$/;

/**
 * progress.md から **Branch** と **Status** を読む純関数。
 * バッククォートの有無と Status の `(Phase: ...)` 接尾辞を許容する。
 *
 * @param {string} markdown
 * @returns {{branch: string | null, status: string | null}}
 */
export function parseProgressMeta(markdown) {
  const pick = (label) => {
    const m = new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`, 'm').exec(markdown);
    if (!m) return null;
    const value = m[1].replace(/\(.*$/, '').replaceAll('`', '').trim();
    return value === '' ? null : value;
  };
  return { branch: pick('Branch'), status: pick('Status') };
}

/**
 * 次に着手する作業を選ぶ純関数。
 * Status が Blocked / Done でない作業のうち、最小 ID を返す。無ければ null。
 *
 * @param {Array<{id: string, dirName: string, status: string, branch: string | null}>} entries
 * @returns {{id: string, dirName: string, status: string, branch: string | null} | null}
 */
export function selectNextTask(entries) {
  const candidates = entries
    .filter((e) => !UNSELECTABLE.has(e.status))
    .sort((a, b) => a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

/**
 * 次の新規作業の ID を返す純関数。
 * `NNNN-slug` 形式の名前の最大 ID + 1 を、ゼロ埋め 4 桁で返す。
 *
 * @param {string[]} names - `task/`（archive 含む）と `backlog/` のディレクトリ名
 * @returns {string}
 */
export function nextIdFrom(names) {
  let max = 0;
  for (const name of names) {
    const m = WORK_DIR_RE.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return String(max + 1).padStart(4, '0');
}

/**
 * ブランチ名として安全かを判定する純関数。
 * テンプレートの穴埋め残り（`<ブランチ名>`）や git が拒む形を弾く。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isValidBranchName(name) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(name)) return false;
  return !name.includes('..') && !name.includes('//') && !name.endsWith('/') && !name.endsWith('.lock');
}

/**
 * `task/` の archive 以外の作業ディレクトリを読み、選択に要るメタを集める。
 * progress.md が読めない・Status が読めない作業は、黙って飛ばさず失敗にする。
 *
 * @param {string} rootDir
 * @returns {Array<{id: string, dirName: string, status: string, branch: string | null}>}
 */
function readTaskEntries(rootDir) {
  const taskDir = path.join(rootDir, 'task');
  if (!fs.existsSync(taskDir)) return [];
  const entries = [];
  for (const dirent of fs.readdirSync(taskDir, { withFileTypes: true })) {
    const m = WORK_DIR_RE.exec(dirent.name);
    if (!dirent.isDirectory() || !m) continue;
    const progressPath = path.join(taskDir, dirent.name, 'progress.md');
    if (!fs.existsSync(progressPath)) {
      throw new Error(`task/${dirent.name}/progress.md がありません`);
    }
    const meta = parseProgressMeta(fs.readFileSync(progressPath, 'utf8'));
    if (meta.status === null) {
      throw new Error(`task/${dirent.name}/progress.md から Status を読めません`);
    }
    entries.push({ id: m[1], dirName: dirent.name, status: meta.status, branch: meta.branch });
  }
  return entries;
}

/**
 * 既定の exec。テストからは記録・失敗注入のできる関数に差し替える。
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{cwd?: string}} [opts]
 * @returns {string}
 */
function defaultExec(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { ...opts, encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
}

/**
 * 次の作業を選び、worktree を用意する。
 *
 * - worktree が既にあれば作成と `npm ci` をスキップする（再入可能）
 * - `npm ci` が失敗したら worktree は残したまま失敗する（再実行で再入する）
 *
 * @param {object} input
 * @param {string} input.rootDir - リポジトリのルート
 * @param {(cmd: string, args: string[], opts?: {cwd?: string}) => unknown} [input.exec]
 * @returns {{id: string, dirName: string, branch: string, worktreePath: string, created: boolean}}
 */
export function startTask({ rootDir, exec = defaultExec }) {
  const picked = selectNextTask(readTaskEntries(rootDir));
  if (picked === null) {
    throw new Error('選択可能な作業がありません（task/ の archive 以外に Blocked / Done でない作業が無い）');
  }
  if (picked.branch === null) {
    throw new Error(`task/${picked.dirName}/progress.md に **Branch** がありません`);
  }
  if (!isValidBranchName(picked.branch)) {
    throw new Error(`task/${picked.dirName}/progress.md の **Branch** がブランチ名として不正: ${picked.branch}`);
  }

  const worktreePath = path.join(rootDir, '.worktrees', picked.branch);
  const base = { id: picked.id, dirName: picked.dirName, branch: picked.branch, worktreePath };

  if (fs.existsSync(worktreePath)) {
    return { ...base, created: false };
  }

  // git が失敗したときは部分状態を残さない（worktree add 自体がアトミック）
  exec('git', ['worktree', 'add', worktreePath, '-b', picked.branch, 'main'], { cwd: rootDir });

  try {
    exec('npm', ['ci'], { cwd: worktreePath });
  } catch (err) {
    throw new Error(
      `npm ci が失敗しました（worktree は残してあります。再実行で再入します）: ${err.message}`,
      { cause: err },
    );
  }

  return { ...base, created: true };
}

/**
 * `task/`（archive 含む）と `backlog/` のディレクトリ名から次の ID を計算する。
 *
 * @param {string} rootDir
 * @returns {string}
 */
export function nextId(rootDir) {
  const names = [];
  for (const dir of ['task', path.join('task', 'archive'), 'backlog']) {
    const full = path.join(rootDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const dirent of fs.readdirSync(full, { withFileTypes: true })) {
      if (dirent.isDirectory()) names.push(dirent.name);
    }
  }
  return nextIdFrom(names);
}

function main() {
  const rootDir = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

  if (process.argv[2] === '--next-id') {
    console.log(nextId(rootDir));
    return;
  }
  if (process.argv[2] !== undefined) {
    console.error('使い方: node tools/start-task.mjs [--next-id]');
    process.exit(1);
  }

  let result;
  try {
    result = startTask({ rootDir });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(`作業: ${result.dirName}`);
  console.log(`ブランチ: ${result.branch}`);
  console.log(`worktree: ${result.worktreePath}${result.created ? '（新規作成）' : '（既存に再入）'}`);
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
