/**
 * テストが要る Chromium 本体を用意する。
 *
 * `package.json` の `pretest` から呼ばれるので、素の checkout でも
 * `npm ci && npm run ci` が通る。テストコード側に環境セットアップを
 * 持たせないための分離である（`scripts-freeze-procedure`）。
 *
 * すでに入っていれば何もしない。導入に失敗したら、黙ってスキップせず
 * エラーを表示して終了コード非 0 で終わる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Chromium 本体がすでにあるかを調べる。
 *
 * @returns {boolean} 実行ファイルが存在すれば true
 */
function isInstalled() {
  try {
    const executable = chromium.executablePath();
    return Boolean(executable) && fs.existsSync(executable);
  } catch {
    // executablePath() 自体が投げる場合は未導入として扱う
    return false;
  }
}

function main() {
  if (isInstalled()) return;

  console.log('Chromium が見つかりません。playwright install chromium を実行します。');
  try {
    execFileSync('npx', ['playwright', 'install', 'chromium'], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`Chromium の導入に失敗しました: ${err.message}`);
    console.error('手動で `npx playwright install chromium` を実行してください。');
    process.exit(1);
  }

  if (!isInstalled()) {
    // インストールコマンドが成功しても実体が無いなら、テストは必ず落ちる。
    // ここで気づけるようにする
    console.error('playwright install は成功しましたが Chromium が見つかりません。');
    process.exit(1);
  }
}

main();
