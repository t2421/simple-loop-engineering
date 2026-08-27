# Progress: `0042-loop-manifest`

- **Target Spec:** `task/0042-loop-manifest/spec.md`
- **Branch:** `feat/0042-loop-manifest`
- **PR:** `未作成`
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
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
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
