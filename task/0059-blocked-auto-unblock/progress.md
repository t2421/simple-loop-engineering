# Progress: `0059-blocked-auto-unblock`

- **Target Spec:** `task/0059-blocked-auto-unblock/spec.md`
- **Branch:** `feat/0059-blocked-auto-unblock`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (自己)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task.test.mjs`。置くならヘルパー用の新規テスト)
- [x] 実装 (`loop-core/ledger/start-task.mjs`、置くなら同じ ledger の小さなヘルパー)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:49` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0059-blocked-auto-unblock`）。完了条件 5〜9・失敗時・例を確定した。場所は `loop-core/ledger/start-task.mjs`（0043 以降。`tools/start-task.mjs` ではない）。公開面は `node loop-core/bin/loop.mjs start-task`。解除述語は progress の `- **Unblock:** \`path-exists:<相対パス>\``。満たされた Blocked は選択可能。Status は書き換えない。実装は自動開始しない。解釈できない述語は Blocked のまま。検証は弱めない。Complexity は `M`（選択・述語パース・既存テストを残したままの追加）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0059-blocked-auto-unblock`。この git ブランチは `docs/promote-0059-blocked-auto-unblock`。進捗の **PR** は実装 PR 用なので `未作成` のまま。#83 / #90 には触れていない。
- `00:50` - `npm run lint:docs` の出力:

```
> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。
```
- `00:50` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/96 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `03:05` - 実装着手。`feat/0059-blocked-auto-unblock` を origin/main から切り、worktree `.worktrees/feat/0059-blocked-auto-unblock` で作業する。`loop-core/ledger/unblock.mjs` を新設し、`start-task.mjs` の選択だけを変える。Status は書き換えない。`loop-core/bin/loop.mjs` と `package.json` の scripts は触らない。#83 / #90 には触れていない。
- `03:04` - `npm run ci` の出力（末尾）:

```
> lint
> eslint .

> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。

> test:unit
> node tools/run-unit-tests.mjs

...
1..569
# tests 569
# suites 0
# pass 569
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 120476.570319
```

終了コード 0。
- `03:04` - `git diff origin/main --stat`（未追跡含む）:

```
 loop-core/ledger/start-task.mjs            |  39 ++++++-
 loop-core/ledger/unblock.mjs               | （新設）
 task/0059-blocked-auto-unblock/progress.md |   9 +-
 tests/start-task.test.mjs                  | 171 ++++++++++++++++++++++++++++-
 tests/unblock.test.mjs                     | （新設）
```

`loop-core/bin/loop.mjs`・`package.json`・凍結ヘルパー・`loop.manifest.json` は差分に無い。#83 / #90 には触れていない。
