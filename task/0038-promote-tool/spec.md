# 昇格（backlog → task）を補助するツール

アーカイブは `tools/archive.mjs` で自動化されているのに、昇格は毎回手作業である。機械的な部分を `tools/promote.mjs` に落とす。

## 種別

改善

## 対象

- 場所: `tools/promote.mjs`（新規。凍結対象ではない）と `tests/promote.test.mjs`（新規）
- 公開面: CLI。`node tools/promote.mjs <id>-<slug>`

## 背景

昇格は「同じ ID のまま `git mv backlog/<id>-<slug> task/<id>-<slug>`、背景から『この項目は backlog。…』の 1 行を削除、完了条件の確定、`progress.md` の新規作成（メタ情報一式）」という定型手順である。2026-08-22 のリファインメントでは 4 件（0026・0027・0029・0034）をすべて手作業で行った。機械的な部分（mv・定型行の削除・progress 雛形の生成・Target Spec / Branch のメタ整合）はツール化できる。完了条件の記述と Complexity の判断だけがエージェント／人間の仕事として残るのが正しい分担である。

2026-08-23 のリファインメントで現存を実測確認した（`ls tools/` に `promote.mjs` は無い）。

2026-08-24 の昇格作業では 6 件（0036・0037・0038・0039・0040・0041）を再び手作業で昇格した。実際の手順は次のとおりだった。

1. `git mv backlog/<id>-<slug> task/<id>-<slug>`
2. spec の背景から「この項目は backlog。着手しない。progress は作らない。完了条件は未確定。」の行を削除
3. 完了条件の「未確定（incomplete）。昇格時に埋める。」の行を削除
4. 完了条件の 5 番目のプレースホルダを検証可能な命題に置換（人間／spec-author の仕事）
5. 「失敗時」「例」の「未確定。候補:」の前置きを外して内容を確定（同上）
6. `progress.md` を `task/TEMPLATE-progress.md` から生成し、Target Spec・Branch・PR・Status・Complexity を埋める

このうち 1・2・3・6 が機械的で、4・5 が判断を要する。backlog 段階のこの spec は 3 の行を「消さない」としていたが、実作業では昇格時に消している。本仕様は実作業に合わせ、3 をツールが行う機械的手順に含める。完了条件が未確定のままであることは、5 番のプレースホルダ `<この変更固有の、検証可能な命題。>` が残ることで引き続き判別できる。

未解決の点: `backlog/0043-loop-core-extraction`（未マージの PR #60 で追加予定）は、ループ機構の汎用部分をパッケージへ切り出す候補で、`tools/promote.mjs` は実現すればその Core 層に入る。0038 を単独で実装しても無駄にはならない（切り出し時に移動するだけ）。

## 仕様

- `node tools/promote.mjs <id>-<slug>` が次を行う:
  - `backlog/<id>-<slug>/` を `task/<id>-<slug>/` へ `git mv` する
  - spec の背景から「この項目は backlog。着手しない。progress は作らない。完了条件は未確定。」の行を削除する
  - 完了条件の「未確定（incomplete）。昇格時に埋める。」の行を削除する。5 番のプレースホルダ `<この変更固有の、検証可能な命題。>` は消さない。完了条件の確定は人間／spec-author の仕事であり、プレースホルダが残っていれば未確定と分かる
  - `task/TEMPLATE-progress.md` の `---` より下を元に `task/<id>-<slug>/progress.md` を生成する。見出しは `` # Progress: `<id>-<slug>` ``、Target Spec は `task/<id>-<slug>/spec.md`、Branch は `feat/<id>-<slug>`（既定）、PR は `未作成`、Status は `Not Started`（Phase: `Plan`）で埋める。Complexity はプレースホルダのまま残す
- 「失敗時」「例」の「未確定。候補:」の前置きの除去は行わない（内容の確定と不可分で、判断を要するため）
- 条件を満たさないとき（対象が無い、移動先が既に存在する等）は**何も変更せず** exit 非 0。`tools/archive.mjs` と同じ流儀を踏襲する
- テストは `tests/promote.test.mjs` に置く。`tools/run-unit-tests.mjs` の列挙規則（`tests/*.test.mjs`、`calc-page.test.mjs` を除く）に合致するため `npm run ci` が自動で回す。runner 自体は凍結対象なので変更しない。検証は一時ディレクトリに git リポジトリと `backlog/` `task/` 構造を模して行う

## 範囲外

- 完了条件の自動生成（5 番のプレースホルダの置換）
- 「失敗時」「例」の「未確定。候補:」の前置きの除去
- Complexity の自動判定
- 逆方向（task → backlog への降格）

## 失敗時

いずれも何も変更せず exit 非 0 とする。

- `backlog/<id>-<slug>/` が存在しない: 何も変更せず exit 非 0
- `task/<id>-<slug>/` が既に存在する: 何も変更せず exit 非 0
- `backlog/<id>-<slug>/spec.md` が存在しない: 何も変更せず exit 非 0
- 引数が `<ゼロ埋め 4 桁>-<slug>` の形式でない、または引数が無い: 何も変更せず exit 非 0

## 例

検証は一時ディレクトリに git リポジトリと `backlog/0040-foo/spec.md`（backlog 行・未確定行・プレースホルダ入り）・`task/TEMPLATE-progress.md` を用意して行う。

| 操作または入力 | 期待結果 |
|---|---|
| `node tools/promote.mjs 0040-foo`（backlog に存在） | exit 0。`task/0040-foo/spec.md` ができ、背景の backlog 行と完了条件の「未確定（incomplete）。昇格時に埋める。」行が消え、5 番のプレースホルダは残る。`task/0040-foo/progress.md` が Target Spec `task/0040-foo/spec.md`・Branch `feat/0040-foo`・PR `未作成`・Status `Not Started`・Complexity プレースホルダで生成される。`backlog/0040-foo/` は無くなる |
| 同じコマンドを再実行 | 何も変更せず exit 非 0（`backlog/0040-foo/` が存在しない） |
| `node tools/promote.mjs 9999-none`（どこにも存在しない） | 何も変更せず exit 非 0 |
| `node tools/promote.mjs abc`（形式不正） | 何も変更せず exit 非 0 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `tests/promote.test.mjs` が「例」の 4 ケースと「失敗時」の全条件を一時ディレクトリ上の git リポジトリで検証し、`npm run ci` の中で（`tools/run-unit-tests.mjs` の列挙により、`package.json` や runner を変更せずに）自動実行されて全件成功する。
6. 昇格成功時に生成される `progress.md` が `task/TEMPLATE-progress.md` の `---` より下と同じ見出し名・順番を持ち、Target Spec・Branch・PR・Status が仕様どおり埋まり、Complexity がプレースホルダのまま残ることをテストが確認する。
7. 「失敗時」のどのケースでも `backlog/`・`task/` 配下のファイルが実行前後で変化しない（何も変更せず失敗する）ことをテストが確認する。
