# Progress: CLAUDE.md の整理と方針追記

- **Target Spec:** `task/archive/0010-claude-md-slim/spec.md`
- **Branch:** `feature/claude-md-slim`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/12
- **Status:** Done

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] CLAUDE.md の編集（状態節の一元化・進捗節の重複削減・トークンコスト節の追加）
- [x] Skill の作成 (`.claude/skills/figma-extract/SKILL.md`) と CLAUDE.md からの参照
- [x] レビューサブエージェント (`codex-reviewer`) の承認取得
- [x] PR作成（進捗の **PR** に URL を書く）
- [x] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 05:20 - Loop Engineering 記事に対するリポジトリレビュー（会話）から spec 化。未着手。
- 10:30 - 波 2 として worktree `.worktrees/feature/claude-md-slim`（ブランチ `feature/claude-md-slim`、main から作成）で着手。`guard-protected-paths` / `archive-automation` と並列。
- 11:35 - 「状態」節から個別作業の列挙（「現在の作業:」以下 7 行）を削除。この一覧は作業のたびに手で直しており、直近 3 作業すべてで progress との食い違いをレビューに指摘されていた（commit-timing-rules の Medium、parallel-worktrees の Low）。二重管理の解消がこの spec の主眼。
- 11:38 - `.claude/skills/figma-extract/SKILL.md` を作成。保存先の規約・抽出手順・JSON の形・「何を載せ何を載せないか」を移した。CLAUDE.md の「ディレクトリ」節と「見た目」節からは参照のみにした。
- 11:40 - 「進捗」節のうち `progress/TEMPLATE.md` と重複する 5 行（コピーして埋める／メタ情報／チェックボックスの意味／Figma 抽出物の保存先）をテンプレへの参照に置き換え、このリポジトリ固有の 2 行だけ残した。
- 11:42 - 「トークンコスト」節を追加。レビューへ渡すのは差分と対象 spec のみ／往復上限 5 回／モデル指定はエージェント定義へ／手順知識は Skill へ、の 4 点。
- 11:45 - 初版では「見た目」節に参照を足しただけで、抽出手順の実体（保存先の規約）が「ディレクトリ」節に残っていた。spec は「切り出し、参照のみとする」を求めているので、当該記述も Skill 参照に置き換えた。
- 11:47 - 例 3 行を検証。「現在の作業:」で grep 一致なし（exit 1）、`.claude/skills/figma-extract/SKILL.md` が存在し CLAUDE.md 2 箇所から参照、「## トークンコスト」節が存在。`npm run ci` は 62 pass / 0 fail で変更前と同じ。
- 11:48 - 行数は 182 → 181 でほぼ変わらない。削除（状態一覧 11 行・進捗重複 5 行・Figma 保存先 2 行）と追加（トークンコスト節 9 行・参照 2 行）が相殺したため。目的は行数削減ではなく二重管理の解消と手順知識の Skill 化なので、これで満たしている。
- 11:50 - `codex-reviewer` が承認（Critical 0 / High 0）。Medium 1 件: SKILL.md の手順 1 が nodeId の表記ゆれに触れていない。実データで裏取りすると、URL は `?node-id=1-2`（ハイフン）なのに MCP と JSON は `1:2`（コロン）で、手順どおり読むと無効な ID を渡すことになる（`specs/archive/calc-page.md:18` と `progress/archive/calc-page.figma.json:4`）。手順 1 に URL デコードと `-` → `:` の正規化を明記した。
- 11:52 - Low 1 件も対応。CLAUDE.md の 2 箇所が `.claude/skills/figma-extract` を参照するようになったのに「ディレクトリ」節の表に `.claude/` の行が無く、参照先を表から辿れなかった。行を足した。
- 11:53 - Low 2（「見た目」節と SKILL.md の方針文の重複）は対応しない。spec の「参照のみ」は手順に対する要求であり、方針（ライブファイルを完了条件にしない・抽出は実装より先）は CLAUDE.md 側に残すのが本来。将来のドリフト懸念は認識としてここに残す。
- 11:55 - PR #12 を作成。ドキュメントのみの変更で見た目の変更がないためスクリーンキャプチャは添付しない。マージ待ち。
