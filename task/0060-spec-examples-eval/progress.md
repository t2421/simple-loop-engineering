# Progress: `0060-spec-examples-eval`

- **Target Spec:** `task/0060-spec-examples-eval/spec.md`
- **Branch:** `feat/0060-spec-examples-eval`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/102
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/check-examples.test.mjs`)
- [x] 実装 (`tools/check-examples.mjs`、`loop-core/ledger/archive.mjs` への配線)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
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
- `03:07` - 実装。`tools/check-examples.mjs` と `tests/check-examples.test.mjs` を新設し、`loop-core/ledger/archive.mjs` が検査失敗でアーカイブしないよう配線した。`package.json` の `scripts`・`loop-core/bin/loop.mjs`・`tools/run-unit-tests.mjs`・既存テスト・0052 spec は触っていない。worktree `.worktrees/feat/0060-spec-examples-eval`。0046 は昇格済みで定性行のみ → 評価 0 件で終了コード 0。incomplete な 0046 型は fixture で対象外を確認。

```
$ grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md
18
```

```
$ node tools/check-examples.mjs 0052-loop-port-catalog-revision
検査: task/archive/0052-loop-port-catalog-revision/spec.md
合格: `grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md` — stdout 18
対象外: `grep -n '^### 2\.1[4-8] ' .claude/skills/loop-port/SKILL.md` — 期待結果を解釈できない（定性的）
合格: `grep -n '^### 2\.\(1[0-3]\|[1-9]\) ' .claude/skills/loop-port/SKILL.md \| wc -l` — stdout 13
合格: `grep -c '^出典: ' .claude/skills/loop-port/SKILL.md` — stdout 5
合格: `grep -c '^出典: task/archive/0044-second-project-port/notes/port-log\.md ' .claude/skills/loop-port/SKILL.md` — stdout 4
合格: `grep -c '^出典: task/0052-loop-port-catalog-revision/spec\.md' .claude/skills/loop-port/SKILL.md` — stdout 1
合格: `grep -c '^\*\*方針。\*\*' .claude/skills/loop-port/SKILL.md` — stdout 16
対象外: `grep -n '導入 PR を 1 本にまとめる' .claude/skills/loop-port/SKILL.md` — 期待結果を解釈できない（定性的）
対象外: `grep -n 'exit 2' .claude/skills/loop-port/SKILL.md` — 期待結果を解釈できない（定性的）
対象外: `grep -c 'allow-protected-change' .claude/skills/loop-port/SKILL.md` — 期待結果を解釈できない（定性的）
対象外: `git diff main...HEAD -- .claude/skills/loop-port/SKILL.md \| grep -c '^-[^-]'` — git diff の説明文は解釈しない
対象外: `git diff main...HEAD --stat -- . \| tail -1` — git diff の説明文は解釈しない
評価可能な行 6 件、合格 6、失敗 0、対象外 6
```

終了コード 0。

```
$ node tools/check-examples.mjs 0046-ci-evidence-freshness
検査: task/0046-ci-evidence-freshness/spec.md
対象外: `grep -n "HEAD" CLAUDE.md`（「トークンコスト」節） — 期待結果を解釈できない（定性的）
対象外: `grep -n -e HEAD -e リビジョン -e 未コミット .claude/agents/codex-reviewer.md`（「テスト結果の扱い」節） — 期待結果を解釈できない（定性的）
対象外: `grep -n "再実行しない" CLAUDE.md .claude/agents/codex-reviewer.md` — 期待結果を解釈できない（定性的）
対象外: `node --test tests/agent-defs.test.mjs` — 期待結果を解釈できない（定性的）
対象外: レビュー依頼。実測 CI の SHA がレビュー対象 HEAD と一致し、未コミットが無い（または有ることが明記されている） — 入力がシェルコマンド（バッククォートで始まる呼び出し）ではない
対象外: レビュー依頼。実測 CI に SHA が無い — 入力がシェルコマンド（バッククォートで始まる呼び出し）ではない
対象外: レビュー依頼。実測 CI の SHA がレビュー対象 HEAD と一致しない（実装を足したあとの古い緑） — 入力がシェルコマンド（バッククォートで始まる呼び出し）ではない
対象外: レビュー依頼。未コミットがある状態で取得したのにその旨が無い — 入力がシェルコマンド（バッククォートで始まる呼び出し）ではない
評価可能な行は 0 件です（検査成功）
```

終了コード 0。

```
$ node tools/check-examples.mjs 0099-missing
作業ディレクトリがありません: task/0099-missing/、task/archive/0099-missing/、backlog/0099-missing/
```

終了コード 1。

```
$ git diff main --stat
 loop-core/ledger/archive.mjs | 12 ++++++++++++
 1 file changed, 12 insertions(+)
```

（未追跡の `tools/check-examples.mjs`・`tests/check-examples.test.mjs`・本 progress は `git add` 前のため `--stat` に出ていない。）

```
$ npm run ci

> ci
> npm run lint && npm run lint:docs && npm run test:unit

> lint
> eslint .

> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。

> test:unit
> node tools/run-unit-tests.mjs

# tests 566
# pass 566
# fail 0
```

`node --test tests/check-examples.test.mjs` は `# tests 13` / `# pass 13` / `# fail 0`。0052 spec の期待値は書き換えていない。
- `03:08` - 実装 PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/102 。`allow-protected-change` は付けていない。
- `03:10` - CLI の不一致ケース（stderr に当該行と期待/実際）を `tests/check-examples.test.mjs` に足した。`archive` の例検査が throw したら `{ok:false}` で止める。`node --test tests/check-examples.test.mjs` は `# tests 14` / `# pass 14` / `# fail 0`。

```
$ npm run ci

> ci
> npm run lint && npm run lint:docs && npm run test:unit

> lint
> eslint .

> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。

> test:unit
> node tools/run-unit-tests.mjs

# tests 567
# pass 567
# fail 0
```

- `03:11` - Verify (外部): `codex-reviewer` は `codex` 不在（exit 127）で承認しない。差分は読んで Critical 0 / High 0 と書いたが、CLI 不在を代替承認にしてはいけないとのこと。`grok-reviewer` は `cursor-agent` 不在（exit 127）でレビュー未実施・承認しない。レビューチェックは開けたまま。PR は作成済み。
- `03:23` - push した HEAD `7ae23c0` の GitHub Actions:

```
e2e	pass	8s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832545809/job/100898383837
verify	pass	7m3s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832545809/job/100898384021
protected-paths	pass	9s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832545804/job/100898383872
progress-coupling	pass	6s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832545804/job/100898384025
preview	pass	2m5s	https://github.com/t2421/simple-loop-engineering/actions/runs/33832545795/job/100898384108
```

```
$ node loop-core/bin/loop.mjs check-actions
check-actions: HEAD のチェックはすべて成功しています。
```
- `04:54` - Copilot #102「Changes recommended」対応。`spawnSync(..., { shell: true })` を廃止し、allowlist（grep / wc / echo / true / false、`node tools/check-examples.mjs`）の argv を `shell: false` で実行。`;` `&&` `||` リダイレクト コマンド置換 `rm` は実行せず拒否。stdout-int の非 0 失敗に stderr を含め、不一致 detail は `JSON.stringify`。`node --test tests/check-examples.test.mjs` は `# tests 17` / `# pass 17` / `# fail 0`。`npm run ci` は `# tests 570` / `# pass 570` / `# fail 0`。0052 / 0046 / 0099 の期待は維持。
