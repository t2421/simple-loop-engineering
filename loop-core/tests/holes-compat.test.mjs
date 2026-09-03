import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLAUDE_MD_HOLES, findUnfilledHoles, unfilledHoleReasons } from '../lib/holes.mjs';
import { compareCompat } from '../lib/check-compat.mjs';
import { lintDocs } from '../ledger/lint-docs.mjs';

test('既知の穴を 1 つ残すと列挙される', () => {
  const holes = findUnfilledHoles('検証は {{VERIFY_COMMAND}} で行う。');
  assert.deepEqual(holes, ['VERIFY_COMMAND']);
  assert.match(unfilledHoleReasons(holes)[0], /VERIFY_COMMAND/);
});

test('未知の {{FOO}} は既知穴として数えない', () => {
  assert.deepEqual(findUnfilledHoles('{{FOO}} {{VERIFY_COMMAND}}'), ['VERIFY_COMMAND']);
});

test('CLAUDE.md の穴が残ったルートを lint すると列挙して落ちる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-holes-'));
  try {
    fs.mkdirSync(path.join(dir, 'task'));
    fs.writeFileSync(
      path.join(dir, 'CLAUDE.md'),
      ['# x', ...CLAUDE_MD_HOLES.map((name, i) => (i === 0 ? `{{${name}}}` : `${name} filled`))].join('\n'),
    );
    const v = lintDocs(dir);
    const hole = v.filter((x) => x.path === 'CLAUDE.md');
    assert.ok(hole.length >= 1);
    assert.ok(hole.some((x) => x.reason.includes('VERIFY_COMMAND')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('compareCompat: ピン欠落と不一致は失敗', () => {
  assert.equal(compareCompat({ compatText: 'a@1', pinText: null }).ok, false);
  assert.equal(compareCompat({ compatText: 'a@1', pinText: 'a@2' }).ok, false);
  assert.equal(compareCompat({ compatText: 'a@1', pinText: 'a@1' }).ok, true);
});
