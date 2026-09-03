#!/usr/bin/env node
/**
 * ループコア CLI。起動: `node loop-core/bin/loop.mjs <command> [args]`
 *
 * npm に依存しない。マニフェストが無い・台帳構造が無いときはファイルを書かず終わる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadManifest, ManifestError, MANIFEST_FILE } from '../lib/manifest.mjs';
import { missingLedgerLayout } from '../lib/layout.mjs';
import { missingStructureMessage, noManifestMessage } from '../lib/messages.mjs';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LEDGER_COMMANDS = new Set(['start-task', 'archive', 'promote', 'lint-docs']);

const COMMANDS = Object.freeze({
  'start-task': path.join(CORE_ROOT, 'ledger', 'start-task.mjs'),
  archive: path.join(CORE_ROOT, 'ledger', 'archive.mjs'),
  promote: path.join(CORE_ROOT, 'ledger', 'promote.mjs'),
  'lint-docs': path.join(CORE_ROOT, 'ledger', 'lint-docs.mjs'),
  'check-protected-paths': path.join(CORE_ROOT, 'gate', 'check-protected-paths.mjs'),
  'check-progress-coupling': path.join(CORE_ROOT, 'gate', 'check-progress-coupling.mjs'),
  'check-actions': path.join(CORE_ROOT, 'gate', 'check-actions.mjs'),
  'guard-worktree': path.join(CORE_ROOT, 'gate', 'guard-worktree.mjs'),
  'stop-hook-ci-dir': path.join(CORE_ROOT, 'gate', 'stop-hook-ci-dir.mjs'),
  'check-compat': path.join(CORE_ROOT, 'lib', 'check-compat.mjs'),
  install: path.join(CORE_ROOT, 'install.mjs'),
});

export const USAGE = [
  '使い方: node loop-core/bin/loop.mjs <command> [args]',
  `コマンド: ${Object.keys(COMMANDS).join(' | ')}`,
].join('\n');

function gitRoot(cwd = process.cwd()) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (r.status !== 0) return cwd;
  return r.stdout.trim();
}

/**
 * @param {string[]} argv
 * @returns {{ command: string | null, args: string[], help: boolean }}
 */
export function parseLoopArgs(argv) {
  if (argv.length === 0) return { command: null, args: [], help: false };
  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    return { command: null, args: [], help: true };
  }
  return { command: argv[0], args: argv.slice(1), help: false };
}

/**
 * @param {object} input
 * @param {string} input.rootDir
 * @param {string} input.command
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function preflight({ rootDir, command }) {
  if (command === 'install' || command === 'check-compat') return { ok: true };
  try {
    loadManifest(rootDir);
  } catch (err) {
    const message = err instanceof ManifestError
      ? err.message
      : noManifestMessage(path.join(rootDir, MANIFEST_FILE));
    return { ok: false, message };
  }
  if (LEDGER_COMMANDS.has(command)) {
    const missing = missingLedgerLayout(rootDir);
    if (missing.length > 0) {
      return { ok: false, message: missingStructureMessage(missing) };
    }
  }
  return { ok: true };
}

function runCommand(command, args) {
  const file = COMMANDS[command];
  if (!file) {
    console.error(`不明なコマンド: ${command}\n${USAGE}`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [file, ...args], { stdio: 'inherit' });
  if (result.signal) process.exit(1);
  process.exit(result.status ?? 1);
}

function main() {
  const parsed = parseLoopArgs(process.argv.slice(2));
  if (parsed.help || parsed.command === null) {
    if (parsed.help) {
      console.log(USAGE);
      process.exit(0);
    }
    console.error(USAGE);
    process.exit(1);
  }
  const rootDir = gitRoot();
  const gate = preflight({ rootDir, command: parsed.command });
  if (!gate.ok) {
    console.error(gate.message);
    process.exit(1);
  }
  runCommand(parsed.command, parsed.args);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
