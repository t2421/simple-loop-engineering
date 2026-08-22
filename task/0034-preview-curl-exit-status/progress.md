# Progress: `0034-preview-curl-exit-status`

- **Target Spec:** `task/0034-preview-curl-exit-status/spec.md`
- **Branch:** `feat/0034-preview-curl-exit-status`
- **PR:** 未作成
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** L

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認（凍結改訂であること、改訂理由が spec にあることを含む）
- [x] 実装 (`.github/workflows/preview.yml` の `Verify deployed content`)
- [x] 偽 curl によるローカル再現手順の実行（「例」の 2・3 行目。出力を会話に貼る）
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付け、人間のマージを待つ）
- [ ] preview ジョブの成功と `検証 OK:` の実測確認（完了条件 7）
- [ ] `protected-paths` ジョブがラベル無しで失敗し、ラベル付きで成功することの確認（完了条件 8）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 21:03 - spec-author が backlog から昇格（2026-08-22 の backlog リファインメントで `preview.yml:104-105` の現状を実測、人間が昇格を決定）。完了条件を確定し progress を新規作成。
- `05:40` - 実装。`|| true` をやめ、`set +e` / `CURL_STATUS=$?` / `set -e` で curl の終了ステータスを別に捕まえ、`CURL_STATUS` が 0 **かつ** `HTTP_CODE` が 200 の両方を要求する形にした。失敗時のメッセージは実態に合わせて分岐させ、curl 非 0 なら終了ステータスを、非 200 なら「200 を返しませんでした」と HTTP コードを出す（両方成立すれば両方出る）。既存のゲート（`-L`・リトライ 3 点・`diff -u`・`検証 OK:`）はすべて残っていることを grep で確認した。
- `05:45` - **「例」の非常系 2 件を偽 curl でローカル再現した。** ワークフロー本文から `Verify deployed content` の run ブロックを機械的に切り出し、PATH 先頭に偽 curl を置いて実行した。(2) `200` を印字して exit 18 → `curl の終了ステータス: 18` を出して exit 1。**修正前はこれが素通りしていた。** (3) `404` を印字して exit 0 → `200 を返しませんでした` と `HTTP コード: 404` を出して exit 1。対照として (200, exit 0) は通過して `検証 OK:` が出る。出力は会話に貼った。
- `05:47` - `npm run ci` は fail 0。
- `06:00` - **Verify (外部) 1 回目: `codex-reviewer` が承認。Critical 0 件・High 0 件・Medium 0 件・Low 0 件。** codex の指摘もゼロ。レビュー側は `$?` がコマンド置換の終了ステータスを捉えることを実測（`x=200 s=18`）し、`set +e` の区間が代入 1 行で最小であること、`-u` で未定義変数を踏まないこと、失敗経路が減っていないことを独立に確認している。「ゲートの追加のみで既存ゲートを一切外していないため、検証を弱めない改訂に該当する」との判定。
