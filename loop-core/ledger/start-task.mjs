/**
 * 作業開始を 1 コマンドにする。
 *
 * 開始は「タスクを選ぶ → ブランチ名を決める → worktree を作る → 依存導入」という
 * 複数手順の連なりで、手順である限り一部の省略が起こる（実際に worktree の
 * 作成が飛ばされる事故が繰り返された）。選択と採番を計算に置き換え、開始を
 * このコマンドに畳む。依存導入コマンドはマニフェストの `install` から読む。
 *
 * 選んだ作業の **Complexity** から、実装に使うモデルも併せて出力する。
 * 対応表はマニフェストの `complexityModels`。
 *
 * 使い方:
 *   node loop-core/bin/loop.mjs start-task            次の作業を選び、worktree を用意する
 *   node loop-core/bin/loop.mjs start-task --next-id  新規作業に使う次の ID を出す
 *   node loop-core/bin/loop.mjs start-task --claim <slug> [--in <task|backlog>]
 *                                        次の ID を採り、その場でディレクトリを作って確保する
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// フェンスの解釈は lint と 1 つにする。複製すると「lint は未記載と見るのに
// start-task は貼った出力の中の値を読む」という解釈の割れが起きる
import { linesOutsideFences } from './lint-docs.mjs';
import { loadManifest } from '../lib/manifest.mjs';
import { evaluateBlockedUnblock } from './unblock.mjs';

/** progress の Status のうち、選択の対象にしない値 */
const UNSELECTABLE = new Set(['Blocked', 'Done']);

/**
 * **Complexity** を持たない progress（この項目より前に書かれた既存分）の既定の等級。
 * 落とすと既存の作業がすべて選択不能になるので、無いことは違反にしない。
 */
export const DEFAULT_COMPLEXITY = 'M';

const WORK_DIR_RE = /^(\d{4})-(.+)$/;

/**
 * `- **キー:** 値` の生の値を、**コードフェンスの外の行から**探す純関数。最初の一致を採る。
 *
 * progress には CLAUDE.md「報告の作法」に従ってコマンド出力をフェンスで貼る。
 * 貼った出力の中の `- **Complexity:** \`L\`` はこの文書のメタ情報ではない。
 * フェンスの解釈は `tools/lint-docs.mjs` の `linesOutsideFences` に委ね、
 * lint と読み取りで同じ行集合を見る。
 *
 * @param {string} markdown
 * @param {string} label
 * @returns {string | null}
 */
function findMetaValue(markdown, label) {
  const pattern = new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`);
  for (const { text } of linesOutsideFences(markdown)) {
    const m = pattern.exec(text);
    if (m) return m[1];
  }
  return null;
}

/**
 * progress.md から **Branch** と **Status** を読む純関数。
 * バッククォートの有無と Status の `(Phase: ...)` 接尾辞を許容する。
 * コードフェンスの中は読まない（`parseComplexity` と同じ解釈）。
 *
 * @param {string} markdown
 * @returns {{branch: string | null, status: string | null}}
 */
export function parseProgressMeta(markdown) {
  const pick = (label) => {
    const raw = findMetaValue(markdown, label);
    if (raw === null) return null;
    const value = raw.replace(/\(.*$/, '').replaceAll('`', '').trim();
    return value === '' ? null : value;
  };
  return { branch: pick('Branch'), status: pick('Status') };
}

/**
 * progress.md から **Complexity** を読む純関数。
 * バッククォートの有無を許容する。行が無ければ null（既存の進捗）。
 * コードフェンスの中は読まない。
 *
 * `parseProgressMeta` に足さないのは、あの戻り値の形が既存テストの期待値だからである。
 *
 * @param {string} markdown
 * @returns {string | null}
 */
export function parseComplexity(markdown) {
  const raw = findMetaValue(markdown, 'Complexity');
  if (raw === null) return null;
  const value = raw.replaceAll('`', '').trim();
  return value === '' ? null : value;
}

/**
 * 等級から実装に使うモデル名を引く純関数。
 * null（未記載）は `DEFAULT_COMPLEXITY` とみなす。表に無い等級は失敗させる。
 *
 * 表引きは `Object.hasOwn` で行う。素の `models[grade]` だと
 * `constructor`・`toString`・`valueOf`・`__proto__` などの `Object.prototype`
 * 継承プロパティが「表にある」と判定され、worktree を作ったうえでモデル名として
 * 関数を渡してしまう。**マニフェストに書いた鍵だけ**を表とみなす。
 *
 * @param {string | null | undefined} complexity
 * @param {Record<string, string> | undefined} models - マニフェストの `complexityModels`
 * @returns {string}
 */
export function modelForComplexity(complexity, models) {
  if (models === null || models === undefined || typeof models !== 'object' || Array.isArray(models)) {
    throw new Error('Complexity の対応表がありません（マニフェストの complexityModels）');
  }
  const grade = complexity ?? DEFAULT_COMPLEXITY;
  if (!Object.hasOwn(models, grade)) {
    throw new Error(`Complexity が不正: ${grade}（${Object.keys(models).join(' | ')}）`);
  }
  return models[grade];
}

/**
 * 次に着手する作業を選ぶ純関数。
 * Status が Blocked / Done でない作業のうち、最小 ID を返す。無ければ null。
 *
 * Blocked は原則除外する。例外は `unblockMet === true` のときだけ
 * （解除述語 `path-exists:` が解釈でき、そのパスが存在する）。
 * 述語無しの入力では従来どおり選ばない。
 *
 * @param {Array<{id: string, dirName: string, status: string, branch: string | null, unblockMet?: boolean}>} entries
 * @returns {{id: string, dirName: string, status: string, branch: string | null, unblockMet?: boolean} | null}
 */
export function selectNextTask(entries) {
  const candidates = entries
    .filter((e) => {
      if (e.status === 'Blocked' && e.unblockMet === true) return true;
      return !UNSELECTABLE.has(e.status);
    })
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
 * Status は読んだ値のまま返す。Blocked の解除は `unblockMet` による選択時の
 * 読み替えだけであり、ファイルは書き換えない。
 *
 * @param {string} rootDir
 * @returns {Array<{id: string, dirName: string, status: string, branch: string | null, complexity: string | null, unblockMet: boolean, unblockSkipReason: string | null}>}
 */
function readTaskEntries(rootDir) {
  const taskDir = path.join(rootDir, 'task');
  if (!fs.existsSync(taskDir)) return [];
  const entries = [];
  for (const dirent of fs.readdirSync(taskDir, { withFileTypes: true })) {
    const m = WORK_DIR_RE.exec(dirent.name);
    if (!dirent.isDirectory() || !m) continue;
    const workDir = path.join(taskDir, dirent.name);
    const progressPath = path.join(workDir, 'progress.md');
    if (!fs.existsSync(progressPath)) {
      // `--claim` が確保しただけのディレクトリ（spec も progress もまだ無い）は
      // 「確保中」であって壊れた作業ではない。ここで失敗にすると、起草側が
      // progress を置くまでの間、開発ループの手順 1 が全員分ハードに落ちる。
      // spec があるのに progress が無いのは従来どおり書式の破損として失敗させる
      if (!fs.existsSync(path.join(workDir, 'spec.md'))) continue;
      throw new Error(`task/${dirent.name}/progress.md がありません`);
    }
    const markdown = fs.readFileSync(progressPath, 'utf8');
    const meta = parseProgressMeta(markdown);
    if (meta.status === null) {
      throw new Error(`task/${dirent.name}/progress.md から Status を読めません`);
    }
    let unblockMet = false;
    let unblockSkipReason = null;
    if (meta.status === 'Blocked') {
      const evaluated = evaluateBlockedUnblock(markdown, rootDir);
      unblockMet = evaluated.selectable;
      unblockSkipReason = evaluated.skipReason;
    }
    entries.push({
      id: m[1],
      dirName: dirent.name,
      status: meta.status,
      branch: meta.branch,
      // 等級の妥当性は選択後に見る。選ばれなかった作業の不正で開始を止めない
      complexity: parseComplexity(markdown),
      unblockMet,
      unblockSkipReason,
    });
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
 * - worktree が既にあれば作成と依存導入をスキップする（再入可能）
 * - 依存導入が失敗したら worktree は残したまま失敗する（再実行で再入する）
 * - マニフェストに `install` が無ければ依存導入は呼ばない（空コマンドは置かない）
 *
 * @param {object} input
 * @param {string} input.rootDir - リポジトリのルート
 * @param {(cmd: string, args: string[], opts?: {cwd?: string}) => unknown} [input.exec]
 * @returns {{id: string, dirName: string, branch: string, worktreePath: string, complexity: string, model: string, created: boolean}}
 */
export function startTask({ rootDir, exec = defaultExec }) {
  const entries = readTaskEntries(rootDir);
  const picked = selectNextTask(entries);
  if (picked === null) {
    const skipLines = entries
      .filter((e) => e.status === 'Blocked' && e.unblockSkipReason !== null)
      .map((e) => `task/${e.dirName}: ${e.unblockSkipReason}`);
    const suffix = skipLines.length === 0 ? '' : `\n${skipLines.join('\n')}`;
    throw new Error(
      `選択可能な作業がありません（task/ の archive 以外に Blocked / Done でない作業が無い）${suffix}`,
    );
  }
  if (picked.branch === null) {
    throw new Error(`task/${picked.dirName}/progress.md に **Branch** がありません`);
  }
  if (!isValidBranchName(picked.branch)) {
    throw new Error(`task/${picked.dirName}/progress.md の **Branch** がブランチ名として不正: ${picked.branch}`);
  }

  // マニフェストと等級の確認は worktree に触る前に済ませる（不正なら何も作らずに終わる）
  const manifest = loadManifest(rootDir);
  let model;
  try {
    model = modelForComplexity(picked.complexity, manifest.complexityModels);
  } catch (err) {
    throw new Error(`task/${picked.dirName}/progress.md の ${err.message}`, { cause: err });
  }

  const worktreePath = path.join(rootDir, '.worktrees', picked.branch);
  const base = {
    id: picked.id,
    dirName: picked.dirName,
    branch: picked.branch,
    worktreePath,
    complexity: picked.complexity ?? DEFAULT_COMPLEXITY,
    model,
  };

  if (fs.existsSync(worktreePath)) {
    return { ...base, created: false };
  }

  // git が失敗したときは部分状態を残さない（worktree add 自体がアトミック）
  exec('git', ['worktree', 'add', worktreePath, '-b', picked.branch, 'main'], { cwd: rootDir });

  if (manifest.install !== undefined) {
    const [command, ...args] = manifest.install.argv;
    try {
      exec(command, args, { cwd: worktreePath });
    } catch (err) {
      throw new Error(
        `${manifest.install.argv.join(' ')} が失敗しました（worktree は残してあります。再実行で再入します）: ${err.message}`,
        { cause: err },
      );
    }
  }

  return { ...base, created: true };
}

/**
 * `startTask` の結果を出力の文字列にする純関数。
 * 表示の期待（モデル名が出ること）をテストできるよう、書式を main から分けてある。
 *
 * @param {{id: string, dirName: string, branch: string, worktreePath: string, complexity: string, model: string, created: boolean}} result
 * @returns {string}
 */
export function formatStartTask(result) {
  return [
    `作業: ${result.dirName}`,
    `ブランチ: ${result.branch}`,
    `worktree: ${result.worktreePath}${result.created ? '（新規作成）' : '（既存に再入）'}`,
    `複雑度: ${result.complexity}`,
    `モデル: ${result.model}`,
  ].join('\n');
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

/**
 * `--claim` が確保できる置き場。`task/`（既定）と `backlog/` の 2 つだけ。
 * `task/archive/` は完了した作業の履歴なので新規の確保先にしない。
 */
export const CLAIM_PLACES = Object.freeze(['task', 'backlog']);

/**
 * claim できる slug の形。CLAUDE.md の「英小文字とハイフン」に数字を許した形。
 *
 * 先頭を英小文字に固定するのは、`0042-foo` のような名前を slug として渡されると
 * 作業ディレクトリ名（`<ID>-<slug>`）の ID 部分と見分けがつかなくなるためである。
 */
const SLUG_RE = /^[a-z][a-z0-9-]*$/;

/**
 * slug として正しいかを判定する純関数。
 *
 * @param {string} slug
 * @returns {boolean}
 */
export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/**
 * 採番の対象になる作業ディレクトリを、リポジトリルート相対のパスと ID・slug で列挙する。
 * `task/`・`task/archive/`・`backlog/` を見る。採番（`nextId`）と同じ範囲である。
 *
 * @param {string} rootDir
 * @returns {Array<{path: string, id: string, slug: string}>}
 */
function listWorkDirs(rootDir) {
  const found = [];
  for (const dir of ['task', path.join('task', 'archive'), 'backlog']) {
    const full = path.join(rootDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const dirent of fs.readdirSync(full, { withFileTypes: true })) {
      const m = WORK_DIR_RE.exec(dirent.name);
      if (!dirent.isDirectory() || !m) continue;
      found.push({
        path: `${dir.replaceAll(path.sep, '/')}/${dirent.name}`,
        id: m[1],
        slug: m[2],
      });
    }
  }
  return found;
}

/**
 * 次の ID を採り、その場で作業ディレクトリを作って確保する。
 *
 * 採番（`--next-id`）とディレクトリ作成が別ステップだと、並行する 2 者が
 * 続けて採番して同じ値を得る。採番と確保を 1 つの呼び出しに畳むことで、
 * 確保できた側だけがその ID を持つ。作るのは**空ディレクトリだけ**で、
 * `spec.md` などの中身は起草側が置く。
 *
 * 失敗は例外にせず結果で返す。衝突は異常ではなく通常の分岐で、
 * 呼び出し側は再実行すれば次の ID を得る（自動再試行はしない）。
 *
 * @param {object} input
 * @param {string} input.rootDir - リポジトリのルート
 * @param {string} input.slug - 一覧用のラベル
 * @param {string} [input.place] - 置き場（`task` 既定 / `backlog`）
 * @param {(dir: string) => void} [input.mkdir] - 「存在すれば失敗する」作成。テストで差し替える
 * @returns {{ok: true, path: string} | {ok: false, reason: string}}
 */
export function claimId({ rootDir, slug, place = 'task', mkdir = (dir) => fs.mkdirSync(dir) }) {
  if (!CLAIM_PLACES.includes(place)) {
    return { ok: false, reason: `--in が不正: ${place}（${CLAIM_PLACES.join(' | ')}）` };
  }
  if (!isValidSlug(slug)) {
    return { ok: false, reason: `slug が不正: ${slug}（${SLUG_RE.source} に合致すること）` };
  }

  // 同じ slug の作業が既にあるなら、ID を消費せずに衝突を報告する。
  // 同じ題材の作業が 2 つの ID で並ぶのを防ぐ
  const existing = listWorkDirs(rootDir).find((w) => w.slug === slug);
  if (existing !== undefined) {
    return { ok: false, reason: `同じ slug の作業が既にあります: ${existing.path}` };
  }

  const id = nextId(rootDir);
  // 番号空間はゼロ埋め 4 桁である（CLAUDE.md）。`9999` の次は `10000` になるが、
  // `WORK_DIR_RE` は 4 桁しか認識しないので、確保しても以後の走査から**消える**。
  // 別の slug が同じ `10000` を再確保できてしまうので、作る前に拒む。
  // `--next-id` 単体の振る舞いは変えない（完了条件 6）。
  if (id.length !== 4) {
    return {
      ok: false,
      reason: `ID がゼロ埋め 4 桁に収まりません: ${id}。番号空間を使い切っています`,
    };
  }

  const relative = `${place}/${id}-${slug}`;
  const target = path.join(rootDir, place, `${id}-${slug}`);

  // 置き場そのものが無いことはある（新しいリポジトリ）。確保に失敗したときに
  // 空の置き場を残さないよう、作ったかどうかを覚えておく
  const placeDir = path.join(rootDir, place);
  const placeExisted = fs.existsSync(placeDir);
  if (!placeExisted) fs.mkdirSync(placeDir, { recursive: true });

  /** 確保に失敗したときに、自分が作ったものだけを片付ける */
  const cleanup = () => {
    if (!placeExisted) {
      try {
        fs.rmdirSync(placeDir);
      } catch {
        // 他者が中身を置いた等で消せなければ、そのままにする
      }
    }
  };

  try {
    // 「存在すれば失敗する」作成。この失敗が、採番と作成の間に他者が
    // まったく同じパスを確保したことの証拠になる。ロックファイルは導入しない
    mkdir(target);
  } catch (err) {
    cleanup();
    return {
      ok: false,
      reason: `${relative} を確保できませんでした（他者が先に確保した可能性があります。再実行してください）: ${err.message}`,
    };
  }

  // **EEXIST だけでは足りない。** 事前チェックと mkdir の間に他者が割り込むと、
  // パスが違うぶん mkdir は両方成功してしまう。破れ方は 2 通りある。
  //
  // - 同じ ID・違う slug / 置き場: ID は task/ と backlog/ で 1 つの番号空間なので重複
  // - 同じ slug・違う ID: 事前チェック通過後に相手が先に確保すると、こちらは
  //   次の ID を採ってしまい、同じ題材の作業が 2 つの ID で並ぶ
  //
  // どちらも「作成後にもう一度走査する」で捕まる。述語は事前チェックと対称にし、
  // ID と slug の両方を見る。
  //
  // 双方が相手を見て双方とも降りることはある（安全側の結果である）。再実行すれば
  // 次の ID を得る。自動再試行はしない（範囲外）。
  const duplicate = listWorkDirs(rootDir).find(
    (w) => w.path !== relative && (w.id === id || w.slug === slug),
  );
  if (duplicate !== undefined) {
    try {
      // 自分が今作った空ディレクトリだけを消す。相手のものには触らない
      fs.rmdirSync(target);
    } catch {
      // 消せなければ、下の理由と併せて人間が片付ける
    }
    cleanup();
    const what = duplicate.id === id ? `ID ${id}` : `slug ${slug}`;
    return {
      ok: false,
      reason: `${what} を他者が同時に確保しました: ${duplicate.path}（再実行してください）`,
    };
  }

  return { ok: true, path: relative };
}

/** CLI の使い方。分岐が増えたので 1 箇所にまとめる */
export const USAGE = '使い方: node loop-core/bin/loop.mjs start-task [--next-id | --claim <slug> [--in <task|backlog>]]';

/**
 * CLI の引数（`process.argv.slice(2)`）を解釈する純関数。
 *
 * **`--in` の値の欠落を、`--in` の省略と混ぜない。** `--claim foo --in` で
 * `argv[3]` が undefined のまま `claimId` に渡すと、分割代入の既定値が効いて
 * `task` に化け、何も作らず失敗すべき入力が確保に成功してしまう。
 * 既定値を当ててよいのは `--in` ごと省略されたときだけである。
 *
 * @param {string[]} argv - `process.argv.slice(2)`
 * @returns {{kind: 'start'} | {kind: 'next-id'} | {kind: 'claim', slug: string, place: string} | {kind: 'usage'}}
 */
export function parseCliArgs(argv) {
  if (argv.length === 0) return { kind: 'start' };
  if (argv[0] === '--next-id') {
    return argv.length === 1 ? { kind: 'next-id' } : { kind: 'usage' };
  }
  if (argv[0] === '--claim') {
    if (argv.length === 2) return { kind: 'claim', slug: argv[1], place: 'task' };
    // `--in` は値とセットでしか受けない。値の欠落も余分な引数も使い方の誤りとする
    if (argv.length === 4 && argv[2] === '--in') {
      return { kind: 'claim', slug: argv[1], place: argv[3] };
    }
    return { kind: 'usage' };
  }
  return { kind: 'usage' };
}

function main() {
  const rootDir = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();

  const args = parseCliArgs(process.argv.slice(2));

  if (args.kind === 'usage') {
    console.error(USAGE);
    process.exit(1);
  }
  if (args.kind === 'next-id') {
    console.log(nextId(rootDir));
    return;
  }
  if (args.kind === 'claim') {
    const result = claimId({ rootDir, slug: args.slug, place: args.place });
    if (!result.ok) {
      console.error(`確保しませんでした: ${result.reason}`);
      process.exit(1);
    }
    console.log(result.path);
    return;
  }

  let result;
  try {
    result = startTask({ rootDir });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(formatStartTask(result));
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
