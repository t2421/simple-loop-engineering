# Progress: `0042-loop-manifest`

- **Target Spec:** `task/0042-loop-manifest/spec.md`
- **Branch:** `feat/0042-manifest-reader`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
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
- `2026-09-03` - **再スコープした（人間の判断: 割り直し）。** 1 回目の実装（ブランチ `feat/0042-loop-manifest`、PR #76）は Verify (外部) を 5 回回して 5 回とも不承認となり、CLAUDE.md「トークンコスト」の往復上限に到達していた。指摘は毎回塞がれ最終状態は Critical 0 / High 1 まで来ていたが、**5 回の指摘がすべて同じ構造**（宣言を既定値で補う / 2 実装の非対称 / 宣言した値と実際に使う値の乖離）だった。原因は 1 PR で 6 つのゲートを同時に宣言化したことである。CLAUDE.md は上限超過を「spec か分割の仕方が間違っている」の兆候と定めており、その判断を採った
- `2026-09-03` - **PR #76 はクローズした。ブランチ `feat/0042-loop-manifest` は残す。** `loop.manifest.json`・`tools/loop-manifest.mjs`・2 実装の一致テスト 32 件は、割り直した各作業の材料として参照する。**この作業のブランチは `feat/0042-manifest-reader` を新しく予約した**（古いブランチには不承認の実装が載っており、そこから続けると同じ大きさの PR に戻る）
- `2026-09-03` - 消費者ごとに 3 件へ分けた。`0056-manifest-verify-contract`（消費者 `check-protected-paths.mjs`）・`0057-manifest-layout-ledger`（消費者 3 本。**2 実装の一致テストが完了条件**）・`0058-manifest-optional-stages`（省略可能な項目）。3 件とも Status は `Blocked`（Phase: `0042 の完了待ち`）
- `2026-09-03` - **起草を突き合わせて担当の隙間を 1 件見つけた。** 0056 は「`exclude`/`specFile` の台帳宣言への付け替えは 0057 の範囲」と書き、0057 は「`ledger.docs` の許可リストを読む `isAliasSpec` の宣言化は 0056 の範囲」と書いていた。**双方が相手に振っており、0044 の申し送り 7（台帳の文書構成は許可リストで表す）がどこにも入っていなかった。** 消費者が `check-protected-paths.mjs` である以上 0056 の担当なので、0056 の「仕様」「完了条件」に入れ、範囲外の行を書き換えた
- `2026-09-03` - あわせて **0042 の想定項目表に「実装パス」と「台帳」が無かった**ことが分かった（0056・0057 の両方がその型を前提にしている）。1 回目の実装では作られていたが spec の表には無く、型の側に足した
