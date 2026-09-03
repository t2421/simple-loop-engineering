/**
 * Stop hook の**終了コード**のテスト。spec `task/0053-stop-hook-block-exit-code/spec.md`
 * の「例」の 1〜5 行目と 8 行目を網羅する。
 *
 * ## なぜ終了コードだけを別ファイルで見るのか
 *
 * `tests/stop-hook-ci-dir.test.mjs` は「どのチェックアウトで CI を回すか」を見ており、
 * hook の失敗は `assert.notEqual(r.status, 0)` としか固定していない。**非 0 でありさえ
 * すれば通る**ので、止まらない終了コード 1 を返していても緑になる。
 *
 * Claude Code の hook では 1 は「非ブロッキングのエラー」で、表示はされるが
 * セッションは止まらない。止めるのは 2 である（`tools/check-actions.mjs` は
 * 自分が止めるときに `process.exit(2)` を使っている）。したがって
 * 「検証が落ちたときに止める」経路が 1 を返していると、**ゲートが置かれているのに
 * 効いていない**状態になる。それを 1 でも 3 でもなく 2 であることとして固定する。
 *
 * 既存ファイルは凍結対象なので追記せず、新しいファイルに置く。
 *
 * ## 形
 *
 * `tests/stop-hook-ci-dir.test.mjs` と同じ fixture 方式にならう。
 * `.claude/settings.json` から Stop hook コマンドをそのまま読み、一時 git リポジトリで
 * `/bin/sh -c` により実行する。**コマンド文字列を手で書き写さない。**
 * 書き写すと、settings.json を直さないまま緑にできてしまう。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CI_DIR_SCRIPT = path.join(rootDir, 'loop-core', 'gate', 'stop-hook-ci-dir.mjs');

/**
 * 修正前の登録内容。「例」5 行目（バグの再現）に使う。
 *
 * **これは 2026-09-02 時点の `main` の登録内容の写しであり、更新しない。**
 * `.claude/settings.json` が正当に変わっても、この文字列は追随させない。
 * ここは実装に追随しない**対照群**であって、同期対象ではない。
 * 両方を settings.json から読むと、比較する 2 つが常に一致して対照にならなくなる。
 */
const BUGGY_COMMAND =
  'INPUT="$(cat)" && CI_DIR="$(printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/stop-hook-ci-dir.mjs")"' +
  ' && cd "$CI_DIR" && npm run ci 1>&2 && printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/check-actions.mjs"';

function git(cwd, ...args) {
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'ignore',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
}

/** `.claude/settings.json` の Stop hook コマンド。1 本であることも同時に固定する（「例」8 行目） */
function stopHookCommand() {
  const settings = JSON.parse(
    fs.readFileSync(path.join(rootDir, '.claude', 'settings.json'), 'utf8'),
  );
  const commands = settings.hooks.Stop.flatMap((entry) => entry.hooks.map((h) => h.command));
  assert.equal(commands.length, 1, 'Stop hook の command は 1 本である');
  return commands[0];
}

/**
 * 一時 git リポジトリを作る。
 *
 * - `package.json` の `scripts.ci` は `ci-ran.txt` を書いて `ciExit` で終わるスタブ
 * - `tools/stop-hook-ci-dir.mjs` は**本物のコピー**（CI_DIR の解決経路を本物で通す）
 * - `tools/check-actions.mjs` は `check-actions-ran.txt` を書いて `caExit` で終わるスタブ
 *
 * マーカーファイルの有無で「そこまで到達したか」を判定する。
 */
function makeFixture(t, { ciExit = 0, caExit = 0 } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-hook-exit-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo');
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });

  // npm script は `node -e` で走るので CJS。`.mjs` ファイルは ESM。書き分ける。
  // CJS 側は `node -e "..."` の二重引用符の中に入るので、**単引用符で書く**。
  // JSON.stringify を使うとクォートが入れ子になってシェルが壊れる（無言で exit 1 になる）
  const cjsStub = (marker, code) =>
    `require('fs').writeFileSync('${marker}', 'ran');process.exit(${code});`;
  const esmStub = (marker, code) =>
    `import fs from 'node:fs';\nfs.writeFileSync(${JSON.stringify(marker)}, 'ran');\nprocess.exit(${code});\n`;

  fs.writeFileSync(
    path.join(repo, 'package.json'),
    `${JSON.stringify(
      {
        name: 'fixture',
        private: true,
        scripts: { ci: `node -e "${cjsStub('ci-ran.txt', ciExit)}"` },
      },
      null,
      2,
    )}\n`,
  );
  fs.copyFileSync(CI_DIR_SCRIPT, path.join(repo, 'tools', 'stop-hook-ci-dir.mjs'));
  fs.writeFileSync(
    path.join(repo, 'tools', 'check-actions.mjs'),
    esmStub('check-actions-ran.txt', caExit),
  );
  fs.cpSync(path.join(rootDir, 'loop-core'), path.join(repo, 'loop-core'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'loop-core', 'gate', 'check-actions.mjs'),
    esmStub('check-actions-ran.txt', caExit),
  );
  fs.writeFileSync(
    path.join(repo, 'loop.manifest.json'),
    `${JSON.stringify({
      install: { argv: ['true'] },
      verify: { command: 'true', definedIn: ['package.json'] },
      protectedPaths: ['loop.manifest.json'],
    })}\n`,
  );

  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'add', '-A');
  return fs.realpathSync(repo);
}

/** hook コマンドを Stop hook と同じ形（stdin に JSON、env に CLAUDE_PROJECT_DIR）で実行 */
function runHook(command, repo) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: repo };
  return spawnSync('/bin/sh', ['-c', command], {
    input: JSON.stringify({ cwd: repo }),
    env,
    encoding: 'utf8',
    cwd: repo,
  });
}

const ran = (repo, name) => fs.existsSync(path.join(repo, name));

// --- 「例」の各行 ---

test('例1: ci が通れば終了コード 0 で、check-actions まで到達する', (t) => {
  const repo = makeFixture(t, { ciExit: 0, caExit: 0 });
  const r = runHook(stopHookCommand(), repo);
  assert.equal(r.status, 0);
  assert.equal(ran(repo, 'ci-ran.txt'), true, 'ci が実行されている');
  assert.equal(ran(repo, 'check-actions-ran.txt'), true, 'check-actions に到達している');
});

test('例2: ci が exit 1 なら hook は終了コード 2（1 ではない）で、check-actions を実行しない', (t) => {
  const repo = makeFixture(t, { ciExit: 1, caExit: 0 });
  const r = runHook(stopHookCommand(), repo);
  assert.equal(r.status, 2, '2 = セッションをブロックする。1 は非ブロッキングで止まらない');
  assert.equal(ran(repo, 'ci-ran.txt'), true, 'ci は実行されている');
  assert.equal(ran(repo, 'check-actions-ran.txt'), false, '検証が落ちたら Actions は見ない');
});

test('例3: ci の終了コードが 3 でも 2 に正規化する', (t) => {
  const repo = makeFixture(t, { ciExit: 3, caExit: 0 });
  const r = runHook(stopHookCommand(), repo);
  assert.equal(r.status, 2, 'ci の終了コードをそのまま返さない');
  assert.equal(ran(repo, 'check-actions-ran.txt'), false);
});

test('例4: check-actions の終了コードは素通しする（ci が通ったとき）', (t) => {
  const repo = makeFixture(t, { ciExit: 0, caExit: 2 });
  const r = runHook(stopHookCommand(), repo);
  assert.equal(r.status, 2);
  assert.equal(ran(repo, 'ci-ran.txt'), true);
  assert.equal(ran(repo, 'check-actions-ran.txt'), true, 'check-actions は実行されている');
});

test('fixture は ci の終了コードをそのまま伝播できる（例3 の「正規化」が本物の 3 に対して起きている根拠）', (t) => {
  // 修正後の hook は非 0 をすべて 2 へ正規化するので、npm が 3 を 1 へ潰していても
  // 例3 は緑になる。「1 でも 3 でも 2」という主張のうち **3 の部分だけが未検証**になる。
  // 正規化しない修正前のコマンドで測れば、fixture が 3 を作れることを固定できる。
  const repo = makeFixture(t, { ciExit: 3, caExit: 0 });
  const r = runHook(BUGGY_COMMAND, repo);
  assert.equal(r.status, 3, 'fixture の ci スタブは 3 を返し、正規化前はそのまま漏れる');
  assert.equal(ran(repo, 'ci-ran.txt'), true);
});

test('例5: 修正前のコマンドでは終了コード 1 になる（このテストが検知するバグそのもの）', (t) => {
  const repo = makeFixture(t, { ciExit: 1, caExit: 0 });
  const r = runHook(BUGGY_COMMAND, repo);
  assert.equal(r.status, 1, '修正前は npm の終了コードがそのまま出る');
  assert.equal(ran(repo, 'check-actions-ran.txt'), false);
  // 上と例2を並べることが、この作業の主張である。同じ入力で 1 と 2 に分かれる
  assert.notEqual(BUGGY_COMMAND, stopHookCommand(), '登録内容が修正前のままではない');
});
