import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  claimId,
  isValidSlug,
  CLAIM_PLACES,
  nextId,
  parseCliArgs,
  startTask,
} from '../tools/start-task.mjs';

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

/**
 * 一時ディレクトリに `task/` レイアウトを作る。値が null のディレクトリは
 * progress.md を置かない（`tests/start-task.test.mjs` の makeLayout と同形）。
 */
function makeLayout(dirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-task-claim-'));
  for (const [dir, progress] of Object.entries(dirs)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (progress !== null) {
      fs.writeFileSync(path.join(root, dir, 'progress.md'), progress);
    }
  }
  return root;
}

/** 選択に足るメタ情報を持つ progress.md */
function progressMd({ branch = 'feat/x', status = 'Not Started', complexity } = {}) {
  return [
    '# Progress: `x`',
    '',
    '- **Target Spec:** `task/0001-x/spec.md`',
    `- **Branch:** \`${branch}\``,
    '- **PR:** `未作成`',
    `- **Status:** \`${status}\` (Phase: \`Plan\`)`,
    ...(complexity === undefined ? [] : [`- **Complexity:** \`${complexity}\``]),
    '',
    '## タスクチェックリスト',
  ].join('\n');
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

// --- レビュー指摘の回帰テスト ---

// High: `--in` の値の欠落を、`--in` の省略と混ぜない
test('parseCliArgs: --claim <slug> は task を既定の置き場にする', () => {
  assert.deepEqual(parseCliArgs(['--claim', 'foo']), { kind: 'claim', slug: 'foo', place: 'task' });
});

test('parseCliArgs: --claim <slug> --in <place> はその置き場を返す', () => {
  assert.deepEqual(parseCliArgs(['--claim', 'foo', '--in', 'backlog']), {
    kind: 'claim',
    slug: 'foo',
    place: 'backlog',
  });
});

test('parseCliArgs: --in の値が欠けていたら使い方の誤りにする（task に化けさせない）', () => {
  assert.deepEqual(parseCliArgs(['--claim', 'foo', '--in']), { kind: 'usage' });
});

test('parseCliArgs: slug の欠落・余分な引数・未知のフラグは使い方の誤り', () => {
  assert.deepEqual(parseCliArgs(['--claim']), { kind: 'usage' });
  assert.deepEqual(parseCliArgs(['--claim', 'foo', '--in', 'task', 'junk']), { kind: 'usage' });
  assert.deepEqual(parseCliArgs(['--claim', 'foo', '--bogus', 'task']), { kind: 'usage' });
  assert.deepEqual(parseCliArgs(['--next-id', 'junk']), { kind: 'usage' });
  assert.deepEqual(parseCliArgs(['--bogus']), { kind: 'usage' });
});

test('parseCliArgs: 引数なしは通常の開始', () => {
  assert.deepEqual(parseCliArgs([]), { kind: 'start' });
  assert.deepEqual(parseCliArgs(['--next-id']), { kind: 'next-id' });
});

test('claimId: place を明示的に undefined で渡しても既定の task が効く（分割代入の既定値）', () => {
  // parseCliArgs が `--in` の値の欠落を先に弾くので、この既定値が
  // 不正入力を通す経路にはならない。ここでは既定値そのものの意味を固定する
  const root = makeRoot(['backlog/0041-x']);
  const result = claimId({ rootDir: root, slug: 'foo', place: undefined });
  assert.equal(result.ok, true);
  assert.equal(result.path, 'task/0042-foo');
});

// High: slug や置き場が違う 2 者が同じ ID を確保するのを防ぐ
test('slug が違う 2 者が同じ ID を計算したら、後から気づいた側が降りる', () => {
  const root = makeRoot(['backlog/0041-x']);
  // mkdir フックの中で他者が同じ ID（0042）を別の slug で確保する状況を作る
  const mkdir = (dir) => {
    fs.mkdirSync(path.join(root, 'task', '0042-other'), { recursive: true });
    fs.mkdirSync(dir);
  };

  const result = claimId({ rootDir: root, slug: 'foo', mkdir });

  assert.equal(result.ok, false);
  assert.match(result.reason, /0042/);
  // 自分が作ったものは片付ける。相手のものには触らない
  assert.equal(fs.existsSync(path.join(root, 'task', '0042-foo')), false);
  assert.equal(fs.existsSync(path.join(root, 'task', '0042-other')), true);
});

test('置き場が違う 2 者が同じ ID を計算しても、重複 ID が残らない', () => {
  const root = makeRoot(['backlog/0041-x']);
  const mkdir = (dir) => {
    fs.mkdirSync(path.join(root, 'backlog', '0042-other'), { recursive: true });
    fs.mkdirSync(dir);
  };

  const result = claimId({ rootDir: root, slug: 'foo', mkdir });

  assert.equal(result.ok, false);
  assert.deepEqual(listWorkDirs(root), ['backlog/0041-x', 'backlog/0042-other']);
});

// Low: 確保に失敗したとき、自分が作った置き場ディレクトリを残さない
test('確保に失敗したら、自分が作った置き場ディレクトリも残さない', () => {
  const root = makeRoot(['task/0041-x']);
  assert.equal(fs.existsSync(path.join(root, 'backlog')), false);
  const mkdir = () => {
    const err = new Error('EEXIST: file already exists');
    err.code = 'EEXIST';
    throw err;
  };

  const result = claimId({ rootDir: root, slug: 'foo', place: 'backlog', mkdir });

  assert.equal(result.ok, false);
  assert.equal(fs.existsSync(path.join(root, 'backlog')), false);
});

test('もともとあった置き場ディレクトリは、確保に失敗しても消さない', () => {
  const root = makeRoot(['backlog/0041-x']);
  const mkdir = () => {
    throw new Error('EEXIST: file already exists');
  };

  assert.equal(claimId({ rootDir: root, slug: 'foo', place: 'backlog', mkdir }).ok, false);
  assert.equal(fs.existsSync(path.join(root, 'backlog')), true);
  assert.equal(fs.existsSync(path.join(root, 'backlog', '0041-x')), true);
});

// High: 確保中のディレクトリで開発ループの手順 1 が落ちないこと
test('確保しただけの空ディレクトリがあっても、次の作業の選択は落ちない', () => {
  const root = makeLayout({
    'task/0001-x': progressMd({ branch: 'feat/0001-x', complexity: 'S' }),
  });
  assert.equal(claimId({ rootDir: root, slug: 'reserved' }).ok, true);

  // exec は呼ばれる（worktree add / npm ci）ので記録だけする
  const result = startTask({ rootDir: root, exec: () => '' });

  assert.equal(result.dirName, '0001-x');
  assert.equal(result.model, 'haiku');
});

test('spec があるのに progress が無い作業は、従来どおり書式の破損として失敗する', () => {
  const root = makeLayout({ 'task/0001-x': null });
  fs.writeFileSync(path.join(root, 'task', '0001-x', 'spec.md'), '# spec\n');

  assert.throws(
    () => startTask({ rootDir: root, exec: () => '' }),
    /task\/0001-x\/progress\.md がありません/,
  );
});

test('同じ slug を並行で claim した 2 者は、別 ID になっても両方は成功しない', () => {
  // 事前チェックを通過したあとに、相手が先に同じ slug を別 ID で確保する状況。
  // ID だけを見る事後走査では捕まらず、`0042-foo` と `0043-foo` が並んでしまう
  const root = makeRoot(['backlog/0041-x']);
  const mkdir = (dir) => {
    fs.mkdirSync(path.join(root, 'task', '0043-foo'), { recursive: true });
    fs.mkdirSync(dir);
  };

  const result = claimId({ rootDir: root, slug: 'foo', mkdir });

  assert.equal(result.ok, false);
  assert.match(result.reason, /foo/);
  // 自分が作った分だけ片付ける。相手のものには触らない
  assert.equal(fs.existsSync(path.join(root, 'task', '0042-foo')), false);
  assert.equal(fs.existsSync(path.join(root, 'task', '0043-foo')), true);
});

test('置き場をまたいで同じ slug が並行で確保されても、両方は成功しない', () => {
  const root = makeRoot(['backlog/0041-x']);
  const mkdir = (dir) => {
    fs.mkdirSync(path.join(root, 'backlog', '0043-foo'), { recursive: true });
    fs.mkdirSync(dir);
  };

  const result = claimId({ rootDir: root, slug: 'foo', place: 'task', mkdir });

  assert.equal(result.ok, false);
  assert.deepEqual(listWorkDirs(root), ['backlog/0041-x', 'backlog/0043-foo']);
});
