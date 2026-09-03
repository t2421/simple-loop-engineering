# Progress: `0042-loop-manifest`

- **Target Spec:** `task/0042-loop-manifest/spec.md`
- **Branch:** `feat/0042-loop-manifest`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Record`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書ない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] `task/archive/0044-second-project-port/notes/port-log.md` を読み、想定項目表の各項目を採用 / 不採用に確定する（チェックリストの旧パス `task/0044-second-project-port/port-log.md` はアーカイブ後の実体。読むだけ）
- [x] マニフェストのファイル名・形式の確定
- [x] テストの作成 (`tests/loop-manifest.test.mjs`。「失敗時」の 5 ケースを覆う)
- [x] 実装（マニフェストの読み取り・検証。固有値を参照する `tools/*.mjs` の置き換え）
- [x] マニフェスト自身を保護パスへ追加 (`.claude/skills/add-protected-path` に従う)
- [x] ラベル無し / ラベル付きの `protected-paths` 実行結果を進捗に貼る（→ 完了条件 8）
- [ ] レビュー（GitHub Copilot。進捗のレビュアー名を `codex-reviewer` から差し替え。親が PR 作成後に依頼する）
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格し、完了条件を確定した。**着手はしない。** spec の「着手順の注記」どおり 0044 が先行する。`tools/start-task.mjs` は最小 ID を選ぶため、Not Started のままだと 0044 より先に選ばれてしまう。Status を `Blocked` にして順序を機械的に守る。
- `17:59` - 解除条件: `task/archive/0044-second-project-port/` が存在すること（0044 がアーカイブ済み）。解除時に Status を `Not Started` に戻す。
- `17:59` - 0044 の移植先はパッケージマネージャを持たないため、想定項目表の `install` が必須項目でよいかは未確定である旨を「仕様」に追記した。
- `12:00` - 解除条件を確認。`task/archive/0044-second-project-port/` が origin/main に存在する（`1283a38` で 0052 もアーカイブ済み）。Status を `Not Started` に戻し、続けて `In Progress` にした。spec は着手後に書き換えていない（採用 / 不採用は本試行ログに置く。完了条件 5 の「範囲外へ書く」は凍結 spec を弱めないため、人間の承認なしでは spec を改訂しない）。
- `12:01` - worktree `.worktrees/feat-0042-loop-manifest` を `origin/main` から切り、ブランチ `feat/0042-loop-manifest`。`npm ci`。
- `12:02` - ファイル名・形式: `loop.manifest.json`（JSON。追加依存なし）。プラグイン実行機構は作らない。
- `12:03` - 想定項目表の採用 / 不採用（出典: `task/archive/0044-second-project-port/notes/port-log.md` 5 節「0042 へ」。記録に無い項目は新設していない）。

| 項目 | 判断 | 理由 |
|---|---|---|
| `install` | **採用（任意）** | 0044 2.2: 最初の移植先にパッケージマネージャが無く、呼び出しごと落とした。必須にしない。空コマンドは置かない |
| `verify.command` + `verify.definedIn` | **採用** | 0044 2.1: `definedIn` は配列（定義の所在と呼び出しの所在）。このリポジトリでは `package.json` と `.github/workflows/ci.yml` |
| 条件付き工程 (`stages`) | **採用（0 件可）** | 0044 2.4: 対応物が無ければ工程ごと省略。このリポジトリでは e2e を 1 件載せる。`e2e-needed.mjs` は CI が単体コピーするためこの作業では読ませない（範囲外の空実装強制にもしない） |
| 保護パス一覧 (`protectedPaths`) | **採用** | 仕様 3: マニフェスト自身を筆頭に含む。ディレクトリ規則・既存 `GATE_HELPERS` はチェッカーに残す（0044 で 8 箇所あった構造付き規則を 1 宣言に全部載せるのは 0043 に近い） |
| Complexity→モデル表 | **採用** | 0044 は `start-task` を移植しなかっただけで不要とはしていない。`start-task` がマニフェストから読む |
| レビュアーエージェント名 | **採用** | 同上。マニフェストに載せる。指名の実行は CLAUDE.md 側（仕様の範囲外） |
| 実装パス（dir + 単体ファイル） | **項目にしない** | 0044 申し送り 4。CI がゲートを単体コピーするためマニフェストを import できない。0043 へ |
| 作業 ID の形 | **項目にしない** | 0044 申し送り 5。同上 |
| 台帳が追跡されている / 実装より先に base へ入る | **項目にしない** | 0044 申し送り 6。移植可否の前提条件 |
| 台帳文書の許可リスト | **項目にしない** | 0044 申し送り 7。0043 へ |
| hook 配線の凍結 | **項目にしない** | 0044 申し送り 8。0054 で `.claude/settings.json` が `GATE_HELPERS` に入済み |

- `12:04` - 凍結改訂の理由（`tools/check-protected-paths.mjs` と既存 `tests/`）: 検証コマンド定義の参照先をマニフェストの `verify.definedIn` に移す。JSON で `scripts` を持つファイルは従来どおり `scripts` オブジェクトだけを比較し、それ以外は内容の同一性（0044: 形式非依存・強い側）。既存の `GATE_HELPERS`・`APPEND_ONLY_DIRS`・テンプレ保護は残す。マニフェスト自身と `tools/loop-manifest.mjs` を保護に足すのは強化。検証は弱めていない。人間が `allow-protected-change` を付けてマージする。
- `12:07` - `npm run ci` 緑。出力末尾:

```
1..510
# tests 510
# suites 0
# pass 510
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 120557.768885
```

  lint・lint:docs も通過（`docs の形式違反はありません（54 件の作業ディレクトリを確認）。`）。
- `12:07` - 完了条件 7 の grep:

```
$ grep -rn "'npm'" tools/
(0 hits)

$ grep -rn "package.json" tools/check-protected-paths.mjs
(0 hits)
```

- `12:08` - 凍結改訂の確認（この PR 対 `origin/main`）。base 版チェッカー（GitHub が実行する経路）:

```
$ git show origin/main:tools/check-protected-paths.mjs > /tmp/check-protected-paths-base.mjs
$ node /tmp/check-protected-paths-base.mjs origin/main
保護パスの変更を 9 件検知しました:
  - tests/gate-helpers.test.mjs: 既存のテストの内容が変わっている
  - tests/guard-stderr.test.mjs: 既存のテストの内容が変わっている
  - tests/hook-wiring.test.mjs: 既存のテストの内容が変わっている
  - tests/progress-coupling.test.mjs: 既存のテストの内容が変わっている
  - tests/protected-paths.test.mjs: 既存のテストの内容が変わっている
  - tests/start-task-claim.test.mjs: 既存のテストの内容が変わっている
  - tests/start-task.test.mjs: 既存のテストの内容が変わっている
  - tests/stop-hook-ci-dir.test.mjs: 既存のテストの内容が変わっている
  - tools/check-protected-paths.mjs: ガードの判定ロジック自体は変更も移動もできない

変更が正当なら、改訂内容と理由を spec に書いたうえで PR に allow-protected-change ラベルを付けてください。
exit=1

$ PR_LABELS='["allow-protected-change"]' node /tmp/check-protected-paths-base.mjs origin/main
保護パスの変更を 9 件検知しました:
  - tests/gate-helpers.test.mjs: 既存のテストの内容が変わっている
  - tests/guard-stderr.test.mjs: 既存のテストの内容が変わっている
  - tests/hook-wiring.test.mjs: 既存のテストの内容が変わっている
  - tests/progress-coupling.test.mjs: 既存のテストの内容が変わっている
  - tests/protected-paths.test.mjs: 既存のテストの内容が変わっている
  - tests/start-task-claim.test.mjs: 既存のテストの内容が変わっている
  - tests/start-task.test.mjs: 既存のテストの内容が変わっている
  - tests/stop-hook-ci-dir.test.mjs: 既存のテストの内容が変わっている
  - tools/check-protected-paths.mjs: ガードの判定ロジック自体は変更も移動もできない

ラベル allow-protected-change があるため通過させます（人間による明示承認）。
exit=0
```

- `12:08` - 完了条件 8（マニフェストを 1 行変える。base はマニフェスト導入後の `f627794`。一時コミットで測り、`git reset --hard` で捨てた）:

```
$ node tools/check-protected-paths.mjs f627794
保護パスの変更を 1 件検知しました:
  - loop.manifest.json: ループマニフェストは変更も移動もできない

変更が正当なら、改訂内容と理由を spec に書いたうえで PR に allow-protected-change ラベルを付けてください。
exit=1

$ PR_LABELS='["allow-protected-change"]' node tools/check-protected-paths.mjs f627794
保護パスの変更を 1 件検知しました:
  - loop.manifest.json: ループマニフェストは変更も移動もできない

ラベル allow-protected-change があるため通過させます（人間による明示承認）。
exit=0
```

- `12:09` - 閉じて未マージの PR #76（同じブランチ名、レビュー往復 5 回上限で Blocked）は、0044 申し送りをマニフェスト項目にほぼ全部載せた結果レビューが収束しなかった。本実装は想定項目表に対する採用 / 不採用を試行ログに置き、構造付きの台帳・実装パスは項目にしない。#76 から残す知見は 1 つ: ガードはマニフェストを **base と HEAD の和集合**で読む。HEAD だけだと、同じ PR で `definedIn` から定義ファイルを外して検証を空にできる。