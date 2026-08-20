/**
 * 実装を変更する PR が、対応する作業の progress.md をちょうど 1 つ更新しているかを
 * base ブランチとの差分から機械的に検知する。
 *
 * 「工程を進めるたびに progress を更新し、実装と同じ PR に含める」「1 PR = 1 作業」は
 * 規約だが強制されていなかった。progress 更新の抜けと、複数作業の混載を検知する。
 *
 * 数えるのは **base に既に存在する** progress.md の、その場の更新だけである。使い捨ての
 * progress.md を PR 内で新規に足して通すのを塞ぐ（`progressWorks()` の注記を見よ）。
 * 数えないものは **黙って捨てず、拒否する**（`strayProgressPaths()` の注記を見よ）。
 * 捨てるだけだと、有効な progress 更新 1 件に別作業の progress の追加・削除・移動を
 * 同乗させて 1 PR に 2 作業を混ぜられる。
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
 * 作業ディレクトリ名の形。**ID の 4 桁だけを縛り、slug の文字種は絞らない。**
 * `tools/archive.mjs` の `WORK_NAME_RE`・`tools/start-task.mjs` の `WORK_DIR_RE` と
 * 同じ広さに揃える。ここだけ `[a-z0-9-]` などに絞ると、`0026-api_v2` のような
 * 正当な作業がこのゲートだけ通れなくなる。
 */
const WORK_NAME_RE = /^\d{4}-[^/\\]+$/;

/**
 * 作業ディレクトリ名として正しいかを判定する純関数。
 * 前後の空白は名前の一部にしない（`tools/archive.mjs` の `isWorkName` と同じ）。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isWorkName(name) {
  if (typeof name !== 'string') return false;
  if (name !== name.trim()) return false;
  return WORK_NAME_RE.test(name);
}

/**
 * `git diff --name-status -M -z` のパス一覧。import 無しで動かすため、
 * ガード側の parser は使わない。
 *
 * **status は捨てない。** 削除（D）と移動元（R/C の旧パス）を「progress を更新した」と
 * 数えてしまうと、実装 PR に `git rm task/<id>-<slug>/progress.md` を 1 行足すだけで
 * この検査を通せる。progress.md は保護パスからも除外されているので他のガードも止めない。
 *
 * @param {string} raw
 * @returns {Array<{status: string, path: string, oldPath?: string}>}
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
      changes.push({ status: rename[1], path: fields[i + 2], oldPath: fields[i + 1] });
      i += 3;
    } else {
      changes.push({ status: code, path: fields[i + 1] });
      i += 2;
    }
  }
  return changes;
}

/**
 * name-status の変更から、移動元・移動先を含むパス一覧を取る。
 * **実装変更の検知に使う。** src/ から出ていくリネームも「実装を触った」と数えたいので、
 * こちらは両側を見る（progress を要求する側なので広く取るのが安全側）。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
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
 * 候補側（head）に実在し続けるパスだけを返す純関数。
 * **progress の更新を数えるのに使う。**
 *
 * - `D`（削除）は head に残らないので数えない
 * - `R` / `C` は移動先だけを数える。移動元（`task/<id>-<slug>/` から
 *   `task/archive/` へ出ていくアーカイブ移動など）は head に残らない
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @returns {string[]}
 */
export function headPaths(changes) {
  return changes.filter((c) => c.status !== 'D').map((c) => c.path);
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
 * ディレクトリ名が作業の形（`<4 桁 ID>-<slug>`）であることも要求する。
 * 任意の直下ディレクトリを受け入れると、`task/not-a-work/progress.md` のような
 * 使い捨てのパスを 1 つ足すだけでこの検査を通せる。
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isActiveProgressPath(filePath) {
  if (!filePath.startsWith(TASK_DIR)) return false;
  const rest = filePath.slice(TASK_DIR.length).split('/');
  if (rest.length !== 2) return false;
  if (rest[1] !== PROGRESS_FILE) return false;
  // `archive` は `<4 桁 ID>-` で始まらないので下の名前検査でも落ちるが、
  // 「完了済みは数えない」という意図は独立させて明示しておく
  if (rest[0] === 'archive') return false;
  return isWorkName(rest[0]);
}

/**
 * base に存在するかを問う関数の既定値。**「存在しない」と答える。**
 *
 * 渡し忘れたときに倒れる向きを、通す側ではなく落ちる側にしておく
 * （既定が「存在する」だと、配線を忘れた瞬間にゲートが黙って無力化する）。
 *
 * @returns {boolean}
 */
const NOTHING_IN_BASE = () => false;

/**
 * 差分に含まれる、進行中の作業の一覧（作業ディレクトリ名）を返す純関数。
 *
 * 数えるのは **base リビジョンに既に存在する** `task/<id>-<slug>/progress.md` の、
 * その場での更新だけ。CLAUDE.md「コミットとマージ」は spec + progress の新規作成を
 * 計画用の docs PR で先に main へ入れると定めているので、実装 PR の時点でその作業の
 * progress.md は base に存在する。
 *
 * base に無いものを数えると、実装 PR に `task/9999-disposable/progress.md` を
 * 1 つ足すだけでこの検査を通せる（progress.md は保護パスからも除外されているので
 * 他のガードも止めない）。新規追加（`A`）も、作業外から作業内へのリネーム先も、
 * base に無いので数えない。削除（`D`）と移動元は `headPaths()` が落とす。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか。
 *   **CLI（`main()`）は必ず渡すこと。** 既定は「無い」なので、渡さないと 0 件になる。
 * @returns {string[]} 名前順
 */
export function progressWorks(changes, baseHas = NOTHING_IN_BASE) {
  const works = new Set();
  for (const p of headPaths(changes)) {
    if (!isActiveProgressPath(p)) continue;
    if (!baseHas(p)) continue;
    works.add(p.slice(TASK_DIR.length).split('/')[0]);
  }
  return [...works].sort();
}

/**
 * 進行中の作業の progress.md に当たる差分のうち、**その場の更新でないもの**を返す純関数。
 *
 * `progressWorks()` が数えないものを黙って捨てると裏面ができる。有効な progress 更新
 * 1 件に、別作業の progress の新規追加・削除・移動を同乗させれば works は 1 件のままで、
 * 1 PR に 2 作業を混ぜられてしまう（spec の「失敗時」に反する）。数えないものは
 * 捨てるのではなく、**1 件でもあれば落とす**。
 *
 * 拒否するのは次のすべて。
 *
 * - 新規追加（`A`）— base に無い作業の progress を足す経路
 * - 削除（`D`）— 進行中の作業の progress を消す経路
 * - リネーム先が base に無い（使い捨ての作業名へ逃がす経路）
 * - リネーム元が作業ディレクトリの progress（`task/archive/` へのアーカイブ移動を含む。
 *   アーカイブは main へ直接コミットする手順なので、実装 PR に混ざるのは逸脱である）
 * - base に無いパスのその場の更新（`baseHas` が未注入のときもここに倒れる）
 *
 * docs だけの PR（`src/`・`tests/`・`tools/` に変更が無い）は対象外なので、
 * 呼び出し側（`evaluateCoupling()`）は docs-only の判定を先に行う。計画用ブランチの
 * docs PR（新しい spec + progress を足す PR）をここで落とさないためである。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか
 * @returns {string[]} 名前順
 */
export function strayProgressPaths(changes, baseHas = NOTHING_IN_BASE) {
  const strays = new Set();
  for (const change of changes) {
    // 作業ディレクトリから出ていく移動元（archive への移動を含む）
    if (change.oldPath && isActiveProgressPath(change.oldPath)) strays.add(change.oldPath);
    if (!isActiveProgressPath(change.path)) continue;
    if (change.status === 'D') {
      strays.add(change.path);
      continue;
    }
    // その場の更新以外（新規追加、base に無い作業名へのリネーム先）
    if (change.status === 'A' || !baseHas(change.path)) strays.add(change.path);
  }
  return [...strays].sort();
}

/**
 * 実装変更と progress 更新の結合を判定する純関数。
 *
 * @param {object} input
 * @param {Array<{status: string, path: string, oldPath?: string}>} input.changes - 差分
 * @param {string[] | null | undefined} input.labels - PR のラベル。読めなければ null
 * @param {(path: string) => boolean} [input.baseHas] - base にそのパスがあるか。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「無い」（fail-closed）。
 * @returns {{ok: boolean, reason: 'bypass-label'|'docs-only'|'coupled'|'missing'|'stray'|'multiple', works: string[], strays: string[]}}
 */
export function evaluateCoupling({ changes, labels, baseHas = NOTHING_IN_BASE }) {
  const works = progressWorks(changes, baseHas);
  const strays = strayProgressPaths(changes, baseHas);
  const paths = pathsFromChanges(changes);

  // 人間が明示的に付けた逃げ道。ラベルが読めないときは通さない（安全側）
  if (Array.isArray(labels) && labels.includes(BYPASS_LABEL)) {
    return { ok: true, reason: 'bypass-label', works, strays };
  }

  // docs だけの PR は対象外。**stray より先に判定する。**
  // 計画用ブランチの docs PR は新しい作業の progress.md を新規追加する（＝ stray）ので、
  // 順序を逆にすると正当な docs PR が落ちる。
  if (!paths.some((p) => isImplementationPath(p))) {
    return { ok: true, reason: 'docs-only', works, strays };
  }

  if (works.length === 0) return { ok: false, reason: 'missing', works, strays };
  // 数えない差分を同乗させて 2 作業を 1 PR に混ぜる経路を塞ぐ
  if (strays.length > 0) return { ok: false, reason: 'stray', works, strays };
  if (works.length > 1) return { ok: false, reason: 'multiple', works, strays };
  return { ok: true, reason: 'coupled', works, strays };
}

/**
 * merge base に存在するパスかを問う関数を組み立てる。
 *
 * 差分は `base...HEAD`（三点）なので、存在確認も分岐点（merge-base）に揃える。
 * base の先端を見ると、分岐後に main 側で作られた progress を「base にある」と
 * 読んでしまう（`tools/check-protected-paths.mjs` の `main()` と同じ理由）。
 *
 * `git cat-file -e <rev>:<path>` は存在しなければ非 0 で終わる。git 自体が壊れた
 * ときも同じく false を返すが、この検査では false が落ちる側（fail-closed）である。
 *
 * @param {string} mergeBase
 * @param {(args: string[], options?: {quiet?: boolean}) => string} execGit
 * @returns {(path: string) => boolean}
 */
function makeBaseHas(mergeBase, execGit) {
  return (filePath) => {
    try {
      // 「base に無い」は正常な結果なので、git の fatal を画面に出さない
      execGit(['cat-file', '-e', `${mergeBase}:${filePath}`], { quiet: true });
      return true;
    } catch {
      return false;
    }
  };
}

/**
 * base ref との差分を見て結合を判定する。
 * 差分が取れない・読めないときは fail-closed（チェック失敗）。
 *
 * @param {object} input
 * @param {string | undefined} input.baseRef
 * @param {string[] | null | undefined} input.labels
 * @param {(args: string[], options?: {quiet?: boolean}) => string} [input.execGit]
 * @param {(path: string) => boolean} [input.baseHas] - テストからの注入用。
 *   省略時は merge-base を解決して `git cat-file -e` で問い合わせる。
 * @returns {{ok: boolean, reason: string | null, works: string[], strays: string[], error: 'usage'|'diff'|null}}
 */
export function resolveCoupling({ baseRef, labels, execGit = defaultExecGit, baseHas }) {
  if (!baseRef) {
    return { ok: false, reason: null, works: [], strays: [], error: 'usage' };
  }
  let changes;
  let has = baseHas;
  try {
    const raw = execGit(['diff', '--name-status', '-M', '-z', `${baseRef}...HEAD`]);
    changes = parseNameStatus(raw);
    if (!has) {
      const mergeBase = execGit(['merge-base', baseRef, 'HEAD']).trim();
      if (!mergeBase) throw new Error('merge-base を解決できませんでした');
      has = makeBaseHas(mergeBase, execGit);
    }
  } catch {
    // 差分が取れないまま素通りさせない（shallow clone・出力の破損）
    return { ok: false, reason: null, works: [], strays: [], error: 'diff' };
  }
  return { ...evaluateCoupling({ changes, labels, baseHas: has }), error: null };
}

/**
 * @param {string[]} args
 * @param {{quiet?: boolean}} [options] - quiet なら git の stderr を捨てる
 * @returns {string}
 */
function defaultExecGit(args, options = {}) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: options.quiet ? ['ignore', 'pipe', 'ignore'] : ['ignore', 'pipe', 'inherit'],
  });
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
    console.error('この PR で新しく作った progress.md は数えません。spec + progress は');
    console.error('先に計画用ブランチの docs PR で main へ入れてください。');
  } else if (result.reason === 'stray') {
    console.error('進行中の作業の progress.md に、その場の更新でない変更が含まれています:');
    for (const stray of result.strays) console.error(`  - ${stray}`);
    console.error('新規追加・削除・作業ディレクトリをまたぐ移動（アーカイブを含む）は、');
    console.error('実装 PR に混ぜないでください。1 PR = 1 作業です。');
    console.error('spec + progress の新規作成は計画用ブランチの docs PR へ、');
    console.error('アーカイブは main への直接コミットへ分けてください。');
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
