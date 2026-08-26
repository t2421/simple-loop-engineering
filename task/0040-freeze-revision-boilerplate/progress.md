# Progress: `0040-freeze-revision-boilerplate`

- **Target Spec:** `task/0040-freeze-revision-boilerplate/spec.md`
- **Branch:** `docs/0040-freeze-revision-boilerplate`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 実装 (`.claude/agents/spec-author.md` に「凍結改訂の標準完了条件」の規約を追記)
- [x] 完了条件 5〜7 の検証（該当行の `grep` 出力と、凍結対象に触れていない差分の提示）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 04:06 - backlog から昇格。置き場所を (a) `.claude/agents/spec-author.md` に確定し、完了条件を確定した。凍結対象に触れないため `allow-protected-change` ラベルは不要。
- `11:13` - `.claude/agents/spec-author.md` に `## 凍結改訂の標準完了条件` を追記し、宣言・理由・ラベル運用・標準完了条件の文の 4 点と、依頼文に指示が無くても織り込む旨を明記した。差分は `.claude/agents/spec-author.md` と この progress だけで、凍結対象は 1 つも含まない。
