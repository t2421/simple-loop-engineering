# progress への共通検証出力の貼付を `lint-docs` で検知する

`loop-core/ledger/lint-docs.mjs` に「progress の本文に共通の検証（`npm run ci`）の出力を貼らない」という CLAUDE.md の規約を機械的に検査する項目を足す。

## 種別

改善（`loop-core/ledger/lint-docs.mjs` への検査項目の追加）

## 対象

- 場所: `loop-core/ledger/lint-docs.mjs`（純関数 `checkProgressNoSharedVerification` を 1 つ足し、`checkProgress` から呼ぶ）。テストは `tests/lint-docs-progress-verification.test.mjs` を新しく足す。既存の `tests/lint-docs.test.mjs` は書き換えない
- 公開面: `npm run lint:docs`（`node loop-core/bin/loop.mjs lint-docs`。`npm run ci` が呼ぶ）。違反があれば既存の形式違反と同じくパスと理由を列挙して終了コード 1
- 凍結対象との関係: `loop-core/ledger/lint-docs.mjs` は `GATE_HELPERS` にも CLAUDE.md「変えてはいけないもの」にも入っていない。`tests/` は保護対象だが、新しいテストファイルの追加は `appeared` としてガードが違反にしない。**既存の `tests/lint-docs.test.mjs` を書き換えない限り `allow-protected-change` ラベルは不要。** 既存テストの改訂はこの作業の範囲外

## 背景

CLAUDE.md は同じことを 2 か所で定めている。

- 「共通の検証」節: 「progress には書かない」
- 「進捗」節: 「構文チェック・テスト実行など全作業共通の検証は progress に書かない。`npm run ci` が強制する」

しかし機械的な検査が無く、守られているかは書き手の記憶に依存している。

0043 の切り出し後、lint の所在は `tools/lint-docs.mjs` ではなく `loop-core/ledger/lint-docs.mjs` である。

### 実測（2026-09-03）

この規約は実際に繰り返し破られている。同一セッション内で `0041`・`0053`・`0054` の 3 つの進捗すべてに、共通の検証の出力（ユニットテストの件数集計行 `# tests N  # pass N  # fail 0`、docs lint の成功メッセージ `docs の形式違反はありません（N 件の作業ディレクトリを確認）。`）が貼られていた。

- `0041`: Verify (外部) の `codex-reviewer` の指摘で気づいて削った
- `0053`・`0054`: アーカイブ済みのまま残っている（`task/archive/0054-freeze-hook-wiring/progress.md` には `npm run ci` 相当の集計行と docs lint 成功メッセージが 3 か所ある）

**気づいたのは人（レビュアー）であって機械ではない。** 3 件のうち検知できたのは 1 件だけである。これは「決定論チェックで真偽が決まる指摘は、指摘ではなくテスト追加の提案として返す」という `codex-reviewer` の規約が想定している形そのものである。

### 偽陽性の危険

検知パターンを広く採ると、正当な作業固有の証跡まで違反にする。

- 作業固有の検証（その作業の完了条件に対する grep の結果、そのタスク専用のテストファイルだけを `node --test` した出力、RED → GREEN の推移）は**貼ってよい**し、CLAUDE.md「報告の作法」はむしろ貼ることを求めている。実際 `0053` の進捗にある `# tests 6  # pass 6  # fail 0` は、そのタスク専用テストの単体実行の集計であり、違反ではない
- 検知パターンそのものを文章として書いた行も引っかかる。実際 `0041` の進捗では、この提案の説明文に検知パターンを literal で書いたために自分で引っかかる状態が一度生まれ、書き方を変えて回避した。この作業の `progress.md` も同じ罠を踏みうるので、試行ログには検知対象そのものの成功文や全件集計行を貼らない
- 共通検証の出力はコードフェンスの中に貼られるのが普通なので、既存の走査と同じく `linesOutsideFences` の上に載せると何も検知できない。この検査だけはフェンスの中と外の両方を見る。既存の設計方針（「すべての走査を `linesOutsideFences` の上に載せ、偽の違反を出さない」）との衝突は JSDoc に明記する

### 出典

`task/archive/0041-backlog-freshness` の Verify (外部) で `codex-reviewer` が「テスト追加の提案」として返したもの。

**実測で分かった難しいケースが 1 つある（2026-09-03）。** 共通の検証の出力は
コードフェンスの中に貼られるとは限らない。`task/archive/0053-stop-hook-block-exit-code/progress.md:66`
は**フェンスの外の散文**に `` `npm run ci` は `# tests 471 / # pass 471 / # fail 0` `` を埋め込んでいる。
`loop-core/ledger/lint-docs.mjs` の `linesOutsideFences` で確かめた（38・51・80 行目はフェンスの中、66 行目は外）。

したがって「フェンスの中だけを見る」実装でも「外だけを見る」実装でも取りこぼす。
**両方を見たうえで、作業固有の証跡と切り分ける。**

## 仕様

`loop-core/ledger/lint-docs.mjs` に、progress の Markdown を受け取って違反理由の配列を返す純関数 `checkProgressNoSharedVerification(progressMarkdown)` を足す。`checkProgress` から呼び、`relPath` が `task/archive/` で始まる進捗には適用しない。`lintDocs` の結果には既存の形式違反と同じ `{ path, reason }` で載せる。

この検査だけはコードフェンスの内側と外側の**両方**を見る。既存の走査は `linesOutsideFences` の上に載せてフェンス内の偽違反を避けるが、共通検証の貼付はフェンス内が本体である。例外であることを関数の JSDoc に書く。

検知するのは **dump（出力そのもの）** だけである。コマンド名だけの言及は違反にしない。進捗テンプレートの「`npm run ci` が強制する」を落としてはいけない。

違反にする dump は次の 2 種に限る。

1. **docs lint の成功文。** `docs の形式違反はありません（` + 1 つ以上の数字 + ` 件の作業ディレクトリを確認）。` に一致する行。作業固有の検証にはならないので、文脈を問わず違反とする
2. **`npm run ci` の集計クラスタ。** 同一行または連続行に `# tests N` と `# pass N` と `# fail N` がある形（区切りは空白または `/`）。次のいずれかを満たすとき違反とする
   - 同じ文脈に `npm run ci` または `npm run test:unit` がある
   - `N`（`# tests` の値）が公開定数 `SHARED_UNIT_TEST_COUNT_FLOOR`（`50`）以上である。コマンド名が無い全件貼付（`0054` の `# tests 482` / `# tests 484`）を拾う

文脈の単位:

- フェンス内: そのフェンス全体
- フェンス外: 同じ試行ログ項目（`- ` で始まる 1 項目と、次の項目または見出しまでの継続行）または同じ段落

**作業固有の `node --test` 証跡は違反にしない。** 同じ文脈に `node --test` とテストファイルパス（`*.test.mjs`、または `tests/` 配下の具体ファイル）がある集計クラスタは、`N` の大小を問わず免除する。ファイル指定の無い素の `node --test`（全スイート実行）は免除しない。

`# tests` を欠く断片（例: `# pass 8 / # fail 0` だけ）は集計クラスタではない。完了条件に対する `grep` の出力、e2e の該当テストだけの出力、dump 形状を含まない説明文も違反にしない。

説明文が dump 形状そのものを literal で含むなら、それは貼付であり違反である。回避は `0041` と同じくパターンを分割して書くこと。「フェンスの外は検査しない」は採らない。

違反理由の文は行番号を含め、既存の `findBadCheckboxes` の報告形式（`N 行目: …`）に揃える。判定は純関数として公開し、テストは一時ディレクトリにレイアウトを組んで `lintDocs()` を呼ぶ既存の方式に揃える。

## 範囲外

- アーカイブ済み進捗（`task/archive/`）への遡及適用。`0053`・`0054` の貼付は残す。検査対象から `task/archive/` を外す（パス接頭辞。個別列挙はしない）
- CLAUDE.md の規約そのものの変更
- 進捗以外のファイルへの適用。spec・backlog・PR 本文・会話は対象にしない。**会話には貼るのが正しい**（CLAUDE.md「報告の作法」）
- 旧レイアウト（`progress/`）への適用
- 作業固有の検証の出力を progress から減らす方向の規約
- 既存 `tests/lint-docs.test.mjs` の改訂
- `loop-core/VERSION` の更新
- コマンド名だけの言及（`npm run ci` / `npm run lint` / `npm run lint:docs` / `npm run test:unit`）を違反にすること

## 失敗時

- progress 本文（フェンスの中でも外でも）に共通検証の dump がある: `npm run lint:docs` がパスと行番号と理由を列挙して終了コード 1 で終わる。`npm run ci` も失敗する
- dump 形状そのものを literal で含む説明文: 貼付として違反する。分割して書けば違反にならない。フェンスの外を見ない、は採らない
- `task/archive/` 配下の進捗に dump がある: 違反にしない（範囲外）。既存アーカイブの貼付でこの検査を入れた PR が赤くなってはいけない

## 例

検証に使う具体例。一時ディレクトリにレイアウトを組んで `lintDocs()` を呼ぶ。

| 操作または入力 | 期待結果 |
|---|---|
| progress のフェンス内に `# tests 484  # pass 484  # fail 0` と `docs の形式違反はありません（53 件の作業ディレクトリを確認）。` がある（`0054` の形） | `npm run lint:docs` が終了コード 1。理由に `progress.md` のパスと行番号を含む |
| progress のフェンス内に `node --test tests/foo.test.mjs` の出力として `# tests 6  # pass 6  # fail 0` がある（`0053` の形） | 違反なし |
| progress のフェンス内に TAP 出力だけがあり `# tests 6  # pass 6  # fail 0` がある（`node --test` 行は無い。`0053` の実物） | 違反なし（`N` は floor 未満で、共通コマンドも無い） |
| progress のフェンス内に完了条件に対する `grep` の出力がある | 違反なし |
| progress の本文（フェンス外）に「共通の検証の出力は貼らない」と説明で書いた | 違反なし |
| progress の本文（フェンス外）の散文に `` `npm run ci` は `# tests 471 / # pass 471 / # fail 0` `` と埋め込んだ（`task/archive/0053-stop-hook-block-exit-code/progress.md:66` の形） | 違反（フェンスの外にもある。フェンス内だけを見る実装では取りこぼす） |
| progress のフェンス内に `# tests 484  # pass 484  # fail 0` だけがある（コマンド名は無い） | 違反（`N` が floor 以上の全件集計） |
| progress の本文にテンプレートどおり「`npm run ci` が強制する」とだけある | 違反なし（コマンド名だけの言及） |
| `task/archive/` 配下の progress に上の dump がある（既存の `0054` を含む） | 違反なし（範囲外。パス接頭辞で外す） |
| spec.md に検知パターンを literal で書いた（このファイル） | 違反なし（progress 以外は対象にしない） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `loop-core/ledger/lint-docs.mjs` に `checkProgressNoSharedVerification` が公開され、`checkProgress` から呼ばれる。`relPath` が `task/archive/` で始まる進捗には適用しない。`grep -n "checkProgressNoSharedVerification" loop-core/ledger/lint-docs.mjs` の出力で定義と呼び出しを提示できる。
6. この検査はフェンスの内側と外側の両方を見る。関数の JSDoc に、既存走査は `linesOutsideFences` の上に載せるがこの検査だけは例外である旨がある。`grep` の出力で該当箇所を提示できる。
7. 「例」の各行が新規ファイル `tests/lint-docs-progress-verification.test.mjs` で、一時ディレクトリ上の `lintDocs()` 呼び出しとして網羅され、`node --test tests/lint-docs-progress-verification.test.mjs` が pass する。既存の `tests/lint-docs.test.mjs` は変更しない。
8. 作業固有の `node --test <テストファイル>` 証跡を違反にしない。「例」2 行目が pass することで検証する。
9. リポジトリの現行 docs に対して `npm run lint:docs` が終了コード 0 で終わる。`task/archive/` の既存貼付（`0053`・`0054`）で赤くならない。
10. 実装差分（進捗を除く）は `loop-core/ledger/lint-docs.mjs` と `tests/lint-docs-progress-verification.test.mjs` に限る。`tests/lint-docs.test.mjs`・`package.json` の `scripts`・凍結リスト・`loop-core/VERSION`・CLAUDE.md を変えていないことを `git diff main --stat` で示す。
