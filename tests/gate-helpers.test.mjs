import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations } from '../loop-core/gate/check-protected-paths.mjs';

const empty = { changes: [] };

test('tools/run-unit-tests.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/run-unit-tests.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'tools/run-unit-tests.mjs');
});

test('tools/e2e-needed.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/e2e-needed.mjs' }],
  });
  assert.equal(v.length, 1);
});

test('loop-core/gate/check-progress-coupling.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'loop-core/gate/check-progress-coupling.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/gate/check-progress-coupling.mjs');
});

test('loop-core/gate/check-progress-coupling.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'loop-core/gate/check-progress-coupling.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'loop-core/gate/check-progress-coupling.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('検証の委譲先の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'tools/run-unit-tests.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'tools/e2e-needed.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('loop-core/gate/stop-hook-ci-dir.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'loop-core/gate/stop-hook-ci-dir.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/gate/stop-hook-ci-dir.mjs');
});

test('loop-core/gate/stop-hook-ci-dir.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'loop-core/gate/stop-hook-ci-dir.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'loop-core/gate/stop-hook-ci-dir.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('loop-core/gate/check-actions.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'loop-core/gate/check-actions.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/gate/check-actions.mjs');
});

test('loop-core/gate/check-actions.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'loop-core/gate/check-actions.mjs' }],
  });
  assert.equal(deleted.length, 1);

  // tools/ の外へ出す移動も塞ぐ
  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'lib/x.mjs',
        oldPath: 'loop-core/gate/check-actions.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('検証の委譲先の新規追加は違反にならない（導入 PR）', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'tools/run-unit-tests.mjs' },
      { status: 'A', path: 'tools/e2e-needed.mjs' },
      { status: 'A', path: 'loop-core/gate/check-progress-coupling.mjs' },
      { status: 'A', path: 'loop-core/gate/stop-hook-ci-dir.mjs' },
      { status: 'A', path: 'loop-core/gate/check-actions.mjs' },
      { status: 'A', path: 'loop-core/lib/manifest.mjs' },
    ],
  });
  assert.deepEqual(v, []);
});

test('tools/setup-playwright.mjs は委譲先ではないので変更しても違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/setup-playwright.mjs' }],
  });
  assert.deepEqual(v, []);
});

// --- hook の配線（0054-freeze-hook-wiring で足した 2 件） ---
//
// 判定コードをすべて凍結しても、呼び出し側（.claude/settings.json）を落とせば
// ガードは呼ばれない。配線の網羅は tests/hook-wiring.test.mjs が実物から検証する。
// ここは「その 2 件が GATE_HELPERS の規則どおりに扱われるか」を固定する。

test('.claude/settings.json の内容変更は違反になる（hook の配線）', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: '.claude/settings.json' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, '.claude/settings.json');
  assert.equal(v[0].reason, '検証の委譲先は変更も移動もできない');
});

test('.claude/settings.json の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: '.claude/settings.json' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'docs/settings.json',
        oldPath: '.claude/settings.json',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('保護外からのリネームで .claude/settings.json を上書きするのも違反になる', () => {
  // 中身を差し替える経路は「変更」と同じ効果を持つ。oldPath 側だけを見ると素通りする
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'R', path: '.claude/settings.json', oldPath: 'docs/outside.json', similarity: 90 },
    ],
  });
  assert.equal(v.length, 1);
});

test('loop-core/gate/guard-worktree.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'loop-core/gate/guard-worktree.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/gate/guard-worktree.mjs');
});

test('loop-core/gate/guard-worktree.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'loop-core/gate/guard-worktree.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'lib/guard-worktree.mjs',
        oldPath: 'loop-core/gate/guard-worktree.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('hook の配線 2 件の新規追加は違反にならない（導入 PR）', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: '.claude/settings.json' },
      { status: 'A', path: 'loop-core/gate/guard-worktree.mjs' },
    ],
  });
  assert.deepEqual(v, []);
});

test('.claude/settings.local.json は保護しない（未追跡の個人設定）', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: '.claude/settings.local.json' }],
  });
  assert.deepEqual(v, []);
});

test('.claude/agents/ と .claude/skills/ は保護しない（配線ではない。範囲外）', () => {
  for (const path of ['.claude/agents/codex-reviewer.md', '.claude/skills/loop-port/SKILL.md']) {
    const v = findViolations({ ...empty, changes: [{ status: 'M', path }] });
    assert.deepEqual(v, [], path);
  }
});

test('loop-core/lib/manifest.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'loop-core/lib/manifest.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/lib/manifest.mjs');
});

test('loop-core/lib/manifest.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'loop-core/lib/manifest.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'loop-core/lib/manifest.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});
