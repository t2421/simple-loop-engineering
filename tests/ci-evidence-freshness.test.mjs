/**
 * 実測 CI 結果の鮮度規約を恒久検証する（task/0046-ci-evidence-freshness）。
 *
 * 判定は本文を受け取る純関数で行う。欠落・削除は文字列に対して示し、
 * リポジトリの実ファイルは消さない。ファイル全体の文字列一致は使わない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLAUDE_MD_PATH = path.join(repoRoot, 'CLAUDE.md');
export const CODEX_REVIEWER_PATH = path.join(
  repoRoot,
  '.claude',
  'agents',
  'codex-reviewer.md',
);

export const TOKEN_COST_HEADING = 'トークンコスト';
export const TEST_RESULT_HEADING = 'テスト結果の扱い';

export const REASON_SHA_HEAD =
  '実測 CI の取得コミット SHA がレビュー対象 HEAD と一致することを求める記述が無い';
export const REASON_UNCOMMITTED =
  '未コミット付き取得はその旨を添える記述が無い';
export const REASON_NO_APPROVE =
  '一致が確認できないときは承認しない規則が無い';

/**
 * `## heading` から次の `## ` 直前までの本文を返す。見出しが無ければ空文字。
 *
 * @param {string} markdown
 * @param {string} heading
 * @returns {string}
 */
export function extractMarkdownSection(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const match = markdown.match(re);
  return match ? match[1] : '';
}

/**
 * 鮮度の 3 事実を本文から判定する純関数。問題が無ければ空配列。
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function checkCiEvidenceFreshness(markdown) {
  const reasons = [];
  if (!hasShaHeadMatch(markdown)) reasons.push(REASON_SHA_HEAD);
  if (!hasUncommittedDisclosure(markdown)) reasons.push(REASON_UNCOMMITTED);
  if (!hasNoApproveOnMismatch(markdown)) reasons.push(REASON_NO_APPROVE);
  return reasons;
}

function compactText(markdown) {
  return markdown.replace(/\s+/g, '');
}

function hasShaHeadMatch(markdown) {
  const compact = compactText(markdown);
  const hasSha = /SHA|リビジョン/.test(compact);
  const hasHead = /HEAD/.test(markdown);
  const hasMatch = /一致/.test(compact);
  return hasSha && hasHead && hasMatch;
}

function hasUncommittedDisclosure(markdown) {
  const compact = compactText(markdown);
  return /未コミット/.test(compact) && /(旨|明記|分か)/.test(compact);
}

function hasNoApproveOnMismatch(markdown) {
  const compact = compactText(markdown);
  const hasMismatch =
    /一致が確認できない|一致しない|対応が確認できない|SHA欠落|SHAが無い/.test(compact);
  const hasRefuse = /承認(しない|してはならない)/.test(compact);
  return hasMismatch && hasRefuse;
}

/** 鮮度の 3 事実を持つ最小の本文。現行ファイルの複製ではない。 */
function validBody({
  shaHead = '実測の CI 結果には取得時点のコミット SHA を添える。その SHA はレビュー対象の差分の HEAD と一致すること。',
  uncommitted = '未コミットの変更がある状態で取得した結果は、その旨を添える。',
  noApprove = '一致が確認できないときは承認しない。',
} = {}) {
  return [shaHead, uncommitted, noApprove].filter(Boolean).join('\n');
}

function load(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// --- 例の各行（定義ファイル） ---

test('現状の CLAUDE.md「トークンコスト」で pass する', () => {
  const section = extractMarkdownSection(load(CLAUDE_MD_PATH), TOKEN_COST_HEADING);
  assert.notEqual(section, '');
  assert.deepEqual(checkCiEvidenceFreshness(section), []);
});

test('現状の codex-reviewer.md「テスト結果の扱い」で pass する', () => {
  const section = extractMarkdownSection(load(CODEX_REVIEWER_PATH), TEST_RESULT_HEADING);
  assert.notEqual(section, '');
  assert.deepEqual(checkCiEvidenceFreshness(section), []);
});

test('事実が残る文言の微修正は pass する', () => {
  const markdown = validBody({
    shaHead:
      '取得したリビジョン（SHA）がレビュー対象 HEAD と一致していなければならない。',
    uncommitted: '未コミット付きで取った結果はその旨が分かること。',
    noApprove: '対応が確認できないときは承認してはならない。',
  });
  assert.deepEqual(checkCiEvidenceFreshness(markdown), []);
});

test('0047 の 3 事実だけの本文は鮮度不足で fail する', () => {
  const only0047 = [
    'サンドボックス内で `npm run ci`・ユニットテスト・e2e を再実行しない。',
    '親が実測の CI 結果を渡していないときは承認しない。',
    'severity 根拠 完了条件番号 一文の要約',
  ].join('\n');
  const reasons = checkCiEvidenceFreshness(only0047);
  assert.ok(reasons.includes(REASON_SHA_HEAD), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_UNCOMMITTED), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_NO_APPROVE), reasons.join('\n'));
});

test('HEAD 一致の記述を欠いた本文は fail する', () => {
  const markdown = validBody({ shaHead: '実測の CI 結果を添える。' });
  const reasons = checkCiEvidenceFreshness(markdown);
  assert.ok(reasons.includes(REASON_SHA_HEAD), reasons.join('\n'));
});

test('未コミットの旨を欠いた本文は fail する', () => {
  const markdown = validBody({ uncommitted: '' });
  const reasons = checkCiEvidenceFreshness(markdown);
  assert.ok(reasons.includes(REASON_UNCOMMITTED), reasons.join('\n'));
});

test('一致確認できないときの非承認を欠いた本文は fail する', () => {
  const markdown = validBody({ noApprove: '' });
  const reasons = checkCiEvidenceFreshness(markdown);
  assert.ok(reasons.includes(REASON_NO_APPROVE), reasons.join('\n'));
});

test('トークンコスト節を削除した CLAUDE.md 相当は fail する', () => {
  const live = load(CLAUDE_MD_PATH);
  const deleted = live.replace(/## トークンコスト[\s\S]*?(?=\n## )/, '');
  const section = extractMarkdownSection(deleted, TOKEN_COST_HEADING);
  const reasons = checkCiEvidenceFreshness(section);
  assert.ok(reasons.includes(REASON_SHA_HEAD), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_UNCOMMITTED), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_NO_APPROVE), reasons.join('\n'));
});

test('テスト結果の扱いから鮮度の文だけを消すと fail する', () => {
  const live = load(CODEX_REVIEWER_PATH);
  const stripped = live.replace(
    /実測の CI 結果には、取得時点のコミット SHA[\s\S]*?取り直しを求める。\n?/,
    '',
  );
  assert.notEqual(stripped, live);
  const section = extractMarkdownSection(stripped, TEST_RESULT_HEADING);
  const reasons = checkCiEvidenceFreshness(section);
  assert.ok(reasons.includes(REASON_SHA_HEAD), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_UNCOMMITTED), reasons.join('\n'));
  assert.ok(reasons.includes(REASON_NO_APPROVE), reasons.join('\n'));
});
