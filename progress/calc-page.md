# Progress: 計算ページの追加

- **Target Spec:** `specs/calc-page.md`
- **Branch:** `feature/calc-page`
- **Status:** Not Started (Phase: Plan)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] Figma ノードの JSON 抽出 (`progress/calc-page.figma.json`)
- [ ] Figma フレームの PNG キャプチャ (`progress/calc-page.png`)
- [ ] テストの作成 (`tests/calc-page.test.mjs`)
- [ ] 実装 (`src/` 配下の HTML ページ)
- [ ] レビューサブエージェント (`visual-design-reviewer`) の承認取得
- [ ] PR作成

## 試行ログ・エラー履歴

- 15:25 - 仕様 `specs/calc-page.md` と進捗を作成。Figma 抽出・実装は未着手。
- 15:26 - 抽出物の保存先を `progress/` 配下・進捗と同名にルール化。パスを spec / progress / CLAUDE.md に反映。
