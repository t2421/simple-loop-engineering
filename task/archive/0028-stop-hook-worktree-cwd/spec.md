# Stop hook の CI 対象を作業中の worktree にする

Stop hook が回す CI の対象チェックアウトを、セッションの起動ルート（`$CLAUDE_PROJECT_DIR`）ではなく、hook stdin JSON の `cwd` が属する git top-level にする。

## 種別

改善

## 対象

- 場所: `.claude/settings.json` の `hooks.Stop` コマンド（0021-loop-hooks で導入。現在は main にマージ済みで、`cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2`）
- 場所: `tools/stop-hook-ci-dir.mjs`（新規。stdin の JSON から CI を回す対象ディレクトリを決めて標準出力に 1 行で出す）、`tests/stop-hook-ci-dir.test.mjs`（新規）
- 場所: `tools/check-protected-paths.mjs` の `GATE_HELPERS`、`CLAUDE.md`「変えてはいけないもの」、`tests/gate-helpers.test.mjs`（新チェッカーを保護対象に加える。`.claude/skills/add-protected-path` の手順に従う）
- 公開面: なし（hook はセッション停止時に自動実行される）

## 背景

0021-loop-hooks の Stop hook は次のコマンドで CI を回す。

```
cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2
```

`$CLAUDE_PROJECT_DIR` はセッションの起動ルートを指す。プライマリチェックアウトでセッションを開始し、`start-task` を経て `.worktrees/<ブランチ名>/` で作業を続けたセッションでは、変更のある worktree ではなくプライマリ（main 相当）に対して CI が走る。結果として、worktree 側の変更が壊れていても Stop hook が成功し、壊れた状態のままセッションを終えられてしまう。hook の stdin JSON にはセッションの現在ディレクトリ `cwd` が含まれるため、その git top-level を CI の対象にするのが筋である。

出典: 0021-loop-hooks の Verify (外部)（codex-reviewer）2 回目の Medium 指摘。0021 の完了条件外のため別作業として起票した。

昇格時点で 0021 は main にマージ済み（`task/archive/0021-loop-hooks/`）であり、`.claude/settings.json` の Stop hook は起票時のまま `cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2` である。**穴は現に開いている。**

この穴は「検査が走っているのに、検査したい対象を検査していない」という型で、`0024-progress-pr-coupling`（モードだけの変更で progress 更新と数えられた）や `0031-ci-env-isolated-tests`（push イベントでは head ref が入らず、テストが意図した経路に到達しなかった）と同じ族である。緑が出ていることが、検証された証拠になっていない。

## 仕様

- Stop hook は、stdin の JSON から `cwd` を読み、`cwd` で `git rev-parse --show-toplevel` が返すディレクトリで `npm run ci` を実行する
- `cwd` が取得できない、または git リポジトリ外の場合は、従来どおり `$CLAUDE_PROJECT_DIR` で実行する（挙動を悪化させない）
- 変更前と変更後の差: プライマリで起動し worktree で作業したセッションの Stop hook が、変更前はプライマリの CI を回していたのに対し、変更後は作業中の worktree の CI を回す
- **判定は `tools/stop-hook-ci-dir.mjs` に切り出す**（昇格時の判断）。stdin の JSON を読み、CI を回すディレクトリを標準出力に 1 行だけ出す。CI 自体は実行しない。stdin の解析と対象ディレクトリの決定は、注入可能な純関数として公開しテストする。インラインの 1 行に収めない理由は、stdin の JSON 解析・git top-level の解決・フォールバックの 3 つが要り、シェルの 1 行では失敗時に意図しないディレクトリで CI が走る形（fail-open）になりやすいため
- Stop hook のコマンドは、スクリプトが出したディレクトリへ移動して `npm run ci` を実行する。**スクリプトが失敗したときに CI を回さずに成功扱いで終わらない**こと。`npm run ci` を実行する形（検証コマンドが `.claude/settings.json` から見えること）は維持する
- **`tools/stop-hook-ci-dir.mjs` を保護対象に加える**（`tools/check-protected-paths.mjs` の `GATE_HELPERS`）。このスクリプトは「セッション停止時の CI をどこで回すか」を決める。書き換えれば変更の無いチェックアウトを指させ、Stop hook の検証を骨抜きにできるため、`tools/e2e-needed.mjs`・`tools/check-progress-coupling.mjs` と同じ性質を持つ。内容変更・削除・リネームは違反とし、新規追加（この導入 PR）は許す

## 範囲外

- PreToolUse hook（`tools/guard-worktree.mjs`）の判定変更
- CI の内容（`npm run ci` が何を実行するか）の変更
- worktree ごとの `node_modules` 未整備（`npm ci` 未実行）の自動修復

## 失敗時

- stdin が JSON として読めない、または `cwd` キーが無い: `$CLAUDE_PROJECT_DIR` を出力する（従来の挙動へフォールバックする。悪化させない）
- `cwd` の指す先が git リポジトリ外、または `git rev-parse --show-toplevel` が失敗する: `$CLAUDE_PROJECT_DIR` を出力する
- `CLAUDE_PROJECT_DIR` も得られない: 終了コード非 0 で終わる。**推測でどこかを出力しない**
- スクリプトが終了コード非 0 で終わった: hook は `npm run ci` を実行せずに失敗を返す。**CI を回さないまま成功扱いで終わらない**
- 対象ディレクトリでの `npm run ci` が失敗: hook として失敗を返し、セッション停止をブロックする（現行と同じ）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| stdin に `{"cwd": "<repo>/.worktrees/feature/x"}` を与えてスクリプトを実行 | `<repo>/.worktrees/feature/x` を出力する（プライマリではない） |
| stdin に `{"cwd": "<repo>"}`（プライマリ）を与えて実行 | `<repo>` を出力する |
| stdin に `{"cwd": "<repo>/src"}`（リポジトリ内の下位ディレクトリ）を与えて実行 | `<repo>` を出力する（git top-level へ正規化する） |
| stdin に `cwd` の無い JSON を与えて実行 | `$CLAUDE_PROJECT_DIR` を出力する |
| stdin が JSON として壊れている | `$CLAUDE_PROJECT_DIR` を出力する |
| stdin の `cwd` が git リポジトリ外のディレクトリ | `$CLAUDE_PROJECT_DIR` を出力する |
| `CLAUDE_PROJECT_DIR` が未設定で、`cwd` も使えない | 終了コード非 0 で終わる（何も出力しない） |
| worktree に壊れた変更がある状態で、その worktree の `cwd` を与えて hook コマンド全体を実行 | worktree 側で `npm run ci` が走り、hook が失敗する |
| `tools/stop-hook-ci-dir.mjs` を変更した差分 | ガードが違反として検知する |
| `tools/stop-hook-ci-dir.mjs` を新規追加した差分 | ガードは違反としない（導入 PR） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/stop-hook-ci-dir.test.mjs` のユニットテストで網羅されている（stdin の中身と `CLAUDE_PROJECT_DIR` を注入する形で書く。ガードの 2 行は `tests/gate-helpers.test.mjs` と同じ判定を同ファイルから呼んで固定する）。
6. **実 git リポジトリを作って worktree を足し、その worktree の `cwd` を与えたときに worktree 側のパスが返ることを確かめている**（純関数のテストだけでは、git top-level の解決という配線を検証したことにならない）。
7. `.claude/settings.json` の Stop hook が `tools/stop-hook-ci-dir.mjs` の出力したディレクトリで `npm run ci` を実行する形になっている。スクリプトが失敗したときに `npm run ci` を回さずに成功扱いで終わらないことを、再現手順で示している。
8. `tools/stop-hook-ci-dir.mjs` がガードの保護対象になっている（`.claude/skills/add-protected-path` の手順 2〜4 ＝ CLAUDE.md の一覧・`GATE_HELPERS`・`tests/gate-helpers.test.mjs` が揃っている）。
9. この PR に `allow-protected-change` ラベルが付き、人間がマージする（`tools/check-protected-paths.mjs` と `tests/` の改訂を含むため）。
