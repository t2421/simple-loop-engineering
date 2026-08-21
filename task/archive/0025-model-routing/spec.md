# 作業の複雑度によるモデルルーティング

progress に複雑度メタ項目を追加し、`tools/start-task.mjs` が固定の対応表で実装に使うモデルを出力するようにする。

## 種別

機能追加

## 対象

- 場所: `task/TEMPLATE-progress.md`（**Complexity** メタ項目の追加）、`tools/start-task.mjs`（対応表と出力）、`tests/start-task.test.mjs`、`.claude/agents/spec-author.md`（起草時の付与）、`tools/lint-docs.mjs`（enum 検証の追随）、`CLAUDE.md`
- 公開面: `node tools/start-task.mjs` の出力に推奨モデルが加わる。progress のメタ情報に **Complexity** が加わる

## 背景

すべての作業を同じモデルで実装するのはコストと品質の両面で最適でない。単純な作業は軽いモデルで足り、難しい作業はハイエンドモデルに任せたい。ただしモデル選択を毎回セッションの裁量で行うと、選択自体が確率論的なブレの源になる。

そこで等級付けを「spec 起草時に 1 回だけ」（`spec-author` が付与し、docs PR で人間がレビュー・修正できる）とし、以後のルーティングはコード内の固定対応表の表引きにする。確率論的な判断は 1 点に隔離され、人間の承認を通る。

`task/TEMPLATE-progress.md` は保護対象だが、この変更は検証を弱めないメタ項目の追加である。CLAUDE.md「凍結を解いて改訂するとき」の手続きに従い、PR に `allow-protected-change` ラベルを付けて人間がマージする。

## 仕様

- `task/TEMPLATE-progress.md` のメタ情報に `- **Complexity:** \`<S | M | L>\`` を追加する（Target Spec / Branch / PR / Status の並びの末尾）。意味も冒頭の説明に 1 行足す
  - S: 単一ファイルの小変更・定型作業
  - M: 複数ファイルにまたがる通常の機能追加・修正
  - L: 設計判断・凍結改訂・横断的変更を含む作業
- 対応表は `tools/start-task.mjs` 内の定数とする: `S → haiku`、`M → sonnet`、`L → fable`。表の変更はコード変更として PR レビューを通る
- `node tools/start-task.mjs` は選択した作業の **Complexity** を読み、対応するモデル名を ID・パスと併せて出力する。実装をサブエージェントへ委任するときは、このモデル名を Agent 呼び出しの model に渡す
- **Complexity** が無い progress（既存分）は `M` とみなす（後方互換）。不正値は選択時に非 0 で失敗する
- `.claude/agents/spec-author.md` に「progress 起草時に Complexity を付与する。判断基準は上記 S/M/L の定義」を追記する
- `tools/lint-docs.mjs` に Complexity の enum 検証（存在すれば `S | M | L`）を追加する
- CLAUDE.md「進捗」節に Complexity の 1 行を足す

## 範囲外

- レビュー役のモデルルーティング（エージェント定義で固定済み）
- 実装途中での等級の自動変更（変えたくなったら progress を編集し PR レビューを通す）
- コスト・トークンの計測

## 失敗時

- 選択した作業の **Complexity** が `S | M | L` 以外の値: `tools/start-task.mjs` は worktree を作成せず非 0 で終了する

## 例

| 操作または入力 | 期待結果 |
|---|---|
| Complexity `S` の作業を `start-task` で選択 | 出力に `haiku` が含まれる |
| Complexity `L` の作業を `start-task` で選択 | 出力に `fable` が含まれる |
| Complexity 未記載の既存 progress の作業を選択 | 出力に `sonnet` が含まれる（M 扱い） |
| Complexity に `XL` と書かれた作業を選択 | 何も作成せず非 0 で終了する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/start-task.test.mjs` のユニットテストで網羅されている。`task/TEMPLATE-progress.md` の変更は `allow-protected-change` ラベルの PR で行われている。
