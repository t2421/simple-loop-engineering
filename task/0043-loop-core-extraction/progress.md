# Progress: `0043-loop-core-extraction`

- **Target Spec:** `task/0043-loop-core-extraction/spec.md`
- **Branch:** `feat/0043-loop-core-extraction`
- **PR:** `未作成`
- **Status:** `Blocked` (Phase: `0044・0042 の完了待ち`)
- **Complexity:** `L`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 配布形態の決定（0044 の移植先に配れるかを判断基準に入れる。→ 完了条件 6）
- [ ] Core 層のツールをパッケージへ移す（`promote` を含む）
- [ ] このリポジトリを CLI 経由へ置き換え、置き換え前と同じ検証結果になることを確認する
- [ ] `CLAUDE.md` テンプレートの作成（不変の原則と穴の分離。穴の未記入を lint で落とす）
- [ ] コアのバージョン指定を保護パスへ追加 (`.claude/skills/add-protected-path` に従う)
- [ ] ラベル無し / ラベル付きの `protected-paths` 実行結果を進捗に貼る（→ 完了条件 9）
- [ ] Core とエージェント定義・Skill のバージョン不整合の検知手段の決定（→ 完了条件 10）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `17:59` - backlog から昇格し、完了条件を確定した。**着手はしない。** 3 部作の最後であり、0044 の実測と 0042 の契約が確定するまで着手すると speculative generality になる。Status を `Blocked` にして `tools/start-task.mjs` に選ばせない。
- `17:59` - 解除条件: `task/archive/0044-second-project-port/` と `task/archive/0042-loop-manifest/` の両方が存在すること。解除時に Status を `Not Started` に戻す。
- `17:59` - backlog 時点の未解決点（`0038-promote-tool` を先行実装するか 0043 に統合するか）は解消済み。0038 は単独で実装・アーカイブされ、`tools/promote.mjs` として存在する。Core 層の 3 層表に追記した。
- `17:59` - 新たな未解決点を spec に追記した。論点 1 の「`bin` を持つパッケージが妥当」は npm 前提の結論であり、0044 の移植先（パッケージマネージャ無し）には配れない。配布形態を選び直す必要がある。
