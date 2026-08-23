# Progress: `0036-codex-sandbox-ci-noise`

- **Target Spec:** `task/0036-codex-sandbox-ci-noise/spec.md`
- **Branch:** `feat/0036-codex-sandbox-ci-noise`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 実装 (`.claude/agents/codex-reviewer.md` への規約追記)
- [ ] 完了条件 5・6 の grep 確認（出力を会話に貼る）
- [ ] 完了条件 7 の再現手順（実測 CI 結果あり／なしのレビュー依頼各 1 回）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `04:04` - backlog から `task/` へ昇格。対処 (a)（`.claude/agents/codex-reviewer.md` への規約追記）を採ると親が決定し、完了条件を確定した。0026 のアーカイブ済みにより依存は解消済み。
