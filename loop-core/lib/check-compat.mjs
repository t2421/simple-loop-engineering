/**
 * Core と t2421/claude-config のピンを比較する。
 *
 * 消費リポジトリの `.claude/claude-config.version` が
 * `loop-core/CLAUDE_CONFIG_COMPAT` と一致しなければ警告して非 0。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLAUDE_CONFIG_COMPAT, CLAUDE_CONFIG_PIN } from './layout.mjs';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {string} raw
 * @returns {string}
 */
export function normalizePin(raw) {
  return raw.replace(/\r/g, '').trim();
}

/**
 * @param {object} input
 * @param {string} [input.compatText]
 * @param {string | null} [input.pinText]
 * @returns {{ ok: boolean, warning?: string }}
 */
export function compareCompat({ compatText, pinText }) {
  const expected = normalizePin(compatText ?? '');
  if (expected === '') {
    return { ok: false, warning: `${CLAUDE_CONFIG_COMPAT} が空です` };
  }
  if (pinText === null || pinText === undefined) {
    return {
      ok: false,
      warning: `${CLAUDE_CONFIG_PIN} がありません。入れた t2421/claude-config の ref を 1 行で書いてください（Core は ${expected}）`,
    };
  }
  const actual = normalizePin(pinText);
  if (actual !== expected) {
    return {
      ok: false,
      warning: `Core と claude-config の版が食い違う: Core は ${expected}、リポジトリは ${actual}`,
    };
  }
  return { ok: true };
}

/**
 * @param {string} rootDir
 * @returns {{ ok: boolean, warning?: string }}
 */
export function checkCompat(rootDir) {
  const compatPath = path.join(CORE_ROOT, 'CLAUDE_CONFIG_COMPAT');
  let compatText;
  try {
    compatText = fs.readFileSync(compatPath, 'utf8');
  } catch (err) {
    return { ok: false, warning: `${CLAUDE_CONFIG_COMPAT} が読めない: ${err.message}` };
  }
  const pinPath = path.join(rootDir, CLAUDE_CONFIG_PIN);
  let pinText = null;
  try {
    pinText = fs.readFileSync(pinPath, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      return { ok: false, warning: `${CLAUDE_CONFIG_PIN} が読めない: ${err.message}` };
    }
  }
  return compareCompat({ compatText, pinText });
}

function defaultRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot();
  const result = checkCompat(rootDir);
  if (!result.ok) {
    console.error(`警告: ${result.warning}`);
    process.exit(1);
  }
  console.log('Core と claude-config のピンは一致しています。');
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
