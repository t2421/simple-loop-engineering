# ガードの stderr に git の fatal が漏れる

base に `task/archive` が無いとき、`tools/check-protected-paths.mjs` が git の `fatal:` メッセージを stderr に漏らす。判定は正しいままなので、表示だけを抑止する。

## 種別

改善

## 対象

- 場所: `tools/check-protected-paths.mjs` の `readBaseArchivedIds`（凍結対象。改訂は CLAUDE.md「凍結を解いて改訂するとき」に従う）
- 公開面: CLI の stderr 出力のみ。判定・終了コードは変えない

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

`readBaseArchivedIds` は `git ls-tree --name-only <mergeBase>:task/archive` でアーカイブ済み作業 ID を列挙する。base に `task/archive` が存在しない場合（空ディレクトリは git が追跡しないため、素の一時リポジトリ等で起きる）、この git 呼び出しが失敗し、catch が「アーカイブ済み作業なし = 空集合」として正しく続行する。**判定と終了コードは正しい。**

ただし `execFileSync` の stderr が親プロセスへ素通しのため、次が漏れる。

```
fatal: Not a valid object name 59951c…:task/archive
保護パスの変更はありません（1 件の差分を確認）。
exit=0
```

CI ログに `fatal:` が出ると失敗と誤読される。0018 の検証中に別セッションが発見し、この会話で再現を確認した。実リポジトリの main には `task/archive` が常に存在するため、現行 CI では発現しない。

## 仕様

変更後に満たしたい振る舞い（検証可能な命題に落とすのは昇格時）。

- `readBaseArchivedIds` の git 呼び出しは stderr を親へ流さない（`stdio: ['ignore', 'pipe', 'ignore']` 等）
- base に `task/archive` が無い場合の判定（空集合として続行、exit 0）は現状のまま変えない
- 他の git 呼び出し（差分取得・scripts 読み取り）の失敗時メッセージは変えない。あれは fail-closed の説明として意図的に出している

## 範囲外

- 判定ロジック・終了コードの変更
- `readBaseArchivedIds` 以外の stderr 方針の変更

## 失敗時

未確定。候補:

- base の ref 自体が不正な場合は、従来どおり手前の差分取得が fail-closed で exit 1 する（この作業では触れない）

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| base に `task/archive` が無いリポジトリでガードを実行 | stderr に `fatal:` が出ない。exit 0 と判定は従来どおり |
| 実リポジトリの PR 差分でガードを実行 | 出力・判定とも従来どおり |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
