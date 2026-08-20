# Progress: `0023-lint-docs`

- **Target Spec:** `task/0023-lint-docs/spec.md`
- **Branch:** `feature/lint-docs`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/lint-docs.test.mjs`)
- [x] 実装 (`tools/lint-docs.mjs`、`package.json` の `lint:docs` 追加)
- [x] 現状の docs 全件が lint を通ることの確認（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`package.json` scripts の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `05:20` - 着手前に現状の docs を調査。既存の書式ゆれを 2 種類見つけた。(1) `Status` の書き方が `` `Not Started` (Phase: `Plan`) `` / `Done` / `` `Done` `` の 3 通りある。(2) `task/archive/0001-math-add/progress.md` と `task/archive/0002-math-sub/progress.md` に **PR** 行が無い。
- `05:30` - `tests/lint-docs.test.mjs` を先に作成。`node --test tests/lint-docs.test.mjs` 実行 → `ERR_MODULE_NOT_FOUND`（`tools/lint-docs.mjs` が無い）で RED を確認。
- `05:40` - `tools/lint-docs.mjs` を実装し、`package.json` に `lint:docs` を追加して `ci` から呼ぶようにした。`node --test tests/lint-docs.test.mjs` 実行 → 26 tests, pass 26, fail 0 で GREEN。
- `05:45` - 書式ゆれ (1) はルール側で吸収した。`normalizeStatus()` が末尾の `(Phase: ...)` とバッククォートを落としてから 4 値と照合する。どれも同じ Status を指しており、区別しても検証は強まらないため。
- `05:46` - 書式ゆれ (2) はルール側では吸収せず、**そのパスの PR 行だけ**の例外として `LEGACY_PROGRESS_WITHOUT_PR` に列挙した。メタ情報 4 項目の要求を緩めると新しい進捗の抜けを見逃す。`task/` は凍結対象で後から PR 行を足せないため、例外を明示列挙する形にした。例外が横に広がらないこと（同じ形でも別パスなら違反すること）をテストで固定している。
- `05:47` - `npm run lint:docs` をリポジトリの現状に対して実行 → `docs の形式違反はありません（27 件の作業ディレクトリを確認）。` 終了コード 0。`npm run ci` 実行 → 210 tests, pass 210, fail 0、終了コード 0。
