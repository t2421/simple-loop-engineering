# Progress: 凍結ファイルの改訂手続き

- **Target Spec:** `specs/scripts-freeze-procedure.md`
- **Branch:** `feature/scripts-freeze-procedure`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/16
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] CLAUDE.md「変えてはいけないもの」への改訂手続きの追記
- [x] `tools/setup-playwright.mjs` の作成と `package.json` への `pretest` 追加
- [x] `tests/calc-page.test.mjs` からの Chromium 自己インストール分岐の削除（アサーションは不変）
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。凍結対象に触れるため、ガード導入後は `allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。calc-page の試行ログ 16:30 以降（テスト内セットアップ分岐）が背景。未着手。
- 13:50 - 波 3 として着手。`feature/scripts-freeze-procedure` を main から切った。波 3 は直列（この作業 → `ci-lint`）なので worktree は使わず、単一チェックアウトで進める。
- 13:55 - CLAUDE.md「変えてはいけないもの」に「凍結を解いて改訂するとき」を追記。手続きは 2 点（改訂内容と理由を spec に書く／その PR を人間がマージする。ラベルを付ける）。あわせて「エージェントが自らの判断で凍結対象を書き換えることは引き続き禁止」「手続きが許すのは検証を弱めない改訂だけ」を明記した。
- 13:58 - 初適用。`tools/setup-playwright.mjs` を作り、`tests/calc-page.test.mjs` の `launchChromiumWithAutoInstall`（`npx playwright install chromium` のリトライ分岐）を削除して `chromium.launch()` の直接呼び出しに戻した。未使用になった `execFileSync` の import も外した。`package.json` に `pretest` を追加。`test` と `ci` は変更していない。
- 14:00 - 「失敗時」を検証。Chromium 未導入かつ `npx` が無い環境で `tools/setup-playwright.mjs` を走らせると、理由を表示して exit 1 になる（無言でスキップしない）。`pretest` が失敗すれば `npm test` はそこで止まる。導入済みなら no-op で exit 0。
- 14:02 - 「例」3 行を検証。素の checkout 相当で `npm run ci` が 117 pass / 0 fail（main と同数、アサーション不変）。`tests/calc-page.test.mjs` を `playwright install` で検索して一致なし。CLAUDE.md を「改訂」で検索して手続きが存在。
- 14:15 - `codex-reviewer` が **不承認**（Critical 0 / High 1 / Medium 1 / Low 2）。
  - High: **`backlog/cloudflare-preview.md` と `backlog/spec-progress-layout.md`（人間が書いた未追跡ファイル、160 行）を `git add -A` でこのブランチのコミットに巻き込んでいた。** spec の「対象」外であり、「完了条件を満たす最小差分だけ実装する」に反する。2 ファイルは spec の見出し構成を持つため、「会話中に複数の spec が生まれたときも進行中の作業ブランチに置かない」にも正面から抵触する。試行ログにも記録が無かった。
- 14:17 - High を修正。`git reset --soft` でコミットを解き、`backlog/` をステージから外して untracked に戻した。**この取り違えは PR #15 でも一度やっており、指摘されて外したのに同じ `git add -A` で再発させた。** 以後、コミットは変更したファイルを明示して `git add` する。`backlog/` の扱い（CLAUDE.md のディレクトリ表に無い）は人間に委ねる。
- 14:19 - Medium を修正。CLAUDE.md が `specs/archive/scripts-freeze-procedure.md`、`tools/setup-playwright.mjs` が `specs/scripts-freeze-procedure.md` を参照しており、マージ時点では前者が dangling、アーカイブ後は後者が stale になる。どちらもパスを持たせず作業名 `scripts-freeze-procedure` で指す形に揃えた。
- 14:20 - Low 1 件に対応。新節が `add-protected-path` skill の直下にあり担当を混同しうるため、「守る対象そのものを増減するのは skill、ここは保護されているものの中身を改訂する手続き」と冒頭に明示した。
- 14:21 - Low（Linux で実行ファイルはあるが OS 依存ライブラリが無い場合に `pretest` が no-op になる）は未対応。CI は `--with-deps` の明示ステップがあるので影響せず、移設前の in-test リトライにも同じ穴があったため退行ではない。
- 14:35 - 再レビュー（2 回目）で **承認**（Critical 0 / High 0 / Medium 1 / Low 2）。High（`backlog/` 混入）と Medium（spec 参照の食い違い）は解消を確認された。`git reset --soft` で作り直した内容が意図した 2 箇所以外変わっていないことも旧コミットとの比較で確認された。
- 14:38 - Medium を修正。**これは私が持ち込んだ退行だった。** `isInstalled()` が `chromium.executablePath()` を見ていたが、それが指すのはフル Chromium（`chromium-1234`）で、`chromium.launch()` が実際に使うのは `chromium_headless_shell-1234` である。headless shell だけ欠けた部分キャッシュや `--no-shell` 導入では「導入済み」と誤判定して no-op になり、テストが実行ファイル無しで落ちる。移設前の in-test リトライはこのケースを自己修復していたので、この 1 ケースに限っては機能後退だった。
- 14:40 - 自前の判定をやめ、`playwright install chromium` 自身の no-op 判定に任せる形にした。フル Chromium だけ置いた一時ディレクトリで再現すると、旧判定は「存在: true」で素通り、新実装は headless shell を検知して補完する。導入済みのときのオーバーヘッドは 0.62 秒で、`pretest` に置いて許容範囲。
- 14:42 - 「失敗時」を再確認。導入コマンドが失敗すると理由を表示して exit 1（無言でスキップしない）。`npm run ci` は 117 pass / 0 fail のまま。
- 14:44 - **人間の判断に上げる点:** spec の「例」1 行目は「素の checkout で `npm ci && npm run ci` → 43/43 pass」だが、実測は 117 である。spec 作成時（`b123982`）の `tests/` は 3 ファイル、現在は 7 ファイルで、この作業とは無関係に陳腐化していた。完了条件 5（前後で件数一致）は満たすが、完了条件 2 を字義どおりには満たさない。**spec の期待値は凍結対象なので書き換えていない。** 更新するなら人間の承認を経た spec 改訂として別途行う。
- 14:50 - PR #16 を作成し `allow-protected-change` ラベルを付与。ガードが検知した 2 件（`package.json` の scripts、`tests/calc-page.test.mjs`）はこの spec が意図した初適用そのもの。見た目の変更が無いためスクリーンキャプチャは添付しない。マージ待ち。
- 15:05 - 人間の承認を得て spec の「例」1 行目を改訂した。`43/43 pass` → `変更前と同じ件数が pass`。理由: 件数のハードコードは、この作業と無関係にテストを足すたび陳腐化する（spec 作成時 `tests/` 3 ファイル → 現在 7 ファイル、43 → 117）。検証の意図（セットアップ移設で件数が変わらないこと）は保たれ、以後陳腐化しない。**期待値を緩めているのではなく、緩まない形に置き換えている**（完了条件 5 の「前後で一致」と同じ命題になる）。凍結対象の改訂手続き（この spec 自身が定めたもの）に従い、`allow-protected-change` ラベル付きの PR #16 に含める。
