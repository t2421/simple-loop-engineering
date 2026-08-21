# Progress: `0013-cloudflare-preview`

- **Target Spec:** `task/0013-cloudflare-preview/spec.md`
- **Branch:** `feature/cloudflare-preview`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 実装 (`.github/workflows/preview.yml` の新規作成。既存ワークフローは触らない)
- [ ] Secrets 未登録・fork PR の早期終了が「黙って成功にならない」ことの確認
- [ ] 自分の PR で preview ジョブが実際に走ったログの取得（完了条件 5）
- [ ] Secrets 登録後、コメントされた URL の `/calc.html` が 200 を返し `src/calc.html` と同一であることの `curl` 実測
- [ ] `git diff main -- package.json .github/workflows/ci.yml .github/workflows/guard.yml` が空であることの確認（完了条件 6）
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
