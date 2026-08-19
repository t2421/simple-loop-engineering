# 保護パスを `task/` へ追随させる

保護パスガードが見るディレクトリを `specs/` から `task/` に移し、移行で失われた spec の凍結を回復する。

## 種別

バグ修正

## 対象

- 場所: `tools/check-protected-paths.mjs`、`tests/protected-paths.test.mjs`、`CLAUDE.md`（「変えてはいけないもの」の一覧）
- 公開面: PR 上の `protected-paths` チェック（検知範囲が広がる）

## 背景

`0014-spec-progress-layout` の移行で、spec と progress は `task/<id>-<slug>/` へ移った。`specs/` に残っているのは `TEMPLATE.md` だけである。

ところがガードの `APPEND_ONLY_DIRS` は `specs/` のままで、`task/` を一切見ていない。**移行によって、すべての spec の完了条件と例の期待値が無防備になった。** 実測:

```
PASS   task/archive/0012-ci-lint/spec.md   ← 完了条件を書き換えても検知しない
PASS   task/0017-foo/spec.md
DETECT specs/TEMPLATE.md                    ← 旧パスだけ守っている
```

ガードの目的は「停止条件を満たすために検証を弱める変更」を止めることであり、完了条件と期待値はその中心である。いまはエージェントが `task/.../spec.md` の完了条件を書き換えても、CI は何も言わない。移行が enforcement 層を置き去りにした形である。

`CLAUDE.md`「変えてはいけないもの」の一覧も `specs/` を指したままで、実体と合っていない。

## 仕様

- ガードは `task/` 配下の既存ファイルの内容変更・削除を検知する。新規追加は許可する
- アーカイブ移動（`task/<id>-<slug>/` → `task/archive/<id>-<slug>/`）は、内容が同一なら許可する
- `task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md` は、変更も移動も削除も許さない（現行の `TEMPLATES` と同じ扱い）
- `backlog/` は保護しない。着手前の候補であり、完了条件は未確定だからである
- `specs/` と `progress/` の既存の扱い（`TEMPLATE.md` の凍結を含む）は残す。移行前の資産が残っている限り外さない
- `CLAUDE.md`「変えてはいけないもの」の一覧を、`task/` を含む形に直す

## 範囲外

- `tools/archive.mjs` の移行追随（`0018-archive-tool-task-layout` の範囲）
- `specs/` と `progress/` の完全な撤去
- main への直接コミットに対するガード（ガードは `pull_request` でしか走らない。アーカイブは main 直接のため、この経路は現状どおり検知されない）

## 失敗時

- `task/` 配下の既存 spec の完了条件を変更した PR: ガード失敗。`allow-protected-change` ラベルで通す
- `task/TEMPLATE-spec.md` を変更した PR: ガード失敗

## 例

| 操作または入力 | 期待結果 |
|---|---|
| `task/archive/0012-ci-lint/spec.md` の内容を変更した PR | ガード失敗 |
| `task/0017-foo/progress.md` の内容を変更した PR | ガード失敗 |
| `task/TEMPLATE-spec.md` を変更した PR | ガード失敗 |
| 新規 `task/0019-bar/spec.md` を追加した PR | ガード通過 |
| `task/0019-bar/` を `task/archive/0019-bar/` へ内容同一で移動した PR | ガード通過 |
| `task/0019-bar/spec.md` を `docs/` の外へ移動した PR | ガード失敗 |
| `backlog/0013-cloudflare-preview/spec.md` を変更した PR | ガード通過 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/protected-paths.test.mjs` のユニットテストで網羅されている。既存の検知（`tests/`・`package.json` の `scripts`・`.github/workflows/`・チェッカー自身）が変更前と同じく働く。
