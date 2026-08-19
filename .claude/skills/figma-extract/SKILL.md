---
name: figma-extract
description: >-
  Extracts a Figma design into the JSON and PNG that a spec's token table and
  computed-style tests are verified against. Use when a work item has a Figma
  URL, when writing the token table for a UI spec, or when a progress file has
  a Figma extraction checklist item.
origin: user
---

# Figma を抽出して作業ディレクトリに置く

Figma のライブファイルは完了条件にしない。**抽出して作業ディレクトリに置いた JSON・PNG が正である。**
ライブファイルは後から変わる。変わった時点で完了条件が揺れるなら、それは検証可能な命題ではない。

抽出は実装より**先**に行う。同じ進捗のチェック項目にする。

## 保存先

進捗ファイルと同じディレクトリに置く。新規作業は `task/<id>-<slug>/`。

| 対象 | パス |
|---|---|
| 進捗 | `task/<id>-<slug>/progress.md` |
| トークン | `task/<id>-<slug>/<slug>.figma.json` |
| 見た目 | `task/<id>-<slug>/<slug>.png` |

アーカイブするときはディレクトリごと `task/archive/<id>-<slug>/` へ移す。

`tests/calc-page.test.mjs` は `progress/archive/calc-page.*` を読む。本体は `task/archive/0003-calc-page/` にあり、`progress/archive/` からはシンボリックリンクする。テストコードは変えない。

## 手順

1. Figma の URL から `fileKey` と `nodeId` を取る。**URL の `node-id` はハイフン区切り（`node-id=1-2`、URL エンコードされて `1%3A2` のこともある）だが、MCP へ渡す形と JSON に書く形はコロン区切り（`1:2`）である。** URL デコードしたうえで `-` を `:` に直す
2. `mcp__figma__get_variable_defs` と `mcp__figma__get_design_context` で対象ノードの値を読む
3. 下の形で `task/<id>-<slug>/<slug>.figma.json` に書く
4. `mcp__figma__get_screenshot` で同じノードの PNG を `task/<id>-<slug>/<slug>.png` に保存する
5. JSON のトークンを spec の「仕様」のトークン表に転記する
6. Figma の URL は spec の「背景」に出典として書く。完了条件にはしない

## JSON の形

```json
{
  "source": {
    "fileKey": "<file key>",
    "nodeId": "<node id>",
    "nodeName": "<node name>",
    "extractedAt": "<YYYY-MM-DD>"
  },
  "canvas": { "nodeId": "…", "width": 1512, "height": 982, "fill": "#ffffff" },
  "elements": {
    "<要素名>": {
      "nodeId": "…",
      "name": "…",
      "width": 480,
      "gap": 24,
      "fill": "#ffffff",
      "border": { "width": 1, "style": "solid", "color": "#d9d9d9" },
      "borderRadius": 8,
      "padding": { "top": 40, "right": 40, "bottom": 40, "left": 40 },
      "color": "#1a1a1a",
      "fontSize": 16,
      "fontWeight": 600
    }
  }
}
```

## 何を載せ、何を載せないか

載せるのは、**その要素の CSS で明示的に固定されるトークン**か、**flex の等分割から一意に決まる幾何値**だけ。

| 載せる | 載せない |
|---|---|
| 色・余白・フォント・半径・境界 | 整列・重なり・階層 |
| 固定幅／等分割で決まる幅・高さ | フォントの行送りに依存して決まる文字要素の幅・高さ |

載せなかったものは**残差**である。残差は spec に書かず、Verify (外部) のスクショレビューで見る。

トークン表に無い値を実装に置かない。実装は CSS 変数で参照する。

## 検証

抽出した JSON は、描画して計算スタイルを読むテストの期待値になる。テストは `npm run test:e2e` が回す。progress には書かない。

PNG はピクセル差分の基準になる。差分画像を出す場合は gitignore する（`<slug>.diff.png`）。

## やらないこと

- 「Figma どおり」「近い」を完了条件にする
- ライブファイルを直接見て実装する
- 抽出を実装より後に回す
