# Progress: `sub` の追加

- **Target Spec:** `specs/archive/math-sub.md`
- **Branch:** `feature/math-sub`
- **Status:** Done

## タスクチェックリスト

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/sub.test.mjs`)
- [x] 実装 (`src/math.mjs`)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成

## 試行ログ・エラー履歴

- 13:55 - 仕様 `specs/math-sub.md` に対応する進捗ファイルを作成。実装は未着手。
- 14:20 - `specs/math-sub.md` の完了条件を確認。`feature/math-sub` ブランチを作成し着手。
- 14:22 - `tests/sub.test.mjs` をRED状態で作成。`node --test tests/sub.test.mjs` 実行 → `SyntaxError: 'sub' is not exported` で失敗を確認。
- 14:23 - `src/math.mjs` に `sub(a, b)` を実装。`node --test tests/sub.test.mjs` 実行 → 8 tests, pass 8, fail 0 でGREEN確認。`npm run ci` 実行 → 15 tests, pass 15, fail 0。
- 14:25 - `codex review --uncommitted` でレビュー依頼。結果:「仕様と既存モジュール規約に合致。15件のテストは全てパス」。Critical/High指摘は0件。完了条件5項目を満たしたためアーカイブする。
