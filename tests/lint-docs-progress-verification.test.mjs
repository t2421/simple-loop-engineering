/**
 * `0055-progress-verification-lint` のテスト。
 *
 * progress への共通検証 dump の貼付を `lintDocs()` が検知することを、
 * 一時ディレクトリ上のレイアウトで検証する。既存の `tests/lint-docs.test.mjs`
 * は書き換えない。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  SPEC_HEADINGS,
  SHARED_UNIT_TEST_COUNT_FLOOR,
  checkProgress,
  checkProgressNoSharedVerification,
  lintDocs,
} from '../loop-core/ledger/lint-docs.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(repoRoot, 'loop-core', 'ledger', 'lint-docs.mjs');

function makeRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-docs-pv-'));
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

function specMarkdown({ extra = '' } = {}) {
  const completion = '次をすべて満たしたとき、この仕様は完了とする。\n\n1. 「対象」が仕様どおりに公開されている。';
  let out = '# x の追加\n\n一文で、何をどう変えるか。\n';
  for (const heading of SPEC_HEADINGS) {
    const body = heading === '完了条件' ? completion : SPEC_BODIES[heading];
    out += `\n## ${heading}\n\n${body}\n`;
  }
  return out + extra;
}

function progressMarkdown({
  name = '0030-a',
  targetSpec = 'task/0030-a/spec.md',
  extra = '',
} = {}) {
  return [
    `# Progress: \`${name}\``,
    '',
    `- **Target Spec:** \`${targetSpec}\``,
    '- **Branch:** `feature/a`',
    '- **PR:** `未作成`',
    '- **Status:** `In Progress` (Phase: `Implement`)',
    '',
    '## タスクチェックリスト',
    '',
    '構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。',
    '',
    '- [ ] Specの要件・受け入れ条件の確認',
    '',
    '## 試行ログ・エラー履歴',
    '',
    '- `05:55` - 作成した。',
    extra,
  ].join('\n');
}

function putTask(root, name, { archived = false, extra = '', specExtra = '' } = {}) {
  const relDir = archived ? `task/archive/${name}` : `task/${name}`;
  write(root, `${relDir}/spec.md`, specMarkdown({ extra: specExtra }));
  write(
    root,
    `${relDir}/progress.md`,
    progressMarkdown({ name, targetSpec: `${relDir}/spec.md`, extra }),
  );
  return `${relDir}/progress.md`;
}

function reasonsFor(violations, target) {
  return violations.filter((v) => v.path === target).map((v) => v.reason);
}

function dumpReasons(violations, target) {
  return reasonsFor(violations, target).filter((reason) => /行目:/.test(reason) && /共通の検証/.test(reason));
}

function runCli(root) {
  return spawnSync(process.execPath, [CLI, root], { encoding: 'utf8' });
}

test('SHARED_UNIT_TEST_COUNT_FLOOR は 50', () => {
  assert.equal(SHARED_UNIT_TEST_COUNT_FLOOR, 50);
});

test('例1: フェンス内の全件集計と docs lint 成功文は違反（0054 の形）', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `10:40` - 戻した後',
    '',
    '```',
    '=== 戻した後 ===',
    'docs の形式違反はありません（53 件の作業ディレクトリを確認）。',
    '# tests 484  # pass 484  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });

  const violations = lintDocs(root);
  const reasons = dumpReasons(violations, progressPath);
  assert.notEqual(reasons.length, 0, JSON.stringify(violations));
  assert.ok(
    reasons.some((reason) => /\d+ 行目:/.test(reason) && /docs lint/.test(reason)),
    JSON.stringify(reasons),
  );
  assert.ok(
    reasons.some((reason) => /\d+ 行目:/.test(reason) && /ユニットテストの集計/.test(reason)),
    JSON.stringify(reasons),
  );

  const cli = runCli(root);
  assert.notEqual(cli.status, 0);
  assert.match(cli.stderr, /progress\.md/);
  assert.match(cli.stderr, /\d+ 行目:/);
});

test('例2: 作業固有の node --test <ファイル> 証跡は違反にしない（0053 の形）', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `17:20` - 専用テストを実行した',
    '',
    '```',
    'node --test tests/foo.test.mjs',
    'ok 1 - foo',
    '# tests 6  # pass 6  # fail 0',
    '```',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('例3: TAP 出力だけの小件集計は違反なし（node --test 行は無い。N は floor 未満）', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `16:40` - TAP だけを貼った',
    '',
    '```',
    'ok 1 〜 ok 5',
    '# tests 6  # pass 6  # fail 0',
    '```',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('例4: 完了条件に対する grep の出力は違反なし', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `11:00` - grep した',
    '',
    '```',
    'checkProgressNoSharedVerification',
    '  508:export function checkProgressNoSharedVerification(progressMarkdown) {',
    '  572:    reasons.push(...checkProgressNoSharedVerification(markdown));',
    '```',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('例5: 「共通の検証の出力は貼らない」という説明文は違反なし', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `00:48` - 共通の検証の出力は貼らない。検知対象そのものの成功文や全件集計行は、この進捗に貼らない。',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('例6: フェンス外の散文に npm run ci と集計クラスタを埋め込んだら違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `16:50` - 凍結対象の無変更を確認した。`npm run ci` は `# tests 471 / # pass 471 / # fail 0`（新設 5 件ぶん増）',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });

  const violations = lintDocs(root);
  const reasons = dumpReasons(violations, progressPath);
  assert.notEqual(reasons.length, 0, JSON.stringify(violations));
  assert.ok(
    reasons.some((reason) => /\d+ 行目:/.test(reason) && /ユニットテストの集計/.test(reason)),
    JSON.stringify(reasons),
  );
});

test('例7: フェンス内の全件集計だけ（コマンド名は無い）は違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `10:00` - 集計だけを貼った',
    '',
    '```',
    '# tests 484  # pass 484  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });

  const violations = lintDocs(root);
  const reasons = dumpReasons(violations, progressPath);
  assert.equal(reasons.length, 1, JSON.stringify(reasons));
  assert.match(reasons[0], /\d+ 行目:.*ユニットテストの集計/);
});

test('例8: テンプレートどおり「npm run ci が強制する」だけなら違反なし', (t) => {
  const root = makeRoot(t);
  putTask(root, '0030-a');
  assert.deepEqual(lintDocs(root), []);
});

test('例9: task/archive/ 配下の progress に dump があっても違反なし', (t) => {
  const root = makeRoot(t);
  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  putTask(root, '0030-a');
  const extra = [
    '',
    '- `10:40` - 戻した後',
    '',
    '```',
    'docs の形式違反はありません（53 件の作業ディレクトリを確認）。',
    '# tests 484  # pass 484  # fail 0',
    '```',
    '',
  ].join('\n');
  putTask(root, '0054-x', { archived: true, extra });
  assert.deepEqual(lintDocs(root), []);
});

test('例10: spec.md に検知パターンを literal で書いても違反なし', (t) => {
  const root = makeRoot(t);
  const specExtra = [
    '',
    '```',
    'docs の形式違反はありません（53 件の作業ディレクトリを確認）。',
    '# tests 484  # pass 484  # fail 0',
    '`npm run ci` は `# tests 471 / # pass 471 / # fail 0`',
    '```',
    '',
  ].join('\n');
  putTask(root, '0030-a', { specExtra });
  assert.deepEqual(lintDocs(root), []);
});

test('# tests を欠く断片は集計クラスタではない', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `09:30` - `tests/hook-wiring.test.mjs` は `# pass 8 / # fail 0` に',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('同じ文脈に node --test <ファイル> と npm run ci の集計が混在したら違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - 専用テストと共通検証を同じフェンスに貼った',
    '',
    '```',
    'node --test tests/foo.test.mjs',
    'ok 1 - foo',
    '# tests 6  # pass 6  # fail 0',
    'npm run ci',
    '# tests 8  # pass 8  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(
    reasons.some((reason) => /ユニットテストの集計/.test(reason)),
    JSON.stringify(reasons),
  );
});

test('作業固有の node --test <ファイル> は floor 以上でも違反にしない', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - 専用の大きなファイルを実行した',
    '',
    '```',
    'node --test tests/huge.test.mjs',
    '# tests 80  # pass 80  # fail 0',
    '```',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('作業固有の node --test <ファイル> でも npm run ci が同じ文脈なら違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - 専用の大きなファイルと共通検証を同じフェンスに貼った',
    '',
    '```',
    'node --test tests/huge.test.mjs',
    '# tests 80  # pass 80  # fail 0',
    'npm run ci',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(
    reasons.some((reason) => /ユニットテストの集計/.test(reason)),
    JSON.stringify(reasons),
  );
});

test('同じ項目の node --test 小件集計と npm run ci: exit 0 は違反にしない', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - `node --test tests/foo.test.mjs` は `# tests 17` / `# pass 17` / `# fail 0`。`npm run ci: exit 0`。',
    '',
  ].join('\n');
  putTask(root, '0030-a', { extra });
  assert.deepEqual(lintDocs(root), []);
});

test('フェンス内の別印の行は区切りにせず、その行の集計も検知する', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - フェンス内に ~~~ で始まる行がある',
    '',
    '```',
    '~~~ npm run ci',
    '# tests 8  # pass 8  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(
    reasons.some((reason) => /ユニットテストの集計/.test(reason)),
    JSON.stringify(reasons),
  );
});

test('同じ文脈の npm run test:unit と小件集計は違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - `npm run test:unit` の出力',
    '',
    '```',
    'npm run test:unit',
    '# tests 8  # pass 8  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(reasons.some((reason) => /ユニットテストの集計/.test(reason)), JSON.stringify(reasons));
});

test('連続行の全件集計も違反', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - 連続行',
    '',
    '```',
    '# tests 50',
    '# pass 50',
    '# fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(reasons.some((reason) => /ユニットテストの集計/.test(reason)), JSON.stringify(reasons));
});

test('ファイル指定の無い素の node --test は全件集計を免除しない', (t) => {
  const root = makeRoot(t);
  const extra = [
    '',
    '- `12:00` - 全スイート',
    '',
    '```',
    'node --test',
    '# tests 484  # pass 484  # fail 0',
    '```',
    '',
  ].join('\n');
  const progressPath = putTask(root, '0030-a', { extra });
  const reasons = dumpReasons(lintDocs(root), progressPath);
  assert.ok(reasons.some((reason) => /ユニットテストの集計/.test(reason)), JSON.stringify(reasons));
});

test('floor 未満かつ共通コマンドも無い集計は違反にしない', () => {
  const markdown = progressMarkdown({
    extra: '\n```\n# tests 49  # pass 49  # fail 0\n```\n',
  });
  assert.deepEqual(checkProgressNoSharedVerification(markdown), []);
});

test('checkProgress は task/archive/ で始まる進捗に検査を適用しない', () => {
  const markdown = progressMarkdown({
    extra: [
      '',
      '```',
      'docs の形式違反はありません（53 件の作業ディレクトリを確認）。',
      '# tests 484  # pass 484  # fail 0',
      '```',
      '',
    ].join('\n'),
  });
  const dump = checkProgressNoSharedVerification(markdown);
  assert.notEqual(dump.length, 0);

  const archived = checkProgress({
    relPath: 'task/archive/0054-x/progress.md',
    markdown,
    specExists: () => true,
  });
  for (const reason of dump) {
    assert.equal(archived.includes(reason), false, reason);
  }

  const active = checkProgress({
    relPath: 'task/0030-a/progress.md',
    markdown,
    specExists: () => true,
  });
  for (const reason of dump) {
    assert.ok(active.includes(reason), reason);
  }
});
