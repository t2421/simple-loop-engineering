# `check-protected-paths` の検証契約と保護パス一覧の宣言化

`tools/check-protected-paths.mjs` にハードコードされている「検証コマンドの定義の所在」と「保護パス一覧」を、0042 が作るマニフェストの宣言から読むようにする。**消費者は `check-protected-paths.mjs` 1 本だけである。**

## 種別

機能追加

## 対象

- 場所:
  - `tools/check-protected-paths.mjs` — **唯一の消費者。** `TEMPLATES` / `CHECKER` / `GATE_HELPERS` / `APPEND_ONLY_DIRS` の定数と、`package.json` の `scripts` を名指しで比較する `scriptsChanged` / `readScripts` を、宣言の読み取りに置き換える
  - マニフェスト（0042 が置くファイル。PR #76 の材料では `loop.manifest.json`）— `verify` と保護パス一覧の節を、この spec の契約どおりに宣言する
  - 読み取り層（0042 のモジュール。PR #76 の材料では `tools/loop-manifest.mjs`）— `verify.invokedIn` と保護パス一覧の**葉までの型検査**が 0042 の成果物に無ければ、この作業で足す
  - `.github/workflows/guard.yml` — ガードジョブが判定コードと同じく**読み取り層と宣言も merge-base リビジョンのもの**を使うようにする
  - `tests/protected-paths.test.mjs`・`tests/gate-helpers.test.mjs`・`tests/hook-wiring.test.mjs` — 宣言の供給の仕方だけを変える。**各ケースの入力（差分）と期待（違反の件数・パス・理由）は変えない**
  - `tests/verify-contract.test.mjs`（新規）— 深い比較・型不正・欠落・内部不整合・「わざと落とす」を固定する
- 公開面:
  - CLI は変えない: `node tools/check-protected-paths.mjs <base-ref>`
  - `findViolations(input)` — 従来の `changes` / `baseArchivedIds` に加えて、`baseScripts` / `headScripts` の代わりに **定義ごとの base / head の抽出値** と、宣言から組み立てた **保護方針（policy）** を受け取る純関数。方針を渡さない呼び出しは例外（既定値で補わない）
  - `definitionChanged(base, head) -> boolean` — 検証定義の**形式非依存の深い比較**。純関数
  - `buildPolicy(manifest) -> policy` — 妥当性検査済みのマニフェストから、ガードが使う方針を組み立てる純関数。不足・型不正・内部不整合は例外
- **凍結対象に触れる作業である。** `tools/check-protected-paths.mjs`、既存の `tests/*.test.mjs` 3 本、`.github/workflows/guard.yml` を変更する。`allow-protected-change` ラベルが要る（→「失敗時」）。マニフェストと読み取り層は 0042 の完了時点で保護対象に入っている前提であり、それらを変える分も同じラベルで通す

## 背景

### 依存: 0042 の完了を待つ

この作業は `task/0042-loop-manifest/spec.md`（再スコープ済みの版）の「範囲外」表で `0056-manifest-verify-contract` に割り当てられた分である。0042 が**マニフェストの型と読み取り層**を作り、消費者を持たない状態でマージ・アーカイブされたあとに着手する。解除条件は `task/archive/0042-loop-manifest/` が存在すること。それまで progress の Status は `Blocked` とする。

0042 が確定するのはファイル名・読み取り層のモジュール名・項目名である。本 spec の項目名（`verify.command` / `verify.definedIn[].jsonKey` / `appendOnlyDirs[]` など）は PR #76 の材料に合わせている。0042 が別名で確定した場合は、**意味を変えずに名前だけ追随し**、対応表を progress の試行ログに残す。

### 1 回目の実装が不承認になった原因

1 回目の実装（PR #76、クローズ済み）は Verify (外部) を 5 回回して 5 回とも不承認だった。原因は**1 PR で 6 つのゲート（検証コマンド・保護パス・実装ディレクトリ・台帳・条件付き工程・モデル表）を同時に宣言化したこと**である。消費者ごとに「わざと落とす検査」を持てず、1 か所塞ぐたびに別の消費者で新しい穴が出た。この作業は消費者を `check-protected-paths.mjs` 1 本に限り、この 1 本について「わざと落とす検査」を完了条件に持つ。

5 回のレビューで `check-protected-paths.mjs` に関して実際に出た指摘は次の 3 つである。いずれも本 spec の「仕様」で再発防止の対象にする。

| 指摘 | 何が起きていたか | 本 spec での扱い |
|---|---|---|
| `verify.invokedIn` の欠落を `?? []` で補っていた | 「呼び出しをやめれば検証は消える」を理由に新設した項目なのに、欠落を**無保護**へ倒していた | 欠落は読み取り層が落とす。`buildPolicy` も空配列を受けない（「失敗時」） |
| 検証定義の比較が 1 段の `!==` だった | スカラーなら**常に変わっていない**（凍結の空洞化）、入れ子オブジェクトなら参照比較で**常に変わっている**（常に落ちる）へ倒れていた | `definitionChanged` を**キー順に依存しない深い比較**にし、スカラー・入れ子・キー順違いをテストで固定する |
| `appendOnlyDirs[].ledger` の `=== true` 三項式 | 文字列 `"true"` が false に落ち、別名 spec の禁止とアーカイブ済み ID の再利用検知が**無言で消えていた** | 真偽値の項目（本 spec では `archiveMove`）は `typeof === 'boolean'` 以外を型不正として落とす。三項式で化かさない |

### 0044 の申し送り（この作業に効くもの）

`task/archive/0044-second-project-port/notes/port-log.md` の 2.1 節と 5 節「0042 へ」の 2・3。

- **`definedIn` を単数にしない**（申し送り 2）。移植先 P では検証がワークフロー YAML に直書きされ、`scripts/ci.sh`（定義）と `.github/workflows/*.yml`（呼び出し）の**2 つ**を守る必要があった。定義の所在だけ守っても、呼ぶのをやめれば検証は一字も触らずに消える。このリポジトリでも `package.json`（定義）と `.github/workflows/ci.yml`・`.claude/settings.json` の Stop hook（呼び出し）に分かれており、後者は `APPEND_ONLY_DIRS` と `GATE_HELPERS` に入っていたので**偶然**成立していた。契約は `definedIn`（配列）と `invokedIn`（配列）の両方を持つ
- **比較は形式非依存にする**（申し送り 3）。JSON パースを前提にしない。移植先の定義は `Makefile` や shell script のこともある。0044 の移植では JSON をパースせず**内容の同一性**で比較した（緩い側ではなく強い側に倒した）。このリポジトリの `package.json` は `scripts` 以外の変更（依存の追加など）を許す現在の判定を保つ必要があるので、抽出の仕方を宣言で選べるようにする（`jsonKey` を持つ項目だけ JSON として節を取り出す。持たない項目はファイル内容そのものを比較する）

### 凍結改訂の宣言

**この作業は凍結改訂である。** `tools/check-protected-paths.mjs`（ガードの判定ロジック）、`tests/protected-paths.test.mjs`・`tests/gate-helpers.test.mjs`・`tests/hook-wiring.test.mjs`（既存テスト）、`.github/workflows/guard.yml`（ガードのワークフロー）の内容を変更する。

**この変更が検証を弱めない理由**:

- 判定の**結果**を変えない。現在 3 本のテストが固定している「どの差分が違反になるか」は、宣言経由でも同じ入力で同じ件数・同じパス・同じ理由になる（完了条件 6）。テストの変更は `findViolations` への方針の渡し方だけで、各ケースの入力と期待を変えない
- 判定の**根拠**は増える方向にしか動かない。`package.json` の `scripts` 比較は `definedIn` の 1 項目として残り、そこに `invokedIn`（`.github/workflows/ci.yml`・`.claude/settings.json`）が明示される。今まで偶然守られていたものが契約として守られる
- 宣言は新しい攻撃面だが、0042 がマニフェスト自身を保護対象にしており、本作業は読み取り層とマニフェストを **merge-base リビジョンで読む**ことを足す（完了条件 10）。HEAD 側で宣言を弱めても、base の宣言で判定される
- 「わざと落とす検査」（完了条件 7）で、宣言から保護対象を 1 件外すと対応するテストが赤くなることを実測する。宣言化によって保護が無言で消える経路を機械的に塞ぐ
- `.github/workflows/guard.yml` の変更は、base リビジョンで実行する対象に読み取り層を**加える**だけで、実行するステップを減らさない

**1 回目の実装は材料として使う。** ブランチ `feat/0042-loop-manifest`（PR #76）に `loop.manifest.json`・`tools/loop-manifest.mjs`・テストが残っている。ただし上表の 3 つの指摘を含む版なので、そのまま持ってこない。

## 仕様

### 契約 1: 検証コマンド（`verify`）

| 項目 | 型 | 意味 | このリポジトリの値 |
|---|---|---|---|
| `verify.command` | 空でない文字列 | どう検証するか | `npm run ci` |
| `verify.definedIn` | 要素 1 つ以上の配列。要素は `{ path: 空でない文字列, jsonKey?: 空でない文字列 }` | その定義がどのファイルにあるか。`jsonKey` があれば JSON として読みそのトップレベルの節だけを定義とみなす。無ければファイル内容そのもの（文字列）を定義とみなす | `[{ "path": "package.json", "jsonKey": "scripts" }]` |
| `verify.invokedIn` | 要素 1 つ以上の配列。要素は空でない文字列（パス） | その定義がどこから呼ばれているか | `[".github/workflows/ci.yml", ".claude/settings.json"]` |

`verify.command` はこの作業では判定に使わない（ガードは「変わったか」だけを見る）。項目として要求するのは、宣言が「何を守っているか」を人が読めるようにするためである。

ガードの規則:

- **`definedIn` の各 `path`**:
  - `modified`: merge-base と HEAD の両方から定義を抽出し、`definitionChanged` が true なら違反（理由: `検証コマンドの定義（<path>）が変わっている`）。false なら通す（`package.json` の `scripts` 以外の変更を許す現在の判定を保つ）
  - `removed`（削除・移動元）: 違反
  - `appeared` で移動元が無い（新規追加）: 通す（導入 PR）。移動元がある: 違反
  - 抽出は `git show <ref>:<path>` で行う。`jsonKey` を持つ項目は JSON としてパースし `jsonKey` の値を取る。パースできない・ファイルが読めないときは**「変わっていない」と読まず**、理由を表示して終了コード 1
- **`invokedIn` の各パス**: 現在の `GATE_HELPERS` と同じ規則。`modified` / `removed` / 移動元のある `appeared` は違反（理由: `検証コマンドの呼び出し元は変更も移動もできない`）。新規追加は通す
- **`definitionChanged(base, head)`**: 形式非依存の深い比較。規則は「例」の表のとおり。要点は次の 3 つ
  - 文字列・数値・真偽値・`null` は値で比較する（スカラーで常に false にならない）
  - オブジェクトはキーの**集合**と各値を再帰的に比較する。キーの順序に依存しない（キー順だけ違う 2 つは「変わっていない」）
  - 配列は長さと各要素の順序つき比較。型が違えば「変わっている」。片側だけ `undefined`（節が無い）も「変わっている」

### 契約 2: 保護パス一覧（`protectedPaths`）

現在の 4 定数を、そのままの意味で宣言に移す。**規則の中身（`covers` / `isAliasSpec` / `archivedIdReused` / アーカイブ移動の免除 / すり替えの検知）は変えない。** 変えるのは「どのパスが対象か」の出どころだけである。

| 項目 | 型 | 現在の定数 | 規則 |
|---|---|---|---|
| `protectedPaths.templates` | 要素 1 つ以上の、空でない文字列の配列 | `TEMPLATES` | どの出来事でも違反（新規追加も含む。現行どおり） |
| `protectedPaths.gateHelpers` | 要素 1 つ以上の、空でない文字列の配列 | `CHECKER` + `GATE_HELPERS` | 新規追加だけ通す。変更・削除・移動は違反（理由: `検証の委譲先は変更も移動もできない`） |
| `protectedPaths.appendOnlyDirs` | 要素 1 つ以上の配列。要素は `{ prefix, label, archiveMove, exclude?, specFile? }` | `APPEND_ONLY_DIRS` | 現行どおり |

`appendOnlyDirs[]` の各項目:

| フィールド | 型 | 意味 |
|---|---|---|
| `prefix` | `/` で終わる空でない文字列 | 対象ディレクトリ |
| `label` | 空でない文字列 | 違反理由に埋め込む名前 |
| `archiveMove` | **真偽値**（`typeof === 'boolean'`。`"true"` は型不正） | `<prefix>X` → `<prefix>archive/X` の内容同一の移動を許すか |
| `exclude` | 省略可。空でない文字列 | 作業ディレクトリ直下で保護から外すファイル名（現: `progress.md`） |
| `specFile` | 省略可。空でない文字列 | 「1 作業 1 spec」の規約に従うディレクトリの spec 名（現: `spec.md`）。別名 spec の禁止と ID 再利用の検知はこの項目を持つディレクトリだけに効く |

### 別名 spec の判定を許可リストへ広げる（0044 の申し送り 7）

`isAliasSpec` は現在、作業ディレクトリ直下の `.md` のうち `specFile` と `exclude` の**単数 2 件**以外を
別名 spec として弾く。移植先の台帳が規模に応じて 5 種の文書を持つため、単数のままだと設計書や実装計画を
足す通常の PR が毎回 `allow-protected-change` を要求し、**ラベルが日常化してガードが形骸化する**
（記録 2.6 e）。

判定の入力を、台帳の宣言が持つ**文書の許可リスト**（`ledger.docs`。0042 が型として定義する）に変える。

- 許可リストに**無い**名前は従来どおり弾く。**迂回経路は開かない**
- **このリポジトリでは許可リストが `spec.md` / `progress.md` の 2 件**になるだけで、判定結果は 1 件も変わらない。
  `tests/protected-paths.test.mjs` の既存ケースは 1 つも書き換えずに通る
- `specFile`（ID 再利用の検知に使う「その作業の spec はどれか」）は許可リストとは別に残す。
  許可リストは「置いてよい名前の集合」、`specFile` は「その中で spec の役割を担う名前」であり、役割が違う

このリポジトリの値は、現在の定数と 1 対 1 に対応する。`gateHelpers` には現在の `CHECKER`・`GATE_HELPERS` の 7 件に加えて、**マニフェスト自身と読み取り層のモジュール**が入る（前者は 0042 が入れる。後者が 0042 で入っていなければこの作業で入れる）。

### 規則の適用順（1 パス 1 違反）

1 つのパスが複数の宣言に該当しうる（例: `.claude/settings.json` は `gateHelpers` と `invokedIn` の両方、`.github/workflows/ci.yml` は `invokedIn` と `appendOnlyDirs`）。違反は**そのパスについて 1 件だけ**報告し、理由は次の順で最初に該当した規則のものにする。`tests/hook-wiring.test.mjs` が「ちょうど 1 件」を要求しているため、順序は仕様として固定する。

1. `gateHelpers`
2. `templates`
3. `verify.definedIn`
4. `verify.invokedIn`
5. `appendOnlyDirs`

### 既定値で補わない（`buildPolicy` と読み取り層）

0042 の不変条件をこの作業が渡す値にも適用する。

- 上の 2 表にある項目の欠落・型不正は、**どの項目がどう不正か**を述べる例外にする。`?? []`・`?? {}`・`=== true` の三項式・`Array.isArray` だけの検査を置かない
- 配列は葉まで見る（`["a", 42]` を通さない。`[{ path: 42 }]` を通さない）
- 要素 0 個の `definedIn` / `invokedIn` / `templates` / `gateHelpers` / `appendOnlyDirs` は落とす（空は「守るものが無い」ではなく宣言の欠落である）
- **内部整合**: `gateHelpers` にガードの判定ロジック自身（`tools/check-protected-paths.mjs`）と読み取り層のモジュールが含まれていなければ落とす。判定コードの自己保護は宣言化しても失ってはならない
- `definedIn[].path`・`invokedIn[]` が HEAD に存在しなければ落とす（0042 の「失敗時」と同じ）

### 宣言の読み取り位置（base リビジョン）

ガードジョブは判定コード（`tools/check-protected-paths.mjs`）を merge-base のリビジョンで実行している。宣言化すると「HEAD で宣言を弱める」という新しい経路が生じるので、**`main()` はマニフェストを作業ツリーからではなく `git show <merge-base>:<マニフェスト>` で読む。** `.github/workflows/guard.yml` は判定コードと同じ方法で読み取り層のモジュールも base リビジョンを取り出して実行する。

`tests/` からの利用（`findViolations` の呼び出し）では、テストが作業ツリーの実物のマニフェストを 0042 の読み取り層で読み、`buildPolicy` で方針を組み立てて渡す。**固定値の写しをテストに持たない**（一覧を持つと、それ自体が同期し忘れる対象になる。`tests/hook-wiring.test.mjs` と同じ設計）。これによって「宣言から 1 件外すとテストが赤くなる」が成立する。

### 残るハードコード

`check-protected-paths.mjs` に残してよい固有値は、**マニフェストの所在を知るために読み取り層を import する 1 行**だけである。マニフェストのパス定数は読み取り層が持つ。

## 範囲外

- `check-protected-paths.mjs` 以外の消費者。`check-progress-coupling.mjs`・`guard-worktree.mjs`・`start-task.mjs` は `0057-manifest-layout-ledger`、`e2e-needed.mjs` ほかは `0058-manifest-optional-stages` が担う。この作業ではこれらのファイルを 1 行も変えない
- 作業 ID のパターン（`archivedIdReused` と `readBaseArchivedIds` の `/^(\d{4})-/`）の宣言化。台帳の契約（0057）に属する。この作業では現状のまま残す
- 台帳の**場所**（作業ディレクトリの親）と**作業 ID の形**の宣言化。3 消費者が読む値であり 0057 の範囲。この作業が読むのは「直下に置いてよい文書の許可リスト」だけである
- `verify.command` を実行すること（ガードは「変わったか」だけを見る）
- 判定規則そのものの変更（アーカイブ移動の免除条件、すり替え検知など）。出どころを変えるだけで規則は変えない。**例外は別名 spec の判定 1 件で、単数の除外から許可リストへ広げる**（下記「仕様」。0044 の申し送り 7。このリポジトリでは許可リストが `spec.md` / `progress.md` の 2 件になるだけで、判定結果は 1 件も変わらない）
- マニフェストの型と読み取り層の設計（0042 の範囲）。この作業は 0042 が足りない分（`invokedIn`、保護パス一覧の葉までの型検査）だけを足す
- `.claude/settings.json` の hook 配線の網羅検査の変更（`tests/hook-wiring.test.mjs` の抽出ロジックは触らない。方針の供給だけ変える）
- 保護パス一覧の増減（守る対象を足す・外すのは `.claude/skills/add-protected-path`。この作業は「同じ一覧を宣言から読む」だけ）

## 失敗時

- マニフェストが merge-base に存在しない・読めない: パスと理由を表示して終了コード 1。作業ツリーの版で代用しない
- `verify.invokedIn` が無い: `verify.invokedIn` の欠落を表示して落ちる。`?? []` で無保護に倒さない
- `verify.definedIn` / `verify.invokedIn` / `protectedPaths.*` が要素 0 個: 欠落として落ちる
- `verify.definedIn[]` の要素が文字列（`"package.json"`）: 型不正（`{ path }` の形を要求）として落ちる
- `verify.definedIn[].jsonKey` の指すファイルが JSON としてパースできない: 「変わっていない」と読まず、パスと理由を表示して終了コード 1
- `verify.definedIn[].path` / `verify.invokedIn[]` が HEAD に存在しない: そのパスを表示して落ちる
- `protectedPaths.appendOnlyDirs[].archiveMove` が文字列 `"true"`: 型不正として落ちる（三項式で false に化かさない）
- `protectedPaths.gateHelpers` に `["tools/run-unit-tests.mjs", 42]`: 葉の型不正として落ちる
- `protectedPaths.gateHelpers` に `tools/check-protected-paths.mjs` が無い: 内部不整合（判定コードの自己保護の欠落）として落ちる
- `findViolations` に方針を渡さない: 例外。既定の方針で動かない
- 差分の取得失敗・出力の途中切れ: 現行どおり終了コード 1
- **`allow-protected-change` ラベル無しの PR は `protected-paths` が検知して失敗する（正しい挙動）。** 本作業は `tools/check-protected-paths.mjs`・既存 `tests/` 3 本・`.github/workflows/guard.yml` を変更する凍結改訂であり、ラベルを付けた再実行で成功する

## 例

`empty` は `{ changes: [], baseDefinitions: {}, headDefinitions: {} }` に、作業ツリーの実物のマニフェストから `buildPolicy` で組み立てた方針を足したものとする。`baseDefinitions` / `headDefinitions` は `definedIn[].path` をキーに抽出値を持つ。

### 判定（宣言経由で現行と同じ結果）

| 操作または入力 | 期待結果 |
|---|---|
| `findViolations({ ...empty, changes: [{ status: 'M', path: 'tools/run-unit-tests.mjs' }] })` | 違反 1 件。path `tools/run-unit-tests.mjs`、reason `検証の委譲先は変更も移動もできない` |
| 同上で path `.claude/settings.json` | 違反 1 件。reason `検証の委譲先は変更も移動もできない`（`invokedIn` にも該当するが `gateHelpers` が先） |
| 同上で path `.github/workflows/ci.yml` | 違反 1 件。reason `検証コマンドの呼び出し元は変更も移動もできない`（`appendOnlyDirs` より `invokedIn` が先） |
| 同上で path `.github/workflows/guard.yml` | 違反 1 件。reason は現行の `既存のワークフローの内容が変わっている` |
| `changes: [{ status: 'M', path: 'package.json' }]`、`baseDefinitions: { 'package.json': { ci: 'npm test' } }`、`headDefinitions: { 'package.json': { ci: 'echo ok' } }` | 違反 1 件。path `package.json` |
| 同上で base / head の抽出値が `{ test: 'node --test' }` どうし | 違反 0 件（`scripts` 以外の変更は通す。現行どおり） |
| `changes: [{ status: 'D', path: 'package.json' }]` | 違反 1 件（定義の削除） |
| `changes: [{ status: 'M', path: 'task/TEMPLATE-spec.md' }]` | 違反 1 件。reason は現行の `型（TEMPLATE）は変更も移動もできない` |
| `changes: [{ status: 'M', path: 'task/0001-x/spec.md' }]` | 違反 1 件（現行どおり） |
| `changes: [{ status: 'M', path: 'task/0001-x/progress.md' }]` | 違反 0 件（現行どおり） |
| `changes: [{ status: 'M', path: 'tools/archive.mjs' }]` | 違反 0 件（宣言に無い `tools/` は保護しない。現行どおり） |
| `node --test tests/protected-paths.test.mjs tests/gate-helpers.test.mjs tests/hook-wiring.test.mjs` | すべて pass。各ケースの入力と期待は変更前と同一 |

### `definitionChanged`（形式非依存の深い比較）

| 操作または入力 | 期待結果 |
|---|---|
| `definitionChanged('all: test', 'all: test')` | `false`（スカラーを値で比較する。常に false にならないことは次行で示す） |
| `definitionChanged('all: test', 'all: echo ok')` | `true` |
| `definitionChanged({ ci: 'a' }, { ci: 'a' })` | `false`（入れ子オブジェクトを参照比較しない） |
| `definitionChanged({ a: 1, b: 2 }, { b: 2, a: 1 })` | `false`（キー順に依存しない） |
| `definitionChanged({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })` | `false`（入れ子でもキー順に依存しない） |
| `definitionChanged({ a: { x: 1 } }, { a: { x: 2 } })` | `true`（葉の差を拾う） |
| `definitionChanged({ a: 1 }, { a: 1, b: 2 })` | `true`（キーの増減） |
| `definitionChanged([1, 2], [2, 1])` | `true`（配列は順序つき） |
| `definitionChanged('1', 1)` | `true`（型が違えば変わっている） |
| `definitionChanged(undefined, { ci: 'a' })` | `true`（片側に節が無い） |

### 既定値で補わない・内部不整合

| 操作または入力 | 期待結果 |
|---|---|
| `verify` から `invokedIn` を消したマニフェストで `buildPolicy` | `verify.invokedIn` を名指しした例外 |
| `verify.invokedIn: []` | 例外（要素 0 個） |
| `verify.definedIn: ["package.json"]` | 例外（要素は `{ path }` の形） |
| `verify.definedIn: [{ path: 42 }]` | 例外（葉の型不正） |
| `protectedPaths.appendOnlyDirs[0].archiveMove: "true"` | 例外（真偽値でない） |
| `protectedPaths.gateHelpers: ["tools/run-unit-tests.mjs", 42]` | 例外（葉の型不正） |
| `protectedPaths.gateHelpers` から `tools/check-protected-paths.mjs` を外す | 例外（自己保護の欠落） |
| `findViolations({ changes: [] })`（方針なし） | 例外 |

### わざと落とす検査（作業ツリーのマニフェストを一時的に書き換え、実行後に戻す）

| 操作または入力 | 期待結果 |
|---|---|
| `protectedPaths.gateHelpers` から `tools/e2e-needed.mjs` を外して `node --test tests/gate-helpers.test.mjs` | `tools/e2e-needed.mjs の内容変更は違反になる` が fail |
| `protectedPaths.gateHelpers` から `.claude/settings.json` を外して `node --test tests/hook-wiring.test.mjs` | `hook の配線そのもの（.claude/settings.json）も凍結対象に入っている` が fail |
| `verify.definedIn` から `package.json` の項目を外して `node --test tests/protected-paths.test.mjs` | `package.json の scripts を変更した差分は違反になる` が fail |
| `protectedPaths.appendOnlyDirs` から `task/` の項目を外して `node --test tests/protected-paths.test.mjs` | `task/ 配下の既存 spec.md の内容変更は違反になる` が fail |
| `protectedPaths.templates` から `task/TEMPLATE-spec.md` を外して `node --test tests/protected-paths.test.mjs` | `task/ の型は変更も移動も削除も許さない` が fail |
| 書き換えを戻して 3 本を実行 | すべて pass |

### 宣言の読み取り位置

| 操作または入力 | 期待結果 |
|---|---|
| main から切ったブランチで、マニフェストの `gateHelpers` から `tools/e2e-needed.mjs` を外し、あわせて `tools/e2e-needed.mjs` を 1 行変えてコミットし、`node tools/check-protected-paths.mjs main` | 違反 2 件（マニフェスト自身の変更、`tools/e2e-needed.mjs` の変更）。**HEAD の弱めた宣言ではなく merge-base の宣言で判定される** |
| `.github/workflows/guard.yml` の `protected-paths` ジョブ | 判定コードに加えて読み取り層のモジュールも `git show origin/$BASE_REF:<path>` で取り出して実行している（差分で確認） |

### 凍結改訂のラベル運用

| 操作または入力 | 期待結果 |
|---|---|
| この作業の PR を `allow-protected-change` ラベル無しで出す | `protected-paths` が `tools/check-protected-paths.mjs`・`tests/*.test.mjs`・`.github/workflows/guard.yml` の変更を検知して失敗 |
| 同じ PR に `allow-protected-change` を付けて再実行 | `protected-paths` が成功 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. **ハードコードが消えている。** 次の grep が 0 行を出力する（文字列リテラルとしての保護パス・定義ファイル名が `check-protected-paths.mjs` に無い）。残る固有値は読み取り層の import だけである。

   ```
   grep -nE "'(package\.json|task/TEMPLATE-spec\.md|task/TEMPLATE-progress\.md|specs/TEMPLATE\.md|progress/TEMPLATE\.md|tools/[a-z-]+\.mjs|\.claude/settings\.json|task/|specs/|tests/|\.github/workflows/)'" tools/check-protected-paths.mjs
   ```

   あわせて `scriptsChanged` / `readScripts` の名前が無い（`grep -c "scriptsChanged\|readScripts" tools/check-protected-paths.mjs` が `0`）。
6. **既存のガードの判定が 1 つも弱くなっていない。** `tests/protected-paths.test.mjs`・`tests/gate-helpers.test.mjs`・`tests/hook-wiring.test.mjs` の各ケースについて、差分（`changes`）と期待（違反の件数・`path`・`reason`）を変更前と同一に保ったまま、方針の供給だけを変えて全ケースが pass する。3 本の `git diff` に `assert` 行の変更が無いことと、`node --test` の出力を進捗に貼る。
7. **わざと落とす検査。** 「例」の「わざと落とす検査」の 5 行それぞれについて、作業ツリーのマニフェストから 1 件外した状態で対応するテストケースが fail し、戻すと pass する。5 通りの fail 出力と、戻した後の pass 出力を進捗に貼る。
8. **深い比較が固定されている。** `tests/verify-contract.test.mjs` が「例」の `definitionChanged` の 10 行をすべて覆い、スカラーが常に「変わっていない」にならないこと、入れ子オブジェクトが参照比較で常に「変わっている」にならないこと、キー順違いが「変わっていない」になることを、それぞれ独立したケースで示す。
9. **既定値で補わない。** 「例」の「既定値で補わない・内部不整合」の 8 行をユニットテストが覆う。`tools/check-protected-paths.mjs` と（この作業で足した範囲の）読み取り層に `?? []`・`?? {}`・`=== true ?`・`Array.isArray(x) ?` の形が無い（`grep -nE "\?\? \[\]|\?\? \{\}|=== true \?|Array\.isArray\([^)]*\) \?"` が 0 行）。
10. **宣言は merge-base から読む。** `main()` がマニフェストを `git show <merge-base>:<path>` で読み、`.github/workflows/guard.yml` が読み取り層のモジュールも base リビジョンで取り出して実行する。「例」の「宣言の読み取り位置」1 行目の再現手順で違反 2 件が出る出力を進捗に貼る。
11. **消費者は 1 本だけ。** `tools/check-progress-coupling.mjs`・`tools/guard-worktree.mjs`・`tools/start-task.mjs`・`tools/e2e-needed.mjs` を変更していない（`git diff --stat main...HEAD -- <4 ファイル>` が空）。読み取り層を import しているのは `tools/check-protected-paths.mjs` と `tests/` だけである。
12. **別名 spec の判定が許可リストになっている。** `isAliasSpec` が `ledger.docs` を読み、許可リストに無い名前を従来どおり弾く。次を示す。
    - このリポジトリの宣言（許可リスト 2 件）で `tests/protected-paths.test.mjs` の既存ケースが **1 つも書き換えずに** 全 pass する
    - 許可リストを 5 件（移植先の台帳を模した `01_requirements.md` ほか）にすると、その 5 件が別名 spec にならず、リストに無い `notes.md` は従来どおり違反になる。両方をテストで固定する
13. **凍結改訂の標準完了条件。** この作業の PR を `allow-protected-change` ラベル無しで出すと `protected-paths` が失敗し、ラベルを付けた再実行で成功する。両方の実行結果（Actions の URL と結論）を進捗に貼る。
