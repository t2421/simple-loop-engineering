# マニフェストの省略可能な項目（条件付き工程・Complexity→モデル表・レビュアー名）

`0042-loop-manifest` が作るマニフェストから**省略可能な 3 項目**（条件付き工程・Complexity→モデル表・レビュアーエージェント名）を読ませる。消費者は `tools/e2e-needed.mjs`（条件付き工程の発火判定）と `tools/start-task.mjs`（モデル表引き）である。

## 種別

機能追加

## 対象

- 場所:
  - `loop.manifest.json`（0042 が置くマニフェスト。3 項目を宣言する）
  - `tools/loop-manifest.mjs`（0042 が置く読み取り層。3 項目の型検査を足す）
  - `tools/e2e-needed.mjs`（発火するパスのハードコードを消し、宣言から読む）
  - `tools/start-task.mjs`（`COMPLEXITY_MODELS` のハードコードを消し、宣言から読む）
  - `.github/workflows/ci.yml` の `e2e` ジョブ（base 版のマニフェストと読み取り層も取り出す）
  - `tests/e2e-needed.test.mjs`・`tests/start-task.test.mjs`（宣言経由に切り替え、ケースを足す）
- 公開面:
  - `node tools/e2e-needed.mjs <base-ref> <stage>` → `needed=true` / `needed=false`
  - `modelForComplexity(complexity, table) -> string`（純関数。表を引数で受ける）
  - 読み取り層が返すマニフェストの 3 項目
- **凍結対象に触れる作業である。** `tools/e2e-needed.mjs`・`.github/workflows/ci.yml`・`tests/` の既存ファイル・`loop.manifest.json`・`tools/loop-manifest.mjs` はいずれも `tools/check-protected-paths.mjs` の保護対象で、既存内容の変更を含む。`allow-protected-change` ラベルが要る（→「失敗時」）。`tools/start-task.mjs` は保護対象ではない

項目名は 0042 が確定させたものに従う。本 spec は PR #76 の草案に倣って `conditionalStages`・`complexityModels`・`reviewers` と仮に呼ぶ。0042 の成果物にすでに同じ意味の項目があればその名前と形を引き継ぎ、無ければこの作業で足す。命題は名前に依存しない。

## 背景

### 中心的な主張: 省略可能性であって、プラグイン可能性ではない

**「あれば動く・無ければその工程が存在しない」（省略可能性）が正しく、「空実装を強制する枠」（プラグイン可能性）は誤りである。**

0042 の spec は設計判断 4 でこう述べている。`e2e-needed.mjs` は「どの差分が計算ページに影響しうるか」という述語であり、他プロジェクトに対応物が無いことのほうが多い。3 件目の移植（2026-09-03、別リポジトリへの導入）の実測がこれを裏づけた。移植先に UI が無かったため、e2e・見た目・プレビューの 3 工程は**ファイルごと置かなかった**。常に false を返す判定や、何も見ないレビュアー定義は作らなかった。

`.claude/skills/loop-port/SKILL.md` の 2.5 節と 4 章はこれをアンチパターンとして挙げている。**空実装で工程を残すと「すでにある」ため誰も作らない。** したがってマニフェストの 3 項目はいずれも**省略できる**。省略されたとき、ツールは既定値で埋めて動かず、その工程・その表引きが**存在しない**ものとして振る舞う。

### 1 回目の実装（PR #76、クローズ済み）で実際に出た指摘

再発防止の対象である。いずれも「宣言化によって判定が弱くなる」形をしていた。

1. **葉の未検査。** `conditionalStages` の `triggers: [42]` が通っていた。`globToRegExp(42)` は `/^$/` になり、あらゆるパスが不一致になって**工程が無音のまま間引かれる**。宣言の型不正は「落ちる」以外の結末を持ってはいけない
2. **glob が旧述語より狭かった。** 旧述語は `progress/` 配下を階層を問わず `calc-page.*` で拾っていたが、glob `progress/calc-page.*` は 1 階層だけになり、追跡下にある `progress/archive/calc-page.png`（シンボリックリンク）で e2e が回らなくなっていた。凍結改訂の理由に「判定の構造は変えない」と書きながら弱めていた。再帰 glob（`progress/**/calc-page.*`）に直した
3. **表の欠落が未検査。** `complexityModels` が `S`・`M`・`L` をすべて持つことを検査していなかった。等級を書かない進捗は `M` とみなされるため、`M` が無いと既存の作業を選んだ瞬間に落ちる

**glob の表現力は「判定を弱めない」ことを最優先に選ぶ。** 現在の `e2e-needed.mjs` の述語が拾う集合を狭めてはいけない。

### 凍結改訂の宣言

**この作業は凍結改訂である。** `tools/e2e-needed.mjs`・`.github/workflows/ci.yml` の `e2e` ジョブ・`tests/e2e-needed.test.mjs`・`tests/start-task.test.mjs`・`loop.manifest.json`・`tools/loop-manifest.mjs` の既存内容を変更する。

**この変更が検証を弱めない理由:**

- `e2e-needed.mjs` が拾う集合は**狭まらない**。現行述語の各分岐（完全一致 4 件・`src/` 前置・`progress/`/`task/` 配下の任意階層の `calc-page.*`）を「例」の表に 1 行ずつ置き、階層をまたぐパスを含めて同じ結果になることをテストで固定する。既存のテストケースは 1 件も削らない
- 判定は引き続き **base リビジョン側で実行する**。宣言を読ませることで新たに入力となるマニフェストと読み取り層も base から取り出す。候補側のファイルが判定に混ざらないことをテストが固定する（→「仕様」の CI の項）
- 宣言が不正なとき（葉の型不正・空の `triggers`）は**落ちる**。既定値で埋めて `needed=false` を出さない。旧実装に無かった「無音の間引き」経路を新設しない
- Complexity→モデル表は値を変えない（`S → haiku`、`M → sonnet`、`L → fable`）。表の所在がハードコードから宣言へ移るだけで、既存テストの期待値は同じである
- `ci.yml` の変更は `e2e` ジョブの取り出し対象を増やすだけで、`verify` ジョブと検証コマンドには触れない

## 仕様

### 共通の規則（3 項目とも）

- **省略できる。** 項目が無いとき、読み取り層はその項目を「無い」として返す。`[]` や `{}` の既定値で埋めない
- **省略と不正は区別する。** `null`・型違い・空文字・重複は不正として落とす。0042 の不変条件「既定値で補わない」をそのまま適用する（`Array.isArray` だけの検査・`?? []`・`=== true` 三項式は禁じ手）
- **葉まで検査する。** 配列の要素、オブジェクトの値の型を見る
- 診断文は「どの項目のどの位置が」「どう不正か」を述べる

### 1. 条件付き工程（`conditionalStages`）

工程の配列。**0 件（`[]`）は妥当**であり、工程が存在しないことを意味する。各工程は次の 2 つを持つ。

| 項目 | 型 | 規則 |
|---|---|---|
| `name` | 文字列 | 空でない。配列内で一意 |
| `triggers` | 文字列の配列 | **1 件以上**。各要素は空でない glob。`[]` は不正（発火しない工程は空実装であり、無音の間引きと同じ） |

コマンドは持たない（→「範囲外」）。マニフェストが持つのは発火条件の判定に要る値だけである。

**glob の意味論**は次に限る。パス全体に対して前方・後方とも固定（部分一致しない）。

| 記法 | 意味 |
|---|---|
| ワイルドカードを含まない | パスの完全一致 |
| `*` | `/` を含まない任意の文字列（空を含む）。1 セグメント内 |
| `**` | 0 個以上の**セグメント全体**。`**/` の形（途中）か `/**` の形（末尾）でのみ使える |
| それ以外の文字 | リテラル（正規表現の特殊文字はエスケープする） |

`**` がセグメント全体でない形（`src**`・`a/**b`）、および `?`・`[`・`{` を含むパターンは**不正として落とす**。表現力を増やすときは別作業で行う。

現行述語と同じ集合を表す宣言は次の 7 件である（0042 の成果物にすでに宣言があればそれを検証し、無ければこの 7 件を置く）。

```
package.json
package-lock.json
tests/calc-page.test.mjs
tools/setup-playwright.mjs
src/**
progress/**/calc-page.*
task/**/calc-page.*
```

`progress/**/calc-page.*` は `progress/calc-page.md`（0 階層）と `progress/archive/calc-page.png`（1 階層）の両方に一致する。これが指摘 2 の再発防止である。

**判定ツール（`tools/e2e-needed.mjs`）:**

- `node tools/e2e-needed.mjs <base-ref> <stage>` と呼ぶ。`<stage>` は宣言した工程の `name`
- 変更パス（移動元を含む。現行と同じ）のいずれかが、その工程の `triggers` のいずれかに一致すれば `needed=true`
- `<stage>` が宣言に無いとき、`<stage>` が無いとき、マニフェストが読めない・不正なときは、理由を stderr に出して**終了コード非 0**で終わる。`needed=` を出さない（無音の間引きの禁止）。差分が取れないときの「間引かず `needed=true`」は現行どおり残す
- マニフェストと読み取り層は**自分のファイルの位置からの相対**で読む（`import.meta.url` 基準。cwd 基準にしない）。`$RUNNER_TEMP` に取り出されても同じ相対配置なら動くようにする
- ヘッダの「ローカル import を持たない」は「ローカル import は読み取り層 1 本に限り、CI が同じ相対配置で取り出す」に改める

**CI（`.github/workflows/ci.yml` の `e2e` ジョブ）:**

- base から `tools/e2e-needed.mjs`・`tools/loop-manifest.mjs`・`loop.manifest.json` の 3 つを `$RUNNER_TEMP` 配下へ**同じ相対配置**で取り出し、取り出した判定ツールを `<base-ref> e2e` で実行する
- 既存の「base に `e2e-needed` が無ければ候補側で判定する」フォールバック（導入 PR 用）は残す。それ以外で取り出せないときは候補側へ落ちず、ジョブを落とす
- **配線テスト**: `tools/e2e-needed.mjs` のローカル import（推移的に）とマニフェストが、`ci.yml` の取り出し対象に 1 つ残らず含まれることをテストが固定する。判定ツールが新しい入力を持ったのに base から取り出していない状態を検知する

### 2. Complexity→モデル表（`complexityModels`）

`S`・`M`・`L` をキーとし、モデル名（空でない文字列）を値とするオブジェクト。

- **省略できる。** 省略されたとき `tools/start-task.mjs` はモデルを出力しない（空文字や既定のモデル名で埋めない）。作業の選択・worktree の用意は表と無関係に動く
- 宣言されるとき、キーは**ちょうど** `{S, M, L}`。欠けても、余分な等級があっても落ちる（`M` 欠落は指摘 3。等級を書かない進捗は `M` とみなされるため）
- `modelForComplexity(complexity, table)` は表を引数で受ける純関数にする。`Object.hasOwn` で引く現行の性質（`constructor` などの継承プロパティを「表にある」と判定しない）は保つ。`null`（未記載）を `DEFAULT_COMPLEXITY`（`M`）とみなす現行の性質も保つ
- `DEFAULT_COMPLEXITY` はマニフェスト項目にしない。`task/TEMPLATE-progress.md` の等級の意味（未記載は `M`）はテンプレートの契約であってプロジェクト固有値ではない
- `tools/lint-docs.mjs` の `COMPLEXITY_VALUES`（`S | M | L`）も同じ理由でそのまま残す

### 3. レビュアーエージェント名（`reviewers`）

Verify (外部) で指名できるエージェント名の配列。現在は `codex-reviewer`・`visual-design-reviewer`・`grok-reviewer` の 3 件。

- **省略できる。** 省略または `[]` のとき、レビュアーに関する検査は存在しない
- 宣言されるとき、各要素は空でない文字列で一意。**各名前に対応するエージェント定義 `.claude/agents/<name>.md` が実在すること**を読み取り層が検査する（0042 の「宣言した値と実際に使う値の乖離」の再発防止。`verify.definedIn` の実在検査と同じく、`exists` を注入できる純関数にする）
- **進捗が名指ししたレビュアーが宣言に無いときの扱い: この作業では機械検査しない。** 宣言は「指名できる名前の一覧」であり、進捗はそこから選ぶ、という運用規則にとどめる。理由: 進捗側を検査する消費者は `tools/lint-docs.mjs` になり、その純関数群と既存テスト（`tests/lint-docs*.test.mjs`）への変更が凍結改訂の範囲を 2 消費者から広げる。独立した「わざと落とす検査」を持てる別作業に切り出す（→「範囲外」）

## 範囲外

- 条件付き工程の**起動**（`npm run test:e2e` を実際に走らせるのはワークフローの仕事）。したがって工程に `command` は持たせない。0042 の想定項目表にある「コマンド」は**この作業で不採用**とする。理由: マニフェストが持つのは発火条件の判定に要る値だけで、起動コマンドを持たせても呼ぶ側（`ci.yml`）が結局ハードコードするため、宣言と実体の乖離が増えるだけである
- 空実装の強制（常に false を返す判定・何も見ないレビュアー定義）
- `visual-design-reviewer` / `grok-reviewer` / `codex-reviewer` の定義そのものの変更
- 進捗が名指ししたレビュアー名を宣言と突き合わせる lint（`tools/lint-docs.mjs` の変更）。別作業の候補にする
- glob の表現力の拡張（`?`・`[]`・`{}`・否定）
- `tools/setup-playwright.mjs` と `package.json` の `test:e2e` の宣言化
- `DEFAULT_COMPLEXITY`・`COMPLEXITY_VALUES` の宣言化（テンプレートの契約であり固有値ではない）
- 0056（検証コマンドの契約・保護パス一覧）・0057（実装パスと台帳）の範囲
- ツール本体の汎用パッケージ化（0043 の範囲）

## 失敗時

- `conditionalStages[i].triggers` に文字列でない要素（例: `42`）: 位置と期待する型を表示して落ちる。`/^$/` に化けて無音で間引かない
- `conditionalStages[i].triggers` が `[]`: 「発火しない工程」として落ちる
- `conditionalStages[i].triggers` に空文字・`**` がセグメント全体でないパターン・`?` `[` `{` を含むパターン: 不正として落ちる
- `conditionalStages[i].name` が空文字、または重複: 落ちる
- `conditionalStages` が配列でない（`{}`・`null`・`"e2e"`）: 落ちる。省略とは区別する
- `complexityModels` から `M`（または `S`・`L`）が欠ける: 内部不整合として落ちる
- `complexityModels` に `XL` など余分なキーがある: 落ちる
- `complexityModels` の値が空文字・数値: 落ちる
- `reviewers` に `.claude/agents/<name>.md` が存在しない名前がある: そのパスを表示して落ちる
- `reviewers` に重複・空文字・文字列でない要素がある: 落ちる
- `node tools/e2e-needed.mjs <base-ref> nosuch`（宣言に無い工程名）: 宣言に無いことを stderr に出し、終了コード非 0。`needed=` を出さない
- `node tools/e2e-needed.mjs <base-ref>`（工程名なし）: 使い方を出して終了コード非 0
- 判定ツールがマニフェストを読めない・不正: 理由を stderr に出し、終了コード非 0。`needed=false` に落ちない
- 進捗の Complexity が表に無い等級（`XL`）: 現行どおり `modelForComplexity` が失敗する
- `ci.yml` の `e2e` ジョブが base から `tools/loop-manifest.mjs` または `loop.manifest.json` を取り出せない: 候補側へ落ちず、ジョブが失敗する
- **`allow-protected-change` ラベル無しの PR**: `protected-paths` が `tools/e2e-needed.mjs`・`.github/workflows/ci.yml`・`tests/` の既存ファイル・`loop.manifest.json` の変更を検知して失敗する（正しい挙動）。ラベルを付けた再実行で成功する

## 例

`matches(path)` は宣言した e2e 工程の `triggers` に対する判定、`old(path)` は現行 `matchesE2ePath` の結果。**全行で `matches === old`。** 既存の `tests/e2e-needed.test.mjs` の全ケースを含む。

| 操作または入力 | 期待結果 |
|---|---|
| `matches('package.json')` | `true`（現行と同じ） |
| `matches('package-lock.json')` | `true` |
| `matches('tests/calc-page.test.mjs')` | `true` |
| `matches('tools/setup-playwright.mjs')` | `true` |
| `matches('src/calc.css')` | `true` |
| `matches('src/a/b/c.mjs')`（深い階層） | `true` |
| `matches('src')`（ディレクトリ名と同じファイル） | `false`（現行 `startsWith('src/')` と同じ） |
| `matches('srcfoo/x.mjs')` | `false` |
| `matches('progress/calc-page.md')`（0 階層） | `true` |
| `matches('progress/archive/calc-page.png')`（1 階層・シンボリックリンク） | `true`（指摘 2 の再発防止） |
| `matches('progress/archive/calc-page.figma.json')`（ドット 2 つ） | `true` |
| `matches('task/archive/0003-calc-page/calc-page.png')`（2 階層） | `true` |
| `matches('task/0017-guard-task-paths/spec.md')` | `false` |
| `matches('task/x/calc-pagey.md')` | `false`（`calc-page.` の直後に `.` が要る） |
| `matches('task/x/xcalc-page.md')` | `false` |
| `matches('tools/calc-page.png')` | `false`（`progress/`・`task/` 配下だけ） |
| `matches('tools/archive.mjs')` | `false` |
| `matches('tests/add.test.mjs')` | `false` |
| 移動 `src/calc.css → docs/calc.css` | `needed=true`（移動元を見る。現行と同じ） |
| 差分が取れない | `needed=true`（現行と同じ） |
| 宣言 `conditionalStages: []` を読み取り層に渡す | 妥当。工程は 0 件 |
| `conditionalStages` を省略したマニフェストで `node tools/start-task.mjs --next-id` | 現行と同じ ID を出す（工程の有無は選択に無関係） |
| `node tools/e2e-needed.mjs origin/main e2e` | `needed=true` / `needed=false` のどちらかを出し、終了コード 0 |
| `node tools/e2e-needed.mjs origin/main nosuch` | 終了コード非 0。stderr に `nosuch` が宣言に無いこと |
| `triggers: [42]` を渡す | 位置 `conditionalStages[0].triggers[0]` と期待する型を表示して落ちる |
| `triggers: []` を渡す | 落ちる |
| `triggers: ['src**']` を渡す | 落ちる（`**` がセグメント全体でない） |
| `modelForComplexity('S', {S:'haiku',M:'sonnet',L:'fable'})` | `'haiku'` |
| `modelForComplexity(null, {S:'haiku',M:'sonnet',L:'fable'})` | `'sonnet'`（未記載は `M`） |
| `modelForComplexity('constructor', {S:'haiku',M:'sonnet',L:'fable'})` | 失敗（継承プロパティを表とみなさない） |
| `complexityModels: {S:'haiku', L:'fable'}` を渡す | `M` の欠落を表示して落ちる |
| `complexityModels: {S:'haiku', M:'sonnet', L:'fable', XL:'opus'}` を渡す | 落ちる |
| `complexityModels` を省略したマニフェストで作業を選ぶ | 選択と worktree の用意は成功し、出力にモデルが**無い** |
| `reviewers: ['codex-reviewer', 'nosuch-reviewer']` を `exists` 注入で渡す | `.claude/agents/nosuch-reviewer.md` の不在を表示して落ちる |
| `reviewers` を省略、または `[]` | 妥当。レビュアーの検査は存在しない |
| リポジトリの宣言で `task/**/calc-page.*` を `task/*/calc-page.*` に変えて `npm run test:unit` | `task/archive/0003-calc-page/calc-page.png` の行が赤くなる（わざと落とす検査） |
| リポジトリの宣言から `M` を外して `npm run test:unit` | 読み取り層と `start-task` のテストが赤くなる |
| この PR を `allow-protected-change` ラベル無しで出す | `protected-paths` が失敗する |
| 同じ PR にラベルを付けて再実行 | `protected-paths` が成功する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. **拾う集合が狭まっていない。** 「例」の `matches` の全行（階層をまたぐ `progress/archive/...`・`task/archive/.../calc-page.*` を含む）が、**リポジトリの `loop.manifest.json` の宣言を読んで**判定するテストで期待どおりになる。`tests/e2e-needed.test.mjs` の既存ケースは 1 件も削られていない。
6. **0 件の宣言で成立する。** `conditionalStages: []` が読み取り層の検査を通り、`tools/start-task.mjs`・`tools/check-protected-paths.mjs` の挙動が工程の有無で変わらない。判定ツールに宣言に無い工程名を渡したときだけ、配線不一致として終了コード非 0 で落ちる。
7. **葉まで検査する。** `triggers: [42]`・`triggers: []`・`triggers: ['']`・`triggers: ['src**']`・`name` の重複を、**わざと不正な宣言を渡すテスト**がそれぞれ落とす。落ちた診断文に位置（`conditionalStages[i].triggers[j]`）が含まれる。
8. **表は完全でなければ落ちる。** `complexityModels` から `S`・`M`・`L` のいずれかを外した宣言、余分なキーを足した宣言、値が文字列でない宣言をテストが落とす。宣言を省略したときは `start-task` がモデルを出力せずに選択を完了する。
9. **レビュアー名は省略できる。** `reviewers` 省略と `[]` が妥当で、宣言されたときは各名前の `.claude/agents/<name>.md` の実在を `exists` 注入のテストで検査する。進捗側との突き合わせは実装していない（範囲外）。
10. **ハードコードが消えている。** `tools/e2e-needed.mjs` に `calc-page`・`src/`・`setup-playwright` の文字列が無く、`tools/start-task.mjs` に `haiku`・`sonnet`・`fable` の文字列が無い（`grep` の出力を貼る）。
11. **判定は base リビジョンで完結する。** `.github/workflows/ci.yml` の `e2e` ジョブが base から取り出すファイルの集合が、`tools/e2e-needed.mjs` のローカル import（推移的）と `loop.manifest.json` を 1 つ残らず含むことをテストが固定する。取り出し対象から 1 つ外すとそのテストが赤くなる。
12. **わざと落とす検査を実測している。** リポジトリの宣言の `task/**/calc-page.*` を `task/*/calc-page.*` に変えて `npm run test:unit` を回し、赤くなった出力を進捗に貼る（貼ったら戻す）。同様に `M` を外した出力も貼る。
13. ラベル無しで `protected-paths` が失敗し、`allow-protected-change` ラベル付きの再実行で成功する。両方の実行結果を進捗に貼る。
