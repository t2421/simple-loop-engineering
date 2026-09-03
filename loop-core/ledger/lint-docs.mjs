/**
 * spec / progress / backlog がテンプレートに準拠しているかを機械検証する。
 *
 * CLI としては `node tools/lint-docs.mjs [ルート]`（`npm run lint:docs`）で実行する。
 * 違反があればパスと理由をすべて列挙し、終了コード 1 で終わる。違反なしなら 0。
 *
 * ## 構造: 読み取りと判定を分ける
 *
 * ファイルの内容を受け取って理由の配列を返す純関数（`checkSpecHeadings` など）を
 * 公開し、`lintDocs()` はディレクトリを歩いてそれらを呼ぶだけにしてある。
 * テストは一時ディレクトリ上にレイアウトを組んで `lintDocs()` を呼ぶ。
 *
 * ## 検証しないもの
 *
 * - 内容の質（完了条件が良い命題か）
 * - 旧レイアウト（`specs/`・`progress/`）と型（`task/TEMPLATE-*.md`）
 *
 * どちらも凍結資産で、この lint が直せるものではない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findUnfilledHoles, unfilledHoleReasons } from '../lib/holes.mjs';
import { CLAUDE_MD } from '../lib/layout.mjs';

/** spec.md の `##` 見出しは、この名前がこの順で並ぶ */
export const SPEC_HEADINGS = Object.freeze([
  '種別',
  '対象',
  '背景',
  '仕様',
  '範囲外',
  '失敗時',
  '例',
  '完了条件',
]);

/** progress.md のメタ情報。1 つでも欠けたら違反 */
export const METADATA_KEYS = Object.freeze(['Target Spec', 'Branch', 'PR', 'Status']);

/** progress.md の Status が取りうる値 */
export const STATUS_VALUES = Object.freeze(['Not Started', 'In Progress', 'Blocked', 'Done']);

/**
 * progress.md の Complexity が取りうる値（作業の等級）。
 *
 * **METADATA_KEYS には入れない。** この項目が入る前に書かれた進捗は 1 つも
 * 持っておらず、必須にすると既存の全作業が違反になる。`tools/start-task.mjs` は
 * 無いものを `M` とみなす。ここで見るのは「書いてあるなら 3 値のどれか」だけである。
 */
export const COMPLEXITY_VALUES = Object.freeze(['S', 'M', 'L']);

/** backlog の「完了条件」節はこの 1 行で始まる（仕様ではなく候補である印） */
export const BACKLOG_INCOMPLETE_LINE = '未確定（incomplete）。昇格時に埋める。';

/**
 * 作業ディレクトリの名前。ゼロ埋め 4 桁 ID + slug。
 *
 * slug の文字種は**絞らない**。CLAUDE.md が制約するのは 4 桁の ID だけで、
 * slug は一覧用のラベルである。同じ名前を扱う他のツールは
 * `tools/start-task.mjs` が `^(\d{4})-(.+)$`、`tools/archive.mjs` が
 * `^\d{4}-[^/\\]+$`（前後空白は禁止）で受ける。ここで `[a-z0-9-]` などに絞ると
 * `0026-api_v2` のような作業が「start-task は選び archive は通すのに lint だけ
 * 落ちる」状態になり、そのリポジトリの全 PR が緑にならなくなる。
 * 狭い側ではなく、**選択側・アーカイブ側と同じ広さ**に揃える。
 */
export const WORK_DIR_PATTERN = /^(\d{4})-([^/\\]+)$/;

/**
 * 作業ディレクトリ名を判定する純関数。`tools/archive.mjs` の `isWorkName` と同じ広さ。
 *
 * @param {string} name
 * @returns {RegExpExecArray | null} 一致したら [全体, ID, slug]、しなければ null
 */
export function matchWorkDirName(name) {
  if (typeof name !== 'string') return null;
  // 前後の空白は名前の一部にしない。見えない差でディレクトリを取り違えない
  if (name !== name.trim()) return null;
  return WORK_DIR_PATTERN.exec(name);
}

/** チェックボックスとして許す印 */
const CHECKBOX_MARKS = Object.freeze([' ', '/', 'x']);

/**
 * **PR** 行を持たない、移行前からある進捗。
 *
 * この 2 件はメタ情報の規約（と PR を通す運用）が固まる前に書かれ、
 * そのままアーカイブされた。**存在しなかった PR** なので書ける値が無い。
 *
 * 技術的には編集できる（`tools/check-protected-paths.mjs` の `task/` エントリは
 * `exclude: 'progress.md'` を持ち、CLAUDE.md も除外は各作業ディレクトリ直下の
 * `progress.md` だけと書いている）。それでも書き換えないのは、lint を黙らせるために
 * 完了済みの記録に無かった事実を足すのが本末転倒だからである。
 * ルール側で緩めるのでもなく、記録を作るのでもなく、ここで列挙して例外にする。
 *
 * 例外は**このパスの PR 行だけ**に効く。他のファイルや他のメタ情報には広がらない
 * （テストで担保している）。新しく書かれる進捗は 4 項目すべてを要求される。
 */
export const LEGACY_PROGRESS_WITHOUT_PR = Object.freeze([
  'task/archive/0001-math-add/progress.md',
  'task/archive/0002-math-sub/progress.md',
]);

/**
 * コードフェンス（``` / ~~~）の外にある行だけを返す純関数。
 *
 * progress にはコマンド出力をフェンスで貼る運用があり（CLAUDE.md「報告の作法」が
 * それを要求している）、貼った出力の中の `#`・`- **Status:** …`・`- [X] …` は
 * 文書構造ではない。すべての走査をこの関数の上に載せ、偽の違反を出さない。
 *
 * @param {string} markdown
 * @returns {Array<{number: number, text: string}>} 1 始まりの行番号と行の内容
 */
export function linesOutsideFences(markdown) {
  const kept = [];
  let fence = null;
  markdown.split('\n').forEach((text, index) => {
    const opener = /^\s*(```+|~~~+)/.exec(text);
    if (opener) {
      const mark = opener[1][0];
      if (fence === null) fence = mark;
      else if (fence === mark) fence = null;
      return;
    }
    if (fence !== null) return;
    kept.push({ number: index + 1, text });
  });
  return kept;
}

/**
 * Markdown の見出しを取り出す純関数。
 * コードフェンス（``` / ~~~）の中は見出しとして数えない。
 *
 * @param {string} markdown
 * @returns {Array<{level: number, text: string}>}
 */
export function extractHeadings(markdown) {
  const headings = [];
  for (const { text } of linesOutsideFences(markdown)) {
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(text);
    if (heading) headings.push({ level: heading[1].length, text: heading[2] });
  }
  return headings;
}

/**
 * spec.md の見出しがテンプレートと一致するかを判定する純関数。
 *
 * @param {string} markdown
 * @returns {string[]} 違反の理由。空なら通過
 */
export function checkSpecHeadings(markdown) {
  const headings = extractHeadings(markdown);
  const reasons = [];

  const titles = headings.filter((h) => h.level === 1);
  if (titles.length !== 1) {
    reasons.push(`見出し不一致: \`#\` 見出しが ${titles.length} 個ある（1 つにする）`);
  }

  const sections = headings.filter((h) => h.level === 2).map((h) => h.text);
  const expected = SPEC_HEADINGS.join(' / ');
  // 要素ごとに比べる。join した文字列で比べると、見出し名自体に空白が入りうるため
  // `## 種別 対象` の 1 見出しが `## 種別` + `## 対象` の 2 見出しと同じ文字列になる
  const sameSections = sections.length === SPEC_HEADINGS.length
    && sections.every((text, i) => text === SPEC_HEADINGS[i]);
  if (!sameSections) {
    reasons.push(`見出し不一致: \`##\` は ${expected} の順。実際は ${sections.join(' / ') || '（なし）'}`);
  }

  return reasons;
}

/**
 * `- **キー:** 値` のメタ情報を読む純関数。同じキーが複数あれば最初を採る。
 * コードフェンスの中は読まない（貼ったログの中の同じ形をメタ情報にしない）。
 *
 * **行頭の `- ` だけを有効とする。** `*` 印や字下げを許すと、lint は通るのに
 * `tools/start-task.mjs` と `tools/archive.mjs` が読めない文書ができる。
 * どちらも行頭の `- ` で始まる行しか拾わない。判定の広さを、実際に読む側へ揃える。
 *
 * @param {string} markdown
 * @returns {Map<string, string>}
 */
export function parseMetadata(markdown) {
  const metadata = new Map();
  for (const { text } of linesOutsideFences(markdown)) {
    const entry = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(text);
    if (entry && !metadata.has(entry[1])) metadata.set(entry[1], entry[2].trim());
  }
  return metadata;
}

/**
 * バッククォートを剥がす純関数。
 *
 * @param {string} value
 * @returns {string}
 */
export function stripCode(value) {
  const quoted = /^`(.*)`$/.exec(value.trim());
  return (quoted ? quoted[1] : value).trim();
}

/**
 * Status の値を比較できる形にする純関数。
 * 末尾の `(Phase: ...)` とバッククォートを落とす。
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeStatus(value) {
  return stripCode(value.replace(/\s*\(Phase:.*\)\s*$/, ''));
}

/**
 * 許されない印のチェックボックスを探す純関数。
 *
 * `[...]` の中身が 0〜1 文字で、閉じ括弧の直後が空白の行だけを対象にする。
 * こうしないと `- [説明](https://…)` のリンク記法を拾ってしまう。
 * コードフェンスの中も見ない（貼った出力の中の `- [-] …` は進捗のチェックではない）。
 *
 * @param {string} markdown
 * @returns {Array<{line: number, token: string}>}
 */
export function findBadCheckboxes(markdown) {
  const bad = [];
  for (const { number, text } of linesOutsideFences(markdown)) {
    const box = /^\s*[-*]\s+\[(.?)\](\s|$)/.exec(text);
    if (box && !CHECKBOX_MARKS.includes(box[1])) {
      bad.push({ line: number, token: `[${box[1]}]` });
    }
  }
  return bad;
}

/**
 * backlog の「完了条件」節が未確定の印で始まるかを判定する純関数。
 * 見出しの探索も本文の探索もコードフェンスの外だけで行う。
 *
 * @param {string} markdown
 * @returns {string[]} 違反の理由。空なら通過
 */
export function checkBacklogCompletion(markdown) {
  const outside = linesOutsideFences(markdown);
  const heading = outside.find((line) => /^##\s+完了条件\s*$/.test(line.text));
  if (heading === undefined) return []; // 見出し自体の欠落は checkSpecHeadings が報告する

  // 節の先頭は「元の行」で探す。フェンスの中を落とした列だけを見ると、
  // 見出しの直後にフェンス塊があるときにその塊ごと消え、**フェンスの後**の行を
  // 節の先頭と誤認する。フェンスで始まる節は未確定行で始まっていない。
  const raw = markdown.split('\n');
  const first = raw.slice(heading.number).find((line) => line.trim() !== '');
  if (first?.trim() === BACKLOG_INCOMPLETE_LINE) return [];
  return [`backlog の「完了条件」は \`${BACKLOG_INCOMPLETE_LINE}\` の 1 行で始める`];
}

/**
 * ディレクトリ一覧を読む。存在しないときの扱いを呼び出し側が選べる。
 *
 * @param {string} absDir
 * @param {{optional?: boolean}} [options]
 * @returns {string[]} ディレクトリ名だけ、名前順
 */
function readWorkDirNames(absDir, { optional = false } = {}) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (err) {
    if (optional && err.code === 'ENOENT') return [];
    throw new Error(`${absDir}: ${err.message}`, { cause: err });
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * 検証対象の作業ディレクトリを列挙する。
 *
 * `task/archive/` と `backlog/` は無くてもよい（アーカイブ済みが 0 件、候補が 0 件）。
 * `task/` が読めないのは対象ディレクトリの読み取り失敗として例外にする。
 *
 * @param {string} rootDir
 * @returns {Array<{kind: 'task'|'backlog', relDir: string, name: string}>}
 */
export function collectWorkDirs(rootDir) {
  const groups = [
    { kind: 'task', base: 'task', optional: false, skip: ['archive'] },
    { kind: 'task', base: 'task/archive', optional: true, skip: [] },
    { kind: 'backlog', base: 'backlog', optional: true, skip: [] },
  ];
  const workDirs = [];
  for (const group of groups) {
    const names = readWorkDirNames(path.join(rootDir, group.base), { optional: group.optional });
    for (const name of names) {
      if (group.skip.includes(name)) continue;
      workDirs.push({ kind: group.kind, relDir: `${group.base}/${name}`, name });
    }
  }
  return workDirs;
}

/**
 * ファイルを読む。無ければ null。
 *
 * @param {string} absPath
 * @returns {string | null}
 */
function readIfExists(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`${absPath}: ${err.message}`, { cause: err });
  }
}

/**
 * progress.md を検証する純関数。
 *
 * @param {object} input
 * @param {string} input.relPath - リポジトリからの相対パス（例外の照合に使う）
 * @param {string} input.markdown
 * @param {(relPath: string) => boolean} input.specExists - Target Spec の実在確認
 * @returns {string[]} 違反の理由
 */
export function checkProgress({ relPath, markdown, specExists }) {
  const reasons = [];
  const metadata = parseMetadata(markdown);

  for (const key of METADATA_KEYS) {
    if (metadata.has(key)) continue;
    if (key === 'PR' && LEGACY_PROGRESS_WITHOUT_PR.includes(relPath)) continue;
    reasons.push(`メタ情報 **${key}** が無い`);
  }

  const status = metadata.get('Status');
  if (status !== undefined && !STATUS_VALUES.includes(normalizeStatus(status))) {
    reasons.push(`Status が不正: \`${normalizeStatus(status)}\`（${STATUS_VALUES.join(' | ')}）`);
  }

  const complexity = metadata.get('Complexity');
  if (complexity !== undefined && !COMPLEXITY_VALUES.includes(stripCode(complexity))) {
    reasons.push(`Complexity が不正: \`${stripCode(complexity)}\`（${COMPLEXITY_VALUES.join(' | ')}）`);
  }

  const targetSpec = metadata.get('Target Spec');
  if (targetSpec !== undefined) {
    const specPath = stripCode(targetSpec);
    if (!specExists(specPath)) {
      reasons.push(`Target Spec のパスが実在しない: \`${specPath}\``);
    }
  }

  for (const box of findBadCheckboxes(markdown)) {
    reasons.push(`${box.line} 行目: チェックボックスが \`${box.token}\`（\`[ ]\`・\`[/]\`・\`[x]\` のいずれか）`);
  }

  return reasons;
}

/**
 * docs 全体を検証する。
 *
 * @param {string} rootDir - リポジトリのルート
 * @returns {Array<{path: string, reason: string}>} 違反の一覧。空なら通過
 * @throws {Error} 対象ディレクトリを読めないとき
 */
export function lintDocs(rootDir) {
  const workDirs = collectWorkDirs(rootDir);
  const violations = [];
  const push = (relPath, reasons) => {
    for (const reason of reasons) violations.push({ path: relPath, reason });
  };
  const specExists = (relPath) =>
    relPath !== '' && fs.existsSync(path.join(rootDir, relPath));

  /** @type {Map<string, string[]>} ID -> その ID を名乗る作業ディレクトリ */
  const owners = new Map();

  for (const { kind, relDir, name } of workDirs) {
    const matched = matchWorkDirName(name);
    if (matched) {
      const id = matched[1];
      owners.set(id, [...(owners.get(id) ?? []), relDir]);
    } else {
      push(relDir, ['ディレクトリ名が `NNNN-slug`（ゼロ埋め 4 桁 + slug）ではない']);
    }

    const specPath = `${relDir}/spec.md`;
    const specMarkdown = readIfExists(path.join(rootDir, specPath));
    if (specMarkdown === null) {
      push(specPath, ['spec.md が無い']);
    } else {
      push(specPath, checkSpecHeadings(specMarkdown));
      if (kind === 'backlog') push(specPath, checkBacklogCompletion(specMarkdown));
    }

    const progressPath = `${relDir}/progress.md`;
    const progressMarkdown = readIfExists(path.join(rootDir, progressPath));
    if (kind === 'backlog') {
      if (progressMarkdown !== null) {
        push(progressPath, ['backlog は progress.md を持たない（着手時に task/ へ昇格して置く）']);
      }
    } else if (progressMarkdown === null) {
      push(progressPath, ['progress.md が無い']);
    } else {
      push(progressPath, checkProgress({ relPath: progressPath, markdown: progressMarkdown, specExists }));
    }
  }

  for (const [id, dirs] of owners) {
    if (dirs.length < 2) continue;
    for (const dir of dirs) {
      push(dir, [`ID 重複: \`${id}\` を ${dirs.join(' と ')} が名乗っている`]);
    }
  }

  const claudePath = path.join(rootDir, CLAUDE_MD);
  if (fs.existsSync(claudePath)) {
    push(CLAUDE_MD, unfilledHoleReasons(findUnfilledHoles(fs.readFileSync(claudePath, 'utf8'))));
  }

  return violations.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
}

function defaultRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot();

  let violations;
  let checked;
  try {
    checked = collectWorkDirs(rootDir).length;
    violations = lintDocs(rootDir);
  } catch (err) {
    // 読めなかったものを「違反なし」と扱わない
    console.error(`対象ディレクトリの読み取りに失敗しました: ${err.message}`);
    process.exit(1);
  }

  if (violations.length === 0) {
    console.log(`docs の形式違反はありません（${checked} 件の作業ディレクトリを確認）。`);
    return;
  }

  console.error(`docs の形式違反を ${violations.length} 件検知しました:`);
  for (const violation of violations) {
    console.error(`  - ${violation.path}: ${violation.reason}`);
  }
  process.exit(1);
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
