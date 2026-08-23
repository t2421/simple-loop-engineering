# ループコアのパッケージ切り出し

ループエンジニアリングの汎用部分（ディレクトリ構造・テンプレ・`tools/` の汎用ツール群）を、再配布可能なパッケージとして切り出す。

## 種別

改善

## 対象

- 場所: `tools/*.mjs` の汎用部分、`task/`・`backlog/` の構造、`task/TEMPLATE-spec.md`・`task/TEMPLATE-progress.md`、および CLAUDE.md の再利用可能部分 → 新パッケージ（名称未定）
- 公開面: パッケージの `bin`（CLI）。各リポジトリは `package.json` の依存としてバージョンを固定し、CLI 経由でループのツールを実行する

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

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
| Core | `task/`・`backlog/` 構造、テンプレ 2 種、`archive` / `check-actions` / `check-progress-coupling` / `guard-worktree` / `lint-docs` / `start-task` / `check-protected-paths` | パッケージ + `bin` |
| Manifest | 0042 が定義する契約（プロジェクト直下 1 ファイル。検証コマンド・保護対象などプロジェクト固有値の置き場） | 各リポジトリ |
| Project-local | `setup-playwright.mjs`・`e2e-needed.mjs`・figma skill・トークン表 | 各リポジトリ |

設計上の論点。昇格時にこの候補の中で答えを出す。

1. **配布先の制約。** ループのツールは Claude のセッションだけでなく GitHub Actions からも実行される。したがって `.claude/` 配下だけに置くことはできない。`bin` を持つパッケージが妥当である
2. **置き場が 2 つに割れる運用上の注意。** ツールはパッケージ側、エージェント定義（`spec-author` / `codex-reviewer` / `visual-design-reviewer`）と Skill は `t2421/claude-config` 側が自然である。この分割はバージョン整合の管理コストを生む。どちらか一方だけ更新されたときの検知方法を決める必要がある
3. **移植で本当に効くのは `tools/` ではなく `CLAUDE.md` である。** 固有語 23 件のここが最も書き換えコストが高く、かつ最も価値が高い（毎セッション全文が載る＝ループの実行系そのもの）。再利用資産の中心は、不変の原則（Verify を 2 段にする / Critical ゼロまで完了と言わない / 出力を貼る / 期待値を書き換えない）と、埋めるべき穴（検証コマンド・成果物の置き場・レビュアー名・見た目の有無）を分離した **CLAUDE.md テンプレート**であるべきだ
4. **コア自身のバージョン固定。** コアが外部パッケージになると、バージョンを上げる行為が検証を弱めうる（例: 新バージョンで `check-protected-paths` の判定が緩む）。コアのバージョン指定（`package.json` の該当行）も保護対象にし、変更には `allow-protected-change` を要求する

未解決の点: `backlog/0038-promote-tool`（昇格の機械的部分の `tools/promote.mjs` 化）は、実現すれば Core 層に入るべきツールである。0043 に先行して単独実装するか、0043 の中でパッケージのコマンドとして実装するか、統合の余地がある。昇格時にどちらかへ決める。

## 範囲外

- 0042 のマニフェスト契約の定義そのもの（0042 で行う）
- 2 番目のプロジェクトへの手移植（0044 で行う）
- Project-local 層（`setup-playwright.mjs`・`e2e-needed.mjs`・figma skill・トークン表）のパッケージへの取り込み
- エージェント定義・Skill のパッケージへの取り込み（`t2421/claude-config` 側に置く）

## 失敗時

未確定。候補:

- マニフェスト（0042 の契約ファイル）が無いリポジトリで CLI を実行: 何も変更せず exit 非 0
- コアのバージョン指定を `allow-protected-change` なしで変更する PR: guard が検知して CI を落とす

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| 別リポジトリで `npm i -D <パッケージ>` 後、CLI 経由で `start-task --next-id` | このリポジトリの `node tools/start-task.mjs --next-id` と同等の出力 |
| CLAUDE.md テンプレートの「埋めるべき穴」を埋めずに lint | 未記入の穴が列挙され exit 非 0 |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
