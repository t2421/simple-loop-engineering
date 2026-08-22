# `lint-docs` の偽陰性 3 件の修正

`tools/lint-docs.mjs` が壊れた文書を通してしまう穴 3 つを塞ぐ。

## 種別

バグ修正

## 対象

- 場所: `tools/lint-docs.mjs`（`parseMetadata` / `checkProgress`、`checkSpecHeadings`、`checkBacklogCompletion`）
- 公開面: `npm run lint:docs`（`node tools/lint-docs.mjs [ルート]`）。純関数の署名は変えない

## 背景

`0023-lint-docs` の外部レビュー（codex-reviewer、2 回目）で Medium 指摘が 3 件出た。いずれも**壊れた文書を故意に作ったときだけ通る**偽陰性で、正しく書かれた文書を落とすものではないため 0023 の必須修正にはしなかった。

1. **メタ情報の印と字下げ。** `parseMetadata` は `/^\s*[-*]\s+\*\*(.+?):\*\*/` で読むため、`*` 印や字下げされたメタ情報でも lint は通る。しかし `tools/start-task.mjs` は `` ^- \*\*キー:\*\* ``、`tools/archive.mjs` は `/^- \*\*PR:\*\*/`・`/^- \*\*Branch:\*\*/` と、行頭の `- ` しか読めない。lint が通した文書で、後の選択（start-task）・アーカイブ（archive）が失敗する。
2. **見出しの一致判定。** `checkSpecHeadings` は `sections.join(' ') !== SPEC_HEADINGS.join(' ')` と、区切りに空白を使った文字列同士の比較で判定する。見出し名自体に空白が入りうるため、`## 種別 対象` という 1 見出しが `## 種別` + `## 対象` の 2 見出しと同じ文字列になり素通りする。
3. **backlog「完了条件」節の直後のフェンス。** `checkBacklogCompletion` は `linesOutsideFences` の結果から「見出しの次の非空行」を探す。節の直後にコードフェンスがあるとその塊ごと落ちるため、フェンスの**後**にある行を節の先頭と誤認する。実際にはフェンス塊で始まる壊れた節が通る。

2026-08-22 の 2 回目の backlog リファインメントで、3 件とも現存を実測確認し、人間が着手を決めた。

1. `parseMetadata`（`tools/lint-docs.mjs:180`）の正規表現は `/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/` のまま。実挙動を確認した: `"* **Status:** \`In Progress\`\n  - **PR:** 未作成"` を与えると lint は `[['Status','\`In Progress\`'], ['PR','未作成']]` と**読めてしまう**。一方 `tools/archive.mjs:56` は `/^- \*\*PR:\*\*\s*(.+?)\s*$/m`、同 71 行は `/^- \*\*Branch:\*\*\s*(.+?)\s*$/m`、`tools/start-task.mjs:60` は `` new RegExp(`^- \\*\\*${label}:\\*\\*\\s*(.+)$`) `` で、いずれも**行頭の `- ` しか読まない**。lint を通った文書で選択・アーカイブが失敗する
2. `checkSpecHeadings` の `sections.join(' ') !== SPEC_HEADINGS.join(' ')` は `tools/lint-docs.mjs:164` に現存
3. `checkBacklogCompletion` は `tools/lint-docs.mjs:237` に現存

## 仕様

変更後、次が成り立つ。3 件とも「例」の表の壊れた文書に対して違反を報告する。正しく書かれた既存の文書（現リポジトリの `task/`・`task/archive/`・`backlog/`）に新しい違反は出ない。

1. progress.md のメタ情報のうち、`tools/start-task.mjs`・`tools/archive.mjs` が読めない形（`*` 印、行頭の字下げ）で書かれた行は、そのキーが「無い」または「形式不正」として違反になる。判定の狭さは選択側・アーカイブ側の正規表現（行頭 `- ` のみ）に揃える。lint だけ広い・狭い状態を作らない
2. spec.md の `##` 見出しの一致判定は、join した文字列比較ではなく要素ごとの配列比較で行う。見出しの個数と各名前が `SPEC_HEADINGS` と 1 対 1 で一致しない限り違反になる
3. backlog の「完了条件」節の判定は、節の直後（見出しと未確定行のあいだ）にコードフェンスがある場合、フェンス塊を節の先頭コンテンツとみなして違反にする。フェンスの後の行を節の先頭と誤認しない

テストの置き場所は昇格時に次のとおり決めた。`tests/` は append-only（既存ファイルの
内容変更・削除を禁じ、新規追加のみ許す）であり、`tests/lint-docs.test.mjs` は既存のため
足せない。**この作業のテストは新規ファイル `tests/lint-docs-false-negatives.test.mjs` に置く。**
`tests/*.test.mjs` は `tools/run-unit-tests.mjs` が自動列挙するので、置くだけで
`npm run test:unit` が拾う。`tools/lint-docs.mjs` 自体は保護パス一覧の外であり、
この方針なら `allow-protected-change` ラベルは不要である。

## 範囲外

- 内容の質の検証（完了条件が良い命題かなど）。0023 と同じ
- 旧レイアウト（`specs/`・`progress/`）と型（`task/TEMPLATE-*.md`）の検証。0023 と同じ
- `tools/start-task.mjs`・`tools/archive.mjs` の読み取りを**広げる**変更（`*` 印を許すなど）。整合は lint を狭める側で取る
- 新しい検証項目の追加。既存 3 関数の偽陰性の修正だけ
- 既存 `tests/lint-docs.test.mjs` の変更（`tests/` は append-only。この作業のテストは新規ファイル `tests/lint-docs-false-negatives.test.mjs` に置く）

## 失敗時

なし。違反の報告（終了コード 1 と理由の列挙）は既存の仕組みのままで、この修正で報告される違反が増えるだけである。

## 例

一時ディレクトリに次の文書を置き、`node tools/lint-docs.mjs <ルート>` を実行する。

| 操作または入力 | 期待結果 |
|---|---|
| progress.md のメタ情報を `*   **Branch:** feature/x` のように `*` 印 + 字下げで書く（4 キーとも同様） | 終了コード 1。該当キーの違反が報告される |
| progress.md のメタ情報 1 行だけを字下げした `  - **PR:** 未作成` にする | 終了コード 1。**PR** の違反が報告される |
| spec.md の `## 種別` と `## 対象` を 1 行の `## 種別 対象` にまとめる（他の見出しは正しいまま） | 終了コード 1。見出し不一致が報告される |
| backlog の spec.md で「完了条件」見出しの直後にコードフェンス塊を置き、その後に未確定行を置く | 終了コード 1。「完了条件」節の違反が報告される |
| 行頭 `- ` の正しいメタ情報・正しい見出し・未確定行で始まる backlog（現リポジトリの既存文書を含む） | 終了コード 0。違反なし |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 新規テストファイル `tests/lint-docs-false-negatives.test.mjs` が、「例」の壊れた文書 4 行（`*` 印 + 字下げのメタ情報、1 行だけ字下げしたメタ情報、結合された `## 種別 対象` 見出し、「完了条件」直後のフェンス塊）それぞれについて違反が報告されることを検証し、通る。既存 `tests/lint-docs.test.mjs` は変更しない。
6. リポジトリのルートで `node tools/lint-docs.mjs` が終了コード 0 で終わる。現リポジトリの既存文書（`task/`・`task/archive/`・`backlog/`）に新しい違反が出ない。
7. progress.md のメタ情報の判定は行頭 `- ` の行だけを有効とみなす。`tools/archive.mjs`（`/^- \*\*PR:\*\*/`・`/^- \*\*Branch:\*\*/`）と `tools/start-task.mjs`（`` ^- \*\*キー:\*\* ``）が読めない行を lint が有効と数えない。この整合は 5 のテスト（`*` 印・字下げの違反検出）で検証する。
8. `npm run ci` が通る。
9. 差分が保護パスを含まない。`node tools/check-protected-paths.mjs main` が通る。
