# Progress: `0028-stop-hook-worktree-cwd`

- **Target Spec:** `task/0028-stop-hook-worktree-cwd/spec.md`
- **Branch:** `feature/stop-hook-worktree-cwd`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/stop-hook-ci-dir.test.mjs`。「例」の各行を注入で網羅する)
- [ ] 実装 (`tools/stop-hook-ci-dir.mjs`、`.claude/settings.json` の Stop hook 差し替え)
- [ ] 実 git リポジトリ + worktree での配線の実測（完了条件 6）
- [ ] スクリプト失敗時に `npm run ci` を回さず hook が失敗することの再現（完了条件 7）
- [ ] 新スクリプトを保護対象に追加 (`.claude/skills/add-protected-path` の手順 2〜4。CLAUDE.md 一覧・`GATE_HELPERS`・`tests/gate-helpers.test.mjs`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `09:10` - backlog から昇格（計画用ブランチ `docs/promote-0028-stop-hook-worktree-cwd`）。`task/` にも `progress/` にも未完了の作業が無く、`node tools/start-task.mjs` が「選択可能な作業がありません」を返す状態だったため、backlog から次の 1 件を選んだ。
- `09:12` - 前提を実測で確認。`.claude/settings.json` の Stop hook は起票時のまま `cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2` で、0021-loop-hooks は `task/archive/0021-loop-hooks/` にアーカイブ済み。**穴は現に開いている。**
- `09:15` - **昇格時に決めるとされていた論点を決めた。** 判定はインラインの 1 行に収めず `tools/stop-hook-ci-dir.mjs` に切り出す。stdin の JSON 解析・git top-level の解決・フォールバックの 3 つが要り、シェルの 1 行では失敗時に意図しないディレクトリで CI が走る形（fail-open）になりやすいため。スクリプトは対象ディレクトリを 1 行出すだけとし、CI 自体は hook 側で回す（検証コマンドが `.claude/settings.json` から見える形を保つ）。
- `09:17` - **保護対象に加えると決めた。** `.claude/skills/add-protected-path` の「判断」に照らし、このスクリプトは「セッション停止時の CI をどこで回すか」を決めるため、書き換えれば変更の無いチェックアウトを指させて Stop hook を骨抜きにできる。`tools/e2e-needed.mjs`・`tools/check-progress-coupling.mjs` と同じ性質。手順 2〜4（CLAUDE.md の一覧・`GATE_HELPERS`・`tests/gate-helpers.test.mjs`）を完了条件 8 に入れた。`tools/check-protected-paths.mjs` 自体が保護対象なので、実装 PR には `allow-protected-change` ラベルが要る（完了条件 9）。
