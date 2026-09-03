# Progress: `0058-manifest-optional-stages`

- **Target Spec:** `task/0058-manifest-optional-stages/spec.md`
- **Branch:** `feat/0058-manifest-optional-stages`
- **PR:** `未作成`
- **Status:** `Blocked` (Phase: `0042 の完了待ち`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 0042 のマージ後、確定した項目名と読み取り層の公開面（`tools/loop-manifest.mjs`）を確認し、spec の仮名（`conditionalStages` / `complexityModels` / `reviewers`）を対応づける
- [ ] テストの作成: 読み取り層の 3 項目の検査（省略・`[]`・葉の型不正・`M` 欠落・余分なキー・`reviewers` の実在検査。`tests/loop-manifest*.test.mjs`）
- [ ] テストの作成: 宣言経由の判定（`tests/e2e-needed.test.mjs` に spec「例」の `matches` 全行を足す。既存ケースは削らない）
- [ ] テストの作成: `modelForComplexity(complexity, table)` の表引きと、表省略時にモデルを出力しない選択（`tests/start-task.test.mjs`）
- [ ] テストの作成: `ci.yml` の `e2e` ジョブが base から取り出す集合が判定ツールのローカル import とマニフェストを覆う配線テスト（新規ファイル）
- [ ] 実装: `loop.manifest.json` に 3 項目を宣言（`triggers` は現行述語と同じ 7 件）
- [ ] 実装: `tools/loop-manifest.mjs` に 3 項目の検査（glob の構文検査を含む）
- [ ] 実装: `tools/e2e-needed.mjs` を宣言経由へ（`<base-ref> <stage>`、`import.meta.url` 基準の読み取り、ハードコード除去）
- [ ] 実装: `tools/start-task.mjs` の `COMPLEXITY_MODELS` を宣言経由へ
- [ ] 実装: `.github/workflows/ci.yml` の `e2e` ジョブが base から 3 ファイルを同じ相対配置で取り出す
- [ ] わざと落とす検査の実測: `task/**/calc-page.*` → `task/*/calc-page.*` で赤、`M` を外して赤。出力をここに貼って戻す
- [ ] ハードコード消滅の `grep` 出力をここに貼る（完了条件 10）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得（差分・spec・実測の CI 結果だけを渡す）
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。ラベル無し・ラベル付き両方の `protected-paths` の結果をここに貼る）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `18:22` - spec / progress を起草。0042 の完了に依存するため Status を `Blocked` にした。PR #76 の 3 指摘（葉の未検査・glob が旧述語より狭い・表の完全性未検査）を再発防止として spec に固定した。レビュアー名と進捗の突き合わせ lint は範囲外にし、別作業の候補とした。
