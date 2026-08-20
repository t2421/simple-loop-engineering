# `spec-author` の backlog 経路の不備修正

`spec-author` エージェント定義と `CLAUDE.md`「仕様」節を直し、backlog 候補の起草が backlog の規則どおりに行われるようにする。

## 種別

バグ修正

## 対象

- 場所: `.claude/agents/spec-author.md`、`CLAUDE.md`「仕様」節
- 公開面: `spec-author` サブエージェントへの依頼手順（呼び出し側が渡す入力の記述）。API はなし

## 背景

`0022-spec-author-agent` で `spec-author` を新設した際の外部レビュー（codex-reviewer）2 回目で、Medium 指摘が 2 件出た。既存機能の退行ではなく、新設した backlog 経路の設計不備である。

1. `CLAUDE.md`「仕様」節の呼び出し記述が「意図・ID・slug を渡す」となっている。`spec-author` の種別は任意入力で既定が `task` のため、この記述に従って backlog 候補を起草依頼すると種別が渡らず、`task/<id>-<slug>/spec.md` と `progress.md` が作られてしまう。backlog 候補は `backlog/<id>-<slug>/spec.md` だけを作り progress を作らない、という規則に反する。
2. `.claude/agents/spec-author.md` の「完了条件の書き方」節が無条件に「テンプレートの 1〜4 はそのまま残し、5 以降にこの変更固有の命題を足す」と要求している。backlog の規則（完了条件は埋めず「未確定（incomplete）。昇格時に埋める。」の 1 行を節の先頭に置く）と矛盾する。

## 仕様

変更後のあるべき状態。

- `CLAUDE.md`「仕様」節の `spec-author` 呼び出し記述が、backlog 候補を起草させるときは `種別: backlog` を明示的に渡すことを含む
- `.claude/agents/spec-author.md` の「完了条件の書き方」節が、種別 `backlog` のときはこの節を適用しない（完了条件は「未確定（incomplete）。昇格時に埋める。」の 1 行のままとする）ことを明示する
- 種別を渡さない既定の挙動（`task` として起草）は変えない

## 範囲外

- `spec-author` の入力（意図・ID・slug・種別）の構成や既定値の変更
- `task/TEMPLATE-spec.md`・`task/TEMPLATE-progress.md` の変更（凍結対象）
- 既存の spec・progress の書き換え

## 失敗時

なし。

## 例

検証に使う具体例。

| 操作または入力 | 期待結果 |
|---|---|
| `CLAUDE.md`「仕様」節の記述に従い、backlog 候補の起草を `spec-author` に依頼する | 記述が `種別: backlog` を渡すよう指示しており、`backlog/<id>-<slug>/spec.md` だけが作られる。`task/<id>-<slug>/` と `progress.md` は作られない |
| `spec-author` に `種別: backlog` で起草を依頼する | 完了条件の節は「未確定（incomplete）。昇格時に埋める。」の 1 行であり、テンプレート 1〜4 の命題は書かれない |
| `spec-author` に種別を渡さず起草を依頼する | 従来どおり `task/<id>-<slug>/spec.md` と `progress.md` が作られ、完了条件はテンプレート 1〜4 を残し 5 以降に固有の命題を持つ |

## 完了条件

未確定（incomplete）。昇格時に埋める。
