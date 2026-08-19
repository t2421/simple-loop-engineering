# Progress: 保護パスを `task/` へ追随させる

- **Target Spec:** `task/0017-guard-task-paths/spec.md`
- **Branch:** `feature/guard-task-paths`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`tools/check-protected-paths.mjs` と既存 `tests/protected-paths.test.mjs` を変更するため、`allow-protected-change` ラベルが要る。保護対象を増やす手順は `.claude/skills/add-protected-path` に従う。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成（`tests/protected-paths.test.mjs` に「例」7 行）
- [ ] 実装 (`tools/check-protected-paths.mjs` の `APPEND_ONLY_DIRS` と `TEMPLATES`)
- [ ] CLAUDE.md「変えてはいけないもの」の一覧の更新
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 17:50 - `0016-archive-pr-ownership` のアーカイブ中に発見して spec 化。`0014-spec-progress-layout` の移行で spec が `task/` へ移ったのに、ガードの `APPEND_ONLY_DIRS` は `specs/` のままだった。**移行によってすべての spec の完了条件と例の期待値が無防備になっている。** 実測で `task/archive/0012-ci-lint/spec.md` の変更が PASS することを確認済み。最優先。未着手。
