# Progress: `tools/archive.mjs` を `task/` レイアウトへ追随させる

- **Target Spec:** `task/0018-archive-tool-task-layout/spec.md`
- **Branch:** `feature/archive-tool-task-layout`
- **PR:** 未作成
- **Status:** In Progress (Phase: Verify (外部))

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

既存 `tests/archive.test.mjs` を大きく書き換えるため、`allow-protected-change` ラベルが要る。改訂の内容と理由は spec に書く（CLAUDE.md「凍結を解いて改訂するとき」）。`0017-guard-task-paths` のマージ後に着手すると、`task/` も凍結対象になっている前提で書ける。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成（一時ディレクトリ上の `task/` レイアウト）
- [x] 実装 (`tools/archive.mjs`)
- [x] CLAUDE.md「アーカイブ」節から旧対の記述を落とす
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。`allow-protected-change` ラベルを付ける）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 17:52 - `0016-archive-pr-ownership` のアーカイブで実際に踏んだ問題を spec 化。ツールが旧レイアウト（`specs/archive/`）へ置くため手作業で `task/archive/` に置き直した。`0017-guard-task-paths` の後に着手する。未着手。
- `10:05` - 着手。`node tools/start-task.mjs`（0020 で入れたツール）が選択と worktree 作成を行った。選ばれたのは 0021 ではなく **0018**（Blocked / Done を除く最小 ID）。決定論的な選択が私の予想を上書きした形で、これが本来の挙動である。
- `10:12` - TDD。`task/` レイアウトのテストを先に書き RED を確認（16 中 6 fail）。実装後 32/32 GREEN。
- `10:15` - 設計。ディレクトリごと 1 回の `renameSync` にしたため、`collectArtifacts`（`progress/` 直下の名前から抽出物を推測する関数）が不要になり削除した。名前の推測に依存した「別作業を巻き込む/取り残す」危険が構造的に消える。作業名の判定は `isWorkName`（`^\d{4}-[A-Za-z0-9][A-Za-z0-9-]*$`）に一本化し、型（`TEMPLATE-spec`）・パス区切り・`..` を同時に弾く。
- `10:18` - **テストが巻き戻し経路に届いていない欠陥を自分で踏んだ。** 移設したテストは作業ディレクトリを `chmod 0o500` して失敗させていたが、macOS ではディレクトリ自体の rename が失敗するため、移動後の書き換え失敗（＝巻き戻し経路）を通らない。`progress.md.tmp` と同名のディレクトリを置いて書き込みだけを失敗させる方式に変えた。chmod に依存しないので root でも再現でき、`skip` も外せた。
- `10:20` - 同時に**実装の欠陥も見つかった**。ディレクトリ移動が try/catch の外にあり、EACCES がそのまま送出されて CLI がスタックトレースで落ちていた。移動と進捗の初回読み取りを保護し、いずれも「何も変更せず理由を返す」に統一した。回帰テストを 2 件追加（`task/archive` がファイルの場合、書き換え失敗時の巻き戻し）。
- `10:25` - `npm run ci` 182 pass / 0 fail。実 CLI の失敗経路 5 種（PR 未作成・型・引数なし・存在しない作業・アーカイブ済み）を実リポジトリ上で確認し、いずれも非 0 かつ作業ツリーに変更なし。
- `10:30` - **happy path は stub gh で実 CLI を通した。** ユニットテストは `checkPr` / `getRepo` を注入で差し替えるため `gh` 配線（`checkPrWithGh` / `getRepoWithGh`）が未検証になる。一時リポジトリと stub `gh` を PATH 前置して実行し、ディレクトリごとの移動・Figma 抽出物の同行・Status `Done`・Target Spec の書き換え・チェック項目 `[x]`・試行ログの保存を確認した。
- `10:32` - 申し送り: Status 行は行ごと置換するため `(Phase: ...)` 接尾辞が落ちる（アーカイブ済みの作業に現在の工程は無いため意図どおり）。また CLAUDE.md「仕様」節に `specs/` と `progress/` の旧対が `tools/archive.mjs` に従うという記述が残っている。本 spec の「対象」は「アーカイブ」節に限定されており、旧対の撤去は「範囲外」なので触っていない。該当する旧対は現在 0 件（`specs/` は TEMPLATE.md のみ）で実害は無いが、旧レイアウト撤去の作業で併せて直すのが筋である。
