# 実装 PR と progress 更新の結合を CI で検査する

実装ファイルを変更する PR が、対応する作業の `progress.md` をちょうど 1 つ更新していることを CI で検査する。

## 種別

改善

## 対象

- 場所: `tools/check-progress-coupling.mjs`、`tests/progress-coupling.test.mjs`、`.github/workflows/guard.yml`（ジョブ追加）
- 場所: `tools/check-protected-paths.mjs` の `GATE_HELPERS`、`CLAUDE.md`「変えてはいけないもの」、`tests/gate-helpers.test.mjs`（新チェッカーを保護対象に加える。`.claude/skills/add-protected-path` の手順に従う）
- 公開面: PR 上の `progress-coupling` チェック

## 背景

「工程を進めるたびに progress を更新し、実装と同じ PR に含める」は規約だが強制されておらず、progress 更新の抜けた実装 PR を機械的に検知できない。1 PR に複数作業を混ぜる逸脱も同様である。

`.github/workflows/` は保護対象だが、この変更は検証を**強める**追加である。CLAUDE.md「凍結を解いて改訂するとき」の手続きに従い、PR に `allow-protected-change` ラベルを付けて人間がマージする。

## 仕様

- PR の差分（base との比較）に `src/`・`tests/`・`tools/` 配下の変更が含まれるとき、`task/<id>-<slug>/progress.md`（`archive/` 以外）の変更が**ちょうど 1 件**含まれることを要求する
- docs のみの PR（上記 3 ディレクトリに変更が無い PR）は対象外とし、常に通過する
- PR に `no-progress-needed` ラベルが付いている場合は検査を通過させる（作業に紐づかないルール変更の逃げ道。人間が付ける）
- 更新された progress が**その PR の作業のもの**であることを要求する。PR の head ブランチ名と、その `progress.md` の **Branch** メタ情報が一致することを検査する。書式の解釈は `tools/archive.mjs` の `readBranch()` に揃える（件数が合っているだけでは、別作業の progress を 1 行触るだけで通せる）
- head ブランチ名は CI では `GITHUB_HEAD_REF` から得る。得られないとき（ローカルでの手動実行）は帰属の照合を行わない。ただし GitHub Actions 上（`GITHUB_ACTIONS=true`）で得られない場合は失敗させる（`pull_request` イベントでは必ず入るため、空は配線の異常である）
- 判定は `tools/check-progress-coupling.mjs` が行い、CI は `tools/check-protected-paths.mjs`・`tools/e2e-needed.mjs` と同じ理由で **base リビジョンの版**を実行する
- `tools/check-progress-coupling.mjs` 自体を保護対象に加える（`tools/check-protected-paths.mjs` の `GATE_HELPERS`）。内容変更・削除・リネームは違反とし、新規追加（このチェックの導入 PR）は許す
- 旧 `progress/` レイアウトは対象外（移行済みの資産のみが残る）

## 範囲外

- progress の中身（チェックの進み方）の検証
- main への直接コミットの検査（アーカイブ経路。ガードと同じく `pull_request` のみ）
- worktree 運用の検査（`0021-loop-hooks` の範囲）

## 失敗時

- 実装変更があり progress 更新が 0 件: チェック失敗
- 実装変更があり progress 更新が 2 件以上: チェック失敗（1 PR = 1 作業）
- 更新された progress の **Branch** が PR の head ブランチと一致しない、または **Branch** の行が無い: チェック失敗
- `GITHUB_ACTIONS=true` なのに head ブランチ名が得られない: チェック失敗（fail-closed）
- 差分の取得に失敗: チェック失敗（fail-closed）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| `src/math.mjs` と `task/0026-a/progress.md` を変更した PR | 通過 |
| `src/math.mjs` のみ変更した PR | 失敗 |
| `src/math.mjs` と `task/0026-a/progress.md`・`task/0027-b/progress.md` を変更した PR | 失敗 |
| `task/0026-a/spec.md` のみ変更した PR（docs のみ） | 通過 |
| `tools/x.mjs` のみ変更し `no-progress-needed` ラベルの付いた PR | 通過 |
| `task/archive/0001-math-add/progress.md` の変更だけを progress 更新として数えた PR | 失敗（archive は数えない） |
| head ブランチ `feature/a` の PR が `src/math.mjs` と、**Branch** が `feature/a` の `task/0026-a/progress.md` を変更 | 通過 |
| head ブランチ `feature/a` の PR が `src/math.mjs` と、**Branch** が `feature/b` の `task/0027-b/progress.md` を変更 | 失敗（別作業の progress） |
| head ブランチ名が得られない実行（ローカル）で、`src/math.mjs` と base にある `task/0026-a/progress.md` を変更 | 通過（帰属は照合しない） |
| `GITHUB_ACTIONS=true` で `GITHUB_HEAD_REF` が空のまま実行 | 失敗（fail-closed） |
| `tools/check-progress-coupling.mjs` を変更した差分 | ガードが違反として検知 |
| `tools/check-progress-coupling.mjs` を新規追加した差分 | ガードは違反としない（導入 PR） |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の各行が `tests/progress-coupling.test.mjs` のユニットテスト（差分リストとラベルを注入）で網羅されている。workflow は base リビジョンのチェッカーを実行している。`.github/workflows/` の変更は `allow-protected-change` ラベルの PR で行われている。
