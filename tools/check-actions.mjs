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
 * | 未完了が残る | 上限まで待つ（既定 8 分・CHECK_ACTIONS_TIMEOUT_SEC）。超過は「未確定」でブロック |
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
 * 手動実行: `node tools/check-actions.mjs`
 *           `echo '{"tool_input":{"command":"git push"}}' | node tools/check-actions.mjs --on-bash-post`
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
 * チェックの一覧を 4 通りに分類する純関数。
 *
 * @param {Array<{name:string,status:string,conclusion:string|null}>} checks
 * @returns {{verdict:'pass'|'block'|'pending'|'empty', failed?:object[], pending?:object[]}}
 */
export function classify(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return { verdict: 'empty' };
  const failed = checks.filter(
    (c) => c.status === 'completed' && !PASSING_CONCLUSIONS.includes(c.conclusion),
  );
  if (failed.length > 0) return { verdict: 'block', failed };
  const pending = checks.filter((c) => c.status !== 'completed');
  if (pending.length > 0) return { verdict: 'pending', pending };
  return { verdict: 'pass' };
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

/**
 * 判定の本体。gh 呼び出し・時刻・待機は注入する。
 *
 * @param {object} input
 * @param {() => Promise<object[]>} input.fetchChecks - HEAD のチェック一覧を返す
 * @param {() => number} input.now - 現在時刻（ミリ秒）
 * @param {(ms:number) => Promise<void>} input.sleep - 待機
 * @param {number} [input.timeoutSec] - 未完了を待つ上限
 * @param {number} [input.pollIntervalSec] - 再取得の間隔
 * @param {number} [input.quietSec] - 「全部成功」を信じるまでに集合が変わらないことを求める秒数
 * @param {boolean} [input.stopHookActive] - 2 度目以降の停止か
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
    if (stopHookActive) {
      if (result.verdict === 'block') return noteOnly(describeFailures(result.failed));
      if (result.verdict === 'pending') return noteOnly(describePending(result.pending));
      if (result.verdict === 'empty') return { exit: 0, lines: [EMPTY_LINE] };
      return { exit: 0, lines: [PASS_LINE] };
    }

    if (result.verdict === 'block') {
      return halt(describeFailures(result.failed));
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

/** HEAD のチェック一覧を gh から取る */
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
      '[.check_runs[] | {name, status, conclusion, html_url, id}]',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out);
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
  });

  for (const line of result.lines) console.error(line);
  process.exit(result.exit);
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
