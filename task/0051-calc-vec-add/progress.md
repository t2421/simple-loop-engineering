# Progress: `0051-calc-vec-add`

- **Target Spec:** `task/0051-calc-vec-add/spec.md`
- **Branch:** `feat/0051-calc-vec-add`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] Figma ノードの JSON 抽出 (`task/0051-calc-vec-add/calc-vec-add.figma.json`)
- [ ] Figma フレームの PNG キャプチャ (`task/0051-calc-vec-add/calc-vec-add.png`)
- [ ] テストの作成 (`tests/calc-vec-add.test.mjs`)
- [ ] 実装 (`src/calc.html` / `src/calc.css` / `src/calc.mjs`。既存 id と既存 CSS 変数の値は変えない)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] レビューサブエージェント (`visual-design-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] 見た目のスクリーンキャプチャを PR 本文に貼る（未計算と、例の 1 件以上の計算後）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 09:05 - 計画用ブランチ `docs/0050-0051-vec-add` で spec/progress を起草。実装は未着手。`addVec` は `0050-math-vec-add` に依存。Figma は無く、仕様のトークン表を正とする。
- 10:00 - 人間の指示で Figma 出典を追記。file key `ftGcQpbvknoosfpy3aP1FQ`、node `2:5`（`vector-calculator-ui`）。ライブファイルは完了条件にしない。抽出は実装より先のチェック項目。起草時の仮トークン表は抽出生に差し替えた。
