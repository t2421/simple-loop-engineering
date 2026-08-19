# `tools/archive.mjs` を `task/` レイアウトへ追随させる

アーカイブを `task/<id>-<slug>/` → `task/archive/<id>-<slug>/` のディレクトリ移動として行うようにする。

## 種別

バグ修正

## 対象

- 場所: `tools/archive.mjs`、`tests/archive.test.mjs` / `tests/archive-ownership.test.mjs`、`CLAUDE.md`（「アーカイブ」節）
- 公開面: `node tools/archive.mjs <id>-<slug>`

## 背景

`0014-spec-progress-layout` の移行で、作業の単位は `task/<id>-<slug>/`（`spec.md` + `progress.md` + 関連ファイル）になった。アーカイブ先は `task/archive/<id>-<slug>/` である。

`tools/archive.mjs` はこの移行に追随していない。いまも次を行う。

- `specs/<名前>.md` を `specs/archive/` へ移す
- `progress/<名前>.md` と抽出物を `progress/archive/` へ移す
- 進捗の **Target Spec** を `specs/archive/<名前>.md` に書き換える

`0016-archive-pr-ownership` のアーカイブで実際に踏んだ。ツールを走らせると旧レイアウトに置かれ、リポジトリの現状と食い違うため、手作業で `task/archive/0016-archive-pr-ownership/` に置き直した（`task/archive/0016-archive-pr-ownership/progress.md` の 17:40）。

`CLAUDE.md`「アーカイブ」節の「`specs/` と `progress/` に残っている対は `tools/archive.mjs` に従う」も、そのツールが旧レイアウトを作る以上、従うと不整合になる。移行後に残っていた旧対は `0016` が最後なので、この記述はもう役目を終えている。

## 仕様

- `node tools/archive.mjs <id>-<slug>` は、`task/<id>-<slug>/` を `task/archive/<id>-<slug>/` へディレクトリごと移す
- 進捗の **Status** を `Done` に、**Target Spec** を `task/archive/<id>-<slug>/spec.md` にする
- アーカイブのチェック項目 `- [ ] PRマージ後のアーカイブ` を `[x]` にする（現行の振る舞いを保つ）
- PR のマージ確認と帰属検証（`0016-archive-pr-ownership` で入れたもの）は現行のまま働く
- 移動先がすでに存在するなら、上書きせず何も変更せずに失敗する（現行の振る舞いを保つ）
- 途中で失敗したら巻き戻す（現行の振る舞いを保つ）
- `CLAUDE.md`「アーカイブ」節から、旧対に関する記述を落とす

## 範囲外

- 保護パスガードの `task/` 追随（`0017-guard-task-paths` の範囲）
- `specs/` と `progress/` の完全な撤去
- ID の採番の自動化
- `progress/archive/` に残るシンボリックリンクの整理

## 失敗時

- `task/<id>-<slug>/` が存在しない: 何も変更せず失敗する
- `task/archive/<id>-<slug>/` がすでに存在する: 何も変更せず失敗する
- 進捗の **PR** が `未作成`、未マージ、または帰属が一致しない: 何も変更せず失敗する
- 引数が `<id>-<slug>` の形でない: 何も変更せず失敗する

## 例

| 操作または入力 | 期待結果 |
|---|---|
| マージ済み PR を持つ `task/0019-bar/` で実行 | `task/archive/0019-bar/` へ移動。Status が `Done`、Target Spec が新しいパス、関連ファイルも同行する |
| `task/archive/0019-bar/` がすでにある状態で実行 | 変更なし、終了コード非 0 |
| 存在しない `<id>-<slug>` で実行 | 変更なし、終了コード非 0 |
| `TEMPLATE-spec` を指定して実行 | 変更なし、終了コード非 0 |
| PR 未マージの作業で実行 | 変更なし、終了コード非 0 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/` のユニットテスト（一時ディレクトリ上、PR 確認とリポジトリ確認は注入で差し替え）で網羅されている。既存の性質（衝突時の無変更、途中失敗の巻き戻し、帰属検証）が変更前と同じく働く。
