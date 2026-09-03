# Progress: `0047-agent-defs-test`

- **Target Spec:** `task/0047-agent-defs-test/spec.md`
- **Branch:** `feat/0047-agent-defs-test`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/agent-defs.test.mjs`)
- [ ] 実装 (なし。テスト新設のみ。`.claude/agents/` と既存 `tests/` は変更しない)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `21:03` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0047-agent-defs-test`）。完了条件 5〜9・失敗時・例を確定し、Complexity を `S` にした。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0047-agent-defs-test`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
