import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { selectNextTask, startTask } from '../loop-core/ledger/start-task.mjs';

const MODELS = Object.freeze({ S: 'haiku', M: 'sonnet', L: 'fable' });

/** 一時ディレクトリにマニフェストと definedIn 先を置く */
function writeLoopManifest(root) {
  const manifest = {
    install: { argv: ['npm', 'ci'] },
    verify: { command: 'npm run ci', definedIn: ['package.json'] },
    protectedPaths: ['loop.manifest.json'],
    complexityModels: MODELS,
  };
  fs.writeFileSync(path.join(root, 'loop.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'package.json'), '{"scripts":{"ci":"true"}}\n');
}

/** 一時ディレクトリに task/ レイアウトを作る */
function makeLayout(dirs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-task-unblock-'));
  for (const [dir, progress] of Object.entries(dirs)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (progress !== null) {
      fs.writeFileSync(path.join(root, dir, 'progress.md'), progress);
    }
  }
  writeLoopManifest(root);
  return root;
}

function progressMd({ branch = 'feature/x', status = 'Not Started', complexity, unblock } = {}) {
  return [
    '# Progress: `x`',
    '',
    '- **Target Spec:** `task/0001-x/spec.md`',
    `- **Branch:** \`${branch}\``,
    '- **PR:** `未作成`',
    `- **Status:** \`${status}\` (Phase: \`Plan\`)`,
    ...(complexity === undefined ? [] : [`- **Complexity:** \`${complexity}\``]),
    ...(unblock === undefined ? [] : [`- **Unblock:** \`${unblock}\``]),
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

test('Blocked でも unblockMet なら選ぶ（選択時の読み替え）', () => {
  const picked = selectNextTask([
    { id: '0017', dirName: '0017-x', status: 'Blocked', branch: 'feature/x', unblockMet: true },
    { id: '0018', dirName: '0018-y', status: 'Not Started', branch: 'feature/y' },
  ]);
  assert.equal(picked.dirName, '0017-x');
  assert.equal(picked.status, 'Blocked');
});

test('既存どおり: 述語無しの Blocked は selectNextTask が選ばない', () => {
  const picked = selectNextTask([
    { id: '0017', dirName: '0017-x', status: 'Blocked', branch: 'feature/x' },
    { id: '0018', dirName: '0018-y', status: 'Not Started', branch: 'feature/y' },
  ]);
  assert.equal(picked.dirName, '0018-y');
});

test('例: Status=Blocked で path-exists が満たされていれば選択可能。Status は Blocked のまま', () => {
  const root = makeLayout({
    'task/0042-x': progressMd({
      branch: 'feature/x',
      status: 'Blocked',
      unblock: 'path-exists:task/archive/0044-second-project-port/',
    }),
    'task/archive/0044-second-project-port': null,
  });
  fs.mkdirSync(path.join(root, '.worktrees', 'feature/x'), { recursive: true });
  const before = fs.readFileSync(path.join(root, 'task', '0042-x', 'progress.md'), 'utf8');
  const out = startTask({ rootDir: root, exec: recordingExec([]) });
  assert.equal(out.dirName, '0042-x');
  assert.equal(out.created, false);
  const after = fs.readFileSync(path.join(root, 'task', '0042-x', 'progress.md'), 'utf8');
  assert.equal(after, before);
  assert.match(after, /\*\*Status:\*\* `Blocked`/);
});

test('例: Unblock 行が無ければ Blocked のまま選ばない。理由に「解除述語が無い」が出る', () => {
  const root = makeLayout({
    'task/0042-x': progressMd({ status: 'Blocked' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    (err) => {
      assert.match(err.message, /選択可能な作業がありません/);
      assert.match(err.message, /task\/0042-x/);
      assert.match(err.message, /解除述語が無い/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('例: パースできない Unblock は Blocked のまま選ばない。理由に「解釈できない」が出る', () => {
  const root = makeLayout({
    'task/0042-x': progressMd({
      status: 'Blocked',
      unblock: '0044 が終わったら',
    }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    (err) => {
      assert.match(err.message, /選択可能な作業がありません/);
      assert.match(err.message, /task\/0042-x/);
      assert.match(err.message, /解釈できない/);
      return true;
    },
  );
  assert.deepEqual(calls, []);
});

test('例: path-exists が未達なら Blocked のまま選ばない', () => {
  const root = makeLayout({
    'task/0042-x': progressMd({
      status: 'Blocked',
      unblock: 'path-exists:task/archive/9999-none/',
    }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /選択可能な作業がありません/,
  );
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('例: 述語無しの Blocked と Not Started が並ぶと Not Started を選ぶ', () => {
  const root = makeLayout({
    'task/0017-x': progressMd({ branch: 'feature/x', status: 'Blocked' }),
    'task/0018-y': progressMd({ branch: 'feature/y', status: 'Not Started' }),
  });
  fs.mkdirSync(path.join(root, '.worktrees', 'feature/y'), { recursive: true });
  const out = startTask({ rootDir: root, exec: recordingExec([]) });
  assert.equal(out.dirName, '0018-y');
});

test('例: 満たされた Blocked を選んだあと worktree を用意する。Status は書き換わらず、解除専用ステップは走らない', () => {
  const root = makeRepo({
    'task/0042-x': progressMd({
      branch: 'feature/x',
      status: 'Blocked',
      unblock: 'path-exists:task/archive/0044-second-project-port/',
    }),
    'task/archive/0044-second-project-port': null,
  });
  const before = fs.readFileSync(path.join(root, 'task', '0042-x', 'progress.md'), 'utf8');
  const calls = [];
  const out = startTask({ rootDir: root, exec: recordingExec(calls) });

  assert.equal(out.dirName, '0042-x');
  assert.equal(out.created, true);
  assert.equal(fs.existsSync(path.join(root, '.worktrees', 'feature/x', 'task')), true);

  const after = fs.readFileSync(path.join(root, 'task', '0042-x', 'progress.md'), 'utf8');
  assert.equal(after, before, 'progress の Status を書き換えない');
  assert.match(after, /\*\*Status:\*\* `Blocked`/);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].cmd, 'git');
  assert.deepEqual(calls[0].args.slice(0, 2), ['worktree', 'add']);
  assert.equal(calls[1].cmd, 'npm');
  assert.deepEqual(calls[1].args, ['ci']);
});

test('試行ログの散文やフェンス内の Unblock からは推測しない', () => {
  const md = [
    progressMd({ status: 'Blocked' }),
    '',
    '## 試行ログ',
    '',
    '- `task/archive/0044-second-project-port/` が存在すること',
    '',
    '```',
    '- **Unblock:** `path-exists:task/archive/0044-second-project-port/`',
    '```',
    '',
  ].join('\n');
  const root = makeLayout({ 'task/0042-x': md });
  fs.mkdirSync(path.join(root, 'task', 'archive', '0044-second-project-port'), { recursive: true });
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec([]) }),
    /解除述語が無い/,
  );
});

test('Unblock が空、先頭 /、`.` / `..`、空セグメントなら解釈できない', () => {
  const cases = [
    '',
    'path-exists:',
    'path-exists:/etc/passwd',
    'path-exists:foo/../bar',
    'path-exists:foo/./bar',
    'path-exists:foo//bar',
    'path-exists:.',
    'path-exists:..',
  ];
  for (const unblock of cases) {
    const root = makeLayout({
      'task/0042-x': unblock === ''
        ? `${progressMd({ status: 'Blocked' })}\n- **Unblock:**\n`
        : progressMd({ status: 'Blocked', unblock }),
    });
    assert.throws(
      () => startTask({ rootDir: root, exec: recordingExec([]) }),
      /解釈できない/,
      `unblock=${JSON.stringify(unblock)}`,
    );
  }
});
