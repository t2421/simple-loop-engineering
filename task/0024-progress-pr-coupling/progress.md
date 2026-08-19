# Progress: `0024-progress-pr-coupling`

- **Target Spec:** `task/0024-progress-pr-coupling/spec.md`
- **Branch:** `feature/progress-pr-coupling`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/progress-coupling.test.mjs`)
- [ ] 実装 (`tools/check-progress-coupling.mjs`、`.github/workflows/guard.yml` へのジョブ追加)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`.github/workflows/` の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
