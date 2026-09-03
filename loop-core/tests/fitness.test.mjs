/**
 * 0044 port-log の fitness A–D。Core の定数・配線・語彙・台帳文書名を固定する。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  IMPLEMENTATION_DIR_NAMES,
  IMPLEMENTATION_DIRS,
  LEDGER_DOC_ALLOWLIST,
  PROGRESS_FILE,
  SPEC_FILE,
} from '../lib/layout.mjs';
import { findViolations } from '../gate/check-protected-paths.mjs';
import { isImplementationPath } from '../gate/check-progress-coupling.mjs';
import { classifyEdit } from '../gate/guard-worktree.mjs';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('A: IMPLEMENTATION_DIRS の各 prefix は実装、README.md は実装ではない', () => {
  for (const dir of IMPLEMENTATION_DIRS) {
    assert.equal(isImplementationPath(`${dir}x.mjs`), true, dir);
  }
  assert.equal(isImplementationPath('README.md'), false);
  const root = '/repo';
  for (const name of IMPLEMENTATION_DIR_NAMES) {
    const r = classifyEdit({
      filePath: path.join(root, name, 'x.mjs'),
      rootDir: root,
    });
    assert.equal(r.blocked, true, name);
  }
  assert.equal(classifyEdit({ filePath: path.join(root, 'README.md'), rootDir: root }).blocked, false);
});

test('B: Core CLI 入口は凍結対象', () => {
  const v = findViolations({
    changes: [{ status: 'M', path: 'loop-core/bin/loop.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'loop-core/bin/loop.mjs');
});

test('C: Core の console 呼び出しの文字列リテラルに固有語を直書きしない', () => {
  const banned = ['progress.md', 'task/', 'npm run ci', 'tools/'];
  const whitelist = new Set(['layout.mjs']);
  const hits = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'tests' || ent.name === 'templates') continue;
        walk(p);
        continue;
      }
      if (!ent.name.endsWith('.mjs')) continue;
      if (whitelist.has(ent.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
        if (!/\bconsole\.(log|error|warn)\b/.test(line)) continue;
        for (const word of banned) {
          if (line.includes(`'${word}'`) || line.includes(`"${word}"`) || line.includes(`\`${word}`)) {
            hits.push(`${path.relative(CORE_ROOT, p)}:${i + 1}: ${word}`);
          }
        }
      }
    }
  };
  walk(CORE_ROOT);
  assert.deepEqual(hits, []);
});

test('D: 台帳の許容文書名は spec と progress だけ', () => {
  assert.deepEqual([...LEDGER_DOC_ALLOWLIST].sort(), [PROGRESS_FILE, SPEC_FILE].sort());
});
