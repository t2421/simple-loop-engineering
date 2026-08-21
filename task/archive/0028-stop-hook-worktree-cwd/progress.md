# Progress: `0028-stop-hook-worktree-cwd`

- **Target Spec:** `task/archive/0028-stop-hook-worktree-cwd/spec.md`
- **Branch:** `feature/stop-hook-worktree-cwd`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/42
- **Status:** `Done`
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/stop-hook-ci-dir.test.mjs`。「例」の各行を注入で網羅する)
- [x] 実装 (`tools/stop-hook-ci-dir.mjs`、`.claude/settings.json` の Stop hook 差し替え)
- [x] 実 git リポジトリ + worktree での配線の実測（完了条件 6）
- [x] スクリプト失敗時に `npm run ci` を回さず hook が失敗することの再現（完了条件 7）
- [x] 新スクリプトを保護対象に追加 (`.claude/skills/add-protected-path` の手順 2〜4。CLAUDE.md 一覧・`GATE_HELPERS`・`tests/gate-helpers.test.mjs`)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `09:10` - backlog から昇格（計画用ブランチ `docs/promote-0028-stop-hook-worktree-cwd`）。`task/` にも `progress/` にも未完了の作業が無く、`node tools/start-task.mjs` が「選択可能な作業がありません」を返す状態だったため、backlog から次の 1 件を選んだ。
- `09:12` - 前提を実測で確認。`.claude/settings.json` の Stop hook は起票時のまま `cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2` で、0021-loop-hooks は `task/archive/0021-loop-hooks/` にアーカイブ済み。**穴は現に開いている。**
- `09:15` - **昇格時に決めるとされていた論点を決めた。** 判定はインラインの 1 行に収めず `tools/stop-hook-ci-dir.mjs` に切り出す。stdin の JSON 解析・git top-level の解決・フォールバックの 3 つが要り、シェルの 1 行では失敗時に意図しないディレクトリで CI が走る形（fail-open）になりやすいため。スクリプトは対象ディレクトリを 1 行出すだけとし、CI 自体は hook 側で回す（検証コマンドが `.claude/settings.json` から見える形を保つ）。
- `09:17` - **保護対象に加えると決めた。** `.claude/skills/add-protected-path` の「判断」に照らし、このスクリプトは「セッション停止時の CI をどこで回すか」を決めるため、書き換えれば変更の無いチェックアウトを指させて Stop hook を骨抜きにできる。`tools/e2e-needed.mjs`・`tools/check-progress-coupling.mjs` と同じ性質。手順 2〜4（CLAUDE.md の一覧・`GATE_HELPERS`・`tests/gate-helpers.test.mjs`）を完了条件 8 に入れた。`tools/check-protected-paths.mjs` 自体が保護対象なので、実装 PR には `allow-protected-change` ラベルが要る（完了条件 9）。
- `18:55` - 実装。`tools/stop-hook-ci-dir.mjs` を新規作成（`readCwd`・`resolveCiDir` を注入可能な純関数として export。git 呼び出しは `gitTopLevel` として注入）。`.claude/settings.json` の Stop hook を `CI_DIR="$(node "$CLAUDE_PROJECT_DIR/tools/stop-hook-ci-dir.mjs")" && cd "$CI_DIR" && npm run ci 1>&2` に差し替え。スクリプトが非 0 で終わると `$(...)` 代入の終了コードが非 0 になり `&&` 連鎖が止まるので、CI を回さないまま成功扱いにはならない。
- `19:00` - `tests/stop-hook-ci-dir.test.mjs` を作成。「例」の各行を stdin と `CLAUDE_PROJECT_DIR` の注入で網羅（ガードの 2 行は `findViolations` を直接呼んで固定）。加えて実 git リポジトリに `git worktree add` した配線の実測（完了条件 6）、`.claude/settings.json` から読んだ hook コマンド全体の実行で「壊れた worktree の CI が走り hook が失敗する」「スクリプト失敗時は CI を回さず hook が失敗する」を再現（完了条件 7・例の最終行）。15 件すべて pass。
- `19:05` - 保護対象に追加（`add-protected-path` 手順 2〜4）。CLAUDE.md「変えてはいけないもの」に 1 行、`GATE_HELPERS` に `tools/stop-hook-ci-dir.mjs`、`tests/gate-helpers.test.mjs` に違反側（M / D / R）と許可側（A）のケースを追加。
- `19:11` - Verify (自己)。`npm run ci` 全緑（lint・lint:docs・ユニット 360 件 pass）。ガードは base 版で評価されるため本 PR では新保護は効かない（`add-protected-path` の「効き始めるのはマージ後から」どおり）。`tools/check-protected-paths.mjs` と既存 `tests/` の変更が違反として検知される想定なので、PR には `allow-protected-change` ラベルが要る。
- `10:30` - `codex-reviewer` 1 回目で **承認**（Critical 0 / High 0 / Medium 2 / Low 3）。完了条件 6 の実測（`ok 11`・`ok 14`）が主張どおり配線を検証していることも確認された。保護対象化がマージ後に効くこともレビュアーが実測（`tools/stop-hook-ci-dir.mjs` の書き換えを検知）。Medium 2 件は別作業への申し送りとした: (1) `npm run ci` の失敗（exit 1）は Stop hook では `hook_non_blocking_error` になり停止をブロックしない — ただし 0021 由来の既存挙動で本作業の差分は `cd` 先だけ、(2) 「プライマリに居たまま worktree のファイルを絶対パスで編集する」形では hook の `cwd` がプライマリのままでこの修正が発火しない — spec が `cwd` を情報源と定めた設計上の残差。PR #42 を `allow-protected-change` ラベル付きで作成。
