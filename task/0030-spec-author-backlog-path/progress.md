# Progress: `0030-spec-author-backlog-path`

- **Target Spec:** `task/0030-spec-author-backlog-path/spec.md`
- **Branch:** `feature/spec-author-backlog-path`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 実装 (`CLAUDE.md`「仕様」節の `spec-author` 呼び出し記述に、backlog 候補は `種別: backlog` を渡すことを足す)
- [ ] 実装 (`.claude/agents/spec-author.md`「完了条件の書き方」節に、種別 `backlog` では適用しないことを明記する)
- [ ] 完了条件 5〜8 の確認（`grep` と `git diff` の出力を会話に貼る。既定 `task` の記述が無変更であることを含む）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更は無いのでスクリーンキャプチャは不要）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:38` - backlog リファインメントで昇格。同じ ID のまま `backlog/0030-*` → `task/0030-*` へ移し、完了条件 5〜10 を記入した。欠陥 2 件が現存することを実測で確認済み: `CLAUDE.md:109` は「意図・ID・slug を渡す」のままで種別が無く、`.claude/agents/spec-author.md:54` の無条件「テンプレートの 1〜4 はそのまま残し、5 以降に…」が同ファイル 45 行目の backlog 規則（完了条件は埋めない）と矛盾している。
- `05:38` - **手続き上の注意を記録する。** CLAUDE.md「コミットとマージ」は、ルール変更（`CLAUDE.md` など）を「独立した docs PR。進行中の作業ブランチに混ぜない」と定める。この作業は **CLAUDE.md の記述そのものが対象**なので、実装 PR が同時にルール変更 PR になる。混入ではなく作業本体であることを PR 本文に明記する。
- `05:38` - 凍結対象には触れない見込み。`CLAUDE.md` と `.claude/agents/` はどちらも保護パス一覧の外であり、`allow-protected-change` ラベルは不要（完了条件 10 で `git diff` により確認する）。
