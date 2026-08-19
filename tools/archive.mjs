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
  const statusRe = /^- \*\*Status:\*\*.*$/m;
  const targetRe = /^- \*\*Target Spec:\*\*.*$/m;
  const missing = [];
  if (!statusRe.test(text)) missing.push('Status');
  if (!targetRe.test(text)) missing.push('Target Spec');
  const rewritten = text
    .replace(statusRe, '- **Status:** Done')
    .replace(targetRe, `- **Target Spec:** \`specs/archive/${name}.md\``)
    // 手作業の手順どおり、アーカイブのチェック項目も閉じる。
    // Done なのに「PR マージ後のアーカイブ」が未着手のまま残るのを防ぐ
    .replace(/^- \[[ /]\] (PRマージ後のアーカイブ.*)$/m, '- [x] $1');
  return { text: rewritten, missing };
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
  // 進捗（.md）の存在が作業の定義である。
  // 前提: 判定は progress/ 直下だけを見る。`foo.v2` が既にアーカイブ済みだと
  // `foo.v2.png` は `foo` の抽出物として拾われる（既知の限界）。`foo` と `foo.v2` の両方に進捗があるなら、
  // `foo.v2.png` は `foo.v2` のものであって `foo` のものではない。
  // 名前がドットを含む作業を巻き込まないよう、最長一致する作業名に割り当てる。
  const longerWorks = entries
    .filter((e) => e.endsWith('.md') && e !== `${name}.md`)
    .map((e) => e.slice(0, -'.md'.length))
    .filter((work) => work.startsWith(`${name}.`));

  return entries
    .filter((e) => {
      if (e === `${name}.md`) return true;
      if (!e.startsWith(`${name}.`)) return false;
      // `foo.v2.md` は別作業の進捗であって `foo` の抽出物ではない
      if (e.endsWith('.md')) return false;
      return !longerWorks.some((work) => e.startsWith(`${work}.`));
    })
    .sort();
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

  // 移動計画を先に立てる。ここまでは一切ファイルを変更しない
  const specArchiveDir = path.join(root, 'specs', 'archive');
  const progressArchiveDir = path.join(root, 'progress', 'archive');
  const artifacts = collectArtifacts(fs.readdirSync(path.join(root, 'progress')), name);

  const plan = [
    { from: specPath, to: path.join(specArchiveDir, `${name}.md`), label: `specs/${name}.md -> specs/archive/${name}.md` },
    ...artifacts.map((file) => ({
      from: path.join(root, 'progress', file),
      to: path.join(progressArchiveDir, file),
      label: `progress/${file} -> progress/archive/${file}`,
    })),
  ];

  // 移動先がすでにあるなら、上書きせず失敗する。
  // archive/ は完了した作業の履歴であり、黙って壊してよいものではない。
  const collisions = plan.filter((m) => fs.existsSync(m.to)).map((m) => path.relative(root, m.to));
  if (collisions.length > 0) {
    return {
      ok: false,
      reason: `移動先がすでに存在します: ${collisions.join(', ')}。既存のアーカイブを上書きしません`,
    };
  }

  // 書き換えが空振りしないことも、動かす前に確かめる。
  // Status / Target Spec の行が無いまま移動すると、手順 2・5 が達成されないのに成功してしまう
  const { missing } = rewriteProgress(progressText, name);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `progress/${name}.md に ${missing.join(' / ')} の行がありません。書式を直してから実行してください`,
    };
  }

  // ここから先がファイルの変更。途中で失敗したら、やった分を巻き戻す
  fs.mkdirSync(specArchiveDir, { recursive: true });
  fs.mkdirSync(progressArchiveDir, { recursive: true });

  const moved = [];
  const done = [];
  try {
    for (const step of plan) {
      fs.renameSync(step.from, step.to);
      done.push(step);
      moved.push(step.label);
    }

    const movedProgress = path.join(progressArchiveDir, `${name}.md`);
    const rewritten = rewriteProgress(fs.readFileSync(movedProgress, 'utf8'), name);
    // 直接上書きすると、truncate 後・書き込み中に落ちたとき進捗が壊れる。
    // 隣に書ききってから rename で置き換える
    const tmp = `${movedProgress}.tmp`;
    fs.writeFileSync(tmp, rewritten.text);
    fs.renameSync(tmp, movedProgress);
  } catch (err) {
    // 逆順に戻す。spec だけ移動して progress が残る中途半端な状態を作らない
    for (const step of done.reverse()) {
      try {
        fs.renameSync(step.to, step.from);
      } catch {
        // 巻き戻しにも失敗したら、下で状態を伝える
      }
    }
    return {
      ok: false,
      reason: `移動中に失敗したため巻き戻しました: ${err.message}`,
    };
  }

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
