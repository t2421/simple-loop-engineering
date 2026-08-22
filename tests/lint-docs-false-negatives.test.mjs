/**
 * `0029-lint-docs-false-negatives` の回帰テスト。
 *
 * いずれも「壊れた文書を故意に作ったときだけ通ってしまう」偽陰性で、
 * 正しく書かれた文書を落とすものではない。既存の `tests/lint-docs.test.mjs` は
 * 凍結対象（append-only）なので、この作業のケースは新しいファイルに置く。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SPEC_HEADINGS,
  BACKLOG_INCOMPLETE_LINE,
  parseMetadata,
  checkSpecHeadings,
  checkBacklogCompletion,
  lintDocs,
} from '../tools/lint-docs.mjs';

function makeRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-docs-fn-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const SPEC_BODIES = {
  種別: '機能追加',
  対象: '- 場所: `src/x.mjs`\n- 公開面: `x()`',
  背景: '今は無くて困る。',
  仕様: '`x()` は 1 を返す。',
  範囲外: 'なし',
  失敗時: 'なし',
  例: 'なし',
};

/** テンプレート準拠の spec.md。`headings` を渡すと `##` の並びを差し替える */
function specMarkdown({ backlog = false, headings = SPEC_HEADINGS, completionBody } = {}) {
  const completion = completionBody ?? (backlog
    ? BACKLOG_INCOMPLETE_LINE
    : '次をすべて満たしたとき、この仕様は完了とする。\n\n1. 「対象」が仕様どおりに公開されている。');
  let out = '# x の追加\n\n一文で、何をどう変えるか。\n';
  for (const heading of headings) {
    const body = heading === '完了条件' ? completion : (SPEC_BODIES[heading] ?? 'なし');
    out += `\n## ${heading}\n\n${body}\n`;
  }
  return out;
}

/** メタ情報の行の書き方を差し替えられる progress.md */
function progressMarkdown({ metaLines } = {}) {
  const meta = metaLines ?? [
    '- **Target Spec:** `task/0030-a/spec.md`',
    '- **Branch:** `feature/a`',
    '- **PR:** `未作成`',
    '- **Status:** `In Progress` (Phase: `Implement`)',
  ];
  return [
    '# Progress: `0030-a`',
    '',
    ...meta,
    '',
    '## タスクチェックリスト',
    '',
    '- [ ] Specの要件・受け入れ条件の確認',
    '',
    '## 試行ログ・エラー履歴',
    '',
    '- `05:55` - 作成した。',
    '',
  ].join('\n');
}

/** 1 作業だけ置いたルートを lint する */
function lintOne(t, { spec, progress }) {
  const root = makeRoot(t);
  write(root, 'task/0030-a/spec.md', spec);
  write(root, 'task/0030-a/progress.md', progress);
  return lintDocs(root);
}

// --- (1) メタ情報の印と字下げ ---

test('例 1: `*` 印 + 字下げのメタ情報は、選択・アーカイブ側が読めないので違反になる', (t) => {
  const violations = lintOne(t, {
    spec: specMarkdown(),
    progress: progressMarkdown({
      metaLines: [
        '*   **Target Spec:** `task/0030-a/spec.md`',
        '*   **Branch:** `feature/x`',
        '*   **PR:** `未作成`',
        '*   **Status:** `In Progress`',
      ],
    }),
  });
  assert.notDeepEqual(violations, []);
  const text = JSON.stringify(violations);
  for (const key of ['Target Spec', 'Branch', 'PR', 'Status']) {
    assert.ok(text.includes(key), `${key} の違反が報告されること: ${text}`);
  }
});

test('例 2: 1 行だけ字下げしたメタ情報も違反になる', (t) => {
  const violations = lintOne(t, {
    spec: specMarkdown(),
    progress: progressMarkdown({
      metaLines: [
        '- **Target Spec:** `task/0030-a/spec.md`',
        '- **Branch:** `feature/a`',
        '  - **PR:** `未作成`',
        '- **Status:** `In Progress`',
      ],
    }),
  });
  assert.notDeepEqual(violations, []);
  assert.ok(JSON.stringify(violations).includes('PR'), '**PR** の違反が報告されること');
});

test('parseMetadata が読むのは行頭 `- ` の行だけ（archive.mjs・start-task.mjs と揃える）', () => {
  assert.equal(parseMetadata('- **PR:** `未作成`\n').get('PR'), '`未作成`');
  assert.equal(parseMetadata('* **PR:** `未作成`\n').get('PR'), undefined);
  assert.equal(parseMetadata('  - **PR:** `未作成`\n').get('PR'), undefined);
  assert.equal(parseMetadata('\t- **PR:** `未作成`\n').get('PR'), undefined);
});

// --- (2) 見出しの一致判定 ---

test('例 3: `## 種別 対象` に結合された見出しは違反になる（join 比較では素通りする）', (t) => {
  const merged = ['種別 対象', ...SPEC_HEADINGS.slice(2)];
  const violations = lintOne(t, {
    spec: specMarkdown({ headings: merged }),
    progress: progressMarkdown(),
  });
  assert.notDeepEqual(violations, []);
  assert.ok(JSON.stringify(violations).includes('見出し不一致'));
});

test('checkSpecHeadings は要素ごとに比べる（結合・分割を見逃さない）', () => {
  assert.deepEqual(checkSpecHeadings(specMarkdown()), []);

  const merged = checkSpecHeadings(specMarkdown({ headings: ['種別 対象', ...SPEC_HEADINGS.slice(2)] }));
  assert.equal(merged.length, 1);

  const split = checkSpecHeadings(specMarkdown({ headings: ['種', '別', ...SPEC_HEADINGS.slice(1)] }));
  assert.equal(split.length, 1);
});

// --- (3) backlog「完了条件」節の直後のフェンス ---

const FENCE_FIRST = ['```', 'これは節の先頭に置かれたフェンス塊である', '```', '', BACKLOG_INCOMPLETE_LINE].join('\n');

test('例 4: backlog の「完了条件」直後がフェンス塊なら違反になる', (t) => {
  const root = makeRoot(t);
  // lintDocs は task/ の存在を前提にするので、正しい作業を 1 つ置いてから backlog を見る
  write(root, 'task/0030-a/spec.md', specMarkdown());
  write(root, 'task/0030-a/progress.md', progressMarkdown());
  write(root, 'backlog/0031-b/spec.md', specMarkdown({ backlog: true, completionBody: FENCE_FIRST }));
  const violations = lintDocs(root);
  assert.notDeepEqual(violations, []);
  assert.ok(JSON.stringify(violations).includes('完了条件'));
});

test('checkBacklogCompletion はフェンスの後の未確定行を節の先頭と誤認しない', () => {
  assert.deepEqual(
    checkBacklogCompletion(specMarkdown({ backlog: true })),
    [],
    '正しい backlog は通る',
  );
  assert.notDeepEqual(
    checkBacklogCompletion(specMarkdown({ backlog: true, completionBody: FENCE_FIRST })),
    [],
    'フェンス塊で始まる節は落とす',
  );
});

test('未確定行のあとに置かれたフェンスは違反にしない（既存 backlog の形を壊さない）', () => {
  const body = [BACKLOG_INCOMPLETE_LINE, '', '```', '参考の出力', '```'].join('\n');
  assert.deepEqual(checkBacklogCompletion(specMarkdown({ backlog: true, completionBody: body })), []);
});

// --- 正しい文書は通る ---

test('例 5: 行頭 `- ` の正しいメタ情報・正しい見出し・未確定行で始まる backlog は違反なし', (t) => {
  const root = makeRoot(t);
  write(root, 'task/0030-a/spec.md', specMarkdown());
  write(root, 'task/0030-a/progress.md', progressMarkdown());
  write(root, 'backlog/0031-b/spec.md', specMarkdown({ backlog: true }));
  assert.deepEqual(lintDocs(root), []);
});
