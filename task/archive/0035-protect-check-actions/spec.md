# `tools/check-actions.mjs` の保護

`0033-actions-result-gate` で入れた `tools/check-actions.mjs`（push した HEAD の GitHub Actions の結果を判定し、赤い・未確定のまま会話を終えられないようにする Stop hook の中核）を、CI ガードの保護対象（`GATE_HELPERS`）に加える。

## 種別

改善

## 対象

- 場所:
  - `CLAUDE.md` —「変えてはいけないもの」の一覧に 1 行追加
  - `tools/check-protected-paths.mjs` — `GATE_HELPERS` 配列に `'tools/check-actions.mjs'` を 1 行追加
  - `tests/gate-helpers.test.mjs` — 違反側・許可側のテストケース追加（既存の `GATE_HELPERS` のケースはこのファイルにある）
- 公開面: なし（CI の `protected-paths` ジョブが実行する `node tools/check-protected-paths.mjs` の判定が変わる。新しいコマンドや関数は公開しない）

## 背景

`0033-actions-result-gate` は push 後に GitHub Actions の結果を確認しないまま作業を終えることを機構で塞いだが、判定の中核 `tools/check-actions.mjs` 自体は保護されていない。判定スクリプトを書き換える・削除するだけでゲートを無効化できる。`0033` の spec は「範囲外」で、保護パス一覧への追加を `.claude/skills/add-protected-path` に従う別作業として明示的に切り出しており（`task/archive/0033-actions-result-gate/spec.md`）、本作業がその追随である。

守り方は `.claude/skills/add-protected-path` の表に従い、単一ファイルだが `TEMPLATES` ではなく `GATE_HELPERS` を使う。`TEMPLATES` は違反メッセージが「型（TEMPLATE）」に固定されており実態と食い違い、`status === 'A'` の除外が無いため新規作成まで違反になる。`GATE_HELPERS`（`isGateHelper`）は「CI・hook が委譲する判定・実行ファイル。新規追加は導入 PR のため許可。変更・削除・移動は許さない」という意味で、`tools/check-actions.mjs` の性格に一致する。判定分岐は既存のまま使えるため、`findViolations` のロジック変更は不要である。

なお、ガードは **base リビジョンの** `tools/check-protected-paths.mjs` を実行する。したがって本作業の PR 自身は古い判定で評価され、新しい保護が効くのはマージ後の PR からである。これは想定どおりであり、異常ではない（「範囲外」参照）。

## 仕様

変更後、次が成り立つ。

1. `tools/check-protected-paths.mjs` の `GATE_HELPERS` 配列に `'tools/check-actions.mjs'` が含まれる。何を防ぐかのコメント（書き換えれば Actions 未確認のまま会話を終えられる旨）を添える。
2. `findViolations` は `tools/check-actions.mjs` への次の変更を、既存の理由文字列「検証の委譲先は変更も移動もできない」で違反 1 件と判定する。
   - 内容変更（`status: 'M'`）
   - 削除（`status: 'D'`)
   - リネーム（`oldPath: 'tools/check-actions.mjs'` を持つ `status: 'R'`。`tools/` 外への移動を含む）
3. `findViolations` は `tools/check-actions.mjs` の新規追加（`status: 'A'`、`from` 無し）を違反としない（導入 PR を通すための既存緩和と同じ扱い）。
4. `CLAUDE.md`「変えてはいけないもの」の一覧に `tools/check-actions.mjs` の行がある。既存の委譲先の行にならい、役割（push した HEAD の GitHub Actions 結果の判定。Stop hook が委譲する）と、書き換えると何が起きるか（赤い・未確定の Actions のまま会話を終えられる）を書く。
5. `tests/gate-helpers.test.mjs` に「例」の各行に対応するテストケースがある。違反側（変更・削除・リネーム）と許可側（新規追加）の両方を書く。
6. `findViolations` の既存の判定は変えない。既存テストの期待値は 1 件も変更しない。

## 範囲外

- `tools/check-actions.mjs` 自体の挙動変更
- `tools/check-actions.mjs` 以外のファイルを保護対象に足すこと
- アーカイブ済みの `task/archive/0008-guard-protected-paths/spec.md`・`task/archive/0033-actions-result-gate/spec.md` の編集（完了した作業の記録である）
- 本作業の PR 自身で新しい保護を効かせること。ガードは base リビジョンのチェッカーを実行するため原理的に不可能であり、保護はマージ後の PR から効く

## 失敗時

- マージ後の PR が `tools/check-actions.mjs` を変更・削除・リネームした場合: `protected-paths` ジョブが「検証の委譲先は変更も移動もできない」で落ちる。`allow-protected-change` ラベルによる人間の明示承認がある場合だけ通る
- 本作業の PR 自身: `tools/check-protected-paths.mjs` の変更と `tests/` の変更が、base リビジョンの判定に**それぞれ独立に**引っかかる。これは正しい動作である。`allow-protected-change` ラベルを付けて人間がマージする（`CLAUDE.md`「凍結を解いて改訂するとき」の手続き）

## 例

検証に使う具体例。`empty = { changes: [], baseScripts: {}, headScripts: {} }` とする。

| 操作または入力 | 期待結果 |
|---|---|
| `findViolations({ ...empty, changes: [{ status: 'M', path: 'tools/check-actions.mjs' }] })` | 違反 1 件。`path` は `tools/check-actions.mjs` |
| `findViolations({ ...empty, changes: [{ status: 'D', path: 'tools/check-actions.mjs' }] })` | 違反 1 件 |
| `findViolations({ ...empty, changes: [{ status: 'R', path: 'lib/x.mjs', oldPath: 'tools/check-actions.mjs', similarity: 100 }] })` | 違反 1 件 |
| `findViolations({ ...empty, changes: [{ status: 'A', path: 'tools/check-actions.mjs' }] })` | 違反 0 件（新規追加は許可） |
| `grep -n 'tools/check-actions.mjs' CLAUDE.md` | 「変えてはいけないもの」の一覧の行が見つかる |
| 本作業の PR（ラベル無し）を push | `protected-paths` ジョブが失敗する |
| 同じ PR に `allow-protected-change` ラベルを付けて再実行 | `protected-paths` ジョブが成功する |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 「例」の `findViolations` の 4 行（変更・削除・リネームが違反、新規追加が許可）が `tests/gate-helpers.test.mjs` のテストケースとして存在し、`npm run ci` が通る。既存テストの期待値は変更していない。
6. `CLAUDE.md`「変えてはいけないもの」の一覧に `tools/check-actions.mjs` の行がある。
7. 本作業の PR で、`allow-protected-change` ラベル無しでは `protected-paths` ジョブが失敗し、ラベルを付けると成功する。GitHub Actions の実行結果を根拠にする。
