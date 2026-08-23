# Progress: `0037-next-id-reservation`

- **Target Spec:** `task/0037-next-id-reservation/spec.md`
- **Branch:** `feat/0037-next-id-reservation`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/start-task-claim.test.mjs`。既存の `tests/start-task.test.mjs` は凍結対象なので触らない)
- [ ] 実装 (`tools/start-task.mjs` に `--claim <slug> [--in <task|backlog>]` を追加)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `04:07` - backlog から `task/0037-next-id-reservation/` へ昇格。完了条件を確定（`--claim` は `--in task` 既定で `task/` と `backlog/` の両方に対応、テストは一時ディレクトリを `rootDir` に渡して検証）し、progress を新規作成した。
