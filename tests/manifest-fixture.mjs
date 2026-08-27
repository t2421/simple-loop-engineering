/**
 * 一時 git リポジトリのフィクスチャに、**実物のマニフェスト**を置く。
 *
 * ツールはマニフェストが無ければ既定値で動かず明示的に失敗する。フィクスチャにも
 * 宣言が要る。テスト用の別表を作らず実物を配るのは、宣言を変えたときにテストが
 * 追随せず緑のままになるのを防ぐためである。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** マニフェストのパス（リポジトリルートからの相対） */
export const MANIFEST_PATH = 'loop.manifest.json';

/**
 * フィクスチャのルートに実物のマニフェストを写す。
 *
 * @param {string} cwd - フィクスチャのルート
 */
export function writeManifest(cwd) {
  fs.copyFileSync(path.join(ROOT, MANIFEST_PATH), path.join(cwd, MANIFEST_PATH));
  // `verify.definedIn` が指すファイルの存在も宣言の一部である（無ければツールは失敗する）。
  // フィクスチャには中身の要らない置き石を作る。**判定に使う値は実物から来る**
  const manifest = JSON.parse(fs.readFileSync(path.join(cwd, MANIFEST_PATH), 'utf8'));
  for (const d of manifest.verify.definedIn) {
    const file = path.join(cwd, d.path);
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, d.jsonKey === undefined ? '' : `{"${d.jsonKey}":{}}\n`);
  }
}
