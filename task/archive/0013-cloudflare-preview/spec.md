# Cloudflare によるプレビュー環境

PR またはブランチごとに、計算 UI をブラウザで開けるリモートのプレビュー URL を Cloudflare で発行する。

## 種別

機能追加

## 対象

- 場所: `.github/workflows/preview.yml`（**新規**。既存の `ci.yml`・`guard.yml` は変更しない）
- 場所: Cloudflare Pages のプロジェクト（direct upload。`src/` をそのまま配信する）
- 公開面: プレビュー URL（HTTPS）。エージェントまたは人間がブラウザで `src/calc.html` を開けること。URL は PR コメントから取得できる

## 背景

計算 UI（`src/calc.html`）の確認は、ローカルの静的サーバーと Playwright（`127.0.0.1`）で完結している。CI も同じ経路で `npm run ci` する。公開 URL は無い。

クラウド上のコーディングエージェントや、ブラウザを持つがリポジトリのローカルサーバーを起動できない自動化は、画面を開けない。見た目の残差レビューや、リモートからの操作確認がローカル前提のまま止まる。ローカルで完結できる検証は残し、リモートが必要なときだけ使えるプレビューを足したい。

昇格時に決めた判断（人間の承認済み）:

| 論点 | 決定 | 理由 |
|---|---|---|
| Pages か Workers か | **Pages**（direct upload） | `src/` は `calc.html`・`calc.css`・`calc.mjs`・`math.mjs`・`assets/` だけの静的ファイルでビルド不要。サーバロジックは要らず、「範囲外」も独自ワーカーロジックを除いている |
| 発行単位 | **PR ごと** | 目的はレビュー時に画面を開けることで、レビューは PR 上で起きる。ブランチ単位は URL が増えるだけで読み手が増えない |
| プレビュー失敗を CI の失敗にするか | **しない**（独立ジョブ。必須チェックにしない） | 「範囲外」が `npm run ci` をプレビュー依存にすることを禁じている。外部サービスと Secrets の可用性にゲートを縛らない。ただしジョブ自体は赤くする（黙って成功にしない） |
| URL の伝え方 | **PR への sticky コメント**（1 件を更新）| エージェントが `gh pr view --comments` で取得できる。Pages のデプロイ URL はハッシュを含むため、固定規則だけでは辿れない |
| fork からの PR を対象にするか | **対象外** | このリポジトリは public。fork PR に Secrets は渡らず、渡すには `pull_request_target` が要る。未検証コードに認証情報を晒す既知の危険パターンなので採らない |

Secrets（`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`）は人間が GitHub に登録する。**登録前でもこの作業は進められる**こと（ジョブが明示的にスキップし、黙って成功しないこと）を仕様に含める。

## 仕様

- `.github/workflows/preview.yml` は `pull_request` で動き、`src/` を Cloudflare Pages へ direct upload する。ビルド手順は挟まない（`src/` がそのまま配信物である）
- デプロイした URL を PR に **sticky コメント**（同一 PR では 1 件を更新し、push のたびに増やさない）として書く
- その URL の `/calc.html` が HTTP 200 を返し、リポジトリの `src/calc.html` と同じ内容を配信する
- `npm run ci`（`package.json` の `scripts`）と `.github/workflows/ci.yml`・`guard.yml` は**変更しない**。ローカル検証は Cloudflare に依存しないまま
- preview ジョブは `verify`・`e2e`・`protected-paths`・`progress-coupling` から独立し、**必須チェックにしない**。preview が落ちてもマージ可能性は変わらない
- Secrets（`CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`）が未登録のとき、ジョブは**理由を出力して終了する**。デプロイを試みず、かつ「成功した」と読める出力を出さない
- fork からの PR（`github.event.pull_request.head.repo.full_name != github.repository`）では、デプロイを実行しない
- `wrangler` は `package.json` の依存に加えない。ワークフロー内で**メジャーを固定した** `npx` 実行にする（CI でしか使わないものを、全員の `npm ci` に載せない）

## 範囲外

- ローカル検証の廃止、または `npm run ci` をプレビュー依存にすること
- 本番カスタムドメイン、認証、独自ワーカーロジック
- 見た目テスト（Playwright / ピクセル比較）のリモート移行
- Cloudflare 以外のホスティング

## 失敗時

- Secrets が未登録: デプロイを試みず、理由を出力して終了する。**「成功した」と読める出力を出さない**（黙って緑にしない）
- fork からの PR: デプロイを実行しない。理由を出力する
- Cloudflare へのデプロイが失敗（認証エラー・ネットワーク・プロジェクト不在など）: **preview ジョブは失敗する**（赤くする）。`verify`・`e2e`・`protected-paths`・`progress-coupling` は影響を受けない
- PR コメントの投稿に失敗: preview ジョブは失敗する（URL が伝わらなければ発行した意味がないため、成功扱いにしない）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| Secrets 登録済みで PR を開く | preview ジョブが成功し、PR に URL のコメントが 1 件付く |
| そのコメントの URL + `/calc.html` を `curl -sSI` | HTTP 200 が返る |
| その URL の `/calc.html` の本文を取得し、リポジトリの `src/calc.html` と比較 | 同一の内容が返る |
| 同じ PR にもう一度 push する | コメントは増えず、既存の 1 件が新しい URL に更新される |
| `gh pr view <n> --comments` を実行 | URL を機械的に取り出せる |
| Secrets 未登録で PR を開く | preview ジョブがデプロイを試みず、理由を出力して終了する。緑の成功として読めない |
| fork からの PR | デプロイが実行されない |
| preview ジョブが落ちた PR | `verify`・`e2e`・`protected-paths`・`progress-coupling` は独立して成功し、必須チェックは揃う |
| ローカルで `npm run ci` | Cloudflare 未設定でも、今までどおり完結する |
| `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` | 空（無変更） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。
4. 「範囲外」を実装していない。
5. **この作業自身の PR で preview ジョブが実際に走っている。** Secrets 登録済みなら、コメントされた URL の `/calc.html` が HTTP 200 を返し、`src/calc.html` と同じ内容であることを `curl` の出力で示す。未登録なら、デプロイを試みずに理由を出力して終わったジョブログを示す。**どちらの場合も実行結果の出力を会話と PR 本文に貼る。**
6. `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` が空である（`npm run ci` と既存ゲートに手を入れていない）。
7. preview ジョブが必須チェックになっていない。preview が落ちても `verify`・`e2e`・`protected-paths`・`progress-coupling` が揃えばマージできる。
8. fork PR を除外する条件と、Secrets 未登録時に早期終了する条件が `.github/workflows/preview.yml` に入っている。いずれも「黙って成功にしない」形であることを、ジョブの出力で示す。
