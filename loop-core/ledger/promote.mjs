/**
 * 昇格（backlog → task）の機械的な部分を 1 コマンドにする。
 *
 * 使い方: node loop-core/bin/loop.mjs promote <id>-<slug>
 *
 * アーカイブ（`tools/archive.mjs`）が自動化されているのに、昇格だけ毎回手作業だった。
 * 手順のうち機械的なもの（移動・定型行の削除・progress の雛形生成）をここに落とす。
 * **判断を要するもの**（完了条件の確定、「失敗時」「例」の内容の確定、Complexity の
 * 等級付け）は落とさない。プレースホルダを残すことで「まだ未確定である」と分かる。
 *
 * 条件を満たさないときはファイルを一切変更せず、終了コード非 0 で理由を表示する。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// フェンスの解釈は lint と 1 つにする。複製すると「lint は見出しと見ないのに
// promote は節の先頭と見る」という解釈の割れが起きる
import { linesOutsideFences } from './lint-docs.mjs';
// 生成した Branch を実際に使うのは start-task。受理集合は向こうに合わせる
import { isValidBranchName } from './start-task.mjs';

/** backlog の spec の「背景」に置く、候補である印の 1 行 */
export const BACKLOG_LINE = 'この項目は backlog。着手しない。progress は作らない。完了条件は未確定。';

/** backlog の spec の各節に置く、未確定である印の 1 行（`tools/lint-docs.mjs` と同じ文字列） */
export const INCOMPLETE_LINE = '未確定（incomplete）。昇格時に埋める。';

/**
 * 作業名（`<id>-<slug>`）として受け付ける形。
 *
 * `tools/archive.mjs` の `isWorkName` と同じ広さに揃える。ここだけ slug の
 * 文字種を絞ると、start-task が選べて archive が通す作業を昇格だけ拒む状態が生まれる。
 * パス区切りを禁じることで `..` による脱出も防ぐ。
 */
const WORK_NAME_RE = /^\d{4}-[^/\\]+$/;

/**
 * 作業名として正しいかを判定する純関数。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isWorkName(name) {
  if (typeof name !== 'string') return false;
  // 前後の空白は名前の一部にしない。見えない差でディレクトリを取り違えない
  if (name !== name.trim()) return false;
  return WORK_NAME_RE.test(name);
}

/** 正規表現に埋める文字列をエスケープする */
function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `## <名前>` の節の中から、指定の行（とその直後の空行 1 つ）を取り除く純関数。
 *
 * **節を限定するのと、フェンスの中を見ないのが要点である。**
 *
 * - 節の限定: 同じ「未確定」行は「失敗時」「例」にも置かれている。全文置換に
 *   するとそちらまで消えるが、あの 2 節の確定は内容の判断と不可分なので範囲外である
 * - フェンス: spec の本文にコードフェンスで見出しの例を貼ることがある。素朴に
 *   `^## <名前>$` を探すと、そのフェンス内の 1 行を節の先頭と誤認し、本物の節を
 *   素通りしたまま成功を返す。解釈は `tools/lint-docs.mjs` の `linesOutsideFences`
 *   に委ね、lint と同じ行集合を見る
 *
 * 空行まで落とすのは、消したあとに空行が 2 つ連なるのを避けるためである。
 *
 * @param {string} markdown
 * @param {string} heading - `##` 見出しの名前
 * @param {string} line - 取り除く行の先頭（この文字列で始まる 1 行を消す）
 * @returns {string}
 */
function removeLineInSection(markdown, heading, line) {
  const lines = markdown.split('\n');
  // linesOutsideFences は 1 始まりの行番号を返す
  const outside = new Set(linesOutsideFences(markdown).map((l) => l.number));
  const isOutside = (index) => outside.has(index + 1);

  const headingRe = new RegExp(`^## ${escapeRe(heading)}\\s*$`);
  const start = lines.findIndex((text, i) => isOutside(i) && headingRe.test(text));
  if (start === -1) return markdown;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (isOutside(i) && /^## /.test(lines[i])) {
      end = i;
      break;
    }
  }

  for (let i = start + 1; i < end; i += 1) {
    if (!isOutside(i) || !lines[i].startsWith(line)) continue;
    const count = i + 1 < end && lines[i + 1].trim() === '' ? 2 : 1;
    lines.splice(i, count);
    return lines.join('\n');
  }
  return markdown;
}

/**
 * 「背景」から backlog 行を取り除く純関数。
 *
 * @param {string} markdown - spec.md の中身
 * @returns {string}
 */
export function stripBacklogLine(markdown) {
  return removeLineInSection(markdown, '背景', BACKLOG_LINE);
}

/**
 * 「完了条件」から未確定行を取り除く純関数。
 *
 * 5 番のプレースホルダ（`<この変更固有の、検証可能な命題。>`）は消さない。
 * 残っていることが「完了条件がまだ未確定である」という印になる。
 *
 * @param {string} markdown - spec.md の中身
 * @returns {string}
 */
export function stripIncompleteLine(markdown) {
  return removeLineInSection(markdown, '完了条件', INCOMPLETE_LINE);
}

/**
 * 生成する progress の **Branch**。
 *
 * `tools/start-task.mjs` がこの値をそのまま `git worktree add -b` に渡すので、
 * 向こうの `isValidBranchName` を通らない値を書いてはいけない。書いてしまうと
 * 「昇格は成功したのに、その作業だけ開始できない」という直し方の分からない
 * 状態になる。生成前に検証する。
 *
 * @param {string} name - 作業名（`<id>-<slug>`）
 * @returns {string}
 */
export function branchFor(name) {
  return `feat/${name}`;
}

/**
 * git が ref 名として受けるかを判定する純関数。
 *
 * `tools/start-task.mjs` の `isValidBranchName` は文字種と `..` / `//` / 末尾 `/` /
 * 末尾 `.lock` を見るが、**git はさらに「区切りの先頭が `.`」「末尾が `.`」も拒む**。
 * `0040-foo.` のような作業名は `isWorkName` も `isValidBranchName` も通るのに
 * `git worktree add -b feat/0040-foo.` が失敗するので、昇格は成功したのに
 * その作業だけ開始できない状態になる。ここで先に弾く。
 *
 * 受理集合の本体は向こうに合わせたままにし、ここは**上乗せの制約**だけを持つ。
 *
 * @param {string} ref
 * @returns {boolean}
 */
export function isGitSafeRef(ref) {
  if (typeof ref !== 'string' || ref === '') return false;
  if (ref.endsWith('.')) return false;
  return ref.split('/').every((segment) => segment !== '' && !segment.startsWith('.'));
}

/** 生成する progress のメタ情報。値は `<作業名>` を受け取って埋める */
const PROGRESS_META = Object.freeze([
  ['Target Spec', (name) => `\`task/${name}/spec.md\``],
  ['Branch', (name) => `\`${branchFor(name)}\``],
  ['PR', () => '`未作成`'],
  ['Status', () => '`Not Started` (Phase: `Plan`)'],
  // Complexity は等級の判断そのものなので埋めない。プレースホルダのまま残す
]);

/**
 * `task/TEMPLATE-progress.md` から進捗の中身を作る純関数。
 *
 * テンプレートの `---` より下（型の部分）だけを使う。上は書き方の説明であり、
 * 個々の進捗に持ち込むものではない。見出し名・順番はテンプレートのまま変えない。
 *
 * 埋める行が 1 つでも見つからなければ失敗を返す。空振りしたまま生成すると、
 * メタ情報の欠けた進捗ができて lint と start-task が落ちる。
 *
 * @param {object} input
 * @param {string} input.template - `task/TEMPLATE-progress.md` の中身
 * @param {string} input.name - 作業名（`<id>-<slug>`）
 * @returns {{ok: true, text: string} | {ok: false, reason: string}}
 */
export function buildProgress({ template, name }) {
  const separator = /^---\s*$/m.exec(template);
  if (separator === null) {
    return { ok: false, reason: '進捗テンプレートに `---` の区切りがありません' };
  }
  let text = template.slice(separator.index + separator[0].length).replace(/^\n+/, '');

  const headingRe = /^# Progress: .*$/m;
  if (!headingRe.test(text)) {
    return { ok: false, reason: '進捗テンプレートに `# Progress: ` の見出しがありません' };
  }
  text = text.replace(headingRe, `# Progress: \`${name}\``);

  const missing = [];
  for (const [key, value] of PROGRESS_META) {
    const re = new RegExp(`^- \\*\\*${key}:\\*\\*.*$`, 'm');
    if (!re.test(text)) {
      missing.push(key);
      continue;
    }
    text = text.replace(re, `- **${key}:** ${value(name)}`);
  }
  if (missing.length > 0) {
    return { ok: false, reason: `進捗テンプレートに ${missing.join(' / ')} の行がありません` };
  }

  return { ok: true, text };
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
  return execFileSync(cmd, args, { ...opts, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * 昇格を実行する。条件を満たさないときは何も変更しない。
 *
 * @param {string} name - 作業名（`<id>-<slug>`）
 * @param {object} [opts]
 * @param {string} [opts.root] - リポジトリのルート
 * @param {(cmd: string, args: string[], opts?: {cwd?: string}) => unknown} [opts.exec]
 * @param {(file: string, data: string) => void} [opts.writeFile] - 書き込み。テストで失敗を注入する
 * @returns {{ok: true, moved: string[]} | {ok: false, reason: string}}
 */
export function promote(
  name,
  { root = process.cwd(), exec = defaultExec, writeFile = fs.writeFileSync } = {},
) {
  if (!isWorkName(name)) {
    return { ok: false, reason: `作業名が <id>-<slug> の形ではありません: ${name}` };
  }

  const backlogDir = path.join(root, 'backlog', name);
  const taskDir = path.join(root, 'task', name);
  const backlogSpec = path.join(backlogDir, 'spec.md');
  const templatePath = path.join(root, 'task', 'TEMPLATE-progress.md');

  // ここから下、`git mv` に到達するまでは一切ファイルを変更しない
  if (!fs.existsSync(backlogDir)) {
    return { ok: false, reason: `backlog/${name}/ がありません` };
  }
  if (fs.existsSync(taskDir)) {
    return { ok: false, reason: `task/${name}/ が既にあります。上書きしません` };
  }
  if (!fs.existsSync(backlogSpec)) {
    return { ok: false, reason: `backlog/${name}/spec.md がありません` };
  }
  if (!fs.existsSync(templatePath)) {
    return { ok: false, reason: 'task/TEMPLATE-progress.md がありません' };
  }
  // backlog は progress.md を持たない（CLAUDE.md）。あるなら生成で黙って
  // 上書きすることになるので、触らずに失敗する
  if (fs.existsSync(path.join(backlogDir, 'progress.md'))) {
    return {
      ok: false,
      reason: `backlog/${name}/progress.md があります。backlog は progress を持ちません。取り除いてから実行してください`,
    };
  }
  // 生成する Branch が start-task で使える形かを、動かす前に確かめる
  const branch = branchFor(name);
  if (!isValidBranchName(branch) || !isGitSafeRef(branch)) {
    return {
      ok: false,
      reason: `生成する Branch がブランチ名として不正です: ${branch}。slug を見直してください`,
    };
  }

  let specText;
  let templateText;
  try {
    specText = fs.readFileSync(backlogSpec, 'utf8');
    templateText = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `読めませんでした（変更していません）: ${err.message}` };
  }

  // 生成できることを、動かす前に確かめる。テンプレートが壊れていたら
  // 移動だけ済んで progress の無い作業ディレクトリが残る
  const progress = buildProgress({ template: templateText, name });
  if (!progress.ok) {
    return { ok: false, reason: progress.reason };
  }

  const rewrittenSpec = stripIncompleteLine(stripBacklogLine(specText));

  try {
    exec('git', ['mv', `backlog/${name}`, `task/${name}`], { cwd: root });
  } catch (err) {
    return { ok: false, reason: `移動できませんでした（変更していません）: ${err.message}` };
  }

  // 巻き戻しは**中身も**戻す。移動だけ戻して spec の書き換えを残すと、
  // 「昇格しませんでした」と言いながら backlog の spec から backlog 行が
  // 消えている状態になり、「何も変更せず失敗する」契約を破る
  /**
   * @param {{restoreSpec: boolean}} opts - spec の書き込みに着手済みなら復元する。
   *   着手前（progress の書き込みで落ちた）なら spec は無傷なので触らない
   */
  const rollback = ({ restoreSpec }) => {
    const failures = [];
    try {
      fs.rmSync(path.join(taskDir, 'progress.md'), { force: true, recursive: true });
    } catch (err) {
      failures.push(`progress.md を消せませんでした: ${err.message}`);
    }
    if (restoreSpec) {
      try {
        writeFile(path.join(taskDir, 'spec.md'), specText);
      } catch (err) {
        failures.push(`spec.md を戻せませんでした: ${err.message}`);
      }
    }
    try {
      exec('git', ['mv', `task/${name}`, `backlog/${name}`], { cwd: root });
    } catch (err) {
      failures.push(`task/${name}/ を backlog/ へ戻せませんでした: ${err.message}`);
    }
    // **逆方向の `git mv` が成功しても「完全に戻った」ではない。**
    // `git mv <dir>` はディレクトリごと rename するので、消し損ねた progress.md は
    // backlog/ へ一緒に戻り、書き戻せなかった spec.md は壊れた中身のまま戻る。
    // 前段の失敗を捨てると、その状態を「何も変更せず失敗した」と報告してしまう
    return failures;
  };

  // spec の書き込みに着手したかを覚えておく。着手前なら復元は不要で、
  // 「戻せませんでした」と余計な警告を出さずに済む
  let specAttempted = false;
  try {
    // 新規作成の progress を先に書く。ここで失敗しても spec はまだ無傷である
    writeFile(path.join(taskDir, 'progress.md'), progress.text);
    specAttempted = true;
    writeFile(path.join(taskDir, 'spec.md'), rewrittenSpec);
  } catch (err) {
    // 巻き戻せなかったなら、巻き戻したと嘘をつかない。
    // 「何も変更せず失敗した」と読まれると、人間が残骸に気づかない
    const failures = rollback({ restoreSpec: specAttempted });
    if (failures.length > 0) {
      return {
        ok: false,
        reason: `書き換えに失敗し、巻き戻しにも失敗しました（手で確認してください）: ${err.message} / ${failures.join(' / ')}`,
      };
    }
    return { ok: false, reason: `書き換えに失敗したため移動を巻き戻しました: ${err.message}` };
  }

  return {
    ok: true,
    moved: [
      `backlog/${name}/ -> task/${name}/`,
      `task/${name}/progress.md を生成`,
    ],
  };
}

function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('使い方: node loop-core/bin/loop.mjs promote <id>-<slug>');
    process.exit(1);
  }

  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (err) {
    // 他の失敗と出力を揃える。git リポジトリ外での実行でスタックトレースを出さない
    console.error(`昇格しませんでした: リポジトリのルートを取得できませんでした: ${err.message}`);
    process.exit(1);
  }

  const result = promote(name, { root });
  if (!result.ok) {
    console.error(`昇格しませんでした: ${result.reason}`);
    process.exit(1);
  }

  console.log(`${name} を昇格しました:`);
  for (const line of result.moved) {
    console.log(`  ${line}`);
  }
  console.log('\n次: 完了条件の 5 番と progress の **Complexity** を埋める（判断が要る）');
  console.log('  Complexity がプレースホルダのままだと `npm run lint:docs` は落ちる。埋めるまでが昇格である');
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
