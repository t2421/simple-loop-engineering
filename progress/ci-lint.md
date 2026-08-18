# Progress: Lint の導入

- **Target Spec:** `specs/ci-lint.md`
- **Branch:** `feature/ci-lint`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

前提: `specs/scripts-freeze-procedure.md` のマージ後に着手する（`scripts` の変更を伴うため）。

- [ ] Specの要件・受け入れ条件の確認
- [ ] ESLint の導入 (`eslint.config.mjs`、devDependency)
- [ ] `scripts.lint` の追加と `ci` への組み込み（改訂手続きに従う）
- [ ] 既存コードの lint 通過（挙動を変えない修正のみ）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。凍結対象に触れるため `allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
