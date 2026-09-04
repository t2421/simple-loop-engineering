/**
 * push した HEAD に対する GitHub Actions の結果を判定する。
 *
 * push したあと結果を確認しないまま作業を終えられてしまうのを、規律ではなく
 * 機構で塞ぐ（0033-actions-result-gate）。Stop hook の後段として呼ばれ、
 * 赤い・未確定のまま会話を終えようとしたらブロックする。
 *
 * ## 判定
 *
 * | 状態 | 挙動 |
 * |---|---|
 * | HEAD がリモート追跡ブランチに無い（未 push） | 通す。理由を stderr に 1 行 |
 * | 全チェックが success / skipped | 通す |
 * | 1 つでも failure / cancelled / timed_out など非成功で完了 | **ブロック**（終了コード 2） |
 * | 取り残し（status 未完了なのに conclusion がある、または親 run 完了なのに配下が未完了） | 待たずにブロック。案内に `gh run rerun <run_id>`。任意で 1 回再実行 |
 * | 通常の未完了が残る | 上限まで待つ（既定 8 分・CHECK_ACTIONS_TIMEOUT_SEC）。超過は「未確定」でブロック |
 *
 * 「全部成功」に見えても即座には通さない。ワークフローは別々に起動するので、
 * 先に登録された check-run だけが成功で返り、`guard` や `preview` の check-run が
 * まだ作られていない瞬間がある。その一瞬を緑と読むとゲートの意味が無い。
 * **チェック名の集合が静穏期間（既定 30 秒・CHECK_ACTIONS_QUIET_SEC）変わらないこと**を
 * 緑の条件にする。件数だけを見ると、同数のまま中身が入れ替わった場合に
 * 「落ち着いた」と誤読する。
 * | チェック 0 件 | 短いリトライ後も 0 件なら通す。理由を stderr に 1 行 |
 * | gh 不在・未認証・API エラー | fail-open で通す。**理由を stderr に必ず 1 行** |
 *
 * ## 停止ループを作らない
 *
 * Stop hook が終了コード 2 で止めると Claude Code は「続けろ」と戻す。赤いまま
 * 何度も停止を試みると往復が終わらない。2 度目以降は hook の stdin に
 * `stop_hook_active: true` が入るので、そのときはブロックしない。
 * ただし**黙って通さない**。現在の状態は必ず述べる。
 *
 * ## fail-open
 *
 * gh が無い・未認証・API が落ちている、のいずれでもブロックしない。判定できない
 * ことを理由に作業を止めるより素通りを許す。ただし理由を stderr に 1 行出す。
 * ゲートが効いていないことに気づけないのが、いちばん悪い失敗の仕方である。
 *
 * ## モード
 *
 * - 引数なし: Stop hook 用。上の判定を行う
 * - `--on-bash-post`: PostToolUse 用。stdin の `tool_input.command` が `git push`
 *   を含むならリマインドを出して終了コード 2（PostToolUse では停止ではなく、
 *   stderr がセッションへ戻る）。含まなければ何も出さず 0
 *
 * 手動実行: `node loop-core/bin/loop.mjs check-actions`
 *           `echo '{"tool_input":{"command":"git push"}}' | node loop-core/bin/loop.mjs check-actions --on-bash-post`
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 未完了を待つ上限（秒）。環境変数 CHECK_ACTIONS_TIMEOUT_SEC で変えられる */
export const DEFAULT_TIMEOUT_SEC = 480;

/** 未完了・0 件のときの再取得間隔（秒） */
export const POLL_INTERVAL_SEC = 15;

/** 0 件のときに諦めるまでの再取得回数 */
export const EMPTY_RETRIES = 2;

/**
 * 「全部成功」を信じるまでに、チェック名の集合が変わらないことを求める秒数。
 * 環境変数 CHECK_ACTIONS_QUIET_SEC で変えられる。
 * 短くすると遅れて登録されるワークフローを取りこぼし、長くすると緑のときの
 * 停止が毎回そのぶん遅くなる。
 */
export const DEFAULT_QUIET_SEC = 30;

/** 成功と見なす結論。これ以外で完了したものは失敗として扱う */
export const PASSING_CONCLUSIONS = ['success', 'skipped'];

/**
 * conclusion が「入っている」か。null / 欠落 / 空文字は空とみなす（条件 A）。
 *
 * @param {unknown} conclusion
 * @returns {boolean}
 */
function hasConclusion(conclusion) {
  return conclusion != null && String(conclusion) !== '';
}

/**
 * 1 件の check-run が取り残しなら、当たった条件（A / B）を返す純関数。
 * どちらでもなければ空配列。
 *
 * - 条件 A: `status` が `completed` 以外で、かつ `conclusion` が空でない
 * - 条件 B: 親 run の `run_status` が `completed` で、配下の `status` が `completed` 以外
 *
 * @param {{status?:string, conclusion?:string|null, run_status?:string|null}} check
 * @returns {Array<'A'|'B'>}
 */
export function stuckConditions(check) {
  if (check == null || typeof check !== 'object') return [];
  const conditions = [];
  const incomplete = check.status !== 'completed';
  if (incomplete && hasConclusion(check.conclusion)) conditions.push('A');
  if (incomplete && check.run_status === 'completed') conditions.push('B');
  return conditions;
}

/**
 * チェックの一覧を分類する純関数。
 *
 * 失敗（completed かつ非成功）を先に見る。取り残しは通常の未確定より優先し、
 * 待たずに案内できるようにする。未確定を成功にはしない。
 *
 * @param {Array<{name:string,status:string,conclusion:string|null,run_status?:string|null}>} checks
 * @returns {{verdict:'pass'|'block'|'pending'|'empty'|'stuck', failed?:object[], pending?:object[], stuck?:object[]}}
 */
export function classify(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return { verdict: 'empty' };
  const failed = checks.filter(
    (c) => c.status === 'completed' && !PASSING_CONCLUSIONS.includes(c.conclusion),
  );
  if (failed.length > 0) return { verdict: 'block', failed };
  const stuck = checks.filter((c) => stuckConditions(c).length > 0);
  if (stuck.length > 0) return { verdict: 'stuck', stuck };
  const pending = checks.filter((c) => c.status !== 'completed');
  if (pending.length > 0) return { verdict: 'pending', pending };
  return { verdict: 'pass' };
}

/**
 * `CHECK_ACTIONS_RERUN_STUCK` が正の整数（`1` を含む）なら自動再実行を選ぶ。
 * `parseInt` は使わない（`1x` を 1 と読むため）。数字だけを受け付ける。
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function rerunStuckEnabledFromEnv(env = process.env) {
  const raw = env.CHECK_ACTIONS_RERUN_STUCK;
  return typeof raw === 'string' && /^[1-9]\d*$/.test(raw);
}

/**
 * catch した値をログ用の 1 行にする。非 Error（文字列・null・オブジェクト）も落とさない。
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorReason(error) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  try {
    const json = JSON.stringify(error);
    if (typeof json === 'string') return json;
  } catch {
    // 循環参照など
  }
  try {
    return String(error);
  } catch {
    return 'unknown';
  }
}

/**
 * チェック名の集合を、比較できる 1 つの文字列にする純関数。
 * 件数ではなく集合で比べる（同数のまま中身が入れ替わる場合を取りこぼさない）。
 *
 * @param {Array<{name:string}>} checks
 * @returns {string}
 */
export function checkNameSet(checks) {
  return checks.map((c) => c.name).sort().join('\u0000');
}

/**
 * コマンド文字列が `git push` の実行を含むかを判定する純関数。
 * 多少の過検知は許す（リマインドが 1 回余分に出るだけで作業は止まらない）。
 *
 * @param {unknown} command
 * @returns {boolean}
 */
export function detectGitPush(command) {
  if (typeof command !== 'string' || command === '') return false;
  return /\bgit\b[^\n;&|]*\bpush\b/.test(command);
}

/**
 * hook の stdin（JSON）から `stop_hook_active` を読む純関数。
 * 読めないときは false（判定は行う）。
 *
 * @param {unknown} raw
 * @returns {boolean}
 */
export function readStopHookActive(raw) {
  return readHookField(raw, (payload) => payload.stop_hook_active === true) === true;
}

/**
 * hook の stdin（JSON）から `tool_input.command` を読む純関数。
 *
 * @param {unknown} raw
 * @returns {string | undefined}
 */
export function readToolCommand(raw) {
  const value = readHookField(raw, (payload) => payload.tool_input?.command);
  return typeof value === 'string' ? value : undefined;
}

function readHookField(raw, pick) {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (payload === null || typeof payload !== 'object') return undefined;
  try {
    return pick(payload);
  } catch {
    return undefined;
  }
}

const PASS_LINE = 'check-actions: HEAD のチェックはすべて成功しています。';
const EMPTY_LINE = 'check-actions: HEAD に対するチェックが 0 件です。対象のワークフローが無いものとして通します。';

/** 失敗したチェックの説明行を組み立てる */
function describeFailures(failed) {
  const lines = [`check-actions: 失敗しているチェックが ${failed.length} 件あります。`];
  for (const c of failed) {
    lines.push(`  - ${c.name}: ${c.conclusion}`);
    if (c.html_url) lines.push(`    ${c.html_url}`);
    const jobId = c.id ?? (typeof c.html_url === 'string' ? c.html_url.split('/').pop() : undefined);
    if (jobId) lines.push(`    gh run view --log-failed --job ${jobId}`);
  }
  return lines;
}

/** 取り残しの説明行。チェック名・条件 A/B・再実行コマンド（取れるとき） */
function describeStuck(stuck) {
  const names = stuck.map((c) => c.name).join(', ');
  const lines = [`check-actions: 取り残されたチェックがあります（${names}）。`];
  for (const c of stuck) {
    const labels = stuckConditions(c).join(' / ');
    lines.push(
      `  - ${c.name}: 条件 ${labels}（status=${c.status}, conclusion=${c.conclusion ?? 'null'}, run_status=${c.run_status ?? 'n/a'}）`,
    );
    if (c.run_id != null && c.run_id !== '') {
      lines.push(`    gh run rerun ${c.run_id}`);
    }
  }
  return lines;
}

function firstRunId(stuck) {
  for (const c of stuck) {
    if (c.run_id != null && c.run_id !== '') return c.run_id;
  }
  return undefined;
}

/**
 * 判定の本体。gh 呼び出し・時刻・待機・再実行は注入する。
 *
 * @param {object} input
 * @param {() => Promise<object[]>} input.fetchChecks - HEAD のチェック一覧を返す
 * @param {() => number} input.now - 現在時刻（ミリ秒）
 * @param {(ms:number) => Promise<void>} input.sleep - 待機
 * @param {number} [input.timeoutSec] - 未完了を待つ上限
 * @param {number} [input.pollIntervalSec] - 再取得の間隔
 * @param {number} [input.quietSec] - 「全部成功」を信じるまでに集合が変わらないことを求める秒数
 * @param {boolean} [input.stopHookActive] - 2 度目以降の停止か
 * @param {boolean} [input.rerunStuckEnabled] - CHECK_ACTIONS_RERUN_STUCK 相当。真なら最大 1 回再実行
 * @param {(runId: string|number) => Promise<unknown>} [input.rerunStuck] - `gh run rerun` 相当
 * @returns {Promise<{exit:0|2, lines:string[]}>}
 */
export async function decide({
  fetchChecks,
  now,
  sleep,
  timeoutSec = DEFAULT_TIMEOUT_SEC,
  pollIntervalSec = POLL_INTERVAL_SEC,
  quietSec = DEFAULT_QUIET_SEC,
  stopHookActive = false,
  isPushed = () => true,
  rerunStuckEnabled = false,
  rerunStuck,
}) {
  if (!isPushed()) {
    return { exit: 0, lines: ['check-actions: HEAD がリモートに無いため（未 push）、判定しません。'] };
  }

  const deadline = now() + timeoutSec * 1000;

  /** ブロックする。待つのは呼び出し側の判断で、ここは結論だけ返す */
  const halt = (lines) => ({
    exit: 2,
    lines: [...lines, 'check-actions: 結果を確認するまで完了と報告しないでください。'],
  });

  /** 停止ループ中。ブロックせずに通すが、状態は必ず述べる */
  const noteOnly = (lines) => ({
    exit: 0,
    lines: [
      ...lines,
      'check-actions: stop_hook_active のため、これ以上は停止をブロックしません（停止ループを作らない）。',
    ],
  });

  const describePending = (pending) => [
    `check-actions: 未確定のチェックが残っています（${pending.map((c) => c.name).join(', ')}）。`,
  ];

  let emptyTries = 0;
  /** 直前に観測したチェック名の集合と、それが現れた時刻。静穏期間の計測に使う */
  let settledNames = null;
  let settledSince = 0;
  /** 自動再実行は最大 1 回。2 回目は走らせない */
  let didRerunStuck = false;

  for (;;) {
    let checks;
    try {
      checks = await fetchChecks();
    } catch (error) {
      return {
        exit: 0,
        lines: [`check-actions: Actions の状態を取得できないため判定を飛ばします（${error.message}）。`],
      };
    }

    const result = classify(checks);

    // 2 度目以降の停止。待たずに、いまの状態を述べて通す。
    // ここで待つと「未確定のまま 8 分固まる」を停止のたびに繰り返してしまう。
    // 取り残しを成功メッセージに倒さない（stop_hook_active でも述べる）。
    if (stopHookActive) {
      if (result.verdict === 'block') return noteOnly(describeFailures(result.failed));
      if (result.verdict === 'stuck') return noteOnly(describeStuck(result.stuck));
      if (result.verdict === 'pending') return noteOnly(describePending(result.pending));
      if (result.verdict === 'empty') return { exit: 0, lines: [EMPTY_LINE] };
      return { exit: 0, lines: [PASS_LINE] };
    }

    if (result.verdict === 'block') {
      return halt(describeFailures(result.failed));
    }

    if (result.verdict === 'stuck') {
      const runId = firstRunId(result.stuck);
      if (
        rerunStuckEnabled
        && !didRerunStuck
        && runId != null
        && typeof rerunStuck === 'function'
      ) {
        try {
          await rerunStuck(runId);
          didRerunStuck = true;
          continue;
        } catch (error) {
          return halt([
            ...describeStuck(result.stuck),
            `check-actions: gh run rerun ${runId} に失敗しました（${errorReason(error)}）。`,
          ]);
        }
      }
      return halt(describeStuck(result.stuck));
    }

    if (result.verdict === 'pass') {
      // 別のワークフローの check-run が遅れて現れることがある。チェック名の集合が
      // 静穏期間ぶん変わらないことを確かめるまでは通さない。集合が変われば
      // 計測をやり直す（上限を過ぎたらそれ以上は待たない）。
      const names = checkNameSet(checks);
      if (names !== settledNames) {
        settledNames = names;
        settledSince = now();
      }
      if (now() - settledSince >= quietSec * 1000 || now() >= deadline) {
        return { exit: 0, lines: [PASS_LINE] };
      }
      await sleep(pollIntervalSec * 1000);
      continue;
    }

    if (result.verdict === 'empty') {
      if (emptyTries >= EMPTY_RETRIES) {
        return { exit: 0, lines: [EMPTY_LINE] };
      }
      emptyTries += 1;
      await sleep(pollIntervalSec * 1000);
      continue;
    }

    // pending
    if (now() >= deadline) {
      const names = result.pending.map((c) => c.name).join(', ');
      return halt([
        `check-actions: ${timeoutSec} 秒待っても未確定のチェックが残っています（${names}）。`,
        'check-actions: 未確定を成功として扱いません。CHECK_ACTIONS_TIMEOUT_SEC で上限を延ばせます。',
      ]);
    }
    await sleep(pollIntervalSec * 1000);
  }
}

/** HEAD がいずれかのリモート追跡ブランチに含まれるか（＝ push 済みか） */
export function isPushed() {
  try {
    const out = execFileSync('git', ['branch', '-r', '--contains', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out !== '';
  } catch {
    return false;
  }
}

/**
 * `gh api .../check-runs` の `--jq`。`.check_suite.id` は suite が null / 欠落だと
 * jq が落ち、fetchChecks 全体が例外になって gate が fail-open する。
 * `?.` なら null を返すだけなので判定を続けられる。
 */
export const CHECK_RUNS_JQ =
  '[.check_runs[] | {name, status, conclusion, html_url, id, check_suite_id: .check_suite?.id}]';

/** HEAD のチェック一覧を gh から取る。親 run の id / status を載せる（条件 B 用） */
export function parseActionsRunId(htmlUrl) {
  if (typeof htmlUrl !== 'string') return undefined;
  const match = htmlUrl.match(/\/actions\/runs\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

/**
 * 条件 B のための親 run 一覧が要るか。未完了が 1 件でもあれば要る。
 * すべて completed なら `actions/runs` を叩かない。
 *
 * @param {Array<{status?:string}|null|undefined>} checks
 * @returns {boolean}
 */
export function needsParentRunList(checks) {
  if (!Array.isArray(checks)) return false;
  return checks.some((c) => c != null && c.status !== 'completed');
}

/**
 * check-run に親 run の id / status を載せる純関数。runs が空なら URL から run_id だけ拾う。
 *
 * @param {object[]} checks
 * @param {Array<{id?:number, status?:string, check_suite_id?:number}>} [runs]
 * @returns {object[]}
 */
export function attachParentRuns(checks, runs = []) {
  const runBySuite = new Map();
  const runById = new Map();
  for (const run of runs) {
    if (run.check_suite_id != null) runBySuite.set(run.check_suite_id, run);
    if (run.id != null) runById.set(run.id, run);
  }
  return checks.map((c) => {
    const fromUrl = parseActionsRunId(c.html_url);
    const run = (c.check_suite_id != null ? runBySuite.get(c.check_suite_id) : undefined)
      ?? (fromUrl != null ? runById.get(fromUrl) : undefined);
    return {
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      html_url: c.html_url,
      id: c.id,
      run_id: run?.id ?? fromUrl,
      run_status: run?.status,
    };
  });
}

/**
 * 未完了があるときだけ親 run 一覧を取る。注入してテストする。
 *
 * @param {object[]} checks
 * @param {() => object[] | Promise<object[]>} [fetchParentRuns]
 * @returns {Promise<{checks: object[], fetchedParentRuns: boolean}>}
 */
export async function withParentRuns(checks, fetchParentRuns) {
  if (!needsParentRunList(checks)) {
    return { checks: attachParentRuns(checks, []), fetchedParentRuns: false };
  }
  if (typeof fetchParentRuns !== 'function') {
    return { checks: attachParentRuns(checks, []), fetchedParentRuns: false };
  }
  try {
    const runs = await fetchParentRuns();
    return { checks: attachParentRuns(checks, Array.isArray(runs) ? runs : []), fetchedParentRuns: true };
  } catch {
    return { checks: attachParentRuns(checks, []), fetchedParentRuns: true };
  }
}

async function fetchChecksFromGh() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const out = execFileSync(
    'gh',
    [
      'api',
      `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`,
      '--jq',
      CHECK_RUNS_JQ,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const checks = JSON.parse(out);
  const result = await withParentRuns(checks, () => {
    const runsOut = execFileSync(
      'gh',
      [
        'api',
        `repos/{owner}/{repo}/actions/runs?head_sha=${sha}&per_page=100`,
        '--jq',
        '[.workflow_runs[] | {id, status, check_suite_id}]',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(runsOut);
  });
  return result.checks;
}

function rerunStuckFromGh(runId) {
  execFileSync('gh', ['run', 'rerun', String(runId)], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

const sleepReal = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function positiveIntFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStdin() {
  // 対話端末から手で叩いたとき、EOF を待って固まらないようにする
  if (process.stdin.isTTY) return undefined;
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return undefined;
  }
}

async function main() {
  const raw = readStdin();

  if (process.argv.includes('--on-bash-post')) {
    const command = readToolCommand(raw);
    if (command === undefined) {
      console.error('check-actions: hook の stdin を読めないため、push 検知を飛ばします。');
      process.exit(0);
    }
    if (!detectGitPush(command)) process.exit(0);
    console.error('check-actions: push を検知しました。この push の GitHub Actions の結果を');
    console.error('確認するまで「完了」と報告しないでください（`gh pr checks <n>` など）。');
    process.exit(2);
  }

  const result = await decide({
    isPushed,
    fetchChecks: fetchChecksFromGh,
    now: () => Date.now(),
    sleep: sleepReal,
    timeoutSec: positiveIntFromEnv('CHECK_ACTIONS_TIMEOUT_SEC', DEFAULT_TIMEOUT_SEC),
    quietSec: positiveIntFromEnv('CHECK_ACTIONS_QUIET_SEC', DEFAULT_QUIET_SEC),
    stopHookActive: readStopHookActive(raw),
    rerunStuckEnabled: rerunStuckEnabledFromEnv(),
    rerunStuck: rerunStuckFromGh,
  });

  for (const line of result.lines) console.error(line);
  process.exit(result.exit);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
