# Progress: `0045-codex-review-uncommitted-gap`

- **Target Spec:** `task/0045-codex-review-uncommitted-gap/spec.md`
- **Branch:** `feat/0045-codex-review-uncommitted-gap`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Implement`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (任意。検証の主は定義の grep と既存 `tests/agent-defs.test.mjs`。ヘルパーは置かない。新規テストは置かない)
- [x] 実装 (`.claude/agents/codex-reviewer.md` の「手順」)
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
- `22:00` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/91 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `22:10` - `feat/0045-codex-review-uncommitted-gap` を最新 `main`（PR #91 マージ後）から切り、`.claude/agents/codex-reviewer.md` の「手順」だけを直した。既定起動を `codex review --base main` にした。`--uncommitted` は未コミットの補足読みに限り、main からのコミットあり＋クリーンツリー、および base 解決失敗では黙って走らせない。差分 0 件は承認せず、書式で「見た」と「見ていない」を区別する。0047 の 3 事実（再実行禁止・実測 CI 必須・スキーマ 4 項目）は残した。新規テストは置かない。レビューは親が GitHub Copilot に依頼する（`codex review` の成功は求めない）。
