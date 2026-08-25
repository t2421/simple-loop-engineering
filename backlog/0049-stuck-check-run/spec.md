# 取り残された check-run の検知と再実行

GitHub が `status` を更新しないまま残した check-run によって Stop hook が待ち続ける事象に、判定を緩めずに対処する。

## 種別

改善

## 対象

- 場所: `tools/check-actions.mjs`（**凍結対象**）、または Stop hook から呼ぶ運用手順
- 公開面: push 後に Actions の結果を確認する経路

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

`tools/check-actions.mjs` は「未確定を成功として扱わない」設計どおりにブロックした。**ツールは誤作動していない。** 480 秒待っても解消せず、Stop hook が通らなかった。

対処として同じ Guard run を再実行したところ、`completed/success` に置き換わり 5 チェックすべて正常になった。

```
$ gh run rerun 32672846210
$ gh api .../actions/runs/32672846210/jobs
progress-coupling  completed/success
protected-paths    completed/success
```

つまり**再実行すれば直る。判定を緩める必要はない。**

## 仕様

この状態を検知し、待ち続ける代わりに解消できるようにする。

- 検知の条件は「`status` が未完了なのに `conclusion` が入っている」または「親 run が `completed` なのに配下 job が未完了のまま」
- 検知したときの扱いは、再実行を促す案内を出すか、自動で再実行するかのいずれか
- **未確定を成功として扱う変更にはしない。** それは検証を弱める

`tools/check-actions.mjs` は `CLAUDE.md`「変えてはいけないもの」の凍結対象である。この作業がツール本体を改訂するなら、`CLAUDE.md`「凍結を解いて改訂するとき」の手続き（改訂の内容と理由を spec に書き、`allow-protected-change` ラベルを付けた PR を人間がマージする）に従う。**判定を成功側に倒す変更に見えやすいので、検証を弱めないことの論証を spec に明示する必要がある。** ツールを触らず運用手順だけで閉じる案も昇格時に比較する。

## 範囲外

- 未確定を成功として扱う変更
- `CHECK_ACTIONS_TIMEOUT_SEC` の既定値を延ばすだけの対処（原因は時間ではない）
- GitHub 側の不整合そのものの修正

## 失敗時

未確定（incomplete）。昇格時に埋める。候補:

- 再実行しても解消しない: 成功として扱わず、ブロックしたまま理由を出す
- 検知条件に当たらない通常の未確定: 従来どおり待つ

## 例

未確定（incomplete）。昇格時に埋める。

| 操作または入力 | 期待結果 |
|---|---|
| `<昇格時に記入>` | `<昇格時に記入>` |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
