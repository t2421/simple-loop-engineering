# spec / progress 起草役 `spec-author` エージェントの追加

新規 spec / progress の起草を担うサブエージェント定義を追加し、ハイエンドモデル（Fable）を指名する。

## 種別

機能追加

## 対象

- 場所: `.claude/agents/spec-author.md`、`CLAUDE.md`（「仕様」節）
- 公開面: Plan 工程でのサブエージェント呼び出し（`spec-author` に意図・ID・slug を渡す）

## 背景

spec の質、特に完了条件が検証可能な命題になっているかは、起草するモデルの能力に依存する。現状はセッションを動かしているモデルがそのまま起草するため、モデルが変わると spec の質がぶれる。CLAUDE.md は「役割ごとにモデルを変えるなら、会話ではなくエージェント定義（`.claude/agents/`）に書く」と定めており、レビュー役（`codex-reviewer`・`visual-design-reviewer`）は既にこの形である。起草役も同じ形に載せる。

## 仕様

`.claude/agents/spec-author.md` を新設する:

- frontmatter に `name: spec-author`、`description`、`model: fable` を書く。モデルの変更はこのファイルの 1 行の変更で済む
- 入力: 作業の意図（1〜3 行）、ID、slug。ID は `node tools/start-task.mjs --next-id` の出力を渡す（`0020` 未マージの間は手動で採番して渡す）
- 読んでよいのは `task/TEMPLATE-spec.md`・`task/TEMPLATE-progress.md`・記入例 `task/archive/0001-math-add/spec.md` と、意図の対象ファイルだけ。リポジトリ全体を読まない（トークンコスト規約に従う）
- 出力: `task/<id>-<slug>/spec.md` と `progress.md`。テンプレートの見出し名・順番に厳密に従い、完了条件は検証可能な命題で書く
- backlog 候補の起草も同じエージェントが担う（完了条件は「未確定（incomplete）。昇格時に埋める。」とし、progress を作らない）
- 禁止: 実装・テスト作成・コミット・push・テンプレートの変更

CLAUDE.md「仕様」節に「新規 spec / progress の起草は `spec-author` サブエージェントに依頼する」を追記する。

## 範囲外

- 起草物の形式の機械検証（`0023-lint-docs` の範囲）
- 複雑度メタ項目の付与（`0025-model-routing` の範囲。マージ後にエージェント定義へ追記する）
- 起草から docs PR 作成までのスキル化（`/new-task`。必要になったら別作業）

## 失敗時

- 意図が空、または ID / slug が渡されない: 起草せず、不足を報告する

## 例

| 操作または入力 | 期待結果 |
|---|---|
| 意図「`clamp(x, min, max)` を追加する」+ ID `0026` + slug `math-clamp` を渡す | `task/0026-math-clamp/spec.md` と `progress.md` が生成され、見出し名・順番がテンプレートと一致する |
| 意図だけ渡して ID を渡さない | 起草されず、不足の報告が返る |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. エージェント定義の frontmatter に `model: fable` がある。試行として意図を 1 件渡して生成した spec.md / progress.md の **`##` 見出しの名前と順番**がテンプレートと一致する（H1 はテンプレートが `<タイトル>` `<作業名>` と埋めることを指定しているため対象外）。比較コマンドの出力を会話に貼る。生成物は検証後に破棄し、コミットしない。
