# Progress: `0031-ci-env-isolated-tests`

- **Target Spec:** `task/0031-ci-env-isolated-tests/spec.md`
- **Branch:** `feature/ci-env-isolated-tests`
- **PR:** 未作成
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 実装 (`tests/progress-coupling.test.mjs` の CLI 起動 2 箇所を、CI 由来の環境変数を落とす形に揃える。共通ヘルパへの切り出しを検討)
- [x] `env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` が全件 pass することの確認（push イベントの再現。出力を会話に貼る）
- [x] `tools/check-progress-coupling.mjs` が無変更であることの確認（`git diff main -- tools/check-progress-coupling.mjs` が空）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。凍結対象 `tests/` の改訂であることと理由を本文に明記する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 00:00 - spec / progress を起草（spec-author）。`GITHUB_ACTIONS=true` での 2 件 fail の実測と、凍結改訂（`tests/`）の内容・理由を spec の「背景」に記録した。
- 00:10 - 実装。環境変数を落とす処理を各テストの規律に任せると漏れるため、**形で防ぐ**方針を採った。CLI 起動の唯一の経路 `spawnCli(args, { cwd, env })` を作り、環境の組み立ては `cliEnv(extra)` に集約した（`CI_ENV_KEYS = ['GITHUB_HEAD_REF', 'GITHUB_ACTIONS']` を `extra` に明示が無ければ落とす）。既存の `runCli` は `spawnCli(['main'], ...)` の薄いラッパへ縮め、生の `spawnSync` を使っていた 2 箇所（`使い方:` / `差分を取得できませんでした`）も `spawnCli` 経由にした。assert の期待値は無変更。
- 00:20 - 検証。env 3 通り（なし / `GITHUB_ACTIONS=true` / `GITHUB_ACTIONS=true` + `GITHUB_HEAD_REF`）で `npm run ci` を実行し、いずれも `# pass 343  # fail 0` で同一結果。`env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` は `# pass 86  # fail 0`（旧 fail の `ok 52` / `ok 65` を含む）。差分は `tests/progress-coupling.test.mjs` に閉じており、`git diff main -- tools/check-progress-coupling.mjs` は空。
