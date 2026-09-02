# hook の配線を凍結対象に加える

`.claude/settings.json`（hook の配線）と、そこから呼ばれていながら凍結対象外の `tools/guard-worktree.mjs` を `tools/check-protected-paths.mjs` の `GATE_HELPERS` に加え、hook から呼ばれるファイルが 1 つ残らず凍結対象に入っていることを機械検証するテストを足す。

## 種別

改善

## 対象

- 場所:
  - `tools/check-protected-paths.mjs` の `GATE_HELPERS`（凍結対象。判定の実体）
  - `CLAUDE.md`「変えてはいけないもの」の一覧（人間が読む一覧。判定の実体ではない。保護対象ではない）
  - `tests/gate-helpers.test.mjs`（凍結対象。`GATE_HELPERS` の違反側・許可側のケースはこのファイルに集約されている）
  - `tests/hook-wiring.test.mjs`（新規。配線の適合テスト）
- 公開面: `findViolations({ changes, ... })` の判定結果と、CLI `node tools/check-protected-paths.mjs <base-ref>` の終了コード・メッセージ。新しい関数・引数は足さない
- 凍結対象に触れるか: **触れる。** `tools/check-protected-paths.mjs`（`CHECKER`）と既存の `tests/gate-helpers.test.mjs`（`tests/` 配下）の内容変更は、それぞれ独立に違反と判定される。**`allow-protected-change` ラベルが要る。** `tests/hook-wiring.test.mjs` の新規追加と `CLAUDE.md` の変更は違反にならない

## 背景

**この作業は凍結改訂である。** 凍結対象である `tools/check-protected-paths.mjs` と `tests/gate-helpers.test.mjs` の内容を変える。

### 現状

`tools/check-protected-paths.mjs` の保護対象（`TEMPLATES`・`CHECKER`・`GATE_HELPERS`・`APPEND_ONLY_DIRS`）のどれにも `.claude/` は入っていない（起草時に実測）。`GATE_HELPERS` は次の 5 件である。

```
tools/run-unit-tests.mjs
tools/e2e-needed.mjs
tools/check-progress-coupling.mjs
tools/stop-hook-ci-dir.mjs
tools/check-actions.mjs
```

一方、`.claude/settings.json` は hook の登録だけを持ち、次の 3 スクリプトを `$CLAUDE_PROJECT_DIR/...` で呼んでいる。

| hook | 呼ばれるファイル | 凍結対象か（起草時） |
|---|---|---|
| `PreToolUse`（`Write\|Edit`） | `tools/guard-worktree.mjs` | **入っていない** |
| `Stop` | `tools/stop-hook-ci-dir.mjs`、`tools/check-actions.mjs`（および `npm run ci`） | 入っている（`npm run ci` は `package.json` の `scripts` 保護） |
| `PostToolUse`（`Bash`） | `tools/check-actions.mjs` | 入っている |

したがって次の 2 PR で、ガードも Stop hook も恒久的に無効化できる。

1. PR 1: `.claude/settings.json` から `PreToolUse` / `Stop` / `PostToolUse` の登録を消す。どの保護判定にも触れないので `protected-paths` は緑になる
2. PR 2 以降: worktree ガードも Stop hook の検証も Actions の確認も走らない

`tools/*.mjs` の判定コードは 1 行も変えていない。**判定の所在を守っても、呼び出しの所在を守らなければ意味がない。** 検証コマンドの「定義の所在」と「呼び出しの所在」が両方要るのと同じ構造である。

加えて、hook から呼ばれる 3 スクリプトのうち `tools/guard-worktree.mjs` はすでに凍結対象外である（配線漏れ 1 件）。`.claude/settings.json` を守っても、`tools/guard-worktree.mjs` の判定を空にする PR は今のままでは緑で通る。配線を守るなら、配線先も揃えて守る必要がある。

### 出典

2 件目の移植（`task/archive/0044-second-project-port/notes/port-log.md`）の 3 節・行 23 が、レビュー指摘としてこれを記録している。

> `GATE_HELPERS` 9 件 → 11 件（`guard-worktree.mjs` と `.claude/settings.json` を追加）。**判定コードだけ守っても足りない。hook の配線を落とせばガードは呼ばれない**（レビュー指摘）

同記録の 5 節「0042（マニフェスト契約）へ」8 も同趣旨（「凍結対象に hook の配線を含める。検証コマンドの `definedIn` と同じ構造である」）。3 件目の移植（2026-09-02、別リポジトリ）では実際に `GATE_HELPERS` に `.claude/settings.json` を入れ、その PR で追加した適合テストが**書いた直後に別の配線漏れを 1 件検出**している（`UserPromptSubmit` に登録されているのに凍結対象外のスクリプトがあった）。本リポジトリでも、起草時の手作業で同種の漏れ（`tools/guard-worktree.mjs`）が 1 件見つかっている。適合テストを入れる理由はこれである。

### なぜこの改訂は検証を弱めないか

- `GATE_HELPERS` に**足すだけ**である。既存の 5 件を外さず、`CHECKER`・`TEMPLATES`・`APPEND_ONLY_DIRS` の規則も緩めない
- `tests/gate-helpers.test.mjs` は**ケースを足すだけ**である。既存のテストケースは 1 つも削除・改変しない
- 新規の `tests/hook-wiring.test.mjs` は、凍結対象の集合が hook の配線先を**包含している**ことを要求する。集合を狭める方向には働かない
- 違反の判定・メッセージは既存の `GATE_HELPERS` の分岐（`検証の委譲先は変更も移動もできない`）をそのまま使う。新しい分岐も例外も書かない

### 守る対象を増やすことの摩擦

`add-protected-path` スキルは「守る対象が増えるほど正当な作業が止まり、ラベルが常用されてガードが形骸化する」と警告する。本作業の 2 ファイルについては次のとおり、常用にはなりにくい。

- `.claude/settings.json` は hook の登録だけを持つ。権限（`permissions`）は `.claude/settings.local.json` にあり、これはグローバル gitignore で除外された未追跡ファイルである。変更履歴は 5 コミットすべてが hook 導入期（2026-08-21〜22）に集中し、以後は無変更
- `tools/guard-worktree.mjs` の変更履歴は 2 コミット、いずれも同じ hook 導入期。以後は無変更

ただし、並行して起草されている `0053-stop-hook-block-exit-code` は `.claude/settings.json` の Stop hook コマンドを直す作業である。**本作業が先にマージされると、0053 の PR は `allow-protected-change` ラベルが要る。** 逆順なら要らない。どちらの順でも正しく動くが、マージ順の判断は人間に委ねる。

### 導入 PR 自身には効かない

ガードは **base リビジョンの** `tools/check-protected-paths.mjs` を実行する。したがって本作業の PR では、`.claude/settings.json` を守る新しい判定は動かない（base にはまだ無い）。新しい保護が効くのは、マージ後の PR からである。「この PR で `.claude/settings.json` を変えたら赤くなる」は完了条件ではない。完了条件は `findViolations` の判定（ユニットテスト）と、ローカルで HEAD 側のチェッカーを実行した結果で示す（「例」参照）。

## 仕様

### 1. `GATE_HELPERS` に 2 件足す

`tools/check-protected-paths.mjs` の `GATE_HELPERS` に次を足す。それぞれ、既存の要素と同じく理由をコメントで添える。

```
.claude/settings.json
tools/guard-worktree.mjs
```

判定は既存の `isGateHelper` の分岐に従う。変更前後の差:

| 差分 | 変更前 | 変更後 |
|---|---|---|
| `.claude/settings.json` の内容変更（M） | 違反なし | 違反 1 件。理由 `検証の委譲先は変更も移動もできない` |
| `.claude/settings.json` の削除（D） | 違反なし | 違反 1 件。理由 同上 |
| `.claude/settings.json` のリネーム（R、内容同一を含む） | 違反なし | 違反 1 件。理由 同上 |
| 保護外からのリネーム・コピーによる `.claude/settings.json` の上書き（R / C、`oldPath` あり） | 違反なし | 違反 1 件。理由 同上 |
| `.claude/settings.json` の新規追加（A、`oldPath` 無し） | 違反なし | 違反なし（導入の経路。`.claude/settings.json` を持たないチェックアウトからの持ち込みを塞がない） |
| `tools/guard-worktree.mjs` の M / D / R | 違反なし | 違反 1 件。理由 同上 |
| `tools/guard-worktree.mjs` の A | 違反なし | 違反なし |
| `.claude/settings.local.json` の M / A / D | 違反なし | 違反なし（未追跡ファイル。保護しない） |
| `.claude/agents/*`・`.claude/skills/*` の M / A / D | 違反なし | 違反なし（範囲外） |

`TEMPLATES` には入れない。理由: 違反メッセージが `型（TEMPLATE）は変更も移動もできない` に固定されていて実態と食い違うこと、`status === 'A'` の除外が無く新規追加まで違反になることの 2 点（`add-protected-path` スキルが挙げる前提）。`GATE_HELPERS` は新規追加を許し、メッセージも「検証の委譲先」で hook の配線・配線先の実態から大きく外れない。

### 2. CLAUDE.md「変えてはいけないもの」に 2 行足す

判定と対で、人間が読む一覧に次の 2 行を足す。既存の行は消さない。

- `.claude/settings.json`（hook の配線。Stop hook・PreToolUse・PostToolUse の登録。消せば判定コードを 1 行も変えずにガードも Stop hook も呼ばれなくなる）
- `tools/guard-worktree.mjs`（プライマリチェックアウトでの実装編集を止める PreToolUse hook の判定。`.claude/settings.json` が呼ぶ）

文言は実装時に整えてよいが、**2 つのパスが行頭のコードスパンとして現れる**こと（「例」の `grep` で数える）。

### 3. `tests/gate-helpers.test.mjs` にケースを足す

`.claude/settings.json` と `tools/guard-worktree.mjs` のそれぞれについて、既存の `tools/check-actions.mjs` のケースと同じ形で次を足す。

- 違反側: 内容変更（M）、削除（D）、保護ディレクトリの外へのリネーム（R、`similarity: 100`）
- 許可側: 新規追加（A）は違反にならない。**新しいケースとして足す。** 既存の「検証の委譲先の新規追加は違反にならない（導入 PR）」を書き換えない（既存ケースの改変は完了条件 12 に反する）
- 許可側: `.claude/settings.local.json` の内容変更（M）は違反にならない

### 4. `tests/hook-wiring.test.mjs` を新設する（配線の適合テスト）

hook から呼ばれるファイルが 1 つ残らず凍結対象に入っていることを、`.claude/settings.json` の実物から機械検証する。

- `.claude/settings.json` を読み、`hooks.<event>[].hooks[].command` の文字列をすべて集める（イベント名を列挙しない。`hooks` の全キーを走査する。将来 `UserPromptSubmit` などが足されても追従する）
- 各コマンドから `$CLAUDE_PROJECT_DIR/<path>` の `<path>` を正規表現で抽出する。`<path>` は空白・引用符（`"`・`'`・`` ` ``）の直前までとする。重複は除く
- 抽出した集合が**空なら失敗**にする（正規表現が実態と食い違って何も抽出できなかったのを「合格」にしない）
- 抽出した各 `<path>` について、`findViolations({ changes: [{ status: 'M', path }], baseScripts: {}, headScripts: {} })` が **その `path` を含む違反をちょうど 1 件**返すことを確かめる。失敗メッセージにその `path` を含める
- `.claude/settings.json` 自身についても同じく、M が違反 1 件になることを確かめる
- `npm run ci` は `package.json` の `scripts` 保護が受け持つ。このテストでは扱わない
- `tools/run-unit-tests.mjs` が `tests/*.test.mjs` を自動発見するので、`package.json` の `scripts` には触れない

起草時の `.claude/settings.json` に対する抽出結果（名前順）:

```
tools/check-actions.mjs
tools/guard-worktree.mjs
tools/stop-hook-ci-dir.mjs
```

このうち `tools/guard-worktree.mjs` は 1 の追加が無いと違反 0 件で、このテストは赤になる。**適合テストが 1 の追加を要求する**関係である。

## 範囲外

- `.claude/agents/`・`.claude/skills/` の凍結。配線ではなく、守るかどうかは別途判断が要る
- Stop hook の終了コード（検証失敗時に exit 2 でブロックする）の修正。`0053-stop-hook-block-exit-code` が扱う
- `.claude/settings.local.json` の保護。未追跡ファイルであり差分に現れない
- どの hook が登録されているべきか（`Stop` が必ずあること等）の検証。本作業は「登録されているものが凍結されている」ことだけを保証する。登録を消す変更は `.claude/settings.json` の凍結が止める
- `.claude/settings.json` から `GATE_HELPERS` を自動導出すること。判定の根拠は静的なリストのまま。適合テストで包含を検査する
- `tools/guard-worktree.mjs` の判定内容の変更
- `TEMPLATES` の違反メッセージや `status === 'A'` の扱いの改訂

## 失敗時

- `allow-protected-change` ラベル無しの PR は `protected-paths` が検知して失敗する（正しい挙動）。本作業は `tools/check-protected-paths.mjs` と既存 `tests/gate-helpers.test.mjs` の変更でそれぞれ違反になる
- `tests/hook-wiring.test.mjs`: `.claude/settings.json` の hook コマンドが呼ぶ `<path>` に凍結対象外のものがある: テスト失敗。失敗メッセージにその `<path>` を含める
- `tests/hook-wiring.test.mjs`: `$CLAUDE_PROJECT_DIR/<path>` が 1 つも抽出できない: テスト失敗（空集合を合格にしない）
- `tests/hook-wiring.test.mjs`: `.claude/settings.json` が無い、または JSON として読めない: テスト失敗（例外を握りつぶして合格にしない）

## 例

検証に使う具体例。

| 操作または入力 | 期待結果 |
|---|---|
| `findViolations({ ...empty, changes: [{ status: 'M', path: '.claude/settings.json' }] })` | 長さ 1。`[0].path` が `.claude/settings.json`、`[0].reason` が `検証の委譲先は変更も移動もできない` |
| `findViolations({ ...empty, changes: [{ status: 'D', path: '.claude/settings.json' }] })` | 長さ 1 |
| `findViolations({ ...empty, changes: [{ status: 'R', path: 'docs/settings.json', oldPath: '.claude/settings.json', similarity: 100 }] })` | 長さ 1 |
| `findViolations({ ...empty, changes: [{ status: 'R', path: '.claude/settings.json', oldPath: 'docs/outside.json', similarity: 90 }] })` | 長さ 1（外からの上書き） |
| `findViolations({ ...empty, changes: [{ status: 'A', path: '.claude/settings.json' }] })` | `[]` |
| `findViolations({ ...empty, changes: [{ status: 'M', path: 'tools/guard-worktree.mjs' }] })` | 長さ 1。`[0].path` が `tools/guard-worktree.mjs` |
| `findViolations({ ...empty, changes: [{ status: 'D', path: 'tools/guard-worktree.mjs' }] })` | 長さ 1 |
| `findViolations({ ...empty, changes: [{ status: 'R', path: 'lib/guard-worktree.mjs', oldPath: 'tools/guard-worktree.mjs', similarity: 100 }] })` | 長さ 1 |
| `findViolations({ ...empty, changes: [{ status: 'A', path: 'tools/guard-worktree.mjs' }] })` | `[]` |
| `findViolations({ ...empty, changes: [{ status: 'M', path: '.claude/settings.local.json' }] })` | `[]` |
| `findViolations({ ...empty, changes: [{ status: 'M', path: '.claude/agents/codex-reviewer.md' }] })` | `[]` |
| `tests/hook-wiring.test.mjs` が起草時の `.claude/settings.json` から抽出する `<path>` の集合 | `tools/check-actions.mjs`、`tools/guard-worktree.mjs`、`tools/stop-hook-ci-dir.mjs` の 3 件（名前順） |
| `node --test tests/hook-wiring.test.mjs`（実装後） | 全ケース pass、`fail 0` |
| `node --test tests/hook-wiring.test.mjs` を、`GATE_HELPERS` から `tools/guard-worktree.mjs` を一時的に外した状態で実行する（実装中の確認。コミットしない） | 失敗。出力に `tools/guard-worktree.mjs` を含む |
| 下の「CLAUDE.md の行を数える」コマンドを実行する | `2` |
| ローカル再現: 実装済みブランチから `git switch -c tmp/0054-probe` → `printf '\n' >> .claude/settings.json && git commit -am probe` → `node tools/check-protected-paths.mjs feat/0054-freeze-hook-wiring; echo "exit=$?"` | stderr に `保護パスの変更を 1 件検知しました:` と `  - .claude/settings.json: 検証の委譲先は変更も移動もできない`。`exit=1` |
| 同じ状態で `PR_LABELS='["allow-protected-change"]' node tools/check-protected-paths.mjs feat/0054-freeze-hook-wiring; echo "exit=$?"` | stdout に `ラベル allow-protected-change があるため通過させます（人間による明示承認）。`。`exit=0`。確認後 `git switch - && git branch -D tmp/0054-probe` で片付ける |
| 本作業の PR（`allow-protected-change` ラベル無し） | `protected-paths` ジョブ失敗。ログに `tools/check-protected-paths.mjs` と `tests/gate-helpers.test.mjs` の 2 件が違反として出る。`tests/hook-wiring.test.mjs`（新規）と `CLAUDE.md` は出ない |
| 同じ PR に `allow-protected-change` ラベルを付けて再実行 | `protected-paths` ジョブ成功。ログに `ラベル allow-protected-change があるため通過させます` |

`empty` は `{ changes: [], baseScripts: {}, headScripts: {} }`（`tests/gate-helpers.test.mjs` と同じ）。

CLAUDE.md の行を数える（行頭が `- ` に続くコードスパンで始まる 2 行を数える）:

```
grep -cE '^- `(\.claude/settings\.json|tools/guard-worktree\.mjs)`' CLAUDE.md
```

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `.claude/settings.json` の内容変更（M）・削除（D）・リネーム（R）・保護外からの上書き（R/C、`oldPath` あり）が、それぞれ `findViolations` で違反 1 件（理由 `検証の委譲先は変更も移動もできない`）になり、新規追加（A、`oldPath` 無し）は違反 0 件である。`tests/gate-helpers.test.mjs` に違反側（M・D・R）と許可側（A）の両方のケースがあり、`node --test tests/gate-helpers.test.mjs` の出力で pass している。
6. `tools/guard-worktree.mjs` について 5 と同じ（違反側 M・D・R、許可側 A）が成り立ち、同じテストファイルにケースがあって pass している。
7. `.claude/settings.local.json` の内容変更は違反 0 件である。`tests/gate-helpers.test.mjs` にそのケースがあり pass している。
8. `CLAUDE.md`「変えてはいけないもの」に `.claude/settings.json` と `tools/guard-worktree.mjs` の行があり、「例」の「CLAUDE.md の行を数える」コマンドが `2` を出力する。判定（`GATE_HELPERS`）と一覧が対で入っている。
9. `tests/hook-wiring.test.mjs` が存在し、`.claude/settings.json` の `hooks` 全キーの hook コマンドから `$CLAUDE_PROJECT_DIR/<path>` を抽出した各 `<path>` と `.claude/settings.json` 自身について、内容変更（M）が `findViolations` で違反 1 件になることを確かめている。抽出結果が空なら失敗する。実装後の `node --test tests/hook-wiring.test.mjs` で `fail 0`。`GATE_HELPERS` から `tools/guard-worktree.mjs` を一時的に外すと失敗し、出力にそのパスを含む（「例」参照）。
10. 「例」のローカル再現手順で、ラベル無し（`PR_LABELS` 未設定）は `exit=1` と `.claude/settings.json: 検証の委譲先は変更も移動もできない` を出力し、`PR_LABELS='["allow-protected-change"]'` では `exit=0` になる。
11. 本作業の PR は、ラベル無しで `protected-paths` が失敗し（違反として出るのは `tools/check-protected-paths.mjs` と `tests/gate-helpers.test.mjs` の 2 件）、`allow-protected-change` ラベル付きの再実行で成功する。
12. `GATE_HELPERS` の既存 5 件、`CHECKER`、`TEMPLATES`、`APPEND_ONLY_DIRS` の規則を緩めていない。`tests/gate-helpers.test.mjs`・`tests/protected-paths.test.mjs` の既存ケースを 1 つも削除・改変していない（`git diff main...HEAD -- tests/gate-helpers.test.mjs` に `-` で始まる行が無い。ファイル末尾の追記だけである）。
