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
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。凍結対象 `tests/` の改訂であることと理由を本文に明記する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 00:00 - spec / progress を起草（spec-author）。`GITHUB_ACTIONS=true` での 2 件 fail の実測と、凍結改訂（`tests/`）の内容・理由を spec の「背景」に記録した。
- 00:10 - 実装。環境変数を落とす処理を各テストの規律に任せると漏れるため、**形で防ぐ**方針を採った。CLI 起動の唯一の経路 `spawnCli(args, { cwd, env })` を作り、環境の組み立ては `cliEnv(extra)` に集約した（`CI_ENV_KEYS = ['GITHUB_HEAD_REF', 'GITHUB_ACTIONS']` を `extra` に明示が無ければ落とす）。既存の `runCli` は `spawnCli(['main'], ...)` の薄いラッパへ縮め、生の `spawnSync` を使っていた 2 箇所（`使い方:` / `差分を取得できませんでした`）も `spawnCli` 経由にした。assert の期待値は無変更。
- 00:20 - 検証（載せ替え前）。env 3 通り（なし / `GITHUB_ACTIONS=true` / `GITHUB_ACTIONS=true` + `GITHUB_HEAD_REF`）で `npm run ci` を実行し、いずれも `# pass 343  # fail 0` で同一結果。`env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` は `# pass 86  # fail 0`（旧 fail の `ok 52` / `ok 65` を含む）。差分は `tests/progress-coupling.test.mjs` に閉じており、`git diff main -- tools/check-progress-coupling.mjs` は空。
- `08:20` - **ブランチを origin/main へ載せ替えた。** このブランチは docs PR のマージ前（`d3a64bc`）から切られており、0031 の spec / progress を**自前で再追加**していた。そのため `origin/main` との差分で progress.md が `A` になり、**この作業自身が `progress-coupling` ゲートに落とされる**状態だった（実測: `実装（src/・tests/・tools/）を変更していますが … 更新が含まれていません` / `- task/0031-ci-env-isolated-tests/progress.md` / exit=1）。`git rebase --empty=drop origin/main` で載せ替え、重複していた docs コミット（`fdb29a4`）は spec.md の blob が main 側（`5a2ab88`）と同一だったため `skipped previously applied commit` として自動的に落ちた。載せ替え後の差分は `M task/0031-ci-env-isolated-tests/progress.md` と `M tests/progress-coupling.test.mjs` の 2 件のみ。ゲートを当て直して exit=0（`作業: 0031-ci-env-isolated-tests`）。
- `08:25` - 載せ替え後に再実測。完了条件 5・6 の前後比較は同一コマンド `env -u GITHUB_HEAD_REF GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` で、修正前（origin/main の版）が `# pass 84 / # fail 2`（`not ok 52` / `not ok 65`）、修正後が `# pass 86 / # fail 0`。`npm run ci` は env 3 通り（両方なし / `GITHUB_ACTIONS=true` のみ / 両方あり）でいずれも `# tests 343 / # pass 343 / # fail 0` と同一。完了条件 8 の `git diff origin/main...HEAD -- tools/check-progress-coupling.mjs` は空。`protected-paths` はラベル無しで `既存のテストの内容が変わっている` を検知し、`allow-protected-change` 付きで通過することも確認した（完了条件 9 の前提）。
- `08:30` - `codex-reviewer` の 1 回目で **承認**（Critical 0 / High 0 / Medium 0 / Low 0、指摘 0 件）。確認された点: (1) assert は 1 行も変わっておらず、追加された `PR_LABELS: '[]'` は最も厳しい側で、しかも `main()` は fail-closed → usage → diff 失敗の順に先に exit するため `readLabels()` に到達せず判定に影響しない。(2) 削除条件が `if (!(key in extra))` であり `in` は空文字でも true を返すため、`GITHUB_HEAD_REF: ''` を明示的に渡す fail-closed 確認テスト 2 件は従来どおり fail-closed 経路を踏んでいる（truthy 判定だったら素通しになっていた）。(3) CLI を起動する生の `spawnSync` は残っていない（残る `spawnSync` は `spawnCli` 内部と `git` ヘルパのみ）。(4) `tools/`・`.github/`・`package.json` は無変更。
