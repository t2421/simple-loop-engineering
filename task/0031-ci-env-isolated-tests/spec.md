# CLI を起動するテストを CI の環境変数から切り離す

`tests/progress-coupling.test.mjs` のうち、チェッカーを子プロセスで起動するテストが実行環境の `GITHUB_ACTIONS`・`GITHUB_HEAD_REF` を引き継いでいるため、main への push で `verify` が落ちる。起動時にこの 2 つを落とす。

## 種別

バグ修正

## 対象

- 場所: `tests/progress-coupling.test.mjs`（CLI を子プロセスで起動する箇所。現状 `runCli` ヘルパと、ヘルパを通さない 2 つのテスト）
- 公開面: なし（テストの内部。`tools/` 配下は変更しない）

## 背景

main への push で `verify` ジョブが失敗している。343 件中 2 件が落ちる。

```
not ok 186 - CLI に base ref が無いと終了コード非 0 で使い方を出す
    The input did not match the regular expression /使い方:/. Input:
    'GITHUB_HEAD_REF が空です。進捗の Branch と照合できません。\n' +
      'このチェックは pull_request イベントで動かしてください。\n'

not ok 199 - CLI は base との差分が取れないと終了コード非 0 で終わる
    （同じ。/差分を取得できませんでした/ が出ずに head ref の fail-closed に当たる）
```

原因はテスト側の環境依存である。`0024-progress-pr-coupling` は「`GITHUB_ACTIONS=true` なのに head ブランチ名が得られないときは失敗させる」という fail-closed を `main()` の先頭に置いた。`.github/workflows/ci.yml` は `push: branches: [main]` と `pull_request` の両方で回るが、**`GITHUB_HEAD_REF` は `pull_request` でしか入らない。** push イベントでは `GITHUB_ACTIONS=true` だけが入るので、環境変数を落とさずに CLI を起動したテストはすべてこの fail-closed に先に当たる。

`runCli` ヘルパはこれを見越して `GITHUB_HEAD_REF`・`GITHUB_ACTIONS` を落としているが、上記 2 つのテストはヘルパを通さず生の `spawnSync` で起動しており、作法が漏れていた。PR の CI（`pull_request`）では head ref が入るため露見せず、main への push で初めて出る。

再現手順（ローカル）:

```
env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs
# → 86 中 84 pass / 2 fail（CI と同じ 2 件）
```

**凍結改訂の理由（CLAUDE.md「凍結を解いて改訂するとき」手順 1）。** `tests/` は保護対象（`tools/check-protected-paths.mjs` の `APPEND_ONLY_DIRS`）なので、この改訂には `allow-protected-change` ラベルと人間のマージが要る。**何を変えるか:** テストが CLI を起動するときの環境変数の与え方だけを変える。**なぜ検証を弱めないか:** 期待値（`使い方:`・`差分を取得できませんでした`）も、アサーションの数も、検査対象の挙動も変えない。変えるのは「実行環境にたまたま入っている変数に judgment を左右されない」という一点で、これまで環境次第で意味を失っていた 2 つのアサーションが、どの環境でも本来の対象を検査するようになる。検証は弱まるのではなく確定する。

## 仕様

- テストがチェッカーを子プロセスで起動するときは、**`GITHUB_ACTIONS` と `GITHUB_HEAD_REF` を親プロセスから引き継がない。** 個々のテストが明示的に与えた場合だけ、その値を使う
- 環境変数の組み立ては 1 箇所の共通ヘルパに置き、CLI を起動するすべての経路がそれを通る（作法の漏れを、規律ではなく形で防ぐ）
- `tools/check-progress-coupling.mjs` は変更しない。`main()` の fail-closed（`GITHUB_ACTIONS=true` で head ref が空なら終了コード 1）は仕様どおりの挙動であり、`0024-progress-pr-coupling` の spec が定めたまま維持する
- テストの期待値・アサーションの数・検査対象は変更しない

## 範囲外

- `tools/check-progress-coupling.mjs` の挙動・判定順・メッセージの変更
- `.github/workflows/` の変更（ジョブ・トリガ・ステップ）
- 他のテストファイルの環境依存の調査（このファイルに閉じる）
- `GITHUB_HEAD_REF` を push イベントでも埋める、といったワークフロー側での回避

## 失敗時

なし（テストの環境分離であり、実行時の失敗経路を新たに定義しない）。

## 例

| 操作または入力 | 期待結果 |
|---|---|
| `node --test tests/progress-coupling.test.mjs`（CI 由来の env なし） | 全件通過 |
| `env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` | 全件通過（現状はここで 2 件失敗する） |
| `env GITHUB_ACTIONS=true GITHUB_HEAD_REF=feature/x node --test tests/progress-coupling.test.mjs` | 全件通過 |
| `GITHUB_ACTIONS=true` の環境で、base ref 無しに CLI を起動するテスト | `使い方:` を確認できる |
| `GITHUB_ACTIONS=true` の環境で、git リポジトリでないディレクトリで CLI を起動するテスト | `差分を取得できませんでした` を確認できる |
| `GITHUB_ACTIONS=true`・`GITHUB_HEAD_REF` 空を明示的に与えるテスト（fail-closed の確認） | 従来どおり `GITHUB_HEAD_REF が空です` で失敗する |
| main への push で起動する `verify` ジョブ | 成功する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `npm run ci` が、`GITHUB_ACTIONS`・`GITHUB_HEAD_REF` の有無 3 通り（両方なし / `GITHUB_ACTIONS=true` のみ / 両方あり）すべてで同じ結果になる。差分は `tests/progress-coupling.test.mjs` に閉じており、`tools/` と `.github/workflows/` を含まない。PR に `allow-protected-change` ラベルが付いている。
