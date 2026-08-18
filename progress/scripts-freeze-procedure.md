# Progress: 凍結ファイルの改訂手続き

- **Target Spec:** `specs/scripts-freeze-procedure.md`
- **Branch:** `feature/scripts-freeze-procedure`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] CLAUDE.md「変えてはいけないもの」への改訂手続きの追記
- [ ] `tools/setup-playwright.mjs` の作成と `package.json` への `pretest` 追加
- [ ] `tests/calc-page.test.mjs` からの Chromium 自己インストール分岐の削除（アサーションは不変）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。凍結対象に触れるため、ガード導入後は `allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。calc-page の試行ログ 16:30 以降（テスト内セットアップ分岐）が背景。未着手。
