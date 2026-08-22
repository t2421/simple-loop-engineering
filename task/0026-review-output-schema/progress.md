# Progress: `0026-review-output-schema`

- **Target Spec:** `task/0026-review-output-schema/spec.md`
- **Branch:** `feat/0026-review-output-schema`
- **PR:** 未作成
- **Status:** In Progress (Phase: Verify (外部))
- **Complexity:** M

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] `.claude/agents/codex-reviewer.md` に出力スキーマ・Critical 列挙・テスト提案規則・スキーマ違反時の扱いを追記
- [x] `.claude/agents/visual-design-reviewer.md` に出力スキーマ・Critical 列挙・テスト提案規則・スキーマ違反時の扱いを追記
- [x] 完了条件 5〜8 の `grep` 検証（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 2026-08-22 - backlog から昇格。2026-08-22 の実測（レビュー 6 回で subagent トークン約 60 万、うち 2 回で出力が無害化により変形）を受けて着手を決定。スキーマ範囲・Critical 列挙粒度・テスト提案規則の 3 点は人間が判断済み（spec の背景に記載）。
- `04:20` - 両定義に同じ構造で 3 節を追記した。**出力スキーマ**（severity / 根拠のパスと行 / 完了条件番号 / 一文の要約 の 4 項目を必須、長文は任意の補足欄へ、4 項目を欠くものは指摘として数えない）、**Critical の条件**（列挙し、列挙外は High 以下）、**テストで書ける指摘**（決定論チェックで真偽が決まる指摘はテスト追加の提案として返す）。承認節には「出力スキーマに合わない結果は承認として扱わない」を足した。既存の承認条件・severity 対応づけ・5 回上限・Blocked への遷移は 1 文字も変えていない。
- `04:20` - Critical の列挙は spec の指示どおり。`codex-reviewer`: 期待値改ざん / 範囲外の実装 / P0 相当の欠陥。`visual-design-reviewer`: トークン不一致 / 構造の欠落 / 抽出物の書き換え。どちらも列挙外の例（前者は「読みにくい・命名の好み」、後者は「整列・重なり・階層の残差」）を明示して、境界が読み手によって揺れないようにした。
- `04:22` - 完了条件 5〜8 を `grep` で実測。`severity`・`完了条件番号`・`一文の要約`・`High 以下`・`テスト追加の提案`・`承認として扱わない` の 6 語すべてが**両ファイル**にヒットした。「例」の `grep -c '列挙' codex-reviewer.md` は `2`（1 以上）。出力は会話に貼った。
- `04:25` - 完了条件 9・10 を実測。`npm run ci` は fail 0。`git diff main --stat` は `.claude/agents/` の 2 ファイル（+82 行）だけで、`src/`・`tools/`・`.github/` に差分は無い。
