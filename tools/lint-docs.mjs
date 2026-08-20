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
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/** backlog の「完了条件」節はこの 1 行で始まる（仕様ではなく候補である印） */
export const BACKLOG_INCOMPLETE_LINE = '未確定（incomplete）。昇格時に埋める。';

/** 作業ディレクトリの名前。ゼロ埋め 4 桁 ID + slug */
export const WORK_DIR_PATTERN = /^(\d{4})-([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** チェックボックスとして許す印 */
const CHECKBOX_MARKS = Object.freeze([' ', '/', 'x']);

/**
 * **PR** 行を持たない、移行前からある進捗。
 *
 * この 2 件はメタ情報の規約が固まる前に書かれ、そのままアーカイブされた。
 * `task/` 配下は凍結対象なので後から足せない。ここで列挙して例外にする。
 *
 * 例外は**このパスの PR 行だけ**に効く。他のファイルや他のメタ情報には広がらない
 * （テストで担保している）。新しく書かれる進捗は 4 項目すべてを要求される。
 */
export const LEGACY_PROGRESS_WITHOUT_PR = Object.freeze([
  'task/archive/0001-math-add/progress.md',
  'task/archive/0002-math-sub/progress.md',
]);

/**
 * Markdown の見出しを取り出す純関数。
 * コードフェンス（``` / ~~~）の中は見出しとして数えない。
 *
 * @param {string} markdown
 * @returns {Array<{level: number, text: string}>}
 */
export function extractHeadings(markdown) {
  const headings = [];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const opener = /^\s*(```+|~~~+)/.exec(line);
    if (opener) {
      const mark = opener[1][0];
      if (fence === null) fence = mark;
      else if (fence === mark) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
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
  if (sections.join(' ') !== SPEC_HEADINGS.join(' ')) {
    reasons.push(`見出し不一致: \`##\` は ${expected} の順。実際は ${sections.join(' / ') || '（なし）'}`);
  }

  return reasons;
}

/**
 * `- **キー:** 値` のメタ情報を読む純関数。同じキーが複数あれば最初を採る。
 *
 * @param {string} markdown
 * @returns {Map<string, string>}
 */
export function parseMetadata(markdown) {
  const metadata = new Map();
  for (const line of markdown.split('\n')) {
    const entry = /^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/.exec(line);
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
 *
 * @param {string} markdown
 * @returns {Array<{line: number, token: string}>}
 */
export function findBadCheckboxes(markdown) {
  const bad = [];
  markdown.split('\n').forEach((line, index) => {
    const box = /^\s*[-*]\s+\[(.?)\](\s|$)/.exec(line);
    if (box && !CHECKBOX_MARKS.includes(box[1])) {
      bad.push({ line: index + 1, token: `[${box[1]}]` });
    }
  });
  return bad;
}

/**
 * backlog の「完了条件」節が未確定の印で始まるかを判定する純関数。
 *
 * @param {string} markdown
 * @returns {string[]} 違反の理由。空なら通過
 */
export function checkBacklogCompletion(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^##\s+完了条件\s*$/.test(line));
  if (start === -1) return []; // 見出し自体の欠落は checkSpecHeadings が報告する
  const first = lines.slice(start + 1).find((line) => line.trim() !== '');
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
    const matched = WORK_DIR_PATTERN.exec(name);
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

  return violations.sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason));
}

function main() {
  const rootDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
