# Progress: `0013-cloudflare-preview`

- **Target Spec:** `task/0013-cloudflare-preview/spec.md`
- **Branch:** `feature/cloudflare-preview`
- **PR:** https://github.com/t2421/simple-loop-engineering/pull/44
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 実装 (`.github/workflows/preview.yml` の新規作成。既存ワークフローは触らない)
- [ ] Secrets 未登録・fork PR の早期終了が「黙って成功にならない」ことの確認
- [ ] 自分の PR で preview ジョブが実際に走ったログの取得（完了条件 5）
- [ ] Secrets 登録後、コメントされた URL の `/calc.html` が 200 を返し `src/calc.html` と同一であることの `curl` 実測
- [x] `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` が空であることの確認（完了条件 6）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。preview ジョブの実行結果を本文に貼る）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `20:10` - backlog から昇格（計画用ブランチ `docs/promote-0013-cloudflare-preview`）。`task/` が空で `node tools/start-task.mjs` が「選択可能な作業がありません」を返す状態だったため、人間の指示で 0013 を選んだ。**ID は昇格前と同じ 0013 を維持**する（CLAUDE.md「仕様」の規約）。
- `20:12` - 判断材料の調査。`src/` は `calc.html`・`calc.css`・`calc.mjs`・`math.mjs`・`assets/` だけの静的ファイルで**ビルド不要**。e2e は自前の Node http サーバで `src/` を配って `/calc.html` を開いている。Cloudflare 関連の設定・依存・Secrets は一切なし（`gh secret list` は空）。リポジトリは **PUBLIC**。
- `20:15` - **backlog が保留していた「足りない判断」4 点に、調査で見つけた 1 点を足して人間の承認を得た。** Pages（direct upload）／PR ごと／CI の失敗にはしない（独立ジョブ・必須チェックにしない）／PR への sticky コメント／**fork PR は対象外**。5 点目は私の追加で、public リポジトリでは fork PR に Secrets が渡らず、渡すには `pull_request_target` が要るため。未検証コードに認証情報を晒す既知の危険パターンなので採らない。決定と理由を spec の「背景」に表で記録した。
- `20:18` - **Secrets は後から登録される前提で仕様を組んだ。** 未登録のときはデプロイを試みず理由を出力して終了し、**「成功した」と読める出力を出さない**ことを「仕様」「失敗時」「例」「完了条件 8」に入れた。0024・0031・0028 で繰り返し踏んだ「緑が出ていることが検証された証拠になっていない」型を、この作業で作り込まないため。
- `20:20` - `wrangler` は `package.json` の依存に加えず、ワークフロー内でメジャー固定の `npx` 実行にすると決めた。CI でしか使わないものを全員の `npm ci` に載せないため。あわせて `package.json` の `scripts` に触らずに済み、凍結対象の改訂を避けられる（この作業に `allow-protected-change` ラベルは要らない）。
- `20:22` - `.github/workflows/` は保護対象だが、**新規ファイルの追加は append-only として許される**（既存ファイルの変更・移動が違反）。`preview.yml` を新規に足す形なのでラベル不要。既存の `ci.yml`・`guard.yml` は変更しない。
- `20:40` - 実装。`.github/workflows/preview.yml` を新規作成。既存の `ci.yml`・`guard.yml`・`package.json` は触っていない（完了条件 6 は `git diff --cached origin/main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` が空であることで確認済み。差分は `A .github/workflows/preview.yml` の 1 件だけ）。
- `20:42` - **前提条件の検査を 1 ステップにまとめ、どちらの経路も赤くした。** fork PR（`head.repo.full_name != github.repository`）と Secrets 未登録（`secrets.X != ''` の真偽だけを見る）を最初のステップで判定し、理由を出して `exit 1` する。`exit 0` にすると緑のチェックが付き「プレビューが出ている」と読めてしまう。必須チェックではないのでマージ可能性は変わらないが、発行できていないことを緑で隠さない。
- `20:44` - **規約への追随と injection 対策。** `${{ }}` は `run:` へ直接展開せず `env:` 経由にした（`ci.yml` と同じ作法）。Secrets は**有無だけ**を式で真偽にして渡し、値はログにも比較にも出さない。信頼できない自由入力（PR タイトル・本文・`head_ref` などのブランチ名）は一切参照していない。`--branch` にはブランチ名ではなく `pr-<番号>` を使い、ブランチ名が wrangler の引数へ流れる経路自体を作っていない。機械的に検査して「違反ステップ: なし」「参照なし（安全）」を確認した。
- `20:46` - sticky コメントは第三者アクションを使わず `gh api` で実装。本文先頭の目印 `<!-- cloudflare-preview -->` で自分のコメントを引き当て、あれば PATCH、無ければ POST する。push のたびに増えない。URL は wrangler の出力から `https://…pages.dev` を拾い、**取り出せなければ失敗させる**（URL が分からなければ発行した意味がないため）。`concurrency` で同一 PR の連続 push の競合も止めた。
- `20:48` - `npm run ci` は 360 tests / 360 pass / 0 fail。`protected-paths` はラベル無しで「保護パスの変更はありません」。**新規ワークフローの追加は append-only として許される**という昇格時の読みどおりで、この作業に `allow-protected-change` は要らない。
- `12:40` - 独立検証（別エージェント）で **指摘ゼロ**。11 項目を実測で確認した: YAML 妥当性、`${{ }}` の `run:` 直接展開が 0 件、Secrets がログに出ないこと、fork 除外の比較対象、Secrets 未登録時に黙って緑にならないこと、preview が非必須であること、sticky コメントの jq が `body: null` でも壊れないこと、`--project-name` の妥当性、`wrangler@4 pages deploy` のフラグが実在すること、権限が最小十分であること、保護パス違反ゼロ。
- `12:42` - **正直な未達 1 件（検証エージェントの報告）**: fork PR の除外経路は、実 CI での発火証跡が無い。PR #44 は同一リポジトリ発なのでその分岐を通らない。コード検査とローカルのシェル再現でのみ確認しており、**実際の fork PR で確かめたわけではない**。
- `12:44` - **完了条件 5 は未達のまま。** Cloudflare の Secrets が未登録のため、実 URL の発行と `/calc.html` の 200・内容一致を確認できていない。PR #44 の preview ジョブが「未登録のため発行できない」と赤で落ちた実ログが、設計どおり動いていることの証拠にはなるが、URL の実測ではない。**登録後に空コミットを push して実測する必要がある。**
