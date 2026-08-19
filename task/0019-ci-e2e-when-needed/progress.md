# Progress: GitHub CI で e2e を必要なときだけ回す

- **Target Spec:** `task/0019-ci-e2e-when-needed/spec.md`
- **Branch:** `feature/ci-e2e-when-needed`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`package.json` の `scripts` と `.github/workflows/ci.yml` を変更するため、実装 PR に `allow-protected-change` ラベルが要る。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/e2e-needed.test.mjs`、`tests/run-unit-tests.test.mjs`)
- [ ] 実装 (`tools/e2e-needed.mjs`、`tools/run-unit-tests.mjs`、`package.json` の `scripts`、`.github/workflows/ci.yml`、`CLAUDE.md`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。見た目の変更は無いためスクリーンキャプチャは添付しない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:05 - GitHub CI が毎回 Playwright を導入しているのが一番重い、という指摘から spec 化。ローカルの Verify ではなく CI の path 判定で間引く。未着手。
