# Progress: `0020-start-task-tool`

- **Target Spec:** `task/0020-start-task-tool/spec.md`
- **Branch:** `feature/start-task-tool`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task.test.mjs`)
- [x] 実装 (`tools/start-task.mjs`)
- [x] CLAUDE.md の追随（Plan 工程・採番・worktree 作成手順）
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。
- `08:56` - 着手。`.worktrees/feature/start-task-tool` を main から作成。0017 は別セッションが Blocked 解除後の修正を進めているため、並列規約に従いこちらを選択（Blocked を除く最小 ID）。
- `09:00` - TDD。テスト 17 件を先に書き RED を確認（モジュール未実装で 1 fail）。実装後 17/17 GREEN。統合テストは一時 git リポジトリで実 `git worktree add` を使い、`npm ci` は注入で差し替えた。
- `09:02` - lint の `preserve-caught-error` 指摘 1 件を `{ cause }` 付与で解消。`npm run ci` 139 pass / 0 fail。実 CLI で `--next-id` が `0027` を返すことを確認（最大は backlog の `0026`）。
- `09:03` - CLAUDE.md 追随。Plan 工程・採番・並列作業の worktree 作成手順を本ツール参照に書き換え、採番のハードコード（「いまは 0016」・実態は 0019 まで使用済みで陳腐化していた）を削除。並列作業の手動コマンドは「特定の作業を並行開始するとき」用に残した（ID 指定開始は spec の範囲外のため）。
- `09:42` - `codex-reviewer` が **承認**（Critical 0 / High 0 / Medium 2 / Low 0）。1 回目のレビュー実行はセッション上限で中断し、リセット後に再開した。Medium の申し送り: (1) ブランチ名バリデータが git の一部有効名（`+` を含む等）を拒む。拒みすぎ側は fail-closed、通しすぎ側も後段の `git worktree add` が非 0 で落ちるため実害は限定的。`git check-ref-format --branch` への委譲は改善候補として backlog 化を検討。(2) CLAUDE.md の同梱は「ルール変更は独立 docs PR」条項と緊張するが、本作業は spec の「対象」に CLAUDE.md 追随が明記されており逸脱ではない。PR 本文にその旨を明記する。
