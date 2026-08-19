# spec / progress の構造見直し

作業を `specs/` と `progress/` の対ではなく、`task/<id>-<slug>/` にまとめ、spec・progress・関連ファイルを同居させる。

## 種別

改善

## 対象

- 場所: `task/`（現行の `specs/` / `progress/` を置き換える）。保護パスガードが前提にしているパスは、昇格時に合わせる
- 公開面: エージェントが作業を 4 桁 ID で特定し、`task/<id>-<slug>/spec.md`・`progress.md`・関連ファイルを同じ単位として扱えること。ディレクトリ名の slug で内容が分かる

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。

いまの単位はベース名の対である。`specs/<作業>.md` と `progress/<作業>.md` を同名で対にし、抽出物は同じディレクトリに `progress/<作業>.figma.json` のように置く。作業名が識別子であり、関連ファイルはフラットなプレフィックス一致である。

過程でファイルは既に増えている。`calc-page` では Figma の JSON と PNG が進捗の横に並び、差分 PNG は gitignore した。今後のプレビュースクショやメモも、同じフラット空間に載せるしかない。

プレフィックス一致は既に危うい。`archive-automation` の試行では `foo` の収集が `foo.v2` を巻き込み、最長一致に直している。`TEMPLATE.md` も同じディレクトリにあり、作業ディレクトリと混ざる。作業名の変更はパスの書き換えになり、安定した ID が無い。

ID はゼロ埋め 4 桁の連番とする（`0001`、`0002`、…）。識別子は番号だけであり、slug や UUID にはしない。使い終わった番号は再利用しない。

`specs/` と `progress/` には分けない。ルートは `task/` とし、作業ディレクトリは `task/<id>-<slug>/` にする（例: `task/0001-calc-page/`）。中身は `spec.md` と `progress.md`、関連ファイルも同じディレクトリへ置く。slug は一覧したときに内容が分かるためのラベルで、識別子ではない。アーカイブは `task/archive/<id>-<slug>/` へディレクトリごと移す。

テンプレは作業ディレクトリにしない。`task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md` をルートに置く（`NNNN-slug` の形ではないので混線しない）。

既存の `specs/archive/` と `progress/archive/` は、関連ファイルごと `task/archive/<id>-<slug>/` へ移す。slug は現行のベース名。ID はアーカイブが古い順に `0001` から振る。同じコミットで複数あるときは、そのコミットメッセージに出た順とする。progress の **Target Spec** は移動後のパスに直す。

進行中の作業（`specs/` と `progress/` に残っているもの）はこの変更では動かさない。完了後のアーカイブは、そのときの手順に従う。

`tests/calc-page.test.mjs` は `progress/archive/calc-page.*` を読むため、抽出物の本体は `task/archive/0003-calc-page/` に移し、`progress/archive/` にはシンボリックリンクを残す。テストコードは変えない。

## 仕様

変更後に満たしたい振る舞い（検証可能な命題に落とすのは昇格時）。

- 作業の ID はゼロ埋め 4 桁の十進連番である（`0001`、`0002`、…）。識別子は番号だけとする
- 新しい作業には、既存の最大番号の次を振る。欠番や使い終わった番号は再利用しない
- ルートは `task/`。作業ディレクトリは `task/<id>-<slug>/`（例: `task/0001-calc-page/`）
- backlog も同じ形にする。`backlog/<id>-<slug>/spec.md`。progress は置かない。ID は `task/` と同じ番号空間
- 昇格は同じ ID のまま `backlog/<id>-<slug>/` を `task/<id>-<slug>/` へ移し、`progress.md` を足す
- 作業ディレクトリ直下の文書は `spec.md` と `progress.md`
- テンプレは `task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md`。見出し名・順番は現行テンプレのまま
- slug は kebab-case のラベルで、一覧から内容が分かるように付ける。識別や突き合わせは ID で行う
- spec と progress は別ディレクトリに置かない。同じ作業ディレクトリに同居する
- その作業の過程で生まれた関連ファイルも、同じディレクトリへ属する
- アーカイブは `task/archive/<id>-<slug>/` へディレクトリごと移す
- 既存の `specs/archive/` と `progress/archive/` は関連ファイルごと移す。ID はアーカイブが古い順の連番、slug は現行ベース名。**Target Spec** は移動後のパスにする
- 進行中の `specs/` / `progress/`（テンプレ以外）はこの作業では動かさない
- テンプレは作業の実体と混線しない

## 範囲外

- 開発ループ（Plan〜Archive）の工程の追加・削除
- テンプレの見出し名・順番の変更
- GitHub Issues などリポジトリ外への作業管理の移行
- 進行中の作業を新しいディレクトリへ移すこと

## 失敗時

未確定。候補:

- ID が 4 桁連番でない、欠ける、または既にある番号と衝突する: 新規作業として受け付けない
- ディレクトリ名に slug が無い、または `task/<id>-<slug>` の形でない: 作業ディレクトリとして扱わない
- 関連ファイルが作業ディレクトリの外にある: その作業の成果物として扱わない
- 既存アーカイブの移行後、`specs/archive/` または `progress/archive/` に作業ファイルが残る: 移行未完了

## 例

未確定。候補:

| 操作または入力 | 期待結果 |
|---|---|
| 作業 ID `0001` を指定する | `task/archive/0001-math-add/spec.md` と `progress.md` がそのディレクトリに揃う |
| `task/` を一覧する | ディレクトリ名から作業の内容が分かる（例: `0001-math-add`、`0003-calc-page`） |
| `backlog/` を一覧する | ディレクトリ名から候補の内容が分かる（例: `0013-cloudflare-preview`） |
| 次の作業または backlog を作る | ID は既存の最大の次（いまは `0015` の次は `0016`） |
| 過程で PNG や JSON が増える | 別作業のファイルを巻き込まない |
| アーカイブする | 例: `task/0016-new-work/` が `task/archive/0016-new-work/` へ移る |
| 既存アーカイブを移す | 下表の ID で `task/archive/<id>-<slug>/` に spec・progress・関連ファイルが揃い、Target Spec が新しいパスになる |
| 進行中の作業 | `specs/` と `progress/` に残ったままである |
| 既存 backlog を移す | `backlog/<id>-<slug>/spec.md` になり、progress は無い |

既存アーカイブの ID（アーカイブが古い順。同コミットはメッセージに出た順）:

| ID | slug |
|---|---|
| `0001` | `math-add` |
| `0002` | `math-sub` |
| `0003` | `calc-page` |
| `0004` | `commit-timing-rules` |
| `0005` | `math-mul` |
| `0006` | `math-div` |
| `0007` | `parallel-worktrees` |
| `0008` | `guard-protected-paths` |
| `0009` | `archive-automation` |
| `0010` | `claude-md-slim` |
| `0011` | `scripts-freeze-procedure` |
| `0012` | `ci-lint` |

既存 backlog の ID（作成が古い順。同コミットは会話で出た順）:

| ID | slug |
|---|---|
| `0013` | `cloudflare-preview` |
| `0014` | `spec-progress-layout` |
| `0015` | `playwright-setup-readonly-cache` |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
