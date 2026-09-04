# Progress: `0059-blocked-auto-unblock`

- **Target Spec:** `task/archive/0059-blocked-auto-unblock/spec.md`
- **Branch:** `feat/0059-blocked-auto-unblock`
- **PR:** `https://github.com/t2421/simple-loop-engineering/pull/101`
- **Status:** `Done`
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task-unblock.test.mjs`・`tests/unblock.test.mjs`。既存 `tests/start-task.test.mjs` は保護のため未変更)
- [x] 実装 (`loop-core/ledger/start-task.mjs`、置くなら同じ ledger の小さなヘルパー)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:49` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0059-blocked-auto-unblock`）。完了条件 5〜9・失敗時・例を確定した。場所は `loop-core/ledger/start-task.mjs`（0043 以降。`tools/start-task.mjs` ではない）。公開面は `node loop-core/bin/loop.mjs start-task`。解除述語は progress の `- **Unblock:** \`path-exists:<相対パス>\``。満たされた Blocked は選択可能。Status は書き換えない。実装は自動開始しない。解釈できない述語は Blocked のまま。検証は弱めない。Complexity は `M`（選択・述語パース・既存テストを残したままの追加）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0059-blocked-auto-unblock`。この git ブランチは `docs/promote-0059-blocked-auto-unblock`。進捗の **PR** は実装 PR 用なので `未作成` のまま。#83 / #90 には触れていない。
- `00:50` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/96 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `03:05` - 実装着手。`feat/0059-blocked-auto-unblock` を origin/main から切り、worktree `.worktrees/feat/0059-blocked-auto-unblock` で作業する。`loop-core/ledger/unblock.mjs` を新設し、`start-task.mjs` の選択だけを変える。Status は書き換えない。`loop-core/bin/loop.mjs` と `package.json` の scripts は触らない。#83 / #90 には触れていない。
- `03:04` - `npm run ci`: exit 0
- `03:04` - `git diff origin/main --stat`（未追跡含む）:

```
 loop-core/ledger/start-task.mjs            |  39 ++++++-
 loop-core/ledger/unblock.mjs               | （新設）
 task/0059-blocked-auto-unblock/progress.md |   9 +-
 tests/start-task.test.mjs                  | 171 ++++++++++++++++++++++++++++-
 tests/unblock.test.mjs                     | （新設）
```

`loop-core/bin/loop.mjs`・`package.json`・凍結ヘルパー・`loop.manifest.json` は差分に無い。#83 / #90 には触れていない。
- `03:10` - 実装 PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/101 。進捗の **PR** に書いた。Verify (外部) へ。
- `03:06` - GitHub Actions の Guard / protected-paths が失敗: `tests/start-task.test.mjs: 既存のテストの内容が変わっている`。`tests/` は append-only（新規追加は `appeared`、既存ファイルの内容変更は禁止）。既存テストを元に戻し、0059 のケースは新規 `tests/start-task-unblock.test.mjs` へ移す。`tests/unblock.test.mjs` はそのまま。検証を弱めていない。
- `03:12` - 修正後の `node loop-core/bin/loop.mjs check-protected-paths origin/main`:

```
保護パスの変更はありません（5 件の差分を確認）。
```

終了コード 0。`git diff origin/main --stat`:

```
 loop-core/ledger/start-task.mjs            |  39 ++++-
 loop-core/ledger/unblock.mjs               | 107 +++++++++++++
 task/0059-blocked-auto-unblock/progress.md |  53 +++++-
 tests/start-task-unblock.test.mjs          | 248 +++++++++++++++++++++++++++++
 tests/unblock.test.mjs                     |  98 ++++++++++++
 5 files changed, 533 insertions(+), 12 deletions(-)
```

`tests/start-task.test.mjs` は差分に無い。
- `03:14` - `npm run ci`: exit 0
- `03:12` - Verify (外部) 1 回目。`codex` は PATH に無い（`command not found`、終了コード 127）。規定どおり承認しない。`--uncommitted` にはフォールバックしていない。
- `03:12` - Verify (外部) 2 回目。`npx --yes @openai/codex review --base main` は 401 Unauthorized（Missing bearer or basic authentication）。差分は見ていない。エージェント定義どおり **承認しない**。Status を `Blocked` にし、人間の Codex ログインまたは照合結果の扱い判断を待つ。実装差分は直していない。コマンド出力:

```
OpenAI Codex v0.153.2
--------
workdir: /workspace/.worktrees/feat/0059-blocked-auto-unblock
model: gpt-5.6-sol
provider: openai
approval: never
sandbox: read-only
session id: 01a06a66-e40e-7ec3-9421-3aba548dfc3d
--------
user
changes against 'main'
ERROR: unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: https://api.openai.com/v1/responses
codex
Review was interrupted. Please re-run /review and wait for it to complete.
```

終了コード 1。レビュー不承認は通算 2 回（上限 5）。追加の Fix は実装側には無い。PR は https://github.com/t2421/simple-loop-engineering/pull/101 。
- `03:17` - 人間が PR に Copilot レビューを依頼した。
- `03:19` - Copilot のレビュー（https://github.com/t2421/simple-loop-engineering/pull/101#pullrequestreview-5108871275 ）。GitHub 上の state は `COMMENTED`（APPROVED ではない）。本文は Approval recommended。Comments generated: 0。指摘は無い。実装は直していない。`codex-reviewer` のチェックは付けない（401 のまま。代替承認にはしない）。人間が依頼した Copilot が差戻し無しだったので、Codex 待ちの Blocked は解除し Status を `In Progress`（Phase: `Record`）へ戻す。HEAD `5451c14` の GitHub Actions は verify / e2e / protected-paths / progress-coupling / preview すべて pass。

```
### 🟢 Approval recommended

解除述語の解釈・選択条件・副作用（Status 非書換え）について新規テストで網羅されており、既存挙動（Blocked 除外）も維持されています。

- Files reviewed: 5/5 changed files
- Comments generated: 0
- Review effort level: Lite
```
- `05:05` - #104 の lint に備えて共通検証 dump を外した。docs lint 成功文と `npm run ci` の `# tests` / `# pass` / `# fail` 集計を削除し、`npm run ci`: exit 0 に置き換えた。作業固有の `node --test tests/start-task-unblock.test.mjs tests/unblock.test.mjs` は残す対象だったが、試行ログに集計クラスタは無かった。
