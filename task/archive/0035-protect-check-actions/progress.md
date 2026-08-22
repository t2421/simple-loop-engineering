# Progress: `0035-protect-check-actions`

- **Target Spec:** `task/archive/0035-protect-check-actions/spec.md`
- **Branch:** `feat/0035-protect-check-actions`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/51
- **Status:** `Done`
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認（`.claude/skills/add-protected-path` を読んでから着手する）
- [x] テストの作成 (`tests/gate-helpers.test.mjs` — 違反側 3 ケースと許可側 1 ケース。spec「例」の表に対応させる)
- [x] 実装 (`tools/check-protected-paths.mjs` の `GATE_HELPERS` に 1 行 + コメント、`CLAUDE.md`「変えてはいけないもの」の一覧に 1 行)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。ラベル無しで `protected-paths` ジョブが失敗することを確認してから `allow-protected-change` ラベルを付け、成功に変わることを確認する — spec 完了条件 7）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec / progress を起草（spec-author）。0033 の「範囲外」から切り出された追随作業。守り方は `TEMPLATES` ではなく `GATE_HELPERS`（新規追加の許可と違反メッセージの整合のため）。ガードは base リビジョンで動くため、この PR 自身に新保護は効かない（マージ後から効く）。
- 12:30 - `.claude/skills/add-protected-path` を読んでから着手。守り方は skill の表の「単一ファイル」だが、`TEMPLATES` ではなく既存の `GATE_HELPERS` を使う形が該当する（`TEMPLATES` は違反メッセージが型固定で、新規作成まで違反になるため合わない）。
- 12:35 - テストを先に足して RED を確認（新ケース 2 件が fail、既存 9 件は pass）。そのうえで `GATE_HELPERS` に `tools/check-actions.mjs` を 1 行足し、何を防ぐかのコメントを添えて GREEN（11 pass・0 fail）。`CLAUDE.md`「変えてはいけないもの」の一覧にも 1 行足した（212 行目）。既存テストの期待値は 1 件も変えていない。
- 12:38 - 「例」の 4 行を `findViolations` に直接与えて確認。M / D / R はいずれも違反 1 件で理由は `検証の委譲先は変更も移動もできない`、A は違反 0 件（許可）。R は `path=tools/check-actions.mjs -> lib/x.mjs` と移動元・先の両方が出る。出力は会話に貼った。
- 12:40 - `npm run ci` は 390 pass・0 fail（新規 2 件ぶん増）。
- 12:42 - **ローカルでガードの両方向を確認。** skill が予告したとおり、この作業は**独立に 2 件**引っかかる（`tools/check-protected-paths.mjs` の判定変更と `tests/gate-helpers.test.mjs` の既存テスト変更）。ラベル無しで exit 1、`PR_LABELS='["allow-protected-change"]'` で exit 0。これは正しい動作である。完了条件 7 は PR の Actions 実行結果で示す。
- 12:55 - **Verify (外部) 1 回目: `codex-reviewer` が承認。Critical 0 件・High 0 件・Medium 0 件。** codex 自体の指摘もゼロ。レビュー側は `status: 'A'` の許可が抜け穴でないことまで独立に確認している（許可条件が `kind === 'appeared' && from === undefined` なので、`from` を持つ appeared＝別ファイルからのリネームで上書きするケースは違反のまま。ファイルが既に存在する状態では `A` は発生しない）。
- 13:05 - **完了条件 7 の前半を CI 上で実測。** PR #51 を意図的にラベル無しで出し、`protected-paths` が `PR_LABELS: []` で失敗した。base 版チェッカーが `tests/gate-helpers.test.mjs`（既存のテストの内容が変わっている）と `tools/check-protected-paths.mjs`（ガードの判定ロジック自体は変更も移動もできない）の 2 件を検知している。他の 4 チェック（`verify`・`e2e`・`preview`・`progress-coupling`）は pass。後半（ラベル付きで成功）は人間のラベル付与を待つ。
- 13:06 - **副次的な観測: 意図的に赤い PR は Stop hook にブロックされる。** 0033 で入れたゲートが `protected-paths: failure` を検知して停止を止めた。ゲートとしては正しい動作で、`stop_hook_active` により 2 度目は通るので詰まりはしない。ただし「赤いのが正しい状態」の作業では 1 回余分に往復が要ることが分かった。運用上の実害は小さいので、この作業では扱わない。
- `15:15` - **完了条件 7 の後半を CI 上で実測。同一 SHA `0140a38` で赤 → 緑を確認した。** ラベル無し（`04:48:21`）は failure、`allow-protected-change` を付けた再判定（`06:10:08`）は success。後者のログは同じ 2 件（`tests/gate-helpers.test.mjs`・`tools/check-protected-paths.mjs`）を検知したうえで `ラベル allow-protected-change があるため通過させます（人間による明示承認）。` に変わっている。**検知を止めたのではなく、人間の承認で通している**ことがログから読み取れる。これで完了条件 1〜7 がすべて揃った。
- `15:16` - PR #51 がマージされた（`06:10:53`）。0032 のときはラベル無しのままマージされて通過側の実測が残らなかったが、今回は赤・緑の両方が Actions のログに残っている。
