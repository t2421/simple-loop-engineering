import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseProgressMeta,
  selectNextTask,
  nextIdFrom,
  startTask,
} from '../tools/start-task.mjs';

/** 一時ディレクトリに task/ レイアウトを作る */
function makeLayout(dirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-task-'));
  for (const [dir, progress] of Object.entries(dirs)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (progress !== null) {
      fs.writeFileSync(path.join(root, dir, 'progress.md'), progress);
    }
  }
  return root;
}

function progressMd({ branch = 'feature/x', status = 'Not Started' } = {}) {
  return [
    '# Progress: `x`',
    '',
    '- **Target Spec:** `task/0001-x/spec.md`',
    `- **Branch:** \`${branch}\``,
    '- **PR:** `未作成`',
    `- **Status:** \`${status}\` (Phase: \`Plan\`)`,
    '',
    '## タスクチェックリスト',
  ].join('\n');
}

/** git の呼び出しは本物、npm は記録だけする exec */
function recordingExec(calls, { failNpm = false, failGit = false } = {}) {
  return (cmd, args, opts) => {
    calls.push({ cmd, args, cwd: opts?.cwd });
    if (cmd === 'npm') {
      if (failNpm) throw new Error('npm ci failed (injected)');
      return '';
    }
    if (failGit) throw new Error('git failed (injected)');
    return execFileSync(cmd, args, { ...opts, encoding: 'utf8' });
  };
}

/** 一時 git リポジトリ（main ブランチ・1 コミット） */
function makeRepo(dirs) {
  const root = makeLayout(dirs);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return root;
}

// --- parseProgressMeta ---

test('parseProgressMeta: バッククォート付きのメタ情報を読む', () => {
  const meta = parseProgressMeta(progressMd({ branch: 'feature/a', status: 'In Progress' }));
  assert.deepEqual(meta, { branch: 'feature/a', status: 'In Progress' });
});

test('parseProgressMeta: バッククォート無し・Phase 無しでも読む', () => {
  const meta = parseProgressMeta(
    '- **Branch:** feature/guard-task-paths\n- **Status:** Blocked\n',
  );
  assert.deepEqual(meta, { branch: 'feature/guard-task-paths', status: 'Blocked' });
});

test('parseProgressMeta: 無い項目は null', () => {
  assert.deepEqual(parseProgressMeta('# なにもない\n'), { branch: null, status: null });
});

// --- selectNextTask ---

test('Blocked と Done を除く最小 ID を選ぶ', () => {
  const picked = selectNextTask([
    { id: '0021', dirName: '0021-b', status: 'In Progress', branch: 'feature/b' },
    { id: '0020', dirName: '0020-a', status: 'Not Started', branch: 'feature/a' },
  ]);
  assert.equal(picked.dirName, '0020-a');
});

test('最小 ID が Blocked なら次に小さい ID を選ぶ', () => {
  const picked = selectNextTask([
    { id: '0017', dirName: '0017-x', status: 'Blocked', branch: 'feature/x' },
    { id: '0018', dirName: '0018-y', status: 'Not Started', branch: 'feature/y' },
  ]);
  assert.equal(picked.dirName, '0018-y');
});

test('すべて Blocked / Done なら null', () => {
  const picked = selectNextTask([
    { id: '0017', dirName: '0017-x', status: 'Blocked', branch: 'feature/x' },
    { id: '0018', dirName: '0018-y', status: 'Done', branch: 'feature/y' },
  ]);
  assert.equal(picked, null);
});

// --- nextIdFrom ---

test('最大 ID + 1 をゼロ埋め 4 桁で返す', () => {
  assert.equal(nextIdFrom(['0019-x', '0015-y', '0003-z']), '0020');
});

test('ID の形でない名前は無視する', () => {
  assert.equal(nextIdFrom(['0002-a', 'TEMPLATE-spec.md', 'archive', 'note']), '0003');
});

test('候補が無ければ 0001', () => {
  assert.equal(nextIdFrom([]), '0001');
});

// --- startTask: 選択と失敗 ---

test('選択可能な作業が無ければ何も作成せず失敗する', () => {
  const root = makeLayout({
    'task/0017-x': progressMd({ status: 'Blocked' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /選択可能な作業がありません/,
  );
  assert.deepEqual(calls, [], '何も実行しない');
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('progress に Branch が無ければ何も作成せず失敗する', () => {
  const root = makeLayout({
    'task/0020-a': '- **Status:** `Not Started`\n',
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /Branch/,
  );
  assert.deepEqual(calls, []);
});

test('Branch がブランチ名として不正なら何も作成せず失敗する', () => {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: '<ブランチ名>' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /不正/,
  );
  assert.deepEqual(calls, []);
});

test('git worktree add の失敗はそのまま失敗になり、npm ci は実行しない', () => {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: 'feature/a' }),
  });
  const calls = [];
  assert.throws(() => startTask({ rootDir: root, exec: recordingExec(calls, { failGit: true }) }));
  assert.equal(calls.some((c) => c.cmd === 'npm'), false);
});

test('worktree が既にあるなら作成をスキップして既存パスを返す', () => {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: 'feature/a' }),
  });
  fs.mkdirSync(path.join(root, '.worktrees', 'feature/a'), { recursive: true });
  const calls = [];
  const out = startTask({ rootDir: root, exec: recordingExec(calls) });
  assert.equal(out.created, false);
  assert.equal(out.worktreePath, path.join(root, '.worktrees', 'feature/a'));
  assert.deepEqual(calls, [], '再入時は git も npm も実行しない');
});

// --- startTask: 実 git での統合 ---

test('最小 ID の作業の worktree を main から作成し、npm ci を実行する', () => {
  const root = makeRepo({
    'task/0020-a': progressMd({ branch: 'feature/a', status: 'Not Started' }),
    'task/0021-b': progressMd({ branch: 'feature/b', status: 'In Progress' }),
    'task/archive/0019-z': progressMd({ status: 'Done' }),
  });
  const calls = [];
  const out = startTask({ rootDir: root, exec: recordingExec(calls) });

  assert.equal(out.id, '0020');
  assert.equal(out.dirName, '0020-a');
  assert.equal(out.branch, 'feature/a');
  assert.equal(out.created, true);
  assert.equal(out.worktreePath, path.join(root, '.worktrees', 'feature/a'));
  assert.equal(fs.existsSync(path.join(root, '.worktrees', 'feature/a', 'task')), true);

  const branches = execFileSync('git', ['branch', '--list', 'feature/a'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(branches, /feature\/a/);

  const npm = calls.filter((c) => c.cmd === 'npm');
  assert.equal(npm.length, 1);
  assert.deepEqual(npm[0].args, ['ci']);
  assert.equal(npm[0].cwd, path.join(root, '.worktrees', 'feature/a'));
});

test('npm ci が失敗したら worktree は残したまま失敗する（再実行で再入する）', () => {
  const root = makeRepo({
    'task/0020-a': progressMd({ branch: 'feature/a' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls, { failNpm: true }) }),
    /npm ci/,
  );
  assert.equal(fs.existsSync(path.join(root, '.worktrees', 'feature/a')), true, 'worktree は残す');

  // 再実行は既存 worktree に再入して成功する
  const retry = startTask({ rootDir: root, exec: recordingExec([]) });
  assert.equal(retry.created, false);
});

test('task/ の archive と TEMPLATE は選択対象にしない', () => {
  const root = makeLayout({
    'task/archive/0001-x': progressMd({ status: 'Done' }),
  });
  fs.writeFileSync(path.join(root, 'task', 'TEMPLATE-progress.md'), progressMd());
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec([]) }),
    /選択可能な作業がありません/,
  );
});
