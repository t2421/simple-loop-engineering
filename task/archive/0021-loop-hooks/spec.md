# hooks による工程の強制（worktree ブロックと Verify 自動実行）

プライマリチェックアウトでの実装ファイル編集をブロックする PreToolUse hook と、セッション停止時に `npm run ci` を実行する Stop hook を、リポジトリの Claude Code 設定に追加する。

## 種別

改善

## 対象

- 場所: `.claude/settings.json`（新設）、`tools/guard-worktree.mjs`（hook 実体）、`tests/guard-worktree.test.mjs`
- 公開面: このリポジトリで動く Claude Code セッションの hook として自動実行される。手動実行は `node tools/guard-worktree.mjs`（stdin に hook の JSON）

## 背景

「実装は worktree で行う」「コードを編集したら `npm run ci` を実行する」は CLAUDE.md の規約だが、強制する機構がなく、エージェントの規律頼みである。実際に worktree 未作成のままプライマリチェックアウトで実装が始まるケースが頻発している。`0020-start-task-tool` は正しい入口を用意するが、入口を通らない経路を塞ぐのは hook の役目である。

## 仕様

PreToolUse hook（Write / Edit にマッチ）:

- stdin の JSON から `tool_input.file_path` を読み、次の両方に該当する場合に終了コード 2 でブロックする
  - 対象パスがリポジトリの `src/`・`tests/`・`tools/` 配下である
  - 対象パスが `.worktrees/` 配下**でない**（＝プライマリチェックアウトへの編集である）
- ブロック時は「実装は worktree で行う。`node tools/start-task.mjs` で開始する」旨を stderr に出す
- `task/`・`backlog/`・`specs/`・`progress/`・`CLAUDE.md`・`.claude/`・`.github/` への編集はブロックしない（計画用ブランチとルール変更はプライマリで運用するため）
- stdin が JSON として解析できない、または `file_path` が無い場合はブロックしない（誤爆で docs 作業を止めるより素通りを許す。ガードの本丸は CI 側にある）

Stop hook:

- `npm run ci` を実行する。失敗した場合、その出力がセッションに表示される

判定ロジック（パスの分類）は純関数として export し、ユニットテストの対象にする。

## 範囲外

- worktree の自動作成（`0020-start-task-tool` の範囲）
- GitHub 側のブランチ保護
- サブエージェント・他ツール（Bash 経由の書き込みなど）の網羅的なブロック。hook は主要経路（Write / Edit）だけを塞ぐ

## 失敗時

- hook スクリプト自体の実行時エラー: ブロックせず、エラーを stderr に出す（fail-open）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| プライマリチェックアウトで `src/math.mjs` を Edit | ブロック（終了コード 2、誘導メッセージ） |
| `.worktrees/feature/x/src/math.mjs` を Edit | 通過 |
| プライマリチェックアウトで `task/0022-a/spec.md` を Write | 通過 |
| プライマリチェックアウトで `CLAUDE.md` を Edit | 通過 |
| `file_path` の無い入力 | 通過（ブロックしない） |
| セッション停止 | `npm run ci` が実行される |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行のうちパス判定は `tests/guard-worktree.test.mjs` のユニットテストで網羅されている。Stop hook は実セッションでの実行結果（会話に貼る）で確認する。
