# spec / progress の形式を機械検証する `tools/lint-docs.mjs`

spec / progress / backlog がテンプレートに準拠しているかを検証する `tools/lint-docs.mjs` を追加し、`npm run ci` に組み込む。

## 種別

機能追加

## 対象

- 場所: `tools/lint-docs.mjs`、`tests/lint-docs.test.mjs`、`package.json`（`scripts` に `lint:docs` を追加し `ci` から呼ぶ）
- 公開面: `node tools/lint-docs.mjs`（`npm run lint:docs`）

## 背景

「見出し名・順番は変えない」「メタ情報を欠かさない」はテンプレートの規約だが、機械検証がなく、エージェントの遵守頼みである。起草をサブエージェント（`0022-spec-author-agent`）に委任すると、モデルが変わっても形式の下限を保証する検証層が必要になる。ID の重複・欠落も現状は誰も検知しない。

`package.json` の `scripts` は保護対象だが、この変更は検証を**強める**追加である。CLAUDE.md「凍結を解いて改訂するとき」の手続きに従い、PR に `allow-protected-change` ラベルを付けて人間がマージする。

## 仕様

検証対象と規則:

- `task/`（`archive/` を含む）の各 `NNNN-slug/`:
  - `spec.md` が存在し、見出し（`#` が 1 つ、`##` が 種別・対象・背景・仕様・範囲外・失敗時・例・完了条件 の順）がテンプレートと一致する
  - `progress.md` が存在し、メタ情報 4 項目（**Target Spec** / **Branch** / **PR** / **Status**）を持つ。**Status** は `Not Started | In Progress | Blocked | Done` のいずれか。**Target Spec** のパスが実在する
  - チェックボックスは `[ ]`・`[/]`・`[x]` のいずれか
- `backlog/` の各 `NNNN-slug/`:
  - `spec.md` の見出し規則は task と同じ。「完了条件」節の先頭が「未確定（incomplete）。昇格時に埋める。」の行である
  - `progress.md` を持たない
- ディレクトリ名は `NNNN-slug`（ゼロ埋め 4 桁 + slug）である。ID は `task/`（archive 含む）と `backlog/` を合わせて重複しない
- テンプレート自身（`task/TEMPLATE-*.md`）と旧レイアウト（`specs/`・`progress/`）は検証対象外（凍結資産）
- 違反はファイルパスと理由をすべて列挙し、非 0 で終了する。違反なしなら 0

## 範囲外

- 内容の質（完了条件が良い命題か）の判定
- 違反の自動修正
- 旧 `specs/`・`progress/` の検証

## 失敗時

- 対象ディレクトリの読み取りに失敗: 理由を出力して非 0 で終了する

## 例

| 操作または入力 | 期待結果 |
|---|---|
| すべて準拠している状態で実行 | 出力に違反なし、終了コード 0 |
| spec.md の「範囲外」見出しを削除して実行 | 該当パスと「見出し不一致」が列挙され、非 0 |
| progress.md の Status を `WIP` にして実行 | 該当パスと「Status が不正」が列挙され、非 0 |
| progress.md の Target Spec を実在しないパスにして実行 | 該当パスが列挙され、非 0 |
| `task/0030-a/` と `backlog/0030-b/` が並存する状態で実行 | ID 重複として両パスが列挙され、非 0 |
| `backlog/NNNN-x/` に progress.md を置いて実行 | 該当パスが列挙され、非 0 |
| `npm run ci` | `lint:docs` が実行される |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/lint-docs.test.mjs` のユニットテスト（一時ディレクトリ上）で網羅されている。リポジトリの現状の docs に対して `npm run lint:docs` が 0 で終了する。`package.json` の変更は `allow-protected-change` ラベルの PR で行われている。
