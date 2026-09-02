# Progress: `0053-stop-hook-block-exit-code`

- **Target Spec:** `task/0053-stop-hook-block-exit-code/spec.md`
- **Branch:** `feat/0053-stop-hook-block-exit-code`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 修正前のバグ再現（spec「背景」の再現手順 1〜5 を実行し、`exit=1` の出力を試行ログに貼る。手順 2 の一時的な破壊は戻す）
- [ ] テストの作成 (`tests/stop-hook-exit-code.test.mjs`。spec「例」の 1〜5 行目。`tests/stop-hook-ci-dir.test.mjs` の fixture・`stopHookCommand()`・`runHook()` の形にならう。修正前に RED を確認して出力を試行ログに貼る)
- [ ] 実装 (`.claude/settings.json` の `hooks.Stop[0].hooks[0].command`。`npm run ci 1>&2` を `{ npm run ci 1>&2 || exit 2; }` に置き換える。command は 1 本のまま)
- [ ] 修正後の実リポジトリでの実測（spec「例」の 6・7 行目。健全時 `exit=0` と `check-actions:` 行、検証を壊したとき `exit=2` と `check-actions:` 行なし。出力を試行ログに貼り、一時的な破壊は戻す）
- [ ] 凍結対象の無変更確認（`git diff --stat main -- tests/stop-hook-ci-dir.test.mjs tools/check-actions.mjs tools/stop-hook-ci-dir.mjs` が空であることを試行ログに貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec と progress を起草（Not Started）。出典は `task/archive/0044-second-project-port/notes/port-log.md` 4 節 (c) の申し送り。
