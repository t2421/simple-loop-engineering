# Progress: 保護パス変更の CI ガード

- **Target Spec:** `specs/guard-protected-paths.md`
- **Branch:** `feature/guard-protected-paths`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/protected-paths.test.mjs`)
- [x] 実装 (`tools/check-protected-paths.mjs` / `.github/workflows/` のガードジョブ)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 10:30 - 波 2 として worktree `.worktrees/feature/guard-protected-paths`（ブランチ `feature/guard-protected-paths`、main から作成）で着手。`archive-automation` / `claude-md-slim` と並列。3 本はファイルが重ならない。
- 10:35 - TDD。`tests/protected-paths.test.mjs` を先に書き RED（fail 1）。`tools/check-protected-paths.mjs` に判定ロジックを純関数（`parseNameStatus` / `scriptsChanged` / `findViolations` / `hasAllowLabel`）として実装し GREEN（21 pass）。ワークフローは新規 `.github/workflows/guard.yml` として追加し、既存 `ci.yml` は触らない。
- 10:38 - `.github/workflows/guard.yml` の初版で `${{ github.base_ref }}` を `run:` に直接展開していた。コマンドインジェクションの定石を外していたため、`env:` 経由（`BASE_REF`）に直して `"origin/$BASE_REF"` と参照する形へ修正。
- 10:42 - spec の「例」7 行を実ブランチで再現。既存テスト期待値の変更・`scripts` の変更・`TEMPLATE.md` の変更を含む一時ブランチで 3 件検知して exit 1、`allow-protected-change` ラベルありで exit 0、内容同一の `specs/x.md → specs/archive/x.md` 移動（R100）で exit 0、この PR 自身（新規追加のみ）で exit 0。
- 10:44 - 「失敗時」も確認。存在しない base ref で exit 1（素通りさせない）、`PR_LABELS` が不正 JSON・空のいずれもラベル無し扱いで exit 1（安全側）。
- 10:45 - `npm run ci` は 83 pass / 0 fail（既存 62 + protected-paths 21）。既存テストの件数・結果は不変。
