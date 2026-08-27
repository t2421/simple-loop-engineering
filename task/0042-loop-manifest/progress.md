# Progress: `0042-loop-manifest`

- **Target Spec:** `task/0042-loop-manifest/spec.md`
- **Branch:** `feat/0042-loop-manifest`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/76
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] `task/archive/0044-second-project-port/notes/port-log.md` を読み、想定項目表の各項目を採用 / 不採用に確定する
- [x] マニフェストのファイル名・形式の確定
- [x] テストの作成 (`tests/loop-manifest.test.mjs`。「失敗時」の 5 ケースを覆う)
- [x] 実装（マニフェストの読み取り・検証。固有値を参照する `tools/*.mjs` の置き換え）
- [x] マニフェスト自身を保護パスへ追加 (`.claude/skills/add-protected-path` に従う)
- [x] ラベル無し / ラベル付きの `protected-paths` 実行結果を進捗に貼る（→ 完了条件 8）
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格し、完了条件を確定した。**着手はしない。** spec の「着手順の注記」どおり 0044 が先行する。`tools/start-task.mjs` は最小 ID を選ぶため、Not Started のままだと 0044 より先に選ばれてしまう。Status を `Blocked` にして順序を機械的に守る。
- `17:59` - 解除条件: `task/archive/0044-second-project-port/` が存在すること（0044 がアーカイブ済み）。解除時に Status を `Not Started` に戻す。
- `17:59` - 0044 の移植先はパッケージマネージャを持たないため、想定項目表の `install` が必須項目でよいかは未確定である旨を「仕様」に追記した。
- `2026-08-28` - 0044 のアーカイブで解除条件（`task/archive/0044-second-project-port/`）が満たされたので Blocked を外して着手した。
- `2026-08-28` - **設計上いちばん重要だった制約**: ガードの 3 ツール（`check-protected-paths`・`check-progress-coupling`・`e2e-needed`）は CI が base 版を `$RUNNER_TEMP` へ取り出して**単体実行**するため、`tools/loop-manifest.mjs` を import できない。最小の読み取りを各自に持たせ、**`git show <base-ref>:loop.manifest.json` から読む**形にした。ディスク上（候補側）を読むと、宣言を書き換えるだけでガードを迂回できる。
- `2026-08-28` - 0044 の申し送り 8 件をすべて反映。`install` は省略可能、`verify.definedIn` は配列、比較は形式非依存（`jsonKey` が無ければ内容そのもの）、実装はディレクトリ＋単体ファイル、作業 ID の形は宣言、台帳の文書は許可リスト、`verify.invokedIn` を新設、hook の配線（`.claude/settings.json`）も `protected.gateHelpers` に入れた。**判定コードだけ守っても、呼び出しをやめればゲートは呼ばれない。** 検証コマンドの `definedIn` / `invokedIn` と同じ構造である。
- `2026-08-28` - テストは**実物のマニフェストを使う**形にした（`tests/manifest-fixture.mjs`）。テスト専用の別表を持つと、宣言を変えてもテストが緑のままになる。
- `2026-08-28` - 完了条件 7 の実測。どちらも 0 件（exit 1）。

```
$ grep -rn "'npm'" tools/
exit=1 (1 = 0 件)
$ grep -rn "package.json" tools/check-protected-paths.mjs
exit=1 (1 = 0 件)
```

残るのは `tools/setup-playwright.mjs` と `tools/run-unit-tests.mjs` のコメント 2 件のみ。判定にも実行にも使われないので spec の「範囲外」に理由を書いた。

- `2026-08-28` - 完了条件 8 の実測。マニフェストを 1 行変える差分で確かめた。

```
=== マニフェストを 1 行変える PR（ラベル無し） ===
保護パスの変更を 1 件検知しました:
  - loop.manifest.json: マニフェスト（固有値の宣言）は変更も移動もできない

変更が正当なら、改訂内容と理由を spec に書いたうえで PR に allow-protected-change ラベルを付けてください。
exit=1

=== 同じ差分にラベルを付けた場合 ===
保護パスの変更を 1 件検知しました:
  - loop.manifest.json: マニフェスト（固有値の宣言）は変更も移動もできない

ラベル allow-protected-change があるため通過させます（人間による明示承認）。
exit=0
```

- `2026-08-28` - この PR 自体もラベル無しで 13 件の違反として落ちる（spec 1・`tests/` 9・`tools/` 3）。`.claude/skills/add-protected-path` が「この作業は必ず自分のガードに引っかかる」と書いているとおりで、正しい挙動である。**この PR には人間による `allow-protected-change` ラベルが要る。**
- `2026-08-28` - `npm run ci` は 485 pass / 0 fail。
- `2026-08-28` - Verify (外部) 1 回目。**不承認**。Critical 1 / High 2 / Medium 2。
- `2026-08-28` - **Critical**: マニフェストを **merge-base** から読み、無ければ候補側にフォールバックしていた。ガードはチェッカー本体を `origin/$BASE_REF`（base の**先端**）から取るのに、宣言だけ merge-base から取っていた。分岐点はいくらでも古くできるので、この仕組みの導入より前のコミットから branch すれば必ず候補側に落ち、骨抜きの宣言でガード全体を無効化できた。しかもその宣言は差分上「新規追加」なので導入 PR として見逃される。**判定の根拠はチェッカー本体と同じ ref から取る**形に直した。設計判断として spec の「仕様」3 に明文化した。
- `2026-08-28` - **High**: `verify.definedIn` が指すファイルを HEAD 側で削除・改名すると `null` になり「比較しない」で素通りしていた。**定義を消すのが最も強い書き換えである。** base 側の欠落（導入 PR）と head 側の欠落（削除）を分け、後者を fail-closed にした。
- `2026-08-28` - **High**: `parseManifest` が葉の型を見ておらず、`protected.appendOnlyDirs: [{}]` のような宣言が通っていた。この形だと `covers()` が `startsWith(undefined)` で常に false になり、追記専用の保護が丸ごと消える。**骨抜きの宣言を受け入れることはガードを無効化することと同じ**なので、8 種の型不正を拒むようにし、表駆動のテストを足した。
- `2026-08-28` - Medium 2 件。(1) `verify.invokedIn` を宣言しながらどのツールも読んでいなかった → 保護判定に参加させた。(2) `workId.pattern` を宣言項目にしたが採番が 4 桁数値前提のままで、日付形式では `0NaN` を返していた → 数値でなければ明示的に失敗させ、採番を宣言に従わせるのは 0043 の範囲として spec の「範囲外」に理由を書いた。
- `2026-08-28` - 修正後 `npm run ci` は 500 pass / 0 fail（レビュアー提案のテストを 15 件追加）。
- `2026-08-28` - Verify (外部) 2 回目。**不承認**。Critical 0 / High 5 / Medium 1 / Low 2。1 回目の Critical は塞がったと判定されたが、**同型の穴が残り 2 ツールに残っていた**。
- `2026-08-28` - High 1・2: `check-progress-coupling` と `e2e-needed` が宣言を merge-base から読んだままだった。spec「仕様」3 に「チェッカー本体と同じ ref から取る」と書いた直後の実装が従っていない。**3 つとも base 先端に揃えた。** 差分を三点で取ることと宣言をどこから読むかは別問題である。
- `2026-08-28` - High 3: **移植で判定が弱くなっていた。** 旧述語は `progress/` 配下を階層を問わず拾っていたが、glob `progress/calc-page.*` は 1 階層だけになり、追跡下にある `progress/archive/calc-page.*` で e2e が回らなくなっていた。凍結改訂の理由に「判定の構造は変えない」と書いたのに弱めていた。再帰 glob に直し、固定するテストを足した。
- `2026-08-28` - High 4: `conditionalStages` の葉が未検査で、`triggers: [42]` が通っていた。`globToRegExp(42)` は `/^$/` になり、あらゆるパスが不一致になって工程が**無音のまま**間引かれる。
- `2026-08-28` - High 5: ガード側の検査が空配列を通し、`gateHelpers: []` の骨抜き宣言が判定に使われていた。**厳しいほうが import できる側、緩いほうが実際にガードを回す側、という逆転**だった。2 実装を揃え、**同じ入力を両方に流して結果の一致を固定するテスト 18 件**を置いた。以後この非対称は機械が捕まえる。
- `2026-08-28` - Medium: プライマリでの宣言の編集を worktree ガードがブロックするようにした。Low 2 件も反映（作業名から区切り文字を排する／条件付き工程だけは間引かない側に倒す理由を spec の「範囲外」に記録）。
- `2026-08-28` - 修正後 `npm run ci` は 520 pass / 0 fail。
- `2026-08-28` - Verify (外部) 3 回目。**不承認**。Critical 0 / High 3 / Medium 1 / Low 1。2 回目の High 5 件はすべて塞がったと判定。
- `2026-08-28` - 残る High 3 件は**同じ根**だった。spec「失敗時」の「**既定値で補わない**」を 3 箇所が破っていた。(1) `appendOnlyDirs[].ledger` の `=== true` 三項式（`"true"` が false に落ち、別名 spec の禁止とアーカイブ済み ID の再利用検知が無言で消える）、(2) `implementation.dirs` が `Array.isArray` だけの検査（`[42]` で `startsWith(42)` が `"42"` に強制され、実装の変更が全部 docs-only になる）、(3) `jsonKey` が無いときの `?? {}`（綴り違い 1 つで検証定義の変更検知が消える）。3 箇所とも型を検査して落とす形に直した。
- `2026-08-28` - **「型不正を既定値で補う」書き方は、それ自体がゲートの穴である。** 三項式・`??`・`Array.isArray` だけの検査はどれも「読めなかったものを無害な値に化かす」ので、宣言を読む設計では禁じ手に近い。この教訓は 0043 への申し送りに入れる。
- `2026-08-28` - Medium: worktree ガードが先頭セグメントだけで照合していたため、`app/src/` のような入れ子の宣言が効かなかった。**同じ宣言を読む進捗結合は prefix 一致で入れ子を扱う**ので、2 実装で宣言の意味が食い違っていた。相対パス全体での照合に直した。
- `2026-08-28` - Low: 条件付き工程の `command` と `checker` が「宣言はするが読まない」ことを spec の「範囲外」に明記した（読むのは `triggers` だけ。工程の起動はワークフローが担う）。
- `2026-08-28` - 修正後 `npm run ci` は 531 pass / 0 fail（2 実装の一致テストを 8 件追加）。
- `2026-08-28` - PR #76 を作成した。**4 回目の再レビューは未実施**（呼び出しが中断された）。3 回目までの指摘はすべて反映済みで、対応後の検証は `npm run ci`（531 pass / 0 fail）とレビュアー提案のテスト追加で行っている。**承認は得ていないので、この時点で Done にしない。**
- `2026-08-28` - この PR には人間による `allow-protected-change` ラベルが要る（自分のガードに引っかかるのは設計どおり）。
