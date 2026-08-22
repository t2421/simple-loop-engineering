# Progress: `0030-spec-author-backlog-path`

- **Target Spec:** `task/archive/0030-spec-author-backlog-path/spec.md`
- **Branch:** `feature/spec-author-backlog-path`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/46
- **Status:** `Done`
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 実装 (`CLAUDE.md`「仕様」節の `spec-author` 呼び出し記述に、backlog 候補は `種別: backlog` を渡すことを足す)
- [x] 実装 (`.claude/agents/spec-author.md`「完了条件の書き方」節に、種別 `backlog` では適用しないことを明記する)
- [x] 完了条件 5〜8 の確認（`grep` と `git diff` の出力を会話に貼る。既定 `task` の記述が無変更であることを含む）
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く。見た目の変更は無いのでスクリーンキャプチャは不要）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:38` - backlog リファインメントで昇格。同じ ID のまま `backlog/0030-*` → `task/0030-*` へ移し、完了条件 5〜10 を記入した。欠陥 2 件が現存することを実測で確認済み: `CLAUDE.md:109` は「意図・ID・slug を渡す」のままで種別が無く、`.claude/agents/spec-author.md:54` の無条件「テンプレートの 1〜4 はそのまま残し、5 以降に…」が同ファイル 45 行目の backlog 規則（完了条件は埋めない）と矛盾している。
- `05:38` - **手続き上の注意を記録する。** CLAUDE.md「コミットとマージ」は、ルール変更（`CLAUDE.md` など）を「独立した docs PR。進行中の作業ブランチに混ぜない」と定める。この作業は **CLAUDE.md の記述そのものが対象**なので、実装 PR が同時にルール変更 PR になる。混入ではなく作業本体であることを PR 本文に明記する。
- `05:38` - 凍結対象には触れない見込み。`CLAUDE.md` と `.claude/agents/` はどちらも保護パス一覧の外であり、`allow-protected-change` ラベルは不要（完了条件 10 で `git diff` により確認する）。
- `07:48` - 実装。2 ファイル 2 行の変更に収めた。`CLAUDE.md:109` の呼び出し記述に「backlog 候補を起草させるときは `種別: backlog` も渡す。渡さないと既定の `task` として扱われ、`task/<id>-<slug>/` に `progress.md` ごと作られてしまう」を追記。`.claude/agents/spec-author.md` の「完了条件の書き方」節の冒頭に「**この節は種別 `task` のときだけ適用する。**」を置き、backlog では完了条件を埋めず未確定行 1 行だけにすること、テンプレートの 1〜4 も書かないことを明示した。既存の箇条書き（テンプレートの 1〜4 を残す旨）は残したまま、節全体のスコープを絞る形にした。節ごと条件分岐させるより、既存の記述を動かさずに済む。
- `07:48` - 完了条件 5・6・8 を実測。5: `grep -n 'spec-author' CLAUDE.md` の 109 行目に `種別: backlog` を渡す旨が入っている。6: 「完了条件の書き方」節の 49 行目に種別 `backlog` では未確定行 1 行のままとする旨がある。8: `git diff main -- .claude/agents/spec-author.md | grep -E '^[-+].*渡されなければ'` が空で、既定を `task` とする記述は無変更。出力は会話に貼った。
- `07:48` - 完了条件 9・10 を実測。`node tools/lint-docs.mjs` は `docs の形式違反はありません（31 件の作業ディレクトリを確認）` で exit 0。`git diff main -- tools/ tests/ src/ package.json .github/` は空。`node tools/check-protected-paths.mjs main` は `保護パスの変更はありません`。凍結対象に触れていないので `allow-protected-change` は不要。
- `08:22` - 完了条件 7 の読み合わせで、追記文が参照する「書くもの」節がこのファイルに存在しないことに気づいた（該当規則は「手順」節の末尾＝45 行目）。参照先を「手順」に直した。規則の内容は変えていない。
- `08:22` - **Verify (外部) 1 回目: `codex-reviewer` が承認。Critical 0 件・High 0 件。** `codex review --uncommitted`（gpt-5.6-sol）は構造化された指摘を 1 件も出していない。レビュー側で完了条件 5・6・8・10 を独立に再実行し、いずれも期待どおりだった。なお codex のサンドボックスは read-only のため `mkdtempSync` を使うテストが 90 件落ちるが、サンドボックス外では 360 件全通過（環境要因）。
- `08:22` - **Medium 1 件を記録する（実装は変えない）。** 「テンプレートの 1〜4 も書かない」は、`CLAUDE.md`「仕様」節の backlog 規則の言い回し（未確定行を「節の先頭に**足す**」）と、既存 backlog 4 件（`0015`・`0026`・`0027`・`0029`）の実物（未確定行のあとにテンプレ 1〜4 とプレースホルダ 5 が残っている）と食い違う。今後起草される backlog だけ形が変わり 2 形式が混在する。ただしこの挙動は対象 spec の「例」2 行目が明示的に期待値としており、着手後の spec 変更は人間の承認が要る。`tools/lint-docs.mjs` の判定は「未確定行で始まるか」だけなので両形式とも通る。どちらを正とするかは PR 本文に書いて人間の判断に委ね、後続の docs 作業で扱う。
- `08:22` - Low 2 件は対応しない。(1) `CLAUDE.md:109` の後半（失敗モードの説明）は冗長だが、まさにこの不備を防ぐための動機付けなので残す。(2) codex サンドボックス下のテスト失敗はノイズであり欠陥ではない。
- `08:25` - PR #46 を作成した。Medium 1 件（backlog の 2 形式混在。どちらを正とするか）は本文の末尾に判断依頼として書いた。Status は Done にしない。マージされてからアーカイブする。
