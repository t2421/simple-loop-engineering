# Progress: `0053-stop-hook-block-exit-code`

- **Target Spec:** `task/0053-stop-hook-block-exit-code/spec.md`
- **Branch:** `feat/0053-stop-hook-block-exit-code`
- **PR:** `https://github.com/t2421/simple-loop-engineering/pull/79`
- **Status:** `In Progress` (Phase: `Record`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 修正前のバグ再現（spec「背景」の再現手順 1〜5 を実行し、`exit=1` の出力を試行ログに貼る。手順 2 の一時的な破壊は戻す）
- [x] テストの作成 (`tests/stop-hook-exit-code.test.mjs`。spec「例」の 1〜5 行目。`tests/stop-hook-ci-dir.test.mjs` の fixture・`stopHookCommand()`・`runHook()` の形にならう。修正前に RED を確認して出力を試行ログに貼る)
- [x] 実装 (`.claude/settings.json` の `hooks.Stop[0].hooks[0].command`。`npm run ci 1>&2` を `{ npm run ci 1>&2 || exit 2; }` に置き換える。command は 1 本のまま)
- [x] 修正後の実リポジトリでの実測（spec「例」の 6・7 行目。健全時 `exit=0` と `check-actions:` 行、検証を壊したとき `exit=2` と `check-actions:` 行なし。出力を試行ログに貼り、一時的な破壊は戻す）
- [x] 凍結対象の無変更確認（`git diff --stat main -- tests/stop-hook-ci-dir.test.mjs tools/check-actions.mjs tools/stop-hook-ci-dir.mjs` が空であることを試行ログに貼る）
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec と progress を起草（Not Started）。出典は `task/archive/0044-second-project-port/notes/port-log.md` 4 節 (c) の申し送り。
- `16:20` - 着手。`.worktrees/feat/0053-stop-hook-block-exit-code` を main から切り、`npm ci`。spec の完了条件を確認
- `16:30` - 修正前の再現。テストを先に書いて RED を取った。**健全な経路（例1・例4）は通り、「検証が落ちたときに止める」経路だけが落ちる**という形で出たので、バグの範囲が仕様どおりであることも同時に確認できた

```
ok 1 - 例1: ci が通れば終了コード 0 で、check-actions まで到達する
not ok 2 - 例2: ci が exit 1 なら hook は終了コード 2（1 ではない）で、check-actions を実行しない
    2 = セッションをブロックする。1 は非ブロッキングで止まらない
  expected: 2   actual: 1
not ok 3 - 例3: ci の終了コードが 3 でも 2 に正規化する
  expected: 2   actual: 3
ok 4 - 例4: check-actions の終了コードは素通しする（ci が通ったとき）
not ok 5 - 例5: 修正前のコマンドでは終了コード 1 になる（このテストが検知するバグそのもの）
# tests 5  # pass 2  # fail 3
```

  例3 の `actual: 3` が、`npm run ci` の終了コードがそのまま漏れていることの直接の証拠である。
- `16:35` - **失敗 2 件（どちらもテスト側の fixture。実装ではない）。**
  1. `.mjs` のスタブに `require` を書いて `ReferenceError: require is not defined in ES module scope`。npm script（`node -e`）は CJS、`.mjs` ファイルは ESM なので書き分ける
  2. `node -e "..."` の中に `JSON.stringify(marker)` を埋めたためクォートが入れ子になり、**シェルが黙って exit 1 を返した**。健全なはずの例1 まで RED になり、一瞬「実装のバグ」に見えた。CJS 側のマーカーは単引用符で書く

  2 番目は、この作業が扱っている問題（exit 1 が何も言わずに素通りする）と同じ形である。fixture の debug を独立に走らせて切り分けた
- `16:40` - 実装。`npm run ci 1>&2` を `{ npm run ci 1>&2 || exit 2; }` に置き換え。GREEN

```
ok 1 〜 ok 5
# tests 5  # pass 5  # fail 0
```
- `16:45` - 実リポジトリで再現手順を実行

```
=== 健全時 ===
check-actions: HEAD のチェックはすべて成功しています。
exit=0

=== 検証を意図的に壊したとき（src/math.mjs に構文エラーを一時的に足す）===
check-actions: 行なし（＝到達していない）
exit=2（2 = セッションをブロックする）
```

  一時的な破壊は戻し、`git status` に残っていないことを確認した
- `16:50` - 凍結対象の無変更を確認。`git diff --stat main -- tests/stop-hook-ci-dir.test.mjs tools/check-actions.mjs tools/stop-hook-ci-dir.mjs` は空。変更したのは `.claude/settings.json` と新設テストの 2 件だけ。`npm run ci` は `# tests 471 / # pass 471 / # fail 0`（新設 5 件ぶん増）
- `16:55` - Verify (外部) を `codex-reviewer` に依頼
- `17:10` - `codex-reviewer` の判定: **Critical 0 / High 0 で承認。** Low 2 件（いずれもテスト強化の提案）。シェルの挙動は codex 自身が `/bin/sh -c '{ false || exit 2; } && echo unexpected'` を実行し `shell_exit=2`・`unexpected` 未出力を確認している。`cd` 失敗時は `cd` が特殊ビルトインでないためシェルは終了せず従来どおり非 0、`npm run ci` がシグナルで死んだ場合（例 SIGKILL → 137）も非 0 なので 2 に正規化され、修正前より改善する、との評価
- `17:20` - Low 2 件を反映。
  1. 例3（`ciExit: 3`）は **fixture が実際に 3 を返したことを確かめていなかった**。hook が非 0 をすべて 2 に正規化するので、npm が 3 を 1 に潰していても緑になる。`BUGGY_COMMAND` を `ciExit: 3` で走らせて `status === 3` を見るケースを 1 本追加した
  2. `BUGGY_COMMAND` に「2026-09-02 時点の `main` の登録内容の写しであり更新しない。実装に追随しない**対照群**である」と明記した

```
ok 1 - 例1: ci が通れば終了コード 0 で、check-actions まで到達する
ok 2 - 例2: ci が exit 1 なら hook は終了コード 2（1 ではない）で、check-actions を実行しない
ok 3 - 例3: ci の終了コードが 3 でも 2 に正規化する
ok 4 - 例4: check-actions の終了コードは素通しする（ci が通ったとき）
ok 5 - fixture は ci の終了コードをそのまま伝播できる（例3 の「正規化」が本物の 3 に対して起きている根拠）
ok 6 - 例5: 修正前のコマンドでは終了コード 1 になる（このテストが検知するバグそのもの）
# tests 6  # pass 6  # fail 0
```
- `17:30` - この差分を、新設した `grok-reviewer`（Cursor CLI 経由の Grok 4.6、別 PR #78）でも独立にレビューさせた。**判定は一致（Critical 0 / High 0 で承認）。** レビュアーを指名するのは進捗であり、この作業は `codex-reviewer` を指名しているので、承認の根拠は `codex-reviewer` の側である。Grok の実行は新しいレビュアー定義の動作確認を兼ねたもので、この作業の承認要件を増やすものではない
- `17:40` - PR #79 を作成。`0054-freeze-hook-wiring` より先にマージする前提（逆順だとこの PR にも `allow-protected-change` が要る）。現時点で `protected-paths` が緑であることがラベル不要の根拠である
