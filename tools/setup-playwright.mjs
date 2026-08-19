/**
 * テストが要る Chromium 本体を用意する。
 *
 * `package.json` の `pretest:e2e` から呼ばれるので、素の checkout でも
 * `npm ci && npm run test:e2e` が通る。テストコード側に環境セットアップを
 * 持たせないための分離である（`scripts-freeze-procedure`）。
 *
 * 導入済みかの判定は `playwright install` 自身に任せる。自前で
 * `chromium.executablePath()` を見ると、それが指すのはフル Chromium
 * なのに `chromium.launch()` が使うのは chromium_headless_shell なので、
 * shell だけ欠けた部分キャッシュを「導入済み」と誤判定して素通りする。
 * 導入済みなら 1 秒ほどで何も出さずに終わる。
 *
 * 導入に失敗したら、黙ってスキップせずエラーを表示して終了コード非 0 で終わる。
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  try {
    execFileSync('npx', ['playwright', 'install', 'chromium'], {
      cwd: rootDir,
      // ダウンロードが要るときは数分かかる。進捗を見せる
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`Chromium の導入に失敗しました: ${err.message}`);
    console.error('手動で `npx playwright install chromium` を実行してください。');
    process.exit(1);
  }
}

main();
