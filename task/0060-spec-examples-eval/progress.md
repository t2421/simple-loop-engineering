# Progress: `0060-spec-examples-eval`

- **Target Spec:** `task/0060-spec-examples-eval/spec.md`
- **Branch:** `feat/0060-spec-examples-eval`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/check-examples.test.mjs`)
- [ ] 実装 (`tools/check-examples.mjs`、`loop-core/ledger/archive.mjs` への配線)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:48` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0060-spec-examples-eval`）。完了条件 5〜10・失敗時・例を確定した。ツールは新設 `tools/check-examples.mjs`（appeared）。`ci`（`package.json` scripts）へは配線しない。`loop-core/ledger/archive.mjs` へ配線する（`GATE_HELPERS` 外。`allow-protected-change` は不要）。Complexity は `M`。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0060-spec-examples-eval`。この git ブランチは `docs/promote-0060-spec-examples-eval`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `00:50` - 「例」表の実行可能な行（リポジトリルート）:

```
$ grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md
18
```

終了コード 0。0052 の期待 `18` と一致。期待値は書き換えていない。`node tools/check-examples.mjs` は未実装（docs 昇格のため存在しない）。`0046-ci-evidence-freshness` は backlog のまま「例」が `<昇格時に記入>` で、この検査の必須対象にしない。`0099-missing` は task / archive / backlog のどれにも無い。
- `00:50` - `npm run lint:docs` の出力:

```
> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。
```
- `00:52` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/98 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `01:03` - push した HEAD `916e32a` の GitHub Actions:

```
e2e	pass	10s	https://github.com/t2421/simple-loop-engineering/actions/runs/33823678778/job/100871618007
preview	pass	7m20s	https://github.com/t2421/simple-loop-engineering/actions/runs/33823678777/job/100871637528
progress-coupling	pass	6s	https://github.com/t2421/simple-loop-engineering/actions/runs/33823678726/job/100871617605
protected-paths	pass	5s	https://github.com/t2421/simple-loop-engineering/actions/runs/33823678726/job/100871617517
verify	pass	11s	https://github.com/t2421/simple-loop-engineering/actions/runs/33823678778/job/100871617839
```
