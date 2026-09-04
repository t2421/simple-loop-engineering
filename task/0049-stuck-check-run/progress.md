# Progress: `0049-stuck-check-run`

- **Target Spec:** `task/0049-stuck-check-run/spec.md`
- **Branch:** `feat/0049-stuck-check-run`
- **PR:** `https://github.com/t2421/simple-loop-engineering/pull/103`
- **Status:** `In Progress` (Phase: `Record`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/check-actions-stuck.test.mjs`)
- [x] 実装 (`loop-core/gate/check-actions.mjs`)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に実装 PR の URL を書く。`allow-protected-change` ラベルを付ける。ラベル無しで `protected-paths` が失敗し、ラベル付きで成功することを Actions の結果で確認する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:50` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0049-stuck-check-run`）。完了条件 5〜12・失敗時・例を確定した。対象パスは 0043 以降の `loop-core/gate/check-actions.mjs`（旧 `tools/check-actions.mjs` は使わない）。運用手順だけの案は 480 秒待機を止めないので採らず、判定本体の改訂にする。既定は案内（待たずに exit 2 + `gh run rerun`）。自動再実行は `CHECK_ACTIONS_RERUN_STUCK` で最大 1 回の任意。未確定を成功にしない。凍結改訂なので実装 PR は `allow-protected-change` + 人間のマージ。Complexity は `L`（凍結改訂と、条件 A/B・案内/再実行の設計判断）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0049-stuck-check-run`。この git ブランチは `docs/promote-0049-stuck-check-run`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `00:52` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/95 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `03:05` - 実装ブランチ `feat/0049-stuck-check-run` を現行 `origin/main`（`f9d248e`）から切り、worktree で着手した。#83 / #90 と他作業は触らない。
- `03:12` - `stuckConditions` / `classify` の `stuck` / `decide` の即ブロックと任意 1 回再実行を入れた。`PASSING_CONCLUSIONS` と `DEFAULT_TIMEOUT_SEC = 480` は変えていない。既存 `tests/check-actions.test.mjs` は未編集。新規 `tests/check-actions-stuck.test.mjs` は時刻・gh・再実行を注入する。`node --test tests/check-actions-stuck.test.mjs tests/check-actions.test.mjs` の出力:

```
# tests 41
# suites 0
# pass 41
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 62.234036
```
- `03:15` - `git diff origin/main -- tests/check-actions.test.mjs` は空。`package.json` の `scripts` と `.github/workflows/` に差分無し。旧 `tools/check-actions.mjs` は復活させていない。
- `03:17` - `npm run ci: exit 0`。
- `03:18` - 指名どおり `codex-reviewer` に依頼した。出力:

```
--: line 1: codex: command not found
```

npx `@openai/codex review --base main` は `401 Unauthorized`（未ログイン）。エージェント定義どおり独自レビューを承認の代用にしない。チェックは `[/]` のまま。進捗は Done にしない。アーカイブしない。
- `03:20` - 実装 PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/103 。**人間が `allow-protected-change` を付ける。** エージェントはラベルを付けない。ラベル無しでは Guard `protected-paths` が `loop-core/gate/check-actions.mjs` を違反として失敗する（正しい挙動・例 9）。
- `03:24` - 例 9 の Actions 実測（ラベル無し、HEAD `2fd8eb8`）。`gh pr checks 103` の出力:

```
protected-paths	fail	4s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832577019/job/100898474365	
e2e	pass	9s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832577014/job/100898474177	
preview	pass	7m22s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832577015/job/100898474570	
progress-coupling	pass	4s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832577019/job/100898474198	
verify	pass	1m34s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832577014/job/100898474303	
```

`protected-paths` ジョブ（run 33832577019）のログ。`PR_LABELS: []`。違反に `loop-core/gate/check-actions.mjs` が出る:

```
base（origin/main）の loop-core CLI で判定します。
保護パスの変更を 1 件検知しました:
  - loop-core/gate/check-actions.mjs: 検証の委譲先は変更も移動もできない

変更が正当なら、改訂内容と理由を spec に書いたうえで PR に allow-protected-change ラベルを付けてください。
```

例 10（ラベル付きで `protected-paths` 成功）は人間が `allow-protected-change` を付けたあとの再実行を待つ。
- `04:52` - PR #103 の Copilot 「Changes recommended」3 件を直した。`rerunStuckEnabledFromEnv` は `/^[1-9]\d*$/` のみ（`1x` は無効）。`rerunStuck` 失敗は `errorReason` で非 Error も文字列化。`actions/runs` は未完了チェックがあるときだけ取る（`needsParentRunList` / `withParentRuns`）。既存 `tests/check-actions.test.mjs` は未編集。エージェントは `allow-protected-change` を付けない。`node --test tests/check-actions-stuck.test.mjs tests/check-actions.test.mjs` の出力:

```
# tests 46
# suites 0
# pass 46
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 66.110736
```
- `04:55` - `npm run ci: exit 0`。
- `05:03` - PR #104 の progress 共通検証 lint に先立ち、docs lint 成功文と `npm run ci` / `N>=50` の集計 dump をこの進捗から外した。作業固有の `node --test tests/check-actions-stuck.test.mjs` の集計は残す。エージェントは `allow-protected-change` を付けない。
