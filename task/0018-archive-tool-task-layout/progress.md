# Progress: `tools/archive.mjs` を `task/` レイアウトへ追随させる

- **Target Spec:** `task/0018-archive-tool-task-layout/spec.md`
- **Branch:** `feature/archive-tool-task-layout`
- **PR:** 未作成
- **Status:** Not Started

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

既存 `tests/archive.test.mjs` を大きく書き換えるため、`allow-protected-change` ラベルが要る。改訂の内容と理由は spec に書く（CLAUDE.md「凍結を解いて改訂するとき」）。`0017-guard-task-paths` のマージ後に着手すると、`task/` も凍結対象になっている前提で書ける。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成（一時ディレクトリ上の `task/` レイアウト）
- [ ] 実装 (`tools/archive.mjs`)
- [ ] CLAUDE.md「アーカイブ」節から旧対の記述を落とす
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 17:52 - `0016-archive-pr-ownership` のアーカイブで実際に踏んだ問題を spec 化。ツールが旧レイアウト（`specs/archive/`）へ置くため手作業で `task/archive/` に置き直した。`0017-guard-task-paths` の後に着手する。未着手。
