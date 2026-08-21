# CLI テストの CI 環境変数の隔離

`tests/progress-coupling.test.mjs` の CLI 起動 2 箇所が CI 由来の環境変数を落とさずにチェッカーを起動しているため、`main` への push（`GITHUB_ACTIONS=true`）で落ちる。起動環境を `runCli` と同じく隔離し、テストを環境非依存にする。

## 種別

バグ修正

## 対象

- 場所: `tests/progress-coupling.test.mjs`（CLI 起動 2 箇所。「CLI に base ref が無いと終了コード非 0 で使い方を出す」の 802 行目付近と、「CLI は base との差分が取れないと終了コード非 0 で終わる」の 1067 行目付近）
- 公開面: なし（テストコードのみ。`tools/check-progress-coupling.mjs` の公開面は変えない）

## 背景

同ファイルの `runCli` ヘルパは、CI 由来の環境変数（`GITHUB_HEAD_REF`・`GITHUB_ACTIONS`）を**既定で落として**から CLI を起動する。実行環境にたまたま入っていると判定が変わるためである。しかし上記 2 テストは `runCli` を使わず生の `spawnSync` で起動しており、この作法を踏んでいない。

GitHub Actions の `push` イベントでは `GITHUB_ACTIONS=true` が入る一方 `GITHUB_HEAD_REF` は空である。このためチェッカーの fail-closed（head ref 欠落）に先に当たり、テストが期待する `使い方:` / `差分を取得できませんでした` が出ずに落ちる。実測（push イベントの再現）:

```
=== 通常実行 ===
# fail 0
=== GITHUB_ACTIONS=true（push イベントの再現）===
# pass 84  # fail 2

not ok 52 - CLI に base ref が無いと終了コード非 0 で使い方を出す
  The input did not match the regular expression /使い方:/. Input:
  'GITHUB_HEAD_REF が空です。進捗の Branch と照合できません。'

not ok 65 - CLI は base との差分が取れないと終了コード非 0 で終わる
  The input did not match the regular expression /差分を取得できませんでした/. Input:
  'GITHUB_HEAD_REF が空です。進捗の Branch と照合できません。'
```

この結果、`main` の CI は PR #37 のマージ時点から赤である（`gh run list --branch main` で 3 件連続 failure）。

**凍結対象の改訂であることの宣言（CLAUDE.md「凍結を解いて改訂するとき」手続き 1）:**

- 何を変えるか: `tests/progress-coupling.test.mjs` の上記 CLI 起動 2 箇所を、`runCli` と同じく CI 由来の環境変数（`GITHUB_HEAD_REF`・`GITHUB_ACTIONS`）を落としてから起動する形に揃える。環境変数を落とす処理は共通ヘルパに切り出すのが望ましい
- なぜ検証を弱めないか: assert の期待値（`使い方:` / `差分を取得できませんでした` / 終了コード非 0）は一切変えない。変えるのは起動時の環境だけであり、テストが検証する対象は同じである。むしろ実行環境に依存せず常に意図した経路（usage エラー / diff 失敗）を検証するようになるので、検証は強くなる
- チェッカー（`tools/check-progress-coupling.mjs`）の fail-closed（`GITHUB_ACTIONS` かつ head ref 欠落で非 0 終了）は**仕様どおりの挙動なので変更しない**

## 仕様

変更前: 上記 2 テストは生の `spawnSync` で CLI を起動し、親プロセスの環境をそのまま引き継ぐ。`GITHUB_ACTIONS=true` の環境では fail-closed に先に当たり落ちる。

変更後:

- 上記 2 テストは、`GITHUB_HEAD_REF` と `GITHUB_ACTIONS` を環境から落としてから CLI を起動する（`runCli` と同じ作法。落とす処理は共通ヘルパに切り出すのが望ましい）
- 2 テストの assert（期待する終了コード・stderr のパターン）は変更しない
- 各テスト固有の起動条件（802 行目付近: base ref 引数なし / 1067 行目付近: 引数 `origin/main`・git リポジトリでない `cwd`）は維持する
- `tools/check-progress-coupling.mjs` は無変更
- 結果として、`tests/progress-coupling.test.mjs` は通常実行でも `GITHUB_ACTIONS=true` を与えた実行でも全件通る

## 範囲外

- PR の CI でも push 相当の環境を検証する仕組みの追加（同じクラスの事故の再発防止。別作業）
- 他のテストファイルの同種の環境依存の点検
- `tools/check-progress-coupling.mjs` の変更（fail-closed は仕様どおり）
- fail-closed そのものを検証するテスト群（`runCli` に `GITHUB_ACTIONS` を明示的に渡すもの）の変更

## 失敗時

なし（テストコードの修正であり、新しい失敗系は増えない。チェッカーの失敗系は既存のとおり）。

## 例

| 操作または入力 | 期待結果 |
|---|---|
| `node --test tests/progress-coupling.test.mjs`（通常実行） | 全件 pass（`# fail 0`） |
| `env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs`（push イベントの再現） | 全件 pass（`# fail 0`）。「CLI に base ref が無いと…」「CLI は base との差分が取れないと…」の 2 件を含む |
| 変更後の 2 テスト内で CLI が受ける環境 | `GITHUB_HEAD_REF`・`GITHUB_ACTIONS` を含まない |
| `git diff main -- tools/check-progress-coupling.mjs` | 空（無変更） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `env GITHUB_ACTIONS=true node --test tests/progress-coupling.test.mjs` が全件 pass する（push イベントの再現）。
6. `node --test tests/progress-coupling.test.mjs`（通常実行）も全件 pass する。
7. 対象 2 テストの assert の期待値（`使い方:` / `差分を取得できませんでした` / 終了コード非 0）が変更されていない（`git diff main -- tests/progress-coupling.test.mjs` で確認できる）。
8. `tools/check-progress-coupling.mjs` が無変更である（`git diff main -- tools/check-progress-coupling.mjs` が空）。
9. この PR に `allow-protected-change` ラベルが付き、人間がマージする（凍結対象 `tests/` の改訂手続き）。
