import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claimId, isValidSlug, CLAIM_PLACES, nextId } from '../tools/start-task.mjs';

/**
 * 一時ディレクトリに作業ディレクトリのレイアウトを作る。
 * ID は一時ディレクトリの初期状態から相対的に決まるので、
 * 実リポジトリの ID 状態にテストが依存しない。
 */
function makeRoot(dirs = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-task-claim-'));
  for (const dir of dirs) fs.mkdirSync(path.join(root, dir), { recursive: true });
  return root;
}

/** root 配下の作業ディレクトリ（`<置き場>/<name>`）を名前順に並べる */
function listWorkDirs(root) {
  const found = [];
  for (const place of ['task', path.join('task', 'archive'), 'backlog']) {
    const full = path.join(root, place);
    if (!fs.existsSync(full)) continue;
    for (const dirent of fs.readdirSync(full, { withFileTypes: true })) {
      if (dirent.isDirectory() && dirent.name !== 'archive') {
        found.push(`${place.replaceAll(path.sep, '/')}/${dirent.name}`);
      }
    }
  }
  return found.sort();
}

// --- isValidSlug ---

test('isValidSlug: 英小文字で始まり英小文字・数字・ハイフンだけなら通る', () => {
  assert.equal(isValidSlug('foo'), true);
  assert.equal(isValidSlug('math-add'), true);
  assert.equal(isValidSlug('vec2-add'), true);
});

test('isValidSlug: 大文字・アンダースコア・先頭ハイフン・先頭数字・空は弾く', () => {
  assert.equal(isValidSlug('Foo'), false);
  assert.equal(isValidSlug('foo_bar'), false);
  assert.equal(isValidSlug('-foo'), false);
  assert.equal(isValidSlug('0foo'), false);
  assert.equal(isValidSlug(''), false);
  assert.equal(isValidSlug('foo/bar'), false);
  assert.equal(isValidSlug('foo bar'), false);
});

// --- claimId: 例の表 ---

test('例1: backlog/0041-x だけの状態で backlog に claim すると 0042 を確保し、次の採番は 0043', () => {
  const root = makeRoot(['backlog/0041-x']);

  const result = claimId({ rootDir: root, slug: 'foo', place: 'backlog' });

  assert.equal(result.ok, true);
  assert.equal(result.path, 'backlog/0042-foo');
  assert.equal(fs.existsSync(path.join(root, 'backlog', '0042-foo')), true);
  assert.deepEqual(fs.readdirSync(path.join(root, 'backlog', '0042-foo')), []);
  assert.equal(nextId(root), '0043');
});

test('例2: 同じ初期状態から続けて 2 回 claim すると異なる ID を得る（--in 省略で task）', () => {
  const root = makeRoot(['backlog/0041-x']);

  const first = claimId({ rootDir: root, slug: 'a' });
  const second = claimId({ rootDir: root, slug: 'b' });

  assert.equal(first.ok, true);
  assert.equal(first.path, 'task/0042-a');
  assert.equal(second.ok, true);
  assert.equal(second.path, 'task/0043-b');
  assert.deepEqual(listWorkDirs(root), ['backlog/0041-x', 'task/0042-a', 'task/0043-b']);
});

test('例3: 同じ slug を別の置き場で claim し直すと、何も作らず失敗する', () => {
  const root = makeRoot(['backlog/0041-x']);
  assert.equal(claimId({ rootDir: root, slug: 'foo', place: 'backlog' }).ok, true);
  const before = listWorkDirs(root);

  const result = claimId({ rootDir: root, slug: 'foo' });

  assert.equal(result.ok, false);
  assert.match(result.reason, /foo/);
  assert.deepEqual(listWorkDirs(root), before);
});

test('例4: 大文字を含む slug は何も作らず失敗する', () => {
  const root = makeRoot(['backlog/0041-x']);
  const before = listWorkDirs(root);

  const result = claimId({ rootDir: root, slug: 'Foo' });

  assert.equal(result.ok, false);
  assert.deepEqual(listWorkDirs(root), before);
});

// --- claimId: 失敗時 ---

test('task/archive にある同じ slug の作業も衝突として扱う', () => {
  const root = makeRoot(['task/archive/0001-foo']);
  const before = listWorkDirs(root);

  const result = claimId({ rootDir: root, slug: 'foo' });

  assert.equal(result.ok, false);
  assert.deepEqual(listWorkDirs(root), before);
});

test('task にある同じ slug の作業も衝突として扱う', () => {
  const root = makeRoot(['task/0003-foo']);

  const result = claimId({ rootDir: root, slug: 'foo', place: 'backlog' });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'backlog')), false);
});

test('--in が task / backlog 以外なら何も作らず失敗する', () => {
  const root = makeRoot(['backlog/0041-x']);
  const before = listWorkDirs(root);

  for (const place of ['specs', 'archive', '', '../etc']) {
    const result = claimId({ rootDir: root, slug: 'foo', place });
    assert.equal(result.ok, false, `place=${place}`);
  }
  assert.deepEqual(listWorkDirs(root), before);
});

test('CLAIM_PLACES は task と backlog だけ', () => {
  assert.deepEqual([...CLAIM_PLACES], ['task', 'backlog']);
});

test('ID 計算とディレクトリ作成の間に他者が確保していたら（EEXIST）、何も作らず失敗する', () => {
  const root = makeRoot(['backlog/0041-x']);
  const before = listWorkDirs(root);
  const mkdir = () => {
    const err = new Error('EEXIST: file already exists');
    err.code = 'EEXIST';
    throw err;
  };

  const result = claimId({ rootDir: root, slug: 'foo', mkdir });

  assert.equal(result.ok, false);
  assert.match(result.reason, /0042-foo/);
  assert.deepEqual(listWorkDirs(root), before);
});

test('空の状態から claim すると 0001 を確保する', () => {
  const root = makeRoot([]);

  const result = claimId({ rootDir: root, slug: 'first' });

  assert.equal(result.ok, true);
  assert.equal(result.path, 'task/0001-first');
  assert.equal(fs.existsSync(path.join(root, 'task', '0001-first')), true);
});
