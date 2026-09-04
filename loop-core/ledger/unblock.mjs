/**
 * progress の解除述語（`- **Unblock:**`）を読む。
 *
 * フェンス外の行だけを見る（lint / start-task の他メタ情報と同じ行集合）。
 * この作業が解釈するのは `path-exists:<リポジトリ相対パス>` だけである。
 * 試行ログの散文は見ない。
 */

import fs from 'node:fs';
import path from 'node:path';
import { linesOutsideFences } from './lint-docs.mjs';

const PATH_EXISTS_PREFIX = 'path-exists:';

/**
 * `- **Unblock:**` の生の値を、コードフェンスの外から探す。
 * 空の値も「行はある」と返す（解釈できない側）。行が無いときだけ null。
 *
 * @param {string} markdown
 * @returns {string | null}
 */
function findUnblockRaw(markdown) {
  const pattern = /^- \*\*Unblock:\*\*\s*(.*)$/;
  for (const { text } of linesOutsideFences(markdown)) {
    const m = pattern.exec(text);
    if (m) return m[1];
  }
  return null;
}

/**
 * `path-exists:` の右側を、リポジトリ相対パスとして受理できるか判定する純関数。
 * 受理したら末尾 `/` を除いた正規形を返す。解釈できなければ null。
 *
 * `/` 区切り。空セグメント・`.` / `..`・先頭 `/` は拒む。末尾 `/` は許容し、有無は同値。
 *
 * @param {string} value - バッククォートを剥がし trim した **Unblock:** の値全体
 * @returns {string | null}
 */
export function parsePathExistsPredicate(value) {
  if (typeof value !== 'string' || !value.startsWith(PATH_EXISTS_PREFIX)) return null;
  const rel = value.slice(PATH_EXISTS_PREFIX.length);
  if (rel.startsWith('/')) return null;
  if (rel.includes('\\')) return null;

  const segments = rel.split('/');
  while (segments.length > 0 && segments[segments.length - 1] === '') {
    segments.pop();
  }
  if (segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') return null;
  }
  return segments.join('/');
}

/**
 * progress.md から **Unblock:** を読む純関数。コードフェンスの中は読まない。
 *
 * @param {string} markdown
 * @returns {{kind: 'missing'} | {kind: 'unparseable'} | {kind: 'path-exists', relPath: string}}
 */
export function parseUnblock(markdown) {
  const raw = findUnblockRaw(markdown);
  if (raw === null) return { kind: 'missing' };
  const value = raw.replaceAll('`', '').trim();
  const relPath = parsePathExistsPredicate(value);
  if (relPath === null) return { kind: 'unparseable' };
  return { kind: 'path-exists', relPath };
}

/**
 * リポジトリルートからの相対パスが存在するか。ファイルでもディレクトリでもよい。
 * 正規化済み（`.` / `..` 無し）を前提にするが、ルート外へ出る入力は満たさない扱い。
 *
 * @param {string} rootDir
 * @param {string} relPath
 * @returns {boolean}
 */
export function repoPathExists(rootDir, relPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + path.sep)) return false;
  return fs.existsSync(target);
}

/**
 * Status=`Blocked` の作業について、解除述語が満たされて選択可能かを返す。
 * Status は書き換えない。副作用は無い。
 *
 * @param {string} markdown
 * @param {string} rootDir
 * @returns {{selectable: boolean, skipReason: string | null}}
 */
export function evaluateBlockedUnblock(markdown, rootDir) {
  const parsed = parseUnblock(markdown);
  if (parsed.kind === 'missing') {
    return { selectable: false, skipReason: '解除述語が無い' };
  }
  if (parsed.kind === 'unparseable') {
    return { selectable: false, skipReason: '解釈できない' };
  }
  if (!repoPathExists(rootDir, parsed.relPath)) {
    return { selectable: false, skipReason: null };
  }
  return { selectable: true, skipReason: null };
}
