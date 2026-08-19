# Progress: 保護パスを `task/` へ追随させる

- **Target Spec:** `task/0017-guard-task-paths/spec.md`
- **Branch:** `feature/guard-task-paths-only`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

`tools/check-protected-paths.mjs` と既存 `tests/protected-paths.test.mjs` を変更するため、`allow-protected-change` ラベルが要る。保護対象を増やす手順は `.claude/skills/add-protected-path` に従う。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成（`tests/protected-paths.test.mjs` に「例」8 行）
- [x] 実装 (`tools/check-protected-paths.mjs` の `APPEND_ONLY_DIRS` と `TEMPLATES`)
- [x] CLAUDE.md「変えてはいけないもの」の一覧の更新
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 17:50 - `0016-archive-pr-ownership` のアーカイブ中に発見して spec 化。`0014-spec-progress-layout` の移行で spec が `task/` へ移ったのに、ガードの `APPEND_ONLY_DIRS` は `specs/` のままだった。**移行によってすべての spec の完了条件と例の期待値が無防備になっている。** 実測で `task/archive/0012-ci-lint/spec.md` の変更が PASS することを確認済み。最優先。未着手。
- 18:05 - 着手前に **自分が書いた spec の欠陥**に気づいた。「`task/` 配下の既存ファイルの内容変更・削除を検知する」と書いていたが、移行後は `progress.md` も `task/<id>-<slug>/` に同居する。この規則だと**すべての作業 PR が自分の進捗更新でガードに引っかかり、毎回ラベルが必要**になる。ラベルが常用されればガードは形骸化する。アーカイブ移動も、progress は Status と Target Spec を書き換えてから移すので `R<100` になり「内容が同一なら許可」では通らない。旧設計が `specs/` を保護し `progress/` を保護していなかったのは、まさにこの理由である。
- 18:07 - 人間の承認を得て spec を修正（CLAUDE.md「コミットとマージ」の spec 変更）。保護対象を `task/` 配下の既存 `spec.md` に限定し、`progress.md` は保護しないことを明記。アーカイブ移動の条件も「`spec.md` の内容が同一なら許可」に直した。「例」の表も 2 行を実態に合わせた。
- 18:10 - 実装。`APPEND_ONLY_DIRS` のエントリに任意の `basename` を持たせ、指定があればそのファイル名だけを対象にする `covers()` を追加した。`task/` は `basename: 'spec.md'`。リネーム時の「保護ディレクトリ内に留まったか」の判定も `covers()` 経由に揃えた。`TEMPLATES` に `task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md` を追加し、違反メッセージを `型（TEMPLATE）は…` に一般化した。
- 18:12 - 検証。移行で失われていた保護が回復した。`task/archive/0012-ci-lint/spec.md` の変更を DETECT、`task/TEMPLATE-spec.md` を DETECT。通るべきもの（進捗の更新、`backlog/`、新規追加）はすべて PASS。テストは 37 → 46 件に増え、`npm run ci` は全件 pass。
- 18:14 - このチェックアウトで人間が並行して `.github/workflows/ci.yml`・`package.json`・`tools/e2e-needed.mjs`・`tools/run-unit-tests.mjs` を編集していた（CI のハング対策と見られる）。**自分の 3 ファイルだけを明示して commit し、人間の変更には触れていない。** `git add -A` を使わないという 3 度の失敗からの運用。
- 18:20 - 人間が `feature/guard-task-paths` に別作業（`0019-ci-e2e-when-needed`）の spec/progress をコミットしていたため、そのまま PR にすると「進行中の作業ブランチに別の spec を置かない」に反する。人間の判断で分離し、main から切った `feature/guard-task-paths-only` に自分のコミットだけを cherry-pick した。元ブランチは触っていないので 0019 は残っている。Branch 欄を更新。
- 18:35 - `codex-reviewer` が **不承認**（Critical 0 / High 2）。spec を `spec.md` 限定に直した判断自体は「保護を緩めたには当たらない」と支持された（旧設計の意味論をそのまま移植しただけであり、progress を保護すると全 PR がラベルを要求してかえって保護が弱くなる）。
  - High-1: **リネーム免除が広すぎ、凍結を完全に迂回できた。** `stayedInside` が「移動先も `task/**/spec.md` か」しか見ていなかったため、`task/archive/0012-x/spec.md → task/0012-x/spec.md`（アーカイブ解除）や `task/A/spec.md → task/B/spec.md`（付け替え）が通る。さらに重いのは **退避 + 跡地への新規追加**で、「移動は許可」「新規追加は許可」の合わせ技で完了条件を緩めた spec に丸ごとすり替えられた。再現して確認。
  - High-2: spec の「対象」と「仕様」が CLAUDE.md「変えてはいけないもの」の更新を要求しているのに未着手だった。完了条件 1 が未達。
- 18:38 - High-1 を修正。免除を「`<prefix>X` → `<prefix>archive/X` の対応する遷移」だけに絞る `archiveDestination()` を足した。`task/` と `specs/` の両方に効く。あわせて、同じ差分で移動元になったパスへの新規追加を「すり替え」として弾く判定を入れた。**この穴は `specs/` の頃から存在した設計の穴で、移行によって影響が「一部の spec」から「全 spec」に広がっていた。** 0017 の目的（移行で失われた凍結の回復）に対して、回復した保護が 2 手で外せる状態は看過できないため、範囲内として直した。
- 18:40 - 検証。アーカイブ解除・付け替え・すり替えをすべて DETECT。正当なアーカイブ移動（`task/` と旧 `specs/` の両方）と、アーカイブ移動に無関係な新規追加が同居する場合は PASS（誤検知なし）。回帰テストを 4 件追加し、テストは 46 → 50 件。
- 18:42 - High-2 を修正。CLAUDE.md「変えてはいけないもの」の一覧を `task/` の `spec.md`・`task/TEMPLATE-*.md` を含む形に直し、旧 `specs/` / `progress/` の資産も 1 行に集約した。チェックボックスも閉じた。
- 18:43 - Low 1 件も訂正。18:12 の「テストは 8 → 17 件」は誤りで、実際は 37 → 46 件だった（追加分だけを数えていた）。
