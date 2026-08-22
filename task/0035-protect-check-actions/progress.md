# Progress: `0035-protect-check-actions`

- **Target Spec:** `task/0035-protect-check-actions/spec.md`
- **Branch:** `feat/0035-protect-check-actions`
- **PR:** 未作成
- **Status:** Not Started (Phase: Plan)
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（`.claude/skills/add-protected-path` を読んでから着手する）
- [ ] テストの作成 (`tests/gate-helpers.test.mjs` — 違反側 3 ケースと許可側 1 ケース。spec「例」の表に対応させる)
- [ ] 実装 (`tools/check-protected-paths.mjs` の `GATE_HELPERS` に 1 行 + コメント、`CLAUDE.md`「変えてはいけないもの」の一覧に 1 行)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。ラベル無しで `protected-paths` ジョブが失敗することを確認してから `allow-protected-change` ラベルを付け、成功に変わることを確認する — spec 完了条件 7）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec / progress を起草（spec-author）。0033 の「範囲外」から切り出された追随作業。守り方は `TEMPLATES` ではなく `GATE_HELPERS`（新規追加の許可と違反メッセージの整合のため）。ガードは base リビジョンで動くため、この PR 自身に新保護は効かない（マージ後から効く）。
