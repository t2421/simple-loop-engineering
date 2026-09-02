# Stop hook の検証失敗を exit 2 で止める

Stop hook の「`npm run ci` が落ちたら止める」経路が、セッションをブロックしない終了コード 1 で終わっている。`.claude/settings.json` の Stop hook コマンドを直し、検証失敗時はブロックする終了コード 2 で終わるようにする。

## 種別

バグ修正

## 対象

- 場所: `.claude/settings.json` の `hooks.Stop[0].hooks[0].command`（Stop hook のシェルコマンド 1 本）。回帰テストは `tests/stop-hook-exit-code.test.mjs` に新設する
- 公開面: なし（Claude Code が Stop 時に呼ぶ hook コマンド。人手で呼ぶ API は無い）
- 凍結対象かどうか: **触れない。** `.claude/settings.json` は `tools/check-protected-paths.mjs` の保護対象に入っていない（`.claude/` は保護されていない）。`tests/` への新規ファイル追加はガードが違反にしない（`appeared`）。既存の `tests/stop-hook-ci-dir.test.mjs`・`tools/check-actions.mjs`・`tools/stop-hook-ci-dir.mjs` は凍結対象であり、この作業では変更しない。**`0054-freeze-hook-wiring` より先にマージするなら `allow-protected-change` ラベルは不要。** 0054 は `.claude/settings.json` を凍結対象に加えるので、0054 が先に main へ入った場合はこの作業にもラベルが要る（着手時に `node tools/check-protected-paths.mjs main` で確かめる）

## 背景

現在の登録内容（`.claude/settings.json` の `hooks.Stop[0].hooks[0].command`）:

```
INPUT="$(cat)" && CI_DIR="$(printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/stop-hook-ci-dir.mjs")" && cd "$CI_DIR" && npm run ci 1>&2 && printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/check-actions.mjs"
```

`npm run ci` が落ちると `&&` 連鎖はそこで打ち切られ、コマンド全体は **npm の終了コード 1** で終わる。Claude Code の hook では終了コード 1 は「非ブロッキングのエラー」であり、標準エラーは表示されるがセッションは止まらない。

一方、この仕組み自身は止めるときに 2 を使っている。`tools/check-actions.mjs` には `exit: 2`（198 行目、`halt`）と `process.exit(2)`（344 行目、push 検知）があり、Claude Code はこれを受けてセッションをブロックする。つまり **「Actions が赤いときは止まるが、検証が落ちたときは止まらない」** という食い違いが生じている。Stop hook が CI を回す目的（検証が落ちたまま会話を終えさせない）に対して、落ちたときの経路だけが機能していない。

出典: `task/archive/0044-second-project-port/notes/port-log.md` の 4 節 (c)。2 件目の移植でこの穴が見つかり、移植先では `{ ./scripts/ci.sh 1>&2 || exit 2; }` の形に直して、健全時 exit 0 / 検証を壊したとき exit 2 を実測している。同記録の末尾に「移植元への申し送り（この作業では直さない。範囲外）… backlog に起票すべきである」とある。3 件目の移植（2026-09-02、別リポジトリ）でも同じ形を採用し、同じ実測を得ている。

確認済みの再現手順（修正前）:

1. hook コマンドを取り出す: `node -e 'console.log(JSON.parse(require("fs").readFileSync(".claude/settings.json","utf8")).hooks.Stop[0].hooks[0].command)'`
2. `npm run ci` が失敗する状態を一時的に作る（例: `src/` のファイルに構文エラーを 1 行足す。凍結対象は触らない）
3. Stop hook と同じ形で実行する: `printf '{"cwd":"%s"}' "$PWD" | CLAUDE_PROJECT_DIR="$PWD" /bin/sh -c "<1 のコマンド>"; echo "exit=$?"`
4. `exit=1` が出る（期待は `exit=2`）。`check-actions:` で始まる行は標準エラーに出ない（`&&` の打ち切り自体は正しく働いている）
5. 手順 2 の変更を戻す

## 仕様

Stop hook コマンドの `npm run ci 1>&2` の部分を、失敗時に終了コード 2 で打ち切る形に置き換える。当たりは次のとおり（`{ ...; }` のグループで `||` を `&&` 連鎖の中に閉じ込める）。

```
INPUT="$(cat)" && CI_DIR="$(printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/stop-hook-ci-dir.mjs")" && cd "$CI_DIR" && { npm run ci 1>&2 || exit 2; } && printf %s "$INPUT" | node "$CLAUDE_PROJECT_DIR/tools/check-actions.mjs"
```

変更後の振る舞い（`/bin/sh -c` で実行したときのコマンド全体の終了コード）:

- `npm run ci` が終了コード 0 で終わる: 連鎖は続き、`check-actions.mjs` が実行される。コマンド全体の終了コードは `check-actions.mjs` の終了コードに等しい（0 か 2。`check-actions.mjs` の判定はこの作業で変えない）
- `npm run ci` が 0 以外の終了コードで終わる: コマンド全体は**終了コード 2** で終わる。`npm run ci` の終了コードが 1 でも 3 でも 2 に正規化する。`check-actions.mjs` は実行されない
- `stop-hook-ci-dir.mjs` の解決に失敗する（`CLAUDE_PROJECT_DIR` 無し + 壊れた stdin など）: 従来どおり `&&` の打ち切りで 0 以外で終わり、`npm run ci` も `check-actions.mjs` も実行されない（`tests/stop-hook-ci-dir.test.mjs` が固定している振る舞い。変えない）
- `npm run ci` の出力先（標準エラーへのリダイレクト）、`CI_DIR` の解決経路、`check-actions.mjs` へ `$INPUT` を渡す経路、`timeout: 900` は変えない
- Stop hook のコマンドは引き続き 1 本のまま（`hooks.Stop` の command の数は 1）。`tests/stop-hook-ci-dir.test.mjs` の `stopHookCommand()` は command が 1 本であること、`stop-hook-ci-dir.mjs` と `npm run ci` を含むことを前提にしており、それを崩さない

回帰テストは `tests/stop-hook-exit-code.test.mjs` に新設し、`tests/stop-hook-ci-dir.test.mjs` と同じ形にならう。すなわち `.claude/settings.json` から Stop hook コマンドを読み、一時 git リポジトリに `package.json`（`scripts.ci` をスタブ）・`tools/stop-hook-ci-dir.mjs`（本物のコピー）・`tools/check-actions.mjs`（マーカーファイルを書いて指定の終了コードで終わるスタブ）を置き、`/bin/sh -c` で hook コマンドをそのまま実行して終了コードとマーカーの有無を確かめる。`tests/stop-hook-ci-dir.test.mjs` は変更しない（凍結）。新設テストは `tools/run-unit-tests.mjs` が `tests/*.test.mjs` を列挙するので `npm run ci` に自動で入る。

## 範囲外

- **`.claude/settings.json` を凍結対象に加えること。** `tools/check-protected-paths.mjs` は hook の配線を保護していない（判定コードだけ守っても、呼び出し側を落とせばゲートは呼ばれない）。これは実在する別の穴だが、保護対象の増減は `.claude/skills/add-protected-path` の手続きに従う別作業である
- `tools/check-actions.mjs` の終了コードの変更（2 で正しい。凍結対象でもある）
- `tools/stop-hook-ci-dir.mjs` 自体が失敗したときの終了コードを 2 に揃えること（現状は 0 以外であることだけを既存テストが固定している。別作業）
- 移植先リポジトリ側の変更
- `tests/stop-hook-ci-dir.test.mjs` への追記（凍結対象。回帰テストは新規ファイルに置く）
- PreToolUse・PostToolUse の hook コマンド

## 失敗時

- `npm run ci` が 0 以外で終わる: hook コマンド全体が終了コード 2 で終わる。`npm run ci` の出力は標準エラーに出る。`check-actions.mjs` は実行されない
- `stop-hook-ci-dir.mjs` が失敗する（stdout が空・0 以外で終わる）: hook コマンド全体が 0 以外で終わる。`npm run ci` と `check-actions.mjs` は実行されない（従来どおり）
- `check-actions.mjs` が 2 で終わる: hook コマンド全体が 2 で終わる（従来どおり。素通し）

## 例

`fixture` は一時 git リポジトリ。`ci` スタブは `ci-ran.txt` を書いてから指定の終了コードで終わる。`check-actions` スタブは `check-actions-ran.txt` を書いてから指定の終了コードで終わる。「hook 実行」は `.claude/settings.json` から読んだ Stop hook コマンドを、stdin に `{"cwd":"<fixture>"}`、環境変数 `CLAUDE_PROJECT_DIR=<fixture>` で `/bin/sh -c` により実行することを指す。

| 操作または入力 | 期待結果 |
|---|---|
| `ci` スタブ exit 0、`check-actions` スタブ exit 0 で hook 実行 | hook の終了コード `0`。`ci-ran.txt` あり。`check-actions-ran.txt` あり |
| `ci` スタブ exit 1、`check-actions` スタブ exit 0 で hook 実行 | hook の終了コード `2`。`ci-ran.txt` あり。`check-actions-ran.txt` **なし** |
| `ci` スタブ exit 3、`check-actions` スタブ exit 0 で hook 実行 | hook の終了コード `2`（1 でも 3 でもない）。`check-actions-ran.txt` なし |
| `ci` スタブ exit 0、`check-actions` スタブ exit 2 で hook 実行 | hook の終了コード `2`。`ci-ran.txt` あり。`check-actions-ran.txt` あり |
| 修正前の hook コマンド（「背景」の登録内容）で、`ci` スタブ exit 1 の fixture を hook 実行 | hook の終了コード `1`（バグの再現。テストを RED にする根拠） |
| 実リポジトリ: 「背景」の再現手順 1・3 を健全なチェックアウトで実行 | `exit=0`。標準エラーに `check-actions:` で始まる行が出る（到達の証拠） |
| 実リポジトリ: 「背景」の再現手順 1〜5 を修正後に実行 | 手順 4 で `exit=2`。標準エラーに `check-actions:` で始まる行が出ない |
| `node -e '...'` で `hooks.Stop` の command を数える | `1` |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 検証が通る状態で hook コマンドを実行すると終了コード 0 で終わり、`check-actions.mjs` に到達する（「例」の 1 行目と 6 行目。`check-actions-ran.txt` の存在、または実リポジトリで `check-actions:` 行の出力で示す）。
6. 検証を壊した状態で hook コマンドを実行すると終了コード **2** で終わる。1 ではない（「例」の 2・3・7 行目）。
7. 検証が落ちたとき `check-actions.mjs` が実行されない（「例」の 2・3 行目で `check-actions-ran.txt` が無い。7 行目で `check-actions:` 行が出ない）。
8. `check-actions.mjs` の終了コードは素通しのまま（「例」の 4 行目）。
9. `tests/stop-hook-exit-code.test.mjs` が「例」の 1〜5 行目を固定し、修正前の `.claude/settings.json` では失敗（RED）し、修正後は成功（GREEN）する。RED の出力と GREEN の出力の両方を会話に貼る。
10. `tests/stop-hook-ci-dir.test.mjs`・`tools/check-actions.mjs`・`tools/stop-hook-ci-dir.mjs` を変更していない（`git diff --stat main -- tests/stop-hook-ci-dir.test.mjs tools/check-actions.mjs tools/stop-hook-ci-dir.mjs` が空）。`npm run ci` で既存の `tests/stop-hook-ci-dir.test.mjs` が無変更のまま通る。
11. 「背景」の再現手順を修正後の実リポジトリで実行し、健全時 `exit=0`・検証を壊したとき `exit=2` の出力を会話に貼る。手順 2 で加えた一時的な破壊は元に戻す（`git status` で残っていない）。
