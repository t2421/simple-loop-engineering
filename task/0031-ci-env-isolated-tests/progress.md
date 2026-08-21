# Progress: `0031-ci-env-isolated-tests`

- **Target Spec:** `task/0031-ci-env-isolated-tests/spec.md`
- **Branch:** `feature/ci-env-isolated-tests`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 環境変数を落とす共通ヘルパへの集約と、生の `spawnSync` 2 箇所の付け替え (`tests/progress-coupling.test.mjs`)
- [ ] 環境 3 通り（両方なし / `GITHUB_ACTIONS=true` のみ / 両方あり）での `npm run ci` の実測
- [ ] 差分が `tests/progress-coupling.test.mjs` に閉じていることの確認（`tools/`・`.github/workflows/` を含まない）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `03:40` - main への push で `verify` が失敗しているのを受けて起票（計画用ブランチ `docs/ci-env-isolated-tests`）。`gh run view 32442748596 --log-failed` で 343 件中 2 件の失敗を確認。どちらも `tests/progress-coupling.test.mjs` の、`runCli` を通さず生の `spawnSync` で CLI を起動しているテスト。
- `03:42` - 原因の切り分け。`.github/workflows/ci.yml` は push と pull_request の両方で回るが、`GITHUB_HEAD_REF` は `pull_request` でしか入らない。push では `GITHUB_ACTIONS=true` だけが入るため、`main()` の fail-closed（head ref 欠落）に先に当たる。`env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` でローカル再現（84 pass / 2 fail、CI と同じ 2 件）。CLI を直接叩いても、env を落とせば `使い方:`・`差分を取得できませんでした` が出ることを確認済み。
- `03:44` - **チェッカー本体は直さない。** `GITHUB_ACTIONS=true` で head ref が空なら落とすのは `0024-progress-pr-coupling` の spec が定めた挙動であり、`progress-coupling` ゲート自体は `pull_request` でしか動かないので検査は無傷。壊れているのはテストの環境依存だけ。
- `03:46` - `tests/` は保護対象のため、CLAUDE.md「凍結を解いて改訂するとき」に従い、改訂の内容と理由を spec の「背景」に明記した。実装 PR には `allow-protected-change` ラベルを付け、人間がマージする。
