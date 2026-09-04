# Progress: `0046-ci-evidence-freshness`

- **Target Spec:** `task/0046-ci-evidence-freshness/spec.md`
- **Branch:** `feat/0046-ci-evidence-freshness`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (任意。検証の主は定義の grep と既存 `tests/agent-defs.test.mjs`。既存テストは変更しない。新規テストを置くなら `tests/` への追加のみ)
- [ ] 実装 (`CLAUDE.md`「トークンコスト」、`.claude/agents/codex-reviewer.md`「テスト結果の扱い」)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:48` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0046-ci-evidence-freshness`）。完了条件 5〜8・失敗時・例を確定した。判定の主は規約の文言（`CLAUDE.md`「トークンコスト」と `codex-reviewer.md`「テスト結果の扱い」）。機械的チェックは任意の新規テスト（既存 `tests/agent-defs.test.mjs` は変更しない）。実測 CI の SHA はレビュー対象 HEAD と一致すること。0047 の再実行禁止は弱めない。Complexity は `M`（対象が 2 ファイル。任意の新規テストを足すと 3。凍結改訂ではないので L ではない）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0046-ci-evidence-freshness`。この git ブランチは `docs/promote-0046-ci-evidence-freshness`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `00:49` - `npm run lint:docs` の出力:

```
> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。
```
- `00:50` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/93 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
