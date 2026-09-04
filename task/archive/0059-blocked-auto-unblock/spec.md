# Blocked の解除条件を機械検査する

Status が `Blocked` の作業について、記録された解除述語が満たされていれば選択可能にする。解除は選択だけであり、実装は自動で始めない。

## 種別

改善

## 対象

- 場所: `loop-core/ledger/start-task.mjs`（選択。`UNSELECTABLE` に `Blocked` を含む）、および / または同じ ledger 配下の小さなヘルパー。progress の Status `Blocked` と、機械可読な解除述語（初回はパス存在）
- 公開面: `node loop-core/bin/loop.mjs start-task` の次作業選択。満たされた Blocked を選んでよい状態にする。Status は書き換えない（選択時に読み替える）
- 凍結対象との関係: `loop-core/ledger/start-task.mjs` は `loop-core/gate/check-protected-paths.mjs` の `GATE_HELPERS` に入っていない。新設ヘルパーと `tests/` へのテスト追加も `appeared`。`loop-core/bin/loop.mjs` は凍結対象なので、この作業では触らない（既存の `start-task` 委譲のまま）。**検証を弱める変更（Blocked を無条件に選択可能にする、凍結ガードを緩める、`package.json` の scripts や凍結ヘルパーを改訂する）にはしない。** `allow-protected-change` は不要

## 背景

実測: 2026-09-04 — `task/0042-loop-manifest/progress.md` は Status `Blocked`（解除条件は試行ログの「`task/archive/0044-second-project-port/` が存在すること」のみ）。そのパスは存在するが、当時の `node tools/start-task.mjs` は「選択可能な作業がありません（task/ の archive 以外に Blocked / Done でない作業が無い）」で終了コード 1（`UNSELECTABLE` が `Blocked` を無条件に除外する）。0043 以降の公開面は `node loop-core/bin/loop.mjs start-task`、実装は `loop-core/ledger/start-task.mjs`。選択の除外集合は同じである。

0042 の解除条件は試行ログの散文だけである。`start-task` は Status を読むが、解除条件は読まない。`Blocked` のまま最小 ID として残り続け、キューを飢餓させる。

ループエンジニアリングの停止 / 解除条件は機械検査であるべき、という側の穴である（Osmani / Anthropic / `/goal`）。人手で Status を戻す前提だと、アーカイブ済みでも Blocked が残る。

この作業で確定する判定は次のとおり。progress のコードフェンス外に `- **Unblock:** \`path-exists:<リポジトリ相対パス>\`` を置く。満たされていれば選択時にだけ読み替える。試行ログの散文は解釈しない。Status は自動で書き換えない。実装は自動で始めない。

## 仕様

- progress の解除述語は、コードフェンス外の `- **Unblock:**` 行だけを読む（他メタ情報と同じ。`parseMetadata` / `findMetaValue` と同じ行集合）。値からバッククォートを剥がす
- この作業が解釈する述語は `path-exists:<リポジトリ相対パス>` だけである。`<リポジトリ相対パス>` は `/` 区切り、空セグメント無し、`.` / `..` 無し、先頭 `/` 無し。末尾 `/` はディレクトリとして許容し、有無は同値とする。満たす条件は、リポジトリルートからのそのパスが存在すること（ファイルでもディレクトリでもよい）
- Status が `Blocked` で、記録された解除述語が解釈でき、かつ満たされているとき、その作業は選択可能になる。`UNSELECTABLE` が `Blocked` を無条件に除外する現状を、この場合に限って外す
- 満たしたときの扱いは**選択時の読み替えだけ**である。`start-task` は progress の Status を `Not Started` にも `In Progress` にも書き換えない
- **実装を黙って始めない。** 変えるのは選択可能性だけである。`start-task` が選んだあとに worktree を用意するところまでは既存どおり（Plan）。解除専用の Implement ステップ（対象ファイルの編集、テスト追加の起動）は走らない
- 解除述語が無い、または解釈できないとき、その作業は `Blocked` のまま選択対象外にする。試行ログの散文や未対応の述語名から推測して解除しない。理由（作業パスと、無い / 解釈できない旨）を出す
- 解除述語が解釈できるが未達のとき、その作業は `Blocked` のまま選ばない。従来どおり
- 凍結・検証を弱めない。解除述語が無い・解釈できない・未達の `Blocked` を選ばせる変更にはしない。既存の「Blocked を除く」テストは、述語が無い入力に対して今までどおり通る

## 範囲外

- L3 の自動マージ
- `STATE.md` と progress の二重書き
- 0042 自体の実装・再スコープ（`feat/0042-loop-manifest`、`docs/0042-respec`、PR #83 とは混ぜない）
- PR #90（0047 の live-file replace 削除）には触れない
- `Blocked` を廃止すること
- 解除述語が未達の作業を選ばせること
- 試行ログの散文を解除述語としてパースすること（推測になる）
- Status の自動書き換え
- `path-exists:` 以外の述語（時刻・PR マージ済み・ラベルなど）
- `loop-core/bin/loop.mjs`・`package.json` の scripts・凍結ヘルパー・`loop.manifest.json` の改訂

## 失敗時

- 解除述語が無い（`- **Unblock:**` 行がコードフェンス外に無い）: その作業は `Blocked` のまま選ばない。推測しない。作業パスと「解除述語が無い」旨を出す。選択可能な作業が他に無ければ終了コード非 0
- 解除述語が解釈できない（空、`path-exists:` 以外、相対パスが `.` / `..` / 先頭 `/` / 空セグメントを含む）: その作業は `Blocked` のまま選ばない。推測しない。作業パスと「解釈できない」旨を出す。選択可能な作業が他に無ければ終了コード非 0
- 解除述語は解釈できるが未達（例: `path-exists:task/archive/9999-none/` でそのパスが無い）: その作業は `Blocked` のまま選ばない。従来どおり
- 選択可能な作業が無い（満たされた Blocked も含め候補が空）: worktree を作らず、理由を出して終了コード非 0。実装は始めない

## 例

検証は一時ディレクトリ上の git リポジトリと progress で行う。公開面は `node loop-core/bin/loop.mjs start-task`（テストは `startTask` / 選択の純関数を直接呼んでよい）。

| 操作または入力 | 期待結果 |
|---|---|
| Status=`Blocked`、`- **Unblock:** \`path-exists:task/archive/0044-second-project-port/\``、そのパスがある | 選択可能。`start-task` が「選択可能な作業がありません」で終わらない。Status は `Blocked` のまま。実装は自動開始しない |
| Status=`Blocked`、`- **Unblock:**` 行が無い | `Blocked` のまま選ばない。推測しない。理由に「解除述語が無い」が出る |
| Status=`Blocked`、`- **Unblock:** \`0044 が終わったら\``（パースできない） | `Blocked` のまま選ばない。推測しない。理由に「解釈できない」が出る |
| Status=`Blocked`、`- **Unblock:** \`path-exists:task/archive/9999-none/\``、そのパスが無い | `Blocked` のまま選ばない |
| Status=`Blocked`（述語無し）と Status=`Not Started` の作業が並ぶ | 従来どおり `Not Started` を選ぶ。述語無しの Blocked は除外される |
| 満たされた Blocked を選んだあと `start-task` が worktree を用意する | 既存どおり worktree 作成まで。解除専用の実装ステップは走らない。progress の Status は書き換わらない |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. Status が `Blocked` でも、コードフェンス外の `- **Unblock:** \`path-exists:<リポジトリ相対パス>\`` が解釈でき、そのパスが存在するとき、`node loop-core/bin/loop.mjs start-task` の選択はその作業を候補に入れる。`tests/start-task.test.mjs`（置くならヘルパー用の新規テスト）が一時ディレクトリでこのケースを検証し、pass する。
6. その選択は実装を自動開始しない。`start-task` は progress の Status を書き換えない。解除判定の副作用として対象の実装ファイルを編集しない。worktree を用意するところまでは既存どおり。テストが「Status が書き換わらない」「解除専用の実装ステップが呼ばれない」を確認する。
7. 解除述語が無い、または解釈できないとき、その作業は `Blocked` のまま選ばれない。試行ログの散文から推測しない。理由（作業パスと、無い / 解釈できない旨）が出る。選択可能な作業が他に無ければ終了コード非 0。テストが「失敗時」の該当行を検証する。
8. 解除述語が未達の `Blocked`、および述語の無い `Blocked` は従来どおり選ばれない。既存の「Blocked を除く」テストが、述語無し入力に対して pass したままである（検証を弱めていない）。
9. 実装差分は `loop-core/ledger/start-task.mjs`（置くなら同じ ledger の小さなヘルパー）と `tests/` のテスト追加に限る。`loop-core/bin/loop.mjs`・`package.json` の scripts・凍結ヘルパー・`loop.manifest.json`・既存テストの期待値を検証を弱める方向に変えていないことを `git diff main --stat` と `npm run ci` で示す。
