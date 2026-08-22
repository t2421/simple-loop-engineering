# プレビュー検証がリダイレクトを追わない

`.github/workflows/preview.yml` の `Verify deployed content` が Cloudflare Pages の 308 リダイレクトを追わないため、デプロイが正しくても必ず失敗する。curl にリダイレクト追従を足し、両立しなくなった `0013` の「例」の期待値を実挙動に合わせる。

## 種別

バグ修正

## 対象

- 場所: `.github/workflows/preview.yml` の `Verify deployed content` ステップ（凍結対象。`.github/workflows/` は append-only で、既存ファイルの変更には `allow-protected-change` ラベルが要る）
- 場所: `task/archive/0013-cloudflare-preview/spec.md` の「例」のうち、`/calc.html` に `curl -sSI` して 200 を期待する行（凍結対象。同上）
- 公開面: preview ジョブの成否だけ。プレビュー URL の発行・sticky コメント・fork 除外・Secrets 未登録時の扱いは変えない

## 背景

`0013` のプレビューは実際に動いている。Pages プロジェクト `simple-loop-engineering`（direct upload）を作成した後、デプロイは成功し、配信物はリポジトリの `src/calc.html` と同一である。手元からの実測で `curl -sSL` した内容は `diff -u src/calc.html` が差分なしだった。

それでも preview ジョブは緑にならない。**Cloudflare Pages は `/calc.html` を `/calc` へ 308 リダイレクトする**（`location: /calc`）。実測では `/calc.html` が `http=308`、`/calc` が `http=200` である。`Verify deployed content` の `curl -fsS`（`-L` なし）はこのリダイレクトを追わず、かつ `-f` は 3xx をエラーとしないため、**exit 0 のまま空ファイルを書く**。続く `diff -u src/calc.html downloaded-calc.html` が必ず落ちる。CI で再現済みで、diff の出力は `-` 行だけ、`+` 行が 1 行も無い。

`0013` の「例」にある「そのコメントの URL + `/calc.html` を `curl -sSI` → HTTP 200 が返る」も、この既定挙動とは両立しない。実装だけを直しても、期待値の側が満たせないまま残る。

**凍結改訂の理由（CLAUDE.md「凍結を解いて改訂するとき」に従う）。** この改訂は検証を弱めない。

- ワークフロー側は `-L` を足すだけで、到達不能・4xx・5xx・内容不一致で失敗する経路は一切変えない。むしろ現在は**正しいデプロイでも必ず落ちる**状態であり、検証が機能していない。追従を足すことで初めて「内容が一致するか」を実際に検査できるようになる
- `0013` の spec 側は、満たせない期待値（Pages の既定では 308 になる）を、実挙動と同じ強さの命題に置き換える。「200 が返り、内容が `src/calc.html` と一致する」という検査の中身は保つ。期待値を緩めるのではなく、到達経路の記述を正す

初回の再実行では TLS ハンドシェイク失敗（`curl: (35) OpenSSL/3.0.13: error:0A000410:SSL routines::sslv3 alert handshake failure`）も観測したが、これは新規 Pages プロジェクトのワイルドカード証明書が発行されるまでの過渡状態で、数分後に解消した（`CN=simple-loop-engineering.pages.dev` を確認）。恒久的な問題ではないので、この作業では扱わない。

## 仕様

- `Verify deployed content` の取得は 3xx リダイレクトを追う。追った先の内容を `src/calc.html` と比較する
- 追った先が 200 でない、または到達できないときは、いまと同じく診断を出して `exit 1` する
- 内容が一致しないときは、いまと同じく `diff -u` の差分を出して `exit 1` する
- `Comment the preview URL` は、いまと同じく検証の**後**に置く。検証に失敗した URL をコメントしない
- `task/archive/0013-cloudflare-preview/spec.md` の「例」から、`/calc.html` が直接 200 を返すと読める行を無くす。代わりに Pages の既定挙動（308 で `/calc` へ導かれ、追った先が 200 で内容一致）を期待値にする
- `0013` の他の完了条件・仕様・範囲外は変えない
- `npm run ci` と `.github/workflows/ci.yml`・`guard.yml` は変更しない

## 範囲外

- Pages 側の設定で `.html` を維持すること（`_redirects` やプロジェクト設定の変更）。配信物に設定ファイルを足さない
- preview ジョブを必須チェックにすること
- `0013` の「失敗時」「範囲外」および他の「例」の行の変更
- TLS 証明書の発行待ちに対するリトライ強化
- sticky コメント・fork 除外・Secrets 未登録時の扱いの変更

## 失敗時

- 308 を追った先が 404 または 5xx: 診断を出して `exit 1`。preview ジョブは赤くなる
- 追った先の内容が `src/calc.html` と一致しない: `diff -u` の差分を出して `exit 1`
- URL に到達できない: リトライ後に診断を出して `exit 1`
- `allow-protected-change` ラベルを付けずに PR を出した: `protected-paths` ジョブが保護パスの変更を検知して失敗する

## 例

| 操作または入力 | 期待結果 |
|---|---|
| プレビュー URL + `/calc.html` を `curl -fsSL` で取得 | 308 を追って 200 が返り、本文が `src/calc.html` と同一である |
| プレビュー URL + `/calc.html` を `curl -sSI`（リダイレクトを追わない） | `HTTP/2 308` と `location: /calc` が返る |
| プレビュー URL + `/calc` を `curl -sS -o /dev/null -w '%{http_code}'` | `200` |
| Secrets 登録済み・Pages プロジェクトありで PR を開く | preview ジョブが成功し、`検証 OK:` の行が出て、PR に URL のコメントが 1 件付く |
| プレビュー URL + 存在しないパスを取得 | 診断を出して `exit 1`。ジョブは赤くなる |
| `allow-protected-change` ラベル無しでこの PR を出す | `protected-paths` ジョブが失敗する |
| `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` | 空（無変更） |
| ローカルで `npm run ci` | Cloudflare 未設定でも、今までどおり完結する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。
4. 「範囲外」を実装していない。
5. この作業の PR で preview ジョブが成功し、ログに `検証 OK:` の行が出る。実 URL に対する実測であり、ローカル模擬ではない。
6. `task/archive/0013-cloudflare-preview/spec.md` の「例」に、`/calc.html` が直接 200 を返すと読める行が残っていない。
7. `node tools/check-protected-paths.mjs` が、`allow-protected-change` ラベル無しでは保護パスの変更を検知して失敗し、ラベル付きでは通過する。両方の出力を根拠にする。
8. `npm run ci` が通る。
9. `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` が空。
