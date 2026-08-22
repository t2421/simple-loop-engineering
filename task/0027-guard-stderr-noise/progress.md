# Progress: `0027-guard-stderr-noise`

- **Target Spec:** `task/0027-guard-stderr-noise/spec.md`
- **Branch:** `feat/0027-guard-stderr-noise`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/56
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認（凍結改訂であること、改訂理由が spec にあることを含む）
- [x] テストの作成 (`tests/guard-stderr.test.mjs`。凍結済みの `tests/protected-paths.test.mjs` には触れない)
- [x] 実装 (`tools/check-protected-paths.mjs` の `readBaseArchivedIds`)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付け、人間のマージを待つ）
- [x] `protected-paths` ジョブがラベル無しで失敗し、ラベル付きで成功することの確認（完了条件 8）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 21:03 - spec-author が backlog から昇格（2026-08-22 の backlog リファインメントで再現を実測、人間が昇格を決定）。完了条件を確定し progress を新規作成。
- `05:30` - 実装。`readBaseArchivedIds` の `git ls-tree` に `stdio: ['ignore', 'pipe', 'ignore']` を足し、この 1 呼び出しの stderr だけを捨てた。何を防ぐか（判定は正しいのに `fatal:` が CI ログに出て失敗と誤読される）と、他の git 呼び出しの stderr を残す理由（fail-closed の説明として意図的）をコメントに書いた。判定・終了コード・catch の挙動は 1 文字も変えていない。
- `05:32` - テストは新規 `tests/guard-stderr.test.mjs` に置いた。凍結済みの `tests/protected-paths.test.mjs` には触れていない。1 件目は base に `task/archive` が無い一時リポジトリでガードを実行し、stderr に `fatal:` も `task/archive` も出ないこと・exit 0・stdout の判定メッセージを検証する。2 件目は「抑止したのは表示だけで判定は変わっていない」ことを、アーカイブ済み ID の再利用が違反として検知されることで示す。
- `05:34` - 実測。新規テストは 2 pass・0 fail。**凍結済みの `tests/protected-paths.test.mjs` は無変更のまま 81 pass・0 fail。** 一時リポジトリでの再現は、修正後は `保護パスの変更はありません（1 件の差分を確認）。` と `exit=0` だけで `fatal:` が出ない（修正前は同じ手順で `fatal: Not a valid object name …:task/archive` が出ていた）。`npm run ci` は fail 0。ガードはラベル無しで exit 1、`allow-protected-change` 付きで exit 0。出力は会話に貼った。
- `06:05` - **Verify (外部) 1 回目: 不承認。Critical 0 件・High 1 件。** 指摘は実装ではなく**この progress.md の更新漏れ**だった。実装だけをコミットしたため、CI の `progress-coupling` ジョブが「実装を変更しているのに進行中の作業の progress.md の更新が含まれていない」と判定して exit 1 になる。レビュアーが `GITHUB_HEAD_REF` を与えて実際に再現している。CLAUDE.md「コミットとマージ」の「progress の更新 → 実装と同じ PR に含める」に反していた。この記入で解消する。コードには手を入れない（実装・テストとも spec 準拠と判定された）。
- `06:06` - レビュアーの Low 2 件は対応しない。(1) `stdio` 抑止はこの `ls-tree` の全失敗を不可視にするが、`mergeBase` は先行する `git merge-base` が fail-closed で `exit 1` するため base ref 不正はここへ到達しない（spec の「失敗時」と整合）。(2) テスト 2 件目は「base に archive が無い」経路そのものは通らないが、判定不変の主たる根拠はテスト 1 件目と凍結済みテストの全件通過が担っている。
- `06:40` - **Verify (外部) 2 回目: 承認。Critical 0 件・High 0 件・Medium 0 件・Low 0 件。** 前回の High（progress 更新漏れ）は解消と確認された。レビュー側は試行ログに書いた数値を自分で再実行して照合し（新規テスト 2 pass、凍結済み 81 pass、ガード両方向）、`tests/` と `tools/` の差分が前回から 1 バイトも変わっていないこと（コード無変更の申告どおり）も確かめている。codex は `stdio: ['ignore','pipe','ignore'] `の下でも `execFileSync` の戻り値が文字列で返る（＝判定に使う stdout は失われない）ことを実地で確認した。`node tools/e2e-needed.mjs main` は `needed=false` で、見た目の変更が無いことと整合する。
- `07:10` - PR #56 を作成。`verify`・`e2e`・`preview`・`progress-coupling` は pass、`protected-paths` はラベル無しのため failure（意図どおり）。
- `07:12` - **完了条件 8 を CI 上で実測。同一 SHA `2c92639` で赤 → 緑を確認した。** `20:26:03` の Guard 実行が failure（ラベル無し）、`allow-protected-change` を付けた `20:27:14` の再判定が success。人間がラベルを付けてマージした。
