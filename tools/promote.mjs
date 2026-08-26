/**
 * 昇格（backlog → task）の機械的な部分を 1 コマンドにする。
 *
 * 使い方: node tools/promote.mjs <id>-<slug>
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

/**
 * `## <名前>` の節の本文の範囲を返す純関数。
 * 見出しが無ければ null。
 *
 * @param {string} markdown
 * @param {string} heading
 * @returns {{start: number, end: number} | null} 本文の開始・終了インデックス
 */
function sectionRange(markdown, heading) {
  const headingRe = new RegExp(`^## ${heading}\\s*$`, 'm');
  const m = headingRe.exec(markdown);
  if (m === null) return null;
  const start = m.index + m[0].length;
  const next = /^## /m.exec(markdown.slice(start));
  return { start, end: next === null ? markdown.length : start + next.index };
}

/**
 * 1 行とその直後の空行 1 つを取り除く純関数。
 *
 * 空行まで落とさないと、消したあとに空行が 2 つ連なる。
 *
 * @param {string} text
 * @param {string} line
 * @returns {string}
 */
function removeLine(text, line) {
  // 行頭に固定する。本文の途中に同じ文字列が現れても巻き込まない
  const re = new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n\\n?`, 'm');
  return text.replace(re, '');
}

/**
 * 「背景」から backlog 行を取り除く純関数。
 *
 * @param {string} markdown - spec.md の中身
 * @returns {string}
 */
export function stripBacklogLine(markdown) {
  const range = sectionRange(markdown, '背景');
  if (range === null) return markdown;
  const body = markdown.slice(range.start, range.end);
  return markdown.slice(0, range.start) + removeLine(body, BACKLOG_LINE) + markdown.slice(range.end);
}

/**
 * 「完了条件」から未確定行を取り除く純関数。
 *
 * **節を限定するのが要点である。** 同じ 1 行は「失敗時」「例」にも置かれており、
 * 全文置換にするとそちらまで消える。あの 2 節の確定は内容の判断と不可分なので
 * 範囲外に置いてある（`tools/promote.mjs` は判断をしない）。
 *
 * 5 番のプレースホルダ（`<この変更固有の、検証可能な命題。>`）も消さない。
 * 残っていることが「完了条件がまだ未確定である」という印になる。
 *
 * @param {string} markdown - spec.md の中身
 * @returns {string}
 */
export function stripIncompleteLine(markdown) {
  const range = sectionRange(markdown, '完了条件');
  if (range === null) return markdown;
  const body = markdown.slice(range.start, range.end);
  return markdown.slice(0, range.start) + removeLine(body, INCOMPLETE_LINE) + markdown.slice(range.end);
}

/** 生成する progress のメタ情報。値は `<作業名>` を受け取って埋める */
const PROGRESS_META = Object.freeze([
  ['Target Spec', (name) => `\`task/${name}/spec.md\``],
  ['Branch', (name) => `\`feat/${name}\``],
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
 * @returns {{ok: true, moved: string[]} | {ok: false, reason: string}}
 */
export function promote(name, { root = process.cwd(), exec = defaultExec } = {}) {
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

  const rollback = () => {
    try {
      exec('git', ['mv', `task/${name}`, `backlog/${name}`], { cwd: root });
    } catch {
      // 巻き戻しにも失敗したら、下で状態を伝える
    }
  };

  try {
    fs.writeFileSync(path.join(taskDir, 'spec.md'), rewrittenSpec);
    fs.writeFileSync(path.join(taskDir, 'progress.md'), progress.text);
  } catch (err) {
    // 書けなかったら移動ごと取り消す。backlog の印が残ったままの spec が
    // task/ に置かれた状態を残さない
    rollback();
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
    console.error('使い方: node tools/promote.mjs <id>-<slug>');
    process.exit(1);
  }

  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
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
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
