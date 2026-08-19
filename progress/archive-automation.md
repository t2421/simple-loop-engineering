# Progress: アーカイブ手順の自動化

- **Target Spec:** `specs/archive-automation.md`
- **Branch:** `feature/archive-automation`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/archive.test.mjs`。一時ディレクトリ + PR 確認のモック)
- [x] 実装 (`tools/archive.mjs`)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 10:30 - 波 2 として worktree `.worktrees/feature/archive-automation`（ブランチ `feature/archive-automation`、main から作成）で着手。`guard-protected-paths` / `claude-md-slim` と並列。
- 10:50 - TDD。`tests/archive.test.mjs` を先に書き RED（fail 1）。`tools/archive.mjs` を実装して GREEN（9 pass）。PR 確認は `checkPr` として注入可能にし、テストは一時ディレクトリ（`fs.mkdtempSync`）上でモックを使う。移動ロジックは純関数（`readPrUrl` / `rewriteProgress` / `collectArtifacts`）に分離。
- 10:52 - 抽出物の収集で `<作業名>-other.md` のような別作業を巻き込む危険があったため、`collectArtifacts` は `<name>.md` 完全一致と `<name>.` 始まりだけを対象にした。テストに「別作業の似た名前のファイルは巻き込まない」を追加。
- 10:55 - 「失敗時」3 件を実リポジトリで確認。PR 未作成（`guard-protected-paths`）で exit 1、存在しない作業名で exit 1、`TEMPLATE` 指定で exit 1。いずれも `git status` に変更が出ず、ファイルを触っていない。
- 10:58 - `gh` を実際に呼ぶ経路も E2E で確認。マージ済み PR #9 を指す一時リポジトリで実行し、spec / progress / 抽出物（`demo.figma.json`）が `archive/` へ移動、Status が `Done`、Target Spec が `specs/archive/demo.md` に書き換わり、試行ログが保持されることを確認。
- 11:00 - `npm run ci` は 71 pass / 0 fail（既存 62 + archive 9）。既存テストの件数・結果は不変。
