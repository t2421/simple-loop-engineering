/**
 * CLAUDE.md「変えてはいけないもの」の遵守を、base ブランチとの差分から機械的に検知する。
 *
 * 判定ロジックは純関数として公開し、テスト可能にしてある。
 * CLI としては `node tools/check-protected-paths.mjs <base-ref>` で実行する。
 * 違反があれば理由を表示して終了コード 1 で終わる。
 */

import { execFileSync } from 'node:child_process';

/** 人間による明示承認の経路。この PR ラベルが付いていればガードを通過させる */
export const ALLOW_LABEL = 'allow-protected-change';

/** 見出し・順番を固定した型。移動しても中身を変えてもいけない */
const TEMPLATES = ['specs/TEMPLATE.md', 'progress/TEMPLATE.md'];

/**
 * 既存ファイルの内容変更・削除を禁じ、新規追加と内容同一の移動は許すディレクトリ。
 * `specs/` は `archive/` も含む。
 */
const APPEND_ONLY_DIRS = [
  { prefix: 'specs/', label: '仕様' },
  { prefix: 'tests/', label: 'テスト' },
  { prefix: '.github/workflows/', label: 'ワークフロー' },
];

/**
 * `git diff --name-status -M` の出力を構造化する純関数。
 *
 * @param {string} raw - `git diff --name-status -M <base>...HEAD` の標準出力
 * @returns {Array<{status: string, path: string, oldPath?: string, similarity?: number}>}
 */
export function parseNameStatus(raw) {
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const fields = line.split('\t');
      const code = fields[0];
      // リネーム（R100）とコピー（C100）は「旧パス→新パス」の 2 列を持つ
      const rename = /^([RC])(\d+)$/.exec(code);
      if (rename) {
        return {
          status: rename[1],
          path: fields[2],
          oldPath: fields[1],
          similarity: Number(rename[2]),
        };
      }
      return { status: code, path: fields[1] };
    });
}

/**
 * `package.json` の `scripts` が変わったかを判定する純関数。
 * キーの増減と値の変更の両方を見る。
 *
 * @param {Record<string, string>} baseScripts - base 側の scripts
 * @param {Record<string, string>} headScripts - head 側の scripts
 * @returns {boolean} 変わっていれば true
 */
export function scriptsChanged(baseScripts, headScripts) {
  const base = baseScripts ?? {};
  const head = headScripts ?? {};
  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
  for (const key of keys) {
    if (base[key] !== head[key]) return true;
  }
  return false;
}

/**
 * 差分に保護パスの変更が含まれるかを判定する純関数。
 *
 * @param {object} input
 * @param {Array<{status: string, path: string, oldPath?: string, similarity?: number}>} input.changes
 * @param {Record<string, string>} [input.baseScripts] - base 側の package.json の scripts
 * @param {Record<string, string>} [input.headScripts] - head 側の package.json の scripts
 * @returns {Array<{path: string, reason: string}>} 違反の一覧。空なら通過
 */
export function findViolations({ changes, baseScripts, headScripts }) {
  const violations = [];

  for (const change of changes) {
    const { status, path, oldPath, similarity } = change;

    // 型は移動も内容変更も削除も許さない
    if (TEMPLATES.includes(path) || TEMPLATES.includes(oldPath)) {
      violations.push({
        path: oldPath ?? path,
        reason: '型（TEMPLATE.md）は変更も移動もできない',
      });
      continue;
    }

    if (path === 'package.json' && scriptsChanged(baseScripts, headScripts)) {
      violations.push({
        path: 'package.json',
        reason: '検証コマンド（scripts）が変わっている',
      });
      continue;
    }

    const dir = APPEND_ONLY_DIRS.find(
      (d) => path.startsWith(d.prefix) || (oldPath ?? '').startsWith(d.prefix),
    );
    if (!dir) continue;

    // 新規追加は許可
    if (status === 'A') continue;

    // 内容が同一のままの移動（アーカイブ作業）は許可
    if ((status === 'R' || status === 'C') && similarity === 100) continue;

    if (status === 'D') {
      violations.push({ path, reason: `既存の${dir.label}が削除されている` });
    } else if (status === 'R' || status === 'C') {
      violations.push({
        path: `${oldPath} -> ${path}`,
        reason: `既存の${dir.label}が内容ごと移動されている`,
      });
    } else {
      violations.push({ path, reason: `既存の${dir.label}の内容が変わっている` });
    }
  }

  return violations;
}

/**
 * PR ラベルに承認ラベルが含まれるかを判定する純関数。
 * ラベル情報が取得できない場合は安全側に倒して false を返す。
 *
 * @param {string[] | null | undefined} labels
 * @returns {boolean}
 */
export function hasAllowLabel(labels) {
  if (!Array.isArray(labels)) return false;
  return labels.includes(ALLOW_LABEL);
}

/**
 * 環境変数からラベルの一覧を読む。
 * `PR_LABELS` は GitHub Actions から JSON 配列で渡す。読めなければ null。
 *
 * @returns {string[] | null}
 */
function readLabels() {
  const raw = process.env.PR_LABELS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * 指定した ref の package.json の scripts を読む。ref が読めなければ例外を投げる。
 *
 * @param {string} ref - `git show` に渡す ref。空文字なら作業ツリー
 * @returns {Record<string, string>}
 */
function readScripts(ref) {
  const raw = execFileSync('git', ['show', `${ref}:package.json`], { encoding: 'utf8' });
  return JSON.parse(raw).scripts ?? {};
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('使い方: node tools/check-protected-paths.mjs <base-ref>');
    process.exit(1);
  }

  let changes;
  let baseScripts;
  let headScripts;
  try {
    const raw = execFileSync(
      'git',
      ['diff', '--name-status', '-M', `${baseRef}...HEAD`],
      { encoding: 'utf8' },
    );
    changes = parseNameStatus(raw);
    baseScripts = readScripts(baseRef);
    headScripts = readScripts('HEAD');
  } catch (err) {
    // 差分が取れないまま素通りさせない（shallow clone 等）
    console.error(`base (${baseRef}) との差分を取得できませんでした: ${err.message}`);
    console.error('shallow clone の場合は fetch-depth: 0 が要ります。');
    process.exit(1);
  }

  const violations = findViolations({ changes, baseScripts, headScripts });

  if (violations.length === 0) {
    console.log(`保護パスの変更はありません（${changes.length} 件の差分を確認）。`);
    return;
  }

  const labels = readLabels();
  console.error(`保護パスの変更を ${violations.length} 件検知しました:`);
  for (const v of violations) {
    console.error(`  - ${v.path}: ${v.reason}`);
  }

  if (hasAllowLabel(labels)) {
    console.log(`\nラベル ${ALLOW_LABEL} があるため通過させます（人間による明示承認）。`);
    return;
  }

  console.error(
    `\n変更が正当なら、改訂内容と理由を spec に書いたうえで PR に ${ALLOW_LABEL} ラベルを付けてください。`,
  );
  process.exit(1);
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）
if (process.argv[1] && process.argv[1].endsWith('check-protected-paths.mjs')) {
  main();
}
