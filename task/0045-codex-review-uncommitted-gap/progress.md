# Progress: `0045-codex-review-uncommitted-gap`

- **Target Spec:** `task/0045-codex-review-uncommitted-gap/spec.md`
- **Branch:** `feat/0045-codex-review-uncommitted-gap`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (任意。検証の主は定義の grep と既存 `tests/agent-defs.test.mjs`。ヘルパーは置かない)
- [ ] 実装 (`.claude/agents/codex-reviewer.md` の「手順」)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `21:58` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0045-codex-review-uncommitted-gap`）。完了条件 5〜9・失敗時・例を確定した。起動の既定は `codex review --base main`（または committed+uncommitted vs main を含む同等）。`--uncommitted` 単独は既定にしない。Complexity は `S`（変更はエージェント定義 1 ファイル。既存 `tests/agent-defs.test.mjs` が 0047 の 3 事実を守る。新規ヘルパーは不要。小さなテスト追加は任意）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0045-codex-review-uncommitted-gap`。この git ブランチは `docs/promote-0045-codex-review-uncommitted-gap`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `21:59` - `npm run lint:docs` の出力:

```
> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。
```
