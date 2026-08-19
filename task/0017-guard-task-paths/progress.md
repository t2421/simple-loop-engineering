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
- 18:55 - 再レビュー（2 回目）で **承認**（Critical 0 / High 0 / Medium 2 / Low 3）。High 2 件の解消が確認された。`D`+`A` によるすり替えは「git は base と head の両方に存在するパスを必ず `M` として出す」ため構造的に不可能で、`M` 判定が先に捕まえるとの裏取りも得た。
- 18:58 - M-1 を修正。`archiveDestination()` が移動元に `archive/` 配下を取れるため、`task/archive/X/spec.md → task/archive/archive/X/spec.md` が通っていた。移動元が `<prefix>archive/` の外であることを免除の条件に足した。旧 `specs/` にも同じく効く。
- 19:00 - **M-2 は私が作った穴だった。** `basename: 'spec.md'` で対象を絞ったため、(a) 別名 spec（`spec-v2.md`）を足して **Target Spec** をそこへ向ける迂回、(b) Figma 抽出物の書き換えが素通りしていた。CLAUDE.md「見た目」は抽出した JSON・PNG を**見た目の完了条件の正**と定めており、抽出物も期待値である。旧 `specs/` 設計は配下を全面保護していたので、この 2 経路は絞り込みによって生まれたものだった。
- 19:03 - 人間の承認を得て spec を「除外するのは `progress.md` だけ」に変更し、実装も `basename`（含める）から `exclude`（除く）に反転した。**保護は広がり、進捗更新は妨げない。** 「例」の表にも 4 行を追加。
- 19:05 - 12 経路を通しで確認。検知すべき 7 件（完了条件の書き換え・Figma 抽出物・別名 spec・型・archive の入れ子・別作業への付け替え・退避+すり替え）をすべて DETECT、通すべき 5 件（進捗の更新・backlog・新規追加・正当なアーカイブ移動・進捗のアーカイブ移動）をすべて PASS。`npm run ci` は 147 pass / 0 fail。
- 19:07 - **人間の作業ツリーを汚す事故を起こした。** 人間がこのチェックアウトを `feature/ci-e2e-when-needed` に切り替えたあと、それに気づかず `tests/protected-paths.test.mjs` へテストを追記していた。該当箇所だけ `git checkout --` で戻し、人間の他の変更には触れていない。以後は `.worktrees/feature/guard-task-paths-only` で作業する。**自分でマージした「1 つのチェックアウトで 2 作業を持たない」を破っていた。** 並行作業をするなら最初から worktree を使う。
- 19:08 - なお人間の `GATE_HELPERS`（`tools/run-unit-tests.mjs` / `tools/e2e-needed.mjs` の保護）と本作業は、どちらも `tools/check-protected-paths.mjs` の同じ領域を変更する。規約どおり後からマージする側が解決する。
- 19:20 - 再レビュー（3 回目）で **不承認**（Critical 0 / High 2 / Medium 2 / Low 3）。
  - **High-1 は私の誤報だった。** 19:05 に「別名 spec を DETECT」と報告したが、私が試したのは `M task/0017-foo/spec-v2.md`（既存ファイルの変更）で、実際の攻撃は `A`（新規追加）である。`A` は素通りしていた。**検証すべき経路と違うものを試して「塞がった」と報告した。** spec の「例」も「追加して」と書いており、実装・テスト・報告のすべてが食い違っていた。
  - High-2: 跡地への外部からのリネームイン。`movedAwayFrom` を `A` でしか見ていなかった。レビュアーは「実 git 経路では `M` が先に捕まえるので悪用不能」と判定したが、防御の非対称は残るため 1 行で塞いだ。
  - Medium-1: CLAUDE.md が実装より狭い記述のままだった。
  - Medium-2: **今回の退行。** `archiveMove: false` の `tests/` に対して「`tests/archive/` への移動以外はできない」という、存在しない逃げ道を案内するメッセージを出していた。
- 19:25 - High-1 を修正。`specFile` を持つディレクトリ（`task/` のみ）で、作業ディレクトリ直下に `spec.md` / `progress.md` 以外の `.md` を新規追加することを違反にした。旧 `specs/` はフラット命名（`specs/<名前>.md`）なので対象外にする必要があり、`specFile` フラグで区別した。抽出物（`.json` / `.png`）の追加は引き続き許可する。spec の「仕様」にもこの例外を明記した（「例」が既に要求していた内容の明文化）。
- 19:28 - High-2 を修正（リネーム先が跡地なら弾く）。Medium-1 を修正（CLAUDE.md を「`task/` 配下のファイル全部。除外は各作業ディレクトリ直下の `progress.md` だけ」に）。Medium-2 を修正（`archiveMove` の有無でメッセージを分ける）。Low-1 も修正し、除外を作業ディレクトリ直下の 1 階層に限定した（`task/progress.md` や `task/X/sub/progress.md` が外れていた）。
- 19:30 - 途中で 2 度、自分のミスで足止めした。(1) `SPEC_FILE` を使用箇所より後に定義して TDZ エラーにした。(2) Medium-2 の置換に assert を付けず、当たっていないことにテストで初めて気づいた。**文字列置換は必ず assert を付ける。**
- 19:32 - テストを 46 → 58 件に拡充。`npm run ci` は 152 pass / 0 fail。
