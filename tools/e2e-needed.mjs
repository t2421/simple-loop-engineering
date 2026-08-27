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
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * マニフェストのパス。**このファイルは import を持てない**（CI が base リビジョンの版を
 * `$RUNNER_TEMP` へ取り出して単体実行するため）。読み取りは最小限を自前に持つ。
 */
const MANIFEST_PATH = 'loop.manifest.json';

/** この判定が担当する条件付き工程の名前 */
const STAGE_NAME = 'e2e';

/** 発火するパスの glob。**base リビジョンのマニフェストから差し込む。** */
let TRIGGERS = null;

/** 発火条件を差し込む。テストは直接渡す */
export function useTriggers(triggers) {
  TRIGGERS = triggers;
}

/**
 * glob を正規表現にする純関数。対応するのは `**`（区切りを跨ぐ）と `*`（跨がない）だけ。
 *
 * **これは実行機構ではない。** マニフェストから読むのはパターン文字列であって、
 * 評価されるコードではない。
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `a/**` は `a/` 配下すべて。`a/**/b` は間の階層が何段でもよい
        out += '.*';
        i += 1;
        if (glob[i + 1] === '/') i += 1;
        continue;
      }
      out += '[^/]*';
      continue;
    }
    out += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

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
  if (TRIGGERS === null) {
    throw new Error('発火条件が読み込まれていません（useTriggers を先に呼ぶ）');
  }
  return TRIGGERS.some((glob) => globToRegExp(glob).test(filePath));
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

/**
 * 指定した ref のマニフェストから、この工程の発火条件を読む。
 *
 * **base ブランチの先端から読む。merge-base ではない。**
 * 分岐点はいくらでも古くできるので、merge-base から読むと候補側フォールバックに落ち、
 * `conditionalStages` から工程を落とすだけで `needed=false` にできる。
 * CI が base 版のこのファイルを実行するのと同じ ref に揃える。
 *
 * 工程の宣言が無ければ「この移植先にこの工程は存在しない」。**空実装は置かない。**
 *
 * @param {string} ref
 * @returns {string[] | null} 発火条件。工程が宣言されていなければ null
 */
function readTriggers(ref) {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${ref}:${MANIFEST_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    console.error(`::warning::${ref} にマニフェストが無いため候補側で判定します（導入 PR のみ想定）。`);
    raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  }
  const stages = JSON.parse(raw).conditionalStages ?? [];
  const stage = stages.find((x) => x.name === STAGE_NAME);
  if (stage === undefined) return null;
  if (!Array.isArray(stage.triggers) || stage.triggers.length === 0) {
    throw new Error(`条件付き工程 ${STAGE_NAME} に triggers がありません`);
  }
  return stage.triggers;
}

function main() {
  const baseRef = process.argv[2];
  // 使い方の判定は宣言の読み取りより先に行う。順番を逆にすると、引数無しの誤用が
  // 「発火条件を読めない」に化けて、間引かない側（needed=true）で素通りする
  if (!baseRef) {
    console.error('使い方: node tools/e2e-needed.mjs <base-ref>');
    process.exit(1);
  }
  let triggers;
  try {
    triggers = readTriggers(baseRef);
  } catch (err) {
    // 判定できないなら**間引かない**。工程を飛ばす側へ倒さない
    console.error(`発火条件を読めませんでした。e2e を間引かず回します: ${err.message}`);
    writeNeeded(true);
    return;
  }
  if (triggers === null) {
    console.log(`条件付き工程 ${STAGE_NAME} は宣言されていません。この工程は存在しません。`);
    writeNeeded(false);
    return;
  }
  useTriggers(triggers);

  const result = resolveNeeded({ baseRef });
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
