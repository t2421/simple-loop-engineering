# Progress: 保護パスを `task/` へ追随させる

- **Target Spec:** `task/0017-guard-task-paths/spec.md`
- **Branch:** `feature/guard-task-paths`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`tools/check-protected-paths.mjs` と既存 `tests/protected-paths.test.mjs` を変更するため、`allow-protected-change` ラベルが要る。保護対象を増やす手順は `.claude/skills/add-protected-path` に従う。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成（`tests/protected-paths.test.mjs` に「例」8 行）
- [x] 実装 (`tools/check-protected-paths.mjs` の `APPEND_ONLY_DIRS` と `TEMPLATES`)
- [ ] CLAUDE.md「変えてはいけないもの」の一覧の更新
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 17:50 - `0016-archive-pr-ownership` のアーカイブ中に発見して spec 化。`0014-spec-progress-layout` の移行で spec が `task/` へ移ったのに、ガードの `APPEND_ONLY_DIRS` は `specs/` のままだった。**移行によってすべての spec の完了条件と例の期待値が無防備になっている。** 実測で `task/archive/0012-ci-lint/spec.md` の変更が PASS することを確認済み。最優先。未着手。
- 18:05 - 着手前に **自分が書いた spec の欠陥**に気づいた。「`task/` 配下の既存ファイルの内容変更・削除を検知する」と書いていたが、移行後は `progress.md` も `task/<id>-<slug>/` に同居する。この規則だと**すべての作業 PR が自分の進捗更新でガードに引っかかり、毎回ラベルが必要**になる。ラベルが常用されればガードは形骸化する。アーカイブ移動も、progress は Status と Target Spec を書き換えてから移すので `R<100` になり「内容が同一なら許可」では通らない。旧設計が `specs/` を保護し `progress/` を保護していなかったのは、まさにこの理由である。
- 18:07 - 人間の承認を得て spec を修正（CLAUDE.md「コミットとマージ」の spec 変更）。保護対象を `task/` 配下の既存 `spec.md` に限定し、`progress.md` は保護しないことを明記。アーカイブ移動の条件も「`spec.md` の内容が同一なら許可」に直した。「例」の表も 2 行を実態に合わせた。
- 18:10 - 実装。`APPEND_ONLY_DIRS` のエントリに任意の `basename` を持たせ、指定があればそのファイル名だけを対象にする `covers()` を追加した。`task/` は `basename: 'spec.md'`。リネーム時の「保護ディレクトリ内に留まったか」の判定も `covers()` 経由に揃えた。`TEMPLATES` に `task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md` を追加し、違反メッセージを `型（TEMPLATE）は…` に一般化した。
- 18:12 - 検証。移行で失われていた保護が回復した。`task/archive/0012-ci-lint/spec.md` の変更を DETECT、`task/TEMPLATE-spec.md` を DETECT。通るべきもの（進捗の更新、`backlog/`、新規追加）はすべて PASS。テストは 8 → 17 件に増え、`npm run ci` は全件 pass。
- 18:14 - このチェックアウトで人間が並行して `.github/workflows/ci.yml`・`package.json`・`tools/e2e-needed.mjs`・`tools/run-unit-tests.mjs` を編集していた（CI のハング対策と見られる）。**自分の 3 ファイルだけを明示して commit し、人間の変更には触れていない。** `git add -A` を使わないという 3 度の失敗からの運用。
