# Progress: `0037-next-id-reservation`

- **Target Spec:** `task/archive/0037-next-id-reservation/spec.md`
- **Branch:** `feat/0037-next-id-reservation`
- **PR:** `https://github.com/t2421/simple-loop-engineering/pull/70`
- **Status:** `Done`
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/start-task-claim.test.mjs`。既存の `tests/start-task.test.mjs` は凍結対象なので触らない)
- [x] 実装 (`tools/start-task.mjs` に `--claim <slug> [--in <task|backlog>]` を追加)
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `04:07` - backlog から `task/0037-next-id-reservation/` へ昇格。完了条件を確定（`--claim` は `--in task` 既定で `task/` と `backlog/` の両方に対応、テストは一時ディレクトリを `rootDir` に渡して検証）し、progress を新規作成した。
- `11:13` - `tools/start-task.mjs` に `claimId` / `isValidSlug` / `CLAIM_PLACES` を追加し、CLI に `--claim <slug> [--in <task|backlog>]` を足した。テストは `tests/start-task-claim.test.mjs`（12 件）。既存の `tests/start-task.test.mjs` は触っていない。`npm run ci` は 413 件全通過。CLI の実挙動も一時 git リポジトリで確認した（採番 0042 → claim → 次の採番 0043、slug 衝突・不正 slug・不正 `--in` はいずれも何も作らず exit 1）。
- `12:05` - `codex-reviewer` から**不承認**（Critical 0 / High 3）。以下を修正した。
- `12:05` - High 1（`--claim foo --in` の値欠落が既定の `task` に化けて確保に成功する）を修正。CLI の引数解釈を純関数 `parseCliArgs(argv)` に切り出し、`--in` は値とセットでしか受けない形にした。値の欠落・slug の欠落・余分な引数・未知のフラグはすべて USAGE で exit 1。回帰テスト 5 本を追加。
- `12:05` - High 2（slug や置き場が違う 2 者は同じ ID でもパスが異なり、両方 mkdir に成功して重複 ID が残る）を修正。`mkdir` 成功後に **ID をキーにして** `task/`・`task/archive/`・`backlog/` を走査し直し、同じ ID の別ディレクトリを見つけたら自分が作った空ディレクトリだけを消して失敗を返す。spec の「仕様」が禁じるロックファイルは導入しておらず、作成自体は非 recursive な `mkdirSync`（EEXIST 検知）のままなので、仕様の機構は変えていない。双方が相手を見て双方降りることはあるが、重複が残るより安全側であり「再実行すれば次の ID を得る」という仕様の失敗時の扱いと整合する。回帰テスト 2 本を追加。
- `12:05` - High 3（確保した空ディレクトリに `progress.md` が無いため、`readTaskEntries` が例外を投げて開発ループの手順 1 `node tools/start-task.mjs` が全員分落ちる）を修正。**`spec.md` も `progress.md` も無いディレクトリ**を「確保中」とみなして選択対象から外す。`spec.md` があるのに `progress.md` が無い場合は従来どおり書式の破損として失敗させるので、既存のガードの意図は落ちていない。既存の `tests/start-task.test.mjs` は 1 行も変更していない。回帰テスト 2 本を追加。
- `12:05` - Low 2 件（確保に失敗したとき自分が作った置き場ディレクトリが残る／余分な引数が黙って無視される）も併せて修正し、テストを足した。`npm run ci` は 425 件全通過。
- `12:45` - 再レビュー（2 回目）で**不承認**（Critical 0 / High 1）。事後走査の述語が ID しか見ていないため、事前チェック通過後に相手が同じ slug を先に確保すると、こちらは次の ID を採って成功し、同じ題材の作業が 2 つの ID で並ぶ（`0042-foo` と `0043-foo`）。述語を事前チェックと対称にし、`w.id === id || w.slug === slug` の両方を見るようにした。回帰テスト 2 本を追加（同一 slug の並行 claim、置き場をまたぐ同一 slug）。`npm run ci` は 427 件全通過。
- `12:45` - 同レビューの Low 1（埋められないまま放置された確保を誰も検知できない）は spec の「範囲外」「失敗時」に記述が無く、本作業で直す対象ではないと判断した。必要なら backlog 候補として別途起票する。
- `13:05` - 再レビュー（3 回目）で**承認**（Critical 0 / High 0）。完了条件 1〜7 をすべて満たしていることも承認側で照合された。
- `13:05` - 同レビューの Low 2（番号空間の桁溢れ）を修正。最大 ID が `9999` のとき `nextId` は `10000` を返すが、`WORK_DIR_RE` は 4 桁しか認識しないため、確保しても以後の走査から消え、別の slug が同じ `10000` を再確保できる。claim は作る前に 4 桁に収まらない ID を拒むようにした。`--next-id` 単体の振る舞いは変えていない（完了条件 6）ことをテストで固定した。`npm run ci` は 429 件全通過。
- `13:05` - 同レビューの Low 1（`spec.md` はあるが `progress.md` がまだ無い過渡状態で選択が落ちる）は main 時点から存在する挙動で、本差分はむしろ緩和側に動かしているとの評価。本作業の範囲外とした。
- `13:15` - PR #70 を作成した。見た目の変更は無いため（`node tools/e2e-needed.mjs main` が `needed=false`）スクリーンキャプチャは添付していない。
