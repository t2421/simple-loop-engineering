# ガードの stderr に git の fatal が漏れる

base に `task/archive` が無いとき、`tools/check-protected-paths.mjs` が git の `fatal:` メッセージを stderr に漏らす。判定は正しいままなので、表示だけを抑止する。

## 種別

改善

## 対象

- 場所: `tools/check-protected-paths.mjs` の `readBaseArchivedIds`（凍結対象。改訂は CLAUDE.md「凍結を解いて改訂するとき」に従う）
- 公開面: CLI の stderr 出力のみ。判定・終了コードは変えない

## 背景

`readBaseArchivedIds` は `git ls-tree --name-only <mergeBase>:task/archive` でアーカイブ済み作業 ID を列挙する。base に `task/archive` が存在しない場合（空ディレクトリは git が追跡しないため、素の一時リポジトリ等で起きる）、この git 呼び出しが失敗し、catch が「アーカイブ済み作業なし = 空集合」として正しく続行する。**判定と終了コードは正しい。**

ただし `execFileSync` の stderr が親プロセスへ素通しのため、次が漏れる。2026-08-22 の backlog リファインメントで、一時リポジトリ（base に `task/archive` が無い）を作って再現を実測した。

```
fatal: Not a valid object name cfccb10ab3bc3f082c99e954608d0f7b2466dd85:task/archive
保護パスの変更はありません（1 件の差分を確認）。
exit=0
```

判定と終了コードは正しく、`fatal:` の表示だけが漏れている。CI ログに `fatal:` が出ると失敗と誤読される。0018 の検証中に別セッションが発見した。実リポジトリの main には `task/archive` が常に存在するため、現行 CI では発現しない。

**凍結改訂である。** `tools/check-protected-paths.mjs` は CLAUDE.md「変えてはいけないもの」の保護対象で、この作業はその中身を改訂する。改訂の内容と理由: `readBaseArchivedIds` の git 呼び出しの stderr 表示だけを抑止する。判定ロジック・終了コード・他の呼び出しの fail-closed メッセージは一切変えないため、検証を弱めない。テストは新規ファイルに置き、凍結済みの `tests/protected-paths.test.mjs` には触れない。

## 仕様

- `readBaseArchivedIds` 内の `execFileSync('git', ['ls-tree', ...])` は stderr を親プロセスへ流さない（`stdio: ['ignore', 'pipe', 'ignore']` 等）
- base に `task/archive` が無い場合の判定は現状のまま変えない: catch で空集合として続行し、違反が無ければ stdout に「保護パスの変更はありません（N 件の差分を確認）。」を出して exit 0
- 他の git 呼び出し（差分取得・scripts 読み取りなど）の stderr 方針と失敗時メッセージは変えない。あれは fail-closed の説明として意図的に出している
- テストは新規ファイル `tests/guard-stderr.test.mjs` に置く。一時リポジトリで base に `task/archive` が無い状態を作ってガードを実行し、stderr に `fatal:` が含まれないこと・exit 0・stdout の判定メッセージを検証する（テストは `tools/run-unit-tests.mjs` が自動列挙するため、列挙の変更は不要）

## 範囲外

- 判定ロジック・終了コードの変更
- `readBaseArchivedIds` 以外の stderr 方針の変更
- `tests/protected-paths.test.mjs`（凍結済み）の変更

## 失敗時

- base の ref 自体が不正な場合: 従来どおり手前の差分取得が fail-closed で exit 1 する（この作業では触れない）
- `allow-protected-change` ラベルの無い PR: `protected-paths` ジョブが `tools/check-protected-paths.mjs` の変更を検知して失敗する（正しい挙動）。CLAUDE.md「凍結を解いて改訂するとき」に従い、PR に `allow-protected-change` ラベルを付けて人間がマージする

## 例

検証に使う具体例。表でも手順でもよい。該当がなければ「なし」。

| 操作または入力 | 期待結果 |
|---|---|
| base に `task/archive` が無い一時リポジトリでガードを実行 | stderr に `fatal:` が出ない。stdout に `保護パスの変更はありません` が出て exit 0 |
| 実リポジトリの PR 差分でガードを実行（既存テスト） | 出力・判定とも従来どおり。`tests/protected-paths.test.mjs` が無変更のまま全件通る |
| この作業の PR（ラベル無し） | `protected-paths` ジョブが変更を検知して失敗する |
| この作業の PR に `allow-protected-change` ラベルを付けて再実行 | `protected-paths` ジョブが成功する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. base に `task/archive` が無い一時リポジトリでガードを実行したとき、stderr に `fatal:` が含まれず、stdout の判定メッセージと exit 0 が従来どおりである。新規テスト `tests/guard-stderr.test.mjs` の実行出力を根拠にする。
6. 他の git 呼び出しの失敗時メッセージが変わっていない。凍結済みの `tests/protected-paths.test.mjs` を無変更のまま全件通ることを根拠にする。
7. `npm run ci` が通る。
8. この作業の PR で、ラベル無しの `protected-paths` ジョブが変更を検知して失敗し、`allow-protected-change` ラベルを付けた再実行で成功する。
