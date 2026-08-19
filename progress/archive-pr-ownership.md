# Progress: アーカイブ時の PR 帰属の検証

- **Target Spec:** `specs/archive-pr-ownership.md`
- **Branch:** `feature/archive-pr-ownership`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

既存 `tests/archive.test.mjs` の fixture 更新が必要になったため、`allow-protected-change` ラベルが要る（下記 16:55）。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成（`gh` を注入で差し替え、帰属判定の「例」5 行を網羅）
- [x] 実装 (`tools/archive.mjs` の `checkPrWithGh` と `archive` の事前検査)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 15:15 - `archive-automation` のレビューで挙がった既知の限界（`gh pr view` の state しか見ないため、他リポジトリ・他ブランチのマージ済み PR URL でも通る）を、人間の判断で spec 化した。同 spec の範囲外としていたもの。未着手。
- 16:45 - 着手。`feature/archive-pr-ownership` を main から切った。TDD で `tests/archive-ownership.test.mjs`（新規）を先に書き RED を確認。
- 16:48 - 実装。純関数 `readBranch` / `parsePrUrl` / `checkOwnership` を追加し、`checkPrWithGh` が `headRefName` も返すようにした。`getRepoWithGh`（`gh repo view --json nameWithOwner`）を足し、`archive()` に `getRepo` の注入口を設けた。判定はファイルを触る前に行う（既存の「条件を満たさなければ一切変更しない」を維持）。
- 16:50 - テストの自作バグを 1 件踏んだ。`prBeing({ head: undefined })` で「head を返さない PR」を作ったつもりが、既定引数 `head = 'feature/foo'` に潰されて head 付きになっていた。確認関数を直接組む形に直した。
- 16:55 - **既存の `tests/archive.test.mjs` が 8 件落ちた。** 原因は fixture 側で、PR URL が `https://github.com/o/r/pull/1`（実在しない owner/repo）であり、`getRepo` も注入していないため実際の `gh repo view` と突き合わされて帰属検証に落ちる。仕様どおりの挙動である。fixture を実在する形（`t2421/simple-loop-engineering`）に直し、確認関数が `headRefName` を返すようにし、各呼び出しに `getRepo` を注入した。「Status / Target Spec の行が無い進捗」のテストは帰属検証が先に走るため、fixture に `Branch` 行を足して本来の検査に到達するようにした。
- 16:57 - **`tests/` は凍結対象なので、この変更は改訂手続きに乗る。** 変更したのは fixture と注入口だけで、`assert` 行は 1 行も変えていない（`git diff` の `[-+]assert` が空）。検証を弱めていないことの根拠として PR 本文に貼る。`allow-protected-change` ラベルを付ける。
- 17:00 - 「例」5 行と「失敗時」4 件を実際の `gh` で検証。別リポジトリのマージ済み PR は `PR が別のリポジトリのものです: nodejs/node（このリポジトリは t2421/simple-loop-engineering）`、別ブランチは `PR の head ブランチが進捗の Branch と違います: feature/ci-lint（進捗は feature/archive-pr-ownership）`、Branch 欄なし・`gh repo view` 失敗もそれぞれ失敗し、いずれもファイルは動いていない。`npm run ci` は 130 pass / 0 fail（既存 117 + ownership 13）。
