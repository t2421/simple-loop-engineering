# 昇格（backlog → task）を補助するツール

アーカイブは `tools/archive.mjs` で自動化されているのに、昇格は毎回手作業である。機械的な部分を `tools/promote.mjs` に落とす。

## 種別

改善

## 対象

- 場所: `tools/promote.mjs`（新規。凍結対象ではない）
- 公開面: CLI。`node tools/promote.mjs <id>-<slug>` を想定

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

昇格は「同じ ID のまま `git mv backlog/<id>-<slug> task/<id>-<slug>`、背景から『この項目は backlog。…』の 1 行を削除、完了条件の確定、`progress.md` の新規作成（メタ情報一式）」という定型手順である。2026-08-22 のリファインメントでは 4 件（0026・0027・0029・0034）をすべて手作業で行った。機械的な部分（mv・定型行の削除・progress 雛形の生成・Target Spec / Branch のメタ整合）はツール化できる。完了条件の記述と Complexity の判断だけがエージェント／人間の仕事として残るのが正しい分担である。

## 仕様

変更後に満たしたい振る舞い（検証可能な命題に落とすのは昇格時）。

- `node tools/promote.mjs <id>-<slug>` が次を行う:
  - `backlog/<id>-<slug>/` を `task/<id>-<slug>/` へ `git mv` する
  - spec の背景から「この項目は backlog。着手しない。progress は作らない。完了条件は未確定。」の行を削除する
  - `task/TEMPLATE-progress.md` から `progress.md` を生成し、Target Spec・Branch（`feat/<id>-<slug>` 既定）・PR `未作成`・Status `Not Started` を埋める。Complexity はプレースホルダのまま残す
- 完了条件の「未確定（incomplete）。昇格時に埋める。」行は**消さない**。完了条件の確定は人間／spec-author の仕事であり、残っていれば lint（あれば）や目視で未完了と分かる
- 条件を満たさないとき（対象が無い、移動先が既に存在する等）は何も変更せず exit 非 0（`tools/archive.mjs` と同じ流儀）

## 範囲外

- 完了条件の自動生成
- Complexity の自動判定
- 逆方向（task → backlog への降格）

## 失敗時

未確定。候補:

- `backlog/<id>-<slug>/` が存在しない: 何も変更せず exit 非 0
- `task/<id>-<slug>/` が既に存在する: 何も変更せず exit 非 0

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| `node tools/promote.mjs 0040-foo`（backlog に存在） | `task/0040-foo/spec.md`（backlog 行なし・完了条件は未確定のまま）と `progress.md`（メタ情報入り）ができる |
| 同じコマンドを再実行 | 何も変更せず exit 非 0 |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
