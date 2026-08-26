# Progress: `0037-next-id-reservation`

- **Target Spec:** `task/0037-next-id-reservation/spec.md`
- **Branch:** `feat/0037-next-id-reservation`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task-claim.test.mjs`。既存の `tests/start-task.test.mjs` は凍結対象なので触らない)
- [x] 実装 (`tools/start-task.mjs` に `--claim <slug> [--in <task|backlog>]` を追加)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `04:07` - backlog から `task/0037-next-id-reservation/` へ昇格。完了条件を確定（`--claim` は `--in task` 既定で `task/` と `backlog/` の両方に対応、テストは一時ディレクトリを `rootDir` に渡して検証）し、progress を新規作成した。
- `11:13` - `tools/start-task.mjs` に `claimId` / `isValidSlug` / `CLAIM_PLACES` を追加し、CLI に `--claim <slug> [--in <task|backlog>]` を足した。テストは `tests/start-task-claim.test.mjs`（12 件）。既存の `tests/start-task.test.mjs` は触っていない。`npm run ci` は 413 件全通過。CLI の実挙動も一時 git リポジトリで確認した（採番 0042 → claim → 次の採番 0043、slug 衝突・不正 slug・不正 `--in` はいずれも何も作らず exit 1）。
