import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_FILE,
  ManifestError,
  loadManifest,
  validateManifest,
} from '../tools/loop-manifest.mjs';
import { findViolations, hasAllowLabel } from '../tools/check-protected-paths.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 検証に足る最小のマニフェスト値 */
function validData(overrides = {}) {
  return {
    install: { argv: ['npm', 'ci'] },
    verify: { command: 'npm run ci', definedIn: ['package.json'] },
    protectedPaths: [MANIFEST_FILE],
    complexityModels: { S: 'haiku', M: 'sonnet', L: 'fable' },
    ...overrides,
  };
}

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-manifest-'));
  fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"ci":"true"}}\n');
  return root;
}

// --- このリポジトリの実物 ---

test('リポジトリ直下のマニフェストが検証を通る', () => {
  const manifest = loadManifest(repoRoot);
  assert.equal(manifest.verify.command, 'npm run ci');
  assert.ok(manifest.verify.definedIn.includes('package.json'));
  assert.ok(manifest.protectedPaths.includes(MANIFEST_FILE));
  assert.deepEqual(manifest.install?.argv, ['npm', 'ci']);
  assert.equal(manifest.complexityModels?.M, 'sonnet');
});

// --- 失敗時の 5 ケース ---

test('失敗時: マニフェストが存在しない', () => {
  const root = makeRoot();
  assert.throws(
    () => loadManifest(root),
    (err) => {
      assert.equal(err instanceof ManifestError, true);
      assert.match(err.message, /マニフェストが無い/);
      assert.match(err.message, new RegExp(MANIFEST_FILE));
      return true;
    },
  );
});

test('失敗時: 必須項目 verify.command が無い', () => {
  const data = validData();
  delete data.verify.command;
  assert.throws(
    () => validateManifest(data, { manifestPath: MANIFEST_FILE }),
    (err) => {
      assert.equal(err instanceof ManifestError, true);
      assert.match(err.message, /verify\.command/);
      return true;
    },
  );
});

test('失敗時: verify.definedIn が指すファイルが存在しない', () => {
  const data = validData({
    verify: { command: 'npm run ci', definedIn: ['no-such-file.mk'] },
  });
  assert.throws(
    () => validateManifest(data, { manifestPath: MANIFEST_FILE, fileExists: () => false }),
    (err) => {
      assert.equal(err instanceof ManifestError, true);
      assert.match(err.message, /verify\.definedIn が指すファイルが存在しない/);
      assert.match(err.message, /no-such-file\.mk/);
      return true;
    },
  );
});

test('失敗時: マニフェストが保護パス一覧に自分自身を含んでいない', () => {
  const data = validData({ protectedPaths: ['other.json'] });
  assert.throws(
    () => validateManifest(data, { manifestPath: MANIFEST_FILE }),
    (err) => {
      assert.equal(err instanceof ManifestError, true);
      assert.match(err.message, /自分自身を含んでいない/);
      return true;
    },
  );
});

test('失敗時: マニフェストを 1 行変える差分はラベル無しで保護パス違反になる', () => {
  const v = findViolations({
    changes: [{ status: 'M', path: MANIFEST_FILE }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, MANIFEST_FILE);
  assert.equal(hasAllowLabel([]), false);
  assert.equal(hasAllowLabel(['allow-protected-change']), true);
});

// --- 採用した任意項目と正規化 ---

test('install は省略できる（0044: パッケージマネージャが無い移植先）', () => {
  const data = validData();
  delete data.install;
  const out = validateManifest(data, { manifestPath: MANIFEST_FILE });
  assert.equal(out.install, undefined);
});

test('verify.definedIn は文字列でも配列に正規化する', () => {
  const out = validateManifest(
    validData({ verify: { command: 'make ci', definedIn: 'Makefile' } }),
    { manifestPath: MANIFEST_FILE },
  );
  assert.deepEqual(out.verify.definedIn, ['Makefile']);
});

test('stages は 0 件でもよい', () => {
  const out = validateManifest(validData({ stages: [] }), { manifestPath: MANIFEST_FILE });
  assert.deepEqual(out.stages, []);
});

test('既定値で補わず、型不正は項目名を出して失敗する', () => {
  assert.throws(
    () => validateManifest(validData({ verify: { command: 1, definedIn: ['package.json'] } }), {
      manifestPath: MANIFEST_FILE,
    }),
    /verify\.command/,
  );
});

test('マニフェストの新規追加は保護パス違反にならない（導入 PR）', () => {
  const v = findViolations({
    changes: [{ status: 'A', path: MANIFEST_FILE }],
  });
  assert.deepEqual(v, []);
});
