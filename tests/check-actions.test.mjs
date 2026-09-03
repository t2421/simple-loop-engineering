import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkNameSet,
  classify,
  decide,
  detectGitPush,
  readStopHookActive,
  DEFAULT_QUIET_SEC,
  DEFAULT_TIMEOUT_SEC,
} from '../loop-core/gate/check-actions.mjs';

/** 完了して成功したチェック */
const ok = (name) => ({ name, status: 'completed', conclusion: 'success', html_url: `https://x/${name}`, id: 1 });
/** 完了して失敗したチェック */
const ng = (name, conclusion = 'failure', id = 42) => ({
  name,
  status: 'completed',
  conclusion,
  html_url: `https://github.com/t2421/simple-loop-engineering/actions/runs/1/job/${id}`,
  id,
});
/** まだ走っているチェック */
const running = (name) => ({ name, status: 'in_progress', conclusion: null, html_url: `https://x/${name}`, id: 7 });

/** 決められた列を順に返す fetchChecks を作る。最後の要素は以後ずっと返す */
function fetcher(sequence) {
  let i = 0;
  return async () => {
    const value = sequence[Math.min(i, sequence.length - 1)];
    i += 1;
    if (value instanceof Error) throw value;
    return value;
  };
}

/** 呼ばれた回数ぶん時計を進める now と、実時間を待たない sleep */
function clock({ startMs = 0, stepMs = 0 } = {}) {
  let t = startMs;
  const calls = { sleeps: 0 };
  return {
    now: () => t,
    sleep: async (ms) => {
      calls.sleeps += 1;
      t += stepMs === 0 ? ms : stepMs;
    },
    calls,
  };
}

const base = { timeoutSec: DEFAULT_TIMEOUT_SEC, pollIntervalSec: 15, quietSec: DEFAULT_QUIET_SEC };

test('classify: 全部 success / skipped なら pass', () => {
  const r = classify([ok('verify'), { ...ok('e2e'), conclusion: 'skipped' }]);
  assert.equal(r.verdict, 'pass');
});

test('classify: 1 つでも failure なら block', () => {
  const r = classify([ok('verify'), ng('preview')]);
  assert.equal(r.verdict, 'block');
  assert.deepEqual(r.failed.map((c) => c.name), ['preview']);
});

test('classify: cancelled / timed_out も block', () => {
  assert.equal(classify([ng('a', 'cancelled')]).verdict, 'block');
  assert.equal(classify([ng('a', 'timed_out')]).verdict, 'block');
});

test('classify: 成功と見なせない結論（action_required・neutral など）も block。黙って緑にしない', () => {
  assert.equal(classify([ng('a', 'action_required')]).verdict, 'block');
  // 仕様の判定表が通すのは success / skipped だけ。通す集合を実装だけで広げない
  assert.equal(classify([ng('a', 'neutral')]).verdict, 'block');
});

test('classify: 未完了が残れば pending', () => {
  const r = classify([ok('verify'), running('e2e')]);
  assert.equal(r.verdict, 'pending');
  assert.deepEqual(r.pending.map((c) => c.name), ['e2e']);
});

test('classify: 0 件は empty', () => {
  assert.equal(classify([]).verdict, 'empty');
});

// --- 「例」1〜7 と 13 ---

test('例 1: HEAD がリモートに無い（未 push）なら、取得すらせず通す。理由を出す', async () => {
  const { now, sleep } = clock();
  let fetched = false;
  const r = await decide({
    ...base,
    isPushed: () => false,
    fetchChecks: async () => { fetched = true; return []; },
    now,
    sleep,
  });
  assert.equal(r.exit, 0);
  assert.equal(fetched, false, '未 push なら gh を呼ばない');
  assert.match(r.lines.join('\n'), /未 push/);
});

test('例 2: 全ジョブ success / skipped を注入すると通す', async () => {
  const { now, sleep } = clock({ stepMs: DEFAULT_QUIET_SEC * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify'), ok('e2e')]]), now, sleep });
  assert.equal(r.exit, 0);
});

test('H1 回帰: 先に登録されたチェックだけが緑でも即座には通さない。遅れて現れた失敗を捕まえる', async () => {
  const { now, sleep } = clock({ stepMs: 15 * 1000 });
  // 1 回目は verify だけ成功で返る（guard / preview の check-run はまだ作られていない）
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[ok('verify')], [ok('verify'), ng('preview', 'failure', 7)]]),
    now,
    sleep,
  });
  assert.equal(r.exit, 2, '遅れて現れた failure を見逃さない');
  assert.match(r.lines.join('\n'), /preview/);
});

test('H1: チェック名の集合が静穏期間ぶん変わらなければ通す', async () => {
  const { now, sleep } = clock({ stepMs: 15 * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify'), ok('e2e')]]), now, sleep });
  assert.equal(r.exit, 0);
});

test("H1': 件数が同じでも中身が入れ替わったら静穏を数え直す（遅れて現れた失敗を捕まえる）", async () => {
  const { now, sleep } = clock({ stepMs: 15 * 1000 });
  const r = await decide({
    ...base,
    // 件数はずっと 1 のまま。verify → guard と入れ替わり、その後 guard が失敗する
    fetchChecks: fetcher([[ok('verify')], [ok('guard')], [ng('guard', 'failure', 5)]]),
    now,
    sleep,
  });
  assert.equal(r.exit, 2, '件数だけを見ていると素通りする列');
  assert.match(r.lines.join('\n'), /guard/);
});

test('H1: 静穏期間の途中で新しいチェックが現れたら、まだ通さない', async () => {
  const { now, sleep } = clock({ stepMs: 15 * 1000 });
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[ok('verify')], [ok('verify'), ok('guard')], [ok('verify'), ng('guard', 'failure', 6)]]),
    now,
    sleep,
  });
  assert.equal(r.exit, 2);
});

test('H1: 静穏期間は quietSec で変えられる（CHECK_ACTIONS_QUIET_SEC 相当）', async () => {
  const { now, sleep, calls } = clock({ stepMs: 15 * 1000 });
  const r = await decide({ ...base, quietSec: 1, fetchChecks: fetcher([[ok('verify')]]), now, sleep });
  assert.equal(r.exit, 0);
  assert.equal(calls.sleeps, 1, '静穏 1 秒なら 1 回の再取得で足りる');
});

test('checkNameSet: 並び順が違っても同じ集合とみなす', () => {
  assert.equal(checkNameSet([ok('b'), ok('a')]), checkNameSet([ok('a'), ok('b')]));
  assert.notEqual(checkNameSet([ok('a')]), checkNameSet([ok('b')]));
});

test('例 3: 1 ジョブ failure を注入するとブロックし、ジョブ名・URL・調査コマンドを出す', async () => {
  const { now, sleep } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify'), ng('preview', 'failure', 99)]]), now, sleep });
  assert.equal(r.exit, 2);
  const text = r.lines.join('\n');
  assert.match(text, /preview/);
  assert.match(text, /https:\/\/github\.com\/t2421\/simple-loop-engineering\/actions\/runs\/1\/job\/99/);
  assert.match(text, /gh run view --log-failed --job 99/);
});

test('例 4: in_progress のまま上限を超えたら「未確定」としてブロックする（実時間を待たない）', async () => {
  // sleep 1 回で上限を跨ぐ時計にする
  const { now, sleep } = clock({ stepMs: (DEFAULT_TIMEOUT_SEC + 1) * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[running('e2e')]]), now, sleep });
  assert.equal(r.exit, 2);
  assert.match(r.lines.join('\n'), /未確定/);
});

test('例 5: in_progress が上限内に success へ遷移したら通す', async () => {
  const { now, sleep } = clock({ stepMs: DEFAULT_QUIET_SEC * 1000 });
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[running('e2e')], [running('e2e')], [ok('e2e')]]),
    now,
    sleep,
  });
  assert.equal(r.exit, 0);
});

test('例 6: run 0 件がリトライ後も 0 件なら通す。理由を出す', async () => {
  const { now, sleep } = clock({ stepMs: 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[]]), now, sleep });
  assert.equal(r.exit, 0);
  assert.match(r.lines.join('\n'), /0 件/);
});

test('例 6b: 0 件でも上限内に現れたらその結果で判定する', async () => {
  const { now, sleep } = clock({ stepMs: 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[], [ng('verify')]]), now, sleep });
  assert.equal(r.exit, 2);
});

test('例 7: gh 呼び出しがエラーなら fail-open で通し、理由を必ず出す', async () => {
  const { now, sleep } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([new Error('gh: command not found')]), now, sleep });
  assert.equal(r.exit, 0);
  assert.match(r.lines.join('\n'), /gh: command not found/);
  assert.ok(r.lines.length > 0, 'fail-open でも黙って通さない');
});

test('例 13: stop_hook_active が真なら、赤くてもブロックしない。ただし状態は述べる', async () => {
  const { now, sleep } = clock();
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[ng('preview')]]),
    now,
    sleep,
    stopHookActive: true,
  });
  assert.equal(r.exit, 0);
  const text = r.lines.join('\n');
  assert.match(text, /preview/);
  assert.match(text, /停止/);
});

test('例 13b: stop_hook_active が真なら、未確定でも待たずに即通す（H2 回帰）', async () => {
  const { now, sleep, calls } = clock({ stepMs: 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[running('e2e')]]), now, sleep, stopHookActive: true });
  assert.equal(r.exit, 0);
  assert.equal(calls.sleeps, 0, '停止ループ中は 1 度も待たない');
  assert.match(r.lines.join('\n'), /未確定/);
});

test('例 13c: stop_hook_active が真なら、緑判定でも落ち着き待ちをしない', async () => {
  const { now, sleep, calls } = clock({ stepMs: 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify')]]), now, sleep, stopHookActive: true });
  assert.equal(r.exit, 0);
  assert.equal(calls.sleeps, 0);
});

test('timeoutSec を変えられる（CHECK_ACTIONS_TIMEOUT_SEC 相当）', async () => {
  const { now, sleep } = clock({ stepMs: 61 * 1000 });
  const r = await decide({ ...base, timeoutSec: 60, fetchChecks: fetcher([[running('e2e')]]), now, sleep });
  assert.equal(r.exit, 2);
});

// --- push 検知（「例」10・11 の純関数部分） ---

test('detectGitPush: git push を検知する', () => {
  assert.equal(detectGitPush('git push -u origin feat/x'), true);
  assert.equal(detectGitPush('git add -A && git commit -m x && git push'), true);
  assert.equal(detectGitPush('git -C /tmp/repo push'), true);
});

test('detectGitPush: push でないコマンドは検知しない', () => {
  assert.equal(detectGitPush('npm run ci'), false);
  assert.equal(detectGitPush('git pull'), false);
  assert.equal(detectGitPush('git log --oneline'), false);
  assert.equal(detectGitPush(''), false);
  assert.equal(detectGitPush(undefined), false);
});

// --- stop_hook_active の読み取り ---

test('readStopHookActive: hook の JSON から読む', () => {
  assert.equal(readStopHookActive('{"stop_hook_active":true}'), true);
  assert.equal(readStopHookActive('{"stop_hook_active":false}'), false);
});

test('readStopHookActive: 読めないときは false（判定は行う）', () => {
  assert.equal(readStopHookActive(''), false);
  assert.equal(readStopHookActive('not json'), false);
  assert.equal(readStopHookActive(undefined), false);
});
