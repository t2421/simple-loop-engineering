# Progress: `0043-loop-core-extraction`

- **Target Spec:** `task/0043-loop-core-extraction/spec.md`
- **Branch:** `feat/0043-loop-core-extraction`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/87
- **Status:** `In Progress` (Phase: `Implement`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 配布形態の決定（0044 の移植先に配れるかを判断基準に入れる。→ 完了条件 6）
- [x] Core 層のツールをパッケージへ移す（`promote` を含む）
- [x] このリポジトリを CLI 経由へ置き換え、置き換え前と同じ検証結果になることを確認する
- [x] `CLAUDE.md` テンプレートの作成（不変の原則と穴の分離。穴の未記入を lint で落とす）
- [x] コアのバージョン指定を保護パスへ追加 (`.claude/skills/add-protected-path` に従う)
- [x] ラベル無し / ラベル付きの `protected-paths` 実行結果を進捗に貼る（→ 完了条件 9）
- [x] Core とエージェント定義・Skill のバージョン不整合の検知手段の決定（→ 完了条件 10）
- [ ] レビュー（GitHub Copilot。親が PR 作成後に依頼する）
- [x] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格し、完了条件を確定した。**着手はしない。** 3 部作の最後であり、0044 の実測と 0042 の契約が確定するまで着手すると speculative generality になる。Status を `Blocked` にして `tools/start-task.mjs` に選ばせない。
- `17:59` - 解除条件: `task/archive/0044-second-project-port/` と `task/archive/0042-loop-manifest/` の両方が存在すること。解除時に Status を `Not Started` に戻す。
- `17:59` - backlog 時点の未解決点（`0038-promote-tool` を先行実装するか 0043 に統合するか）は解消済み。0038 は単独で実装・アーカイブされ、`tools/promote.mjs` として存在する。Core 層の 3 層表に追記した。
- `17:59` - 新たな未解決点を spec に追記した。論点 1 の「`bin` を持つパッケージが妥当」は npm 前提の結論であり、0044 の移植先（パッケージマネージャ無し）には配れない。配布形態を選び直す必要がある。
- `19:54` - 解除条件を `origin/main`（`ddc9e90`）で確認。`git ls-tree -d origin/main task/archive/0042-loop-manifest` と `task/archive/0044-second-project-port` の両方が存在する。0042 は commit `ddc9e90`（PR #85 merged）。Status を `Not Started` に戻し、続けて `In Progress` にした。ブランチ `feat/0043-loop-core-extraction` を `origin/main` から切った。
- `19:55` - 完了条件 6・10 の答えを spec に書いた（設計済みの穴。着手後の改訂ではなく、条件が要求する記入）。
  - 配布: npm にしない。`loop-core/` ディレクトリ + `install.mjs` + CLI `node loop-core/bin/loop.mjs`（名前 `loop`）。0044 先（パッケージマネージャ無し）に配れる。
  - 版ずれ: `.claude/claude-config.version` と `loop-core/CLAUDE_CONFIG_COMPAT` を `loop check-compat` が比較する。
  - 内部: ledger / gate に分ける。`loop-manifest.mjs` 読取と `stop-hook-ci-dir` は共有実行系として Core へ。`run-unit-tests.mjs` は Project-local のまま（理由を範囲外へ）。
  - 置き換え前の `node tools/start-task.mjs --next-id` は `0061`。ユニットテスト列挙は 24 ファイル。
- `20:20` - Core を `loop-core/` に切り出し、このリポジトリを `node loop-core/bin/loop.mjs` 経由へ置き換えた。`tools/` に残るのは `run-unit-tests.mjs`・`e2e-needed.mjs`・`setup-playwright.mjs`。`guard.yml` は base の `loop-core/` を `git archive` して CLI 実行し、base に `loop-core/` が無い間は旧単一ファイルコピーへ落とす。置き換え後の `node loop-core/bin/loop.mjs start-task --next-id` は `0061`。`listUnitTestFiles('tests')` は 24 のまま。`loop-core/tests/` を追加で回す。
- `20:22` - `npm run ci`（完了条件 7）:

```
> ci
> npm run lint && npm run lint:docs && npm run test:unit


> lint
> eslint .


> lint:docs
> node loop-core/bin/loop.mjs lint-docs

docs の形式違反はありません（56 件の作業ディレクトリを確認）。

> test:unit
> node tools/run-unit-tests.mjs
```

TAP 本体は 542 件。末尾:

```
# tests 542
# suites 0
# pass 542
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 120422.08871
```

- `20:24` - 完了条件 9。実装コミット `04a2d6d` の上で `loop-core/VERSION` を `1.0.0` → `1.0.1` にした一時コミット `64d1208` に対し、親 `04a2d6d` を base として新チェッカーを実行。終わったら `git reset --hard 04a2d6d` で戻した。

ラベル無し:

```
$ node loop-core/bin/loop.mjs check-protected-paths 04a2d6dcb826c2956ba2954926e1ebe4c51a967b
保護パスの変更を 1 件検知しました:
  - loop-core/VERSION: コアのバージョン指定は変更も移動もできない

変更が正当なら、改訂内容と理由を spec に書いたうえで PR に allow-protected-change ラベルを付けてください。
exit:1
```

ラベル付き:

```
$ PR_LABELS='["allow-protected-change"]' node loop-core/bin/loop.mjs check-protected-paths 04a2d6dcb826c2956ba2954926e1ebe4c51a967b
保護パスの変更を 1 件検知しました:
  - loop-core/VERSION: コアのバージョン指定は変更も移動もできない

ラベル allow-protected-change があるため通過させます（人間による明示承認）。
exit:0
```

- `20:26` - PR を作成した: https://github.com/t2421/simple-loop-engineering/pull/87 。ラベル `allow-protected-change` を付けた。Status は In Progress のまま。アーカイブしない。
- `20:29` - GitHub Actions（HEAD `ccd9354`）は 6 件すべて success:
  - Guard / protected-paths https://github.com/t2421/simple-loop-engineering/actions/runs/33801989683/job/100803446332
  - Guard / progress-coupling https://github.com/t2421/simple-loop-engineering/actions/runs/33801989683/job/100803446205
  - CI / verify https://github.com/t2421/simple-loop-engineering/actions/runs/33801989676/job/100803446598
  - CI / e2e https://github.com/t2421/simple-loop-engineering/actions/runs/33801989676/job/100803446406
  - preview / preview https://github.com/t2421/simple-loop-engineering/actions/runs/33801989682/job/100803479239
  - copilot-pull-request-reviewer https://github.com/t2421/simple-loop-engineering/actions/runs/33802087572/job/100803771271
- `20:30` - Copilot レビュー（#87、Changes recommended）の 3 件を直した: `check-compat` の git 失敗時 cwd フォールバック、`run-unit-tests` の optional ディレクトリ stat、`loop-core/templates/TEMPLATE-progress.md` の CLI パス。あわせて Core 各ファイルの実行例コメントを `node loop-core/bin/loop.mjs` に揃えた。親依頼の再レビューは待っている。Status は In Progress のまま。
- `20:32` - HEAD `9d9cba4` の GitHub Actions は 5 件 success（verify / e2e / protected-paths / progress-coupling / preview）。copilot-pull-request-reviewer は再キュー中。
- `20:41` - Copilot round 2: `guard.yml` の else（base にチェッカーが無い）が候補の `loop-core/bin/loop.mjs` だけを呼んでいた。候補に Core が無い導入 PR では落ちる。候補に CLI があればそれを、無ければ `tools/check-*.mjs` へ落とす。`npm run ci`:

```
docs の形式違反はありません（56 件の作業ディレクトリを確認）。
# tests 542
# pass 542
# fail 0
```
