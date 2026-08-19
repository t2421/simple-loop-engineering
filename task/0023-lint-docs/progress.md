# Progress: `0023-lint-docs`

- **Target Spec:** `task/0023-lint-docs/spec.md`
- **Branch:** `feature/lint-docs`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/lint-docs.test.mjs`)
- [ ] 実装 (`tools/lint-docs.mjs`、`package.json` の `lint:docs` 追加)
- [ ] 現状の docs 全件が lint を通ることの確認（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`package.json` scripts の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
