/**
 * `.claude/agents/codex-reviewer.md` の規約を恒久検証する。
 *
 * 判定は本文を受け取る純関数で行う。欠落・削除は一時パスや文字列に対して示し、
 * リポジトリの実ファイルは消さない。ファイル全体の文字列一致は使わない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CODEX_REVIEWER_PATH = path.join(
  repoRoot,
  '.claude',
  'agents',
  'codex-reviewer.md',
);

/** 出力スキーマの必須 4 項目。この順番の初出が正。 */
export const SCHEMA_FIELDS = Object.freeze([
  'severity',
  '根拠',
  '完了条件番号',
  '一文の要約',
]);

export const REASON_RERUN =
  'サンドボックス内での npm run ci・ユニットテスト・e2e 再実行を禁じる節が無い';
export const REASON_APPROVAL =
  '親が実測の CI 結果を貼っていないときは承認しない規則が無い';

/**
 * 指定パスのエージェント定義を読む。無いときは例外を投げる（skip しない）。
 *
 * @param {string} filePath
 * @returns {string}
 */
export function loadCodexReviewerMarkdown(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`codex-reviewer.md が存在しない: ${filePath}`, { cause: err });
    }
    throw err;
  }
}

/**
 * 規約の実質を本文から判定する純関数。問題が無ければ空配列。
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function checkCodexReviewerConventions(markdown) {
  const reasons = [];
  if (!hasRerunProhibition(markdown)) reasons.push(REASON_RERUN);
  if (!hasMeasuredCiApprovalRule(markdown)) reasons.push(REASON_APPROVAL);
  const schemaReason = schemaFieldReason(markdown);
  if (schemaReason) reasons.push(schemaReason);
  return reasons;
}

function hasRerunProhibition(markdown) {
  const hasSandbox = /サンドボックス|sandbox/i.test(markdown);
  const hasNpmCi = /npm run ci/.test(markdown);
  const hasUnit = /ユニットテスト/.test(markdown);
  const hasE2e = /e2e/.test(markdown);
  const hasForbid =
    /再実行しない|再実行を禁|再実行をしない|改めて実行しない|再度実行しない|改めて走らせない|再度走らせない/.test(
      markdown,
    );
  return hasSandbox && hasNpmCi && hasUnit && hasE2e && hasForbid;
}

function hasMeasuredCiApprovalRule(markdown) {
  const compact = markdown.replace(/\s+/g, '');
  return /親.{0,80}実測.{0,40}CI.{0,40}(渡していない|貼っていない|示していない).{0,30}承認(しない|してはならない)/.test(
    compact,
  );
}

function schemaFieldReason(markdown) {
  const indexes = SCHEMA_FIELDS.map((name) => markdown.indexOf(name));
  const missing = SCHEMA_FIELDS.filter((_, i) => indexes[i] === -1);
  if (missing.length > 0) {
    return `出力スキーマの必須項目が欠けている: ${missing.join(', ')}`;
  }
  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i] <= indexes[i - 1]) {
      return `出力スキーマの必須項目の順番が違う（期待: ${SCHEMA_FIELDS.join(' → ')}）`;
    }
  }
  return null;
}

/** 規約の事実を持つ最小の本文。現行ファイルの複製ではない。 */
function validMarkdown({
  heading = 'テスト結果の扱い',
  rerun = 'サンドボックス内で `npm run ci`・ユニットテスト・e2e を再実行しない。',
  approval = '親が実測の CI 結果を渡していないときは承認しない。',
  fields = SCHEMA_FIELDS,
} = {}) {
  return [
    `## ${heading}`,
    '',
    rerun,
    '',
    approval,
    '',
    '## 出力スキーマ',
    '',
    ...fields.map((name) => `- ${name}`),
    '',
  ].join('\n');
}

function dropAll(markdown, token) {
  return markdown.split(token).join('');
}

// --- 例の各行 ---

test('現状の .claude/agents/codex-reviewer.md で pass する', () => {
  const markdown = loadCodexReviewerMarkdown(CODEX_REVIEWER_PATH);
  assert.deepEqual(checkCodexReviewerConventions(markdown), []);
});

test('テストが読むパスに codex-reviewer.md が無いと失敗する（skip しない）', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-defs-missing-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const missing = path.join(dir, '.claude', 'agents', 'codex-reviewer.md');
  assert.throws(
    () => loadCodexReviewerMarkdown(missing),
    (err) => {
      assert.match(err.message, /codex-reviewer\.md が存在しない/);
      return true;
    },
  );
});

test('再実行禁止と実測なし非承認の事実が残る文言の微修正は pass する', () => {
  const markdown = validMarkdown({
    heading: 'テスト結果について',
    rerun: 'サンドボックスのなかで `npm run ci`、ユニットテスト、e2e を改めて実行しない。',
    approval: '親が実測の CI 結果を貼っていない場合は承認しない。',
  });
  assert.deepEqual(checkCodexReviewerConventions(markdown), []);
});

test('再実行禁止の節を削除した本文は fail する', () => {
  const markdown = validMarkdown({ rerun: '' });
  const reasons = checkCodexReviewerConventions(markdown);
  assert.ok(reasons.includes(REASON_RERUN), reasons.join('\n'));
});

test('必須 4 項目名をこの順で含む本文は pass する', () => {
  assert.deepEqual(checkCodexReviewerConventions(validMarkdown()), []);
});

test('4 項目名のうち 1 つを欠いた本文は fail する', () => {
  for (const missing of SCHEMA_FIELDS) {
    const markdown = dropAll(validMarkdown(), missing);
    const reasons = checkCodexReviewerConventions(markdown);
    assert.ok(
      reasons.some((r) => r.includes('欠けている') && r.includes(missing)),
      `${missing}: ${reasons.join('\n')}`,
    );
  }
});

test('4 項目名の順番を入れ替えた本文は fail する', () => {
  const reordered = validMarkdown({
    fields: ['根拠', 'severity', '完了条件番号', '一文の要約'],
  });
  const reasons = checkCodexReviewerConventions(reordered);
  assert.ok(reasons.some((r) => r.includes('順番が違う')), reasons.join('\n'));
});

// --- 失敗時 ---

test('親が実測 CI 結果を渡していないときの非承認ルールが消えていると fail する', () => {
  const markdown = validMarkdown({ approval: '' });
  const reasons = checkCodexReviewerConventions(markdown);
  assert.ok(reasons.includes(REASON_APPROVAL), reasons.join('\n'));
});
