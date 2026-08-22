# Progress: `0029-lint-docs-false-negatives`

- **Target Spec:** `task/0029-lint-docs-false-negatives/spec.md`
- **Branch:** `feat/0029-lint-docs-false-negatives`
- **PR:** 未作成
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・完了条件の確認
- [x] テストの作成 (`tests/lint-docs-false-negatives.test.mjs`。既存 `tests/lint-docs.test.mjs` は変更しない)
- [x] 実装 (`tools/lint-docs.mjs` の `parseMetadata` / `checkSpecHeadings` / `checkBacklogCompletion`)
- [x] 既存文書の再検証（リポジトリのルートで `node tools/lint-docs.mjs` が終了コード 0）
- [x] 保護パス非接触の確認（`node tools/check-protected-paths.mjs main` が通る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `20:58` - 昇格を起草。2026-08-22 の 2 回目の backlog リファインメントで 3 件とも現存を実測確認し、人間が着手を決定。`backlog/0029-lint-docs-false-negatives/` を同じ ID のまま `task/0029-lint-docs-false-negatives/` へ `git mv` し、完了条件を記入、progress.md を作成。テストは append-only 制約により新規ファイル `tests/lint-docs-false-negatives.test.mjs` に置くと決定（`allow-protected-change` ラベル不要）。
- `04:40` - テストを先に書いて RED を確認（9 件中 7 件が fail。正しい文書を通す 2 件は最初から pass で、偽陰性だけが落ちている）。そのうえで 3 箇所を直して GREEN（9 pass・0 fail）。
- `04:45` - (1) `parseMetadata` の正規表現を `/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/` から `/^- \*\*(.+?):\*\*\s*(.*)$/` に狭めた。lint の広さを、実際に読む側（`tools/start-task.mjs`・`tools/archive.mjs` はどちらも行頭 `- ` のみ）へ揃える。既存テスト「parseMetadata は最初の定義を採る」は `- ` 形式なので影響しない。
- `04:47` - (2) `checkSpecHeadings` の一致判定を `sections.join(' ') !== SPEC_HEADINGS.join(' ')` から、**長さと要素ごとの比較**に変えた。見出し名自体に空白が入りうるため、join した文字列では `## 種別 対象` の 1 見出しが `## 種別` + `## 対象` の 2 見出しと同じ文字列になる。結合と分割の両方をテストで固定した。
- `04:50` - (3) `checkBacklogCompletion` は、見出しの探索はフェンス外の列で行い（フェンス内の「完了条件」を拾わない既存の性質を保つ）、**節の先頭コンテンツは元の行から探す**ようにした。フェンス外の列だけを見るとフェンス塊ごと消え、フェンスの後の行を節の先頭と誤認する。未確定行のあとに置かれたフェンスは違反にしないことも、既存 backlog の形を壊さないためにテストで固定した。
- `04:52` - **JSDoc に `*/` を含む正規表現を書いてブロックコメントが閉じ、`SyntaxError` になった**（`/^- \*\*PR:\*\*/` の末尾）。テストが即座に検知した。文言から正規表現リテラルを外して解消。
- `04:55` - 完了条件 6・8・9 を実測。`node tools/lint-docs.mjs` は `docs の形式違反はありません（35 件の作業ディレクトリを確認）` で exit 0。`npm run ci` は fail 0。`node tools/check-protected-paths.mjs main` は `保護パスの変更はありません`。差分は `tools/lint-docs.mjs` の変更と `tests/lint-docs-false-negatives.test.mjs` の新規追加だけで、既存 `tests/lint-docs.test.mjs` は無変更。
