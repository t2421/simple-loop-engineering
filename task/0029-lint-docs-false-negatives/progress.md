# Progress: `0029-lint-docs-false-negatives`

- **Target Spec:** `task/0029-lint-docs-false-negatives/spec.md`
- **Branch:** `feat/0029-lint-docs-false-negatives`
- **PR:** 未作成
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・完了条件の確認
- [ ] テストの作成 (`tests/lint-docs-false-negatives.test.mjs`。既存 `tests/lint-docs.test.mjs` は変更しない)
- [ ] 実装 (`tools/lint-docs.mjs` の `parseMetadata` / `checkSpecHeadings` / `checkBacklogCompletion`)
- [ ] 既存文書の再検証（リポジトリのルートで `node tools/lint-docs.mjs` が終了コード 0）
- [ ] 保護パス非接触の確認（`node tools/check-protected-paths.mjs main` が通る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `20:58` - 昇格を起草。2026-08-22 の 2 回目の backlog リファインメントで 3 件とも現存を実測確認し、人間が着手を決定。`backlog/0029-lint-docs-false-negatives/` を同じ ID のまま `task/0029-lint-docs-false-negatives/` へ `git mv` し、完了条件を記入、progress.md を作成。テストは append-only 制約により新規ファイル `tests/lint-docs-false-negatives.test.mjs` に置くと決定（`allow-protected-change` ラベル不要）。
