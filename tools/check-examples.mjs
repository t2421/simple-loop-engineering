/**
 * spec の「例」表をリポジトリルートで機械実行し、終了コードと stdout を照合する。
 *
 * 使い方: node tools/check-examples.mjs <id>-<slug>
 *
 * 評価する行は次の 3 種だけ。それ以外（手順文・定性的な「5 行。この順に…」・
 * 「3 以上」・`git diff` の説明文）は推測して合否を付けず、対象外と明示して落とさない。
 * incomplete な backlog（「例」が未確定のまま）も必須にしない。評価可能な行が 0 件なら成功。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { isWorkName } from '../loop-core/lib/layout.mjs';

/** backlog の「例」が未確定である印（`loop-core/ledger/promote.mjs` と同じ文字列） */
export const INCOMPLETE_LINE = '未確定（incomplete）。昇格時に埋める。';

/** 昇格前の表セルに残るプレースホルダ */
export const PLACEHOLDER_CELL = '<昇格時に記入>';

const SPEC_FILE = 'spec.md';

/** 作業ディレクトリの探索順。先に当たったものを使う */
const SPEC_LOCATIONS = Object.freeze([
  (name) => path.join('task', name),
  (name) => path.join('task', 'archive', name),
  (name) => path.join('backlog', name),
]);

/** 1 コマンドの上限。grep -c 型を想定し、止まらない呼び出しを放置しない */
const COMMAND_TIMEOUT_MS = 60_000;

/** 定性行とみなして整数期待を付けない語 */
const QUALITATIVE_RE = /以上|この順に|行番号|行以上/;

/**
 * リポジトリルートを決める。git が取れなければ cwd。
 *
 * @param {string} [cwd]
 * @returns {string}
 */
export function resolveRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return cwd;
  }
}

/**
 * `task/`・`task/archive/`・`backlog/` から作業の spec.md を探す。
 *
 * @param {string} name
 * @param {string} root
 * @returns {{ relDir: string, specPath: string } | null}
 */
export function findSpec(name, root) {
  for (const loc of SPEC_LOCATIONS) {
    const relDir = loc(name);
    const specPath = path.join(root, relDir, SPEC_FILE);
    if (fs.existsSync(specPath)) {
      return { relDir, specPath };
    }
  }
  return null;
}

/**
 * `## 例` 節の本文を取る純関数。無ければ null。
 *
 * @param {string} markdown
 * @returns {string | null}
 */
export function extractExamplesSection(markdown) {
  const lines = markdown.split('\n');
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^##\s+例\s*$/.test(lines[i])) {
      start = i + 1;
      continue;
    }
    if (start !== -1 && /^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start, end).join('\n');
}

/**
 * 「例」が incomplete な backlog のままかを判定する純関数。
 *
 * @param {string} sectionText
 * @returns {boolean}
 */
export function isIncompleteExamples(sectionText) {
  return sectionText.includes(INCOMPLETE_LINE) || sectionText.includes(PLACEHOLDER_CELL);
}

/**
 * 表の 1 行をセルに分ける。`\|` は列区切りにしない。
 *
 * @param {string} line
 * @returns {string[]}
 */
export function splitTableRow(line) {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\\' && body[i + 1] === '|') {
      cur += '\\|';
      i += 1;
      continue;
    }
    if (body[i] === '|') {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += body[i];
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * 「例」表の行を取る純関数。見出し行・区切り行は除く。
 *
 * @param {string} sectionText
 * @returns {Array<{ input: string, expected: string }>}
 */
export function parseExampleRows(sectionText) {
  const rows = [];
  for (const line of sectionText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;
    const cells = splitTableRow(trimmed);
    if (cells.length < 2) continue;
    if (cells[0].includes('操作または入力') && cells[1].includes('期待結果')) continue;
    rows.push({ input: cells[0], expected: cells[1] });
  }
  return rows;
}

/**
 * 表セル用の `\|` をシェルの `|` に戻す。引用符の中は grep の `\|` のまま残す。
 *
 * @param {string} command
 * @returns {string}
 */
function unescapeTablePipes(command) {
  let out = '';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote === null && (c === "'" || c === '"')) {
      quote = c;
      out += c;
      continue;
    }
    if (quote !== null && c === quote) {
      quote = null;
      out += c;
      continue;
    }
    if (quote === null && c === '\\' && command[i + 1] === '|') {
      out += '|';
      i += 1;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * バッククォートで始まるセルからシェルコマンドを取る。取れなければ null。
 *
 * @param {string} input
 * @returns {string | null}
 */
export function extractCommand(input) {
  const trimmed = input.trim();
  if (!trimmed.startsWith('`')) return null;
  const m = /^`([^`]+)`/.exec(trimmed);
  if (!m) return null;
  return unescapeTablePipes(m[1]);
}

/**
 * `grep -c` 型の整数期待を取る純関数。定性行なら null。
 *
 * @param {string} expected
 * @returns {string | null}
 */
export function parseStdoutInt(expected) {
  if (typeof expected !== 'string') return null;
  const t = expected.trim();
  if (QUALITATIVE_RE.test(t)) return null;
  const withStdout = /^stdout が\s+`(\d+)`(?:[。．]?\s*終了コード\s*0)?\s*$/.exec(t);
  if (withStdout) return withStdout[1];
  const backticked = /^`(\d+)`(?:\s*[（(].*)?$/.exec(t);
  if (backticked) return backticked[1];
  const plain = /^(\d+)$/.exec(t);
  if (plain) return plain[1];
  return null;
}

/**
 * 1 行を評価対象か対象外かに分類する純関数。
 *
 * @param {string} input
 * @param {string} expected
 * @returns {{ kind: 'stdout-int', command: string, expected: string }
 *   | { kind: 'zero-exit', command: string }
 *   | { kind: 'nonzero-exit', command: string }
 *   | { kind: 'skip', reason: string }}
 */
export function classifyRow(input, expected) {
  const command = extractCommand(input);
  if (command === null) {
    return { kind: 'skip', reason: '入力がシェルコマンド（バッククォートで始まる呼び出し）ではない' };
  }
  if (/^git\s+diff\b/.test(command)) {
    return { kind: 'skip', reason: 'git diff の説明文は解釈しない' };
  }
  const intVal = parseStdoutInt(expected);
  if (intVal !== null) {
    return { kind: 'stdout-int', command, expected: intVal };
  }
  if (/終了コード非\s*0/.test(expected)) {
    return { kind: 'nonzero-exit', command };
  }
  if (/終了コード\s*0/.test(expected)) {
    return { kind: 'zero-exit', command };
  }
  return { kind: 'skip', reason: '期待結果を解釈できない（定性的）' };
}

/**
 * @param {string} command
 * @param {string} cwd
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function runCommand(command, cwd) {
  const r = spawnSync(command, {
    cwd,
    encoding: 'utf8',
    shell: true,
    timeout: COMMAND_TIMEOUT_MS,
    env: process.env,
  });
  const stdout = (r.stdout ?? '').replace(/\n+$/, '');
  const stderr = (r.stderr ?? '').replace(/\n+$/, '');
  if (r.error && r.error.code === 'ETIMEDOUT') {
    return {
      status: 1,
      stdout,
      stderr: stderr || `コマンドがタイムアウトしました（${COMMAND_TIMEOUT_MS}ms）: ${command}`,
    };
  }
  const status = typeof r.status === 'number' ? r.status : 1;
  return { status, stdout, stderr };
}

/**
 * 分類済みの行を実行して合否を付ける。
 *
 * @param {{ kind: string, command?: string, expected?: string, reason?: string }} classified
 * @param {string} root
 * @returns {{ status: 'pass' | 'fail' | 'skip', detail: string }}
 */
function evaluateClassified(classified, root) {
  if (classified.kind === 'skip') {
    return { status: 'skip', detail: classified.reason };
  }
  const ran = runCommand(classified.command, root);
  if (classified.kind === 'stdout-int') {
    if (ran.status !== 0) {
      return {
        status: 'fail',
        detail: `終了コードが 0 ではない（実際: ${ran.status}）。stdout: ${JSON.stringify(ran.stdout)}`,
      };
    }
    if (ran.stdout !== classified.expected) {
      return {
        status: 'fail',
        detail: `stdout が期待と違います（期待: ${classified.expected} / 実際: ${ran.stdout}）`,
      };
    }
    return { status: 'pass', detail: `stdout ${ran.stdout}` };
  }
  if (classified.kind === 'zero-exit') {
    if (ran.status !== 0) {
      return {
        status: 'fail',
        detail: `終了コード 0 を期待したが実際は ${ran.status}`,
      };
    }
    return { status: 'pass', detail: '終了コード 0' };
  }
  if (ran.status === 0) {
    return {
      status: 'fail',
      detail: '終了コード非 0 を期待したが実際は 0',
    };
  }
  return { status: 'pass', detail: `終了コード ${ran.status}` };
}

/**
 * 検査結果を人が読める行にする。
 *
 * @param {object} result
 * @returns {string}
 */
export function formatReport(result) {
  const lines = [];
  if (result.specRel) {
    lines.push(`検査: ${result.specRel}`);
  }
  if (result.incomplete) {
    lines.push('対象外: 「例」が未確定（incomplete）のため必須にしない');
  }
  for (const row of result.rows ?? []) {
    const label = row.status === 'pass' ? '合格' : row.status === 'fail' ? '失敗' : '対象外';
    lines.push(`${label}: ${row.input} — ${row.detail}`);
  }
  if (!result.incomplete) {
    const evaluated = (result.rows ?? []).filter((r) => r.status !== 'skip').length;
    const passed = (result.rows ?? []).filter((r) => r.status === 'pass').length;
    const failed = (result.rows ?? []).filter((r) => r.status === 'fail').length;
    const skipped = (result.rows ?? []).filter((r) => r.status === 'skip').length;
    if (evaluated === 0) {
      if (result.ok) {
        lines.push('評価可能な行は 0 件です（検査成功）');
      }
    } else {
      lines.push(`評価可能な行 ${evaluated} 件、合格 ${passed}、失敗 ${failed}、対象外 ${skipped}`);
    }
  }
  if (result.reason && !result.ok) {
    lines.push(result.reason);
  }
  return lines.join('\n');
}

/**
 * 指定した作業の spec「例」を機械実行する。
 *
 * @param {string} name
 * @param {object} [opts]
 * @param {string} [opts.root]
 * @returns {{ ok: boolean, reason?: string, specRel?: string, incomplete?: boolean, rows: Array<object> }}
 */
export function checkExamples(name, { root = process.cwd() } = {}) {
  if (!isWorkName(name)) {
    return {
      ok: false,
      reason: `作業名が <id>-<slug> の形ではありません: ${name}`,
      rows: [],
    };
  }

  const found = findSpec(name, root);
  if (!found) {
    const tried = SPEC_LOCATIONS.map((loc) => `${loc(name)}/`).join('、');
    return {
      ok: false,
      reason: `作業ディレクトリがありません: ${tried}`,
      rows: [],
    };
  }

  const specRel = path.posix.join(found.relDir.replaceAll(path.sep, '/'), SPEC_FILE);
  let markdown;
  try {
    markdown = fs.readFileSync(found.specPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      reason: `${specRel} を読めませんでした: ${err.message}`,
      specRel,
      rows: [],
    };
  }

  const section = extractExamplesSection(markdown);
  if (section === null) {
    return {
      ok: true,
      specRel,
      rows: [],
    };
  }

  if (isIncompleteExamples(section)) {
    return {
      ok: true,
      specRel,
      incomplete: true,
      rows: [],
    };
  }

  const parsed = parseExampleRows(section);
  const rows = parsed.map((row) => {
    const classified = classifyRow(row.input, row.expected);
    const outcome = evaluateClassified(classified, root);
    return {
      input: row.input,
      expected: row.expected,
      status: outcome.status,
      detail: outcome.detail,
    };
  });

  const failed = rows.filter((r) => r.status === 'fail');
  if (failed.length > 0) {
    const details = failed.map((r) => `${r.input} — ${r.detail}`).join('\n');
    return {
      ok: false,
      specRel,
      rows,
      reason: `「例」の検査が失敗しました（${specRel}）:\n${details}`,
    };
  }

  return { ok: true, specRel, rows };
}

function main(argv = process.argv.slice(2)) {
  const name = argv[0];
  if (!name) {
    console.error('使い方: node tools/check-examples.mjs <id>-<slug>');
    process.exit(1);
  }
  const root = resolveRoot();
  const result = checkExamples(name, { root });
  const report = formatReport(result);
  if (result.ok) {
    console.log(report);
    process.exit(0);
  }
  console.error(report);
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
