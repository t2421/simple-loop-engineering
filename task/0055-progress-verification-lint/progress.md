# Progress: `0055-progress-verification-lint`

- **Target Spec:** `task/0055-progress-verification-lint/spec.md`
- **Branch:** `feat/0055-progress-verification-lint`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] テストの作成 (`tests/lint-docs-progress-verification.test.mjs`。既存 `tests/lint-docs.test.mjs` は変更しない)
- [ ] 実装 (`loop-core/ledger/lint-docs.mjs` に `checkProgressNoSharedVerification` を足し、`checkProgress` から呼ぶ。`task/archive/` は外す)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `00:48` - backlog から昇格した（`node loop-core/bin/loop.mjs promote 0055-progress-verification-lint`）。完了条件 5〜10・失敗時・例を確定した。0043 後の lint 所在は `loop-core/ledger/lint-docs.mjs`。検知は共通検証の dump（全件集計クラスタと docs lint の成功文）に限り、コマンド名だけの言及は落とさない。フェンスの中と外の両方を見る。作業固有の `node --test` + テストファイルパスは免除する。`task/archive/` はパス接頭辞で外す。Complexity は `M`（lint 本体と新規テストの 2 ファイル。フェンス内外と偽陽性の切り分けがある。凍結改訂は含まない）。**この PR は昇格（docs）だけ。実装はしない。** 実装 PR の予約ブランチは `feat/0055-progress-verification-lint`。この git ブランチは `docs/promote-0055-progress-verification-lint`。進捗の **PR** は実装 PR 用なので `未作成` のまま。検知対象そのものの成功文や全件集計行は、この進捗に貼らない（`0041` と同じ回避）。
- `00:49` - `npm run lint:docs` は終了コード 0。成功文はここに貼らない（この作業の検知対象そのもの）。出力は docs PR 本文と会話に置く。
