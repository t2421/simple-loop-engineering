# Progress: `0026-review-output-schema`

- **Target Spec:** `task/0026-review-output-schema/spec.md`
- **Branch:** `feat/0026-review-output-schema`
- **PR:** 未作成
- **Status:** Not Started (Phase: Plan)
- **Complexity:** M

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] `.claude/agents/codex-reviewer.md` に出力スキーマ・Critical 列挙・テスト提案規則・スキーマ違反時の扱いを追記
- [ ] `.claude/agents/visual-design-reviewer.md` に出力スキーマ・Critical 列挙・テスト提案規則・スキーマ違反時の扱いを追記
- [ ] 完了条件 5〜8 の `grep` 検証（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 2026-08-22 - backlog から昇格。2026-08-22 の実測（レビュー 6 回で subagent トークン約 60 万、うち 2 回で出力が無害化により変形）を受けて着手を決定。スキーマ範囲・Critical 列挙粒度・テスト提案規則の 3 点は人間が判断済み（spec の背景に記載）。
