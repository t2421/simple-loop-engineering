# Progress: `0024-progress-pr-coupling`

- **Target Spec:** `task/0024-progress-pr-coupling/spec.md`
- **Branch:** `feature/progress-pr-coupling`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/progress-coupling.test.mjs`)
- [x] 実装 (`tools/check-progress-coupling.mjs`、`.github/workflows/guard.yml` へのジョブ追加)
- [x] 新チェッカーを保護対象に追加 (`.claude/skills/add-protected-path` の手順。`GATE_HELPERS`・CLAUDE.md 一覧・`tests/gate-helpers.test.mjs`・spec の「対象」「仕様」「例」)
- [x] 帰属の検証 (更新された progress の **Branch** と PR の head ブランチを照合する)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`.github/workflows/` の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `06:05` - テストを先に作成し RED を確認（`ERR_MODULE_NOT_FOUND: tools/check-progress-coupling.mjs`）。判定は差分パス一覧とラベルを注入する純関数（`evaluateCoupling`）として公開し、CLI は `resolveCoupling` 経由で差分を取る。
- `06:20` - 実装後 `npm run ci` が 204 tests / 0 fail で通過（新規 20 件）。仕様の「例」6 行はすべて `tests/progress-coupling.test.mjs` の「例1〜例6」で網羅。
- `06:25` - progress の数え方は「パス」ではなく「作業ディレクトリ」の集合にした。移動元・移動先の両方が同じ作業を指すときに 2 件と誤判定しないため。
- `06:30` - `guard.yml` に `progress-coupling` ジョブを追加。`protected-paths` と同じく base リビジョンのチェッカーを一時ファイルへ取り出して実行する（候補側を実行すると、判定を骨抜きにする変更と実装変更を同じ PR に入れるだけで回避できる）。`${{ }}` は env 経由でのみ渡す。
- `06:35` - 差分の取得・解釈に失敗したときは fail-closed（終了コード 1）。`resolveCoupling` の `error: 'diff'` で表現し、テストで固定した。
- `06:40` - `codex-reviewer` の 1 回目が不承認（Critical 0 / High 2 / Medium 1 / Low 1）。指摘の修正に着手。
- `06:45` - **High-2 の修正。** `parseNameStatus` が status を捨てていたため、削除（`D`）と `task/<id>-<slug>/` から出ていくリネームの移動元まで「progress を更新した」と数えていた。実装 PR に `git rm task/<id>-<slug>/progress.md` を 1 行足すだけでこのゲートを通せる状態（`progress.md` は `check-protected-paths.mjs` の `task/` 保護から除外されているので他のガードも止めない）。status を保持し、`headPaths()`（候補側に実在し続けるパスだけ）を通したものだけを数えるようにした。実装変更の検知は従来どおり移動元も見る（progress を要求する側なので広く取るのが安全側）。テストに削除・archive リネームの回帰ケースを追加。
- `06:50` - **Medium-3 の修正。** `task/` 直下の任意のディレクトリを受け入れていたため、`task/not-a-work/progress.md` を 1 つ足すだけでゲートを迂回できた。作業ディレクトリ名の検査を追加。文法は `tools/archive.mjs` の `WORK_NAME_RE`（`^\d{4}-[^/\\]+$` + 前後空白の拒否）・`tools/start-task.mjs` の `WORK_DIR_RE` と**同じ広さ**に揃えた。slug の文字種を絞ると `0026-api_v2` のような正当な作業を誤って弾く（`0018-archive-tool-task-layout` の試行ログ `11:15`・`11:16` で 3 回繰り返した誤り）。誤爆しないことをテストで固定。
- `06:55` - **High-1 の修正（spec 変更を含む）。** `tools/check-progress-coupling.mjs` が保護対象外だった。ガードは base 版を実行するので骨抜き PR 自体は無傷の base 版で検査されるが、人間がマージした瞬間に以後の base が骨抜き版になる（2 PR で恒久的に無効化できる）。`tools/run-unit-tests.mjs`・`tools/e2e-needed.mjs` と同じ性質なので `.claude/skills/add-protected-path` の手順に従い、`GATE_HELPERS` に追加・CLAUDE.md「変えてはいけないもの」に 1 行追加・`tests/gate-helpers.test.mjs` に回帰テスト（変更・削除・リネームは違反、新規追加は許可）を追加した。**spec の変更内容と理由:** レビュー指摘 High-1 を受け、人間の承認を得て spec の「対象」に `tools/check-protected-paths.mjs` の `GATE_HELPERS`・`CLAUDE.md`・`tests/gate-helpers.test.mjs` を追記した。追記は保護対象を**増やす**もので、完了条件・例の期待値・「仕様」「範囲外」は変更していない（検証を弱めない改訂）。
- `07:00` - **Low-4 の修正。** CLI の fail-closed テストが存在しない ref 名（`refs/does-not-exist-xyz`）の解決を待って遅くなる環境があったため、git リポジトリでない一時ディレクトリで走らせる形に変えた。ローカルで即座に失敗し、`差分を取得できませんでした` の表示まで固定できる。
- `07:05` - 修正の実測。旧版（`5579595`）と新版を、実際に git リポジトリを作って同じ差分に当て、3 経路（削除・archive リネーム・使い捨てパス）が旧版では exit 0、新版では exit 1 になることを確認。保護についても、`tools/check-progress-coupling.mjs` を書き換えた差分を新版のガードが `検証の委譲先は変更も移動もできない` として検知することを確認（旧版のガードは検知しない）。`npm run ci` は 215 tests / 0 fail。
- `07:20` - `codex-reviewer` の 2 回目が不承認（Critical 0 / High 1 / Medium 1）。通算 2 回目（上限 5 回）。
- `07:30` - **High の修正。** 前回の修正は「作業名の形でないディレクトリ」を弾くところまでしか届いておらず、**`NNNN-slug` の形をした progress.md を 1 つ足すだけ**でゲートを通せた。レビュアーの実測どおり、`A task/9999-disposable/progress.md`（新規追加）も `R task/0026-a/progress.md -> task/9999-x/progress.md`（使い捨ての作業名へのリネーム）も旧版では exit 0。CLAUDE.md「コミットとマージ」は spec + progress の新規作成を計画用の docs PR で先に main へ入れると定めているので、実装 PR の時点でその作業の progress.md は base（merge-base）に存在する。そこで `progressWorks()` が数える対象を「**base に既に存在する** `task/<id>-<slug>/progress.md` の、その場での更新」に限定した。判定は注入可能な純関数のまま（`progressWorks(changes, baseHas)`・`evaluateCoupling({..., baseHas})`）にし、CLI 側（`resolveCoupling`）で `git merge-base` → `git cat-file -e <mergeBase>:<path>` を配線した。既定値は `NOTHING_IN_BASE`（＝「base に無い」）とし、渡し忘れたときに**落ちる側**へ倒れるようにした（`check-protected-paths.mjs` の `baseHas` は既定が通る向きなので JSDoc で注意しているが、こちらは既定そのものを安全側にしたうえで同じ注意書きを置いた）。`git cat-file -e` の「無い」は正常な結果なので stderr を捨て、fatal をログに出さない。
- `07:35` - 回帰テストを追加。純関数側に 3 件（`A` の新規追加は数えない／既存 progress を base に無い作業名へリネームしても数えない／base にある progress の `M` は通過）＋ 既定値の fail-closed。さらに **CLI の配線**を実 git リポジトリ（一時ディレクトリに `git init`）で確かめるテストを 3 件追加した（`baseHas` を渡し忘れる配線ミスは純関数のテストでは捕まらないため）。旧版（`4601766`）と新版を同じ差分に当てた実測では、BYPASS A / B が exit 0 → exit 1 に変わり、正常系（base にある progress の更新）は exit 0 のまま。自ブランチ（`origin/main...HEAD`）に対しても exit 0（`作業: 0024-progress-pr-coupling`）。`npm run ci` は 224 tests / 0 fail。
- `07:40` - **Medium は未対応。** `.claude/skills/add-protected-path` は新しい保護対象を spec の「仕様」の列挙と「例」の表の両方に書くことを求めており、指摘は妥当である。ただし着手後の spec 変更は人間の承認が要る領域なので、エージェント判断では書き換えない。**人間の判断待ち**として記録に留める（前回追記した「対象」の 1 行は承認済みのため維持）。
- `07:50` - `codex-reviewer` の 3 回目が不承認（Critical 0 / High 1 / Medium 1）。通算 3 回目（上限 5 回）。
- `08:00` - **High の修正。** 前回の「base に存在する progress の、その場の更新だけを数える」は**裏面**を作っていた。数えない ＝ **黙って捨てる** なので、有効な progress 更新 1 件に別作業の progress の `A` / `D` / `R` を同乗させると `works` は 1 件のままで通ってしまう（レビュアーの実測 P1-A / P1-D / P1-R がいずれも exit 0）。spec の「失敗時」の「progress 更新が 2 件以上: チェック失敗（1 PR = 1 作業）」に反する。数え方を**陽性カウント**から**陰性拒否**に変え、`strayProgressPaths()` を足した。`task/<id>-<slug>/progress.md` に当たる差分のうち、その場の更新（base に存在するパスの `M`）以外——新規追加（`A`）、削除（`D`）、base に無い作業名へのリネーム先、作業ディレクトリ外へ出るリネーム元（archive 移動を含む）——を**拒否対象**として集め、1 件でもあれば `works.length === 1` でも失敗させる（理由コード `stray`）。メッセージは「計画用ブランチの docs PR へ／アーカイブは main への直接コミットへ分けろ」という誘導にした。
- `08:05` - **判定の順序に注意。** `docs-only` の判定を `stray` より先に置いた。計画用ブランチの docs PR は新しい作業の progress.md を**新規追加**する（＝ stray）ので、順序を逆にすると正当な docs PR が落ちる。`bypass-label` → `docs-only` → `missing` → `stray` → `multiple` → `coupled` の順。`missing` を `stray` より先に置いたのは、progress を消しただけ・使い捨てを足しただけの PR に従来どおり「更新が含まれていません」を出すため（どちらも失敗であることは変わらない）。
- `08:10` - 回帰テストを追加（純関数 8 件 ＋ CLI 5 件、計 51 件）。塞いだ 3 経路（P1-A / P1-D / P1-R）に加え、壊してはいけない性質——docs のみの PR（progress の新規追加・archive 移動を含む）が通ること、`no-progress-needed` が stray があっても効くこと、正当な実装 PR が通ること——を実 git リポジトリの CLI テストで固定した。実測では旧版（`d24ac96`）で exit 0 だった P1-A / P1-D / P1-R が新版で exit 1 になり、docs のみ・ラベル・正当な実装 PR・自ブランチ（`origin/main...HEAD`、作業 `0024-progress-pr-coupling`）はいずれも exit 0 のまま。fail-closed（差分取得失敗・base ref 未指定・`baseHas` 未注入・merge-base 未解決）も従来どおり。`npm run ci` は 237 tests / 0 fail。
- `08:20` - `codex-reviewer` の 4 回目が不承認（Critical 0 / High 1 / Medium 1）。通算 4 回目（上限 5 回）。次で High が残ると規約により Blocked（人間の判断待ち）になる。
- `08:30` - main（`c8831b9`）を取り込み。CLAUDE.md は競合しなかった（main 側の追記は「仕様」節の spec-author の行、こちら側は「変えてはいけないもの」の 1 行で、独立している）。`npm ci` の後 `npm run ci` が 269 tests / 0 fail。
- `08:40` - **High の修正（帰属の検証）。** 「実装変更 + 進行中の progress ちょうど 1 件」まで見ていたが、**その progress がこの PR の作業のものか**を見ていなかった。レビュアーの実測どおり、`feature/a` が `src/math.mjs` を変え、更新するのは別作業 `0027-b` の progress だけ、という差分が exit 0 で通っていた。`tools/archive.mjs` の `checkOwnership()`（`0016-archive-pr-ownership`）が「マージ済みであることだけでは足りない。別作業の PR を貼れば通る」を解いたのと同型なので、**同じ形で解いた**——PR の head ブランチと進捗の **Branch** メタ情報を照合する。判定は純関数 `checkAttribution(work, { headBranch, branchOf })` に切り出し、既定の `branchOf` は `NO_BRANCH`（＝「読めない」）にして、配線を忘れたら落ちる側へ倒した（`NOTHING_IN_BASE` と同じ考え方）。理由コードは `foreign`。**Branch** の書式解釈は `tools/archive.mjs` の `readBranch()` を写した（ローカル import を持てないので import ではなく複製。両方を揃える旨を JSDoc に書いた）。
- `08:45` - **判定順は `bypass-label` → `docs-only` → `missing` → `stray` → `multiple` → `foreign` → `coupled`。** 帰属は「作業がちょうど 1 件に決まった後」にしか問えないので最後に置いた。2 作業混載は帰属ではなく件数の理由で落とす（誘導が変わる）。
- `08:50` - **head ブランチ名が得られないときの扱い。** CI では `GITHUB_HEAD_REF` から得る（`guard.yml` の `env:` に明示。`${{ }}` は `run:` へ直接展開しない）。得られないときは帰属の照合を**行わない**。これはローカルで CLI を手で回す経路で、ゲートの実体は `pull_request` イベントで動く CI 側だから許される。**抜け道にしないため**、`GITHUB_ACTIONS=true` なのに `GITHUB_HEAD_REF` が空なら、黙って飛ばさず終了コード 1 で落とす（他のイベントで動かした・env を外した、という配線の異常を検知する）。この扱いは spec の「仕様」「失敗時」「例」に書いた。
- `08:55` - **spec の変更内容と理由:** レビュー指摘 High を受け、人間の承認を得て spec に帰属検証を追記した。「仕様」に 2 行（Branch と head ブランチの照合／head ブランチ名が得られないときの扱い）、「失敗時」に 2 行、「例」に 4 行。あわせて、前回まで**人間の判断待ち**として保留していた Medium（`.claude/skills/add-protected-path` の手順 5 が求める「仕様」「例」への保護の記載）も、同じ機会に人間の承認を得て埋めた——「仕様」に 1 行、「例」に 2 行。**いずれも検証を強める追記で、既存の完了条件・例の期待値・「範囲外」は書き換えていない。**
- `09:00` - 回帰テストを追加（純関数 9 件 ＋ CLI 5 件 ＋ ガードの自己保護 2 件）。CLI テストの `runCli` は `GITHUB_HEAD_REF`・`GITHUB_ACTIONS` を**既定で落とす**ようにした（実行環境にたまたま入っていると判定が変わるため、必要なテストだけが明示的に足す）。完了条件 5 が「例」の各行を `tests/progress-coupling.test.mjs` で網羅することを求めているので、保護の 2 行も同ファイルから `findViolations` を呼んで固定した（`tests/gate-helpers.test.mjs` と同じ判定を、網羅先に合わせて置いた）。
- `09:05` - 実測。旧版（`50c60f5`）と新版を同じ差分に当て、レビュアーの経路（`M src/math.mjs` ＋ `M task/0027-b/progress.md`、head は `feature/a`）が **exit 0 → exit 1**（`Branch: feature/b` / `head: feature/a`）に変わることを確認。壊してはいけない性質も実 git で確認した——docs のみ（新規 spec + progress を含む）exit 0、`no-progress-needed` exit 0、正当な実装 PR exit 0、stray の `A` / `D` / `R` は exit 1、merge-base 未解決・差分取得失敗・`GITHUB_ACTIONS` で head ref 欠落はいずれも exit 1（`baseHas` 未注入の fail-closed はユニットテスト）。この作業自身のブランチ（`origin/main...HEAD`、`GITHUB_HEAD_REF=feature/progress-pr-coupling`）も exit 0 で `作業: 0024-progress-pr-coupling`。`npm run ci` は 286 tests / 0 fail。
