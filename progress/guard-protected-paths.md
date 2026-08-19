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
