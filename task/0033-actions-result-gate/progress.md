# Progress: `0033-actions-result-gate`

- **Target Spec:** `task/0033-actions-result-gate/spec.md`
- **Branch:** `feat/0033-actions-result-gate`
- **PR:** 未作成
- **Status:** Not Started (Phase: Plan)
- **Complexity:** M

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/check-actions.test.mjs`。判定表の各行を注入モックで)
- [ ] 実装 (`tools/check-actions.mjs`。純関数を export し、`gh` 呼び出し・時刻・待機を注入)
- [ ] `.claude/settings.json` の更新（Stop hook 後段への追加、PostToolUse `Bash` matcher の追加。既存の `npm run ci` を壊さない）
- [ ] `CLAUDE.md` 開発ループ 6. Record への 1 行追記
- [ ] 実環境での再現確認（赤 run でブロック・緑で通過・fail-open の stderr。出力を会話に貼る）
- [ ] 停止ループ対策の確認（`stop_hook_active` が真ならブロックしないこと、前段と後段の両方が stdin を読めること）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 00:00 - spec / progress を起草（spec-author）。実装は未着手。
- 09:20 - 起草をレビューし、**停止ループ対策**を仕様に足した。Stop hook が終了コード 2 で止めると Claude Code は「続けろ」と戻すため、赤いままだと停止を繰り返す。Claude Code は stdin の `stop_hook_active` でこれを避ける設計だが、現行の Stop hook 行は前段の `stop-hook-ci-dir.mjs` が stdin を読み切るので後段からは読めない。stdin を 1 度だけ取って両方へ渡す形と、`stop_hook_active` が真ならブロックしない（ただし黙って通さない）ことを「仕様」「失敗時」「例 13・14」「完了条件 5・9」に反映した。
