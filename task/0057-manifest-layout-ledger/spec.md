# 実装パスと台帳のマニフェスト化

`check-progress-coupling.mjs`・`guard-worktree.mjs`・`start-task.mjs` の 3 本が、実装パス・台帳の場所・作業 ID の形を、`0042-loop-manifest` が作るマニフェストの宣言から読むようにする。**同じ宣言を読む 2 実装（進捗結合と worktree ガード）の一致を、表駆動のテストで固定する。**

## 種別

機能追加

## 対象

- 場所:
  - `tools/check-progress-coupling.mjs` — `IMPLEMENTATION_DIRS`・`TASK_DIR`・`PROGRESS_FILE`・`WORK_NAME_RE` の 4 定数と、それらを埋め込んだ利用者向け文言（`MESSAGES`・`main()` の `console.error`）
  - `tools/guard-worktree.mjs` — `IMPLEMENTATION_DIRS` と、`classifyEdit()` の先頭セグメント照合
  - `tools/start-task.mjs` — `WORK_DIR_RE`・`'task'`・`'backlog'`・`'progress.md'`・`'spec.md'`・`CLAIM_PLACES`・採番の桁数（`padStart(4, '0')`・`id.length !== 4`）
  - `tests/progress-coupling.test.mjs`・`tests/guard-worktree.test.mjs`・`tests/start-task.test.mjs`・`tests/start-task-claim.test.mjs` — 既存の期待値は変えず、宣言（実物のマニフェスト）を経由して同じ結果になるよう配線する
  - 新規テスト 1 本（暫定名 `tests/manifest-layout-agreement.test.mjs`）— 2 実装の一致を表駆動で固定する
- 公開面: 3 本の CLI・hook の呼び出し方は変えない。純関数の引数に「宣言」を注入できる口を足す（下記「仕様」）
- **凍結対象に触れる作業である。** `tools/check-progress-coupling.mjs`・`tools/guard-worktree.mjs` は `check-protected-paths.mjs` の `GATE_HELPERS` にあり、`tests/` 配下の既存テストの内容変更もガードが違反として報告する。`allow-protected-change` ラベルが要る（→「失敗時」）。`tools/start-task.mjs` 自体は保護対象ではない

マニフェストのファイル名・項目名は **0042 が確定させたものに従う。** 本 spec で使う `implementation.dirs` / `implementation.files` / `ledger.dir` / `ledger.docs` / `workId.pattern` などは、1 回目の実装（ブランチ `feat/0042-loop-manifest`、PR #76、クローズ済み）の暫定名である。0042 の確定名が違えば読み替える。読み替えは名前だけで、本 spec の命題（意味論・一致・失敗の仕方）は変えない。

## 背景

### なぜ必要か

ループを他プロジェクトへ持ち出すとき、3 本の消費者にはプロジェクト固有の値が定数として埋まっている。0044（2 番目のプロジェクトへの手移植、アーカイブ済み）の記録 `task/archive/0044-second-project-port/notes/port-log.md` 第 3 節の実測では、`check-progress-coupling` は 11〜15、`guard-worktree` は 19、そして両者の**利用者向け文言**は 15・24 の行で書き換えが要った。`guard-worktree.mjs` は「固有語ヒット 0 = 汎用」と分類されていたが、定数のままでは移植先の実装をプライマリで編集してもブロックしなかった（同 3 節末尾の実測）。

0042 は再スコープ（2026-09-03）でマニフェストの**型と読み取り層だけ**を作ることになり、消費者ごとの宣言化は 3 つの後続作業へ分かれた。本作業はそのうち `check-progress-coupling.mjs` / `guard-worktree.mjs` / `start-task.mjs` を担当する（0042 spec「範囲外」の表）。

### この作業のいちばんの難所: 同じ宣言を 2 つ以上の実装が読む

1 回目の実装（PR #76）が 5 回のレビューで不承認になった原因の中心がここにある。実際に出た指摘は次の 4 つで、いずれも「宣言は 1 つなのに、読む側が 2 つあって意味が食い違う」という形をしている。

1. **厳しいほうが import できる側、緩いほうが実際にガードを回す側、という逆転。** 読み取り層の検査は厳しかったが、ガードは独自の緩い読み方で宣言を読んでいた。ガード側の検査が空配列を通し、`gateHelpers: []` の骨抜き宣言がそのまま判定に使われた
2. **入れ子の宣言で 2 実装の意味が食い違った。** worktree ガードは `segments[0]` だけで照合していたため `app/src/` のような 2 階層以上の宣言が効かず、同じ宣言を読む進捗結合は `startsWith` の prefix 一致で入れ子を扱っていた
3. **`implementation.dirs` が `Array.isArray` だけの検査だったため `[42]` が通った。** `startsWith(42)` は `"42"` に強制されるので、実装の変更が全部 docs-only になる。進捗結合が無言で骨抜きになる
4. **`ledger.dir`（start-task と進捗結合が読む）と保護エントリの `prefix`（保護するパスを決める）が別の値でも通った。** 移植で片方だけ書き換えると、新しい台帳で作業しながら凍結は存在しない古いディレクトリを守り続け、稼働中の spec の書き換え・削除が違反 0 件になる

したがって本作業は **「2 実装に同じ宣言・同じ入力を流して結果の一致を固定するテスト」を完了条件の中心に据える。** 1 回目の実装はこの形のテストを 32 件置いていた（`feat/0042-loop-manifest` に残っている。材料として参照してよいが、そのまま持ち込むことは求めない）。

2 実装が残る理由も書いておく。`check-progress-coupling.mjs` は CI が **base リビジョンを一時ファイルへ取り出して実行する**ため、ローカル import を持てない（ファイル冒頭の注記）。よって 0042 の読み取り層を import できるのは `guard-worktree.mjs` と `start-task.mjs` だけで、`check-progress-coupling.mjs` は宣言を自前で読むしかない。**この非対称はなくせないので、テストで固定する。** CI の取り出しを複数ファイルへ広げてこの非対称を消すことは、ワークフローの検証ステップ（凍結対象）の改訂になるため本作業ではやらない（→「範囲外」）。

### 0044 の申し送りのうち、この作業に効くもの

`port-log.md` 第 5 節「0042 へ」の 4・5・7、および第 2.2 節。

- **4. 実装の指定は prefix だけでは足りない。** 移植先ではリポジトリ直下の `setup.sh`・`repos.json` が実装だった（第 3 節 12・19）。ディレクトリと単体ファイルの両方を受ける
- **5. 作業 ID の形をマニフェスト項目にする。** 4 桁連番は移植元の都合であって契約ではない。移植先は `<YYYY-MM-DD>_<slug>` だった（第 3 節 14）
- **7. 台帳の文書構成は「単数の spec + 単数の progress」ではない。** 許可リスト（複数）で表す。移植先の台帳は 5 種の文書を持ち、`exclude` 単数では通常の PR が毎回ラベルを要求する（第 2.6 節 e）
- **2.2 依存導入コマンドの対応物は存在しない。** 本作業に直接効くのは、`start-task.mjs` が `npm ci` を無条件に呼ぶ現状を変えないという点である。`install` の宣言化は 0058 の範囲（→「範囲外」）

### 凍結改訂の宣言

**この作業は凍結改訂である。** `tools/check-progress-coupling.mjs`・`tools/guard-worktree.mjs`（いずれも `GATE_HELPERS`）の内容を変更し、`tests/progress-coupling.test.mjs`・`tests/guard-worktree.test.mjs`・`tests/start-task.test.mjs`・`tests/start-task-claim.test.mjs` の内容も変更する。

**この変更が検証を弱めない理由:**

- 判定の**意味論は変えない**。現在の定数（`src/`・`tests/`・`tools/`・`task/`・`progress.md`・`spec.md`・`^\d{4}-`）を宣言に写すだけで、本リポジトリのマニフェストに対しては 3 本とも現在と同じ結果を返す。既存テストの期待値は 1 件も変えない（完了条件 12）
- **判定は強くなる。** worktree ガードは入れ子の宣言と単体ファイルを扱えるようになる。進捗結合とガードの一致はテストで固定され、片方だけが骨抜きになる経路が閉じる（完了条件 6〜9）
- 宣言の型不正・欠落を既定値で補わない（0042 の不変条件）を消費者側でも守り、**宣言を壊して検証を弱める経路を消費者側からも塞ぐ**（完了条件 10）
- 宣言（マニフェスト）自体は 0042 で保護パスの筆頭に入る。消費者が宣言を読むようになっても、宣言の書き換えは `allow-protected-change` 無しでは通らない

## 仕様

### 消費者が宣言から読む値

| 値 | 現在のハードコード | 読む消費者 | 宣言（暫定名） |
|---|---|---|---|
| 実装ディレクトリ | `src/` `tests/` `tools/` | 進捗結合・worktree ガード | `implementation.dirs` |
| 実装の単体ファイル | （無い。0044 で必要になった） | 進捗結合・worktree ガード | `implementation.files` |
| 台帳のディレクトリ | `task/` | 進捗結合・start-task | `ledger.dir` |
| 台帳の文書の許可リストと役割 | `spec.md`・`progress.md` | start-task（spec・progress の名前）・進捗結合（progress の名前） | `ledger.docs`（許可リスト）と、その中で progress・spec の役割を担う名前 |
| 候補の置き場（採番空間を共有する） | `backlog/` | start-task（`--next-id`・`--claim`・`CLAIM_PLACES`） | `ledger` の下（0 件でもよい配列。移植先 P には backlog が無かった） |
| アーカイブの場所 | `task/archive/` | start-task（採番の走査）・進捗結合（数えない対象） | **別項目にしない。** `ledger.dir` を守る保護エントリ（`archiveMove: true`）から `<ledger.dir>archive/` として導く。同じ値の 2 重宣言を作らない |
| 作業 ID の認識 | `^(\d{4})-(.+)$` / `^\d{4}-[^/\\]+$` | 進捗結合・start-task | `workId.pattern`（捕獲グループ 2 つ: ID・slug） |
| 作業 ID の採番 | 数値連番をゼロ埋め 4 桁 | start-task（`--next-id`・`--claim`） | `workId` の下（現: 桁数。**移植先に実例の無い採番規則（日付 + slug）は実装しない**） |

0042 の宣言に無く、本作業の消費者が必要とする値（候補の置き場・採番の桁数）は、**消費者が読むという実測を根拠に**本作業で足す。足す項目は「0 件でもよい配列」または単一の値とし、既定値で補わない（キーの欠落は落とす）。

### 実装パスの意味論（2 実装で 1 つ）

進捗結合（`isImplementationPath`）と worktree ガード（`classifyEdit`）が同じ意味で宣言を読む。**意味は次の 1 つに定める。** 照合はリポジトリルート相対の**スラッシュ区切り**パス `p` に対して行う。worktree ガードは OS のパスをこの形へ変換してから照合する。

- ディレクトリ宣言 `D`（末尾 `/` の有無は問わず、`/` で分けたセグメント列として扱う）は、**`p` のセグメント列が `D` のセグメント列で始まる**とき一致する。セグメント境界で比べるので `src2/x.mjs` は `src` に一致しない。`app/src/` のような 2 階層以上の宣言は `app/src/x.mjs` に一致し、`app/other.mjs` には一致しない
- ファイル宣言 `F` は、**`p` と完全一致**するとき一致する。`setup.sh.bak`・`dir/setup.sh` は `setup.sh` に一致しない
- ディレクトリ宣言か、ファイル宣言のどちらかに一致すれば「実装パス」である
- 先頭セグメントだけの照合（`segments[0]`）、文字列の `startsWith`（セグメント境界を見ない）は、どちらもこの意味に反する

進捗結合は git のパス、worktree ガードは hook の `file_path` を受けるが、変換後は同じ関数で同じ答えを出す。両者に**同じ宣言・同じパス**を流したときの結果を表駆動で固定する（→「例」の表 A、完了条件 6）。

### 宣言の妥当性（消費者側）

0042 の読み取り層が検査するものを、**消費者側でも既定値で補わない。** 読み取り層を import できる `guard-worktree.mjs`・`start-task.mjs` は読み取り層に委ねる。import できない `check-progress-coupling.mjs` は自前で検査するが、**受理・拒否の結果が読み取り層と一致する**ことを表駆動で固定する（→「例」の表 B、完了条件 7）。

- `implementation.dirs`・`implementation.files` は**どちらもキーが存在**し、各要素は空でない文字列。要素が文字列でなければ落とす（`[42]` を通さない）。`files` の欠落を `?? []` で補わない
- `dirs` と `files` の**両方が空**なら落とす（実装が 1 件も無い宣言は、進捗結合をすべて docs-only にし、worktree ガードを何もブロックしない状態にする）
- 各要素は `/` 始まり・`./` 始まり・`..` セグメント・空セグメントを含まない
- `ledger.dir` は空でない文字列。同じ prefix の保護エントリが存在しなければ落とす（0042 の内部整合。消費者は**読み取り層を通った宣言だけ**を使うので、検査を素通りする読み方を持たない）
- `ledger.docs` は空でない文字列の配列で、progress・spec の役割に割り当てた名前が**許可リストの要素**でなければ落とす
- `workId.pattern` は正規表現としてコンパイルでき、捕獲グループを 2 つ持つ。持たなければ落とす
- 採番した ID を slug と組んだ名前（現: `0057-<slug>`）が `workId.pattern` に**合致しない宣言は落とす**（採番と認識の食い違いを走らせない）。現在の `id.length !== 4` の番号空間枯渇の判定は、この照合に置き換える

### 宣言の読み方（消費者ごと）

| 消費者 | どこから読むか | 読めないとき |
|---|---|---|
| `check-progress-coupling.mjs` | **merge-base（base 側）**の宣言を `git show <merge-base>:<マニフェスト>` で読む。候補側（HEAD）を読まない（進捗の **Branch** を base から読むのと同じ理由。候補側を読むと、宣言から実装ディレクトリを外す変更を同じ PR に同乗させて骨抜きにできる） | 理由を表示して終了コード非 0。**docs-only として通さない** |
| `guard-worktree.mjs` | プライマリチェックアウトのルート直下の宣言（作業ツリー）。`.worktrees/` 配下の判定は宣言を読む**前**に行う（宣言が壊れていても worktree 内の作業は止めない） | 理由を stderr に出して**ブロックする**（終了コード 2）。stdin・JSON・ルート不明の fail-open（環境要因）とは区別する。宣言の欠落・破損を素通りにすると「マニフェストを消す」でガードが無言で消える |
| `start-task.mjs` | `rootDir` 直下の宣言（作業ツリー） | 理由を表示して終了コード非 0。worktree は作らない |

### 純関数の注入口

3 本の判定関数は「宣言」を引数で受け取れる（`isImplementationPath(path, layout)`・`classifyEdit({ filePath, rootDir, layout })`・`readTaskEntries` 相当の走査に `ledger` と `workId` を渡す、など。名前は実装時に決める）。**引数を省略したときの既定値で本物の宣言を黙って読む形にはしない**（`baseHas` の既定が「存在しない」側に倒れているのと同じ向き）。テストは宣言を注入して表駆動で回す。

### 利用者向け文言

`check-progress-coupling.mjs` の `MESSAGES['docs-only']`（`src/・tests/・tools/ に変更がないため対象外です。`）と `main()` の説明文（`実装（src/・tests/・tools/）を変更していますが …`、`progress.md（task/<id>-<slug>/progress.md）…`）、`guard-worktree.mjs` の `blockMessage()` は、宣言の値から組み立てる。0044 の記録 15・24「定数を差し替えても文言は追随しない」を、定数を消すと同時に解く。

### 既存の振る舞いの保持

本リポジトリのマニフェスト（`src/`・`tests/`・`tools/`・`task/`・`spec.md`・`progress.md`・`backlog/`・`^(\d{4})-(.+)$`・4 桁）を宣言として与えたとき、`tests/progress-coupling.test.mjs`・`tests/guard-worktree.test.mjs`・`tests/start-task.test.mjs`・`tests/start-task-claim.test.mjs` が固定している振る舞いは 1 件も変わらない。これらのテストは**実物のマニフェストを写したフィクスチャ**を使う（テスト用の別表を作らない。別表だと宣言を変えてもテストが追随せず緑のままになる）。

## 範囲外

- **マニフェストの型・読み取り層・自己保護**（0042 の範囲。本作業はその完了に依存する）
- **検証コマンドの契約と保護パス一覧の宣言化**（`check-protected-paths.mjs`。0056 の範囲）。`ledger.docs` の許可リスト全体を読む「別名 spec」の判定（`isAliasSpec`）は `check-protected-paths.mjs` にあり、その宣言化は 0056 側で行う。本作業は 3 消費者が要る範囲（progress・spec の役割名と、役割名が許可リストの要素であること）だけ固定する
- **省略可能な項目**（条件付き工程・Complexity→モデル表・レビュアー名・`install`。0058 の範囲）。`start-task.mjs` の `COMPLEXITY_MODELS` と `npm ci` の呼び出しは本作業では触らない
- `tools/archive.mjs`・`tools/promote.mjs` の `WORK_NAME_RE`・`task/`・`backlog/` の宣言化。3 消費者ではない。同じ宣言を読ませるのは別作業とする
- `.worktrees` の場所（`WORKTREES_DIR`）の宣言化。0044 の記録に移植の必要が出ていない
- 採番規則の一般化（日付 + slug など）。移植先に `start-task.mjs` を移植した実例が無い（0044 は移植しなかった。第 3 節末尾）
- CI の base リビジョン取り出し（`.github/workflows/`）を複数ファイルへ広げて `check-progress-coupling.mjs` から読み取り層を import できるようにすること。ワークフローの検証ステップの改訂は本作業に混ぜない
- 利用者向け文言の翻訳・多言語化

## 失敗時

- 宣言（マニフェスト）が base に無い状態で `check-progress-coupling.mjs` を実行する: パスと理由を表示して終了コード非 0。docs-only として通さない
- 宣言の `implementation.dirs` に文字列でない要素（`[42]`）がある: 3 消費者すべてが、項目名と期待する型を表示して落ちる。`"42"` に強制して照合しない
- 宣言の `implementation.dirs` と `implementation.files` が両方とも空: 落ちる（実装が無い宣言は受理しない）
- 宣言の `implementation.files` キーが無い: 落ちる（`?? []` で補わない）
- 宣言の `ledger.dir` と同じ prefix の保護エントリが無い: 落ちる（読み取り層の内部整合。消費者はこの検査を素通りしない）
- 宣言の `workId.pattern` の捕獲グループが 2 つでない: 落ちる
- 採番した名前が `workId.pattern` に合致しない（番号空間の枯渇を含む）: `--claim` は確保せず理由を返す。`--next-id` 単体の出力は変えない
- `guard-worktree.mjs` が宣言を読めない（無い・壊れている）: 理由を stderr に出して終了コード 2 でブロックする。`.worktrees/` 配下のパスは宣言を読む前に通過させる
- `start-task.mjs` が宣言を読めない: 理由を表示して終了コード非 0。worktree を作らない
- **ラベル運用**: `tools/check-progress-coupling.mjs`・`tools/guard-worktree.mjs`・`tests/` 配下の既存テストを変更するこの PR を `allow-protected-change` ラベル無しで出す: `protected-paths` が検知して失敗する（正しい挙動）。ラベルを付けた再実行で成功する

## 例

検証に使う具体例。項目名は 0042 の確定名に読み替える。

### 表 A: 2 実装の一致（実装パスの意味論）

`coupling` は `check-progress-coupling.mjs` の実装パス判定、`guard` は `guard-worktree.mjs` の `classifyEdit(...).blocked`。**両列は常に同じ値になる。** 宣言は `dirs: ["src/", "app/src/"]`, `files: ["setup.sh"]` とする。

| パス `p` | coupling | guard | 根拠 |
|---|---|---|---|
| `src/math.mjs` | true | true | ディレクトリ宣言に一致 |
| `src/deep/nested/x.mjs` | true | true | 深さは問わない |
| `src2/x.mjs` | false | false | セグメント境界。文字列 prefix では true になってしまう |
| `srcx` | false | false | 同上 |
| `app/src/x.mjs` | true | true | 入れ子の宣言（2 階層）。先頭セグメント照合では false になってしまう |
| `app/other.mjs` | false | false | 入れ子の宣言の外 |
| `app/srcx/x.mjs` | false | false | 入れ子でもセグメント境界 |
| `setup.sh` | true | true | 単体ファイル宣言に完全一致 |
| `setup.sh.bak` | false | false | 完全一致でない |
| `dir/setup.sh` | false | false | 完全一致でない |
| `task/0057-x/progress.md` | false | false | 台帳 |
| `CLAUDE.md` | false | false | 宣言に無い |

同じ表を、本リポジトリの実物の宣言（`dirs: ["src/", "tests/", "tools/"]`, `files: []`）に対しても回し、`src/math.mjs`・`tests/x.test.mjs`・`tools/x.mjs` は両方 true、`task/0057-x/spec.md`・`backlog/0001-x/spec.md`・`.github/workflows/ci.yml`・`CLAUDE.md` は両方 false になる。

### 表 B: 宣言の受理・拒否の一致

`layer` は 0042 の読み取り層、`coupling` は `check-progress-coupling.mjs` の自前の読み方。**両列は常に同じ値になる。** 他の項目は妥当な値で埋める。

| 宣言 | layer | coupling | 根拠 |
|---|---|---|---|
| 実物のマニフェスト | 受理 | 受理 | — |
| `implementation.dirs: [42]` | 拒否 | 拒否 | 葉まで検査 |
| `implementation.dirs: []`, `files: []` | 拒否 | 拒否 | 実装が無い宣言 |
| `implementation.dirs: []`, `files: ["setup.sh"]` | 受理 | 受理 | 単体ファイルだけの実装は正当 |
| `implementation.files` キー無し | 拒否 | 拒否 | `?? []` で補わない |
| `implementation.dirs: ["/src/"]` | 拒否 | 拒否 | ルート始まり |
| `implementation.dirs: ["../src/"]` | 拒否 | 拒否 | `..` セグメント |
| `ledger.dir: "docs/"`, 保護エントリの prefix は `task/` のまま | 拒否 | 拒否 | 内部不整合 |
| `workId.pattern: "^\\d{4}-.+$"`（捕獲 0） | 拒否 | 拒否 | 捕獲グループ 2 つが要る |
| `workId.pattern: "("` | 拒否 | 拒否 | コンパイル不能 |

### 表 C: 既存テストと宣言経由の一致

| 操作または入力 | 期待結果 |
|---|---|
| 実物のマニフェストを写したフィクスチャで `node --test tests/progress-coupling.test.mjs tests/guard-worktree.test.mjs tests/start-task.test.mjs tests/start-task-claim.test.mjs` | すべて pass。期待値の変更は 0 件（`git diff main -- tests/` に `assert` の期待値を変える行が無い） |
| 実物のマニフェストから `tools/` を**わざと外して**同じ 4 本を実行 | `tests/progress-coupling.test.mjs` の「src/・tests/・tools/ は実装変更として数える」と `tests/guard-worktree.test.mjs` の「プライマリチェックアウトの tests/ と tools/ もブロックする」が**両方とも赤**になる。出力を進捗に貼り、マニフェストを戻す |
| `check-progress-coupling.mjs` に、`tools/x.mjs` を変えた差分と `tools/` を外した宣言を注入する | `docs-only`（素通り）を返す。**これが穴の形である。** 上の行のテストがこの穴を検知する |
| `guard-worktree.mjs` の `classifyEdit` に、プライマリの `tools/x.mjs` と `tools/` を外した宣言を注入する | `blocked: false`（素通り）。同上 |

### 表 D: CLI と hook

| 操作または入力 | 期待結果 |
|---|---|
| `node tools/check-progress-coupling.mjs main`（宣言が base にある通常の PR） | 現在と同じ判定・同じ終了コード |
| 宣言が base に無いフィクスチャで `node tools/check-progress-coupling.mjs <base>` | パスと理由を表示して終了コード 1。`docs-only` と表示しない |
| `echo '{"tool_input":{"file_path":"src/math.mjs"}}' \| node tools/guard-worktree.mjs`（プライマリ） | 終了コード 2。stderr に宣言から組んだ開始手順 |
| 同上で `file_path` を `app/src/x.mjs`、宣言に `app/src/` を足したフィクスチャ | 終了コード 2 |
| 同上で `file_path` を `setup.sh`、宣言の `files` に `setup.sh` を足したフィクスチャ | 終了コード 2 |
| 宣言を壊したフィクスチャで `file_path` を `task/0057-x/spec.md` | 終了コード 2。stderr に宣言を読めない理由 |
| 宣言を壊したフィクスチャで `file_path` を `.worktrees/feat/x/src/math.mjs` | 終了コード 0（宣言を読む前に通過） |
| `node tools/start-task.mjs --next-id` | 現在と同じ値（`--next-id` 単体の振る舞いは変えない） |
| `node tools/start-task.mjs --claim foo --in backlog` | 現在と同じ結果（候補の置き場を宣言から読む） |
| `ledger` の候補の置き場を 0 件にしたフィクスチャで `--claim foo --in backlog` | 「`--in` が不正」で確保しない |
| `grep -nE "'(src\|tests\|tools)/?'\|'task/?'\|'backlog'\|'progress\\.md'\|'spec\\.md'\|\\\\d\\{4\\}\|padStart\\(4" tools/check-progress-coupling.mjs tools/guard-worktree.mjs tools/start-task.mjs \| grep -vE ':[0-9]+:\\s*(\\*\|//)'` | 0 行（コメント行を除いてハードコードが無い） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. **ハードコードが消えている。** 「例」表 D 末尾の `grep` が 0 行を返す。利用者向け文言（`MESSAGES`・`main()` の説明・`blockMessage()`）も宣言から組み立てられており、文言の中にも上の語が直書きされていない。出力を進捗に貼る。
6. **2 実装の一致（実装パス）。** 表 A の全行について、`check-progress-coupling.mjs` の実装パス判定と `guard-worktree.mjs` の `classifyEdit` が同じ結果を返すことを、**1 本の表駆動テスト**が両実装に同じ宣言・同じパスを流して固定している。入れ子の宣言（`app/src/`）と単体ファイルの宣言（`setup.sh`）の行を含む。
7. **2 実装の一致（宣言の受理・拒否）。** 表 B の全行について、0042 の読み取り層と `check-progress-coupling.mjs` の自前の読み方が同じ受理・拒否を返すことを、表駆動テストが固定している。`[42]`・両方空・`files` 欠落・内部不整合の行を含む。
8. **宣言の内部整合が消費者を素通りしない。** `ledger.dir` を守る保護エントリが同じ prefix で存在しない宣言を注入すると、3 消費者すべてが落ちる（`start-task.mjs` は worktree を作らない）。
9. **わざと落とす検査。** 表 C の手順で、実物の宣言から `tools/` を 1 件外すと、`tools/x.mjs` を触る差分が進捗結合で `docs-only`、worktree ガードで `blocked: false` になる（穴が開く）ことを示し、そのとき `tests/progress-coupling.test.mjs` と `tests/guard-worktree.test.mjs` が**両方とも赤**になる出力を進捗に貼る。戻した後に緑になる出力も貼る。
10. **既定値で補わない（消費者側）。** 「失敗時」の型不正・欠落・両方空の各行について、3 消費者が落ちることをユニットテストが覆う。`?? []`・`?? {}`・`Array.isArray` だけの検査・`=== true` の三項式が、本作業で触った 3 本のいずれにも入っていない（`grep -nE '\?\? *(\[\]|\{\})|=== *true *\?' tools/check-progress-coupling.mjs tools/guard-worktree.mjs tools/start-task.mjs` が 0 行）。
11. **base 側から読む。** `check-progress-coupling.mjs` は merge-base の宣言を読む。候補側で宣言から `src/` を外し、同じ PR で `src/` を触って progress を更新しない差分を注入すると、base の宣言で判定されて失敗する（`docs-only` にならない）ことをテストが固定している。
12. **既存の振る舞いの保持。** `tests/progress-coupling.test.mjs`・`tests/guard-worktree.test.mjs`・`tests/start-task.test.mjs`・`tests/start-task-claim.test.mjs` の**期待値を変えていない**（変更は宣言の注入と、実物を写すフィクスチャの配線だけ）。`git diff main -- tests/` を進捗に貼り、`assert` の期待値を変えた行が無いことを示す。4 本と新規の一致テストを含めて `npm run ci` が緑。
13. **凍結改訂の標準完了条件。** この PR を `allow-protected-change` ラベル無しで出すと `protected-paths` が失敗し、ラベルを付けた再実行で成功する。両方の実行結果を進捗に貼る。
