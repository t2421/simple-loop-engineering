# Progress: worktree による並列作業の導入

- **Target Spec:** `task/archive/0007-parallel-worktrees/spec.md`
- **Branch:** `feature/parallel-worktrees`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/11
- **Status:** Done

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] CLAUDE.md への worktree 運用規約の追記（`.worktrees/` の gitignore 含む）
- [x] 演習対象 2 作業の spec / progress 作成（例: `math-mul` / `math-div`）
- [x] 2 worktree での並列実施と、各進捗ログへの worktree パス・ブランチの記録
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く）
- [x] PRマージ後のアーカイブ

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
- 10:10 - `codex-reviewer` が承認（Critical 0 / High 0）。Medium 1 件: 新節に足した「並列にしてよいのは触るファイルが重ならない作業どうしである」が演習と矛盾する。演習の 2 本はどちらも `src/math.mjs` の `sub` 直後に追記しており衝突する。`git merge-tree --write-tree origin/feature/math-mul origin/feature/math-div` で `CONFLICT (content): Merge conflict in src/math.mjs` を確認した。
- 10:12 - 当該一文は spec の「仕様」3 点に含まれない私の追加分であり、spec 本体はむしろ「競合は PR のマージ順に解決する」と衝突の発生を前提にしていた。矛盾していたのは追加した一文の側なので、「重なる場合も並列にしてよいが、後からマージする側が main を取り込んで解決する」に改めた。演習はこの表現どおりの実例となる（#9 / #10 のうち後にマージする側で `src/math.mjs` を解決する）。
- 10:13 - Low 指摘: 本ブランチの CLAUDE.md「状態」節で他作業のステータスを更新しており、新節が想定する CLAUDE.md 競合を自ら作っている。progress ファイル自体は触っていないため規約違反ではない。この一覧の二重管理は `specs/claude-md-slim.md` が削除を予定している箇所であり、そちらで構造的に解消する。
- 10:18 - PR #11 を作成。ドキュメントのみの変更で見た目の変更がないためスクリーンキャプチャは添付しない。演習の #9 / #10 とあわせて 3 本がマージ待ち。Status は Done にせず、アーカイブもしない。
