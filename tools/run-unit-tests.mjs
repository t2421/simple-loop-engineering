/**
 * ユニットテストだけを `node --test` で回す。
 *
 * `tests/*.test.mjs` から計算ページの e2e（`calc-page.test.mjs`）を除く。
 * 新しいユニットテストを `package.json` の scripts に列挙しなくてよい。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const E2E_TEST_FILE = 'calc-page.test.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ユニットテストのファイル一覧。e2e ファイルは除く。
 *
 * @param {string} testsDir
 * @returns {string[]} 絶対パス、名前順
 */
export function listUnitTestFiles(testsDir) {
  return fs
    .readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.mjs') && name !== E2E_TEST_FILE)
    .sort()
    .map((name) => path.join(testsDir, name));
}

function listOptionalUnitTestFiles(testsDir) {
  if (!fs.existsSync(testsDir)) return [];
  return listUnitTestFiles(testsDir);
}

function main() {
  const files = [
    ...listUnitTestFiles(path.join(rootDir, 'tests')),
    ...listOptionalUnitTestFiles(path.join(rootDir, 'loop-core', 'tests')),
  ];
  const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
