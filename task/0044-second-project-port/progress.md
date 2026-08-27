# Progress: `0044-second-project-port`

- **Target Spec:** `task/0044-second-project-port/spec.md`
- **Branch:** `feat/0044-second-project-port`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 移植先 P の現状の把握（既存の `CLAUDE.md`・`.claude/`・検証コマンドの所在・テストの実体）
- [x] `.claude/skills/loop-port` のカタログ 13 グループを、移植先 P の対応物へ 1 件ずつ対応づける
- [x] 移植先 P へ手で移植する（共通化・自動化はしない）
- [x] ゲートが**落ちること**の実測 3 件（凍結ガード / 進捗結合 / Stop hook）。省略したものは理由を記録する
- [x] 記録の作成 (`task/0044-second-project-port/port-log.md`)
- [x] 匿名化の確認（移植先 P を特定できる識別子が作業ディレクトリに 0 件。→ 完了条件 7）
- [x] このリポジトリ側に差分が無いことの確認（→ 完了条件 8）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格。移植先を確定した。当初想定の「Swift か Python」ではなく、**パッケージマネージャを持たない Bash 主体のリポジトリ**（別組織 private）。`npm ci` の対応物が無く、検証コマンドの定義がワークフロー YAML 直書きであるため、0042 が必須項目に置こうとしていた `install` と、`check-protected-paths.mjs` の `definedIn` 設計を最初の 1 件で反証しうる。
- `17:59` - このリポジトリは public、移植先は private であるため、spec・progress・記録に移植先の識別子を書かない方針を完了条件 7 に固定した。
- `18:17` - 移植を完了し `port-log.md` を書いた。移植先 P の worktree 上のローカルブランチで作業し、**push もマージもしていない**。
- `18:17` - 予測照合の結果: 4 分類のうち **当たったのは「真に固有」の 1 つだけ**。最悪の外れは `check-progress-coupling.mjs` で、無変更でコピーすると**実行でき、exit 0 を返し、あらゆる差分を対象外にする**。固有語スキャンの検索語にレイアウト語（`src/` 等）が無かったことが原因。
- `18:17` - 最大の発見 3 件。(a) P の台帳が `.gitignore` で除外されており、差分ベースのゲートが原理的に成立しなかった。(b) P には既に凍結があり（YAML の中身をテストで固定）、移植元の「1 ファイルに集約して凍結する」設計が正面から破壊した（`Tests: 24, Failures: 1`）。(c) P の Phase 0 ゲートと `start-task` の入口が二重になる。
- `18:17` - ゲート 3 件（凍結ガード / 進捗結合 / Stop hook）はすべて「落ちること」を実測できた。省略したゲートは無し。
- `18:17` - 匿名化を確認。`grep -rniE '<組織名>|<リポジトリ名>|kintone 等の固有語' task/0044-second-project-port/` が 0 件。
