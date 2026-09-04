/**
 * PR マージ後のアーカイブ（Status 更新・ファイル移動・パス書き換え）を 1 コマンドで行う。
 *
 * 使い方: node loop-core/bin/loop.mjs archive <id>-<slug>
 *
 * 条件を満たさないときはファイルを一切変更せず、終了コード非 0 で理由を表示する。
 * 移動ロジックは PR 確認部と分離してあり、`checkPr` を注入すればテストできる。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { checkExamples as inspectExamples } from '../../tools/check-examples.mjs';

const execFileAsync = promisify(execFile);

/**
 * 作業名（`<id>-<slug>`）として受け付ける形。
 *
 * ゼロ埋め 4 桁の ID で始まることを要求すると、型（`TEMPLATE-spec` /
 * `TEMPLATE-progress`）を弾ける。パス区切りを禁じることで `..` による
 * 脱出も防ぐ。
 *
 * slug の文字種は**絞らない**。CLAUDE.md が制約するのは 4 桁の ID だけで、
 * slug は一覧用のラベルである。ここで `[a-z0-9-]` などに絞ると、
 * `tools/start-task.mjs` が作業として選べる名前（`^(\d{4})-(.+)$`）を
 * アーカイブだけ拒む状態になり、**必須工程であるアーカイブが実行不能な作業**が
 * 生まれる。緩い側ではなく、選択側と同じ広さに揃える。
 */
const WORK_NAME_RE = /^\d{4}-[^/\\]+$/;

/**
 * 作業名として正しいかを判定する純関数。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isWorkName(name) {
  if (typeof name !== 'string') return false;
  // 前後の空白は名前の一部にしない。見えない差でディレクトリを取り違えない
  if (name !== name.trim()) return false;
  return WORK_NAME_RE.test(name);
}

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
 * 進捗ファイルから **Branch** を読む純関数。
 *
 * @param {string} text - 進捗ファイルの中身
 * @returns {string | null} ブランチ名。欄が無ければ null
 */
export function readBranch(text) {
  const m = /^- \*\*Branch:\*\*\s*(.+?)\s*$/m.exec(text);
  if (!m) return null;
  const value = m[1].replace(/^`|`$/g, '').trim();
  return value === '' ? null : value;
}

/**
 * GitHub の PR URL から owner / repo / number を取る純関数。
 *
 * @param {string} url
 * @returns {{owner: string, repo: string, number: number} | null} PR URL でなければ null
 */
export function parsePrUrl(url) {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/**
 * PR がこのリポジトリの、この作業のものかを判定する純関数。
 *
 * マージ済みであることだけでは足りない。別リポジトリや別作業のマージ済み PR を
 * 貼れば通ってしまい、アーカイブが「実装が main に入った」という嘘の記録になる。
 *
 * @param {object} input
 * @param {string} input.url - 進捗の PR 欄の URL
 * @param {{owner: string, repo: string}} input.repo - 実行中のリポジトリ
 * @param {string | undefined} input.headRefName - PR の head ブランチ
 * @param {string | null} input.branch - 進捗の Branch
 * @returns {{ok: boolean, reason?: string}}
 */
export function checkOwnership({ url, repo, headRefName, branch }) {
  const parsed = parsePrUrl(url);
  if (!parsed) {
    return { ok: false, reason: `PR の URL として読めません: ${url}` };
  }
  if (!repo || !repo.owner || !repo.repo) {
    return { ok: false, reason: 'このリポジトリの owner/repo を取得できませんでした' };
  }
  // GitHub の owner/repo は大小文字を区別しない。区別すると正当な PR を弾く
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!same(parsed.owner, repo.owner) || !same(parsed.repo, repo.repo)) {
    return {
      ok: false,
      reason: `PR が別のリポジトリのものです: ${parsed.owner}/${parsed.repo}（このリポジトリは ${repo.owner}/${repo.repo}）`,
    };
  }
  if (!branch) {
    return { ok: false, reason: '進捗に **Branch** の行がありません' };
  }
  if (!headRefName) {
    return { ok: false, reason: 'PR の head ブランチを取得できませんでした' };
  }
  if (headRefName !== branch) {
    return {
      ok: false,
      reason: `PR の head ブランチが進捗の Branch と違います: ${headRefName}（進捗は ${branch}）`,
    };
  }
  return { ok: true };
}

/**
 * 進捗の Status を Done に、Target Spec をアーカイブ後のパスにする純関数。
 * 試行ログなど他の行は触らない。
 *
 * @param {string} text - 進捗ファイルの中身
 * @param {string} name - 作業名（`<id>-<slug>`）
 * @returns {{text: string, missing: string[]}} 書き換え後の中身と、当たらなかった行
 */
export function rewriteProgress(text, name) {
  const statusRe = /^- \*\*Status:\*\*.*$/m;
  const targetRe = /^- \*\*Target Spec:\*\*.*$/m;
  const missing = [];
  if (!statusRe.test(text)) missing.push('Status');
  if (!targetRe.test(text)) missing.push('Target Spec');
  const rewritten = text
    .replace(statusRe, '- **Status:** `Done`')
    .replace(targetRe, `- **Target Spec:** \`task/archive/${name}/spec.md\``)
    // 手作業の手順どおり、アーカイブのチェック項目も閉じる。
    // Done なのに「PR マージ後のアーカイブ」が未着手のまま残るのを防ぐ
    .replace(/^- \[[ /]\] (PRマージ後のアーカイブ.*)$/m, '- [x] $1');
  return { text: rewritten, missing };
}

/**
 * `gh pr view` で PR がマージ済みかを確認する。
 *
 * @param {string} url - PR の URL
 * @returns {Promise<{merged: boolean, reason?: string}>}
 */
async function checkPrWithGh(url) {
  try {
    const { stdout } = await execFileAsync('gh', [
      'pr', 'view', url, '--json', 'state,headRefName',
    ]);
    const { state, headRefName } = JSON.parse(stdout);
    if (state !== 'MERGED') {
      return { merged: false, reason: `PR がマージされていません（state: ${state}）` };
    }
    // 帰属の判定は checkOwnership が URL を直接見る。ここでは head だけ返す
    return { merged: true, headRefName };
  } catch (err) {
    return { merged: false, reason: `PR の状態を確認できませんでした: ${err.message}` };
  }
}

/**
 * 実行中のリポジトリの owner/repo を返す。
 *
 * @param {string} root - リポジトリのルート
 * @returns {Promise<{owner: string, repo: string}>}
 */
async function getRepoWithGh(root) {
  const { stdout } = await execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner'], {
    // root を渡さないと、別ディレクトリを対象にしたとき「A の PR を検証して B を書き換える」
    // ことになる。判定の対象と変更の対象を必ず一致させる
    cwd: root,
  });
  const [owner, repo] = JSON.parse(stdout).nameWithOwner.split('/');
  return { owner, repo };
}

/**
 * アーカイブを実行する。条件を満たさないときは何も変更しない。
 *
 * @param {string} name - 作業名
 * @param {object} [opts]
 * @param {string} [opts.root] - リポジトリのルート
 * @param {(url: string) => Promise<{merged: boolean, reason?: string, headRefName?: string}>} [opts.checkPr] - PR 確認。テストで差し替える
 * @param {() => Promise<{owner: string, repo: string}>} [opts.getRepo] - 実行中のリポジトリ。テストで差し替える
 * @returns {Promise<{ok: boolean, reason?: string, moved?: string[]}>}
 *
 * ファイルを動かす直前に同じ作業の spec「例」を検査する。評価可能な行が失敗したら
 * 何も変更せず失敗する。評価可能な行が 0 件なら止めない。
 */
export async function archive(
  name,
  { root = process.cwd(), checkPr = checkPrWithGh, getRepo = getRepoWithGh } = {},
) {
  if (!isWorkName(name)) {
    // 型（TEMPLATE-spec / TEMPLATE-progress）とパス区切り・`..` もここで弾く
    return { ok: false, reason: `作業名が <id>-<slug> の形ではありません: ${name}` };
  }

  const workDir = path.join(root, 'task', name);
  const specPath = path.join(workDir, 'spec.md');
  const progressPath = path.join(workDir, 'progress.md');

  if (!fs.existsSync(workDir)) {
    return { ok: false, reason: `task/${name}/ がありません` };
  }
  if (!fs.existsSync(specPath)) {
    return { ok: false, reason: `task/${name}/spec.md がありません` };
  }
  if (!fs.existsSync(progressPath)) {
    return { ok: false, reason: `task/${name}/progress.md がありません` };
  }

  let progressText;
  try {
    progressText = fs.readFileSync(progressPath, 'utf8');
  } catch (err) {
    return { ok: false, reason: `task/${name}/progress.md を読めませんでした: ${err.message}` };
  }
  const prUrl = readPrUrl(progressText);
  if (!prUrl) {
    return {
      ok: false,
      reason: `task/${name}/progress.md の PR が ${PR_NOT_CREATED} です。PR を作ってマージしてから実行してください`,
    };
  }

  const pr = await checkPr(prUrl);
  if (!pr.merged) {
    return { ok: false, reason: pr.reason ?? `PR がマージされていません: ${prUrl}` };
  }

  // マージ済みでも、それがこの作業の PR とは限らない。
  // 別リポジトリや別作業の PR を貼れば通ってしまうので、帰属も確かめる
  let repo;
  try {
    repo = await getRepo(root);
  } catch (err) {
    // 判定できないまま素通りさせない
    return { ok: false, reason: `このリポジトリの情報を取得できませんでした: ${err.message}` };
  }

  const ownership = checkOwnership({
    url: prUrl,
    repo,
    headRefName: pr.headRefName,
    branch: readBranch(progressText),
  });
  if (!ownership.ok) {
    return { ok: false, reason: ownership.reason };
  }

  // 移動先と書式を先に確かめる。ここまでは一切ファイルを変更しない
  const archiveParent = path.join(root, 'task', 'archive');
  const archiveDir = path.join(archiveParent, name);

  // 移動先がすでにあるなら、上書きせず失敗する。
  // archive/ は完了した作業の履歴であり、黙って壊してよいものではない。
  if (fs.existsSync(archiveDir)) {
    return {
      ok: false,
      reason: `移動先がすでに存在します: task/archive/${name}/。既存のアーカイブを上書きしません`,
    };
  }

  // 書き換えが空振りしないことも、動かす前に確かめる。
  // Status / Target Spec の行が無いまま移動すると、手順 1・3 が達成されないのに成功してしまう
  const { missing } = rewriteProgress(progressText, name);
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `task/${name}/progress.md に ${missing.join(' / ')} の行がありません。書式を直してから実行してください`,
    };
  }

  // 評価可能な「例」が落ちている作業をアーカイブすると、Done の自己申告が残る。
  // 検査が非 0 なら、ここまで一切ファイルを変更していない状態で止める。
  // 評価可能な行が 0 件（既存 archive テストの fixture を含む）は成功とし、止めない。
  const examples = inspectExamples(name, { root });
  if (!examples.ok) {
    return { ok: false, reason: examples.reason ?? '「例」の検査が失敗しました' };
  }

  // ここから先がファイルの変更。途中で失敗したら、やった分を巻き戻す。
  // 作業ディレクトリごと 1 回で移すので、spec だけ動いて progress が残る、
  // 関連ファイルが取り残される、といった中途半端な状態は原理的に起きない
  try {
    fs.mkdirSync(archiveParent, { recursive: true });
    fs.renameSync(workDir, archiveDir);
  } catch (err) {
    // 移動できなかった。まだ何も変わっていないので巻き戻すものはない
    return { ok: false, reason: `移動できませんでした（変更していません）: ${err.message}` };
  }

  const moved = [`task/${name}/ -> task/archive/${name}/`];
  try {
    const movedProgress = path.join(archiveDir, 'progress.md');
    const rewritten = rewriteProgress(fs.readFileSync(movedProgress, 'utf8'), name);
    // 直接上書きすると、truncate 後・書き込み中に落ちたとき進捗が壊れる。
    // 隣に書ききってから rename で置き換える
    const tmp = `${movedProgress}.tmp`;
    fs.writeFileSync(tmp, rewritten.text);
    fs.renameSync(tmp, movedProgress);
  } catch (err) {
    // 進捗を書き換えられなかったら、移動そのものを取り消す。
    // Status が In Progress のまま archive/ に置かれた状態を残さない
    try {
      fs.renameSync(archiveDir, workDir);
    } catch {
      // 巻き戻しにも失敗したら、下で状態を伝える
    }
    return {
      ok: false,
      reason: `進捗の書き換えに失敗したため移動を巻き戻しました: ${err.message}`,
    };
  }

  return { ok: true, moved };
}

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('使い方: node loop-core/bin/loop.mjs archive <id>-<slug>');
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
