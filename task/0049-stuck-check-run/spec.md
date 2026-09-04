# 取り残された check-run の検知と再実行

GitHub が `status` を更新しないまま残した check-run によって Stop hook が待ち続ける事象に、判定を緩めずに対処する。

## 種別

改善

## 対象

- 場所: `loop-core/gate/check-actions.mjs`（**凍結対象**。0043 以降の所在。旧 `tools/check-actions.mjs` は存在しない）。公開関数 `classify` / `decide` と、取り残しを判定する純関数。新規テストは `tests/check-actions-stuck.test.mjs`（`tests/` への新規追加はガードが違反にしない）
- 公開面: `node loop-core/bin/loop.mjs check-actions`（Stop hook 後段）。push 後に Actions の結果を確認する経路
- 凍結対象に触れるか: **触れる。** `loop-core/gate/check-actions.mjs` の内容変更は `protected-paths` が違反と判定する。**実装 PR には `allow-protected-change` ラベルが要り、人間がマージする。** 既存 `tests/check-actions.test.mjs` の期待値は変えない。運用手順（CLAUDE.md の 1 行追記）だけに閉じる案は採らない

## 背景

2026-08-24、PR #63 で `progress-coupling` の check-run が矛盾した状態のまま残った。

```
=== check-runs (head 4b0476c) ===
protected-paths    completed/success
progress-coupling  in_progress/success   ← status と conclusion が矛盾
preview            completed/success
verify             completed/success
e2e                completed/success

=== workflow runs ===
32672846210 Guard    completed/success
32672846179 CI       completed/success
32672846217 preview  completed/success
```

この job は `conclusion=success` と `completed_at=2026-08-23T23:10:58Z` を持ちながら `status` が `in_progress` のままだった。親の Guard run は `completed/success` である。run が完了・成功しているのに配下の job だけが走行中として残る状態は、GitHub 側の不整合である。

現行の `classify` は `status !== 'completed'` をすべて `pending` にする。`in_progress/success` もここに落ち、`decide` は上限（既定 480 秒）まで待ったあと「未確定」でブロックする。**ツールは誤作動していない。未確定を成功として扱っていない。** 480 秒待っても解消せず、Stop hook が通らなかった。

対処として同じ Guard run を再実行したところ、`completed/success` に置き換わり 5 チェックすべて正常になった。

```
$ gh run rerun 32672846210
$ gh api .../actions/runs/32672846210/jobs
progress-coupling  completed/success
protected-paths    completed/success
```

つまり**再実行すれば直る。判定を緩める必要はない。**

### この作業は凍結改訂である

`loop-core/gate/check-actions.mjs` は `CLAUDE.md`「変えてはいけないもの」と `loop-core/gate/check-protected-paths.mjs` の `GATE_HELPERS` に入っている。書き換えれば、赤い・未確定の Actions のまま会話を終えられる。この作業は判定本体を改訂するため、`CLAUDE.md`「凍結を解いて改訂するとき」の手続きに従う。改訂の内容と理由をこの spec に書き、実装 PR に `allow-protected-change` を付け、人間がマージする。

### 昇格時に比較した案

1. **運用手順だけ**（CLAUDE.md に `gh run rerun` を書く。凍結ファイルは触らない）
2. **判定本体を改訂する**（取り残しを検知し、待ち続けずに案内または 1 回の再実行へ進める）

案 1 は 480 秒の待機を止めない。Stop hook は `pending` のまま上限まで眠り、エージェントが案内を見る前に固まっている。採らない。

案 2 を採る。検知してから案内（既定）または自動再実行（任意）へ進める。どちらを選んでも、取り残し・通常の未確定を成功にしてはいけない。

### なぜこの改訂は検証を弱めないか

現行: 取り残しは `pending` → 上限まで待つ → 「未確定」でブロック（exit 2）。通さない。

改訂後: 取り残しは待たずに非成功として扱う。案内を出してブロックする（exit 2）。自動再実行を入れるなら最大 1 回だけ再実行し、その後の判定は現行と同じ表に戻す。再実行後も取り残し・未確定なら、やはりブロックする。

通す条件は変えない。

- `PASSING_CONCLUSIONS` は `success` / `skipped` のまま。`in_progress` に `conclusion` が入っている状態を通さない
- 通常の未確定（`status` 未完了かつ `conclusion` が空、親 run も未完了）は、現行どおり上限まで待ち、超過したら「未確定」でブロックする
- 上限超過を成功にしない。`CHECK_ACTIONS_TIMEOUT_SEC` の既定は延ばさない
- 静穏期間（遅れて現れる check-run を取りこぼさない）は、全チェックが本当に完了して成功したときだけ使う
- fail-open（`gh` 不在・API エラー）と `stop_hook_active` の停止ループ対策は現行のまま

待たずに落とす・再実行を促す変更であり、落とすべきものを通す変更ではない。判定を成功側に倒していない。

## 仕様

取り残された check-run を検知し、上限まで待ち続ける代わりに解消できるようにする。**未確定を成功として扱わない。**

### 検知

次のいずれかで取り残しとする。両方に当たることもある（PR #63）。

- **条件 A:** check-run の `status` が `completed` 以外で、かつ `conclusion` が空でない（`null` / 欠落 / 空文字以外）
- **条件 B:** 親の workflow run の `status` が `completed` で、配下の job / check-run の `status` が `completed` 以外

条件 B を判定するため、取得面は check-run の `name` / `status` / `conclusion` に加え、親 run の `run_id` と `run_status` を渡せるようにする（`fetchChecks` の要素に載せるか、同等の注入口を足す）。GitHub API の追加呼び出しは実装の詳細であり、テストは注入で行う。

通常の未確定（条件 A にも B にも当たらない `in_progress` + `conclusion` 空 + 親 run 未完了）は取り残しではない。

### 検知したとき

既定は案内である。自動再実行は任意（環境変数で選ぶ）。

1. **案内（必須）:** 取り残しを検知したら、残りのタイムアウトまで待たない。exit 2 でブロックし、stderr に次を出す。
   - 取り残したチェック名
   - 当たった条件（A / B）が分かる文言
   - 親 run を再実行するコマンド（`gh run rerun <run_id>`。`run_id` が取れるとき）
   - 現行どおり「結果を確認するまで完了と報告しないでください」
2. **自動再実行（任意）:** `CHECK_ACTIONS_RERUN_STUCK` が正の整数または `1` のときだけ、同じ親 run を最大 1 回再実行してから現行の判定表で再取得する。2 回目以降の自動再実行はしない。再実行後も取り残し、または通常の未確定のまま上限を超えたら、成功にせずブロックする。この経路を実装しない場合、案内だけで「検知したときの扱い」を満たす。

`stop_hook_active` が真のときは、現行どおりブロックしない（exit 0）。ただし取り残しであることは述べ、成功メッセージ（`HEAD のチェックはすべて成功しています`）は出さない。

### 変えない判定

- 全チェックが `completed` かつ `success` / `skipped` で、チェック名の集合が静穏期間変わらない: 通す
- 1 つでも `completed` かつ非成功（`failure` / `cancelled` / `timed_out` / `action_required` / `neutral` など）: ブロック
- 通常の未確定: 上限まで待ち、超過は「未確定を成功として扱いません」でブロック
- 未 push・チェック 0 件・`gh` 不在 / API エラー: 現行の fail-open

## 範囲外

- 未確定を成功として扱う変更
- `CHECK_ACTIONS_TIMEOUT_SEC` の既定値を延ばすだけの対処（原因は時間ではない）
- GitHub 側の不整合そのものの修正
- 既存 `tests/check-actions.test.mjs` の期待値変更（0033 の判定表を緩めること）
- `package.json` の `scripts` と `.github/workflows/` の変更

## 失敗時

- 条件 A または B の取り残し: 待たずにブロック（exit 2）。成功メッセージは出さない。案内にチェック名と `gh run rerun <run_id>`（取れるとき）を含む
- 再実行しても解消しない（同じ取り残しが残る、または通常の未確定のまま上限超過）: 成功として扱わず、ブロックしたまま理由を出す。自動再実行を実装していても 2 回目は走らせない
- 検知条件に当たらない通常の未確定: 従来どおり待ち、上限超過は「未確定」でブロックする
- 自動再実行を選んだが `gh run rerun` が失敗する: 成功にせずブロックする。失敗理由を出す
- `stop_hook_active` が真で取り残しが残る: ブロックしない（停止ループを作らない）が、取り残しである旨は述べ、成功とは書かない
- `allow-protected-change` ラベル無しの PR は `protected-paths` が検知して失敗する（正しい挙動）

## 例

検証に使う具体例。1〜8 は `gh` 呼び出し・時刻・待機・再実行を注入したユニットテスト（実時間も実ネットワークも使わない）。9〜10 は実装 PR の Guard 実測。

| 操作または入力 | 期待結果 |
|---|---|
| 1. `{name:'progress-coupling', status:'in_progress', conclusion:'success', run_id:32672846210}` を `classify` / `decide` に注入（条件 A。PR #63 の形） | 取り残し。`decide` は sleep せず exit 2。行に `progress-coupling` と `gh run rerun 32672846210`。成功メッセージは無い |
| 2. `{name:'job', status:'in_progress', conclusion:null, run_status:'completed', run_id:1}` を注入（条件 B） | 取り残し。待たずに exit 2。行にチェック名と `gh run rerun 1`。成功メッセージは無い |
| 3. `{name:'e2e', status:'in_progress', conclusion:null, run_status:'in_progress'}` を注入し、注入時計を上限超まで進める | 通常の未確定。取り残しにしない。上限超過で exit 2。行に「未確定を成功として扱いません」 |
| 4. 全チェック `completed/success` を注入し、静穏期間を満たす | 現行どおり通す（exit 0）。成功メッセージが出る |
| 5. 例 1 の取り残しを、成功（exit 0 かつ成功メッセージ）と判定する実装 | 禁止。テストが落ちる |
| 6. 例 1 のあと再実行せず、同じ取り残しが残る | 成功にしない。exit 2。理由に取り残しである旨 |
| 7. `stop_hook_active: true` と例 1 を同時に注入 | exit 0（停止ループ防止）。行に取り残しである旨。成功メッセージは無い |
| 8. （自動再実行を実装する場合のみ）`CHECK_ACTIONS_RERUN_STUCK=1` で例 1 を注入し、1 回目の再実行後に `completed/success` へ遷移させる。同じ stuck が再実行後も残る列も注入する | 再実行は最大 1 回。遷移して静穏を満たせば通す。残ったら 2 回目は走らせず exit 2 |
| 9. `loop-core/gate/check-actions.mjs` を変えた実装 PR を `allow-protected-change` 無しで出す | `protected-paths` が失敗する。ログに `loop-core/gate/check-actions.mjs` が違反として出る |
| 10. 同じ PR に `allow-protected-change` を付けて再実行 | `protected-paths` が成功する。ログに「ラベル allow-protected-change があるため通過させます」 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. 条件 A（`status` 未完了かつ `conclusion` が入っている）を取り残しと判定する。`decide` は残りのタイムアウトまで待たず exit 2 でブロックし、チェック名と `gh run rerun <run_id>`（取れるとき）を出す。成功メッセージは出さない。「例」1 のユニットテスト出力を根拠にする。
6. 条件 B（親 run が `completed` で配下 job が未完了）を取り残しと判定する。扱いと根拠は完了条件 5 と同じ。「例」2 のユニットテスト出力を根拠にする。
7. 取り残しと通常の未確定を、いずれも成功として扱わない。例 1 の入力で exit 0 かつ成功メッセージ、例 3 の上限超過で exit 0、のいずれもテストが落ちる。「例」3・5・6 の出力を根拠にする。
8. 通常の未確定は現行どおり待つ。上限超過は「未確定を成功として扱いません」でブロックする。`CHECK_ACTIONS_TIMEOUT_SEC` の既定（480）は変えない。「例」3 と、既存 `tests/check-actions.test.mjs` の「例 4」（未確定タイムアウト）が pass することを根拠にする。
9. 「例」1〜7（と、自動再実行を実装するなら 8）が `tests/check-actions-stuck.test.mjs` にあり、`gh`・時刻・待機・再実行を注入して検証する。実時間も実ネットワークも使わない。`node --test tests/check-actions-stuck.test.mjs` と `node --test tests/check-actions.test.mjs` がともに pass する。
10. 既存の判定表を緩めていない。`PASSING_CONCLUSIONS` は `success` / `skipped` のまま。`tests/check-actions.test.mjs` の既存ケース（failure / cancelled / timed_out / action_required / neutral の block、静穏期間、fail-open、`stop_hook_active`）の期待値を変えていないことを `git diff main -- tests/check-actions.test.mjs` が空であることで示す。
11. 実装 PR は、ラベル無しで `protected-paths` が失敗し（違反に `loop-core/gate/check-actions.mjs` が出る）、`allow-protected-change` ラベル付きの再実行で成功する。「例」9・10 の Actions ログを根拠にする。
12. 公開面は `node loop-core/bin/loop.mjs check-actions` のままである。旧パス `tools/check-actions.mjs` を復活させない。`package.json` の `scripts` と `.github/workflows/` に差分が無い。
