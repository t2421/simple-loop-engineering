import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  classify,
  decide,
  stuckConditions,
  rerunStuckEnabledFromEnv,
  errorReason,
  needsParentRunList,
  attachParentRuns,
  withParentRuns,
  CHECK_RUNS_JQ,
  DEFAULT_QUIET_SEC,
  DEFAULT_TIMEOUT_SEC,
  PASSING_CONCLUSIONS,
} from '../loop-core/gate/check-actions.mjs';

const PASS_LINE = /HEAD のチェックはすべて成功しています/;

/** 完了して成功したチェック */
const ok = (name) => ({ name, status: 'completed', conclusion: 'success', html_url: `https://x/${name}`, id: 1 });

/** 条件 A: status 未完了なのに conclusion が入っている（PR #63 の形） */
const stuckA = {
  name: 'progress-coupling',
  status: 'in_progress',
  conclusion: 'success',
  run_id: 32672846210,
};

/** 条件 B: 親 run 完了・配下 job 未完了 */
const stuckB = {
  name: 'job',
  status: 'in_progress',
  conclusion: null,
  run_status: 'completed',
  run_id: 1,
};

/** 通常の未確定（条件 A にも B にも当たらない） */
const pendingE2e = {
  name: 'e2e',
  status: 'in_progress',
  conclusion: null,
  run_status: 'in_progress',
};

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

test('PASSING_CONCLUSIONS は success / skipped のまま。DEFAULT_TIMEOUT_SEC は 480', () => {
  assert.deepEqual(PASSING_CONCLUSIONS, ['success', 'skipped']);
  assert.equal(DEFAULT_TIMEOUT_SEC, 480);
});

test('stuckConditions: 条件 A / B / 通常の未確定', () => {
  assert.deepEqual(stuckConditions(stuckA), ['A']);
  assert.deepEqual(stuckConditions(stuckB), ['B']);
  assert.deepEqual(stuckConditions(pendingE2e), []);
  assert.deepEqual(stuckConditions({ name: 'x', status: 'in_progress', conclusion: '' }), []);
  assert.deepEqual(stuckConditions({ name: 'x', status: 'in_progress', conclusion: null }), []);
  assert.deepEqual(
    stuckConditions({
      name: 'progress-coupling',
      status: 'in_progress',
      conclusion: 'success',
      run_status: 'completed',
      run_id: 32672846210,
    }),
    ['A', 'B'],
  );
});

test('例 1: 条件 A を classify / decide に注入すると取り残し。待たずに exit 2', async () => {
  const classified = classify([stuckA]);
  assert.equal(classified.verdict, 'stuck');
  assert.notEqual(classified.verdict, 'pass');

  const { now, sleep, calls } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([[stuckA]]), now, sleep });
  assert.equal(r.exit, 2);
  assert.equal(calls.sleeps, 0, '残りのタイムアウトまで待たない');
  const text = r.lines.join('\n');
  assert.match(text, /progress-coupling/);
  assert.match(text, /条件 A/);
  assert.match(text, /gh run rerun 32672846210/);
  assert.match(text, /結果を確認するまで完了と報告しないでください/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('例 2: 条件 B を注入すると取り残し。待たずに exit 2', async () => {
  assert.equal(classify([stuckB]).verdict, 'stuck');
  const { now, sleep, calls } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([[stuckB]]), now, sleep });
  assert.equal(r.exit, 2);
  assert.equal(calls.sleeps, 0);
  const text = r.lines.join('\n');
  assert.match(text, /job/);
  assert.match(text, /条件 B/);
  assert.match(text, /gh run rerun 1/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('例 3: 通常の未確定は取り残しにしない。上限超過は未確定でブロック', async () => {
  assert.equal(classify([pendingE2e]).verdict, 'pending');
  const { now, sleep } = clock({ stepMs: (DEFAULT_TIMEOUT_SEC + 1) * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[pendingE2e]]), now, sleep });
  assert.equal(r.exit, 2);
  const text = r.lines.join('\n');
  assert.match(text, /未確定を成功として扱いません/);
  assert.doesNotMatch(text, /取り残されたチェック/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('例 4: 全チェック completed/success で静穏期間を満たせば通す', async () => {
  const { now, sleep } = clock({ stepMs: DEFAULT_QUIET_SEC * 1000 });
  const r = await decide({ ...base, fetchChecks: fetcher([[ok('verify'), ok('e2e')]]), now, sleep });
  assert.equal(r.exit, 0);
  assert.match(r.lines.join('\n'), PASS_LINE);
});

test('例 5: 条件 A の取り残しを成功（exit 0 かつ成功メッセージ）と判定しない', async () => {
  const { now, sleep } = clock();
  const r = await decide({ ...base, fetchChecks: fetcher([[stuckA]]), now, sleep });
  assert.notEqual(r.exit, 0);
  assert.equal(r.exit, 2);
  assert.doesNotMatch(r.lines.join('\n'), PASS_LINE);
});

test('例 6: 再実行せず同じ取り残しが残っても成功にしない', async () => {
  const { now, sleep, calls } = clock({ stepMs: 15 * 1000 });
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA], [stuckA]]),
    now,
    sleep,
  });
  assert.equal(r.exit, 2);
  assert.equal(calls.sleeps, 0, '取り残しのまま待たない');
  assert.match(r.lines.join('\n'), /取り残されたチェック/);
  assert.doesNotMatch(r.lines.join('\n'), PASS_LINE);
});

test('例 7: stop_hook_active と条件 A を同時に注入すると exit 0。取り残しは述べ、成功とは書かない', async () => {
  const { now, sleep, calls } = clock();
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA]]),
    now,
    sleep,
    stopHookActive: true,
  });
  assert.equal(r.exit, 0);
  assert.equal(calls.sleeps, 0);
  const text = r.lines.join('\n');
  assert.match(text, /取り残されたチェック/);
  assert.match(text, /progress-coupling/);
  assert.match(text, /停止ループを作らない/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('例 8: CHECK_ACTIONS_RERUN_STUCK=1 なら再実行は最大 1 回。遷移して静穏を満たせば通す', async () => {
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '1' }), true);
  const { now, sleep } = clock({ stepMs: DEFAULT_QUIET_SEC * 1000 });
  const reruns = [];
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA], [ok('progress-coupling')]]),
    now,
    sleep,
    rerunStuckEnabled: true,
    rerunStuck: async (runId) => {
      reruns.push(runId);
    },
  });
  assert.deepEqual(reruns, [32672846210]);
  assert.equal(r.exit, 0);
  assert.match(r.lines.join('\n'), PASS_LINE);
});

test('例 8b: 再実行後も同じ取り残しが残ったら 2 回目は走らせず exit 2', async () => {
  const { now, sleep } = clock();
  const reruns = [];
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA]]),
    now,
    sleep,
    rerunStuckEnabled: true,
    rerunStuck: async (runId) => {
      reruns.push(runId);
    },
  });
  assert.deepEqual(reruns, [32672846210], '再実行は 1 回だけ');
  assert.equal(r.exit, 2);
  const text = r.lines.join('\n');
  assert.match(text, /取り残されたチェック/);
  assert.match(text, /gh run rerun 32672846210/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('自動再実行を選んだが gh run rerun が失敗する: 成功にせずブロックする', async () => {
  const { now, sleep } = clock();
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA]]),
    now,
    sleep,
    rerunStuckEnabled: true,
    rerunStuck: async () => {
      throw new Error('gh: rerun failed');
    },
  });
  assert.equal(r.exit, 2);
  const text = r.lines.join('\n');
  assert.match(text, /gh run rerun 32672846210 に失敗しました/);
  assert.match(text, /gh: rerun failed/);
  assert.doesNotMatch(text, PASS_LINE);
});

test('rerunStuck が非 Error を投げても成功にせず、理由をログに残す', async () => {
  assert.equal(errorReason(new Error('gh: rerun failed')), 'gh: rerun failed');
  assert.equal(errorReason('plain'), 'plain');
  assert.equal(errorReason(null), 'null');
  assert.equal(errorReason({ code: 1 }), '{"code":1}');

  const { now, sleep } = clock();
  const r = await decide({
    ...base,
    fetchChecks: fetcher([[stuckA]]),
    now,
    sleep,
    rerunStuckEnabled: true,
    rerunStuck: async () => {
      throw 'gh: rerun failed';
    },
  });
  assert.equal(r.exit, 2);
  assert.match(r.lines.join('\n'), /gh run rerun 32672846210 に失敗しました（gh: rerun failed）/);
  assert.doesNotMatch(r.lines.join('\n'), PASS_LINE);
});

test('rerunStuckEnabledFromEnv: 正の整数だけ真。1x / 01 / true / 0 では選ばない', () => {
  assert.equal(rerunStuckEnabledFromEnv({}), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '0' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: 'true' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '1x' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '01' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '1.5' }), false);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '1' }), true);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '2' }), true);
  assert.equal(rerunStuckEnabledFromEnv({ CHECK_ACTIONS_RERUN_STUCK: '10' }), true);
});

test('needsParentRunList: すべて completed なら親 run 一覧は不要。未完了が 1 件でもあれば要る', () => {
  assert.equal(needsParentRunList([]), false);
  assert.equal(needsParentRunList([ok('verify'), ok('e2e')]), false);
  assert.equal(needsParentRunList([stuckA]), true);
  assert.equal(needsParentRunList([ok('verify'), pendingE2e]), true);
});

test('withParentRuns: 全完了なら fetchParentRuns を呼ばない', async () => {
  let called = 0;
  const r = await withParentRuns(
    [ok('verify'), { ...ok('e2e'), html_url: 'https://github.com/t2421/simple-loop-engineering/actions/runs/9/job/1' }],
    () => {
      called += 1;
      return [{ id: 9, status: 'completed', check_suite_id: 1 }];
    },
  );
  assert.equal(r.fetchedParentRuns, false);
  assert.equal(called, 0);
  assert.equal(r.checks[1].run_id, 9);
  assert.equal(r.checks[1].run_status, undefined);
});

test('withParentRuns: 未完了があるときだけ親 run を取り、条件 B を判定できる', async () => {
  let called = 0;
  const incomplete = {
    name: 'job',
    status: 'in_progress',
    conclusion: null,
    html_url: 'https://github.com/t2421/simple-loop-engineering/actions/runs/1/job/2',
    id: 2,
    check_suite_id: 9,
  };
  const r = await withParentRuns([incomplete], () => {
    called += 1;
    return [{ id: 1, status: 'completed', check_suite_id: 9 }];
  });
  assert.equal(r.fetchedParentRuns, true);
  assert.equal(called, 1);
  assert.equal(r.checks[0].run_id, 1);
  assert.equal(r.checks[0].run_status, 'completed');
  assert.deepEqual(stuckConditions(r.checks[0]), ['B']);
  assert.equal(classify(r.checks).verdict, 'stuck');
});

test('attachParentRuns: 親 run 取得失敗相当（runs 空）でも check-run は返し、条件 A は残る', () => {
  const attached = attachParentRuns([
    {
      name: 'progress-coupling',
      status: 'in_progress',
      conclusion: 'success',
      html_url: 'https://github.com/t2421/simple-loop-engineering/actions/runs/32672846210/job/4',
      id: 4,
      check_suite_id: 9,
    },
  ], []);
  assert.equal(attached[0].run_id, 32672846210);
  assert.equal(attached[0].run_status, undefined);
  assert.deepEqual(stuckConditions(attached[0]), ['A']);
});

test('CHECK_RUNS_JQ: check_suite が null / 欠落でも jq は落ちず、check_suite_id は null', () => {
  assert.match(CHECK_RUNS_JQ, /\.check_suite\?\.id/);
  const input = JSON.stringify({
    check_runs: [
      {
        name: 'progress-coupling',
        status: 'in_progress',
        conclusion: 'success',
        html_url: 'https://github.com/t2421/simple-loop-engineering/actions/runs/32672846210/job/4',
        id: 4,
        check_suite: null,
      },
      {
        name: 'e2e',
        status: 'in_progress',
        conclusion: null,
        html_url: 'https://x/e2e',
        id: 5,
      },
      {
        name: 'verify',
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://x/verify',
        id: 6,
        check_suite: { id: 9 },
      },
    ],
  });
  const out = JSON.parse(execFileSync('jq', ['-c', CHECK_RUNS_JQ], { input, encoding: 'utf8' }));
  assert.equal(out[0].check_suite_id, null);
  assert.equal(out[1].check_suite_id, null);
  assert.equal(out[2].check_suite_id, 9);
  assert.equal(out[0].name, 'progress-coupling');
  assert.deepEqual(stuckConditions(out[0]), ['A']);
});

