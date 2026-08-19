# Progress: Lint の導入

- **Target Spec:** `specs/ci-lint.md`
- **Branch:** `feature/ci-lint`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

前提: `specs/scripts-freeze-procedure.md` のマージ後に着手する（`scripts` の変更を伴うため）。

- [x] Specの要件・受け入れ条件の確認
- [x] ESLint の導入 (`eslint.config.mjs`、devDependency)
- [x] `scripts.lint` の追加と `ci` への組み込み（改訂手続きに従う）
- [x] 既存コードの lint 通過（挙動を変えない修正のみ）
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。凍結対象に触れるため `allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 15:50 - 波 3 の 2 本目として着手。前提の `scripts-freeze-procedure`（PR #16）はマージ済み。`feature/ci-lint` を main から切った。
- 15:53 - `eslint` / `@eslint/js` / `globals` を devDependency に追加し、フラット設定 `eslint.config.mjs` を置いた。`js.configs.recommended` をベースに、`src/` はブラウザ、`tests/` と `tools/` は Node の globals に分けた。独自ルールは足していない（範囲外）。
- 15:55 - 初回の lint で 3 件の `no-undef`（`getComputedStyle` ×2、`document` ×1）。いずれも `tests/calc-page.test.mjs` の `page.$eval` / `page.evaluate` に渡すコールバック内で、**ブラウザ側で実行されるコード**だった。コードの欠陥ではなく設定の問題なので、当該ファイルに Node とブラウザ両方の globals を与える設定を足して解決した。**凍結対象である `tests/` を一切変更せずに済んだ。**
- 15:58 - `scripts` に `lint`（`eslint .`）を追加し、`ci` を `npm run lint && npm test` にした。`test` と `pretest` は変更していない。これは凍結対象の改訂であり、`scripts-freeze-procedure` が定めた手続き（改訂内容と理由を spec に書く／人間がマージ／ラベル）に従う。理由は `specs/ci-lint.md` の「背景」に既に書かれている（この spec 自体がその spec 化にあたる）。
- 16:00 - 「例」3 行と「失敗時」を検証。`npm run ci` は lint 通過 → 117 pass / 0 fail。未使用変数を含む一時ファイルを `src/` に置くと `no-unused-vars` で失敗し、消すと成功する。lint 違反がある状態の `npm run ci` は exit 1 で、**テストに進まない**（出力に `# tests` が 0 回）。
- 16:02 - **私の誤りを 1 件記録する。** コミット時に `git add -A` を使い、人間が並行して編集していた `backlog/spec-progress-layout.md`（33 行）を巻き込んだ。`git reset --soft` で外し、編集は作業ツリーに未ステージのまま保全した。**同じ取り違えは PR #15、PR #16 に続いて 3 回目。** 以後 `git add -A` は使わず、変更したファイルを列挙する。
- 16:20 - `codex-reviewer` が承認（Critical 0 / High 0 / Medium 2）。`ignores` が対象を狭めていないことも実測で確認された（lint 対象 13 ファイル = リポジトリ内の対象拡張子 13 ファイルと一致。`progress/` `specs/` `backlog/` に JS は 0 件なので冗長なだけ）。
- 16:23 - Medium 2 件を修正。(1) `engines.node` が `>=22` だが eslint 10 は `^20.19.0 || ^22.13.0 || >=24` を要求する。宣言と実態がずれていたので `>=22.13` に上げた（`engines` は保護対象の `scripts` ではないのでガードには当たらない）。(2) `tests/calc-page.test.mjs` にブラウザ globals を丸ごと合流させていたのを、実際にコールバックで使う `getComputedStyle` と `document` の 2 つだけに絞った。
- 16:25 - (2) の穴が実際に塞がったことを確認。Node 側に `window.location` の参照を一時的に足すと `'window' is not defined` を検知する。union のままなら黙っていた。テストファイルは byte 単位で復元済み（`git diff` が空）。
