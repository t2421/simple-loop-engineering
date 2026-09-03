# Blocked の解除条件を機械検査する

Status が `Blocked` の作業について、記録された解除条件が満たされていれば選択可能にする。解除は選択だけであり、実装は自動で始めない。

## 種別

改善

## 対象

- 場所: `tools/start-task.mjs`（選択。`UNSELECTABLE` に `Blocked` を含む）、および / または小さなヘルパー。progress の Status `Blocked` と、明示的な解除述語（例: アーカイブパスの存在）
- 公開面: `node tools/start-task.mjs` の次作業選択。満たされた Blocked を選んでよい状態にする（Status を `Not Started` に戻す、または「解除済みなら Blocked を飛ばす」）
- 凍結対象との関係: `tools/start-task.mjs` は `tools/check-protected-paths.mjs` の `GATE_HELPERS` に入っていない。新設ヘルパーの追加も `appeared`。**検証を弱める変更（Blocked を無条件に選択可能にする、凍結ガードを緩める）にはしない。** `package.json` の scripts や凍結ヘルパーを改訂する案になったら、昇格時に `allow-protected-change` を織り込む

## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。
実測: 2026-09-04 — `task/0042-loop-manifest/progress.md` は Status `Blocked`（解除条件は試行ログの「`task/archive/0044-second-project-port/` が存在すること」のみ）。そのパスは存在するが、`node tools/start-task.mjs` は「選択可能な作業がありません（task/ の archive 以外に Blocked / Done でない作業が無い）」で終了コード 1（`UNSELECTABLE` が `Blocked` を無条件に除外する）。

0042 の解除条件は試行ログの散文だけである。`start-task` は Status を読むが、解除条件は読まない。`Blocked` のまま最小 ID として残り続け、キューを飢餓させる。

ループエンジニアリングの停止 / 解除条件は機械検査であるべき、という側の穴である（Osmani / Anthropic / `/goal`）。人手で Status を戻す前提だと、アーカイブ済みでも Blocked が残る。

判定をどこに置くか（progress に機械可読な述語を足すか、試行ログの定型行をパースするか、ヘルパーがパス存在だけを見るか）と、満たしたときの扱い（Status を書き換えるか、選択時にだけ読み替えるか）は昇格時に確定する。

## 仕様

昇格時に確定する。以下は材料であり、断定ではない。

- Status が `Blocked` で、記録された解除条件が満たされているとき（0042 の条件は `task/archive/0044-second-project-port/` が存在すること）、その作業は選択可能になる
- 満たしたときの扱いは、Status を `Not Started` に戻すか、選択時に「解除済みの Blocked を除外しない」かのいずれか
- **実装を黙って始めない。** 変えるのは選択可能性だけである
- 解除条件が無い、または解釈できないとき、`Blocked` のまま残し、理由を出す。推測して解除しない
- 凍結・検証を弱めない。解除条件が満たされていない `Blocked` を選ばせる変更にはしない

## 範囲外

- L3 の自動マージ
- `STATE.md` と progress の二重書き
- 0042 自体の実装・再スコープ（`feat/0042-loop-manifest` や docs/0042-respec とは混ぜない）
- `Blocked` を廃止すること
- 解除条件が未達の作業を選ばせること

## 失敗時

未確定（incomplete）。昇格時に埋める。候補:

- 解除条件が無い / 解釈できない: `Blocked` のまま。推測しない。パスと理由を出して終了コード非 0（または選択対象から外したまま理由を出す）
- 解除条件が未達: `Blocked` のまま。従来どおり選ばない
- 解除条件は満たしたが Status の書き換えに失敗: 実装を始めず、選択もしない。理由を出す

## 例

未確定（incomplete）。昇格時に埋める。候補:

| 操作または入力 | 期待結果 |
|---|---|
| Status=`Blocked`、解除条件が `task/archive/0044-second-project-port/` の存在、そのパスがある（0042 の形） | 選択可能（`start-task` が「選択可能な作業がありません」で終わらない）。実装は自動開始しない |
| Status=`Blocked`、解除条件が無い / パースできない | `Blocked` のまま。推測して解除しない。理由を出す |
| Status=`Blocked`、解除条件が未達（例: 0043 の「0042 のアーカイブも要る」） | `Blocked` のまま。選ばない |
| 解除後に `node tools/start-task.mjs` | worktree を用意するところまでは既存どおり。解除専用の実装ステップは走らない |

## 完了条件

未確定（incomplete）。昇格時に埋める。

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. <この変更固有の、検証可能な命題。>
