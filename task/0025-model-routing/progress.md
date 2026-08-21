# Progress: `0025-model-routing`

- **Target Spec:** `task/0025-model-routing/spec.md`
- **Branch:** `feature/model-routing`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/36
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task.test.mjs` への追加)
- [x] 実装 (`task/TEMPLATE-progress.md`、`tools/start-task.mjs`、`tools/lint-docs.mjs`、`.claude/agents/spec-author.md`、CLAUDE.md)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得（Critical 0 / High 0。Medium 2 件は同 PR で修正済み）
- [x] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`・`0022-spec-author-agent`・`0023-lint-docs` のマージ後に着手する。テンプレート改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `10:05` - 「例」4 行のテストを先に `tests/start-task.test.mjs` へ追加し、RED を確認（`formatStartTask` 未エクスポートで import 失敗）。lint 側の enum テストも `tests/lint-docs.test.mjs` に追加。
- `10:08` - `parseProgressMeta` に Complexity を足すのはやめ、`parseComplexity` を別に切った。既存テストが `assert.deepEqual(meta, { branch, status })` で戻り値の形そのものを期待しており、キーを増やすと既存の期待値を壊すため。
- `10:10` - 実装。対応表は `tools/start-task.mjs` の `COMPLEXITY_MODELS`（`S → haiku`・`M → sonnet`・`L → fable`）。未記載は `DEFAULT_COMPLEXITY = 'M'`。等級の検査は worktree に触る前に行い、不正なら何も作らず失敗する。出力の書式は `formatStartTask` に切り出してテスト可能にした。
- `10:12` - 後方互換の確認。lint の `COMPLEXITY_VALUES` は `METADATA_KEYS` に入れない（既存の進捗は 1 つも Complexity を持たず、必須にすると全作業が違反になる）。実測: `task/0024-progress-pr-coupling`・`task/0025-model-routing` はいずれも `Complexity=null -> model=sonnet`、`npm run lint:docs` は 30 件で違反 0、`node tools/start-task.mjs --next-id` は `0031` を出力。
- `10:16` - `npm run ci` が 249 tests / 249 pass / 0 fail で通過。
- `10:20` - `node tools/check-protected-paths.mjs main` の検知は 3 件（`task/TEMPLATE-progress.md`・`tests/start-task.test.mjs`・`tests/lint-docs.test.mjs`）。テスト 2 件は spec の完了条件 5 が「例」の網羅先を既存の `tests/start-task.test.mjs` と名指ししているため避けられない（既存の期待値は 1 つも変えておらず、追加だけ。`progressMd` は `complexity` 省略時に従来と同一の文字列を返す）。lint 側も `putValidLayout`・`runCli` などの既存ハーネスを使うため同ファイルに置いた。いずれも検証を強める追加で、`allow-protected-change` ラベルの対象。
- `10:35` - `codex-reviewer` のレビュー結果: **承認（Critical 0 / High 0、Medium 2）**。Medium 2 件は「同じ PR で直すなら再レビュー不要の範囲」との判定。以下で対応した。
- `10:40` - Medium-1（表引きが `Object.prototype` を素通りする）を修正。`COMPLEXITY_MODELS[grade]` は `constructor`・`toString`・`__proto__`・`valueOf`・`hasOwnProperty` を「表にある」と判定し、spec「失敗時」の「`S | M | L` 以外の値: 何も作成せず非 0 で終了する」に反して worktree を作り、モデル名として関数を渡していた。実測（修正前）: `constructor => function Object() { [native code] }`。`Object.hasOwn(COMPLEXITY_MODELS, grade)` に変更し、修正後は 5 値すべてが `Complexity が不正: <値>（S | M | L）` で失敗する。
- `10:45` - Medium-2（`parseComplexity` がコードフェンスの中を拾う）を修正。CLAUDE.md「報告の作法」により試行ログにコマンド出力を貼る運用があり、実測（修正前）で Complexity 未記載の進捗のフェンス内に `- **Complexity:** \`L\`` があると `parseComplexity => "L"` となり、既定の `M`（sonnet）ではなく fable にルーティングされた。`tools/lint-docs.mjs` の `linesOutsideFences` を **import して**フェンス解釈を 1 つにした（複製すると「lint は未記載と見るのに start-task は貼った値を読む」割れが残るため。`tools/archive.mjs` の複製は import できない事情によるもので、ここは同じ `tools/` 内から import できる）。修正後は `parseComplexity => null` / `model => sonnet`。
- `10:48` - `parseProgressMeta` も同じ `findMetaValue`（フェンス外のみ）に揃えた。実メタは文書先頭にあり最初の一致が勝つため現状の実害は無いが、同一ファイル内に 2 つの書式解釈を残さないため。既存 3 テストの期待値は変更していない（バッククォート有無・`(Phase: ...)` 接尾辞・欠落時 null はそのまま通過）。回帰確認として、フェンス内の `- **Branch:**`／`- **Status:**` を読まないテストを追加した。
- `10:52` - 指摘が塞がったことの実測。新規テスト 6 件を修正前の `tools/start-task.mjs`（HEAD）に対して実行すると 5 件が fail（残る 1 件「フェンスの外にあれば読む」は前後どちらでも pass する退行防止用）、修正後は 6 件すべて pass。
- `10:55` - 後方互換の再確認。実在する progress 23 件（`task/`・`task/archive/`・`progress/TEMPLATE.md`）の `Status`／`Branch`／`Complexity`／`model` を修正前後で突き合わせ、**差分なし**。既存分はすべて `Complexity=null -> model=sonnet` のまま。`npm run lint:docs` は 30 件で違反 0、`node tools/start-task.mjs --next-id` は `0031`。
- `10:58` - `npm run ci` が 255 tests / 255 pass / 0 fail で通過（追加 6 件を含む）。`node tools/check-protected-paths.mjs main` の検知は 3 件のままで増えていない。
- `05:10` - PR #36 を `allow-protected-change` ラベル付きで作成。PR 本文に、保護パス 3 件のうち `tests/lint-docs.test.mjs` だけが spec の記載範囲を超えている旨（レビュアーの申し送り）と、Medium 修正の過程で `parseProgressMeta` も同じフェンス解釈に揃えた旨（指示より範囲がわずかに広い）を明記した。
