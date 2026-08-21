# Progress: `0025-model-routing`

- **Target Spec:** `task/0025-model-routing/spec.md`
- **Branch:** `feature/model-routing`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task.test.mjs` への追加)
- [x] 実装 (`task/TEMPLATE-progress.md`、`tools/start-task.mjs`、`tools/lint-docs.mjs`、`.claude/agents/spec-author.md`、CLAUDE.md)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`・`0022-spec-author-agent`・`0023-lint-docs` のマージ後に着手する。テンプレート改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `10:05` - 「例」4 行のテストを先に `tests/start-task.test.mjs` へ追加し、RED を確認（`formatStartTask` 未エクスポートで import 失敗）。lint 側の enum テストも `tests/lint-docs.test.mjs` に追加。
- `10:08` - `parseProgressMeta` に Complexity を足すのはやめ、`parseComplexity` を別に切った。既存テストが `assert.deepEqual(meta, { branch, status })` で戻り値の形そのものを期待しており、キーを増やすと既存の期待値を壊すため。
- `10:10` - 実装。対応表は `tools/start-task.mjs` の `COMPLEXITY_MODELS`（`S → haiku`・`M → sonnet`・`L → fable`）。未記載は `DEFAULT_COMPLEXITY = 'M'`。等級の検査は worktree に触る前に行い、不正なら何も作らず失敗する。出力の書式は `formatStartTask` に切り出してテスト可能にした。
- `10:12` - 後方互換の確認。lint の `COMPLEXITY_VALUES` は `METADATA_KEYS` に入れない（既存の進捗は 1 つも Complexity を持たず、必須にすると全作業が違反になる）。実測: `task/0024-progress-pr-coupling`・`task/0025-model-routing` はいずれも `Complexity=null -> model=sonnet`、`npm run lint:docs` は 30 件で違反 0、`node tools/start-task.mjs --next-id` は `0031` を出力。
- `10:16` - `npm run ci` が 249 tests / 249 pass / 0 fail で通過。
- `10:20` - `node tools/check-protected-paths.mjs main` の検知は 3 件（`task/TEMPLATE-progress.md`・`tests/start-task.test.mjs`・`tests/lint-docs.test.mjs`）。テスト 2 件は spec の完了条件 5 が「例」の網羅先を既存の `tests/start-task.test.mjs` と名指ししているため避けられない（既存の期待値は 1 つも変えておらず、追加だけ。`progressMd` は `complexity` 省略時に従来と同一の文字列を返す）。lint 側も `putValidLayout`・`runCli` などの既存ハーネスを使うため同ファイルに置いた。いずれも検証を強める追加で、`allow-protected-change` ラベルの対象。
