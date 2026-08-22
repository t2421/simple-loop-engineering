# Progress: `0027-guard-stderr-noise`

- **Target Spec:** `task/0027-guard-stderr-noise/spec.md`
- **Branch:** `feat/0027-guard-stderr-noise`
- **PR:** 未作成
- **Status:** Not Started (Phase: Plan)
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（凍結改訂であること、改訂理由が spec にあることを含む）
- [ ] テストの作成 (`tests/guard-stderr.test.mjs`。凍結済みの `tests/protected-paths.test.mjs` には触れない)
- [ ] 実装 (`tools/check-protected-paths.mjs` の `readBaseArchivedIds`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付け、人間のマージを待つ）
- [ ] `protected-paths` ジョブがラベル無しで失敗し、ラベル付きで成功することの確認（完了条件 8）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 21:03 - spec-author が backlog から昇格（2026-08-22 の backlog リファインメントで再現を実測、人間が昇格を決定）。完了条件を確定し progress を新規作成。
