# Progress: `0024-progress-pr-coupling`

- **Target Spec:** `task/0024-progress-pr-coupling/spec.md`
- **Branch:** `feature/progress-pr-coupling`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/37
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/progress-coupling.test.mjs`)
- [x] 実装 (`tools/check-progress-coupling.mjs`、`.github/workflows/guard.yml` へのジョブ追加)
- [x] 新チェッカーを保護対象に追加 (`.claude/skills/add-protected-path` の手順。`GATE_HELPERS`・CLAUDE.md 一覧・`tests/gate-helpers.test.mjs`・spec の「対象」「仕様」「例」)
- [x] 帰属の検証 (更新された progress の **Branch** と PR の head ブランチを照合する)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
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
- `01:20` - 5 回目のレビューで **不承認**（Critical 0 / High 1 / Low 1）。不承認は通算 5 回に達したため、レビュアーのエージェント定義に従い **Status を `Blocked` にして人間の判断を待つ**。追加の Fix は行わない。
  - **High: 帰属の照合が自己申告の照合にすぎない。** `makeBranchOf` が照合相手の **Branch** を **HEAD 側**（＝攻撃者が同じ PR で書き換えられる側）から読んでいる。`progress.md` は保護対象から除外されているので、別作業の progress の Branch 行を 1 行書き換えるだけで通る。実測:

```
=== CASE 2: foreign — 0027-b (Branch feature/b) だけ触る ===
更新された progress.md がこの PR の作業のものではありません: 0027-b
exit=1

=== CASE 3: BYPASS — 0027-b を触り、かつその Branch 行を書き換える ===
実装の変更に、進行中の作業の progress.md がちょうど 1 件伴っています。
  作業: 0027-b
exit=0        ← 4 回目の High が塞がっていない
```

  - 4 回目の High は「任意の 1 行を触る」から「Branch 行を触る」に難度が変わっただけだった。**しかも失敗メッセージ自身が「進捗の Branch を直してください」と、検査対象のフィールドの書き換えを誘導している。** 緑を目指すエージェントにはこれが修復手順として読める。
  - Low: `GITHUB_ACTIONS === 'true'` が大小文字を区別する（`TRUE` だと fail-closed が効かない）。ランナーは常に小文字を入れ、攻撃者は env を制御できないため実害なし。
- `01:22` - **これで 5 回連続、修正のたびに別の面が開いている。** (1) status を捨てて削除を数える → (2) base 限定にして新規追加を数える → (3) 数えない対象を黙って捨てる → (4) 別作業の progress で通る → (5) Branch 行の書き換えで通る。spec が「対応する作業の progress」と書くとき、**何をもって対応と見なすかを操作的に定義していなかった**ことが根にある。
- `01:24` - レビュアーが示した論点は 1 つ: **`makeBranchOf` を merge-base 読み取りに変えるか**（＝進捗の Branch は着手時点で main に確定しており、実装 PR 内での変更は認めないというモデルを機械化する）。`progressWorks()` は既に `baseHas()` で merge-base の存在を要求しているため追加コストはほぼゼロで、spec の「例」6 行は base 側読み取りでも同じ期待結果になるため spec 改訂も不要、とのこと。代案は Branch 行の変更自体を stray として拒否する形。**人間の判断待ち。**
- `01:40` - **人間の判断により Blocked を解除し、merge-base 読み取りに変更した。** Status を `In Progress`（Phase: `Verify (外部)`）へ戻す。承認された修正はレビュアーの第 1 案 1 点だけで、spec は変更しない（「例」6 行は base 側読み取りでも同じ期待結果になる）。
  - `makeBranchOf(mergeBase, execGit)` にし、`git show HEAD:task/<work>/progress.md` を `git show <merge-base>:task/<work>/progress.md` に変えた。配線は `resolveCoupling()` 側で、`baseHas` と同じ merge-base を使い回す（`!has || !readWorkBranch` のときだけ 1 回解決する）。既定 `branchOf` は `NO_BRANCH`（読めないと落ちる）のまま維持。モデルは「**進捗の Branch は着手時点で main に確定しており、実装 PR 内での変更は帰属の判定に影響しない**」（CLAUDE.md「コミットとマージ」——spec + progress は計画用ブランチの docs PR で先に main へ入れ、着手時にその Branch を切る）。`progressWorks()` が `baseHas()` で merge-base の存在を既に要求しているので、数えられた作業の progress は必ず merge-base に在る。
  - **失敗メッセージの誘導を直した。** 「進捗の **Branch** は着手時に切ったブランチ名に直してください」は、緑を目指すエージェントには検査対象フィールドの書き換え手順として読める。「この PR のブランチで進めている作業の progress.md を更新してください。別の作業の progress.md を触っているなら、PR を分けてください。Branch は base（merge-base）側から読みます。着手時に main へ入れた値が正であり、この PR で書き換えても判定は変わりません。」に差し替えた。表示も `Branch（base 側）:` と、どちらを読んだか分かる形にした。
  - Low も直した。`GITHUB_ACTIONS === 'true'` を `onGitHubActions()`（trim + 小文字化して比較）にし、`TRUE` でも fail-closed が効くようにした。
- `01:45` - 回帰テストを追加。**BYPASS ケース**（実 git。`src/math.mjs` ＋ 別作業 `0027-b` の progress を触り、かつその Branch 行を head ブランチ名 `work` へ書き換える）が exit 1 になること、その裏面（自分の作業の Branch 行を書き換えても base 側が一致していれば通る）、純関数レベルで **base 側と head 側の Branch が違えば base 側が使われる**こと、`resolveCoupling` が `show <merge-base>:…` を呼び `show HEAD:` を呼ばないこと、`GITHUB_ACTIONS=TRUE` の fail-closed を固定した。既存の「Branch の行が無ければ通せない」は照合先が base 側になったため、欠落を base 側に用意する形へ直した（`makeRepo` に `baseProgress` を足した）。判定を弱める変更ではない。
- `01:50` - 実測。修正前（`3ec3654` の版）と修正後を同じ差分に当て、BYPASS ケースが **exit 0 → exit 1**（`Branch（base 側）: feature/b` / `head: work`）に変わることを確認。誤検知が無いことも同じ実 git で確認した——正当な PR exit 0、docs のみ（progress の新規追加を含む）exit 0、`no-progress-needed` ラベル exit 0、ローカル実行（head ref なし）exit 0、stray exit 1、missing exit 1、`GITHUB_ACTIONS` で head ref 欠落 exit 1、git リポジトリでない exit 1。この作業自身のブランチ（`origin/main...HEAD`、`GITHUB_HEAD_REF=feature/progress-pr-coupling`）も exit 0 で `作業: 0024-progress-pr-coupling`。
- `02:30` - 6 回目のレビューで **不承認**（Critical 0 / High 1 / Low 1）。5 回目の BYPASS（Branch 行の書き換え）は塞がったことがレビュアーの実測で確認された。テストの retarget も「緩和ではない」と確認された（照合先が base 側になったので欠落を base 側に置き換えただけ。同じ性質のユニットテストは無傷で残り、`show HEAD:` を呼ばないことの否定アサーションが追加されている＝強化）。
  - **High（新種）: mode-only 変更でゲートを通せる。** `git update-index --chmod=+x task/0026-a/progress.md` だけで、**base と head の blob が同一のまま** status `M` になり、`headPaths()` が残して `progressWorks()` が 1 件として数える。実測:

```
--- git diff --name-status main...HEAD:
M	src/math.mjs
M	task/0026-a/progress.md
--- blob identical?
base: 9ae1207c9d760fca5b5989af7c3d7b23925ae9bd
head: 9ae1207c9d760fca5b5989af7c3d7b23925ae9bd
--- checker:
実装の変更に、進行中の作業の progress.md がちょうど 1 件伴っています。
  作業: 0026-a
exit=0
```

  - 進捗は 1 バイトも更新されていないのに通る。spec の「背景」が挙げた「progress 更新の抜けた実装 PR を機械的に検知できない」をそのまま素通りさせる。
  - Low: head ブランチ名を別作業の base **Branch** に合わせれば、その作業の progress を担保に通せる。spec の帰属モデル（head ブランチ名 ↔ Branch 欄）そのものの限界で、今回の修正が作った穴ではない。
- `02:32` - 誤検知は出ていないことも実測で確認された（正当な PR、docs のみ、ラベルバイパス、ローカル実行、fail-closed 各種）。「merge-base 読み取りにしたことで正当なのに落ちる」ケースは見つからず、理由も裏取りされた（`tools/start-task.mjs` が progress の **Branch** を読んでその名前で worktree を切るため、merge-base の Branch と実ブランチ名は構造的に一致する）。`npm run ci` は 290 pass / 0 fail。
- `02:34` - レビュアーは往復上限を超えた領域として**追加の Fix を自らの判断では指示せず**、Status を `Blocked` にして人間の判断を仰ぐことを推奨した。論点は 1 つ:

  > mode-only 変更（blob 同一）を progress 更新として数えないようにするか。それとも spec の「範囲外: progress の中身の検証」に含まれるものとして今回は受け入れて承認するか。

  レビュアー自身が「**空白 1 文字の追記でも同じく通る以上、この修正で上がるハードルは小さい**」という見方も併記している。**人間の判断待ち。**
- `03:10` - **人間の判断により Blocked を解除し、blob OID 比較を足した。** Status を `In Progress`（Phase: `Verify (外部)`）へ戻す。承認された修正は 1 点だけで、**spec は変更しない**（「範囲外: progress の中身（チェックの進み方）の検証」に踏み込まない実装として承認された）。
  - **merge-base と HEAD の blob OID を比べ、異なることを `progressWorks()` の条件に足した。** `git update-index --chmod=+x task/0026-a/progress.md` は blob を変えないまま status `M` を作るので、status だけを見ていると進捗を 1 バイトも書かずに通せていた。判定は注入可能な純関数（`contentChanged(path)`）とし、既定 `SAME_CONTENT`（＝「変わっていない」）で渡し忘れたら数えない側へ倒した（`NOTHING_IN_BASE` / `NO_BRANCH` と同じ設計）。**中身は読まない。** OID が変わったかだけを見るので、spec の「範囲外」には踏み込まない。
  - 配線は `resolveCoupling()` 側で `git rev-parse <merge-base>:<path>` と `git rev-parse HEAD:<path>` を比べる。**merge-base は `baseHas` / `branchOf` と同じものを使い回す**（`!has || !changed || !readWorkBranch` のときだけ 1 回解決する）。どちらかの OID が読めなければ false（fail-closed）。
  - **数えなかったものは黙って捨てない。** `strayProgressPaths()` と同じ「陰性拒否」に揃え、`unchangedProgressPaths()` が拒否対象として集める（捨てるだけだと、有効な更新 1 件に別作業のモードだけの変更を同乗させられる）。判定順は `bypass-label` → `docs-only` → **`unchanged`** → `missing` → `stray` → `multiple` → `foreign` → `coupled`。`missing` より先に置いたのは「更新が含まれていません」より「中身が変わっていません」の方が何をすればよいか分かるため（どちらも失敗であることは変わらない）。
  - **失敗メッセージは「進捗の内容を書け」と促す。** 「progress.md の中身が変わっていません（実行ビットなど、ファイルのモードだけの変更です）」を出し、対象パスを列挙したうえで「Status・チェックボックス・試行ログを書き足して同じ PR に含めてください」と述べる。**検査対象を書き換えろという誘導は書かない**（5 回目のレビューで指摘された失敗パターン）。
- `03:15` - 回帰テストを追加（純関数 7 件 ＋ CLI 2 件、計 81 件）。**mode-only ケースは実 git リポジトリで `git update-index --chmod=+x` を使って再現**し、差分に `M` が出ることと base / HEAD の blob OID が一致することを前提としてテスト内で確かめてから exit 1 を固定した（純関数だけでは配線の検証にならない）。裏面（中身も変えていればモードが変わっていても通る）、`contentChanged` 未注入の fail-closed、`rev-parse <merge-base>:` と `rev-parse HEAD:` を実際に呼ぶこと、OID が読めないときの fail-closed も固定した。既存の純関数テストには `contentChanged: anythingChanged` を注入する形へ揃えた（期待結果は変えていない。既定が fail-closed になったための注入であり、緩和ではない）。
- `03:20` - 実測。修正前（`d628ead` の版）と修正後を同じ差分に当て、mode-only ケースが **exit 0 → exit 1** に変わることを確認（blob OID は base / head とも `de90fb2…` で同一のまま）。壊してはいけない性質も同じ実 git で確認した——正当な PR exit 0、docs のみ exit 0、`no-progress-needed` exit 0、stray の `A` / `D` / `R` exit 1、foreign exit 1、Branch 行を書き換える BYPASS exit 1、`GITHUB_ACTIONS=true` で head ref 空 exit 1、git リポジトリでない exit 1、`baseHas` / `contentChanged` / `branchOf` 未注入と merge-base 未解決はいずれも fail-closed。この作業自身のブランチ（`origin/main...HEAD`、`GITHUB_HEAD_REF=feature/progress-pr-coupling`）も exit 0 で `作業: 0024-progress-pr-coupling`。`npm run ci` は 299 tests / 0 fail。
- `04:10` - 7 回目のレビューで **不承認**（Critical 0 / High 1）。mode-only は塞がったことがレビュアーの実測で確認された（修正前 exit 0 → 修正後 exit 1、同乗も拒否）。今回の修正が新たな裏面を作っていないことも検証された（判定順で通る入力は増えない、`works` と `unchanged` の完全二分に隙間も重複も無い、既定値 `SAME_CONTENT` は fail-closed、既存テストの緩和ゼロ）。
  - **High（新種）: `T`（type 変更）が有効な更新として数えられる。** 追跡下の `progress.md` を symlink に置き換えると git は status `T` を出す。`headPaths()` がこれを残し、symlink の blob が base と異なるため `progressWorks()` が 1 件として数える。実測:

```
--- diff ---
M	src/math.mjs
T	task/0026-a/progress.md
--- ls-tree ---
120000 blob ac0292c0...	task/0026-a/progress.md
--- content of progress.md at HEAD ---
../0027-b/progress.md
--- checker ---
実装の変更に、進行中の作業の progress.md がちょうど 1 件伴っています。
  作業: 0026-a
exit=0
```

  - **レビュアーの論拠**: 「中身の検証は範囲外」では片付かない。同じモジュールが `D`（削除）を stray として明示的に拒否しているのに、`T` は削除と同じ破壊（実ファイルの内容が消え、別作業へのポインタになる）を達成しながら通る。**自モジュールが既に約束した不変条件を別の status が迂回している内部矛盾**であり、1 バイト追記と同列の「受け入れた限界」ではない。
  - `T` は `strayProgressPaths()` にも現れず、`status !== 'D'` と `status === 'A'` の網の隙間に落ちている。**この穴は今回の修正が作ったものではなく、修正前（`d628ead`）でも exit 0 だった**（先行 6 回で誰も踏んでいない既存の面）。
  - Low: 今回足した `unchanged` は spec の「失敗時」「例」に対応行が無い（記録漏れ。既存期待値は壊していない）。
- `04:12` - 誤検知が無いことも実測で確認された（正当な PR、docs のみ、ラベルバイパス、ローカル実行は exit 0。stray・foreign・fail-closed 各種・Branch 行の head 側書き換えは exit 1。自ブランチは exit 0）。`npm run ci` は 299 pass / 0 fail。
- `04:14` - レビュアーは規約どおり**追加の Fix を自らの判断では指示せず**、Status を `Blocked` にして人間の判断を仰ぐことを推奨した。論点:

  > `T`（type 変更）を `progressWorks()` から外し `strayProgressPaths()` で拒否するか（数える対象を status `M` に限定するホワイトリスト化）。それとも spec の「範囲外」に属するものとして受け入れて承認するか。

  **人間の判断待ち。**
- `05:10` - **人間の判断により Blocked を解除し、`M` のみを数えるホワイトリスト化に変更した。** Status を `In Progress`（Phase: `Verify (外部)`）へ戻す。承認された修正は 1 点だけで、**spec は変更しない**。
  - **なぜ列挙方式をやめたのか。** この検査は 7 回のレビューで毎回**別の git status の見落とし**を指摘されてきた——(1) `D`（削除）を数えていた → (2) base に無い `A`（新規追加）を数えていた → (3) 数えない対象を黙って捨てて同乗を許していた → (4) 別作業の progress で通せた → (5) **Branch** 行の書き換えで通せた → (6) mode-only（blob 同一の `M`）で通せた → (7) `T`（type 変更＝symlink 置換）で通せた。いずれも「見つかった穴を個別に塞ぐ」形で対処したため、**列挙から漏れた status が毎回残った**。`T` は `status !== 'D'` と `status === 'A'` の網の隙間に落ちており、`headPaths()` が残し、symlink の blob が base と異なるので `progressWorks()` が 1 件として数えていた。**列挙は必ず漏れる**——git が将来 status を増やせば同じことがまた起きる。だから「数えない側を列挙する」設計そのものをやめた。
  - **数える形をホワイトリストにした。** `task/<id>-<slug>/progress.md`（archive 以外・作業名の形が正しい）に当たる差分のうち、**status が `M` であり、merge-base に存在し、merge-base と HEAD の blob OID が異なるもの**だけを数える（`COUNTED_STATUS = 'M'`）。`T` だけでなく `A`・`D`・`R`/`C`・**未知の status** も、最初から数えられる側に入らない。
  - **「どちらにも入らない隙間」を構造的に作らない。** 仕分けを 1 つの純関数 `classifyProgressChanges()` に集約し、進行中の progress に当たる変更が必ず `works` / `unchanged` / `rejected` のどれか **1 つだけ**に入るようにした。`rejected` は列挙ではなく**数える形の補集合**（`status !== 'M' || !baseHas(path)`）である。リネーム・複製の移動元が作業の progress ならそれも `rejected` に入れる。`progressWorks()` / `unchangedProgressPaths()` / `strayProgressPaths()` はこの 1 つの仕分けの薄いラッパにし、`evaluateCoupling()` も 3 回別々に呼ぶのをやめて 1 回の仕分け結果を分解して使う（別々に呼ぶ形は隙間が生まれる余地を残す）。テストでは、差分に現れる進行中 progress パスの集合と、3 つの仕分け結果の合併が**一致し重複も無い**ことを表明した（7 回目のレビュアーが確認した「完全二分」の性質を、3 分割に拡張して維持した）。
  - 理由コード（`stray` / `unchanged` / `missing` / `multiple` / `foreign`）と判定順（`bypass-label` → `docs-only` → `unchanged` → `missing` → `stray` → `multiple` → `foreign` → `coupled`）は維持した。`T` は `stray` に落ちる（単独なら `works` が 0 件になるので、先に来る `missing` で落ちる）。**メッセージは検査対象の書き換えを誘導しない。** `missing` に「数えるのは、base に既にある progress.md の内容を書き足した更新だけです」と、数えなかった変更のパス一覧を足し、`stray` には「種別の変更（symlink への置き換えなど）」を明記した。既定値の fail-closed（`NOTHING_IN_BASE` / `NO_BRANCH` / `SAME_CONTENT`）はそのまま。
  - **`headPaths()` は削除した。** 仕分けが status を直接見るようになり、経路として使われなくなったため（残すと「使われていないのに正しそうな helper」が次の改修で復活する）。それが担保していた性質（`D` と移動元を数えない）は `classifyProgressChanges()` のテストが上位互換で固定している。
- `05:15` - 回帰テストを追加。**`T` ケースは実 git リポジトリで再現**した（`git rm` ではなく実ファイルを消して `ln -s` し `git add`。差分に `T` が出ること・HEAD の entry が `120000`（symlink）であることをテスト内で前提として確かめてから exit 1 を固定）。単独の `T` と、有効な更新に別作業の `T` を同乗させる経路の 2 件。**ホワイトリストであることの表明**として、純関数レベルで `A`・`D`・`T`・`R`・`C` に加え**架空の `X`・`U`・`B`・空文字**まで回し、どれも数えられず、かつ黙って捨てられず拒否対象に現れることを固定した。既存テストのうち 2 件は**強める向き**に retarget した——「移動先が base に既にある作業なら数える」は `R` を数えない設計に変わったので「リネームは移動先が base にあっても数えない（移動元・移動先の両方を拒否する）」へ、`baseHas` の配線テストは `A` が status だけで拒否されて `cat-file` に届かなくなったため、配線が実際に走る `M` の形へ差し替えた。**いずれも通る入力を増やす変更ではない。**
- `05:20` - 実測。修正前（`ff57da8` の版）と修正後を同じ差分に当て、`T` ケースが **exit 0 → exit 1** に変わることを確認。壊してはいけない性質も同じ実 git で確認した——正当な PR exit 0、docs のみ exit 0、`no-progress-needed` ラベル exit 0、ローカル実行（head ref なし）exit 0、missing / stray / foreign / mode-only / multiple / Branch 行の head 側書き換え BYPASS はいずれも exit 1、`GITHUB_ACTIONS=TRUE` で head ref 空 exit 1、git リポジトリでない exit 1。`npm run ci` は 304 tests / 0 fail。
- `05:25` - **7 回目の Low（`unchanged` が spec の「失敗時」「例」に無い）は未対応。** 記録漏れであり既存の期待値は壊していないが、着手後の spec 変更は人間の承認が要る領域なので、エージェント判断では書き換えない。今回の指示も「spec は変更しない」である。**人間の判断待ち**として記録に留める。
- `06:30` - 8 回目のレビューで **承認**（Critical 0 / High 0 / Low 1）。**codex の指摘は 8 回で初めてゼロ**。承認理由は「今回は穴が見つからなかった」ではなく構造が変わったこと — `rejected` が補集合として書かれ status の列挙が無いため、git が将来何を増やしても `M` 以外は定義上そこに落ちる、という評価。誤検知が無いことも 16 ケースで実測された。retarget した既存テスト 2 件はいずれも「より厳しい」方向で緩和ではないことも確認された。main（`99d1940`）を取り込み、`npm run ci` は 324 pass / 0 fail。PR #37 を `allow-protected-change` ラベル付きで作成。残る Low（`unchanged` が spec の「失敗時」「例」に対応行を持たない）は、次に spec を触る機会に人間が足すのが妥当という判断で申し送りとした。
