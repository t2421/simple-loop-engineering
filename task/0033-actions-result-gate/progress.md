# Progress: `0033-actions-result-gate`

- **Target Spec:** `task/0033-actions-result-gate/spec.md`
- **Branch:** `feat/0033-actions-result-gate`
- **PR:** 未作成
- **Status:** In Progress (Phase: Verify (外部))
- **Complexity:** M

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/check-actions.test.mjs`。判定表の各行を注入モックで)
- [x] 実装 (`tools/check-actions.mjs`。純関数を export し、`gh` 呼び出し・時刻・待機を注入)
- [x] `.claude/settings.json` の更新（Stop hook 後段への追加、PostToolUse `Bash` matcher の追加。既存の `npm run ci` を壊さない）
- [x] `CLAUDE.md` 開発ループ 6. Record への 1 行追記
- [x] 実環境での再現確認（赤 run でブロック・緑で通過・fail-open の stderr。出力を会話に貼る）
- [x] 停止ループ対策の確認（`stop_hook_active` が真ならブロックしないこと、前段と後段の両方が stdin を読めること）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 00:00 - spec / progress を起草（spec-author）。実装は未着手。
- 09:20 - 起草をレビューし、**停止ループ対策**を仕様に足した。Stop hook が終了コード 2 で止めると Claude Code は「続けろ」と戻すため、赤いままだと停止を繰り返す。Claude Code は stdin の `stop_hook_active` でこれを避ける設計だが、現行の Stop hook 行は前段の `stop-hook-ci-dir.mjs` が stdin を読み切るので後段からは読めない。stdin を 1 度だけ取って両方へ渡す形と、`stop_hook_active` が真ならブロックしない（ただし黙って通さない）ことを「仕様」「失敗時」「例 13・14」「完了条件 5・9」に反映した。
- 09:50 - テストを先に書いて RED を確認（`tools/check-actions.mjs` が無く exit 1）。そのうえで実装し GREEN（`node --test tests/check-actions.test.mjs` が 20 pass・0 fail）。判定表の各行は注入モック（`fetchChecks`・`now`・`sleep`）で検証しており、実時間の待機も実ネットワークも使わない。
- 09:55 - hook を配線。Stop hook は `INPUT="$(cat)"` で stdin を 1 度だけ取り、`printf %s "$INPUT" | node ...` で前段（`stop-hook-ci-dir.mjs`）と後段（`check-actions.mjs`）の両方へ渡す形にした。**herestring（`<<<`）は bash 依存なので使わない。** 既存の `npm run ci` は置換せず `&&` 連結の中央に残した。PostToolUse は `Bash` matcher で `--on-bash-post` を呼ぶ。
- 09:56 - 例 14 を実測。同じ stdin から前段が `CI_DIR=.../worktrees/feat/0033-actions-result-gate` を出し、後段が `stop_hook_active = true` を読めた。前段が食い切らないことを確認。
- 09:57 - 例 10・11 を実測。`git push` を含むコマンドでリマインドを出して exit 2、`npm run ci` では無出力で exit 0。
- 10:00 - **完了条件 6（赤）を実測。** 赤い run を持つコミットを新たに作る代わりに、PR #47 の 1 回目のコミット `58b1ce9`（`protected-paths` が failure。main の祖先として残っている）を detached worktree でチェックアウトして実行した。exit 2 で、ジョブ名 `protected-paths: failure`・ジョブ URL・`gh run view --log-failed --job 96941495991` が出た。故意に失敗する commit を push せずに済むので、CI を無駄に回さない。
- 10:01 - **完了条件 7 を実測。** `gh` を PATH から外して実行し、`check-actions: Actions の状態を取得できないため判定を飛ばします（spawnSync gh ENOENT）。` を stderr に出して exit 0。fail-open だが黙っては通していない。
- 10:05 - 完了条件 8 を実測。`npm run ci` が 380 pass・0 fail（新規 20 件ぶん増）。`git diff main -- package.json .github/workflows/` は空。`node tools/check-protected-paths.mjs main` は `保護パスの変更はありません`。
- 10:20 - **Verify (外部) 1 回目: `codex-reviewer` が不承認。Critical 0 件・High 4 件。** 指摘はいずれも妥当なので直した。
- 10:35 - **H1 修正（機構の中核が素通りする経路）。** ワークフローは別々に起動するので、push 直後は `verify` の check-run だけが成功で返り `guard`・`preview` が未作成、という瞬間がある。旧実装はそれを緑と読んで即 exit 0 していた。**同じ件数の成功を 2 回続けて観測するまで通さない**（落ち着くまで見る）形に変えた。回帰テストを追加（1 回目は verify のみ成功 → 2 回目に preview の failure が現れる → exit 2）。
- 10:38 - **H2 修正（停止ループの再発）。** 旧実装の `halt()` は exit を 0 に変えるだけで、そこへ到達するのは上限到達後だった。つまり 2 度目以降の停止でも 480 秒待たされ、停止のたびに 8 分固まる。`stop_hook_active` が真なら **1 度も待たずに** 現在の状態を述べて通す形に変えた。回帰テストで `sleep` の呼び出し回数が 0 であることを検証している。
- 10:42 - **H3 修正（上限がハーネス上成立しない）。** Claude Code の hook は既定 60 秒でタイムアウトする。`npm run ci`（約 50 秒）と待機（既定 480 秒）が直列に走るので、明示しないと待機の途中で hook ごと kill される。`.claude/settings.json` の Stop hook に `"timeout": 900` を足した。
- 10:45 - **H4 修正（完了条件 5 の未達）。** `isPushed()` が `execFileSync` を直接呼んでいて注入できず、例 1（未 push → 通す）がテストできていなかった。`decide()` の注入引数にし、未 push なら `gh` を呼ばずに通すことをテストで検証した。
- 10:47 - **M1 修正。** 仕様の判定表が通すのは `success` / `skipped` だけなのに、実装は `neutral` を足して**通す集合を広げていた**。仕様に戻し、`neutral` も block になることをテストで固定した。M3（TTY で stdin 待ちになりうる）は `process.stdin.isTTY` のガードで対処。L1（ページング）・L2（Bash ごとの node 起動）は現状の規模では実害が無いので対応しない。
- 10:50 - 修正後の `npm run ci` は 384 pass・0 fail（テストは 20 → 24 件）。
