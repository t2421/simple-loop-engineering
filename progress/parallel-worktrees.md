# Progress: worktree による並列作業の導入

- **Target Spec:** `specs/parallel-worktrees.md`
- **Branch:** `feature/parallel-worktrees`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] CLAUDE.md への worktree 運用規約の追記（`.worktrees/` の gitignore 含む）
- [x] 演習対象 2 作業の spec / progress 作成（例: `math-mul` / `math-div`）
- [x] 2 worktree での並列実施と、各進捗ログへの worktree パス・ブランチの記録
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 09:15 - 残り 6 作業の並列可否を検討。CLAUDE.md を 3 本が、`package.json` を 2 本が触るため一斉並列は不可。本作業を波 1、`guard-protected-paths` / `archive-automation` / `claude-md-slim` を波 2（ファイル重複なし）、`scripts-freeze-procedure` → `ci-lint` を波 3 とした。
- 09:20 - 演習対象 `math-mul` / `math-div` の spec・progress を計画用ブランチ `docs/math-mul-div-specs` で作成し、docs PR #8 を作成（規約どおり実装 PR に混ぜない）。
- 09:25 - `feature/parallel-worktrees` を main から切り、CLAUDE.md に「## 並列作業（worktree）」節を追加、`.gitignore` に `.worktrees/` を追加。演習の実施は #8 のマージ後。
- 09:35 - #8 マージ後、`git worktree add .worktrees/feature/math-mul -b feature/math-mul main` と同 `math-div` で 2 worktree を作成。各 worktree で `npm ci` を実行（`node_modules` は worktree ごとに必要）。
- 09:44 - 演習の「例」を検証。`git worktree list` に 2 worktree が並ぶこと、両方で `npm run ci` を同時実行して互いに影響せず成功すること（math-mul 51 pass / math-div 54 pass、いずれも exit 0）を確認。テストサーバが `listen(0)` のエフェメラルポートを使うためポート競合が起きない。
- 09:52 - `math-mul` の PR #9 を作成（codex-reviewer 承認、Critical 0 / High 0）。
- 09:59 - `math-div` の PR #10 を作成（codex-reviewer 承認、Critical 0 / High 0）。演習 2 作業の PR が別 worktree から 2 本作られた。
- 10:02 - 並列実施中に、出力のラベルを取り違えて会話に貼る失敗をした（math-mul と math-div の ci 出力を逆に提示）。原因はバックグラウンド実行の完了順とタスク ID の対応を目視で追ったこと。対処として、コマンド内に `pwd` と `git branch --show-current` を埋め込んで出力自体に worktree を刻む方式に変更し、再実行して確定させた。並列時は出力に出自を埋めることを運用の前提とする。
