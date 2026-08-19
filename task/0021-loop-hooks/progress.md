# Progress: `0021-loop-hooks`

- **Target Spec:** `task/0021-loop-hooks/spec.md`
- **Branch:** `feature/loop-hooks`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/guard-worktree.test.mjs`)
- [ ] 実装 (`tools/guard-worktree.mjs`、`.claude/settings.json`)
- [ ] Stop hook の実セッションでの動作確認（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`（ブロック時の誘導先）。
