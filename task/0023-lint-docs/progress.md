# Progress: `0023-lint-docs`

- **Target Spec:** `task/0023-lint-docs/spec.md`
- **Branch:** `feature/lint-docs`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/lint-docs.test.mjs`)
- [x] 実装 (`tools/lint-docs.mjs`、`package.json` の `lint:docs` 追加)
- [x] 現状の docs 全件が lint を通ることの確認（出力を会話に貼る）
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`package.json` scripts の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `05:20` - 着手前に現状の docs を調査。既存の書式ゆれを 2 種類見つけた。(1) `Status` の書き方が `` `Not Started` (Phase: `Plan`) `` / `Done` / `` `Done` `` の 3 通りある。(2) `task/archive/0001-math-add/progress.md` と `task/archive/0002-math-sub/progress.md` に **PR** 行が無い。
- `05:30` - `tests/lint-docs.test.mjs` を先に作成。`node --test tests/lint-docs.test.mjs` 実行 → `ERR_MODULE_NOT_FOUND`（`tools/lint-docs.mjs` が無い）で RED を確認。
- `05:40` - `tools/lint-docs.mjs` を実装し、`package.json` に `lint:docs` を追加して `ci` から呼ぶようにした。`node --test tests/lint-docs.test.mjs` 実行 → 26 tests, pass 26, fail 0 で GREEN。
- `05:45` - 書式ゆれ (1) はルール側で吸収した。`normalizeStatus()` が末尾の `(Phase: ...)` とバッククォートを落としてから 4 値と照合する。どれも同じ Status を指しており、区別しても検証は強まらないため。
- `05:46` - 書式ゆれ (2) はルール側では吸収せず、**そのパスの PR 行だけ**の例外として `LEGACY_PROGRESS_WITHOUT_PR` に列挙した。メタ情報 4 項目の要求を緩めると新しい進捗の抜けを見逃す。`task/` は凍結対象で後から PR 行を足せないため、例外を明示列挙する形にした。例外が横に広がらないこと（同じ形でも別パスなら違反すること）をテストで固定している。
- `05:47` - `npm run lint:docs` をリポジトリの現状に対して実行 → `docs の形式違反はありません（27 件の作業ディレクトリを確認）。` 終了コード 0。`npm run ci` 実行 → 210 tests, pass 210, fail 0、終了コード 0。
- `06:10` - `codex-reviewer` による外部レビュー（1 回目）→ **不承認**。Critical 0 / High 1 / Medium 4 / Low 1。
- `06:20` - High-1 を修正。`WORK_DIR_PATTERN` の slug 文法（`[a-z0-9]+(?:-[a-z0-9]+)*`）が `tools/start-task.mjs` の探索（`^(\d{4})-(.+)$`）と `tools/archive.mjs` の `isWorkName`（`^\d{4}-[^/\\]+$`）より狭く、`0026-api_v2` のような作業が「start-task は選び archive は通すのに lint だけ落ちる」状態になっていた。lint は `npm run ci` の一部なので、これは**そのリポジトリの全 PR が緑にならなくなる**欠陥である。spec は「ディレクトリ名は `NNNN-slug`（ゼロ埋め 4 桁 + slug）」としか書いておらず、slug の文字種の制約は spec に無い。`^(\d{4})-([^/\\]+)$` + 前後空白の禁止（`matchWorkDirName`）に緩め、アーカイブ側と同じ広さに揃えた。**緩めたのは文字種だけで、型（`TEMPLATE-spec`）・パス区切り・空白の拒否は維持**している。テストを 2 件追加（`matchWorkDirName` の判定と、4 つの広い slug が `lintDocs` を通ること）。
- `06:21` - **同じ型の指摘は 3 度目である。** 0018 で `isWorkName`、0020 でブランチ名バリデータが同じ形で狭すぎると指摘された。バリデータを新規に書くときは、拒否側の安全性ではなく、**同じ対象を扱う既存ツールが受け入れる集合と突き合わせる**。新しいバリデータは既存の最も広い集合に合わせるのが既定で、狭めるなら spec に根拠が要る。
- `06:30` - Medium-4 を修正。`parseMetadata` / `findBadCheckboxes` / `checkBacklogCompletion` がコードフェンスの中も文書構造として読んでいた。CLAUDE.md「報告の作法」は progress にコマンド出力を貼ることを要求しており、貼った出力の中の `- **Status:** …`・`- [X] …`・`## 完了条件` を拾うと**偽の CI 失敗**になる。見出し抽出に使っていたフェンス無視のロジックを `linesOutsideFences()` として括り出し、4 つの走査すべてをその上に載せた。行番号は元の位置を保つ。テストを 3 件追加。
- `06:35` - Medium-6 を修正。`LEGACY_PROGRESS_WITHOUT_PR` の根拠コメントが「`task/` 配下は凍結対象なので後から足せない」と書いていたが、これは事実と違う。`tools/check-protected-paths.mjs` の `task/` エントリは `exclude: 'progress.md'` を持ち、CLAUDE.md も除外は各作業ディレクトリ直下の `progress.md` だけと書いている。誤った根拠を残すと「task/ 配下の progress は触れない」と誤学習して例外リストが横に伸びるので、根拠を「**存在しなかった PR** なので書ける値が無く、lint を黙らせるために完了済みの記録に無かった事実を足すのは本末転倒」に直した。例外リストを残す判断自体は変えていない。
- `06:40` - 直さなかった指摘。Medium-2（progress の見出し検証）と Medium-3（`[xx]` のような 2 文字の角括弧の素通し）は spec の「仕様」に規則が無い。lint が spec より強い規則を課すと、規約の正典が spec から実装へ移り、着手後の spec 変更（人間の承認が要る）を経ずにルールが増えていく。Low-5（フェンスの区切り長を厳密に照合しない）は、閉じ側が開き側より短いフェンスという Markdown を実際に書く経路が無く、判定を複雑にするだけで検証は強まらない。いずれも必要になったら別作業の spec に起こす。
- `06:45` - 再検証。`node --test tests/lint-docs.test.mjs` → 32 tests, pass 32, fail 0。`npm run lint:docs` → `docs の形式違反はありません（27 件の作業ディレクトリを確認）。` 終了コード 0。`npm run ci` → 216 tests, pass 216, fail 0、終了コード 0。CLI 実演で `0026-api_v2` / `0026-v1.2` / `0026-日本語` / `0026-Mixed-Case` が終了コード 0 で通ることも確認した。
