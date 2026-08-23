# ID 採番に予約の仕組みを足す

`node tools/start-task.mjs --next-id` は採番するだけで確保（予約）ができないため、並行する 2 者が同じ ID を得るレースがある。採番と確保を一体にする `--claim <slug>` を足す。

## 種別

改善

## 対象

- 場所: `tools/start-task.mjs` の `nextId` / `--next-id` と、新設する claim ロジック（凍結対象ではない。`tools/check-protected-paths.mjs` の保護一覧に無く、変更に `allow-protected-change` ラベルは不要）
- 公開面: CLI。`node tools/start-task.mjs --claim <slug> [--in <task|backlog>]` と、既存の `node tools/start-task.mjs --next-id`

## 背景

2026-08-22 の backlog リファインメントで、複数エージェントが同一チェックアウトで並行起草しており、あるエージェントが `backlog/0036-…/` を作成中だったため、別のエージェント（spec-author）は採番を安全に行えず依頼を差し戻した。

2026-08-23 のリファインメントで `tools/start-task.mjs` の `nextId` を実測した。実装は `fs.readdirSync` で作業ツリーの `task/`・`task/archive/`・`backlog/` を読むため、**未追跡・未コミットのディレクトリも数える**（起票時の「コミット済みしか見ない」という前提はここが誤りだったので本改訂で直した）。残る穴は 2 つである。

1. **予約が無い。** 採番（`--next-id`）とディレクトリ作成が別ステップなので、並行する 2 者が続けて採番すると同じ値を得る。2026-08-22 の差し戻しの実体はこれで、「相手がディレクトリを作り終えるまで採番できない」という直列化を人手で行った
2. **別 worktree・未マージの計画ブランチのディレクトリは見えない。** `readdirSync` はこの作業ツリーしか読まないため

## 仕様

- `--claim <slug>` は次 ID を計算し、その場で `<置き場>/<id>-<slug>/` の**空ディレクトリ**を作って確保する。置き場は `--in task`（既定）または `--in backlog`。`task/` と `backlog/` のどちらへの起草も claim できる
- 確保するのはディレクトリだけである。`spec.md` などの中身は起草側（spec-author）が置く。確保済みディレクトリは作業ツリーにあるため、以後の採番（`--next-id` / `--claim`）から見える
- 成功時、作成したディレクトリのリポジトリルートからの相対パス（例: `task/0042-foo`）を標準出力に出し、exit 0 で終わる
- slug は `/^[a-z][a-z0-9-]*$/` に合致すること（CLAUDE.md の「英小文字とハイフン」に数字を許した形）。合致しなければ何も作らない
- ディレクトリ作成は「存在すれば失敗する」作成（`fs.mkdirSync` の非 recursive 相当）で行い、この失敗を衝突として扱う。ロックファイル等は導入しない
- `--next-id` 単体の意味（作業ツリーの `task/`・`task/archive/`・`backlog/` から最大 + 1）と出力形式は変えない
- 別 worktree（`.worktrees/*`）までは走査しない。そこは docs PR のマージ順で解決する現行規約のまま
- claim のロジックは `rootDir` を引数に取る関数として export する。テストは一時ディレクトリを `rootDir` に渡して検証し、実リポジトリの ID 状態に依存しない
- 新規テストは新しいファイル（例: `tests/start-task-claim.test.mjs`）に置く。`tools/run-unit-tests.mjs` の列挙規則（`tests/*.test.mjs` から `calc-page.test.mjs` を除く）が自動で拾うため、凍結対象である `tools/run-unit-tests.mjs`・既存の `tests/start-task.test.mjs` はどちらも変更しない

## 範囲外

- 番号空間の変更（`task/` と `backlog/` の分離）
- 既存 ID の付け替え
- 別 worktree・未マージブランチの走査
- 同時実行で衝突（EEXIST）したときの自動再試行（失敗を報告し、再実行に委ねる）

## 失敗時

- 同じ slug の作業ディレクトリ（`NNNN-<slug>`）が `task/`・`task/archive/`・`backlog/` のいずれかに既にある: 何も作らず exit 非 0 で衝突を報告する
- slug が `/^[a-z][a-z0-9-]*$/` に合致しない（大文字・`_`・先頭ハイフン等）: 何も作らず exit 非 0
- `--in` の値が `task` / `backlog` 以外: 何も作らず exit 非 0
- ID 計算とディレクトリ作成の間に他者が同じ ID を確保していた（作成が EEXIST で失敗）: 何も作らず exit 非 0。再実行すれば次の ID を得る

## 例

テストは一時ディレクトリを `rootDir` として export された関数を呼ぶ。ID は一時ディレクトリの初期状態から相対的に決まるため、実リポジトリの状態に依存しない。

| 操作または入力 | 期待結果 |
|---|---|
| `backlog/0041-x/` だけを置いた一時ディレクトリで `--claim foo --in backlog` 相当を実行 | `backlog/0042-foo/` が作られ、出力は `backlog/0042-foo`。続く `--next-id` 相当は `0043` を返す |
| 同じ初期状態から `--claim a` と `--claim b` を続けて実行（`--in` 省略） | `task/0042-a/` と `task/0043-b/` が作られる（異なる ID を得る） |
| `--claim foo --in backlog` の成功後、同じ slug で `--claim foo` を再実行 | 何も作らず exit 非 0（衝突を報告） |
| `--claim Foo`（大文字を含む slug） | 何も作らず exit 非 0 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `--claim` が確保した ID は以後の採番から見える。「例」の 1 行目・2 行目が、一時ディレクトリを `rootDir` に渡すユニットテストで再現する。
6. `--next-id` 単体の振る舞いが変わっていない。既存の `tests/start-task.test.mjs` を変更せずに `npm run ci` が通る。
7. 新規テストが `tests/*.test.mjs`（`calc-page.test.mjs` 以外）として置かれ、`node tools/run-unit-tests.mjs` の実行対象に含まれて通る。
