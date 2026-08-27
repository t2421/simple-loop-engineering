# Progress: `0051-calc-vec-add`

- **Target Spec:** `task/0051-calc-vec-add/spec.md`
- **Branch:** `feat/0051-calc-vec-add`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] Figma ノードの JSON 抽出 (`task/0051-calc-vec-add/calc-vec-add.figma.json`)
- [x] Figma フレームの PNG キャプチャ (`task/0051-calc-vec-add/calc-vec-add.png`)
- [x] spec の改訂（Figma と spec 本文の矛盾の解消。人間の承認済み）
- [x] テストの作成 (`tests/calc-vec-add.e2e.mjs`)
- [x] 実装 (`src/vector.html` / `src/vector.css` / `src/vector.mjs`。`src/calc.*` は変更しない)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] レビューサブエージェント (`visual-design-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] 見た目のスクリーンキャプチャを PR 本文に貼る（未計算と、例の 1 件以上の計算後）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 09:05 - 計画用ブランチ `docs/0050-0051-vec-add` で spec/progress を起草。実装は未着手。`addVec` は `0050-math-vec-add` に依存。Figma は無く、仕様のトークン表を正とする。
- 10:00 - 人間の指示で Figma 出典を追記。file key `ftGcQpbvknoosfpy3aP1FQ`、node `2:5`（`vector-calculator-ui`）。ライブファイルは完了条件にしない。抽出は実装より先のチェック項目。起草時の仮トークン表は抽出生に差し替えた。
- 15:46 - 着手。0051 は最小 ID ではない（0041 が未着手）ため `start-task.mjs` の自動選択ではなく、CLAUDE.md「特定の作業を並行で開始するとき」の手順で worktree を手動作成した。
- 15:50 - **spec が満たせないことが判明。** 3 点の矛盾を実測で確認した。
  1. Figma `2:5` は独立した 1440×1024 のページ（ヘッダーバー・2 カラム・828px のグラフカード）で、spec 本文の「既存 Calculator カード内の一節」とは両立しない。
  2. `src/calc.html` へ可視要素を足すと、凍結対象の `tests/calc-page.test.mjs` のピクセル比較が必ず落ちる。実測した許容差は 7,424px（1512×982 の 0.5%）で、480×300 の節を足すだけで 144,000px、**約 19 倍**の超過になる。
  3. 改訂前の完了条件 6（PNG 全面 0.5%）と 範囲外（減算を実装しない）が矛盾する。PNG の結果カードには減算・内積・長さの 5 行が描かれている。
- 15:52 - 人間に方針を確認。**「Figma を正・新ページ・加算のみ」を選択**。spec を改訂した（改訂内容と理由は spec の「改訂の記録」）。
- 15:53 - フォントを自己ホストで用意。Google Fonts の `text=` サブセット API で `Noto Sans JP`（可変, 26KB）、latin サブセットで `JetBrains Mono`（可変, 31KB）。`fvar` を確認し、どちらも wght 軸を持つ可変フォントであることを確かめた（合成ボールドではない）。
- 16:05 - 初回描画。領域ごとのピクセル不一致率は headerBar 0.999% / inputCard 9.399% / graphCard 1.753%。
- 16:12 - inputCard の 9.4% の原因は 2 つ。
  - **行送り。** `line-height: normal` は Noto Sans JP で 18px → 26px になるが、Figma のテキストノードは 22px。縦のリズムが全体でずれていた。抽出 JSON に `lineHeight` を足し、CSS 変数で参照するようにした。
  - **枠線の掛かり方。** Figma のカードは内側ストロークで、内寸 444px を減らさない。`border` だと content-box が 2px 狭まる。抽出 PNG の実測（`x=40` に `#e2e8f0` が載る）で内側ストロークを確認し、`box-shadow: inset` で描くようにした。
  - 結果、レイアウトを持つ全要素の位置・寸法が Figma の値と完全一致した（`input-card 40,112 500x386`、`calc-button 68,422 444x48` など）。inputCard は 0.322% に低下。
- 16:20 - graphCard の 1.12% を実測で分解した。
  - 1px のグリッド線が整数座標だと 2 列に割れてぼやける（実測 `#f0f3f7` が 2 列 vs Figma `#e2e8f0` が 1 列）。半ピクセル（+0.5）に載せて解消。
  - 軸の 2px ストロークの位置が 1px ずれていた。実測では縦軸のインクは列 250-251、横軸のインクは行 248-249。座標を 251 / 249 に直した。
  - グリッド枠（1px `#cbd5e1`、角丸 8px）の描画が抜けていた。追加した。
  - 目盛りラベルの位置規則（x はグリッド線の -12px から左寄せ、y は右端 244px）は実測と一致しており、変更不要だった。
  - 結果 0.380%。
- 16:28 - **ピクセル比較の色許容差を 0.1 → 0.3 にした。** headerBar だけが 0.812% で残り、差分画像は全面が文字のアンチエイリアスだった。ウェイトを 500/600/700 で振っても 700 が最良（0.812%）で、実装側で縮められない Figma と Chromium のラスタライザ差である。閾値を緩める前に**変異テストで「まだ噛む」ことを確認**した。
  - 余白 1px ずらす → inputCard 0.823% / graphCard 0.590% で落ちる
  - 入力欄の高さ 1px → inputCard 1.171% で落ちる
  - 行送り 1px → inputCard 0.755% / graphCard 0.556% で落ちる
  - 一方、**グリッド線の色を 1 段変える（0.242%）と軸を 1px ずらす（0.423%）はすり抜けた。** この 2 つはピクセル比較に頼らず、トークンの計算スタイルと SVG の座標値として直接検証する項目をテストに足した。
- 16:35 - テストが `.graph-card .card-hint` の色違いを検出した（実装 `#94a3b8` / Figma `#475569`）。入力カードのヒントと同じ変数を使っていたのが誤り。修正した。
- 16:38 - **凍結対象への変更を 1 つ減らした。** 新しい e2e を `tests/calc-vec-add.test.mjs` にすると `tools/run-unit-tests.mjs`（凍結対象）が `tests/*.test.mjs` を集める規則に引っかかり、`npm run ci` が Chromium 無しで Playwright を回してしまう。ツールを変更する代わりに、ファイル名を `tests/calc-vec-add.e2e.mjs` にして列挙から自然に外した。凍結対象の変更は spec と `package.json` の 2 つに留まる。
- 16:40 - `eslint.config.mjs` にブラウザ globals を足そうとしたが、設定の緩和を止める hook に阻まれた。設定ではなくコード側を直し、`globalThis.getComputedStyle` / `globalThis.document` 経由にした。
- 16:45 - 自己検証を完了。`npm run ci` 466/466 pass、`npm run test:e2e` 63/63 pass（うち `calc-page.test.mjs` は**無変更で** 28/28 pass）。`src/calc.html` / `calc.css` / `calc.mjs` / `tests/calc-page.test.mjs` は main から差分ゼロ。
- 16:45 - 実装が先、テストが後になった。ピクセル忠実度の詰めが実測の反復だったためで、TDD の順序を守れていない。値が固まった段階でテストに落とし、その後にテストが実装の誤り（ヒントの色）を 1 件検出した。
