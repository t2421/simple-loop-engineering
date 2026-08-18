# Progress: 保護パス変更の CI ガード

- **Target Spec:** `specs/guard-protected-paths.md`
- **Branch:** `feature/guard-protected-paths`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/protected-paths.test.mjs`)
- [ ] 実装 (`tools/check-protected-paths.mjs` / `.github/workflows/` のガードジョブ)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
