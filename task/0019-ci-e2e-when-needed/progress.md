# Progress: GitHub CI で e2e を必要なときだけ回す

- **Target Spec:** `task/0019-ci-e2e-when-needed/spec.md`
- **Branch:** `feature/ci-e2e-when-needed`
- **PR:** 未作成
- **Status:** In Progress (Phase: Verify (外部))

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`package.json` の `scripts` と `.github/workflows/ci.yml` を変更するため、実装 PR に `allow-protected-change` ラベルが要る。チェッカーと委譲先の保護も同じ PR で行う。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/e2e-needed.test.mjs`、`tests/run-unit-tests.test.mjs`、`tests/gate-helpers.test.mjs`)
- [x] 実装 (`tools/e2e-needed.mjs`、`tools/run-unit-tests.mjs`、`package.json` の `scripts`、`.github/workflows/ci.yml`、`CLAUDE.md`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。見た目の変更は無いためスクリーンキャプチャは添付しない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:05 - GitHub CI が毎回 Playwright を導入しているのが一番重い、という指摘から spec 化。ローカルの Verify ではなく CI の path 判定で間引く。未着手。
- 05:15 - docs PR #24。`docs/ci-e2e-when-needed`。実装は `feature/ci-e2e-when-needed`。
- 05:25 - `ci` を lint + ユニットに再定義。`test:e2e` を分離。`verify` から Playwright 導入を外し、e2e ジョブを条件付きステップにした。`npm run ci` は 126 pass / 0 fail（のち gate-helpers 追加で 122）。出力に「数値を入力できる欄が 2 つある」は無い。`tests/calc-page.test.mjs` は main と byte 同一。`npm run test:e2e` は 28 pass / 0 fail。
- 05:28 - 完了条件 5 を精密化。当初「出力に calc-page が出ない」だと、パス判定テストの名前がヒットする。e2e 本体のアサーション名が出ない、に直した。
- 05:40 - `codex-reviewer` 不承認。High 2: (1) `run-unit-tests.mjs` が未保護だと scripts を触らずにユニットを空振りできる。(2) e2e ジョブが候補側の `e2e-needed.mjs` を実行すると、判定を false にして `src/` 変更と同時に間引ける。
- 05:50 - High 対応。委譲先 2 ファイルを CHECKER と同じく保護。`e2e-needed.mjs` からローカル import を外し、CI は base 版を一時ファイルで実行。spec の仕様・例と CLAUDE.md 一覧を追随。
