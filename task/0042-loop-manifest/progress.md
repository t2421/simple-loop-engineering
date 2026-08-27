# Progress: `0042-loop-manifest`

- **Target Spec:** `task/0042-loop-manifest/spec.md`
- **Branch:** `feat/0042-loop-manifest`
- **PR:** `未作成`
- **Status:** `Blocked` (Phase: `0044 の実測待ち`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] `task/0044-second-project-port/port-log.md` を読み、想定項目表の各項目を採用 / 不採用に確定する
- [ ] マニフェストのファイル名・形式の確定
- [ ] テストの作成 (`tests/loop-manifest.test.mjs`。「失敗時」の 5 ケースを覆う)
- [ ] 実装（マニフェストの読み取り・検証。固有値を参照する `tools/*.mjs` の置き換え）
- [ ] マニフェスト自身を保護パスへ追加 (`.claude/skills/add-protected-path` に従う)
- [ ] ラベル無し / ラベル付きの `protected-paths` 実行結果を進捗に貼る（→ 完了条件 8）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格し、完了条件を確定した。**着手はしない。** spec の「着手順の注記」どおり 0044 が先行する。`tools/start-task.mjs` は最小 ID を選ぶため、Not Started のままだと 0044 より先に選ばれてしまう。Status を `Blocked` にして順序を機械的に守る。
- `17:59` - 解除条件: `task/archive/0044-second-project-port/` が存在すること（0044 がアーカイブ済み）。解除時に Status を `Not Started` に戻す。
- `17:59` - 0044 の移植先はパッケージマネージャを持たないため、想定項目表の `install` が必須項目でよいかは未確定である旨を「仕様」に追記した。
