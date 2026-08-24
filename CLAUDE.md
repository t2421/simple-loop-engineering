# loop-engineering-demo

ループエンジニアリング学習用。算術ライブラリと、それを使う UI。フレームワークは使わない。

## ディレクトリ

| パス | 役割 |
|---|---|
| `task/` | 作業の単位。`task/<id>-<slug>/` に `spec.md`・`progress.md`・関連ファイルを置く |
| `task/TEMPLATE-spec.md` | 仕様の型。見出し名・順番は変えない |
| `task/TEMPLATE-progress.md` | 進捗の型。見出し名・順番は変えない |
| `task/archive/` | 完了した作業 |
| `specs/` | 移行前から残っている未完了仕様。新規は `task/` に置く |
| `specs/TEMPLATE.md` | 旧型。凍結対象として残す。新規のコピー元は `task/TEMPLATE-spec.md` |
| `progress/` | 移行前から残っている未完了進捗 |
| `progress/TEMPLATE.md` | 旧型。凍結対象として残す |
| `progress/archive/` | `tests/calc-page.test.mjs` 用のシンボリックリンク（本体は `task/archive/0003-calc-page/`） |
| `backlog/` | 着手しない候補。`backlog/<id>-<slug>/spec.md`。完了条件は未確定。progress は作らない |
| `src/` | 実装 |
| `tests/` | テスト |
| `.github/workflows/` | CI。`verify` が `npm run ci`、`e2e` は計算ページに影響しうる差分と `main` への push で `npm run test:e2e` |
| `.claude/skills/` | 手順の知識。CLAUDE.md からは参照だけする |

作業の識別子はゼロ埋め 4 桁連番（`0001`、`0002`、…）。`task/` と `backlog/` で同じ番号空間を使う。slug は一覧用のラベル。例: `task/archive/0001-math-add/`、`backlog/0013-cloudflare-preview/`。次の新規の採番は `node tools/start-task.mjs --next-id` で計算する。

Figma 抽出物の保存先と命名は `.claude/skills/figma-extract` が正。

## 状態

作業を始める前に、次を読む。

- `task/` の `archive/` 以外（`NNNN-slug` の作業ディレクトリ）
- `progress/` の `archive/` 以外（移行前から残っている未完了）

着手する作業の **Target Spec** を読み、完了条件を確認する。  
タスクを進めたら、その進捗ファイルのチェックボックスと試行ログを更新する。

## 開発ループ

1. **Plan** — `node tools/start-task.mjs` を実行する。ツールが次の 1 作業（`task/` の `archive/` 以外で Blocked / Done でない最小 ID）を選び、worktree を用意する。何をするか 1〜3 行で宣言する
2. **Implement** — 完了条件を満たす最小差分だけ実装する
3. **Verify (自己)** — [共通の検証](#共通の検証)（CI と同じコマンド）を実行する。続けて対象仕様の完了条件に対して検証する。出力を会話に貼る
4. **Verify (外部)** — 進捗に書いたレビューサブエージェントへ依頼する
5. **Fix** — Critical 指摘がゼロになるまで 3〜4 を繰り返す
6. **Record** — 進捗の Status・チェック・試行ログを更新する。PR を作成したら URL を進捗の **PR** に書く。見た目の変更なら該当箇所のスクリーンキャプチャを PR 本文に添付する（リポジトリには置かない）。この時点では Status を Done にしない。アーカイブもしない
   - **push したら GitHub Actions の結果を確認する。** 赤い・未確定のまま「完了」と報告しない。Stop hook の `tools/check-actions.mjs` が未確認のまま終えることを防ぐ（未 push・`gh` 不在などでは黙って通すので、機構だけに頼らない）
7. **Archive** — 紐付けた PR がマージされたら [アーカイブ](#アーカイブ) する

Critical が残っている状態で「完了」と報告しない。Status を Done にしない。アーカイブもしない。PR 未作成・未マージでも同じ。

## コミットとマージ

spec・progress・ルールを、いつコミットし、どこへマージするか。

| 対象 | コミットのタイミング | マージ先・方法 |
|---|---|---|
| spec + progress の新規作成（Not Started） | 作成したらすぐ。`docs: add <id>-<slug> spec/progress` | main から切った**計画用ブランチ**から、軽量な docs PR で main へ入れる。実装 PR に混ぜない。レビューサブエージェントは不要。人間がマージする |
| backlog の新規・追記 | 残したくなったとき。`docs: add <id>-<slug> backlog` | 同上。実装 PR に混ぜない |
| 昇格（backlog → task） | 着手すると決めたとき。同じ ID のまま `task/<id>-<slug>/` へ移し、完了条件を埋めて `progress.md` を足す | 同上。移動と完了条件の記入は同じ PR で行う |
| progress の更新（チェック・試行ログ・PR URL） | 工程を進めるたび | その作業ブランチ。実装と同じ PR に含める |
| spec の変更 | 着手後は原則変更しない。必要になったら変更内容と理由を試行ログに記録し、人間の承認を経る | — |
| アーカイブ（Status を Done にし `archive/` へ移動） | 紐付けた実装 PR のマージ直後 | main に直接 `docs: archive <作業名>`。内容が同一の移動と Status 変更だけなので PR は不要 |
| ルール変更（`CLAUDE.md`・`TEMPLATE.md` など） | 気づいたとき | 独立した docs PR。進行中の作業ブランチに混ぜない |

- 会話中に複数の spec が生まれたときも、進行中の作業ブランチには置かない。**計画用ブランチ**にまとめ、1 本の docs PR にする
- 進捗の **Branch** は計画した時点では予約した名前でしかない。着手するときに main から切る

## 並列作業（worktree）

独立した作業を同時に進めるときは git worktree を使う。1 つのチェックアウトでブランチを切り替えながら 2 作業を持たない。

- worktree は `.worktrees/<ブランチ名>` に作る。`.worktrees/` は gitignore する
- **1 worktree = 1 作業 = 1 ブランチ。** ブランチは main から切る
- 各 worktree に `node_modules` が要る。作成後に `npm ci` を実行する
- 進捗の更新は、その作業の worktree の、その作業のブランチで行う。他の作業の進捗ファイルを触らない
- `task/`・`progress/`・`CLAUDE.md` が競合したら、PR のマージ順に解決する。後からマージする側が main を取り込んで直す
- [アーカイブ](#アーカイブ) はマージされた側から順に行う。未マージの作業を巻き込まない

触るファイルが重ならない作業どうしを選べば衝突しない。重なる場合も並列にしてよいが、後からマージする側が main を取り込んで解決する。解決コストが実装より大きくなるなら直列にする。

次の 1 作業の worktree は `node tools/start-task.mjs` が用意する。選択を待たずに特定の作業を並行で開始するときだけ、手動で作る。

```
git worktree add .worktrees/<ブランチ名> -b <ブランチ名> main
cd .worktrees/<ブランチ名> && npm ci
```

作業が終わり PR がマージされたら worktree を片付ける。

```
git worktree remove .worktrees/<ブランチ名>
```

## 共通の検証

定義は `package.json` の `scripts`。CI（`.github/workflows/ci.yml`）の `verify` ジョブは `npm run ci` を実行する。progress には書かない。

コードを編集したら、マージ前に CI と同じコマンドをローカルで実行する。失敗したまま次の工程に進まない。出力は会話に貼る。

```
npm run ci
```

型チェッカーや Linter を導入したら、`package.json` の `scripts` に足して `ci` から呼ぶ。progress には戻さない。

見た目のテスト（描画して計算スタイルを読むもの）は `npm run test:e2e`。GitHub の `e2e` ジョブが、計算ページに影響しうる差分と `main` への push で回す。見た目を変える作業では、マージ前にローカルでも `npm run test:e2e` を実行する。

## 仕様

- 新規 spec / progress の起草は `spec-author` サブエージェントに依頼する（意図・ID・slug を渡す）。**backlog 候補を起草させるときは `種別: backlog` も渡す。** 渡さないと既定の `task` として扱われ、`task/<id>-<slug>/` に `progress.md` ごと作られてしまう
- 機能追加・バグ修正・改善を問わず `task/TEMPLATE-spec.md` を `task/<id>-<slug>/spec.md` にコピーして埋める。進捗は `task/TEMPLATE-progress.md` を同じディレクトリの `progress.md` にする
- 見出し名・順番は変えない。空でも見出しは残す
- **完了条件は必須。** 検証はこの条件に対して行う
- 機能追加の記入例は `task/archive/0001-math-add/spec.md`
- UI なら「仕様」に構造・トークン表・状態を書く。見出しは増やさない。Figma の URL は「背景」に出典として書く
- 着手しない候補は `backlog/<id>-<slug>/spec.md` に置く。**仕様ではなく候補である。** 見出し名・順番は `task/TEMPLATE-spec.md` に従う。完了条件は埋めず「未確定（incomplete）。昇格時に埋める。」の 1 行を節の先頭に足す。**progress は作らない**
- `backlog/` は未完了の作業ではない。次の作業を選ぶときの対象にしない
- 着手するときは同じ ID のまま `backlog/<id>-<slug>/` を `task/<id>-<slug>/` へ移し、完了条件を埋めて `progress.md` を置く。**移動と完了条件の記入は同じ PR で行う**。[コミットとマージ](#コミットとマージ) の昇格と同じく、計画用ブランチの docs PR で main へ入れる
- 最初から着手する作業は `task/<id>-<slug>/` を新しく作り、完了条件を埋めて `progress.md` を置く
- `specs/` と `progress/` に残っている対（移行前の未完了）はこの構造では動かさない。完了後のアーカイブは、その時点の `tools/archive.mjs` に従う

## 見た目

Figma のライブファイルは完了条件にしない。抽出して作業ディレクトリに置いた JSON・PNG が正である。抽出は同じ進捗のチェック項目とし、実装より先に行う。手順・保存先・JSON の形は `.claude/skills/figma-extract` に従う。

見た目の完了条件は算術の例と同じく、検証可能な命題にする。

| 層 | 仕様に書くこと | 検証 |
|---|---|---|
| 構造 | 要素と役割（入力 2、ボタン、結果 など） | DOM |
| トークン | 色・余白・フォント・半径など、この作業で保証する値 | CSS 変数と、対象要素の計算スタイル |
| 状態 | 通常・ホバー・空・不正入力。該当する行だけ | 例の操作と表示 |
| 残差 | 書かない（整列・重なり・階層） | Verify (外部)。スクショを会話に貼る |

「Figma どおり」「近い」は完了条件にしない。トークン表に無い値を実装に置かない。

見た目のテストは `npm run test:e2e` が回す。progress には書かない。描画して計算スタイルを読むランナーを入れるときは `test:e2e` から呼ぶ。GitHub は計算ページに影響しうる差分と `main` への push でこれを回す。

見た目の変更を含む PR には、実装後の該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない。GitHub の PR 添付（`user-attachments`）に上げて本文から参照する。手順は `.claude/skills/gh-pr-attach-image` に従う。Figma 抽出 PNG の再利用ではなく、ブラウザで描画した画面を使う。仕様に状態があるなら、レビューに必要な状態分を添える。

## 進捗

書式・メタ情報・チェックボックスの意味は `task/TEMPLATE-progress.md` が正。コピーして埋める。移行前から残っている対は `progress/TEMPLATE.md` のまま。

このリポジトリ固有の決めごとだけ、ここに書く。

- チェックリストは作業固有の項目だけ書く（仕様確認、Figma 抽出、テスト作成、実装、レビュー、PR 作成、見た目なら PR へのスクリーンキャプチャ、PR マージ後のアーカイブ）
- **Complexity**（`S | M | L`）は spec 起草時に `spec-author` が付与する。`node tools/start-task.mjs` がこの等級から実装に使うモデルを引く（`S → haiku`、`M → sonnet`、`L → fable`）。無い進捗（既存分）は `M` とみなす
- 構文チェック・テスト実行など全作業共通の検証は progress に書かない。`npm run ci` が強制する

## アーカイブ

次をすべて満たしたときだけ行う。**PR 作成時点では行わない。**

- 実装が完了し、完了条件をすべて満たしている
- Critical がゼロ
- 進捗の **PR** に URL があり、その PR がマージ済み

手順:

```
node tools/archive.mjs <id>-<slug>
git add -A && git commit -m "docs: archive <id>-<slug>"
```

ツールは次を行う。条件を満たさないときは何も変更せず終了コード非 0 で終わる。

1. 進捗の **PR** がマージ済みで、この作業のものであることを確かめる
2. 進捗の Status を `Done` にする
3. ディレクトリを `task/archive/<id>-<slug>/` へ移動する
4. 進捗の **Target Spec** を `task/archive/<id>-<slug>/spec.md` に直す

コミットは [コミットとマージ](#コミットとマージ) のとおり main に直接行う。

テンプレは移動しない。未完了の作業をアーカイブしない。PR 未作成・未マージの作業をアーカイブしない。

## トークンコスト

文脈は有限で、読ませた分だけ遅く高くなる。次を守る。

- レビューサブエージェントへ渡すのは**差分・対象 spec・実測の CI 結果だけ**。リポジトリ全体を読ませない
- **レビュアーはサンドボックス内で `npm run ci`・ユニットテスト・e2e を再実行しない。** read-only サンドボックスでは `mkdtemp` を使うテストが `EPERM` で失敗する。実装の欠陥ではなく環境要因であり、その切り分けと釈明が出力とトークンを浪費する。合否は親が貼った実測結果で判定する
- レビューの往復は 5 回を上限とする。超えるなら spec か分割の仕方が間違っている
- 役割ごとにモデルを変えるなら、会話ではなくエージェント定義（`.claude/agents/`）に書く
- 手順の知識は CLAUDE.md に足さず Skill に切り出す。CLAUDE.md は毎セッション全文が載る

## 報告の作法

**実行したコマンドの出力を、要約せずに会話に貼る。**

このプロジェクトでは `/goal` を使う。評価役はツールを実行できず、会話に出た内容だけを読んで判定する。

- ❌ 「テストは全部通りました」「Figma どおりです」（自己申告。判定材料にならない）
- ⭕️ `node --test tests/add.test.mjs` の出力をそのまま貼る
- ⭕️ 計算スタイルのテスト出力、残差レビュー用のスクショを会話に貼る

「確認した」ではなく「確認した結果」を出す。

## 変えてはいけないもの

停止条件を満たすために、以下を書き換えない。書き換えれば大抵の条件は「達成」できてしまう。

- `task/` 配下のファイル全部（`task/archive/` を含む）。完了条件・例の期待値・トークン表・Figma 抽出物などの期待値がここにある。**除外は各作業ディレクトリ直下の `progress.md` だけ**
- `task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md`
- `specs/` の完了条件と例の期待値（移行前の資産）、`specs/TEMPLATE.md` と `progress/TEMPLATE.md`
- `tests/` 配下のテストコードと期待値（存在するようになったら）
- `package.json` の `scripts`（検証コマンド）
- `.github/workflows/` の検証ステップ（`npm run ci` を外して通すことを防ぐ）
- `tools/run-unit-tests.mjs`（ユニットテストの列挙。`ci` が委譲する）
- `tools/e2e-needed.mjs`（e2e を回すかの判定。CI は base リビジョンを実行する）
- `tools/check-progress-coupling.mjs`（実装 PR と progress 更新の結合の判定。CI は base リビジョンを実行する）
- `tools/stop-hook-ci-dir.mjs`（Stop hook が CI を回す対象ディレクトリの判定。書き換えると変更の無いチェックアウトを検証させられる）
- `tools/check-actions.mjs`（push した HEAD の GitHub Actions 結果の判定。Stop hook が委譲する。書き換えると、赤い・未確定の Actions のまま会話を終えられる）

この一覧は CI のガード（`.github/workflows/guard.yml`）が機械的に検知する。判定は `tools/check-protected-paths.mjs` にあり、このファイル自体も保護対象である。

守る対象を増やす・外すときは `.claude/skills/add-protected-path` に従う。**この節に行を足すだけではガードは検知しない。**

### 凍結を解いて改訂するとき

凍結の目的は**検証を弱める変更**を止めることであって、検証を強める変更や環境を整える変更まで塞ぐことではない。塞いだままにすると、テストコードの中に環境セットアップを書くような歪んだ回避が起きる（`scripts-freeze-procedure` の背景がこれである）。

守る対象そのものを増減するのは上の `.claude/skills/add-protected-path` である。ここは**すでに保護されているものの中身を改訂する**手続きを述べる。

正規の手続きは次のとおり。

1. **改訂の内容と理由を spec に書く。** 何を変え、なぜそれが検証を弱めないのかを述べる
2. **その PR を人間がマージする。** PR には `allow-protected-change` ラベルを付ける

この 2 つを満たしたときだけ、凍結対象を変更してよい。

**エージェントが自らの判断で凍結対象を書き換えることは、引き続き禁止する。** 停止条件を満たすために期待値やコマンドを書き換えるのは、この手続きを踏んでも許されない。手続きが許すのは「検証を弱めない改訂」だけである。

## コーディング規約

- 依存は最小限。vanilla の JavaScript（`.mjs`）でよい
- 算術関数は純関数とする。引数を変更しない
- 色・余白・フォント・半径は仕様のトークン表が正。実装は CSS 変数で参照し、表に無いマジックナンバーを置かない
