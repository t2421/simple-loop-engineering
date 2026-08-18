# loop-engineering-demo

ループエンジニアリング学習用。算術ライブラリと、それを使う UI。フレームワークは使わない。

## ディレクトリ

| パス | 役割 |
|---|---|
| `specs/` | 未完了の作業仕様。1 ファイルが 1 作業 |
| `specs/TEMPLATE.md` | 仕様の型。見出し名・順番は変えない |
| `specs/archive/` | 完了した仕様 |
| `progress/` | 未完了の作業状態。会話が切れてもここから再開する。Figma 抽出物もここに置く |
| `progress/TEMPLATE.md` | 進捗の型。見出し名・順番は変えない |
| `progress/archive/` | 完了した進捗と、その作業の抽出物 |
| `src/` | 実装 |
| `tests/` | テスト |
| `.github/workflows/` | CI。`npm run ci` を実行する |

仕様と進捗は同名で対にする。例: `specs/math-add.md` と `progress/math-add.md`。

Figma からの JSON・PNG など抽出物は、対応する進捗ファイルと同じディレクトリに、同じベース名で置く。例: `progress/calc-page.md` に対して `progress/calc-page.figma.json` と `progress/calc-page.png`。

## 状態

作業を始める前に `progress/` を読む。`archive/` 以外が未完了の作業である。  
着手する作業の **Target Spec** を読み、完了条件を確認する。  
タスクを進めたら、その進捗ファイルのチェックボックスと試行ログを更新する。

現在の作業:

- `progress/commit-timing-rules.md` — spec / progress のコミット・マージ規約。Not Started（最優先。他作業の進め方が依存）
- `progress/guard-protected-paths.md` — 保護パス変更の CI ガード。Not Started
- `progress/claude-md-slim.md` — CLAUDE.md の整理と方針追記。Not Started
- `progress/archive-automation.md` — アーカイブ手順の自動化。Not Started
- `progress/parallel-worktrees.md` — worktree による並列作業の導入。Not Started
- `progress/scripts-freeze-procedure.md` — 凍結ファイルの改訂手続き。Not Started
- `progress/ci-lint.md` — Lint の導入。Not Started（`scripts-freeze-procedure` マージ後に着手）
- 直近の完了: `progress/archive/calc-page.md` — 計算ページの追加。Done

## 開発ループ

1. **Plan** — `progress/` から次の 1 作業を選ぶ。何をするか 1〜3 行で宣言する
2. **Implement** — 完了条件を満たす最小差分だけ実装する
3. **Verify (自己)** — [共通の検証](#共通の検証)（CI と同じコマンド）を実行する。続けて対象仕様の完了条件に対して検証する。出力を会話に貼る
4. **Verify (外部)** — 進捗に書いたレビューサブエージェントへ依頼する
5. **Fix** — Critical 指摘がゼロになるまで 3〜4 を繰り返す
6. **Record** — 進捗の Status・チェック・試行ログを更新する。PR を作成したら URL を進捗の **PR** に書く。見た目の変更なら該当箇所のスクリーンキャプチャを PR 本文に添付する（リポジトリには置かない）。この時点では Status を Done にしない。アーカイブもしない
7. **Archive** — 紐付けた PR がマージされたら [アーカイブ](#アーカイブ) する

Critical が残っている状態で「完了」と報告しない。Status を Done にしない。アーカイブもしない。PR 未作成・未マージでも同じ。

## 共通の検証

定義は `package.json` の `scripts`。CI（`.github/workflows/ci.yml`）はそれを実行するだけ。progress には書かない。

コードを編集したら、マージ前に CI と同じコマンドをローカルで実行する。失敗したまま次の工程に進まない。出力は会話に貼る。

```
npm run ci
```

型チェッカーや Linter、計算スタイルのテストを導入したら、`package.json` の `scripts` に足して `ci` から呼ぶ。progress には戻さない。

## 仕様

- 機能追加・バグ修正・改善を問わず `specs/TEMPLATE.md` をコピーして埋める
- 見出し名・順番は変えない。空でも見出しは残す
- **完了条件は必須。** 検証はこの条件に対して行う
- 機能追加の記入例は `specs/math-add.md`
- UI なら「仕様」に構造・トークン表・状態を書く。見出しは増やさない。Figma の URL は「背景」に出典として書く

## 見た目

Figma のライブファイルは完了条件にしない。抽出して `progress/` に置いた JSON・PNG が正である。抽出は同じ進捗のチェック項目とし、実装より先に行う。

見た目の完了条件は算術の例と同じく、検証可能な命題にする。

| 層 | 仕様に書くこと | 検証 |
|---|---|---|
| 構造 | 要素と役割（入力 2、ボタン、結果 など） | DOM |
| トークン | 色・余白・フォント・半径など、この作業で保証する値 | CSS 変数と、対象要素の計算スタイル |
| 状態 | 通常・ホバー・空・不正入力。該当する行だけ | 例の操作と表示 |
| 残差 | 書かない（整列・重なり・階層） | Verify (外部)。スクショを会話に貼る |

「Figma どおり」「近い」は完了条件にしない。トークン表に無い値を実装に置かない。

見た目のテストは `npm run ci` が回す。progress には書かない。描画して計算スタイルを読むランナーを入れるときは、他の検証と同じく `ci` から呼ぶ。

見た目の変更を含む PR には、実装後の該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない。GitHub の PR 添付（`user-attachments`）に上げて本文から参照する。手順は `.claude/skills/gh-pr-attach-image` に従う。Figma 抽出 PNG の再利用ではなく、ブラウザで描画した画面を使う。仕様に状態があるなら、レビューに必要な状態分を添える。

## 進捗

- `progress/TEMPLATE.md` をコピーして埋める
- Target Spec / Branch / PR / Status は欠かさない。PR は未作成なら `未作成`、作成後は URL
- チェック: `[ ]` 未着手、`[/]` 進行中、`[x]` 完了
- チェックリストは作業固有の項目だけ書く（仕様確認、Figma 抽出、テスト作成、実装、レビュー、PR 作成、見た目なら PR へのスクリーンキャプチャ、PR マージ後のアーカイブ）
- Figma 抽出物は進捗と同じベース名で `progress/` に保存する（`progress/<作業>.figma.json`、`progress/<作業>.png`）
- 構文チェック・テスト実行など全作業共通の検証は progress に書かない。`npm run ci` が強制する
- 試行ログは追記する。失敗と解消も残す。消して体裁を整えない

## アーカイブ

次をすべて満たしたときだけ行う。**PR 作成時点では行わない。**

- 実装が完了し、完了条件をすべて満たしている
- Critical がゼロ
- 進捗の **PR** に URL があり、その PR がマージ済み

手順:

1. 進捗の Status を `Done` にする
2. 仕様を `specs/` から `specs/archive/` へ移動する
3. 進捗を `progress/` から `progress/archive/` へ移動する（抽出物も同じディレクトリへ）
4. 進捗の **Target Spec** を移動後のパス（`specs/archive/<ファイル>.md`）に直す

`TEMPLATE.md` は移動しない。未完了の作業をアーカイブしない。PR 未作成・未マージの作業をアーカイブしない。

## 報告の作法

**実行したコマンドの出力を、要約せずに会話に貼る。**

このプロジェクトでは `/goal` を使う。評価役はツールを実行できず、会話に出た内容だけを読んで判定する。

- ❌ 「テストは全部通りました」「Figma どおりです」（自己申告。判定材料にならない）
- ⭕️ `node --test tests/add.test.mjs` の出力をそのまま貼る
- ⭕️ 計算スタイルのテスト出力、残差レビュー用のスクショを会話に貼る

「確認した」ではなく「確認した結果」を出す。

## 変えてはいけないもの

停止条件を満たすために、以下を書き換えない。書き換えれば大抵の条件は「達成」できてしまう。

- `specs/` の完了条件と例の期待値、および仕様のトークン表
- `specs/TEMPLATE.md` と `progress/TEMPLATE.md`
- `tests/` 配下のテストコードと期待値（存在するようになったら）
- `package.json` の `scripts`（検証コマンド）
- `.github/workflows/` の検証ステップ（`npm run ci` を外して通すことを防ぐ）

## コーディング規約

- 依存は最小限。vanilla の JavaScript（`.mjs`）でよい
- 算術関数は純関数とする。引数を変更しない
- 色・余白・フォント・半径は仕様のトークン表が正。実装は CSS 変数で参照し、表に無いマジックナンバーを置かない
