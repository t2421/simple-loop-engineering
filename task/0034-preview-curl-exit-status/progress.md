# Progress: `0034-preview-curl-exit-status`

- **Target Spec:** `task/0034-preview-curl-exit-status/spec.md`
- **Branch:** `feat/0034-preview-curl-exit-status`
- **PR:** 未作成
- **Status:** Not Started (Phase: Plan)
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（凍結改訂であること、改訂理由が spec にあることを含む）
- [ ] 実装 (`.github/workflows/preview.yml` の `Verify deployed content`)
- [ ] 偽 curl によるローカル再現手順の実行（「例」の 2・3 行目。出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付け、人間のマージを待つ）
- [ ] preview ジョブの成功と `検証 OK:` の実測確認（完了条件 7）
- [ ] `protected-paths` ジョブがラベル無しで失敗し、ラベル付きで成功することの確認（完了条件 8）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 21:03 - spec-author が backlog から昇格（2026-08-22 の backlog リファインメントで `preview.yml:104-105` の現状を実測、人間が昇格を決定）。完了条件を確定し progress を新規作成。
