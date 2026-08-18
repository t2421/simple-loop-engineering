# Progress: worktree による並列作業の導入

- **Target Spec:** `specs/parallel-worktrees.md`
- **Branch:** `feature/parallel-worktrees`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] CLAUDE.md への worktree 運用規約の追記（`.worktrees/` の gitignore 含む）
- [ ] 演習対象 2 作業の spec / progress 作成（例: `math-mul` / `math-div`）
- [ ] 2 worktree での並列実施と、各進捗ログへの worktree パス・ブランチの記録
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
