/**
 * ループのプロジェクト固有値を宣言するマニフェストの読み取り・検証。
 *
 * プラグイン実行機構ではない。名前・コマンド・パスの宣言だけを扱う。
 * 既定値では補わない。欠けていればパスと理由を出して失敗する。
 *
 * CLI: `node tools/loop-manifest.mjs [ルート]` で検証し、正規化済み JSON を出す。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** リポジトリ直下のマニフェスト。ツールが固有値を探す場所の契約 */
export const MANIFEST_FILE = 'loop.manifest.json';

export class ManifestError extends Error {
  /**
   * @param {string} message
   * @param {{ cause?: unknown }} [options]
   */
  constructor(message, options) {
    super(message, options);
    this.name = 'ManifestError';
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

/**
 * マニフェストに書ける相対パスか。すでに正規形の posix 相対パスだけを受け付ける。
 * `..` / `.` / バックスラッシュ / 絶対パス / 正規化で変わる表記は拒否する。
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isRelativeRepoPath(value) {
  if (!isNonEmptyString(value)) return false;
  if (value.includes('\\')) return false;
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value);
  if (normalized !== value) return false;
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return false;
  return true;
}

/**
 * @param {string} manifestPath
 * @param {string} field
 * @returns {never}
 */
function typeError(manifestPath, field) {
  throw new ManifestError(`${manifestPath}: ${field} の型が不正です`);
}

/**
 * マニフェストの値を検証して正規化する純関数。既定値で補わない。
 *
 * @param {unknown} data
 * @param {{ manifestPath: string, fileExists?: (p: string) => boolean }} opts
 * @returns {{
 *   install?: { argv: string[] },
 *   verify: { command: string, definedIn: string[] },
 *   stages: Array<{ name: string, command: string, paths: string[] }>,
 *   protectedPaths: string[],
 *   complexityModels?: { S: string, M: string, L: string },
 *   reviewers?: Record<string, string>,
 * }}
 */
export function validateManifest(data, { manifestPath, fileExists = () => true }) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ManifestError(`${manifestPath}: マニフェストはオブジェクトである必要があります`);
  }

  const record = /** @type {Record<string, unknown>} */ (data);
  const verify = record.verify;
  if (verify === undefined) {
    throw new ManifestError(`${manifestPath}: 必須項目 verify がありません`);
  }
  if (verify === null || typeof verify !== 'object' || Array.isArray(verify)) {
    typeError(manifestPath, 'verify');
  }
  const verifyRecord = /** @type {Record<string, unknown>} */ (verify);
  if (!isNonEmptyString(verifyRecord.command)) {
    throw new ManifestError(`${manifestPath}: 必須項目 verify.command がありません`);
  }

  let definedIn = verifyRecord.definedIn;
  if (definedIn === undefined) {
    throw new ManifestError(`${manifestPath}: 必須項目 verify.definedIn がありません`);
  }
  if (typeof definedIn === 'string') {
    definedIn = [definedIn];
  }
  if (!Array.isArray(definedIn) || definedIn.length === 0) {
    throw new ManifestError(`${manifestPath}: verify.definedIn は空でない配列（または文字列）が必要です`);
  }
  for (const item of definedIn) {
    if (!isRelativeRepoPath(item)) {
      throw new ManifestError(`${manifestPath}: verify.definedIn のパスが不正です: ${item}`);
    }
    if (!fileExists(item)) {
      throw new ManifestError(`${manifestPath}: verify.definedIn が指すファイルが存在しない: ${item}`);
    }
  }

  const protectedPaths = record.protectedPaths;
  if (!Array.isArray(protectedPaths) || protectedPaths.length === 0) {
    throw new ManifestError(`${manifestPath}: 必須項目 protectedPaths がありません`);
  }
  for (const item of protectedPaths) {
    if (!isRelativeRepoPath(item)) {
      throw new ManifestError(`${manifestPath}: protectedPaths のパスが不正です: ${item}`);
    }
  }
  if (!protectedPaths.includes(MANIFEST_FILE)) {
    throw new ManifestError(`${manifestPath}: マニフェストが保護パス一覧に自分自身を含んでいない`);
  }

  /** @type {{ argv: string[] } | undefined} */
  let install;
  if (record.install !== undefined) {
    const inst = record.install;
    if (inst === null || typeof inst !== 'object' || Array.isArray(inst)) {
      typeError(manifestPath, 'install');
    }
    const argv = /** @type {Record<string, unknown>} */ (inst).argv;
    if (!Array.isArray(argv) || argv.length === 0 || !argv.every(isNonEmptyString)) {
      throw new ManifestError(`${manifestPath}: install.argv の型が不正です（空でない文字列の配列が必要）`);
    }
    install = { argv };
  }

  /** @type {{ S: string, M: string, L: string } | undefined} */
  let complexityModels;
  if (record.complexityModels !== undefined) {
    const models = record.complexityModels;
    if (models === null || typeof models !== 'object' || Array.isArray(models)) {
      typeError(manifestPath, 'complexityModels');
    }
    const modelRecord = /** @type {Record<string, unknown>} */ (models);
    for (const grade of ['S', 'M', 'L']) {
      if (!isNonEmptyString(modelRecord[grade])) {
        throw new ManifestError(`${manifestPath}: complexityModels.${grade} がありません`);
      }
    }
    complexityModels = {
      S: /** @type {string} */ (modelRecord.S),
      M: /** @type {string} */ (modelRecord.M),
      L: /** @type {string} */ (modelRecord.L),
    };
  }

  /** @type {Array<{ name: string, command: string, paths: string[] }>} */
  let stages = [];
  if (record.stages !== undefined) {
    if (!Array.isArray(record.stages)) {
      typeError(manifestPath, 'stages');
    }
    stages = record.stages.map((stage, index) => {
      if (stage === null || typeof stage !== 'object' || Array.isArray(stage)) {
        throw new ManifestError(`${manifestPath}: stages[${index}] の型が不正です`);
      }
      const s = /** @type {Record<string, unknown>} */ (stage);
      if (
        !isNonEmptyString(s.name)
        || !isNonEmptyString(s.command)
        || !Array.isArray(s.paths)
        || !s.paths.every(isRelativeRepoPath)
      ) {
        throw new ManifestError(`${manifestPath}: stages[${index}] の型が不正です`);
      }
      return { name: s.name, command: s.command, paths: s.paths };
    });
  }

  /** @type {Record<string, string> | undefined} */
  let reviewers;
  if (record.reviewers !== undefined) {
    const rawReviewers = record.reviewers;
    if (rawReviewers === null || typeof rawReviewers !== 'object' || Array.isArray(rawReviewers)) {
      typeError(manifestPath, 'reviewers');
    }
    reviewers = Object.create(null);
    for (const [key, value] of Object.entries(rawReviewers)) {
      if (!isNonEmptyString(value)) {
        throw new ManifestError(`${manifestPath}: reviewers.${key} の型が不正です`);
      }
      reviewers[key] = value;
    }
  }

  return {
    ...(install !== undefined ? { install } : {}),
    verify: {
      command: verifyRecord.command,
      definedIn: [...definedIn],
    },
    stages,
    protectedPaths: [...protectedPaths],
    ...(complexityModels !== undefined ? { complexityModels } : {}),
    ...(reviewers !== undefined ? { reviewers } : {}),
  };
}

/**
 * リポジトリルートからマニフェストを読む。無ければパスと理由を出して失敗する。
 *
 * @param {string} rootDir
 * @returns {ReturnType<typeof validateManifest>}
 */
export function loadManifest(rootDir) {
  const manifestPath = path.join(rootDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new ManifestError(`マニフェストが無い: ${manifestPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    throw new ManifestError(`マニフェストが読めない: ${manifestPath}: ${err.message}`, { cause: err });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new ManifestError(`${manifestPath}: JSON として読めない: ${err.message}`, { cause: err });
  }
  return validateManifest(data, {
    manifestPath,
    fileExists: (relative) => fs.existsSync(path.join(rootDir, relative)),
  });
}

function defaultRootDir() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}

function main() {
  const rootDir = process.argv[2] ?? defaultRootDir();
  try {
    const manifest = loadManifest(rootDir);
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
