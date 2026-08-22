# preview 検証で curl の終了ステータスもゲートにする

`.github/workflows/preview.yml` の `Verify deployed content` が、HTTP コードに加えて curl 自体の終了ステータスも検査するようにする。

## 種別

改善

## 対象

- 場所: `.github/workflows/preview.yml` の `Verify deployed content` ステップ
- 公開面: なし（CI の preview ジョブの内部検証。使い方は変わらない）

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

現在の検証は次の形で HTTP コードだけを見ている。

```sh
HTTP_CODE="$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 \
    -o downloaded-calc.html -w '%{http_code}' "$URL/calc.html" || true)"
if [ "$HTTP_CODE" != "200" ]; then ...
```

`|| true` が curl 自体の非 0 終了を捨てるため、「HTTP 200 が返り `-w '%{http_code}'` は `200` を印字するが、curl は `CURLE_PARTIAL_FILE`（18）等で非 0 終了する」という転送失敗を見逃す。

ただし影響は狭い。現実的な転送失敗（切断・タイムアウト・書き込み失敗）は本文が欠けるので、後段の `diff -u src/calc.html downloaded-calc.html` が捕まえる。抜けるのは「本文は完全だが Content-Length が誤っている」ような極めて狭い場合に限られる。**緊急性は低い。**

経緯: 旧実装（`0032` 以前）は curl の終了ステータスをゲートにしていた。`0032-preview-verify-redirect` でゲートを `%{http_code}` の 200 完全一致へ移した結果、そのシグナルを 1 つ手放した形になっている。両方を要求すれば元のシグナルを取り戻せる。

出典: `0032-preview-verify-redirect` の外部レビュー（`codex-reviewer` / `codex review --base main`）で出た Medium 1 件。レビュー自体は承認（Critical 0・High 0）で、PR #47 はマージ済み。その追随として起票する。

レビューが提案した形:

```sh
set +e
HTTP_CODE="$(curl -fsSL --retry 5 --retry-all-errors --retry-delay 2 \
    -o downloaded-calc.html -w '%{http_code}' "$URL/calc.html")"
CURL_STATUS=$?
set -e
if [ "$CURL_STATUS" -ne 0 ] || [ "$HTTP_CODE" != "200" ]; then ...
```

同時に直せる Low 1 件: 失敗時のメッセージ「取得に失敗しました（リトライ後も失敗）」は、取得自体は成功した非 200（404 等）でも出る。直後に HTTP コード行が出るので誤読はしにくいが、文言を実態に合わせる余地がある。

**注意: `.github/workflows/preview.yml` は凍結対象**（`.github/workflows/` の検証ステップ）である。着手するなら CLAUDE.md「凍結を解いて改訂するとき」に従い、改訂の内容と、なぜ検証を弱めないか（ゲートを追加するだけで既存のゲートは外さない）を spec に書き、PR に `allow-protected-change` ラベルを付けて人間がマージする必要がある。

## 仕様

変更後に満たしたい振る舞い（検証可能な命題に落とすのは昇格時）。

- `Verify deployed content` は curl の終了ステータスを別に捕まえ、**`exit 0` と `HTTP 200` の両方**を要求する。どちらか一方でも満たさなければステップは失敗する
- `-L`（リダイレクト追従）・`--retry 5 --retry-all-errors --retry-delay 2`・後段の `diff -u src/calc.html downloaded-calc.html` は現状のまま残す。既存のゲートを外さない
- 失敗時のメッセージは実態に合わせる。curl 非 0（転送失敗）と、取得は成功した非 200（404 等）を混同する文言にしない

## 範囲外

- `Verify deployed content` 以外のステップの変更
- リトライ回数・待ち時間の調整
- `diff` による内容一致検査の変更

## 失敗時

未確定。候補:

- curl が非 0 で終了（転送失敗）: HTTP コードが `200` でもステップは exit 1。curl の終了ステータスを表示する
- HTTP コードが `200` 以外（curl は 0 終了を含む）: ステップは exit 1。HTTP コードを表示する

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| 200 が返り本文も完全、curl は exit 0 | 検証を通過し、後段の `diff` に進む |
| 200 が返り本文も完全だが curl が `CURLE_PARTIAL_FILE`（18）等で非 0 終了 | ステップは exit 1（現状は見逃す） |
| リトライ後も 404 | ステップは exit 1。文言は「転送失敗」ではなく非 200 を示す |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
