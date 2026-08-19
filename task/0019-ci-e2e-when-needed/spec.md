# GitHub CI で e2e を必要なときだけ回す

計算ページに影響しない PR では Playwright の導入と e2e を回さず、`npm run ci` は lint とユニットテストの常時ゲートにする。

## 種別

改善

## 対象

- 場所: `package.json` の `scripts`、`.github/workflows/ci.yml`、`tools/e2e-needed.mjs`（新規）、`tools/run-unit-tests.mjs`（新規）、`CLAUDE.md`（「共通の検証」「見た目」）
- 公開面: `npm run ci`（lint + ユニット）、`npm run test:e2e`（Chromium + `tests/calc-page.test.mjs`）、GitHub の `verify` / `e2e` ジョブ

## 背景

GitHub CI の `verify` は、差分が計算ページに触れなくても毎回 `npx playwright install --with-deps chromium` したうえで `npm run ci` を呼ぶ。`ci` は `pretest` で Chromium を見に行き、`node --test` が `tests/calc-page.test.mjs` まで拾う。0017 / 0018 のようなツール・docs の PR でも、この導入が一番重い。

`npm run ci` の中身を変えないまま CI だけ別コマンドにすると、速い経路では検証ステップから `ci` が消える。凍結の意図（`npm run ci` を外して通すな）に反する。なので `ci` を「常に安いゲート」へ再定義し、e2e は別ジョブにする。

これは凍結対象（`scripts` とワークフロー）の改訂である。検証を弱めない改訂としてこの spec に書き、人間が `allow-protected-change` でマージする（`scripts-freeze-procedure`）。e2e は計算ページを壊しうる差分と `main` への push では今までどおり回る。`tests/calc-page.test.mjs` のアサーションは変えない。

## 仕様

- `ci` は `lint` とユニットテストだけを回す。Chromium を導入しない
- ユニットテストは `tests/*.test.mjs` から `calc-page.test.mjs` を除いたもの。列挙は `tools/run-unit-tests.mjs` が行い、新しいユニットテストを `scripts` に足さなくてよい
- `test:e2e` は Chromium を導入したうえで `tests/calc-page.test.mjs` を回す。`pretest`（`npm test` に紐づくもの）は置かない。導入は `pretest:e2e` が担う
- `test` はユニットのあと e2e を回す（ローカルで全件を一発で走らせる経路）
- GitHub の `verify` ジョブは `npm run ci` を呼ぶ。Playwright 導入ステップは持たない
- GitHub の `e2e` ジョブは毎回起動する（required check が skipped のまま PR を塞がないため）。高いステップ（`npm ci`、`playwright install --with-deps chromium`、`npm run test:e2e`）は次のときだけ実行する
  - イベントが `push`（`main` への push。パス判定の最終バックストップ）
  - イベントが `pull_request` で、base との差分が e2e 対象パスを含む
- e2e 対象パスは次のとおり。移動は移動元・移動先の両方を見る
  - `src/` 配下
  - `tests/calc-page.test.mjs`
  - `tools/setup-playwright.mjs`
  - `package.json` / `package-lock.json`
  - `progress/` 配下のファイル名が `calc-page.` で始まるもの
  - `task/` 配下のファイル名が `calc-page.` で始まるもの
- 判定は `tools/e2e-needed.mjs` が `git diff` を見て行う。サードパーティの path-filter アクションは使わない
- 差分が取れないときは間引かず e2e を回す（素通りしない）
- CLAUDE.md の「共通の検証」は引き続き `npm run ci`。見た目のテストは `npm run test:e2e` とし、GitHub は上の条件で回す

## 範囲外

- ローカルの Verify ループから e2e を機械的に外すこと（エージェントが `npm run ci` だけ走るのは、再定義後は意図どおり軽い）
- `tests/calc-page.test.mjs` のアサーション・期待値の変更
- Playwright のブラウザを Chromium 以外に増やすこと
- `0015-playwright-setup-readonly-cache`（read-only なブラウザ層）
- GitHub の required checks / branch protection の設定変更

## 失敗時

- `node tools/e2e-needed.mjs` に base ref が無い: 使い方を表示して終了コード非 0
- base との差分が取れない（shallow clone 等）: `needed=true` として e2e を回す（間引かない）。終了コードは 0
- e2e が必要なのに Chromium 導入や `test:e2e` が失敗: ジョブ失敗

## 例

| 操作または入力 | 期待結果 |
|---|---|
| 差分が `tools/archive.mjs` だけの PR | `e2eNeeded` は false。CI の e2e ジョブは Playwright を導入しない |
| 差分が `src/calc.css` を含む PR | `e2eNeeded` は true |
| 差分が `src/math.mjs` を含む PR | `e2eNeeded` は true |
| 差分が `tests/calc-page.test.mjs` を含む PR | `e2eNeeded` は true |
| 差分が `tests/add.test.mjs` だけの PR | `e2eNeeded` は false |
| 差分が `package.json` を含む PR | `e2eNeeded` は true |
| 差分が `task/archive/0003-calc-page/calc-page.png` を含む PR | `e2eNeeded` は true |
| 差分が `task/0017-guard-task-paths/spec.md` だけの PR | `e2eNeeded` は false |
| `npm run ci` | lint 通過 → ユニットテスト pass。`tests/calc-page.test.mjs` は走らない |
| `npm run test:e2e` | `tests/calc-page.test.mjs` が pass |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `tests/e2e-needed.test.mjs` が「例」のパス判定各行を網羅する。`npm run ci` の出力に `calc-page` が出ない。`tests/calc-page.test.mjs` が変更前と byte 単位で同一である。実装 PR に `allow-protected-change` ラベルがある。
