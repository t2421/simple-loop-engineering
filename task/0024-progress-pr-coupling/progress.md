# Progress: `0024-progress-pr-coupling`

- **Target Spec:** `task/0024-progress-pr-coupling/spec.md`
- **Branch:** `feature/progress-pr-coupling`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/progress-coupling.test.mjs`)
- [x] 実装 (`tools/check-progress-coupling.mjs`、`.github/workflows/guard.yml` へのジョブ追加)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（`allow-protected-change` ラベルを付ける。進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。`.github/workflows/` の改訂を含むため凍結改訂手続き（ラベル + 人間マージ）が必要。
- `06:05` - テストを先に作成し RED を確認（`ERR_MODULE_NOT_FOUND: tools/check-progress-coupling.mjs`）。判定は差分パス一覧とラベルを注入する純関数（`evaluateCoupling`）として公開し、CLI は `resolveCoupling` 経由で差分を取る。
- `06:20` - 実装後 `npm run ci` が 204 tests / 0 fail で通過（新規 20 件）。仕様の「例」6 行はすべて `tests/progress-coupling.test.mjs` の「例1〜例6」で網羅。
- `06:25` - progress の数え方は「パス」ではなく「作業ディレクトリ」の集合にした。移動元・移動先の両方が同じ作業を指すときに 2 件と誤判定しないため。
- `06:30` - `guard.yml` に `progress-coupling` ジョブを追加。`protected-paths` と同じく base リビジョンのチェッカーを一時ファイルへ取り出して実行する（候補側を実行すると、判定を骨抜きにする変更と実装変更を同じ PR に入れるだけで回避できる）。`${{ }}` は env 経由でのみ渡す。
- `06:35` - 差分の取得・解釈に失敗したときは fail-closed（終了コード 1）。`resolveCoupling` の `error: 'diff'` で表現し、テストで固定した。
