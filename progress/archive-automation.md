# Progress: アーカイブ手順の自動化

- **Target Spec:** `specs/archive-automation.md`
- **Branch:** `feature/archive-automation`
- **PR:** 未作成
- **Status:** In Progress

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/archive.test.mjs`。一時ディレクトリ + PR 確認のモック)
- [x] 実装 (`tools/archive.mjs`)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 10:30 - 波 2 として worktree `.worktrees/feature/archive-automation`（ブランチ `feature/archive-automation`、main から作成）で着手。`guard-protected-paths` / `claude-md-slim` と並列。
- 10:50 - TDD。`tests/archive.test.mjs` を先に書き RED（fail 1）。`tools/archive.mjs` を実装して GREEN（9 pass）。PR 確認は `checkPr` として注入可能にし、テストは一時ディレクトリ（`fs.mkdtempSync`）上でモックを使う。移動ロジックは純関数（`readPrUrl` / `rewriteProgress` / `collectArtifacts`）に分離。
- 10:52 - 抽出物の収集で `<作業名>-other.md` のような別作業を巻き込む危険があったため、`collectArtifacts` は `<name>.md` 完全一致と `<name>.` 始まりだけを対象にした。テストに「別作業の似た名前のファイルは巻き込まない」を追加。
- 10:55 - 「失敗時」3 件を実リポジトリで確認。PR 未作成（`guard-protected-paths`）で exit 1、存在しない作業名で exit 1、`TEMPLATE` 指定で exit 1。いずれも `git status` に変更が出ず、ファイルを触っていない。
- 10:58 - `gh` を実際に呼ぶ経路も E2E で確認。マージ済み PR #9 を指す一時リポジトリで実行し、spec / progress / 抽出物（`demo.figma.json`）が `archive/` へ移動、Status が `Done`、Target Spec が `specs/archive/demo.md` に書き換わり、試行ログが保持されることを確認。
- 11:00 - `npm run ci` は 71 pass / 0 fail（既存 62 + archive 9）。既存テストの件数・結果は不変。
- 11:20 - `codex-reviewer` が **不承認**（Critical 0 / High 2 / Medium 3 / Low 3）。
  - H-1: 移動先の衝突チェックが無く、既存の `specs/archive/<name>.md` を無警告で上書きする。CLI は成功時にコミットコマンドを案内するため、破壊がそのままコミットされる導線だった。再現して確認（旧アーカイブの中身が新 spec に置き換わった）。
  - H-2: 実行中に失敗すると spec だけ移動して progress が元位置に残る。ロールバックが無い。仕様の「条件を満たさない場合はファイルを一切変更せず」は事前条件の話で、その外側に穴があった。
- 11:25 - H-1 と H-2 を 1 つの設計変更でまとめて修正。移動を先に「計画」として組み立て、(1) 全移動先の存在を事前検査して 1 つでもあれば失敗、(2) 書き換えが空振りしないことも事前検査、(3) 実際の移動は try/catch で包み、失敗したら done を逆順に rename して巻き戻す、とした。ファイルを触る前に落ちる経路を最大化する方針。
- 11:28 - M-1 も修正。`rewriteProgress` が正規表現に当たらなくても no-op で成功していた（`- **Status**: In Progress` のようにコロン位置が違う進捗で Status が Done にならないまま ok:true）。当たらなかった行を `missing` で返し、移動前に失敗させるようにした。
- 11:30 - M-2 も修正。`collectArtifacts` が `foo` のアーカイブで別作業 `foo.v2` の progress と抽出物まで巻き込んでいた。最初 `.md` で終わるものを除く実装にしたが `foo.v2.png` が残ったため、進捗（.md）の存在を作業の定義とみなし、より長い作業名に属する抽出物を除く最長一致に直した。
- 11:32 - 回帰テストを 7 件追加（移動先衝突での spec / 抽出物、途中失敗の巻き戻し、Status 行欠落、ドット区切りの別作業、`collectArtifacts` と `rewriteProgress` の単体）。テストは 9 → 16 件。レビューが「例の行を写しただけ」と指摘した弱点を埋める意図。
- 11:34 - 再検証。既存アーカイブがある状態では `ok: false`／理由付きで失敗し、旧アーカイブの中身が保たれることを確認。`collectArtifacts(['foo.md','foo.png','foo.v2.md','foo.v2.png'],'foo')` は `['foo.md','foo.png']` を返す。`npm run ci` は 78 pass / 0 fail（既存 62 + archive 16）。
- 11:36 - M-3（他リポジトリの PR URL を受け入れる）と L-1〜L-3 は未対応。spec の「仕様」「失敗時」に無い堅牢化であり、範囲外に踏み込むため。再レビューで必須と判断されたら対応する。
- 11:55 - 再レビュー（2 回目）で **承認**（Critical 0 / High 0 / Medium 3 / Low 4）。前回の H-1 / H-2 / M-1 / M-2 は解消を確認された。
- 11:58 - Medium のうち 2 件を本 PR で修正。(1) `writeFileSync` が移動後の進捗を truncate してから書くため、書き込み中に落ちると「巻き戻した」と報告しつつ進捗が壊れる。spec 28 行目の「ファイルを一切変更せず」に触れるので、一時ファイルに書ききってから rename で置き換える形にした。(2) 成功しても `- [ ] PRマージ後のアーカイブ` が未チェックのまま残り、Done なのに追跡上は未着手という記録ができる。手作業の手順では閉じているので、同じ結果になるよう `[x]` にする処理を足した。
- 12:00 - Medium 残り 1 件（`gh pr view` が他リポジトリ・他ブランチのマージ済み PR を受け入れる）は**既知の限界として未対応**。レビューも「spec の『仕様』は `gh pr view` でマージ済みを確認するとしか書いておらず、リポジトリ・ブランチの照合は要求していない。spec に無い検証を足す方が逸脱寄り」として範囲外の判断を妥当と認めた。他リポジトリのマージ済み PR URL を貼れば通る導線は残る。必要なら後続 spec を切る。
- 12:02 - Low 2 件に対応。(1) chmod を使う巻き戻しテストは root だとモードビットが無視されて false failure になるため、`process.getuid?.() === 0` で skip するガードを付けた（現行 CI は非 root の ubuntu-latest なので今は安定するが、コンテナ実行に移すと壊れる）。(2) `collectArtifacts` は progress/ 直下しか見ないため、`foo.v2` が既にアーカイブ済みだと `foo.v2.png` を `foo` の抽出物として拾う。設計上の帰結なので前提としてコメントに明記した。
- 12:03 - TOCTOU（事前検査と rename の間に別プロセスが同名を作る）は未対応。単発の手動起動 CLI で現実的なシナリオが無く、POSIX に上書きしない rename が無い以上コストに見合わないという判断。レビューも Low とした。
- 12:05 - 回帰テストを 2 件追加（チェック項目の `[x]` 化、一時ファイルが残らないこと）。テストは 16 → 18 件。`npm run ci` は 80 pass / 0 fail（既存 62 + archive 18）。
