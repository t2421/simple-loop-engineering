# Progress: `0056-manifest-verify-contract`

- **Target Spec:** `task/0056-manifest-verify-contract/spec.md`
- **Branch:** `feat/0056-manifest-verify-contract`
- **PR:** `未作成`
- **Status:** `Blocked` (Phase: `0042 の完了待ち`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 0042 が確定したファイル名・モジュール名・項目名を確認し、本 spec の名前との対応表を試行ログに残す（意味は変えない）
- [ ] PR #76（`feat/0042-loop-manifest`）の材料を読み、spec「背景」の 3 つの指摘が入り込んでいない形で流用範囲を決める
- [ ] マニフェストに `verify.invokedIn` と `protectedPaths`（`templates` / `gateHelpers` / `appendOnlyDirs`）を宣言する。`gateHelpers` に判定コードと読み取り層のモジュールを含める
- [ ] 読み取り層に、0042 に無い分の検査（`invokedIn`、保護パス一覧の葉までの型、自己保護の内部整合）を足す
- [ ] テストの作成 (`tests/verify-contract.test.mjs`。「例」の `definitionChanged` 10 行と「既定値で補わない・内部不整合」8 行を覆う)
- [ ] 実装 (`tools/check-protected-paths.mjs`。`definitionChanged` / `buildPolicy` / `findViolations` の方針受け取り。`main()` は merge-base の宣言を読む)
- [ ] 既存テスト 3 本 (`tests/protected-paths.test.mjs`・`tests/gate-helpers.test.mjs`・`tests/hook-wiring.test.mjs`) の方針の供給だけを変える。`assert` 行を変えない
- [ ] `.github/workflows/guard.yml` で読み取り層のモジュールも base リビジョンを取り出して実行する
- [ ] 完了条件 5 の grep（ハードコード 0 行）と完了条件 9 の grep（禁じ手 0 行）の出力を貼る
- [ ] 完了条件 7「わざと落とす検査」5 通りの fail 出力と、戻した後の pass 出力を貼る
- [ ] 完了条件 10 の再現手順（HEAD で宣言を弱めても merge-base の宣言で違反 2 件）の出力を貼る
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）。`allow-protected-change` ラベル無しの `protected-paths` 失敗と、ラベル付きの成功の両方を貼る（→ 完了条件 12）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `18:20` - spec と progress を起草した。**着手はしない。** 0042（マニフェストの型と読み取り層）の完了を待つ依存があるため Status を `Blocked` にする。解除条件: `task/archive/0042-loop-manifest/` が存在すること。解除時に Status を `Not Started` に戻す。
- `18:20` - 消費者を `tools/check-protected-paths.mjs` 1 本に限った。0057（実装パス・台帳）・0058（省略可能な項目）と並行して起草されており、触るファイルは重ならない想定だが、マニフェストと読み取り層は 3 作業が共有するので、後からマージする側が main を取り込んで解決する。
- `18:20` - 本 spec の項目名は PR #76 の材料に合わせた仮の名前である。0042 が別名で確定したら、意味を変えずに名前だけ追随し、対応表をここに残す（spec は変更しない）。
