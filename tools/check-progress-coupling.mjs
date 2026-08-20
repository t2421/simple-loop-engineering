/**
 * 実装を変更する PR が、対応する作業の progress.md をちょうど 1 つ更新しているかを
 * base ブランチとの差分から機械的に検知する。
 *
 * 「工程を進めるたびに progress を更新し、実装と同じ PR に含める」「1 PR = 1 作業」は
 * 規約だが強制されていなかった。progress 更新の抜けと、複数作業の混載を検知する。
 *
 * 判定ロジックは純関数として公開し、差分リストとラベルを注入してテストできる。
 * CLI としては `node tools/check-progress-coupling.mjs <base-ref>` で実行する。
 * 違反があれば理由を表示して終了コード 1 で終わる。
 *
 * ローカル import を持たない。CI は base リビジョンを一時ファイルへ取り出して
 * 実行するため、相対 import があると候補側のファイルを読んでしまう
 * （`tools/e2e-needed.mjs` と同じ理由）。
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 人間が付ける逃げ道。作業に紐づかない変更（ルール整備など）を通す */
export const BYPASS_LABEL = 'no-progress-needed';

/** ここに変更があれば「実装 PR」とみなす */
const IMPLEMENTATION_DIRS = ['src/', 'tests/', 'tools/'];

/** 作業の進捗ファイル名 */
const PROGRESS_FILE = 'progress.md';

/** 作業ディレクトリの親。旧 `progress/` レイアウトは対象外 */
const TASK_DIR = 'task/';

/**
 * `git diff --name-status -M -z` のパス一覧。import 無しで動かすため、
 * ガード側の parser は使わない。
 *
 * @param {string} raw
 * @returns {Array<{path: string, oldPath?: string}>}
 */
export function parseNameStatus(raw) {
  const fields = raw.split('\0').filter((f) => f !== '');
  const changes = [];
  let i = 0;
  while (i < fields.length) {
    const code = fields[i];
    const rename = /^([RC])(\d+)$/.exec(code);
    const needed = rename ? 3 : 2;
    if (i + needed > fields.length) {
      // 途中で切れた出力を「差分なし」と読んで素通りさせない
      throw new Error(`差分の出力が途中で切れています: ${JSON.stringify(fields.slice(i))}`);
    }
    if (rename) {
      changes.push({ path: fields[i + 2], oldPath: fields[i + 1] });
      i += 3;
    } else {
      changes.push({ path: fields[i + 1] });
      i += 2;
    }
  }
  return changes;
}

/**
 * name-status の変更から、移動元・移動先を含むパス一覧を取る。
 *
 * @param {Array<{path: string, oldPath?: string}>} changes
 * @returns {string[]}
 */
export function pathsFromChanges(changes) {
  const paths = [];
  for (const change of changes) {
    paths.push(change.path);
    if (change.oldPath) paths.push(change.oldPath);
  }
  return paths;
}

/**
 * そのパスが実装の変更かを判定する純関数。
 *
 * @param {string} filePath - git のパス（スラッシュ区切り）
 * @returns {boolean}
 */
export function isImplementationPath(filePath) {
  return IMPLEMENTATION_DIRS.some((dir) => filePath.startsWith(dir));
}

/**
 * そのパスが進行中の作業の progress.md かを判定する純関数。
 *
 * 対象は `task/<id>-<slug>/progress.md` の 1 階層だけ。`task/archive/` 配下は
 * 完了済みの記録なので数えない（数えると、アーカイブ済みの progress を触るだけで
 * 結合の検査を通せてしまう）。
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isActiveProgressPath(filePath) {
  if (!filePath.startsWith(TASK_DIR)) return false;
  const rest = filePath.slice(TASK_DIR.length).split('/');
  if (rest.length !== 2) return false;
  if (rest[0] === 'archive') return false;
  return rest[1] === PROGRESS_FILE;
}

/**
 * 差分に含まれる、進行中の作業の一覧（作業ディレクトリ名）を返す純関数。
 * 同じ作業を移動元・移動先の両方で数えないよう重複は除く。
 *
 * @param {string[]} paths
 * @returns {string[]} 名前順
 */
export function progressWorks(paths) {
  const works = new Set();
  for (const p of paths) {
    if (!isActiveProgressPath(p)) continue;
    works.add(p.slice(TASK_DIR.length).split('/')[0]);
  }
  return [...works].sort();
}

/**
 * 実装変更と progress 更新の結合を判定する純関数。
 *
 * @param {object} input
 * @param {string[]} input.paths - 差分のパス一覧（移動元も含む）
 * @param {string[] | null | undefined} input.labels - PR のラベル。読めなければ null
 * @returns {{ok: boolean, reason: 'bypass-label'|'docs-only'|'coupled'|'missing'|'multiple', works: string[]}}
 */
export function evaluateCoupling({ paths, labels }) {
  const works = progressWorks(paths);

  // 人間が明示的に付けた逃げ道。ラベルが読めないときは通さない（安全側）
  if (Array.isArray(labels) && labels.includes(BYPASS_LABEL)) {
    return { ok: true, reason: 'bypass-label', works };
  }

  if (!paths.some((p) => isImplementationPath(p))) {
    return { ok: true, reason: 'docs-only', works };
  }

  if (works.length === 0) return { ok: false, reason: 'missing', works };
  if (works.length > 1) return { ok: false, reason: 'multiple', works };
  return { ok: true, reason: 'coupled', works };
}

/**
 * base ref との差分を見て結合を判定する。
 * 差分が取れない・読めないときは fail-closed（チェック失敗）。
 *
 * @param {object} input
 * @param {string | undefined} input.baseRef
 * @param {string[] | null | undefined} input.labels
 * @param {(args: string[]) => string} [input.execGit]
 * @returns {{ok: boolean, reason: string | null, works: string[], error: 'usage'|'diff'|null}}
 */
export function resolveCoupling({ baseRef, labels, execGit = defaultExecGit }) {
  if (!baseRef) {
    return { ok: false, reason: null, works: [], error: 'usage' };
  }
  let paths;
  try {
    const raw = execGit(['diff', '--name-status', '-M', '-z', `${baseRef}...HEAD`]);
    paths = pathsFromChanges(parseNameStatus(raw));
  } catch {
    // 差分が取れないまま素通りさせない（shallow clone・出力の破損）
    return { ok: false, reason: null, works: [], error: 'diff' };
  }
  return { ...evaluateCoupling({ paths, labels }), error: null };
}

function defaultExecGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/**
 * 環境変数からラベルの一覧を読む。
 * `PR_LABELS` は GitHub Actions から JSON 配列で渡す。読めなければ null。
 *
 * @returns {string[] | null}
 */
function readLabels() {
  const raw = process.env.PR_LABELS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  } catch {
    return null;
  }
}

const MESSAGES = {
  'bypass-label': `ラベル ${BYPASS_LABEL} があるため通過させます（人間による明示承認）。`,
  'docs-only': 'src/・tests/・tools/ に変更がないため対象外です。',
  coupled: '実装の変更に、進行中の作業の progress.md がちょうど 1 件伴っています。',
};

function main() {
  const baseRef = process.argv[2];
  const result = resolveCoupling({ baseRef, labels: readLabels() });

  if (result.error === 'usage') {
    console.error('使い方: node tools/check-progress-coupling.mjs <base-ref>');
    process.exit(1);
  }
  if (result.error === 'diff') {
    console.error(`base (${baseRef}) との差分を取得できませんでした。`);
    console.error('shallow clone の場合は fetch-depth: 0 が要ります。');
    process.exit(1);
  }

  if (result.ok) {
    console.log(MESSAGES[result.reason]);
    if (result.reason === 'coupled') console.log(`  作業: ${result.works[0]}`);
    return;
  }

  if (result.reason === 'missing') {
    console.error('実装（src/・tests/・tools/）を変更していますが、進行中の作業の');
    console.error('progress.md（task/<id>-<slug>/progress.md）の更新が含まれていません。');
    console.error('工程を進めたら、その作業の progress を同じ PR で更新してください。');
  } else {
    console.error(`進行中の作業の progress.md が ${result.works.length} 件更新されています:`);
    for (const work of result.works) console.error(`  - ${work}`);
    console.error('1 PR = 1 作業です。作業ごとに PR を分けてください。');
  }
  console.error(
    `\n作業に紐づかない変更なら、PR に ${BYPASS_LABEL} ラベルを付けてください（人間が付ける）。`,
  );
  process.exit(1);
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）。
// ファイル名で判定すると、CI が base 版を一時ファイルへ取り出して実行する経路で
// main() が黙って走らない。realpath に揃えるのも同じ理由（symlink 成分の吸収）。
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
