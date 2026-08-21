# Stop hook の CI 対象を作業中の worktree にする

Stop hook が回す CI の対象チェックアウトを、セッションの起動ルート（`$CLAUDE_PROJECT_DIR`）ではなく、hook stdin JSON の `cwd` が属する git top-level にする。

## 種別

改善

## 対象

- 場所: `.claude/settings.json` の `hooks.Stop` コマンド（0021-loop-hooks で導入。本起票時点では `feature/loop-hooks` ブランチ上にあり未マージ）。判定をスクリプトに切り出す場合は `tools/` 配下の新規ファイルも対象
- 公開面: なし（hook はセッション停止時に自動実行される）

## 背景

0021-loop-hooks の Stop hook は次のコマンドで CI を回す。

```
cd "$CLAUDE_PROJECT_DIR" && npm run ci 1>&2
```

`$CLAUDE_PROJECT_DIR` はセッションの起動ルートを指す。プライマリチェックアウトでセッションを開始し、`start-task` を経て `.worktrees/<ブランチ名>/` で作業を続けたセッションでは、変更のある worktree ではなくプライマリ（main 相当）に対して CI が走る。結果として、worktree 側の変更が壊れていても Stop hook が成功し、壊れた状態のままセッションを終えられてしまう。hook の stdin JSON にはセッションの現在ディレクトリ `cwd` が含まれるため、その git top-level を CI の対象にするのが筋である。

出典: 0021-loop-hooks の Verify (外部)（codex-reviewer）2 回目の Medium 指摘。0021 の完了条件外のため別作業として起票する。

## 仕様

- Stop hook は、stdin の JSON から `cwd` を読み、`cwd` で `git rev-parse --show-toplevel` が返すディレクトリで `npm run ci` を実行する
- `cwd` が取得できない、または git リポジトリ外の場合は、従来どおり `$CLAUDE_PROJECT_DIR` で実行する（挙動を悪化させない）
- 変更前と変更後の差: プライマリで起動し worktree で作業したセッションの Stop hook が、変更前はプライマリの CI を回していたのに対し、変更後は作業中の worktree の CI を回す
- 判定ロジックをインラインの 1 行に収めるか `tools/` のスクリプトに切り出すかは昇格時に決める。切り出す場合、そのスクリプトを保護対象に加えるかは `.claude/skills/add-protected-path` に従って判断する

## 範囲外

- PreToolUse hook（`tools/guard-worktree.mjs`）の判定変更
- CI の内容（`npm run ci` が何を実行するか）の変更
- worktree ごとの `node_modules` 未整備（`npm ci` 未実行）の自動修復

## 失敗時

- stdin が JSON として読めない、または `cwd` キーが無い: `$CLAUDE_PROJECT_DIR` で `npm run ci` を実行する
- `cwd` の指す先が git リポジトリ外: `$CLAUDE_PROJECT_DIR` で `npm run ci` を実行する
- 対象ディレクトリでの `npm run ci` が失敗: hook として失敗を返し、セッション停止をブロックする（現行と同じ）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| stdin に `{"cwd": "<repo>/.worktrees/feature/x"}` を与えて hook コマンドを実行（worktree に壊れた変更あり） | worktree 側で `npm run ci` が走り、hook が失敗する |
| stdin に `{"cwd": "<repo>"}`（プライマリ）を与えて hook コマンドを実行 | プライマリ側で `npm run ci` が走る |
| stdin に `cwd` の無い JSON を与えて実行 | `$CLAUDE_PROJECT_DIR` で `npm run ci` が走る |

## 完了条件

未確定（incomplete）。昇格時に埋める。
