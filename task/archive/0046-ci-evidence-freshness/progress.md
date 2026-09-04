# Progress: `0046-ci-evidence-freshness`

- **Target Spec:** `task/archive/0046-ci-evidence-freshness/spec.md`
- **Branch:** `feat/0046-ci-evidence-freshness`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/100
- **Status:** `Done`
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (任意。検証の主は定義の grep と既存 `tests/agent-defs.test.mjs`。既存テストは変更しない。新規テストを置くなら `tests/` への追加のみ)
- [x] 実装 (`CLAUDE.md`「トークンコスト」、`.claude/agents/codex-reviewer.md`「テスト結果の扱い」)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:48` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0046-ci-evidence-freshness`）。完了条件 5〜8・失敗時・例を確定した。判定の主は規約の文言（`CLAUDE.md`「トークンコスト」と `codex-reviewer.md`「テスト結果の扱い」）。機械的チェックは任意の新規テスト（既存 `tests/agent-defs.test.mjs` は変更しない）。実測 CI の SHA はレビュー対象 HEAD と一致すること。0047 の再実行禁止は弱めない。Complexity は `M`（対象が 2 ファイル。任意の新規テストを足すと 3。凍結改訂ではないので L ではない）。**当時（昇格 docs PR #93。実装 PR #100 ではない）:** この PR は昇格（docs）だけ。実装はしない。実装 PR の予約ブランチは `feat/0046-ci-evidence-freshness`。この git ブランチは `docs/promote-0046-ci-evidence-freshness`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `00:49` - `npm run lint:docs`: exit 0。成功文は貼らない。
- `00:50` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/93 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `03:04` - `node loop-core/bin/loop.mjs start-task` が `0046-ci-evidence-freshness` を選び、ブランチ `feat/0046-ci-evidence-freshness` の worktree を作成した。実装: `CLAUDE.md`「トークンコスト」と `.claude/agents/codex-reviewer.md`「テスト結果の扱い」に鮮度の 3 事実（取得 SHA がレビュー対象 HEAD と一致、未コミット付き取得はその旨、一致が確認できないときは承認しない）を追加。0047 の再実行禁止・実測 CI 必須・スキーマ 4 項目の順は残した。任意の新規テスト `tests/ci-evidence-freshness.test.mjs` を追加（既存 `tests/agent-defs.test.mjs` は未変更）。
- `03:06` - 実装 PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/100 。マージしない。親が Copilot を依頼する。
- `03:08` - 完了条件の grep（トークンコスト / テスト結果の扱い / 再実行禁止）:

```
===== grep -n HEAD CLAUDE.md =====
196:- 実測の CI 結果には、取得時点のコミット SHA を添える。その SHA はレビュー対象の差分の HEAD と一致していなければならない。未コミットの変更がある状態で取得した結果は、その旨を添える
197:- 実測結果の SHA とレビュー対象 HEAD の一致が確認できないとき（SHA 欠落、不一致、未コミットの旨の欠落、曖昧）は承認しない。取り直しを求める
232:- `loop-core/gate/check-actions.mjs`（push した HEAD の GitHub Actions 結果の判定。Stop hook が委譲する。書き換えると、赤い・未確定の Actions のまま会話を終えられる）

===== grep -n -e HEAD -e リビジョン -e 未コミット .claude/agents/codex-reviewer.md =====
11:2. 次を実行し、出力をそのまま返す。既定の起動はこれである。読む差分は、作業ブランチが main から分岐して以降の全変更（コミット済み・未コミットを問わない）。
19:未コミット（staged / unstaged）があるときは、`--base main` のあと次を実行し、**それらの出力もそのまま返す**（`--base main` の出力だけを貼って未コミットを省略してはいけない）。
23:git diff HEAD
26:`git diff HEAD` は staged と unstaged の両方を含む。`git diff` だけは staged を落とすので、それだけを使ってはいけない。代わりに `git diff` と `git diff --cached` を両方走らせてもよい。必要なら補足として `codex review --uncommitted` も走らせ、その出力も貼る。**未コミットだけを見て実装を飛ばしてはいけない。**
51:実測の CI 結果には、取得時点のコミット SHA（リビジョン）がレビュー対象の差分の HEAD と一致していることを確認する。未コミットの変更がある状態で取得した結果は、その旨が書いてあることを確認する。SHA が無い、HEAD と一致しない、未コミットの旨が無い、対応が曖昧・欠落しているなど、一致が確認できないときは承認しない。取り直しを求める。

===== grep -n 再実行しない CLAUDE.md .claude/agents/codex-reviewer.md =====
CLAUDE.md:195:- **レビュアーはサンドボックス内で `npm run ci`・ユニットテスト・e2e を再実行しない。** read-only サンドボックスでは `mkdtemp` を使うテストが `EPERM` で失敗する。実装の欠陥ではなく環境要因であり、その切り分けと釈明が出力とトークンを浪費する。合否は親が貼った実測結果で判定する
.claude/agents/codex-reviewer.md:45:サンドボックス内で `npm run ci`・ユニットテスト・e2e を再実行しない。read-only サンドボックスでは `mkdtemp` を使うテストが `EPERM` で失敗し、それは実装の欠陥ではなく環境要因であって、その切り分けと釈明は出力とトークンの無駄だからである。
```
- `03:08` - `git diff main --stat`（既存 `tests/`・`loop-core/`・`package.json`・凍結リストは無し。新規は `tests/ci-evidence-freshness.test.mjs` のみ）:

```
 .claude/agents/codex-reviewer.md            |   2 +
 CLAUDE.md                                   |   2 +
 task/0046-ci-evidence-freshness/progress.md |   9 +-
 tests/ci-evidence-freshness.test.mjs        | 175 ++++++++++++++++++++++++++++
 4 files changed, 184 insertions(+), 4 deletions(-)
```
- `03:08` - `node --test tests/agent-defs.test.mjs`（0047 の 3 事実）: `# tests 11` `# pass 11` `# fail 0`
- `03:09` - 新規テスト初回は節抽出が `m` フラグの `$`（行末）で本文 1 行目までしか取れず fail。`extractMarkdownSection` から `m` を外して修正。再実行 `node --test tests/ci-evidence-freshness.test.mjs`: `# tests 9` `# pass 9` `# fail 0`
- `03:10` - 先の `npm run ci` は SHA `1640755ada6af364012329e4e227d10ac7e25c78` 上で、未コミットの `tests/ci-evidence-freshness.test.mjs` 抽出修正あり。`npm run ci: exit 0`。この進捗コミット後にクリーン HEAD で取り直す。
- `04:51` - Copilot #100 の 2 件: トークンコスト節削除の lookahead を `(?=\n## |$)` にし、SHA/HEAD 判定を compact + 大小無視にした。末尾節削除と `sha`/`head` のケースをテストに足した。`tests/agent-defs.test.mjs` は未変更。`node --test tests/ci-evidence-freshness.test.mjs tests/agent-defs.test.mjs`: `# tests 21` `# pass 21` `# fail 0`
- `05:03` - 共通検証 dump を削った（docs lint 成功文と `npm run ci` 全件集計）。作業固有の grep と `node --test` 小件は残した。
- `05:11` - Copilot「一致は不要」でもキーワードだけで pass する抜け。3 ヘルパに肯定要件と近傍の 不要/必要ない 拒否を足し、弱めた文言の回帰テストを追加。SHA/HEAD は大小無視のまま。`node --test tests/ci-evidence-freshness.test.mjs tests/agent-defs.test.mjs`: `# tests 22` `# pass 22` `# fail 0`
- `06:46` - `origin/main`（#99 0048 ほか）へ rebase。衝突なし。CLAUDE.md は 0048 の派生 docs PR 規約と 0046 の SHA/HEAD 鮮度を両方残した。
- `06:50` - Copilot: `removeMarkdownSection` を行頭 `## ` のみ・直前改行保持・フェンス内は対象外に。`00:48` を当時の昇格 docs PR と明示。`node --test tests/ci-evidence-freshness.test.mjs tests/agent-defs.test.mjs`: `# tests 23` `# pass 23` `# fail 0`
