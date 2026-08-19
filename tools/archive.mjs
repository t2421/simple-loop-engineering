/**
 * PR マージ後のアーカイブ（Status 更新・ファイル移動・パス書き換え）を 1 コマンドで行う。
 *
 * 使い方: node tools/archive.mjs <作業名>
 *
 * 条件を満たさないときはファイルを一切変更せず、終了コード非 0 で理由を表示する。
 * 移動ロジックは PR 確認部と分離してあり、`checkPr` を注入すればテストできる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 移動してはいけない作業名 */
const FORBIDDEN = 'TEMPLATE';

/** 進捗の PR 欄が未作成であることを示す値 */
const PR_NOT_CREATED = '未作成';

/**
 * 進捗ファイルから PR の URL を読む純関数。
 *
 * @param {string} text - 進捗ファイルの中身
 * @returns {string | null} URL。`未作成` や欄が無ければ null
 */
export function readPrUrl(text) {
  const m = /^- \*\*PR:\*\*\s*(.+?)\s*$/m.exec(text);
  if (!m) return null;
  const value = m[1].replace(/^`|`$/g, '').trim();
  if (value === '' || value === PR_NOT_CREATED) return null;
  const url = /https?:\/\/\S+/.exec(value);
  return url ? url[0] : null;
}

/**
 * 進捗の Status を Done に、Target Spec をアーカイブ後のパスにする純関数。
 * 試行ログなど他の行は触らない。
 *
 * @param {string} text - 進捗ファイルの中身
 * @param {string} name - 作業名
 * @returns {string} 書き換え後の中身
 */
export function rewriteProgress(text, name) {
  return text
    .replace(/^- \*\*Status:\*\*.*$/m, '- **Status:** Done')
    .replace(
      /^- \*\*Target Spec:\*\*.*$/m,
      `- **Target Spec:** \`specs/archive/${name}.md\``,
    );
}

/**
 * 進捗と同じベース名の抽出物を探す純関数。
 * `<name>.md` 自身と、`<name>.` で始まるファイルだけを対象にする。
 * `<name>-other.md` のような別作業は巻き込まない。
 *
 * @param {string[]} entries - progress/ 直下のファイル名一覧
 * @param {string} name - 作業名
 * @returns {string[]} 移動対象のファイル名
 */
export function collectArtifacts(entries, name) {
  return entries.filter((e) => e === `${name}.md` || e.startsWith(`${name}.`)).sort();
}

/**
 * `gh pr view` で PR がマージ済みかを確認する。
 *
 * @param {string} url - PR の URL
 * @returns {Promise<{merged: boolean, reason?: string}>}
 */
async function checkPrWithGh(url) {
  try {
    const { stdout } = await execFileAsync('gh', ['pr', 'view', url, '--json', 'state']);
    const state = JSON.parse(stdout).state;
    if (state === 'MERGED') return { merged: true };
    return { merged: false, reason: `PR がマージされていません（state: ${state}）` };
  } catch (err) {
    return { merged: false, reason: `PR の状態を確認できませんでした: ${err.message}` };
  }
}

/**
 * アーカイブを実行する。条件を満たさないときは何も変更しない。
 *
 * @param {string} name - 作業名
 * @param {object} [opts]
 * @param {string} [opts.root] - リポジトリのルート
 * @param {(url: string) => Promise<{merged: boolean, reason?: string}>} [opts.checkPr] - PR 確認。テストで差し替える
 * @returns {Promise<{ok: boolean, reason?: string, moved?: string[]}>}
 */
export async function archive(name, { root = process.cwd(), checkPr = checkPrWithGh } = {}) {
  if (!name || name.includes('/') || name.includes('..')) {
    return { ok: false, reason: `作業名が不正です: ${name}` };
  }
  if (name === FORBIDDEN) {
    return { ok: false, reason: 'TEMPLATE.md は移動しません' };
  }

  const specPath = path.join(root, 'specs', `${name}.md`);
  const progressPath = path.join(root, 'progress', `${name}.md`);

  if (!fs.existsSync(specPath)) {
    return { ok: false, reason: `specs/${name}.md がありません` };
  }
  if (!fs.existsSync(progressPath)) {
    return { ok: false, reason: `progress/${name}.md がありません` };
  }

  const progressText = fs.readFileSync(progressPath, 'utf8');
  const prUrl = readPrUrl(progressText);
  if (!prUrl) {
    return {
      ok: false,
      reason: `progress/${name}.md の PR が ${PR_NOT_CREATED} です。PR を作ってマージしてから実行してください`,
    };
  }

  const pr = await checkPr(prUrl);
  if (!pr.merged) {
    return { ok: false, reason: pr.reason ?? `PR がマージされていません: ${prUrl}` };
  }

  // ここから先はファイルを変更する。事前チェックはすべて通っている
  const specArchiveDir = path.join(root, 'specs', 'archive');
  const progressArchiveDir = path.join(root, 'progress', 'archive');
  fs.mkdirSync(specArchiveDir, { recursive: true });
  fs.mkdirSync(progressArchiveDir, { recursive: true });

  const artifacts = collectArtifacts(fs.readdirSync(path.join(root, 'progress')), name);
  const moved = [];

  fs.renameSync(specPath, path.join(specArchiveDir, `${name}.md`));
  moved.push(`specs/${name}.md -> specs/archive/${name}.md`);

  for (const file of artifacts) {
    fs.renameSync(
      path.join(root, 'progress', file),
      path.join(progressArchiveDir, file),
    );
    moved.push(`progress/${file} -> progress/archive/${file}`);
  }

  const movedProgress = path.join(progressArchiveDir, `${name}.md`);
  fs.writeFileSync(movedProgress, rewriteProgress(fs.readFileSync(movedProgress, 'utf8'), name));

  return { ok: true, moved };
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('使い方: node tools/archive.mjs <作業名>');
    process.exit(1);
  }

  const result = await archive(name);
  if (!result.ok) {
    console.error(`アーカイブしませんでした: ${result.reason}`);
    process.exit(1);
  }

  console.log(`${name} をアーカイブしました:`);
  for (const line of result.moved) {
    console.log(`  ${line}`);
  }
  console.log(`\n次: git add -A && git commit -m "docs: archive ${name}"`);
}

// CLI として起動されたときだけ実行する
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
