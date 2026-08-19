# read-only なブラウザキャッシュでの Playwright セットアップ

`tools/setup-playwright.mjs` が、書き込めない `PLAYWRIGHT_BROWSERS_PATH` でも、すでに揃っていれば何もせず通るようにする。

## 種別

バグ修正

## 対象

- 場所: `tools/setup-playwright.mjs`
- 公開面: `npm test` の `pretest`（成功する環境が増えるだけで、使い方は変わらない）

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

`scripts-freeze-procedure`（PR #16）で、テスト内にあった Chromium の自己インストール分岐を `tools/setup-playwright.mjs` へ移した。当初は `chromium.executablePath()` の存在で導入済みを判定していたが、それが指すのはフル Chromium で、`chromium.launch()` が実際に使うのは `chromium_headless_shell` である。shell だけ欠けた部分キャッシュを「導入済み」と誤判定して素通りする穴があったため、自前判定をやめて `npx playwright install chromium` を無条件に実行する形にした。

その結果、別の退行が入った。**`PLAYWRIGHT_BROWSERS_PATH` が read-only（コンテナにマウントされたブラウザ層など）で、かつ中身は完全に揃っている環境で、`pretest` が失敗してテストが始まらない。** Playwright の installer は、全ての成果物が存在していても `__dirlock` を取り `.links` にエントリを書くためである。移設前のヘルパーは先に launch を試し、成功すれば installer を呼ばなかったので、このケースは通っていた。

`specs/archive/scripts-freeze-procedure.md` の「対象」は「素の checkout で `npm ci && npm run ci` が通ることも不変」と述べており、そこに対する退行にあたる。`archive/scripts-freeze-procedure` の 3 回目レビュー（15:30）での指摘。

このリポジトリの CI（`ubuntu-latest`、書き込み可能なランナーで `npx playwright install --with-deps chromium` を実行）では起きない。実害が出るのは、ブラウザ層を read-only でマウントするコンテナ実行に移したときである。

足りない判断:

- 実際にその実行形態を採るのか。採らないなら直す価値は薄い
- 判定を「headless shell の実体を直接見る」にするか、「まず launch を試す」に戻すか

## 仕様

変更後に満たしたい振る舞い（検証可能な命題に落とすのは昇格時）。

- 中身が揃っている read-only な `PLAYWRIGHT_BROWSERS_PATH` で `npm test` が通る。`pretest` は何も書き込まない
- headless shell だけ欠けた部分キャッシュは、いまと同じく検知して補完する（PR #16 で塞いだ穴を再び開けない）
- 導入が必要かつ書き込める環境では、いまと同じく導入する
- 導入に失敗したら、いまと同じくエラーを表示して終了コード非 0 で終わる。無言でスキップしない

## 範囲外

- `.github/workflows/ci.yml` の `--with-deps` ステップの変更
- Playwright 以外のブラウザランナーへの対応
- `package.json` の `scripts` の変更（`pretest` の追加は済んでいる）

## 失敗時

未確定。候補:

- read-only かつ中身が欠けている: 導入できないので失敗する（無言でスキップしない）

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| 中身が揃った read-only の `PLAYWRIGHT_BROWSERS_PATH` で `npm test` | 通る。`pretest` は書き込まない |
| headless shell だけ欠けた書き込み可能なキャッシュ | 検知して補完する |
| 空で書き込めないキャッシュ | 失敗する。終了コード非 0 |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
