import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archive, readBranch, parsePrUrl, checkOwnership } from '../loop-core/ledger/archive.mjs';

const NAME = '0019-foo';

/** 帰属検証つきのリポジトリ骨格を作る（task/ レイアウト） */
function makeRepo({ pr = 'https://github.com/t2421/simple-loop-engineering/pull/1', branch = 'feature/foo' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ownership-test-'));
  fs.mkdirSync(path.join(root, 'task', NAME), { recursive: true });
  fs.mkdirSync(path.join(root, 'task', 'archive'), { recursive: true });
  fs.writeFileSync(path.join(root, 'task', NAME, 'spec.md'), '# foo の仕様\n');
  const branchLine = branch === null ? '' : `- **Branch:** \`${branch}\`\n`;
  fs.writeFileSync(
    path.join(root, 'task', NAME, 'progress.md'),
    '# Progress: foo\n\n'
      + `- **Target Spec:** \`task/${NAME}/spec.md\`\n`
      + branchLine
      + `- **PR:** ${pr}\n`
      + '- **Status:** `In Progress`\n',
  );
  return root;
}

const ls = (dir) => fs.readdirSync(dir).sort();

/** 指定した属性の PR を返す確認関数を作る */
const prBeing = ({ merged = true, owner = 't2421', repo = 'simple-loop-engineering', head = 'feature/foo' } = {}) =>
  async () => ({ merged, owner, repo, headRefName: head });

/** このリポジトリの owner/repo を返す */
const thisRepo = async () => ({ owner: 't2421', repo: 'simple-loop-engineering' });

test('parsePrUrl: GitHub の PR URL から owner/repo/number を取る', () => {
  assert.deepEqual(parsePrUrl('https://github.com/t2421/simple-loop-engineering/pull/12'), {
    owner: 't2421',
    repo: 'simple-loop-engineering',
    number: 12,
  });
});

test('parsePrUrl: PR URL でなければ null', () => {
  assert.equal(parsePrUrl('https://example.com/x'), null);
  assert.equal(parsePrUrl('https://github.com/t2421/simple-loop-engineering/issues/12'), null);
});

test('readBranch: 進捗から Branch を読む', () => {
  assert.equal(readBranch('- **Branch:** `feature/foo`\n'), 'feature/foo');
  assert.equal(readBranch('- **Branch:** feature/bar\n'), 'feature/bar');
});

test('readBranch: Branch 欄が無ければ null', () => {
  assert.equal(readBranch('- **PR:** x\n'), null);
});

test('checkOwnership: 同じリポジトリ・同じブランチなら ok', () => {
  const r = checkOwnership({
    url: 'https://github.com/t2421/simple-loop-engineering/pull/1',
    repo: { owner: 't2421', repo: 'simple-loop-engineering' },
    headRefName: 'feature/foo',
    branch: 'feature/foo',
  });
  assert.equal(r.ok, true);
});

test('checkOwnership: 別リポジトリなら失敗', () => {
  const r = checkOwnership({
    url: 'https://github.com/other/repo/pull/1',
    repo: { owner: 't2421', repo: 'simple-loop-engineering' },
    headRefName: 'feature/foo',
    branch: 'feature/foo',
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /リポジトリ/);
});

test('checkOwnership: head ブランチが違えば失敗', () => {
  const r = checkOwnership({
    url: 'https://github.com/t2421/simple-loop-engineering/pull/1',
    repo: { owner: 't2421', repo: 'simple-loop-engineering' },
    headRefName: 'feature/other',
    branch: 'feature/foo',
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /ブランチ/);
});

// --- spec の「例」 ---

test('このリポジトリの、その作業の head ブランチのマージ済み PR ならアーカイブされる', async () => {
  const root = makeRepo();
  const r = await archive(NAME, { root, checkPr: prBeing(), getRepo: thisRepo });

  assert.equal(r.ok, true);
  assert.deepEqual(ls(path.join(root, 'task/archive')), [NAME]);
  assert.deepEqual(ls(path.join(root, 'task/archive', NAME)).sort(), ['progress.md', 'spec.md']);
});

test('別リポジトリのマージ済み PR の URL なら、何も変更せず失敗する', async () => {
  const root = makeRepo({ pr: 'https://github.com/other/repo/pull/1' });
  const r = await archive(NAME, {
    root,
    checkPr: prBeing({ owner: 'other', repo: 'repo' }),
    getRepo: thisRepo,
  });

  assert.equal(r.ok, false);
  assert.match(r.reason, /リポジトリ/);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('同じリポジトリだが別ブランチのマージ済み PR なら、何も変更せず失敗する', async () => {
  const root = makeRepo();
  const r = await archive(NAME, {
    root,
    checkPr: prBeing({ head: 'feature/someone-else' }),
    getRepo: thisRepo,
  });

  assert.equal(r.ok, false);
  assert.match(r.reason, /ブランチ/);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('進捗に Branch 欄が無ければ、何も変更せず失敗する', async () => {
  const root = makeRepo({ branch: null });
  const r = await archive(NAME, { root, checkPr: prBeing(), getRepo: thisRepo });

  assert.equal(r.ok, false);
  assert.match(r.reason, /Branch/);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
});

test('リポジトリ情報が取れなければ、素通りさせず失敗する', async () => {
  const root = makeRepo();
  const r = await archive(NAME, {
    root,
    checkPr: prBeing(),
    getRepo: async () => { throw new Error('gh repo view failed'); },
  });

  assert.equal(r.ok, false);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
  assert.deepEqual(ls(path.join(root, 'task/archive')), []);
});

test('PR の head ブランチが取得できなければ失敗する', async () => {
  const root = makeRepo();
  // head を返さない確認関数。prBeing の既定値に潰されないよう直接組む
  const r = await archive(NAME, {
    root,
    checkPr: async () => ({ merged: true }),
    getRepo: thisRepo,
  });

  assert.equal(r.ok, false);
  assert.ok(fs.existsSync(path.join(root, 'task', NAME, 'spec.md')));
});

test('owner / repo の大小文字は区別しない', () => {
  const r = checkOwnership({
    url: 'https://github.com/T2421/Simple-Loop-Engineering/pull/1',
    repo: { owner: 't2421', repo: 'simple-loop-engineering' },
    headRefName: 'feature/foo',
    branch: 'feature/foo',
  });
  assert.equal(r.ok, true, 'GitHub の owner/repo は case-insensitive');
});

test('getRepo は root を受け取る（判定の対象と変更の対象を一致させる）', async () => {
  const root = makeRepo();
  let seen = null;
  await archive(NAME, {
    root,
    checkPr: prBeing(),
    getRepo: async (r) => { seen = r; return { owner: 't2421', repo: 'simple-loop-engineering' }; },
  });
  assert.equal(seen, root);
});
