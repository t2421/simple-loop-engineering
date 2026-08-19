import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { E2E_TEST_FILE, listUnitTestFiles } from '../tools/run-unit-tests.mjs';

test('listUnitTestFiles は calc-page.test.mjs を除き、他の *.test.mjs を名前順で返す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unit-tests-'));
  fs.writeFileSync(path.join(dir, 'sub.test.mjs'), '');
  fs.writeFileSync(path.join(dir, E2E_TEST_FILE), '');
  fs.writeFileSync(path.join(dir, 'add.test.mjs'), '');
  fs.writeFileSync(path.join(dir, 'readme.md'), '');

  const files = listUnitTestFiles(dir);
  assert.deepEqual(
    files.map((f) => path.basename(f)),
    ['add.test.mjs', 'sub.test.mjs'],
  );
  assert.equal(
    files.every((f) => path.dirname(f) === dir),
    true,
  );
});
