# Progress: `0049-stuck-check-run`

- **Target Spec:** `task/0049-stuck-check-run/spec.md`
- **Branch:** `feat/0049-stuck-check-run`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/check-actions-stuck.test.mjs`)
- [ ] 実装 (`loop-core/gate/check-actions.mjs`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に実装 PR の URL を書く。`allow-protected-change` ラベルを付ける。ラベル無しで `protected-paths` が失敗し、ラベル付きで成功することを Actions の結果で確認する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:50` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0049-stuck-check-run`）。完了条件 5〜12・失敗時・例を確定した。対象パスは 0043 以降の `loop-core/gate/check-actions.mjs`（旧 `tools/check-actions.mjs` は使わない）。運用手順だけの案は 480 秒待機を止めないので採らず、判定本体の改訂にする。既定は案内（待たずに exit 2 + `gh run rerun`）。自動再実行は `CHECK_ACTIONS_RERUN_STUCK` で最大 1 回の任意。未確定を成功にしない。凍結改訂なので実装 PR は `allow-protected-change` + 人間のマージ。Complexity は `L`（凍結改訂と、条件 A/B・案内/再実行の設計判断）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0049-stuck-check-run`。この git ブランチは `docs/promote-0049-stuck-check-run`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `00:51` - `npm run lint:docs` の出力:

```
> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。
```
