/**
 * GitHub CI の e2e ジョブが、この差分で Playwright を回すべきかを判定する。
 *
 * 計算ページとその依存に触れない PR では導入を間引く。差分が取れないときは
 * 間引かず回す（素通りしない）。
 *
 * ローカル import を持たない。CI は base リビジョンを一時ファイルへ取り出して
 * 実行するため、相対 import があると候補側のファイルを読んでしまう。
 *
 * `node tools/e2e-needed.mjs <base-ref>` で `needed=true` / `needed=false` を出す。
 * GitHub Actions では `GITHUB_OUTPUT` にも同じ行を書く。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const E2E_TEST_FILE = 'tests/calc-page.test.mjs';
const PLAYWRIGHT_SETUP = 'tools/setup-playwright.mjs';

/**
 * `git diff --name-status -M -z` のパス一覧。import 無しで動かすため、
 * ガード側の parser は使わない。
 *
 * @param {string} raw
 * @returns {Array<{path: string, oldPath?: string}>}
 */
export function parseNameStatus(raw) {
  const fields = raw.split('\0').filter((f) => f !== '');
  const changes = [];
  let i = 0;
  while (i < fields.length) {
    const code = fields[i];
    const rename = /^([RC])(\d+)$/.exec(code);
    const needed = rename ? 3 : 2;
    if (i + needed > fields.length) {
      throw new Error(`差分の出力が途中で切れています: ${JSON.stringify(fields.slice(i))}`);
    }
    if (rename) {
      changes.push({ path: fields[i + 2], oldPath: fields[i + 1] });
      i += 3;
    } else {
      changes.push({ path: fields[i + 1] });
      i += 2;
    }
  }
  return changes;
}

/**
 * 1 パスが計算ページの e2e に影響しうるか。
 *
 * @param {string} filePath - git のパス（スラッシュ区切り）
 * @returns {boolean}
 */
export function matchesE2ePath(filePath) {
  if (filePath === 'package.json' || filePath === 'package-lock.json') return true;
  if (filePath === E2E_TEST_FILE) return true;
  if (filePath === PLAYWRIGHT_SETUP) return true;
  if (filePath.startsWith('src/')) return true;
  const base = path.posix.basename(filePath);
  if (base.startsWith('calc-page.') && filePath.startsWith('progress/')) return true;
  if (base.startsWith('calc-page.') && filePath.startsWith('task/')) return true;
  return false;
}

/**
 * 変更パスの一覧から、e2e が要るかを判定する純関数。
 *
 * @param {string[]} paths
 * @returns {boolean}
 */
export function e2eNeeded(paths) {
  return paths.some((p) => matchesE2ePath(p));
}

/**
 * name-status の変更から、移動元・移動先を含むパス一覧を取る。
 *
 * @param {Array<{path: string, oldPath?: string}>} changes
 * @returns {string[]}
 */
export function pathsFromChanges(changes) {
  const paths = [];
  for (const change of changes) {
    paths.push(change.path);
    if (change.oldPath) paths.push(change.oldPath);
  }
  return paths;
}

/**
 * base ref との差分を見て e2e が要るかを決める。
 * 差分が取れないときは needed=true（間引かない）。
 *
 * @param {object} input
 * @param {string | undefined} input.baseRef
 * @param {(args: string[]) => string} [input.execGit]
 * @returns {{ needed: boolean | null, error: 'usage' | 'diff' | null }}
 */
export function resolveNeeded({ baseRef, execGit = defaultExecGit }) {
  if (!baseRef) {
    return { needed: null, error: 'usage' };
  }
  try {
    const raw = execGit(['diff', '--name-status', '-M', '-z', `${baseRef}...HEAD`]);
    const changes = parseNameStatus(raw);
    return { needed: e2eNeeded(pathsFromChanges(changes)), error: null };
  } catch {
    return { needed: true, error: 'diff' };
  }
}

function defaultExecGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function writeNeeded(needed) {
  const line = `needed=${needed ? 'true' : 'false'}\n`;
  process.stdout.write(line);
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, line);
}

function main() {
  const result = resolveNeeded({ baseRef: process.argv[2] });
  if (result.error === 'usage') {
    console.error('使い方: node tools/e2e-needed.mjs <base-ref>');
    process.exit(1);
  }
  if (result.error === 'diff') {
    console.error('base との差分を取得できませんでした。e2e を間引かず回します。');
  }
  writeNeeded(result.needed);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
