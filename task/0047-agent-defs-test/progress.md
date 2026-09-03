# Progress: `0047-agent-defs-test`

- **Target Spec:** `task/0047-agent-defs-test/spec.md`
- **Branch:** `feat/0047-agent-defs-test`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/agent-defs.test.mjs`)
- [x] 実装 (なし。テスト新設のみ。`.claude/agents/` と既存 `tests/` は変更しない)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `21:03` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0047-agent-defs-test`）。完了条件 5〜9・失敗時・例を確定し、Complexity を `S` にした。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0047-agent-defs-test`。進捗の **PR** は実装 PR 用なので `未作成` のまま。
- `21:04` - 昇格用 docs PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/88 。進捗の **PR** には書かない（実装 PR 用）。人間のマージを待つ。
- `21:40` - `feat/0047-agent-defs-test` を main（PR #88 マージ後）から切り、`tests/agent-defs.test.mjs` だけを新設した。判定は本文を受け取る純関数 `checkCodexReviewerConventions`。欠落は一時ディレクトリ、削除・微修正・項目欠落・順番入れ替えは本文を渡して示した。実ファイルと runner・既存 `tests/`・`.claude/agents/` は変更していない。レビューは親が GitHub Copilot に依頼する（`codex review` の成功は求めない）。
- `21:40` - `node --test tests/agent-defs.test.mjs` の出力:

```
TAP version 13
# Subtest: 現状の .claude/agents/codex-reviewer.md で pass する
ok 1 - 現状の .claude/agents/codex-reviewer.md で pass する
  ---
  duration_ms: 2.177666
  ...
# Subtest: テストが読むパスに codex-reviewer.md が無いと失敗する（skip しない）
ok 2 - テストが読むパスに codex-reviewer.md が無いと失敗する（skip しない）
  ---
  duration_ms: 1.254709
  ...
# Subtest: 再実行禁止と実測なし非承認の事実が残る文言の微修正は pass する
ok 3 - 再実行禁止と実測なし非承認の事実が残る文言の微修正は pass する
  ---
  duration_ms: 0.158763
  ...
# Subtest: 現行ファイル相当の本文を微修正しても pass する
ok 4 - 現行ファイル相当の本文を微修正しても pass する
  ---
  duration_ms: 0.311938
  ...
# Subtest: 再実行禁止の節を削除した本文は fail する
ok 5 - 再実行禁止の節を削除した本文は fail する
  ---
  duration_ms: 0.264074
  ...
# Subtest: 再実行禁止の文だけを消した本文は fail する
ok 6 - 再実行禁止の文だけを消した本文は fail する
  ---
  duration_ms: 0.155199
  ...
# Subtest: 必須 4 項目名をこの順で含む本文は pass する
ok 7 - 必須 4 項目名をこの順で含む本文は pass する
  ---
  duration_ms: 0.086074
  ...
# Subtest: 4 項目名のうち 1 つを欠いた本文は fail する
ok 8 - 4 項目名のうち 1 つを欠いた本文は fail する
  ---
  duration_ms: 0.274151
  ...
# Subtest: 4 項目名の順番を入れ替えた本文は fail する
ok 9 - 4 項目名の順番を入れ替えた本文は fail する
  ---
  duration_ms: 0.229603
  ...
# Subtest: 親が実測 CI 結果を渡していないときの非承認ルールが消えていると fail する
ok 10 - 親が実測 CI 結果を渡していないときの非承認ルールが消えていると fail する
  ---
  duration_ms: 0.184284
  ...
# Subtest: 現行ファイルから非承認ルールだけを消すと fail する
ok 11 - 現行ファイルから非承認ルールだけを消すと fail する
  ---
  duration_ms: 0.217941
  ...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 46.070713
```
- `21:42` - `npm run ci` が eslint `preserve-caught-error` で失敗した。`loadCodexReviewerMarkdown` の ENOENT 例外に `{ cause: err }` を付けた。
- `21:44` - 再実行 `node --test tests/agent-defs.test.mjs` は 11 pass / 0 fail / 0 skipped。`npm run ci` は lint・lint:docs・test:unit 553 pass / 0 fail で成功（共通検証の全文は progress に貼らない）。
- `21:44` - `git diff main -- .claude/agents/` と `git diff main -- tools/run-unit-tests.mjs` は空。`tests/` の差分は未追跡の `tests/agent-defs.test.mjs` のみ。
