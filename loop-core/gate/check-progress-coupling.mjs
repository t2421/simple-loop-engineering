/**
 * 実装を変更する PR が、対応する作業の progress.md をちょうど 1 つ更新しているかを
 * base ブランチとの差分から機械的に検知する。
 *
 * 「工程を進めるたびに progress を更新し、実装と同じ PR に含める」「1 PR = 1 作業」は
 * 規約だが強制されていなかった。progress 更新の抜けと、複数作業の混載を検知する。
 *
 * 数える形は **ホワイトリスト**である。`task/<id>-<slug>/progress.md` に当たる差分のうち、
 * **status が `M` で、base（merge-base）に存在し、blob（中身）が変わったもの**だけを
 * 「進捗を更新した」と数える。**それ以外はすべて拒否する**
 * （`classifyProgressChanges()` の注記を見よ）。
 *
 * ここを「数えない status を列挙して塞ぐ」形にしてはならない。列挙は必ず漏れる。
 * 実際、この検査は列挙を足す形で 7 回直され、そのたびに別の面が開いた——
 * 削除（`D`）→ 新規追加（`A`）→ 数えない対象を黙って捨てての同乗 → 別作業の progress →
 * **Branch** 行の書き換え → モードだけの変更（blob 同一の `M`）→ 種別の変更（`T`。
 * 追跡下の progress.md を symlink へ置き換えると、中身が消えて別作業へのポインタに
 * なるのに `D` ではなく `T` が出る）。ホワイトリストなら、`T` も、将来 git が増やす
 * 未知の status も、最初から数えられる側に入らない。
 *
 * 「その場の更新」は差分の status だけでは決まらない。`git update-index --chmod=+x` の
 * ようなモードだけの変更は、blob（中身）が base と同一のまま status `M` になる。
 * 中身が 1 バイトも変わっていない進捗を「更新した」と数えると、実行ビットを立てるだけで
 * この検査を通せる。そこで base と HEAD の **blob OID が異なること**まで要求する
 * （`unchangedProgressPaths()` の注記を見よ）。**中身は読まない。** 進捗の書き方
 * （チェックの進み方）の検証は spec の「範囲外」である。
 *
 * 数えないものは **黙って捨てず、拒否する**（`strayProgressPaths()` の注記を見よ）。
 * 捨てるだけだと、有効な progress 更新 1 件に別作業の progress の追加・削除・移動を
 * 同乗させて 1 PR に 2 作業を混ぜられる。
 *
 * 数が合っているだけでも足りない。更新された progress が **その PR の作業のもの**
 * であることまで見る（`checkAttribution()` の注記を見よ）。`tools/archive.mjs` の
 * `checkOwnership()` が「マージ済みであることだけでは足りない」を解いたのと同型で、
 * PR の head ブランチと進捗の **Branch** を照合する。照合相手の **Branch** は
 * **merge-base（base 側）から読む**。候補側（HEAD）から読むと、進捗ファイル自身が
 * 保護対象外である以上、別作業の Branch 行を 1 行書き換えるだけで通せてしまう
 * （自己申告の照合になる。`makeBranchOf()` の注記を見よ）。
 *
 * 判定ロジックは純関数として公開し、差分リストとラベルを注入してテストできる。
 * CLI としては `node tools/check-progress-coupling.mjs <base-ref>` で実行する。
 * 違反があれば理由を表示して終了コード 1 で終わる。
 *
 * GitHub Actions は BASE の loop-core/ 一式を展開してから CLI 経由で実行する。
 * sibling import を許す（単一ファイルコピーはしない）。
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { IMPLEMENTATION_DIRS, PROGRESS_FILE, TASK_DIR } from '../lib/layout.mjs';
import {
  bypassLabelMessage,
  coupledMessage,
  couplingUsage,
  docsOnlyMessage,
  foreignProgressLines,
  missingProgressLines,
  multipleProgressLines,
  newProgressNotCountedLines,
  strayProgressAdviceLines,
  strayProgressLines,
  unchangedProgressAdviceLines,
  unchangedProgressLines,
} from '../lib/messages.mjs';

/** 人間が付ける逃げ道。作業に紐づかない変更（ルール整備など）を通す */
export const BYPASS_LABEL = 'no-progress-needed';


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
 * base と HEAD で中身（blob）が変わったかを問う関数の既定値。**「変わっていない」と答える。**
 *
 * `NOTHING_IN_BASE` と同じ考え方で、配線を忘れたときに倒れる向きを落ちる側にしておく。
 *
 * @returns {boolean}
 */
const SAME_CONTENT = () => false;

/**
 * 「進捗を更新した」と数える唯一の status。**ホワイトリストである。**
 *
 * `M`（既存ファイルの内容変更）だけを数え、他は一切数えない。`A`（新規追加）・
 * `D`（削除）・`T`（種別の変更。symlink 化など）・`R`/`C`（移動・複製）はもちろん、
 * 将来 git が増やす未知の status もここに入らない。
 *
 * 「数えない status を列挙して弾く」形にしないこと。列挙は必ず漏れ、漏れた status が
 * そのままゲートの抜け道になる（このファイル冒頭の 7 回の履歴を見よ）。
 */
const COUNTED_STATUS = 'M';

/**
 * 進行中の作業の progress.md に当たる差分を、**過不足なく 3 つに仕分ける**純関数。
 *
 * この関数がこのモジュールの中心である。`task/<id>-<slug>/progress.md` に当たる変更は、
 * 必ず次のいずれか **1 つだけ**に入る。隙間（黙って捨てられるもの）も重複も無い。
 *
 * | 仕分け先 | 条件 | 意味 |
 * |---|---|---|
 * | `works` | status が `M` かつ base にあり、blob が変わった | 数える唯一の形 |
 * | `unchanged` | status が `M` かつ base にあるが、blob が同一 | モードだけの変更 |
 * | `rejected` | 上のどちらでもない | 拒否する（`stray`） |
 *
 * **`rejected` は「それ以外すべて」である。** 個別の status を列挙して弾いてはならない。
 * `A`・`D`・`T`・`R`・`C` も、git が将来増やす未知の status も、`M` でない時点で
 * ここに落ちる。base に無いパスの `M`（`baseHas` の未注入を含む）も同じ。
 *
 * リネーム・複製の**移動元**が作業の progress なら、それも `rejected` に入れる
 * （`task/archive/` へのアーカイブ移動を含む。アーカイブは main へ直接コミットする
 * 手順なので、実装 PR に混ざるのは逸脱である）。
 *
 * 数えないものを黙って捨てると裏面ができる。有効な progress 更新 1 件に、別作業の
 * progress の追加・削除・種別変更・移動を同乗させれば `works` は 1 件のままで、
 * 1 PR に 2 作業を混ぜられてしまう（spec の「失敗時」に反する）。だから捨てずに集め、
 * 呼び出し側が **1 件でもあれば落とす**。
 *
 * docs だけの PR（`src/`・`tests/`・`tools/` に変更が無い）は対象外なので、
 * 呼び出し側（`evaluateCoupling()`）は docs-only の判定を先に行う。計画用ブランチの
 * docs PR（新しい spec + progress を足す PR）をここで落とさないためである。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「無い」（fail-closed）。
 * @param {(path: string) => boolean} [contentChanged] - base と HEAD で blob が違うか。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「同じ」（fail-closed）。
 * @returns {{works: string[], unchanged: string[], rejected: string[]}} いずれも名前順
 */
export function classifyProgressChanges(
  changes,
  baseHas = NOTHING_IN_BASE,
  contentChanged = SAME_CONTENT,
) {
  const works = new Set();
  const unchanged = new Set();
  const rejected = new Set();
  for (const change of changes) {
    // 作業ディレクトリから出ていく移動元（archive への移動を含む）
    if (change.oldPath && isActiveProgressPath(change.oldPath)) rejected.add(change.oldPath);
    if (!isActiveProgressPath(change.path)) continue;
    // --- ここから下は「進行中の作業の progress.md に当たる変更」の完全な仕分け ---
    if (change.status !== COUNTED_STATUS || !baseHas(change.path)) {
      // ホワイトリストに入らないものはすべてここ（A / D / T / R / C / 未知 / base に無い）
      rejected.add(change.path);
    } else if (contentChanged(change.path)) {
      works.add(change.path.slice(TASK_DIR.length).split('/')[0]);
    } else {
      unchanged.add(change.path);
    }
  }
  return {
    works: [...works].sort(),
    unchanged: [...unchanged].sort(),
    rejected: [...rejected].sort(),
  };
}

/**
 * 差分に含まれる、進行中の作業の一覧（作業ディレクトリ名）を返す純関数。
 *
 * 数えるのは **base リビジョンに既に存在する** `task/<id>-<slug>/progress.md` の、
 * status が `M` で **中身が実際に変わった**その場での更新だけ（`COUNTED_STATUS`）。
 * CLAUDE.md「コミットとマージ」は spec + progress の新規作成を計画用の docs PR で
 * 先に main へ入れると定めているので、実装 PR の時点でその作業の progress.md は
 * base に存在する。
 *
 * base に無いものを数えると、実装 PR に `task/9999-disposable/progress.md` を
 * 1 つ足すだけでこの検査を通せる（progress.md は保護パスからも除外されているので
 * 他のガードも止めない）。
 *
 * 仕分けは `classifyProgressChanges()` が行う。**数えなかったものは黙って捨てず、
 * `unchangedProgressPaths()` か `strayProgressPaths()` が拒否対象として拾う。**
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか。
 *   **CLI（`main()`）は必ず渡すこと。** 既定は「無い」なので、渡さないと 0 件になる。
 * @param {(path: string) => boolean} [contentChanged] - base と HEAD で blob が違うか。
 *   **CLI（`main()`）は必ず渡すこと。** 既定は「同じ」なので、渡さないと 0 件になる。
 * @returns {string[]} 名前順
 */
export function progressWorks(changes, baseHas = NOTHING_IN_BASE, contentChanged = SAME_CONTENT) {
  return classifyProgressChanges(changes, baseHas, contentChanged).works;
}

/**
 * 進行中の作業の progress.md のうち、**base にあるのに中身が変わっていない**ものを返す純関数。
 *
 * `git update-index --chmod=+x task/<id>-<slug>/progress.md` だけを行うと、base と HEAD の
 * blob は同一のまま `git diff --name-status` は `M` を返す。status だけを見ていると、
 * 進捗を 1 バイトも書かずにこの検査を通せてしまう（spec の「背景」が挙げた
 * 「progress 更新の抜けた実装 PR を機械的に検知できない」がそのまま素通りする）。
 *
 * 判定は **blob OID の比較だけ**で行い、中身は読まない。進捗の書き方（チェックの
 * 進み方）の検証は spec の「範囲外」である。
 *
 * `strayProgressPaths()` と同じく、数えないものを黙って捨てるのではなく拒否対象として
 * 集める。捨てるだけだと、有効な更新 1 件に別作業のモードだけの変更を同乗させられる。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか
 * @param {(path: string) => boolean} [contentChanged] - base と HEAD で blob が違うか。
 *   既定は「同じ」なので、渡さないと base にある progress は全部ここに落ちる（fail-closed）。
 * @returns {string[]} 名前順
 */
export function unchangedProgressPaths(
  changes,
  baseHas = NOTHING_IN_BASE,
  contentChanged = SAME_CONTENT,
) {
  return classifyProgressChanges(changes, baseHas, contentChanged).unchanged;
}

/**
 * 進行中の作業の progress.md に当たる差分のうち、**数える形でないもの**を返す純関数。
 *
 * ホワイトリスト（`COUNTED_STATUS` の `M` かつ base にある）に入らなかったものが
 * すべてここに来る。新規追加（`A`）・削除（`D`）・種別の変更（`T`。symlink への
 * 置き換え）・移動（`R`/`C`）の両側・未知の status・base に無いパスがすべて含まれる。
 * **列挙で弾いているのではなく、数える形の補集合である。**
 *
 * モードだけの変更（blob 同一の `M`）だけは `unchangedProgressPaths()` が別に拾う。
 * 「何をすればよいか」の案内が変わるので理由コードを分けてあるだけで、どちらも
 * 失敗させる点は同じ。
 *
 * @param {Array<{status: string, path: string, oldPath?: string}>} changes
 * @param {(path: string) => boolean} [baseHas] - base にそのパスがあるか
 * @returns {string[]} 名前順
 */
export function strayProgressPaths(changes, baseHas = NOTHING_IN_BASE) {
  // 拒否対象は blob が変わったかに依らない（`M` かどうかと base の有無だけで決まる）
  return classifyProgressChanges(changes, baseHas, SAME_CONTENT).rejected;
}

/**
 * 進捗ファイルの本文から **Branch** の行を読む純関数。
 *
 * 書式の解釈は `tools/archive.mjs` の `readBranch()` と同じにする（バッククォートを
 * 剥がし、前後の空白を落とす）。**あちらを import しない**のは、このファイルが
 * ローカル import を持てないため（CI は base 版を一時ファイルへ取り出して実行する）。
 * 書式を変えるときは両方を揃えること。
 *
 * @param {string} text - progress.md の中身
 * @returns {string | null} ブランチ名。欄が無ければ null
 */
export function readBranch(text) {
  if (typeof text !== 'string') return null;
  const m = /^- \*\*Branch:\*\*\s*(.+?)\s*$/m.exec(text);
  if (!m) return null;
  const value = m[1].replace(/^`|`$/g, '').trim();
  return value === '' ? null : value;
}

/**
 * 作業の **Branch** を問う関数の既定値。**「読めない」と答える。**
 *
 * `NOTHING_IN_BASE` と同じ考え方で、配線を忘れたときに落ちる側へ倒す。
 *
 * @returns {null}
 */
const NO_BRANCH = () => null;

/**
 * 更新された progress が、**その PR の作業のもの**かを判定する純関数。
 *
 * 「実装の変更に progress 更新がちょうど 1 件伴う」だけでは足りない。別作業の
 * progress.md を 1 行触るだけで、その PR の作業と無関係な進捗を担保に通せてしまう
 * （`src/` を変える PR が `task/0027-b/progress.md` だけ更新する経路）。
 * `tools/archive.mjs` の `checkOwnership()` が「マージ済みであることだけでは足りない。
 * 別作業の PR を貼れば通ってしまう」を解いたのと同じ問題なので、同じ形で解く。
 * 照合するものも同じ——PR の head ブランチと、進捗の **Branch** メタ情報である。
 *
 * **`branchOf` は base 側（merge-base）の内容を読むこと。** 候補側から読むと、
 * 照合相手を攻撃者が同じ PR で書き換えられるので、自己申告の照合にしかならない。
 * 進捗の **Branch** は着手時点で main に確定している値であり、実装 PR 内での
 * 変更は帰属の判定に影響しない、というモデルである（`makeBranchOf()` を見よ）。
 *
 * head ブランチ名が得られないとき（`headBranch` が空）は照合しない。ローカルで
 * CLI を手で回す経路がこれに当たる。**抜け道にはならない。** ゲートの実体は
 * `pull_request` イベントで動く CI であり、そこでは `GITHUB_HEAD_REF` が必ず入る。
 * CI で空になっていたら配線の異常なので、`main()` 側が別途落とす。
 *
 * @param {string} work - 作業ディレクトリ名
 * @param {object} input
 * @param {string | null | undefined} input.headBranch - PR の head ブランチ
 * @param {(work: string) => string | null} [input.branchOf] - その作業の進捗の **Branch**。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「読めない」（fail-closed）。
 * @returns {{ok: boolean, branch: string | null}}
 */
export function checkAttribution(work, { headBranch, branchOf = NO_BRANCH }) {
  if (!headBranch) return { ok: true, branch: null };
  const branch = branchOf(work);
  return { ok: branch === headBranch, branch };
}

/**
 * 実装変更と progress 更新の結合を判定する純関数。
 *
 * @param {object} input
 * @param {Array<{status: string, path: string, oldPath?: string}>} input.changes - 差分
 * @param {string[] | null | undefined} input.labels - PR のラベル。読めなければ null
 * @param {(path: string) => boolean} [input.baseHas] - base にそのパスがあるか。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「無い」（fail-closed）。
 * @param {(path: string) => boolean} [input.contentChanged] - base と HEAD で blob が違うか。
 *   **CLI 経路（`resolveCoupling()`）は必ず渡すこと。** 既定は「同じ」（fail-closed）。
 * @param {string | null} [input.headBranch] - PR の head ブランチ。空なら帰属を照合しない
 * @param {(work: string) => string | null} [input.branchOf] - 作業の進捗の **Branch**
 * @returns {{ok: boolean, reason: 'bypass-label'|'docs-only'|'coupled'|'missing'|'unchanged'|'stray'|'multiple'|'foreign', works: string[], strays: string[], unchanged: string[], branch: string | null, headBranch: string | null}}
 */
export function evaluateCoupling({
  changes,
  labels,
  baseHas = NOTHING_IN_BASE,
  contentChanged = SAME_CONTENT,
  headBranch = null,
  branchOf = NO_BRANCH,
}) {
  // 1 回の仕分けで works / unchanged / rejected をまとめて得る。3 回に分けて呼ぶと
  // 「どれにも入らない隙間」が生まれる余地ができる（`classifyProgressChanges()`）。
  const { works, unchanged, rejected: strays } = classifyProgressChanges(
    changes,
    baseHas,
    contentChanged,
  );
  const paths = pathsFromChanges(changes);

  const at = (reason, ok, branch = null) => ({
    ok,
    reason,
    works,
    strays,
    unchanged,
    branch,
    headBranch: headBranch ?? null,
  });

  // 人間が明示的に付けた逃げ道。ラベルが読めないときは通さない（安全側）
  if (Array.isArray(labels) && labels.includes(BYPASS_LABEL)) {
    return at('bypass-label', true);
  }

  // docs だけの PR は対象外。**stray より先に判定する。**
  // 計画用ブランチの docs PR は新しい作業の progress.md を新規追加する（＝ stray）ので、
  // 順序を逆にすると正当な docs PR が落ちる。
  if (!paths.some((p) => isImplementationPath(p))) {
    return at('docs-only', true);
  }

  // モードだけの変更（blob 同一）を「進捗を更新した」と読ませない。**`missing` より
  // 先に判定する。** 「更新が含まれていません」ではなく「中身が変わっていません」の方が、
  // 何をすればよいかが分かるため（どちらも失敗であることは変わらない）。
  if (unchanged.length > 0) return at('unchanged', false);
  if (works.length === 0) return at('missing', false);
  // 数えない差分を同乗させて 2 作業を 1 PR に混ぜる経路を塞ぐ
  if (strays.length > 0) return at('stray', false);
  if (works.length > 1) return at('multiple', false);

  // 数が合っていても、その progress がこの PR の作業のものとは限らない
  const attribution = checkAttribution(works[0], { headBranch, branchOf });
  if (!attribution.ok) return at('foreign', false, attribution.branch);

  return at('coupled', true, attribution.branch);
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
 * merge-base と HEAD で blob（中身）が違うかを問う関数を組み立てる。
 *
 * `git rev-parse <rev>:<path>` はそのリビジョンでのパスの blob OID を返す。
 * OID が同じなら中身は 1 バイトも変わっていない。モードだけの変更
 * （`git update-index --chmod=+x`）は OID を変えないので、これで落とせる。
 *
 * **中身は読まない。** 変わったかどうかだけを見る（進捗の書き方の検証は spec の
 * 「範囲外」）。どちらかが読めなければ false を返す。この検査では false が
 * 落ちる側（fail-closed）である。
 *
 * @param {string} mergeBase
 * @param {(args: string[], options?: {quiet?: boolean}) => string} execGit
 * @returns {(path: string) => boolean}
 */
function makeContentChanged(mergeBase, execGit) {
  const blobAt = (rev, filePath) => {
    try {
      // 「読めない」は判定結果として扱うので、git の fatal を画面に出さない
      return execGit(['rev-parse', `${rev}:${filePath}`], { quiet: true }).trim();
    } catch {
      return '';
    }
  };
  return (filePath) => {
    const base = blobAt(mergeBase, filePath);
    const head = blobAt('HEAD', filePath);
    if (base === '' || head === '') return false;
    return base !== head;
  };
}

/**
 * 作業の進捗の **Branch** を、**base 側（merge-base）**の内容から読む関数を組み立てる。
 *
 * **候補側（HEAD）から読んではならない。** progress.md は保護対象から除外されているので、
 * HEAD 側を読むと、別作業の progress の Branch 行を head ブランチ名に 1 行書き換える
 * だけで帰属の照合を通せる（照合相手を攻撃者が同じ PR で用意できる ＝ 自己申告）。
 *
 * 読む先を merge-base に固定すると、その PR の中では偽造できない。根拠は
 * CLAUDE.md「コミットとマージ」——spec + progress は計画用ブランチの docs PR で
 * 先に main へ入れ、着手時にその **Branch** から実際のブランチを切る。つまり
 * **Branch** は着手時点で main に確定しており、実装 PR 内での変更は帰属の判定に
 * 影響しない。`progressWorks()` が `baseHas()` で merge-base の存在を既に要求して
 * いるので、数えられた作業の progress は必ず merge-base に在る。
 *
 * 読めなければ null を返し、`checkAttribution()` が不一致として落とす（fail-closed）。
 *
 * @param {string} mergeBase
 * @param {(args: string[], options?: {quiet?: boolean}) => string} execGit
 * @returns {(work: string) => string | null}
 */
function makeBranchOf(mergeBase, execGit) {
  return (work) => {
    try {
      // 「読めない」は判定結果として扱うので、git の fatal を画面に出さない
      const text = execGit(['show', `${mergeBase}:${TASK_DIR}${work}/${PROGRESS_FILE}`], {
        quiet: true,
      });
      return readBranch(text);
    } catch {
      return null;
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
 * @param {string | null} [input.headBranch] - PR の head ブランチ。空なら帰属を照合しない
 * @param {(args: string[], options?: {quiet?: boolean}) => string} [input.execGit]
 * @param {(path: string) => boolean} [input.baseHas] - テストからの注入用。
 *   省略時は merge-base を解決して `git cat-file -e` で問い合わせる。
 * @param {(path: string) => boolean} [input.contentChanged] - テストからの注入用。
 *   省略時は merge-base と HEAD の blob OID を `git rev-parse` で比べる。
 * @param {(work: string) => string | null} [input.branchOf] - テストからの注入用。
 *   省略時は merge-base を解決して `git show <merge-base>:task/<work>/progress.md`
 *   から読む（**候補側からは読まない**。`makeBranchOf()` の注記を見よ）。
 * @returns {{ok: boolean, reason: string | null, works: string[], strays: string[], unchanged: string[], branch: string | null, headBranch: string | null, error: 'usage'|'diff'|null}}
 */
export function resolveCoupling({
  baseRef,
  labels,
  headBranch = null,
  execGit = defaultExecGit,
  baseHas,
  contentChanged,
  branchOf,
}) {
  const failed = (error) => ({
    ok: false,
    reason: null,
    works: [],
    strays: [],
    unchanged: [],
    branch: null,
    headBranch,
    error,
  });
  if (!baseRef) return failed('usage');
  let changes;
  let has = baseHas;
  let changed = contentChanged;
  let readWorkBranch = branchOf;
  try {
    const raw = execGit(['diff', '--name-status', '-M', '-z', `${baseRef}...HEAD`]);
    changes = parseNameStatus(raw);
    // 存在確認も blob の比較も **Branch** の読み取りも、差分（`base...HEAD` の三点）に
    // 合わせて分岐点で行う。base の先端を見ると、分岐後に main 側で入った変更を混ぜてしまう。
    if (!has || !changed || !readWorkBranch) {
      const mergeBase = execGit(['merge-base', baseRef, 'HEAD']).trim();
      if (!mergeBase) throw new Error('merge-base を解決できませんでした');
      if (!has) has = makeBaseHas(mergeBase, execGit);
      if (!changed) changed = makeContentChanged(mergeBase, execGit);
      if (!readWorkBranch) readWorkBranch = makeBranchOf(mergeBase, execGit);
    }
  } catch {
    // 差分が取れないまま素通りさせない（shallow clone・出力の破損）
    return failed('diff');
  }
  return {
    ...evaluateCoupling({
      changes,
      labels,
      baseHas: has,
      contentChanged: changed,
      headBranch,
      branchOf: readWorkBranch,
    }),
    error: null,
  };
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

/**
 * PR の head ブランチ名を環境変数から読む。
 *
 * `GITHUB_HEAD_REF` は GitHub Actions が `pull_request` イベントで必ず入れる既定の
 * 環境変数である（`guard.yml` でも `env:` に明示して依存を見えるようにしてある。
 * `${{ }}` は `run:` へ直接展開しない）。ローカルで手で回すときは空になる。
 *
 * @returns {string | null}
 */
function readHeadBranch() {
  const raw = process.env.GITHUB_HEAD_REF;
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value === '' ? null : value;
}

const MESSAGES = {
  'bypass-label': bypassLabelMessage(BYPASS_LABEL),
  'docs-only': docsOnlyMessage(),
  coupled: coupledMessage(),
};

/**
 * GitHub Actions の上で動いているか。
 * 値の大小文字は問わない（`TRUE` で fail-closed が効かなくならないように）。
 *
 * @returns {boolean}
 */
function onGitHubActions() {
  return (process.env.GITHUB_ACTIONS ?? '').trim().toLowerCase() === 'true';
}

function main() {
  const baseRef = process.argv[2];
  const headBranch = readHeadBranch();

  // CI では `pull_request` イベントで必ず入る。空なら配線の異常（他のイベントで
  // 動かしている・env を外した）なので、帰属の検査を黙って飛ばさず落とす。
  // ローカル実行で飛ばすのは、ゲートの実体が CI 側だから許される。
  if (!headBranch && onGitHubActions()) {
    console.error('GITHUB_HEAD_REF が空です。進捗の Branch と照合できません。');
    console.error('このチェックは pull_request イベントで動かしてください。');
    process.exit(1);
  }

  const result = resolveCoupling({ baseRef, labels: readLabels(), headBranch });

  if (result.error === 'usage') {
    console.error(couplingUsage());
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

  if (result.reason === 'unchanged') {
    for (const line of unchangedProgressLines()) console.error(line);
    for (const p of result.unchanged) console.error(`  - ${p}`);
    for (const line of unchangedProgressAdviceLines()) console.error(line);
  } else if (result.reason === 'missing') {
    for (const line of missingProgressLines()) console.error(line);
    if (result.strays.length > 0) {
      console.error('次の変更は、その形でないため数えていません:');
      for (const stray of result.strays) console.error(`  - ${stray}`);
      console.error('（新規追加・削除・種別の変更（symlink への置き換えなど）・移動）');
    }
    for (const line of newProgressNotCountedLines()) console.error(line);
  } else if (result.reason === 'stray') {
    for (const line of strayProgressLines()) console.error(line);
    for (const stray of result.strays) console.error(`  - ${stray}`);
    for (const line of strayProgressAdviceLines()) console.error(line);
  } else if (result.reason === 'foreign') {
    for (const line of foreignProgressLines(result.works[0], result.branch, result.headBranch)) {
      console.error(line);
    }
  } else {
    for (const line of multipleProgressLines(result.works.length)) console.error(line);
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
