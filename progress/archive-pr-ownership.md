# Progress: アーカイブ時の PR 帰属の検証

- **Target Spec:** `specs/archive-pr-ownership.md`
- **Branch:** `feature/archive-pr-ownership`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`tools/archive.mjs` は凍結対象ではないため、`allow-protected-change` ラベルは不要の見込み。既存 `tests/archive.test.mjs` に手を入れるなら必要になる（新規テストファイルなら不要）。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成（`gh` を注入で差し替え、帰属判定の「例」5 行を網羅）
- [ ] 実装 (`tools/archive.mjs` の `checkPrWithGh` と `archive` の事前検査)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 15:15 - `archive-automation` のレビューで挙がった既知の限界（`gh pr view` の state しか見ないため、他リポジトリ・他ブランチのマージ済み PR URL でも通る）を、人間の判断で spec 化した。同 spec の範囲外としていたもの。未着手。
