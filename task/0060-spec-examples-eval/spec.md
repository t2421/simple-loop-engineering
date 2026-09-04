# spec「例」の機械評価

spec の「例」表に書いたコマンドをリポジトリルートで機械実行し、終了コード 0 と `grep -c` 型の stdout 完全一致で照合する。完了の自己申告（会話への grep 貼付）だけに依存しない。

## 種別

改善

## 対象

- 場所: 新設 `tools/check-examples.mjs`（appeared。`tools/` 直下の新規ファイル。`loop-core/gate/check-protected-paths.mjs` の `GATE_HELPERS` に無い）。配線先は `loop-core/ledger/archive.mjs`（2026-09-04 実測で `GATE_HELPERS` に入っていない）。恒久検証は新設 `tests/check-examples.test.mjs`（`tests/` への新規追加は appeared。`tools/run-unit-tests.mjs` の既存列挙 `tests/*.test.mjs` で `npm run ci` が自動実行する）
- 公開面: `node tools/check-examples.mjs <id>-<slug>`。指定した作業の spec「例」を機械実行し、終了コードと照合結果を出す
- 凍結対象との関係: 新設 2 ファイル（`tools/check-examples.mjs`・`tests/check-examples.test.mjs`）はいずれも appeared であり、`allow-protected-change` ラベルは不要。`loop-core/bin/loop.mjs` にコマンドを足さない（`GATE_HELPERS`。足すと凍結改訂）。`package.json` の `scripts`・`tools/run-unit-tests.mjs`・既存 `tests/*.test.mjs`・`task/archive/0052-loop-port-catalog-revision/spec.md` は触らない

## 背景

実測: 2026-09-04 — origin/main `f845eb9` のリポジトリルートで `grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md` は `18` を返し、0052 の他の `grep -c` も 0052 の表どおり（`^出典: ` は 5 / 0044 出典は 4 / 0052 出典は 1 / `**方針。**` は 16）。`allow-protected-change` の `grep -c` は現行 4 で、0052 の期待は「3 以上」＝定性行である。`loop-core/gate/check-protected-paths.mjs` の `GATE_HELPERS` に `loop-core/ledger/archive.mjs` は入っていない。

「例」表はすでに `/goal` 型（0052 の grep 表）である。Anthropic の形では、完了は実装者ではなく別の評価役と決定論的な基準で見る。現状は実装者が grep を貼って Done を名乗れる。例が落ちていてもアーカイブを止めない。

必須にする範囲は次のとおり確定する。incomplete な backlog（「例」が未確定のまま）は必須にしない。候補を置いただけで検査が赤くならないよう、対象外と明示して終了コード 0 で通す。

配線は `loop-core/ledger/archive.mjs` だけに行う。アーカイブ直前に同じ作業の「例」を検査し、検査が非 0 なら何も変更せずアーカイブしない。これが「例が落ちていても Done を名乗れる」穴を塞ぐ。`package.json` の `scripts`（`ci`）へは配線しない。凍結スクリプトの改訂になり、この作業は凍結改訂を含まないためである。凍結手続きも `allow-protected-change` も不要。

## 仕様

- 「例」表のコマンドはリポジトリルートから実行する
- 対象の作業ディレクトリは `task/<id>-<slug>/`・`task/archive/<id>-<slug>/`・`backlog/<id>-<slug>/` から探す
- 評価する行は次の 3 種とする
  1. 入力がシェルコマンド（バッククォートで始まる呼び出し）で、期待が整数 1 行（`grep -c` 型）: 終了コード 0 かつ stdout（末尾改行を除く）がその整数と完全一致すれば合格
  2. 期待が「終了コード 0」: 終了コード 0 なら合格
  3. 期待が「終了コード非 0」: 終了コード非 0 なら合格
- 解釈できない行（手順文、定性的な「5 行。この順に…」「3 以上」、`git diff` の説明文など）は、推測して合否を付けない。スキップし、対象外と明示する。これで落とさない。0052 の「例」12 行には定性行が多く、落とすと 0052 の期待値を書き換えたくなるが、0052 は凍結で範囲外である
- incomplete な backlog spec（「例」が `未確定（incomplete）。昇格時に埋める。` または `<昇格時に記入>` のまま）は必須対象にしない。対象外と明示して終了コード 0
- 評価可能な行が 0 件の spec は検査成功（終了コード 0）とする。既存 `tests/archive.test.mjs` の fixture spec は `# <name> の仕様\n` だけで「例」表が無く、これを落とすと既存 archive テストが壊れる。既存 `tests/archive.test.mjs` は凍結（`tests/` は append-only）なので書き換えず、archive 配線のケースは `tests/check-examples.test.mjs` に足す
- **期待値を書き換えて検査を通さない。** 例の期待結果は完了条件の一部であり、通すために変えるのは検証を弱める
- `loop-core/ledger/archive.mjs` はアーカイブ直前に同じ作業の「例」を検査し、検査が非 0 なら何も変更せずアーカイブしない（終了コード非 0）
- 評価役は表のコマンドそのものを回す（親が貼った出力の再実行ではない）

## 範囲外

- 人間のマージを機械で置き換えること
- Verify (外部) のレビュアーがサンドボックス内で `npm test` / `npm run ci` を再実行すること（0036 の対処を戻さない）
- アーカイブ済みの 0052 の spec・期待値（`18` や「3 以上」を含む）を書き換えること（凍結対象。読むだけ。検査の最初の対象にする）
- 「例」が手順文だけでコマンドになっていない既存 spec を、この作業で全部コマンド化すること
- `package.json` の `scripts` と `loop-core/bin/loop.mjs` への配線
- 既存テスト（`tests/archive.test.mjs` を含む既存 `tests/*.test.mjs`）の改訂

## 失敗時

- コマンドが非 0、または `grep -c` 型の stdout が期待と違う: 終了コード非 0。どの行がどう違ったかを出す。期待値は書き換えない
- 対象の作業ディレクトリが `task/<id>-<slug>/`・`task/archive/<id>-<slug>/`・`backlog/<id>-<slug>/` のどれにも無い: 黙って通さず、パスと理由を出して終了コード非 0
- 対象 spec の「例」が未確定（backlog の incomplete）: 必須にしない。対象外と明示して終了コード 0
- 期待結果の解釈ができない行: 推測して合否を付けない。スキップし、対象外と明示する。これで落とさない
- 評価可能な「例」が失敗している作業に `node loop-core/bin/loop.mjs archive <id>-<slug>` を実行: 何も変更せず終了コード非 0

## 例

リポジトリルートで実行する。期待値は 2026-09-04 の実測（origin/main `f845eb9`）と 0052 の表に合わせる。

| 操作または入力 | 期待結果 |
|---|---|
| `grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md` | stdout が `18`。終了コード 0 |
| `node tools/check-examples.mjs 0052-loop-port-catalog-revision` | 評価可能な行（`grep -c` 型と終了コード指定）をルートから実行し、0052 の期待と一致すれば終了コード 0。定性行はスキップし落とさない |
| 上のうち評価対象の `grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md` | stdout が `18`。一致しなければ検査は終了コード非 0。期待値は書き換えない |
| `node tools/check-examples.mjs 0046-ci-evidence-freshness` | incomplete backlog。必須にしない。対象外と明示して終了コード 0 |
| `node tools/check-examples.mjs 0099-missing` | 終了コード非 0。ディレクトリが無い旨を出す |
| 期待結果を書き換えて検査を通す | やらない。検査は落ちたまま |
| 評価可能な「例」が失敗している作業を `node loop-core/bin/loop.mjs archive <id>-<slug>` | 何も変更せず終了コード非 0 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `tools/check-examples.mjs` が公開され、`node tools/check-examples.mjs <id>-<slug>` で呼べる。
6. 「例」表の各行がテストまたは再現手順で同じ結果になる（0052 は終了コード 0、0046 は終了コード 0、0099 は終了コード非 0、`grep -c '^### 2\.' .claude/skills/loop-port/SKILL.md` は stdout `18`）。
7. 「失敗時」どおりに振る舞う。不一致は終了コード非 0 でどの行かを示し、期待値を書き換えない。欠落ディレクトリは終了コード非 0。incomplete な backlog と定性行は落とさない。
8. `loop-core/ledger/archive.mjs` が、評価可能な「例」の検査が失敗した作業をアーカイブしない（何も変更せず終了コード非 0）。評価可能な行が 0 件の spec はアーカイブを止めない。
9. `package.json` の `scripts`、`loop-core/bin/loop.mjs`、`tools/run-unit-tests.mjs`、既存 `tests/*.test.mjs`、`task/archive/0052-loop-port-catalog-revision/spec.md` を変えていない（`git diff main --stat` で確認する）。`allow-protected-change` ラベルは不要。
10. `tests/check-examples.test.mjs` が「例」と「失敗時」の各ケースを検証し、`tools/run-unit-tests.mjs` の既存列挙（`tests/*.test.mjs`）によって `npm run ci` から走る。
