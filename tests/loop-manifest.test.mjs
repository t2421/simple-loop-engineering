import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST_PATH,
  REQUIRED_KEYS,
  parseManifest,
  checkDefinedInExists,
  loadManifest,
  repoManifest,
} from '../tools/loop-manifest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 実物のマニフェストを土台に、1 箇所だけ壊した文字列を作る */
function mutated(mutate) {
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, MANIFEST_PATH), 'utf8'));
  mutate(manifest);
  return JSON.stringify(manifest);
}

/** 一時ディレクトリにマニフェストを置く。置かないこともできる */
function makeRoot(t, raw) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-manifest-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  if (raw !== undefined) {
    fs.writeFileSync(path.join(dir, MANIFEST_PATH), raw);
    const manifest = JSON.parse(raw);
    for (const d of manifest.verify?.definedIn ?? []) {
      fs.writeFileSync(path.join(dir, d.path), '{"scripts":{}}\n');
    }
  }
  return dir;
}

// --- このリポジトリの宣言そのもの ---

test('このリポジトリのマニフェストは妥当である', () => {
  const manifest = repoManifest();
  assert.equal(manifest.protected.self, MANIFEST_PATH);
  assert.deepEqual(checkDefinedInExists(manifest, (p) => fs.existsSync(path.join(rootDir, p))), []);
});

// --- 失敗時 1: マニフェストが存在しない ---

test('失敗時1: マニフェストが無ければ既定値で動かず、パスと理由を出して失敗する', (t) => {
  const dir = makeRoot(t);
  assert.throws(() => loadManifest(dir), (err) => {
    assert.match(err.message, /マニフェストがありません/);
    assert.match(err.message, new RegExp(MANIFEST_PATH.replaceAll('.', '\\.')));
    assert.match(err.message, /既定値では動かしません/);
    return true;
  });
});

// --- 失敗時 2: 必須項目の欠落・型不正 ---

test('失敗時2: 必須項目が欠けていれば、どの項目かを挙げて失敗する', () => {
  const raw = mutated((m) => { delete m.verify.command; });
  const result = parseManifest(raw);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['必須項目がありません: verify.command']);
});

test('失敗時2: 必須項目が全部あっても型が違えば失敗する', () => {
  const raw = mutated((m) => { m.verify.command = 'npm run ci'; });
  const result = parseManifest(raw);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.includes('verify.command')));
});

test('失敗時2: 欠落は既定値で補わない（reasons が空にならない）', () => {
  for (const key of REQUIRED_KEYS) {
    const raw = mutated((m) => {
      const parts = key.split('.');
      let cur = m;
      for (const p of parts.slice(0, -1)) cur = cur[p];
      delete cur[parts[parts.length - 1]];
    });
    const result = parseManifest(raw);
    assert.equal(result.ok, false, `${key} を消しても通ってしまう`);
  }
});

test('JSON として壊れていれば失敗する', () => {
  const result = parseManifest('{');
  assert.equal(result.ok, false);
  assert.match(result.reasons[0], /JSON として読めません/);
});

// --- 失敗時 3: 自己保護の欠落 ---

test('失敗時3: 保護パス一覧が自分自身を指していなければ失敗する', () => {
  const raw = mutated((m) => { m.protected.self = 'somewhere-else.json'; });
  const result = parseManifest(raw);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.includes('自分自身')));
});

// --- 失敗時 4: definedIn が指すファイルが無い ---

test('失敗時4: verify.definedIn が指すファイルが無ければ失敗する', () => {
  const manifest = repoManifest();
  const reasons = checkDefinedInExists(manifest, () => false);
  assert.equal(reasons.length, manifest.verify.definedIn.length);
  assert.match(reasons[0], /verify\.definedIn が指すファイルがありません/);
});

test('失敗時4: CLI でも終了コード非 0 で終わる', (t) => {
  const raw = mutated((m) => { m.verify.definedIn = [{ path: 'no-such-file.json', jsonKey: 'scripts' }]; });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-manifest-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, MANIFEST_PATH), raw);
  const result = spawnSync(process.execPath, [path.join(rootDir, 'tools/loop-manifest.mjs'), dir], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /verify\.definedIn が指すファイルがありません/);
});

// --- 失敗時 5 は「ラベル無しの PR がガードで落ちる」であり、
//     判定は tests/protected-paths.test.mjs 側に置く（同じ判定を二重に持たない） ---

// --- 省略可能な項目 ---

test('install は省略できる（依存導入コマンドを持たないプロジェクトがある）', (t) => {
  const raw = mutated((m) => { delete m.install; });
  const dir = makeRoot(t, raw);
  const manifest = loadManifest(dir);
  assert.equal(manifest.install, undefined);
});

test('install を書くなら形は正しいことを求める', () => {
  const raw = mutated((m) => { m.install = 'npm ci'; });
  const result = parseManifest(raw);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.includes('install')));
});

test('conditionalStages は省略できる（その工程が存在しない移植先がある）', (t) => {
  const raw = mutated((m) => { delete m.conditionalStages; });
  const dir = makeRoot(t, raw);
  assert.equal(loadManifest(dir).conditionalStages, undefined);
});

// --- 台帳の文書は許可リストである ---

test('ledger.docs に specFile が含まれていなければ失敗する', () => {
  const raw = mutated((m) => { m.ledger.docs = ['progress.md']; });
  const result = parseManifest(raw);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some((r) => r.includes('ledger.docs')));
});

// --- 失敗時 2（型不正）: 「あるか」ではなく「形が正しいか」まで見る ---
// 骨抜きの宣言を受け入れることは、ガードを無効化することと同じである。

const BROKEN_LEAVES = [
  ['protected.appendOnlyDirs = [{}]', (m) => { m.protected.appendOnlyDirs = [{}]; }, 'appendOnlyDirs'],
  ['protected.appendOnlyDirs = [{prefix:1}]', (m) => { m.protected.appendOnlyDirs = [{ prefix: 1 }]; }, 'appendOnlyDirs'],
  ['protected.templates = "oops"', (m) => { m.protected.templates = 'oops'; }, 'templates'],
  ['protected.checker = 42', (m) => { m.protected.checker = 42; }, 'checker'],
  ['protected.allowLabel = 1', (m) => { m.protected.allowLabel = 1; }, 'allowLabel'],
  ['complexityModels = "x"', (m) => { m.complexityModels = 'x'; }, 'complexityModels'],
  ['ledger.dir = 5', (m) => { m.ledger.dir = 5; }, 'ledger.dir'],
  ['verify.invokedIn = "x"', (m) => { m.verify.invokedIn = 'x'; }, 'invokedIn'],
  ['verify.invokedIn 欠落', (m) => { delete m.verify.invokedIn; }, 'invokedIn'],
  ['implementation.dirs = [42]', (m) => { m.implementation.dirs = [42]; }, 'implementation.dirs'],
  ['implementation が両方空', (m) => { m.implementation.dirs = []; m.implementation.files = []; }, 'implementation'],
];

for (const [name, mutate, key] of BROKEN_LEAVES) {
  test(`失敗時2: 型不正を拒む — ${name}`, () => {
    const result = parseManifest(mutated(mutate));
    assert.equal(result.ok, false, `${name} が通ってしまう`);
    assert.ok(result.reasons.some((r) => r.includes(key)), result.reasons.join(' / '));
  });
}
