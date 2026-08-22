# push 後の GitHub Actions 結果ゲート

push した後に GitHub Actions の結果を確認しないまま作業を終えられてしまう問題を、規律ではなく機構で塞ぐ。判定を `tools/check-actions.mjs`（新規）に切り出し、Stop hook の後段でブロックし、PostToolUse で push 直後にリマインドする。

## 種別

機能追加

## 対象

- 場所:
  - `tools/check-actions.mjs`（新規。判定の中核）
  - `tests/check-actions.test.mjs`（新規。`tests/*.test.mjs` は `tools/run-unit-tests.mjs` が自動列挙する — 除外は e2e の `calc-page.test.mjs` だけ — ので、置くだけで `npm run test:unit` が拾う。凍結対象の `tools/run-unit-tests.mjs` に変更は不要）
  - `.claude/settings.json`（Stop hook の後段追加と、PostToolUse の `Bash` matcher 追加）
  - `CLAUDE.md`（開発ループ 6. Record に 1 行追記）
- 公開面:
  - `node tools/check-actions.mjs` — カレントディレクトリの git リポジトリの HEAD を対象に Actions の結果を判定する。通過は終了コード 0、ブロックは終了コード 2。stdin（hook の JSON）が渡されていれば読み、`stop_hook_active` が真なら**ブロックしない**（停止ループ対策。後述）。stdin が無い・読めない場合も判定は行う
  - `node tools/check-actions.mjs --on-bash-post` — PostToolUse hook 用。stdin（JSON）の `tool_input.command` から `git push` の実行を検知したら、リマインド文を stderr に出して終了コード 2 で終わる（PostToolUse ではブロックではなく、メッセージをセッションへ戻す）。検知しなければ何も出さず 0 で終わる
  - 判定・検知の純関数を `export` する（ユニットテスト用）。`gh` 呼び出し・時刻・待機は引数で注入する
  - 環境変数 `CHECK_ACTIONS_TIMEOUT_SEC` — pending / in_progress を待つ上限秒数。既定 480（8 分）

## 背景

push した後、GitHub Actions の結果を確認する工程は今まで規律（CLAUDE.md の記述と自覚）だけに頼っており、確認しないまま「完了」と報告して会話を終えられてしまう。実例として、直近の PR #46 では `preview` ジョブが赤いまま会話を終えかけた。気づいたのは人間がたまたま結果を監視していたからで、機構は無かった。

Stop hook は既に `npm run ci` をローカルで強制しているが、これはローカル検証であって、push 先の Actions（`verify` / `e2e` / `guard` / `preview`）が赤いことは検知できない。判定を機構に移す。

この構成（`tools/check-actions.mjs` への切り出し、Stop hook 後段、PostToolUse リマインド、CLAUDE.md への 1 行）は人間が決定済みである。

なお `tools/check-actions.mjs` 自体を保護パス一覧へ加えることは、`.claude/skills/add-protected-path` に従う別作業として切り出す（「範囲外」参照）。

## 仕様

### 中核: `tools/check-actions.mjs`

カレントディレクトリの git リポジトリの HEAD コミットを対象に、`gh` CLI で GitHub Actions の run / ジョブの状態を取得して判定する。判定表は次のとおり。

| 状態 | 挙動 |
|---|---|
| HEAD が upstream に無い（未 push。リモート追跡ブランチのいずれにも HEAD が含まれない） | 何もせず通す（終了コード 0）。理由を stderr に 1 行 |
| 全ジョブ success / skipped | 通す（終了コード 0） |
| 1 つでも failure / cancelled / timed_out | **ブロック**（終了コード 2）。失敗したジョブ名・URL・調査コマンド `gh run view --log-failed --job <id>` を stderr に提示 |
| pending / in_progress が残る | 上限付きでポーリングして待つ。上限は既定 8 分、`CHECK_ACTIONS_TIMEOUT_SEC` で変更可。上限内に確定すれば確定後の行で判定。上限超過は「未確定」として**ブロック**（終了コード 2） |
| run が 0 件（対象ワークフロー無し・run 未作成） | 短いリトライ後も 0 件なら通す（終了コード 0）。理由を stderr に 1 行 |
| `gh` 不在・未認証・API エラー | fail-open で通す（終了コード 0）。**ただし理由を stderr に必ず 1 行**出す |

- 判定は純関数として `export` し、`gh` 呼び出し・時刻・待機（sleep）を引数で注入してユニットテスト可能にする。判定表の各行がモック注入だけで再現できること
- fail-open するときも黙って無効化しない。素通りの理由を stderr に 1 行出す
- 書き方は `tools/stop-hook-ci-dir.mjs`・`tools/guard-worktree.mjs` に揃える: ヘッダコメントで判定と fail 方針を説明し、`main()` は `import.meta.url` 判定で呼ぶ

### Stop hook（`.claude/settings.json`）

既存の Stop hook コマンド（`stop-hook-ci-dir.mjs` で対象を決めて `npm run ci` を実行する）の**後段**に `node "$CLAUDE_PROJECT_DIR/tools/check-actions.mjs"` を足す。

- `npm run ci` の実行を壊さない。既存コマンドの置換・削除をしない
- `npm run ci` が成功したときだけ後段が走る（`&&` 連結）
- 後段は `npm run ci` と同じディレクトリ（`stop-hook-ci-dir.mjs` が出した対象）で実行する
- **hook の stdin を後段にも渡す。** 現行の Stop hook 行は前段の `stop-hook-ci-dir.mjs` が stdin を読み切ってしまうため、そのまま足すと後段は `stop_hook_active` を読めない。stdin を 1 度だけ変数に取り、前段と後段の両方へ与える形にする（例: `INPUT="$(cat)"` を先頭に置き、各スクリプトへ `<<<"$INPUT"` で渡す）。`npm run ci` の実行コマンドは `.claude/settings.json` から読める形のまま保つ
- **`stop_hook_active` が真ならブロックしない。** Stop hook が終了コード 2 で止めると Claude Code は「続けろ」と戻すため、赤いまま何度も停止を試みると停止ループになる。2 度目以降（`stop_hook_active` が真）は、現在の Actions の状態を stderr に出したうえで終了コード 0 で通す。**黙って通さない**

### PostToolUse（`.claude/settings.json`、`Bash` matcher）

`Bash` ツールの実行後、`tool_input.command` に `git push` の実行が含まれると判定したら、「この push の GitHub Actions の結果を確認するまで完了と報告しない」旨のリマインドをセッションへ返す（`node "$CLAUDE_PROJECT_DIR/tools/check-actions.mjs" --on-bash-post`）。

- 強制ではなく気づきを早めるためのもの。作業をブロックしない
- 検知は純関数（コマンド文字列 → 真偽）として `export` する。多少の過検知（文字列中に `git push` を含むだけのコマンド）は許容する。過検知してもリマインドが 1 回余分に出るだけで、作業は止まらない

### `CLAUDE.md`

開発ループ 6. Record に、push 後は GitHub Actions の結果を確認してから完了とする旨（Stop hook の `tools/check-actions.mjs` が未確認のまま終えることを防ぐこと）を 1 行足す。他の行は変えない。

## 範囲外

- `tools/check-actions.mjs` の保護パス一覧への追加。`.claude/skills/add-protected-path` に従う**別作業**として切り出す
- 既存の Stop hook（`stop-hook-ci-dir.mjs` + `npm run ci`）の挙動変更
- `gh` の認証セットアップ
- `.github/workflows/` 配下のワークフロー自体の変更
- `package.json` の `scripts` の変更

## 失敗時

- 1 つでも failure / cancelled / timed_out のジョブがある: 終了コード 2 でブロックし、失敗したジョブ名・URL・`gh run view --log-failed --job <id>` を stderr に提示する
- pending / in_progress が上限（既定 8 分）を超えて残る: 「未確定」として終了コード 2 でブロックする
- `gh` 不在・未認証・API エラー: ブロックしない（終了コード 0）が、理由を stderr に必ず 1 行出す。黙って素通りさせない
- `--on-bash-post` で stdin が読めない・JSON にならない: 何もせず終了コード 0（fail-open）。理由を stderr に 1 行出す
- Stop hook の 2 度目以降（stdin の `stop_hook_active` が真）で、なお赤い・未確定である: ブロックしない（終了コード 0）が、現在の状態を stderr に出す。停止ループを作らない

## 例

検証に使う具体例。1〜7 は注入モックに対するユニットテスト、8〜10 は実環境での再現手順。

| 操作または入力 | 期待結果 |
|---|---|
| 1. HEAD がリモート追跡ブランチに無い状態を注入 | 終了コード 0 相当の「通す」判定。stderr 相当の理由 1 行 |
| 2. 全ジョブ `success` / `skipped` の run 一覧を注入 | 「通す」判定 |
| 3. 1 ジョブだけ `failure` の run 一覧を注入 | 「ブロック」判定。メッセージにジョブ名・URL・`gh run view --log-failed --job <id>` を含む |
| 4. `in_progress` の run を注入し、注入時計を上限（480 秒）超まで進める | 「ブロック」判定（未確定）。ポーリングが注入 sleep を使い、実時間を待たない |
| 5. `in_progress` の run を注入し、上限内に `success` へ遷移させる | 「通す」判定 |
| 6. run 0 件を注入（リトライ後も 0 件） | 「通す」判定。理由 1 行 |
| 7. `gh` 呼び出しがエラーを投げるモックを注入 | 「通す」判定（fail-open）。理由 1 行 |
| 8. 全ジョブが緑のコミットをチェックアウトして `node tools/check-actions.mjs` | 終了コード 0 |
| 9. 赤いジョブのある run を持つコミット（例: 一時ブランチに故意に失敗するコミットを push）で `node tools/check-actions.mjs`（実行後、一時ブランチは削除する） | 終了コード 2。stderr にジョブ名・URL・`gh run view --log-failed --job <id>` |
| 10. `echo '{"tool_input":{"command":"git push -u origin feat/x"}}' \| node tools/check-actions.mjs --on-bash-post` | 終了コード 2。stderr に「Actions の結果を確認するまで完了と報告しない」旨のリマインド |
| 11. `echo '{"tool_input":{"command":"npm run ci"}}' \| node tools/check-actions.mjs --on-bash-post` | 終了コード 0。出力なし |
| 12. `PATH` から `gh` が見えない状態で `node tools/check-actions.mjs`（push 済みコミット上） | 終了コード 0。stderr に fail-open の理由 1 行 |
| 13. `stop_hook_active: true` を含む hook JSON を stdin に与え、1 ジョブ `failure` の run 一覧を注入 | 「通す」判定（終了コード 0 相当）。ただし赤い状態を述べるメッセージが出る |
| 14. Stop hook 行の形（stdin を 1 度取って前段・後段の両方へ渡す）で、`stop-hook-ci-dir.mjs` が対象ディレクトリを出し、かつ `check-actions.mjs` が `stop_hook_active` を読める | 両方が同じ stdin を読める。前段が食い切らない |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。
4. 「範囲外」を実装していない。
5. 判定表の各行（「例」の 1〜7）と停止ループ対策（「例」の 13）が、`gh` 呼び出し・時刻・待機を注入したモックに対する `tests/check-actions.test.mjs` のユニットテストで検証され、`npm run test:unit` が成功する。テストは実時間の待機も実ネットワークも使わない。
6. 実環境で、赤いジョブのある run を持つコミット上の `node tools/check-actions.mjs` が終了コード 2 で終わり、stderr にジョブ名・URL・`gh run view --log-failed --job <id>` を含む（「例」9 の手順）。全ジョブが緑のコミット上では終了コード 0 で終わる（「例」8）。両方の実行出力（`echo $?` を含む）を会話に貼る。
7. fail-open 経路で stderr に理由が 1 行出る。「例」12 の実行出力（終了コード 0 と stderr）を会話に貼る。
8. `npm run ci` が成功する。`package.json` の `scripts` と `.github/workflows/` 配下に差分が無い（`git diff main -- package.json .github/workflows/` が空）。
9. `.claude/settings.json` の Stop hook に既存の `npm run ci` 実行が置換されずに残っており、`tools/check-actions.mjs` がその後段（`&&` 連結）にある。**hook の stdin が前段と後段の両方へ渡っている**（「例」14）。PostToolUse に `Bash` matcher のエントリがあり、`--on-bash-post` を呼んでいる。
