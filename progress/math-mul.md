# Progress: `mul` の追加

- **Target Spec:** `specs/math-mul.md`
- **Branch:** `feature/math-mul`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`specs/parallel-worktrees.md` の演習対象。`math-div` と別 worktree で並列に実施する。試行ログに worktree のパスとブランチを記録すること。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/mul.test.mjs`)
- [ ] 実装 (`src/math.mjs` に `mul` を追加)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 09:20 - `parallel-worktrees` の演習対象として spec 化。計画用ブランチ `docs/math-mul-div-specs` の docs PR で main へ入れる。未着手。
