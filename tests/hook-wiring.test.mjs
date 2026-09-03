/**
 * 配線の適合テスト。spec `task/0054-freeze-hook-wiring/spec.md` の「仕様」4 を実装する。
 *
 * ## 何を防ぐのか
 *
 * ガードの判定コードをすべて凍結しても、**呼び出し側**（`.claude/settings.json` の hook 登録）
 * を落とせばガードは呼ばれない。判定の所在を守っても、呼び出しの所在を守らなければ意味がない。
 * これは検証コマンドの `definedIn`（`package.json` の `scripts`）と同じ構造である。
 *
 * 人手で `GATE_HELPERS` に足す運用だと、hook を 1 つ増やしたときに凍結を足し忘れる。
 * 足し忘れても既存テストは全部通るので、**誰も気づかない**。だから
 * 「`.claude/settings.json` が実際に呼んでいるファイル」を実物から抽出して突き合わせる。
 *
 * ## 一覧を持たない
 *
 * このテストは対象パスの一覧を持たない。`hooks` の全キーを走査して抽出するので、
 * `UserPromptSubmit` など新しいイベントが足されても追従する。
 * **一覧を持つと、それ自体が同期し忘れる対象になる。**
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findViolations } from '../loop-core/gate/check-protected-paths.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = path.join(rootDir, '.claude', 'settings.json');

/** hook の配線そのもの。判定コードを守っても、ここを落とせばガードは呼ばれない */
const WIRING = '.claude/settings.json';

const empty = { changes: [] };

/**
 * `.claude/settings.json` を読む純関数。
 *
 * **例外を握りつぶさない。** 読めない・JSON でないときは投げてテストを落とす。
 * 握りつぶすと「設定が壊れているのでチェック対象ゼロ、よって合格」になる。
 *
 * @returns {object}
 */
function readSettings() {
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  return JSON.parse(raw);
}

/**
 * hook のコマンド文字列をすべて集める純関数。
 *
 * **イベント名を列挙しない。** `hooks` の全キーを走査する。
 *
 * `type: 'command'` のエントリで `command` が文字列でないものは**投げる**。
 * 黙って捨てると、配線の一部が静かに検査対象から外れる。
 * `readSettings` が例外を握りつぶさないのと同じ理由である。
 *
 * @param {object} settings
 * @returns {string[]}
 */
export function collectHookCommands(settings) {
  const entries = Object.values(settings.hooks ?? {})
    .flat()
    .flatMap((entry) => entry.hooks ?? []);
  const commands = [];
  for (const h of entries) {
    if (h.type !== undefined && h.type !== 'command') continue;
    if (typeof h.command !== 'string') {
      throw new Error(`hook の command が文字列ではありません: ${JSON.stringify(h)}`);
    }
    commands.push(h.command);
  }
  return commands;
}

/**
 * コマンド文字列から `$CLAUDE_PROJECT_DIR/<path>` の `<path>` を抜き出す純関数。
 *
 * `$CLAUDE_PROJECT_DIR/…` と `${CLAUDE_PROJECT_DIR}/…` の**両方**を拾う。
 * 片方だけだと、波括弧形に書き換えるだけで検査から静かに外れる。
 * `<path>` は空白・引用符（`"` `'` `` ` ``）の直前までとする。重複は除き、名前順に返す。
 *
 * @param {string[]} commands
 * @returns {string[]}
 */
export function extractProjectDirPaths(commands) {
  const found = new Set();
  for (const command of commands) {
    const re = /\$(?:CLAUDE_PROJECT_DIR|\{CLAUDE_PROJECT_DIR\})\/([^\s"'`]+)/g;
    for (const m of command.matchAll(re)) found.add(m[1]);
  }
  return [...found].sort();
}

// --- 純関数の単体 ---

test('collectHookCommands: hooks の全キーを走査する（イベント名を列挙しない）', () => {
  const commands = collectHookCommands({
    hooks: {
      Stop: [{ hooks: [{ command: 'a' }] }],
      // 将来のイベントを模した架空のキー。列挙式なら取りこぼす
      SomeFutureEvent: [{ hooks: [{ command: 'b' }, { command: 'c' }] }],
    },
  });
  assert.deepEqual(commands, ['a', 'b', 'c']);
});

test('collectHookCommands: hooks が無い設定でも落ちない（空を返す）', () => {
  assert.deepEqual(collectHookCommands({}), []);
});

test('extractProjectDirPaths: 引用符・空白の直前で切り、重複を除いて名前順に返す', () => {
  const paths = extractProjectDirPaths([
    'node "$CLAUDE_PROJECT_DIR/tools/b.mjs" --flag',
    "node '$CLAUDE_PROJECT_DIR/tools/a.mjs'",
    'node $CLAUDE_PROJECT_DIR/tools/b.mjs',
  ]);
  assert.deepEqual(paths, ['tools/a.mjs', 'tools/b.mjs']);
});

test('extractProjectDirPaths: ${CLAUDE_PROJECT_DIR}/ の波括弧形も拾う', () => {
  const paths = extractProjectDirPaths(['node "${CLAUDE_PROJECT_DIR}/tools/z.mjs"']);
  assert.deepEqual(paths, ['tools/z.mjs']);
});

test('collectHookCommands: command が文字列でないエントリは投げる（黙って捨てない）', () => {
  assert.throws(
    () => collectHookCommands({ hooks: { Stop: [{ hooks: [{ type: 'command' }] }] } }),
    /command が文字列ではありません/,
  );
});

// --- 実物の `.claude/settings.json` に対する適合 ---

test('.claude/settings.json は実在し、JSON として読める', () => {
  // 例外を握りつぶさない。読めなければここで落ちる
  const settings = readSettings();
  assert.equal(typeof settings, 'object');
  assert.notEqual(settings, null);
});

test('hook のコマンドから $CLAUDE_PROJECT_DIR のパスを 1 件以上抽出できる', () => {
  const paths = extractProjectDirPaths(collectHookCommands(readSettings()));
  // 空集合を合格にしない。正規表現が実態と食い違って何も取れないのを見逃す
  assert.ok(
    paths.length > 0,
    'hook のコマンドから $CLAUDE_PROJECT_DIR/<path> を 1 つも抽出できていない',
  );
});

test('hook から呼ばれるファイルは 1 つ残らず凍結対象に入っている', () => {
  const paths = extractProjectDirPaths(collectHookCommands(readSettings()));
  // 空集合ガードをこのテストの中にも置く。別ケースに任せると、paths が空のとき
  // ここは missing === [] で**空振り合格**する（スイート全体では別ケースが赤くなるが、
  // このテストだけを単体実行した人に誤った安心を与える）
  assert.ok(paths.length > 0, 'hook のコマンドからパスを 1 つも抽出できていない');

  const missing = [];
  for (const p of paths) {
    const v = findViolations({ ...empty, changes: [{ status: 'M', path: p }] });
    // **包含ではなく「ちょうど 1 件」を見る。** some() だと、対象の違反に加えて
    // 別の違反が混ざっても通ってしまい、spec が要求する 1 対 1 を強制できない
    if (v.length !== 1 || v[0].path !== p) missing.push(p);
  }
  assert.deepEqual(
    missing,
    [],
    `hook から呼ばれているのに凍結対象に無い: ${missing.join(', ')}`,
  );
});

test('hook の配線そのもの（.claude/settings.json）も凍結対象に入っている', () => {
  const v = findViolations({ ...empty, changes: [{ status: 'M', path: WIRING }] });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, WIRING);
});

test('hook から呼ばれるファイルが実在する（配線が切れていない）', () => {
  for (const p of extractProjectDirPaths(collectHookCommands(readSettings()))) {
    assert.equal(fs.existsSync(path.join(rootDir, p)), true, p);
  }
});
