# Progress: `0057-manifest-layout-ledger`

- **Target Spec:** `task/0057-manifest-layout-ledger/spec.md`
- **Branch:** `feat/0057-manifest-layout-ledger`
- **PR:** `未作成`
- **Status:** `Blocked` (Phase: `0042 の完了待ち`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（`task/0042-loop-manifest/` のアーカイブ後、確定したマニフェストのファイル名・項目名を spec の暫定名に読み替えて確認する）
- [ ] `feat/0042-loop-manifest` に残る 1 回目の実装（2 実装の一致テスト 32 件・`tests/manifest-fixture.mjs`）を材料として読み、持ち込むもの・持ち込まないものを試行ログに記録する
- [ ] 2 実装の一致テストの作成（`tests/manifest-layout-agreement.test.mjs`。spec「例」表 A・表 B を表駆動で固定する）
- [ ] 既存テストへの宣言の注入と、実物のマニフェストを写すフィクスチャの配線（`tests/progress-coupling.test.mjs`・`tests/guard-worktree.test.mjs`・`tests/start-task.test.mjs`・`tests/start-task-claim.test.mjs`。期待値は変えない）
- [ ] 実装: `tools/guard-worktree.mjs`（セグメント境界の照合・単体ファイル・宣言不能時のブロック）
- [ ] 実装: `tools/check-progress-coupling.mjs`（merge-base の宣言を自前で読む・葉まで検査・文言を宣言から組む）
- [ ] 実装: `tools/start-task.mjs`（台帳・候補の置き場・作業 ID パターン・採番と認識の照合）
- [ ] わざと落とす検査（spec「例」表 C）の実測。`tools/` を外した状態で両テストが赤になる出力と、戻して緑になる出力を試行ログに貼る
- [ ] ハードコード消滅の `grep`（spec「例」表 D 末尾、完了条件 5・10）の出力を試行ログに貼る
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。ラベル無しで `protected-paths` が失敗した結果とラベル付きで成功した結果の両方を試行ログに貼る）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec と progress を起草した。**着手はしない。** 0042（マニフェストの型と読み取り層）が完了するまで消費者を書けないため、Status を `Blocked` にして `tools/start-task.mjs` の選択から外す。
- `--:--` - 解除条件: `task/archive/0042-loop-manifest/` が存在すること（0042 がアーカイブ済み）。解除時に Status を `Not Started` に戻し、0042 が確定させたマニフェストのファイル名・項目名を spec の暫定名（`implementation.dirs` / `implementation.files` / `ledger.dir` / `ledger.docs` / `workId.pattern`）に読み替える。読み替えは名前だけで、spec の命題は変えない。
