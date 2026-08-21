# Progress: `0031-ci-env-isolated-tests`

- **Target Spec:** `task/0031-ci-env-isolated-tests/spec.md`
- **Branch:** `feature/ci-env-isolated-tests`
- **PR:** 未作成
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 実装 (`tests/progress-coupling.test.mjs` の CLI 起動 2 箇所を、CI 由来の環境変数を落とす形に揃える。共通ヘルパへの切り出しを検討)
- [ ] `env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` が全件 pass することの確認（push イベントの再現。出力を会話に貼る）
- [ ] `tools/check-progress-coupling.mjs` が無変更であることの確認（`git diff main -- tools/check-progress-coupling.mjs` が空）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。凍結対象 `tests/` の改訂であることと理由を本文に明記する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 00:00 - spec / progress を起草（spec-author）。`GITHUB_ACTIONS=true` での 2 件 fail の実測と、凍結改訂（`tests/`）の内容・理由を spec の「背景」に記録した。
