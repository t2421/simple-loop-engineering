# Progress: `0054-freeze-hook-wiring`

- **Target Spec:** `task/0054-freeze-hook-wiring/spec.md`
- **Branch:** `feat/0054-freeze-hook-wiring`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Record`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認（凍結改訂であること、導入 PR 自身には新しい保護が効かないことを確認する）
- [x] テストの作成 (`tests/gate-helpers.test.mjs` に `.claude/settings.json`・`tools/guard-worktree.mjs` の違反側 M/D/R と許可側 A、`.claude/settings.local.json` の許可側を追記。既存ケースは書き換えない)
- [x] テストの作成 (`tests/hook-wiring.test.mjs` を新設。`.claude/settings.json` の hook コマンドから `$CLAUDE_PROJECT_DIR/<path>` を抽出し、各パスと `.claude/settings.json` 自身の M が違反 1 件になることを検証。空集合は失敗)
- [x] 実装 (`tools/check-protected-paths.mjs` の `GATE_HELPERS` に `.claude/settings.json` と `tools/guard-worktree.mjs` を追加。理由をコメントで添える)
- [x] 実装 (`CLAUDE.md`「変えてはいけないもの」に 2 行追加。spec「例」の grep が `2` を出すこと)
- [x] spec「例」のローカル再現（`tmp/0054-probe` でラベル無し `exit=1`・`PR_LABELS` 付き `exit=0`）を実行し、出力を会話に貼る
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける。ラベル無しで `protected-paths` が失敗し、ラベル付きで成功することを Actions の結果で確認する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec / progress を起草（spec-author）。`.claude/settings.json` が hook から呼ぶ 3 スクリプトのうち `tools/guard-worktree.mjs` が `GATE_HELPERS` に無いことを起草時に実測し、対象に含めた。
- `09:10` - 着手。`.worktrees/feat/0054-freeze-hook-wiring` を main から切り、`npm ci`
- `09:20` - 適合テスト `tests/hook-wiring.test.mjs` を先に書いて RED を取った。**穴 2 件を機械が名指しした**

```
ok 5 - hook のコマンドから $CLAUDE_PROJECT_DIR のパスを 1 件以上抽出できる
not ok 6 - hook から呼ばれるファイルは 1 つ残らず凍結対象に入っている
    hook から呼ばれているのに凍結対象に無い: tools/guard-worktree.mjs
not ok 7 - hook の配線そのもの（.claude/settings.json）も凍結対象に入っている
  expected: 1   actual: 0
# tests 8  # pass 6  # fail 2
```

  spec が「穴は 2 件」と書いていたとおりだが、**一覧を持たないテストが実物から自力で見つけた**点が要である。人手で `GATE_HELPERS` に足す運用だと、hook を増やしたときの足し忘れに誰も気づかない
- `09:30` - `GATE_HELPERS` に 2 件追加。`tests/hook-wiring.test.mjs` は `# pass 8 / # fail 0` に
- `09:35` - `tests/gate-helpers.test.mjs` に違反側（M / D / R / 外からの上書き）と許可側（A・`settings.local.json`・`agents/`・`skills/`）を追記。既存ケースは 1 つも書き換えていない
- `09:40` - `CLAUDE.md` に 2 行追加。`grep -cE '^- \`(\.claude/settings\.json|tools/guard-worktree\.mjs)\`' CLAUDE.md` は `2`
- `09:45` - spec「例」11 行の実測。すべて期待どおり

```
M .claude/settings.json                1 件  .claude/settings.json: 検証の委譲先は変更も移動もできない
D .claude/settings.json                1 件  .claude/settings.json: 検証の委譲先は変更も移動もできない
R .claude/settings.json -> docs/       1 件  .claude/settings.json -> docs/settings.json: 検証の委譲先は変更も移動もできない
R 外から .claude/settings.json 上書き        1 件  docs/outside.json -> .claude/settings.json: 検証の委譲先は変更も移動もできない
A .claude/settings.json                違反なし
M tools/guard-worktree.mjs             1 件  tools/guard-worktree.mjs: 検証の委譲先は変更も移動もできない
D tools/guard-worktree.mjs             1 件  tools/guard-worktree.mjs: 検証の委譲先は変更も移動もできない
R tools/guard-worktree.mjs -> lib/     1 件  tools/guard-worktree.mjs -> lib/guard-worktree.mjs: 検証の委譲先は変更も移動もできない
A tools/guard-worktree.mjs             違反なし
M .claude/settings.local.json          違反なし
M .claude/agents/codex-reviewer.md     違反なし
```
- `09:50` - 完了条件 9 の「わざと落とす検査」。`GATE_HELPERS` から `tools/guard-worktree.mjs` を一時的に外すと適合テストが赤くなり、戻すと緑に戻ることを実測した

```
=== 一時的に外した状態 ===
not ok 6 - hook から呼ばれるファイルは 1 つ残らず凍結対象に入っている
    hook から呼ばれているのに凍結対象に無い: tools/guard-worktree.mjs
# tests 8  # pass 7  # fail 1
=== 戻した後 ===
# tests 8  # pass 8  # fail 0
```
- `09:55` - 完了条件 10 のローカル再現（`tmp/0054-probe`）

```
=== ラベル無し ===
保護パスの変更を 1 件検知しました:
  - .claude/settings.json: 検証の委譲先は変更も移動もできない
exit=1
=== allow-protected-change ラベルあり ===
ラベル allow-protected-change があるため通過させます（人間による明示承認）。
exit=0
```

  probe ブランチは片付けた
- `10:00` - 完了条件 12（既存ケースの削除・改変が無い）。**4 ファイルすべて削除行 0 の追加のみ**である

```
tests/gate-helpers.test.mjs   : 0 行
tests/protected-paths.test.mjs: 0 行
CLAUDE.md                     : 0 行
tools/check-protected-paths.mjs: 0 行

 CLAUDE.md                       |   2 +
 tests/gate-helpers.test.mjs     | 104 ++++++++++++++++++++++++++++
 tests/hook-wiring.test.mjs      | 148 ++++++++++++++++++++++++++++++++++++++++
 tools/check-protected-paths.mjs |   8 +++
 4 files changed, 262 insertions(+)

# tests 482  # pass 482  # fail 0
```
- `10:05` - Verify (外部) を `codex-reviewer` に依頼（進捗の指名どおり）
- `10:20` - `codex-reviewer` の判定: **Critical 0 / High 0 で承認。** Medium 1 件・Low 5 件
- `10:30` - Medium と、直せる Low 3 件を反映した。
  1. **Medium**: 適合判定が `v.some(x => x.path === p)`（包含）で、spec が要求する「ちょうど 1 件」を強制していなかった。`v.length !== 1 || v[0].path !== p` に変更。現行の `findViolations` は 1 件しか返さないので今は挙動差が出ないが、将来 `APPEND_ONLY_DIRS` に `tools/` が入って 2 件返るようになったとき検知漏れになる
  2. **Low**: 空集合ガードが別ケースにあり、適合テストを単体実行すると空集合が素通りしていた。適合テストの中にも `assert.ok(paths.length > 0)` を置いて自己完結させた
  3. **Low**: `collectHookCommands` が `command` の非文字列を黙って捨てていた。`readSettings` が例外を握りつぶさない方針なのに、ここだけ静かに落ちるのは非対称なので投げるようにした
  4. **Low**: 正規表現が `${CLAUDE_PROJECT_DIR}/`（波括弧形）を拾わなかった。両形を拾うようにした。片方だけだと、波括弧形に書き換えるだけで検査から静かに外れる
- `10:35` - 残した Low 2 件と理由。
  - **ファイル実在検査が spec 仕様 4 の列挙外**: レビュアーも「範囲外リストのいずれにも当たらず、検証を弱める方向にも働かない」と判定している。外す理由がないので残す
  - **完了条件 11（Actions の実測）が未達**: 開発ループでは Verify (外部) が工程 4、PR 作成が工程 6 なので、この時点で未実証なのは想定どおり。**Done にする前に Actions のログを貼る**
- `10:40` - 厳しくした判定でも「わざと落とす検査」が効くことを再確認した

```
=== GATE_HELPERS から tools/guard-worktree.mjs を一時的に外した状態 ===
not ok 8 - hook から呼ばれるファイルは 1 つ残らず凍結対象に入っている
    hook から呼ばれているのに凍結対象に無い: tools/guard-worktree.mjs
# tests 10  # pass 9  # fail 1
=== 戻した後 ===
docs の形式違反はありません（53 件の作業ディレクトリを確認）。
# tests 484  # pass 484  # fail 0
```
