/**
 * loop-core をパッケージマネージャ無しのリポジトリへコピーする。
 *
 *   node loop-core/install.mjs <dest> [--layer=all|ledger|gate]
 *
 * dest に `loop-core/` を作る。npm は使わない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CORE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

const LAYERS = Object.freeze({
  all: null,
  ledger: ['bin', 'lib', 'ledger', 'templates', 'tests', 'VERSION', 'CLAUDE_CONFIG_COMPAT', 'install.mjs', 'README.md'],
  gate: ['bin', 'lib', 'gate', 'tests', 'VERSION', 'CLAUDE_CONFIG_COMPAT', 'install.mjs', 'README.md'],
});

/**
 * @param {string[]} argv
 * @returns {{ dest: string, layer: 'all' | 'ledger' | 'gate' } | { error: string }}
 */
export function parseInstallArgs(argv) {
  if (argv.length === 0) return { error: '使い方: node loop-core/install.mjs <dest> [--layer=all|ledger|gate]' };
  let dest;
  let layer = 'all';
  for (const arg of argv) {
    if (arg.startsWith('--layer=')) {
      const value = arg.slice('--layer='.length);
      if (!(value in LAYERS)) return { error: `--layer が不正: ${value}（all | ledger | gate）` };
      layer = /** @type {'all' | 'ledger' | 'gate'} */ (value);
    } else if (dest === undefined) {
      dest = arg;
    } else {
      return { error: `余分な引数: ${arg}` };
    }
  }
  if (dest === undefined) return { error: 'コピー先 <dest> がありません' };
  return { dest, layer };
}

/**
 * @param {string} destRoot
 * @param {{ layer?: 'all' | 'ledger' | 'gate', source?: string }} [opts]
 * @returns {{ ok: true, dest: string } | { ok: false, reason: string }}
 */
export function installCore(destRoot, { layer = 'all', source = CORE_ROOT } = {}) {
  const dest = path.join(path.resolve(destRoot), 'loop-core');
  if (fs.existsSync(dest)) {
    return { ok: false, reason: `コピー先がすでにあります: ${dest}` };
  }
  const names = LAYERS[layer];
  try {
    fs.mkdirSync(dest, { recursive: true });
    if (names === null) {
      copyTree(source, dest);
    } else {
      for (const name of names) {
        const from = path.join(source, name);
        if (!fs.existsSync(from)) continue;
        const to = path.join(dest, name);
        copyTree(from, to);
      }
    }
  } catch (err) {
    try {
      fs.rmSync(dest, { recursive: true, force: true });
    } catch {
      // 片付けに失敗しても下の理由を返す
    }
    return { ok: false, reason: `コピーできませんでした: ${err.message}` };
  }
  return { ok: true, dest };
}

function copyTree(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.cpSync(from, to, { recursive: true });
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function main() {
  const parsed = parseInstallArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }
  const result = installCore(parsed.dest, { layer: parsed.layer });
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(`loop-core を ${result.dest} にコピーしました（layer=${parsed.layer}）。`);
  console.log('起動: node loop-core/bin/loop.mjs <command>');
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
