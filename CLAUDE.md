# loop-engineering-demo

ループエンジニアリング学習用の算術ライブラリ。フレームワークは使わない。

## ディレクトリ

| パス | 役割 |
|---|---|
| `specs/` | 未完了の作業仕様。1 ファイルが 1 作業 |
| `specs/TEMPLATE.md` | 仕様の型。見出し名・順番は変えない |
| `specs/archive/` | 完了した仕様 |
| `progress/` | 未完了の作業状態。会話が切れてもここから再開する |
| `progress/TEMPLATE.md` | 進捗の型。見出し名・順番は変えない |
| `progress/archive/` | 完了した進捗 |
| `src/` | 実装（これから置く） |
| `tests/` | テスト（これから置く） |
| `.github/workflows/` | CI。`npm run ci` を実行する |

仕様と進捗は同名で対にする。例: `specs/math-add.md` と `progress/math-add.md`。

## 状態

作業を始める前に `progress/` を読む。`archive/` 以外が未完了の作業である。  
着手する作業の **Target Spec** を読み、完了条件を確認する。  
タスクを進めたら、その進捗ファイルのチェックボックスと試行ログを更新する。

現在の作業:

- `progress/math-add.md` — `add` の追加。Not Started

## 開発ループ

1. **Plan** — `progress/` から次の 1 作業を選ぶ。何をするか 1〜3 行で宣言する
2. **Implement** — 完了条件を満たす最小差分だけ実装する
3. **Verify (自己)** — [共通の検証](#共通の検証)（CI と同じコマンド）を実行する。続けて対象仕様の完了条件に対して検証する。出力を会話に貼る
4. **Verify (外部)** — 進捗に書いたレビューサブエージェントへ依頼する
5. **Fix** — Critical 指摘がゼロになるまで 3〜4 を繰り返す
6. **Record** — 進捗の Status・チェック・試行ログを更新する。完了したら [アーカイブ](#アーカイブ) する

Critical が残っている状態で「完了」と報告しない。Status を Done にしない。アーカイブもしない。

## 共通の検証

定義は `package.json` の `scripts`。CI（`.github/workflows/ci.yml`）はそれを実行するだけ。progress には書かない。

コードを編集したら、マージ前に CI と同じコマンドをローカルで実行する。失敗したまま次の工程に進まない。出力は会話に貼る。

```
npm run ci
```

型チェッカーや Linter を導入したら、`package.json` の `scripts` に足して `ci` から呼ぶ。progress には戻さない。

## 仕様

- 機能追加・バグ修正・改善を問わず `specs/TEMPLATE.md` をコピーして埋める
- 見出し名・順番は変えない。空でも見出しは残す
- **完了条件は必須。** 検証はこの条件に対して行う
- 機能追加の記入例は `specs/math-add.md`

## 進捗

- `progress/TEMPLATE.md` をコピーして埋める
- Target Spec / Branch / Status は欠かさない
- チェック: `[ ]` 未着手、`[/]` 進行中、`[x]` 完了
- チェックリストは作業固有の項目だけ書く（仕様確認、テスト作成、実装、レビュー、PR）
- 構文チェック・テスト実行など全作業共通の検証は progress に書かない。`npm run ci` が強制する
- 試行ログは追記する。失敗と解消も残す。消して体裁を整えない

## アーカイブ

実装が完了し、完了条件をすべて満たし、Critical がゼロのときだけ次を行う。

1. 進捗の Status を `Done` にする
2. 仕様を `specs/` から `specs/archive/` へ移動する
3. 進捗を `progress/` から `progress/archive/` へ移動する
4. 進捗の **Target Spec** を移動後のパス（`specs/archive/<ファイル>.md`）に直す

`TEMPLATE.md` は移動しない。未完了の作業をアーカイブしない。

## 報告の作法

**実行したコマンドの出力を、要約せずに会話に貼る。**

このプロジェクトでは `/goal` を使う。評価役はツールを実行できず、会話に出た内容だけを読んで判定する。

- ❌ 「テストは全部通りました」（自己申告。判定材料にならない）
- ⭕️ `node --test tests/add.test.mjs` の出力をそのまま貼る

「確認した」ではなく「確認した結果」を出す。

## 変えてはいけないもの

停止条件を満たすために、以下を書き換えない。書き換えれば大抵の条件は「達成」できてしまう。

- `specs/` の完了条件と例の期待値
- `specs/TEMPLATE.md` と `progress/TEMPLATE.md`
- `tests/` 配下のテストコードと期待値（存在するようになったら）
- `package.json` の `scripts`（検証コマンド）
- `.github/workflows/` の検証ステップ（`npm run ci` を外して通すことを防ぐ）

## コーディング規約

- 依存は最小限。vanilla の JavaScript（`.mjs`）でよい
- 算術関数は純関数とする。引数を変更しない
- 色・余白・フォントなど UI トークンの話はこのリポジトリの対象外
