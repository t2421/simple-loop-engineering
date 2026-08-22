import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classify,
  decide,
  detectGitPush,
  readStopHookActive,
  DEFAULT_TIMEOUT_SEC,
} from '../tools/check-actions.mjs';

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
  return {
    now: () => t,
    sleep: async (ms) => {
      t += stepMs === 0 ? ms : stepMs;
    },
  };
}

const base = { timeoutSec: DEFAULT_TIMEOUT_SEC, pollIntervalSec: 15 };

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

test('classify: 成功と見なせない結論（action_required など）も block。黙って緑にしない', () => {
  assert.equal(classify([ng('a', 'action_required')]).verdict, 'block');
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

test('例 2: 全ジョブ success / skipped を注入すると通す', async () => {
  const { now, sleep } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify'), ok('e2e')]]), now, sleep });
  assert.equal(r.exit, 0);
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
  const { now, sleep } = clock({ stepMs: 1000 });
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

test('例 13b: stop_hook_active が真なら、未確定でもブロックしない', async () => {
  const { now, sleep } = clock({ stepMs: (DEFAULT_TIMEOUT_SEC + 1) * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[running('e2e')]]), now, sleep, stopHookActive: true });
  assert.equal(r.exit, 0);
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
