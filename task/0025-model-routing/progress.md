# Progress: `0025-model-routing`

- **Target Spec:** `task/0025-model-routing/spec.md`
- **Branch:** `feature/model-routing`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/start-task.test.mjs` への追加)
- [ ] 実装 (`task/TEMPLATE-progress.md`、`tools/start-task.mjs`、`tools/lint-docs.mjs`、`.claude/agents/spec-author.md`、CLAUDE.md)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`・`0022-spec-author-agent`・`0023-lint-docs` のマージ後に着手する。テンプレート改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
