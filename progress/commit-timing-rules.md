# Progress: spec / progress のコミット・マージ規約

- **Target Spec:** `specs/commit-timing-rules.md`
- **Branch:** `feature/commit-timing-rules`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

他の未着手作業（guard-protected-paths ほか）の進め方がこの規約に依存するため、最優先で着手する。

- [x] Specの要件・受け入れ条件の確認
- [x] CLAUDE.md への規約の追記（コミットタイミング表・補足 2 点）
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:35 - 「spec/progress のコミット・マージのタイミングに困っている」という相談から規約案を作り spec 化。この spec 群自体の計画 PR（main から切った docs ブランチ）が規約の初適用となる。未着手。
- 06:05 - 着手。計画 PR #6 が origin/main にマージ済みだったため、ローカル main を fast-forward してから `feature/commit-timing-rules` を main から切った。規約の「進捗の Branch は予約名。着手時に main から切る」の初適用。
- 06:08 - CLAUDE.md に「## コミットとマージ」節（表 5 行 + 補足 2 点）を追加し、「アーカイブ」節の手順に main へ直接コミットする手順 5 を追記した。`npm run ci` は 43 pass / 0 fail で変更前と同じく成功。
