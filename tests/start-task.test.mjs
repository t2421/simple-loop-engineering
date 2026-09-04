import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseProgressMeta,
  parseComplexity,
  modelForComplexity,
  formatStartTask,
  selectNextTask,
  nextIdFrom,
  startTask,
} from '../loop-core/ledger/start-task.mjs';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-task-'));
  for (const [dir, progress] of Object.entries(dirs)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (progress !== null) {
      fs.writeFileSync(path.join(root, dir, 'progress.md'), progress);
    }
  }
  writeLoopManifest(root);
  return root;
}

/** `complexity` を省くと **Complexity** 行の無い進捗（既存分と同じ形）になる */
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

test('parseProgressMeta: コードフェンスの中のメタ情報は読まない', () => {
  const md = [
    '# Progress: `x`',
    '',
    '## 試行ログ',
    '',
    '```',
    '$ cat progress.md',
    '- **Branch:** `feature/貼った出力`',
    '- **Status:** `Done`',
    '```',
    '',
  ].join('\n');
  assert.deepEqual(parseProgressMeta(md), { branch: null, status: null });
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

test('Blocked でも unblockMet なら選ぶ（選択時の読み替え）', () => {
  const picked = selectNextTask([
    { id: '0017', dirName: '0017-x', status: 'Blocked', branch: 'feature/x', unblockMet: true },
    { id: '0018', dirName: '0018-y', status: 'Not Started', branch: 'feature/y' },
  ]);
  assert.equal(picked.dirName, '0017-x');
  assert.equal(picked.status, 'Blocked');
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

test('install が無いマニフェストでは依存導入を呼ばない', () => {
  const root = makeRepo({
    'task/0020-a': progressMd({ branch: 'feature/a' }),
  });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'loop.manifest.json'), 'utf8'));
  delete manifest.install;
  fs.writeFileSync(path.join(root, 'loop.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const calls = [];
  const out = startTask({ rootDir: root, exec: recordingExec(calls) });
  assert.equal(out.created, true);
  assert.equal(calls.some((c) => c.cmd === 'npm'), false);
});

test('マニフェストが無ければ worktree を作らず失敗する', () => {
  const root = makeRepo({
    'task/0020-a': progressMd({ branch: 'feature/a' }),
  });
  fs.rmSync(path.join(root, 'loop.manifest.json'));
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /マニフェストが無い/,
  );
  assert.equal(calls.some((c) => c.cmd === 'git'), false);
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

// --- parseComplexity / modelForComplexity ---

test('parseComplexity: バッククォート付きの等級を読む', () => {
  assert.equal(parseComplexity(progressMd({ complexity: 'L' })), 'L');
});

test('parseComplexity: バッククォート無しでも読む', () => {
  assert.equal(parseComplexity('- **Complexity:** S\n'), 'S');
});

test('parseComplexity: **Complexity** が無ければ null（既存の進捗）', () => {
  assert.equal(parseComplexity(progressMd()), null);
});

test('modelForComplexity: 対応表どおりに引く', () => {
  assert.equal(modelForComplexity('S', MODELS), 'haiku');
  assert.equal(modelForComplexity('M', MODELS), 'sonnet');
  assert.equal(modelForComplexity('L', MODELS), 'fable');
});

test('modelForComplexity: 未記載（null）は M とみなす', () => {
  assert.equal(modelForComplexity(null, MODELS), 'sonnet');
});

test('parseComplexity: コードフェンスの中の Complexity 行は読まない', () => {
  const md = [
    '# Progress: `x`',
    '',
    '- **Target Spec:** `task/0020-a/spec.md`',
    '- **Branch:** `feature/a`',
    '- **PR:** `未作成`',
    '- **Status:** `Not Started`',
    '',
    '## 試行ログ',
    '',
    '```',
    '$ node tools/start-task.mjs',
    '- **Complexity:** `L`',
    '```',
    '',
  ].join('\n');
  assert.equal(parseComplexity(md), null, '貼った出力の中の値をメタ情報にしない');
});

test('parseComplexity: フェンスの外にあれば読む（フェンスの後でも）', () => {
  const md = [
    '- **Complexity:** `S`',
    '',
    '```',
    '- **Complexity:** `L`',
    '```',
    '',
  ].join('\n');
  assert.equal(parseComplexity(md), 'S');
});

test('modelForComplexity: 表に無い等級は失敗する', () => {
  assert.throws(() => modelForComplexity('XL', MODELS), /Complexity/);
});

test('modelForComplexity: Object.prototype の継承プロパティは表に無い等級として失敗する', () => {
  for (const grade of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
    assert.throws(
      () => modelForComplexity(grade, MODELS),
      /Complexity/,
      `${grade} が表引きを素通りしている`,
    );
  }
});

// --- spec「例」の 4 行 ---

/** 一時レイアウトの作業を選び、CLI と同じ書式に整えた出力を返す */
function startAndFormat(complexity) {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: 'feature/a', complexity }),
  });
  // worktree を先に置き、git も npm も呼ばずに選択と出力だけを見る
  fs.mkdirSync(path.join(root, '.worktrees', 'feature/a'), { recursive: true });
  return formatStartTask(startTask({ rootDir: root, exec: recordingExec([]) }));
}

test('例: Complexity `S` の作業を選ぶと出力に haiku が含まれる', () => {
  assert.match(startAndFormat('S'), /haiku/);
});

test('例: Complexity `L` の作業を選ぶと出力に fable が含まれる', () => {
  assert.match(startAndFormat('L'), /fable/);
});

test('例: Complexity 未記載の作業を選ぶと出力に sonnet が含まれる（M 扱い）', () => {
  assert.match(startAndFormat(undefined), /sonnet/);
});

test('例: Complexity が `XL` の作業を選ぶと何も作成せず失敗する', () => {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: 'feature/a', complexity: 'XL' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /Complexity/,
  );
  assert.deepEqual(calls, [], '何も実行しない');
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('Complexity が `constructor` の作業を選ぶと何も作成せず失敗する', () => {
  const root = makeLayout({
    'task/0020-a': progressMd({ branch: 'feature/a', complexity: 'constructor' }),
  });
  const calls = [];
  assert.throws(
    () => startTask({ rootDir: root, exec: recordingExec(calls) }),
    /Complexity/,
  );
  assert.deepEqual(calls, [], '何も実行しない');
  assert.equal(fs.existsSync(path.join(root, '.worktrees')), false);
});

test('試行ログのフェンスに Complexity を貼っただけの作業は M 扱い（sonnet）', () => {
  const root = makeLayout({
    'task/0020-a': [
      progressMd({ branch: 'feature/a' }),
      '',
      '## 試行ログ',
      '',
      '```',
      '$ node tools/start-task.mjs',
      '- **Complexity:** `L`',
      '```',
      '',
    ].join('\n'),
  });
  fs.mkdirSync(path.join(root, '.worktrees', 'feature/a'), { recursive: true });
  const out = startTask({ rootDir: root, exec: recordingExec([]) });
  assert.equal(out.complexity, 'M');
  assert.equal(out.model, 'sonnet');
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

// --- 0059: Blocked の解除述語 ---

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
