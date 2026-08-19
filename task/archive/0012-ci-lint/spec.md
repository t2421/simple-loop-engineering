# Lint の導入

ESLint を導入し、`npm run ci` の検証にテスト以外の層を足す。

## 種別

改善

## 対象

- 場所: `package.json`（devDependency・`scripts.lint`・`ci` への組み込み）、`eslint.config.mjs`（新規）、`src/` / `tests/` / `tools/`（lint 通過に必要な修正）
- 公開面: `npm run lint`、および `npm run ci`（lint を含むようになる）

## 背景

現在の `ci` は `npm test` のみで、検証の網が計算スタイルとピクセル差分・ユニットテストに偏っている。未使用変数や未定義参照など、テストに現れない欠陥を検知する層を足す。

`package.json` の `scripts` は凍結対象のため、この変更は `specs/scripts-freeze-procedure.md` の改訂手続きに従う（この spec がその spec 化に当たる）。同 spec のマージ後に着手する。

## 仕様

- `eslint` を devDependency に追加し、フラット設定 `eslint.config.mjs` を置く。`@eslint/js` の recommended をベースに、`src/`（ブラウザ）と `tests/` / `tools/`（Node）で globals を分ける
- `scripts.lint`（`eslint .`）を追加し、`ci` を `npm run lint && npm test` とする。既存の `test` は変更しない
- 既存コードが lint を通るようにする。修正は挙動を変えない範囲に限る（ピクセル差分・全テストの結果が変わらないこと）

## 範囲外

- フォーマッタ（Prettier 等）の導入
- 型チェック（TypeScript / JSDoc チェック）の導入
- CSS の lint
- recommended を超える独自ルールの追加

## 失敗時

- lint 違反があるコードで `npm run ci`: lint が失敗し、テストに進まず終了コード非 0

## 例

| 操作または入力 | 期待結果 |
|---|---|
| `npm run ci` | lint 通過 → テスト全件 pass |
| 未使用変数を含む一時ファイルを `src/` に置いて `npm run lint` | 失敗（`no-unused-vars`） |
| 上記ファイルを消して `npm run lint` | 成功 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `npm run ci` が lint を含めて成功し、テスト件数・結果が導入前と一致する（出力を会話に貼る）。
