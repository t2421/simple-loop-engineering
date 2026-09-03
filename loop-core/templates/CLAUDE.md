# ループエンジニアリング（Core テンプレート）

このファイルは `loop-core` が配る **CLAUDE.md の型**である。
`{{NAME}}` は消費リポジトリが埋める穴。未記入のまま `lint-docs` すると列挙して落ちる。

CLI: `{{CORE_CLI}}`
検証: `{{VERIFY_COMMAND}}`
依存導入: `{{INSTALL_COMMAND}}`
claude-config: `{{CLAUDE_CONFIG_REF}}`

## 不変の原則

- 作業の単位は `task/<id>-<slug>/`。`spec.md` と `progress.md` を置く。見出し名・順番はテンプレどおり
- 着手しない候補は `backlog/<id>-<slug>/spec.md`。progress は作らない
- 完了条件は必須。検証はこの条件に対して行う
- 実装は worktree で行う。開始は `{{CORE_CLI}} start-task`
- アーカイブは紐付けた PR がマージされたあと。`{{CORE_CLI}} archive <id>-<slug>`
- 凍結対象をエージェント判断で弱めない。改訂は spec に理由を書き、人間が `allow-protected-change` を付けてマージする
- 報告は自己申告ではなくコマンド出力を貼る

## ディレクトリ（穴）

消費リポジトリ固有の配置（成果物・UI・e2e など）:

{{ARTIFACT_LAYOUT}}

## 開発ループ

1. Plan — `{{CORE_CLI}} start-task`
2. Implement — 完了条件を満たす最小差分
3. Verify (自己) — `{{VERIFY_COMMAND}}`
4. Verify (外部) — コード: `{{REVIEWER_CODE}}` / 見た目: `{{REVIEWER_VISUAL}}`（見た目作業: `{{HAS_VISUAL}}`）
5. Record — progress を同じ PR で更新する。Status を Done にしない
6. Archive — マージ後に `{{CORE_CLI}} archive`

## 変えてはいけないもの

判定の実体は Core の `check-protected-paths` とマニフェスト `protectedPaths`。
CLAUDE.md に行を足すだけではガードは検知しない。
