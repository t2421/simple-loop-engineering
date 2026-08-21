# Progress: `0032-preview-verify-redirect`

- **Target Spec:** `task/0032-preview-verify-redirect/spec.md`
- **Branch:** `feature/preview-verify-redirect`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認
- [ ] 実装 (`.github/workflows/preview.yml` の `Verify deployed content` の curl にリダイレクト追従を足す)
- [ ] 実装 (`task/archive/0013-cloudflare-preview/spec.md` の「例」の該当行を実挙動に合わせる)
- [ ] 保護パスガードの両方向の確認（ラベル無しで検知して失敗すること、ラベル付きで通過すること。両方の出力を会話に貼る）
- [ ] preview ジョブが実 URL に対して成功し `検証 OK:` が出ることの確認（完了条件 5。ログを会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。**`allow-protected-change` ラベルを付ける。** 凍結対象 2 件の改訂であることと、検証を弱めない理由を本文に明記する）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `07:33` - 0013 の完了条件 5 をアーカイブ後に実測した結果として起票。実測の詳細は `task/archive/0013-cloudflare-preview/progress.md` の末尾に記録済み。
- `07:33` - **原因は Pages の既定挙動。** `/calc.html` が `/calc` へ 308 リダイレクトされる（`location: /calc`）。実測: `/calc.html` が `http=308`、`/calc` が `http=200`。検証ステップの `curl -fsS` は `-L` が無く 308 を追わず、`-f` は 3xx をエラーとしないため exit 0 で空ファイルを書き、続く `diff` が必ず落ちる。CI で再現済み（diff が `-` 行だけ、`+` 行が 0）。
- `07:33` - **プレビュー環境自体は正しい。** 手元から `curl -sSL` した `/calc.html` は `diff -u src/calc.html` が差分なし。直すのは検証の書き方と spec の期待値であって、配信物ではない。
- `07:33` - **方針は「curl に追従を足し、0013 の例を実挙動に合わせる」**（人間が選択）。Pages 側の設定（`_redirects` 等）で `.html` を維持する案は、配信物に設定ファイルが増えるため採らない。範囲外に明記した。
- `07:33` - **凍結対象 2 件に触れる。** `.github/workflows/preview.yml`（既存ファイル）と `task/archive/0013-cloudflare-preview/spec.md`。CLAUDE.md「凍結を解いて改訂するとき」に従い、改訂の内容と理由を spec の「背景」に書いた。PR には `allow-protected-change` ラベルが要る。
