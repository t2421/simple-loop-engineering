# Progress: `0021-loop-hooks`

- **Target Spec:** `task/0021-loop-hooks/spec.md`
- **Branch:** `feature/loop-hooks`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/guard-worktree.test.mjs`)
- [x] 実装 (`tools/guard-worktree.mjs`、`.claude/settings.json`)
- [ ] Stop hook の実セッションでの動作確認（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`（ブロック時の誘導先）。
- `05:30` - RED: `tests/guard-worktree.test.mjs` を先に書き、`node --test` が `ERR_MODULE_NOT_FOUND`（`tools/guard-worktree.mjs` 未作成）で失敗することを確認。
- `05:40` - GREEN: `tools/guard-worktree.mjs` を実装。判定は純関数 `classifyEdit({filePath, rootDir})` に閉じ込め、`readFilePath` / `resolvePrimaryRoot` / `blockMessage` も pure で export。`npm run ci` は 204 tests / 0 fail。
- `05:42` - ルートの取り方: `git rev-parse --path-format=absolute --git-common-dir` の親をプライマリチェックアウトとする。worktree の中から呼ばれても同じ 1 つの基準で判定でき、`.worktrees/` 配下かどうかを相対パスの第 1 セグメントで決められる。
- `05:44` - `.claude/settings.json` を新設（PreToolUse: `Write|Edit` → guard、Stop: `npm run ci`）。CLI での再現（例の 5 行）は終了コード 2 / 0 を実測。Stop hook は設定が読み込まれた実セッションでの確認が残る。
