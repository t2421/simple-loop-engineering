# Progress: `0054-freeze-hook-wiring`

- **Target Spec:** `task/0054-freeze-hook-wiring/spec.md`
- **Branch:** `feat/0054-freeze-hook-wiring`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（凍結改訂であること、導入 PR 自身には新しい保護が効かないことを確認する）
- [ ] テストの作成 (`tests/gate-helpers.test.mjs` に `.claude/settings.json`・`tools/guard-worktree.mjs` の違反側 M/D/R と許可側 A、`.claude/settings.local.json` の許可側を追記。既存ケースは書き換えない)
- [ ] テストの作成 (`tests/hook-wiring.test.mjs` を新設。`.claude/settings.json` の hook コマンドから `$CLAUDE_PROJECT_DIR/<path>` を抽出し、各パスと `.claude/settings.json` 自身の M が違反 1 件になることを検証。空集合は失敗)
- [ ] 実装 (`tools/check-protected-paths.mjs` の `GATE_HELPERS` に `.claude/settings.json` と `tools/guard-worktree.mjs` を追加。理由をコメントで添える)
- [ ] 実装 (`CLAUDE.md`「変えてはいけないもの」に 2 行追加。spec「例」の grep が `2` を出すこと)
- [ ] spec「例」のローカル再現（`tmp/0054-probe` でラベル無し `exit=1`・`PR_LABELS` 付き `exit=0`）を実行し、出力を会話に貼る
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。ラベル無しで `protected-paths` が失敗し、ラベル付きで成功することを Actions の結果で確認する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec / progress を起草（spec-author）。`.claude/settings.json` が hook から呼ぶ 3 スクリプトのうち `tools/guard-worktree.mjs` が `GATE_HELPERS` に無いことを起草時に実測し、対象に含めた。
