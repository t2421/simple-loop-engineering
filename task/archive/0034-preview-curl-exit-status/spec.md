# preview 検証で curl の終了ステータスもゲートにする

`.github/workflows/preview.yml` の `Verify deployed content` が、HTTP コードに加えて curl 自体の終了ステータスも検査するようにする。

## 種別

改善

## 対象

- 場所: `.github/workflows/preview.yml` の `Verify deployed content` ステップ（凍結対象。改訂は CLAUDE.md「凍結を解いて改訂するとき」に従う）
- 公開面: なし（CI の preview ジョブの内部検証。使い方は変わらない）

## 背景

現在の検証は次の形で HTTP コードだけを見ている。2026-08-22 の backlog リファインメントで `.github/workflows/preview.yml:104-105` が今もこの形のままで `CURL_STATUS` が無いことを実測確認した。

```sh
HTTP_CODE="$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 \
    -o downloaded-calc.html -w '%{http_code}' "$URL/calc.html" || true)"
if [ "$HTTP_CODE" != "200" ]; then ...
```

`|| true` が curl 自体の非 0 終了を捨てるため、「HTTP 200 が返り `-w '%{http_code}'` は `200` を印字するが、curl は `CURLE_PARTIAL_FILE`（18）等で非 0 終了する」という転送失敗を見逃す。

ただし影響は狭い。現実的な転送失敗（切断・タイムアウト・書き込み失敗）は本文が欠けるので、後段の `diff -u src/calc.html downloaded-calc.html` が捕まえる。抜けるのは「本文は完全だが Content-Length が誤っている」ような極めて狭い場合に限られる。

経緯: 旧実装（`0032` 以前）は curl の終了ステータスをゲートにしていた。`0032-preview-verify-redirect` でゲートを `%{http_code}` の 200 完全一致へ移した結果、そのシグナルを 1 つ手放した形になっている。両方を要求すれば元のシグナルを取り戻せる。

出典: `0032-preview-verify-redirect` の外部レビュー（`codex-reviewer` / `codex review --base main`）で出た Medium 1 件。レビュー自体は承認（Critical 0・High 0）で、PR #47 はマージ済み。その追随として起票した。あわせて同レビューの Low 1 件（失敗メッセージ「取得に失敗しました（リトライ後も失敗）」が、取得自体は成功した非 200 でも出る）もこの作業で直す。

**凍結改訂である。** `.github/workflows/preview.yml` は CLAUDE.md「変えてはいけないもの」の保護対象（`.github/workflows/` の検証ステップ）で、この作業はその中身を改訂する。改訂の内容と理由: 既存の HTTP 200 ゲートに加えて curl の終了ステータス 0 も要求する。ゲートを**追加**するだけで、`-L`・リトライ・`diff` の既存ゲートは一切外さないため、検証は弱まらず強くなる。CLAUDE.md の手続きに従い、PR に `allow-protected-change` ラベルを付けて人間がマージする。

## 仕様

`Verify deployed content` を次のとおり変える。

- curl の終了ステータスを別に捕まえ、**`CURL_STATUS` が 0 かつ `HTTP_CODE` が `200`** の両方を要求する。どちらか一方でも満たさなければステップは exit 1 する。形はレビュー提案に従う:

```sh
set +e
HTTP_CODE="$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 \
    -o downloaded-calc.html -w '%{http_code}' "$URL/calc.html")"
CURL_STATUS=$?
set -e
if [ "$CURL_STATUS" -ne 0 ] || [ "$HTTP_CODE" != "200" ]; then ...
```

- 既存のゲートを外さない: `-L`（リダイレクト追従）・`--retry 5 --retry-all-errors --retry-delay 2`・後段の `diff -u src/calc.html downloaded-calc.html`・成功時の `検証 OK:` 表示は現状のまま残す
- 失敗時のメッセージは実態に合わせて分ける。curl 非 0（転送失敗）のときは curl の終了ステータスを表示し、curl は 0 で HTTP コードが非 200（404 等）のときは「転送失敗」ではなく非 200 であることと HTTP コードを表示する。両方が同時に成立する場合はどちらの情報も表示してよい
- 非常系（curl 非 0・非 200）は実 CI では意図的に再現できないため、ステップのシェル部分をローカルに切り出し、PATH 先頭に置いた偽 curl（`200` を印字して exit 18 / `404` を印字して exit 0）で実行して検証する

## 範囲外

- `Verify deployed content` 以外のステップの変更
- リトライ回数・待ち時間の調整
- `diff` による内容一致検査の変更

## 失敗時

- curl が非 0 で終了（転送失敗）: HTTP コードが `200` でもステップは exit 1。curl の終了ステータスを表示する
- HTTP コードが `200` 以外（curl は 0 終了を含む）: ステップは exit 1。HTTP コードを表示し、文言は転送失敗ではなく非 200 を示す
- `allow-protected-change` ラベルの無い PR: `protected-paths` ジョブが `.github/workflows/preview.yml` の変更を検知して失敗する（正しい挙動）。ラベルを付けて人間がマージする

## 例

検証に使う具体例。表でも手順でもよい。該当がなければ「なし」。

| 操作または入力 | 期待結果 |
|---|---|
| 200 が返り本文も完全、curl は exit 0（この作業の PR の preview ジョブ） | 検証を通過して後段の `diff` に進み、ログに `検証 OK:` が出る |
| 偽 curl が `200` を印字して exit 18（`CURLE_PARTIAL_FILE` 相当）でローカル実行 | ステップ相当のシェルは exit 1。curl の終了ステータス `18` を表示する |
| 偽 curl が `404` を印字して exit 0 でローカル実行（リトライ後も 404 相当） | ステップ相当のシェルは exit 1。HTTP コード `404` を表示し、文言は転送失敗ではなく非 200 を示す |
| この作業の PR（ラベル無し） | `protected-paths` ジョブが変更を検知して失敗する |
| この作業の PR に `allow-protected-change` ラベルを付けて再実行 | `protected-paths` ジョブが成功する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 変更後の `Verify deployed content` が `CURL_STATUS` の 0 と `HTTP_CODE` の `200` の**両方**を要求している。どちらか一方の不成立で exit 1 することを、「例」の偽 curl によるローカル再現手順の出力を根拠に確認する。
6. 既存のゲートを外していない: `-L`・`--retry 5 --retry-all-errors --retry-delay 2`・`diff -u src/calc.html downloaded-calc.html`・`検証 OK:` が変更後のステップ本文に残っている。
7. この作業の PR で preview ジョブが成功し、ログに `検証 OK:` が出る（実 URL に対する実測）。
8. この作業の PR で、ラベル無しの `protected-paths` ジョブが変更を検知して失敗し、`allow-protected-change` ラベルを付けた再実行で成功する。
9. `npm run ci` が通る。
