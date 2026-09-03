/**
 * 台帳・ゲートが共有するレイアウト定数。
 * 利用者向け文言はここから組み立てる（移植先で定数を差し替えたら文言も追随する）。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

export const TASK_DIR = 'task/';
export const BACKLOG_DIR = 'backlog/';
export const ARCHIVE_SUBDIR = 'archive';
export const PROGRESS_FILE = 'progress.md';
export const SPEC_FILE = 'spec.md';
export const TEMPLATE_SPEC = 'task/TEMPLATE-spec.md';
export const TEMPLATE_PROGRESS = 'task/TEMPLATE-progress.md';
export const MANIFEST_FILE = 'loop.manifest.json';
export const CORE_DIR = 'loop-core';
export const CORE_VERSION_FILE = 'loop-core/VERSION';
export const CORE_CLI = 'loop-core/bin/loop.mjs';
export const CLAUDE_MD = 'CLAUDE.md';
export const CLAUDE_CONFIG_PIN = '.claude/claude-config.version';
export const CLAUDE_CONFIG_COMPAT = 'loop-core/CLAUDE_CONFIG_COMPAT';
export const WORKTREES_DIR = '.worktrees';

/** 実装とみなすディレクトリ（末尾スラッシュ無し。guard-worktree と同じ） */
export const IMPLEMENTATION_DIR_NAMES = Object.freeze(['src', 'tests', 'tools', 'loop-core']);

/** 進捗結合が実装差分とみなす prefix */
export const IMPLEMENTATION_DIRS = Object.freeze(
  IMPLEMENTATION_DIR_NAMES.map((name) => `${name}/`),
);

export const TEMPLATES = Object.freeze([
  TEMPLATE_SPEC,
  TEMPLATE_PROGRESS,
  'specs/TEMPLATE.md',
  'progress/TEMPLATE.md',
]);

/** 台帳作業ディレクトリ直下で別名 spec にしない文書名 */
export const LEDGER_DOC_ALLOWLIST = Object.freeze([SPEC_FILE, PROGRESS_FILE]);

export const WORK_NAME_RE = /^\d{4}-[^/\\]+$/;
export const WORK_DIR_RE = /^(\d{4})-(.+)$/;

export const CLI_INVOCATION = `node ${CORE_CLI}`;

/**
 * 作業ディレクトリ名として正しいか。前後空白は名前の一部にしない。
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isWorkName(name) {
  if (typeof name !== 'string') return false;
  if (name !== name.trim()) return false;
  return WORK_NAME_RE.test(name);
}

/**
 * Core が期待する台帳構造のうち、欠けているものを列挙する。
 *
 * @param {string} rootDir
 * @returns {string[]}
 */
export function missingLedgerLayout(rootDir) {
  const missing = [];
  if (!existsSync(path.join(rootDir, 'task'))) missing.push(`${TASK_DIR} ディレクトリ`);
  if (!existsSync(path.join(rootDir, TEMPLATE_SPEC))) missing.push(TEMPLATE_SPEC);
  if (!existsSync(path.join(rootDir, TEMPLATE_PROGRESS))) missing.push(TEMPLATE_PROGRESS);
  return missing;
}
