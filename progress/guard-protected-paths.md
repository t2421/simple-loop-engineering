# Progress: 保護パス変更の CI ガード

- **Target Spec:** `specs/guard-protected-paths.md`
- **Branch:** `feature/guard-protected-paths`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/protected-paths.test.mjs`)
- [x] 実装 (`tools/check-protected-paths.mjs` / `.github/workflows/` のガードジョブ)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 10:30 - 波 2 として worktree `.worktrees/feature/guard-protected-paths`（ブランチ `feature/guard-protected-paths`、main から作成）で着手。`archive-automation` / `claude-md-slim` と並列。3 本はファイルが重ならない。
- 10:35 - TDD。`tests/protected-paths.test.mjs` を先に書き RED（fail 1）。`tools/check-protected-paths.mjs` に判定ロジックを純関数（`parseNameStatus` / `scriptsChanged` / `findViolations` / `hasAllowLabel`）として実装し GREEN（21 pass）。ワークフローは新規 `.github/workflows/guard.yml` として追加し、既存 `ci.yml` は触らない。
- 10:38 - `.github/workflows/guard.yml` の初版で `${{ github.base_ref }}` を `run:` に直接展開していた。コマンドインジェクションの定石を外していたため、`env:` 経由（`BASE_REF`）に直して `"origin/$BASE_REF"` と参照する形へ修正。
- 10:42 - spec の「例」7 行を実ブランチで再現。既存テスト期待値の変更・`scripts` の変更・`TEMPLATE.md` の変更を含む一時ブランチで 3 件検知して exit 1、`allow-protected-change` ラベルありで exit 0、内容同一の `specs/x.md → specs/archive/x.md` 移動（R100）で exit 0、この PR 自身（新規追加のみ）で exit 0。
- 10:44 - 「失敗時」も確認。存在しない base ref で exit 1（素通りさせない）、`PR_LABELS` が不正 JSON・空のいずれもラベル無し扱いで exit 1（安全側）。
- 10:45 - `npm run ci` は 83 pass / 0 fail（既存 62 + protected-paths 21）。既存テストの件数・結果は不変。
- 11:05 - `codex-reviewer` が **不承認**（Critical 1 / High 1 / Medium 2 / Low 1）。
  - Critical: リネーム免除が無条件だった。`R100 .github/workflows/ci.yml -> ci.yml.disabled` や `R100 tests/add.test.mjs -> docs/add.test.mjs` がガードを通過する。CI 検証そのものを退避で無効化できる、ガードの存在意義を正面から破る穴。実際に再現して確認した。
  - High: `on: pull_request:` にアクティビティ型の指定が無く、既定の opened/synchronize/reopened のみ。ラベル付与で再実行されず、剥奪でも成功済みチェックが残る。spec の例外経路が実 PR 上で機能しない。
- 11:08 - Critical を修正。免除条件を「`archiveMove` が true のディレクトリ（`specs/` のみ）内に留まる、内容同一の移動」に限定し、判定を移動元（`oldPath`）と移動先の両方で見るようにした。`tests/` と `.github/workflows/` は R/C を常に違反にする。原因は、免除を「保護ディレクトリに関係するリネームか」だけで判定し、移動先がどこかを見ていなかったこと。
- 11:10 - High を修正。`types: [opened, synchronize, reopened, labeled, unlabeled]` を指定。あわせて `permissions: contents: read` を明示（Low 指摘）。
- 11:12 - Medium 2 件も修正。(1) `git diff` を `-z` にして NUL 区切りで読み、C クォートされたパスも復号するようにした。非 ASCII を含むパスで `startsWith('tests/')` が外れて素通りする穴を塞ぐ。(2) `scripts` の比較基準を base の先端から `git merge-base` に変えた。差分が三点（`base...HEAD`）なのに比較が base 先端だと、分岐後に main 側で `scripts` が変わったときに誤検知する。
- 11:14 - C クォートの復号で最初マルチバイト文字を壊した（`tests/あ.test.mjs` が `tests/ã\x81\x82.test.mjs` になる）。8 進エスケープは UTF-8 のバイトなので、1 文字ずつ復号せずバイト列に積んでから `TextDecoder` で復号する形に直した。
- 11:16 - レビューが「例の行を写しただけで免除条件の境界を突くテストが無い」ことを Critical の原因として挙げていたため、境界ケースを 8 件追加（tests/ の外へ・CI 退避・specs/ の外へ・tests/ 内リネーム・C100・外から中への移動・C クォート・タブを含むパス）。テストは 21 → 29 件。
- 11:18 - バイパス経路の再検証。5 つの回避パターンすべてを検知し、アーカイブ移動と新規追加は通過することを確認。`npm run ci` は 91 pass / 0 fail（既存 62 + protected-paths 29）。
- 12:20 - 再レビュー（2 回目）で **不承認**（Critical 0 / High 1 / Medium 1 / Low 3）。前回の Critical・Medium 2 件・Low は解消を確認された。
  - High: **ガード自身のコードが保護対象外だった。** `pull_request` の `actions/checkout` は PR のマージコミットを取るため、実行されるのは候補側の `tools/check-protected-paths.mjs` である。`tools/` は保護ディレクトリに入っていないので、「チェッカーを `process.exit(0)` に潰す + 既存テストの期待値を変える」を 1 本の PR に入れればラベル無しで通る。前回の Critical と影響は同等（ガードの全面無効化）。再現して確認した。
  - Medium: base ブランチの付け替えは `edited` として飛ぶため、`types` に無いと再判定されない。
- 12:24 - High を修正。ワークフローで、実行するチェッカーを **base リビジョン由来**にした（`git show "origin/$BASE_REF:tools/check-protected-paths.mjs"` を `$RUNNER_TEMP` へ取り出して実行）。`tools/` を保護対象に足すだけでは足りない（同一 PR 内で潰せる）というレビューの指摘どおり。base にチェッカーが無い場合（このガードを導入する PR 自身）だけ候補側にフォールバックし、warning を出す。マージ後は必ず base 経由になる。
- 12:26 - Medium を修正。`types` に `edited` を追加。
- 12:28 - base 由来チェッカーの検証中に、**自分で入れた別のバグを踏んだ。** CLI 起動の判定を `process.argv[1].endsWith('check-protected-paths.mjs')` でやっていたため、base 版を別名の一時ファイルへ取り出して実行すると `main()` が黙って走らず exit 0 になる。ワークフローは正しい名前で取り出すので実害は無かったが、名前依存は脆い。`pathToFileURL(process.argv[1]).href === import.meta.url` に変えた（`tools/archive.mjs` と同じ流儀）。**沈黙して成功する**類の失敗なので、名前で判定していたこと自体が誤り。
- 12:30 - Low 3 件のうち 2 件に対応。(1) `parseNameStatus` がフィールド欠損で `TypeError` を投げ、`main()` の catch が「差分を取得できませんでした / fetch-depth: 0 が要ります」と誤誘導していた。途中で切れた出力を「変更なし」と読まないよう明示的に例外にし、差分取得の失敗とパースの失敗を別の catch に分けた。(2) `unquotePath` が末尾の単独バックスラッシュで落ちる問題を直した。
- 12:31 - Low 残り 1 件（`C100` のコピーを移動と同一視する偽陽性）は未対応。`git diff` に `-C` を渡していないので CLI 経路では発生せず、純関数を直接呼んだときだけの話。安全側の誤りでもある。
- 12:33 - 回帰テストを 3 件追加（途中で切れた差分、空の差分、末尾バックスラッシュ）。テストは 29 → 32 件。`npm run ci` は 94 pass / 0 fail（既存 62 + protected-paths 32）。
- 12:35 - バイパス経路を再現して確認。チェッカーを潰した一時ブランチで、候補側のチェッカーは exit 0（素通り）、base 由来のチェッカーは `tests/add.test.mjs` の変更を検知して exit 1。正常系（この PR 自身、新規追加のみ）は exit 0 のまま。
