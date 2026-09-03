# ループコアのパッケージ切り出し

ループエンジニアリングの汎用部分（ディレクトリ構造・テンプレ・`tools/` の汎用ツール群）を、再配布可能なパッケージとして切り出す。

## 種別

改善

## 対象

- 場所: `tools/*.mjs` の汎用部分、`task/`・`backlog/` の構造、`task/TEMPLATE-spec.md`・`task/TEMPLATE-progress.md`、および CLAUDE.md の再利用可能部分 → ディレクトリ `loop-core/`（バージョンは `loop-core/VERSION`）
- 公開面: CLI `loop`（起動は `node loop-core/bin/loop.mjs`）。npm パッケージにはしない。各リポジトリは `loop-core/` をコピーしてバージョンを `VERSION` で固定し、CLI 経由でループのツールを実行する

## 背景

ループエンジニアリングの仕組みを他プロジェクトへ持ち出す 3 部作の 2 つ目。1 つ目の 0044（2 番目のプロジェクトへの手移植）と、それを受けた 0042（マニフェスト契約の定義）が先行する。**着手順は 0044 → 0042 → 0043 であり、この候補は最後である。** 実測（手移植で実際に何を書き換えたか）なしに抽出すると speculative generality になる。

切り出しの当たりを付けるため、2026-08-23 に `tools/*.mjs` を固有語（`npm` / `package.json` / `calc` / `figma` / `playwright` / `cloudflare`）でスキャンした。

- ヒット 0 = 完全に汎用: `archive.mjs`、`check-actions.mjs`、`check-progress-coupling.mjs`、`guard-worktree.mjs`
- ヒットがコメントのみ = 実質汎用: `lint-docs.mjs`（1 件）、`stop-hook-ci-dir.mjs`（2 件）
- 固有性が 1 概念に凝集: `start-task.mjs`（4 件、すべて `npm ci`）、`check-protected-paths.mjs`（8 件、ほぼ `package.json` の scripts 読み取り）
- 真に固有: `run-unit-tests.mjs`（3 件、`node --test` の列挙）、`setup-playwright.mjs`（5 件）、`e2e-needed.mjs`（7 件）

`CLAUDE.md` の固有語ヒットは 23 件で、ファイル単位では最多である。

## 仕様

変更後に満たしたい構成（検証可能な命題に落とすのは昇格時）。

3 層に分ける。

| 層 | 中身 | 配布 |
|---|---|---|
| Core | `task/`・`backlog/` 構造、テンプレ 2 種、`archive` / `check-actions` / `check-progress-coupling` / `guard-worktree` / `lint-docs` / `start-task` / `check-protected-paths` / `promote`。内部は **ledger（台帳）** と **gate（ゲート）** に分ける。共有実行系としてマニフェスト読取（`lib/manifest.mjs`）と `stop-hook-ci-dir` も含める | バージョン付きディレクトリ `loop-core/` + コピー用 `install.mjs` + CLI `node loop-core/bin/loop.mjs`（コマンド名 `loop`） |
| Manifest | 0042 が定義する契約（`loop.manifest.json`。検証コマンド・保護対象などプロジェクト固有値の置き場） | 各リポジトリ。契約は再定義しない |
| Project-local | `setup-playwright.mjs`・`e2e-needed.mjs`・`run-unit-tests.mjs`・figma skill・トークン表 | 各リポジトリ |

設計上の論点への答え（この作業で確定）。

1. **配布形態。** npm パッケージにはしない。0044 の移植先はパッケージマネージャが無く、`.mjs` のディレクトリを置けば動いた。選ぶ形態は **バージョン付きファイル群（`loop-core/`、版は `loop-core/VERSION`）+ コピー用 `install.mjs`**。CLI 入口は `node loop-core/bin/loop.mjs` であり、npm の `bin` に依存しない。GitHub Actions からも同じ木を `git archive` で base リビジョンから取り出して実行する。この形態は 0044 の移植先（パッケージマネージャ無し）に配れる。npm パッケージを選ぶと配れない。
2. **Core と `t2421/claude-config` の版ずれ。** 検知方法は 1 つ: 消費リポジトリの `.claude/claude-config.version`（1 行。入れた `t2421/claude-config` の ref）を、Core が配る `loop-core/CLAUDE_CONFIG_COMPAT`（この Core 版が検証済みとする ref）と比較する。`loop check-compat` が不一致またはピン欠落を検出し、警告を出して終了コード非 0 で終わる。エージェント定義・Skill 自体は Core に入れない。
3. **CLAUDE.md テンプレート。** 不変の原則と埋めるべき穴（`{{VERIFY_COMMAND}}` など）を分離して `loop-core/templates/CLAUDE.md` に置く。穴が残ったまま lint すると列挙して落ちる。
4. **コア自身のバージョン固定。** 版の所在は `loop-core/VERSION`。これを保護パスに含め、上げるには `allow-protected-change` を要求する（npm の依存行ではない）。

**backlog 時点の未解決点は解消済み**: `0038-promote-tool` は先行して単独実装され（`tools/promote.mjs`、アーカイブ済み）、Core 層に入る。この作業では新規実装ではなく**取り込み**の対象である。

**新たな未解決点（この作業の中で答えを出す）**: 上の論点 1 は「`bin` を持つパッケージが妥当」としているが、これは **npm を前提にした結論**である。0044 の移植先はパッケージマネージャを持たない。配布形態が npm パッケージのままなら、そのような移植先には**そもそも配れない**。0044 の記録を読んだうえで、配布形態（npm パッケージ / `git subtree` / 単一ファイルへのバンドル / インストールスクリプト）を選び直す。

## 範囲外

- 0042 のマニフェスト契約の定義そのもの（0042 で行う。ファイルは `loop.manifest.json`。読取実装は共有実行系として Core の `lib/manifest.mjs` へ移す）
- 2 番目のプロジェクトへの手移植（0044 で行う。この作業で 0044 先へ再移植しない）
- Project-local 層（`setup-playwright.mjs`・`e2e-needed.mjs`・figma skill・トークン表）の Core への取り込み
- `run-unit-tests.mjs` の Core への取り込み。このリポジトリの `tests/` を列挙するプロジェクト固有の入口である
- エージェント定義・Skill の Core への取り込み（`t2421/claude-config` 側に置く）

## 失敗時

- マニフェスト（0042 の契約ファイル）が無いリポジトリで CLI を実行: 何も変更せず、理由を表示して終了コード非 0
- コアのバージョン指定を `allow-protected-change` なしで変更する PR: `protected-paths` が検知して CI が落ちる
- Core が期待する構造（`task/`・テンプレ 2 種）が無いリポジトリで CLI を実行: 何も変更せず、欠けている構造を表示して終了コード非 0
- `CLAUDE.md` テンプレートの穴が未記入のまま lint: 未記入の穴をすべて列挙して終了コード非 0
- Core のバージョンと、別置きのエージェント定義・Skill のバージョンが食い違う: `loop check-compat` が `.claude/claude-config.version` と `loop-core/CLAUDE_CONFIG_COMPAT` の不一致を検知し、警告を出して終了コード非 0（→「仕様」論点 2）

## 例

検証に使う具体例。ディレクトリ名は `loop-core`、CLI 名は `loop`（起動は `node loop-core/bin/loop.mjs`）。

| 操作または入力 | 期待結果 |
|---|---|
| このリポジトリで Core を CLI 経由に置き換えたあと `npm run ci` | 置き換え前と同じ結果。既存のテストがすべて通る |
| このリポジトリで `node loop-core/bin/loop.mjs start-task --next-id` | 置き換え前の `node tools/start-task.mjs --next-id` と同じ出力 |
| Core を導入していない空のリポジトリで `node loop-core/bin/loop.mjs start-task` | 構造が無い旨を表示して終了コード非 0。ファイルを作らない |
| マニフェストを消して `node loop-core/bin/loop.mjs` の任意のコマンドを実行 | 何も変更せず終了コード非 0 |
| `CLAUDE.md` テンプレートの穴を 1 つ残して lint | その穴が列挙され終了コード非 0 |
| コアのバージョン指定を上げる PR をラベル無しで出す | `protected-paths` が失敗する |
| 同じ PR に `allow-protected-change` を付けて再実行 | `protected-paths` が成功する |
| 0044 の移植先と同じ性質（パッケージマネージャ無し）のリポジトリへ Core を配る | `node loop-core/install.mjs <dest>` で `loop-core/` がコピーされ、`node loop-core/bin/loop.mjs` が npm 無しで起動できる |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 3 層表の Core に挙げたツールが、パッケージ側へ移っている。このリポジトリの `tools/` には Project-local 層のものだけが残る。移らなかったツールがある場合、その理由が spec の「範囲外」にある。
6. 配布形態が 1 つ選ばれ、**選んだ理由と、0044 の移植先（パッケージマネージャ無し）に配れるか否か**が spec に書かれている。配れない形態を選ぶ場合、その制約を明示している。
7. このリポジトリが Core を CLI 経由で使うように置き換えられ、**置き換え前と同じ検証結果が出る**。`npm run ci` の出力を進捗に貼る。既存のテストを削っていない（`tools/run-unit-tests.mjs` が列挙するファイル数が減っていない）。
8. `CLAUDE.md` テンプレートが存在し、**不変の原則**と**埋めるべき穴**が分離されている。穴が未記入のまま lint すると列挙されて落ちる。
9. コアのバージョン指定が保護パスに含まれる。バージョンを上げる PR がラベル無しで `protected-paths` に落ち、`allow-protected-change` を付けた再実行で成功する。両方の実行結果を進捗に貼る。
10. Core と、別置きのエージェント定義・Skill（`t2421/claude-config`）のバージョン不整合を検知する手段が 1 つ決まり、実装または手順として書かれている。「決めていない」で終わらせない。
11. 0044 と 0042 がともにアーカイブ済みである。**この作業は 3 部作の最後であり、実測と契約が確定する前には着手しない。**
