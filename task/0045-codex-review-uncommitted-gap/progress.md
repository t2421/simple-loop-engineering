# Progress: `0045-codex-review-uncommitted-gap`

- **Target Spec:** `task/0045-codex-review-uncommitted-gap/spec.md`
- **Branch:** `feat/0045-codex-review-uncommitted-gap`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/92
- **Status:** `In Progress` (Phase: `Verify`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (任意。検証の主は定義の grep と既存 `tests/agent-defs.test.mjs`。ヘルパーは置かない。新規テストは置かない)
- [x] 実装 (`.claude/agents/codex-reviewer.md` の「手順」)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
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
- `22:15` - 実装 PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/92 。Status は `In Progress`（Phase: `Verify`）。Done / アーカイブはしない。
- `22:15` - `grep -n "codex review --base main" .claude/agents/codex-reviewer.md`:

```
14:codex review --base main
```

- `22:15` - `grep -n "codex review --uncommitted" .claude/agents/codex-reviewer.md`:

```
17:`--base` と `--uncommitted` は同時に使えない。`--base main` はコミット済み（vs main）を読む。未コミットがあるときは、そのあと未コミット分も読む（`git status` / `git diff`、必要なら補足として `codex review --uncommitted`）。**未コミットだけを見て実装を飛ばしてはいけない。**
19:`codex review --uncommitted` を黙って走らせてはいけない:
```

- `22:15` - `grep -n "承認しない" .claude/agents/codex-reviewer.md`:

```
22:- base（main）の解決に失敗したとき。黙って `--uncommitted` にフォールバックせず、明示的に失敗して承認しない。差分が取れない旨を報告する。「指摘ゼロ」とは書かない。
24:解決した差分が 0 件（空／取得失敗）のとき、承認しない。差分が取れない／空である旨を報告する。「指摘が無い」とは書かない。
40:親が実測の CI 結果を渡していないときは承認しない。実測結果の提示を求める。
91:`codex` が無い、未ログイン、失敗したときは承認しない。進捗を Blocked にし、コマンド出力を残す。
99:同じレビュアーへの不承認が試行ログ上すでに 5 回ある、または今回が 5 回目でまだ Critical / High が残るときは承認しない。追加の Fix を指示せず、進捗を `Blocked` にする。人間の判断を待つ。
```

- `22:15` - `node --test tests/agent-defs.test.mjs` の出力:

```
TAP version 13
# Subtest: 現状の .claude/agents/codex-reviewer.md で pass する
ok 1 - 現状の .claude/agents/codex-reviewer.md で pass する
  ---
  duration_ms: 2.659172
  ...
# Subtest: テストが読むパスに codex-reviewer.md が無いと失敗する（skip しない）
ok 2 - テストが読むパスに codex-reviewer.md が無いと失敗する（skip しない）
  ---
  duration_ms: 1.16316
  ...
# Subtest: 再実行禁止と実測なし非承認の事実が残る文言の微修正は pass する
ok 3 - 再実行禁止と実測なし非承認の事実が残る文言の微修正は pass する
  ---
  duration_ms: 0.164244
  ...
# Subtest: 現行ファイル相当の本文を微修正しても pass する
ok 4 - 現行ファイル相当の本文を微修正しても pass する
  ---
  duration_ms: 0.340636
  ...
# Subtest: 再実行禁止の節を削除した本文は fail する
ok 5 - 再実行禁止の節を削除した本文は fail する
  ---
  duration_ms: 0.286761
  ...
# Subtest: 再実行禁止の文だけを消した本文は fail する
ok 6 - 再実行禁止の文だけを消した本文は fail する
  ---
  duration_ms: 0.154669
  ...
# Subtest: 必須 4 項目名をこの順で含む本文は pass する
ok 7 - 必須 4 項目名をこの順で含む本文は pass する
  ---
  duration_ms: 0.084563
  ...
# Subtest: 4 項目名のうち 1 つを欠いた本文は fail する
ok 8 - 4 項目名のうち 1 つを欠いた本文は fail する
  ---
  duration_ms: 0.309817
  ...
# Subtest: 4 項目名の順番を入れ替えた本文は fail する
ok 9 - 4 項目名の順番を入れ替えた本文は fail する
  ---
  duration_ms: 0.256298
  ...
# Subtest: 親が実測 CI 結果を渡していないときの非承認ルールが消えていると fail する
ok 10 - 親が実測 CI 結果を渡していないときの非承認ルールが消えていると fail する
  ---
  duration_ms: 0.212887
  ...
# Subtest: 現行ファイルから非承認ルールだけを消すと fail する
ok 11 - 現行ファイルから非承認ルールだけを消すと fail する
  ---
  duration_ms: 0.290204
  ...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 52.413915
```
