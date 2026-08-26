# Progress: `0038-promote-tool`

- **Target Spec:** `task/0038-promote-tool/spec.md`
- **Branch:** `feat/0038-promote-tool`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/promote.test.mjs`)
- [x] 実装 (`tools/promote.mjs`)
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `2026-08-24` - backlog から昇格。完了条件を確定し（未確定行の削除・失敗時と例の確定・固有の命題 5〜7 を追加）、progress を新規作成した。backlog 段階の「未確定（incomplete）行は消さない」という記述は、実作業（昇格時に消す）に合わせて訂正した。
- `11:13` - `tools/promote.mjs` を新規作成し、`tests/promote.test.mjs`（16 件）を置いた。`npm run ci` は 417 件全通過。実 backlog（`0015-playwright-setup-readonly-cache`）に対して CLI を回し、`git mv`・背景の backlog 行の削除・完了条件の未確定行の削除（「失敗時」「例」の前置きは残る）・progress の生成を実測してから巻き戻した。
- `11:13` - 実装中に気づいた点: 生成される progress は **Complexity** がプレースホルダ（`<S | M | L>`）のままなので、そのままコミットすると `npm run lint:docs` が `Complexity が不正` で落ちる。仕様（完了条件 6）が明示的にプレースホルダを残すことを求めており、これは「昇格しただけでは未完成であり、人間が等級を埋めるまで CI が緑にならない」という設計として意図どおりと解釈した。spec は変更していない。
- `12:06` - `codex-reviewer` から**不承認**（Critical 0 / High 1）。以下を修正した。
- `12:06` - High（`git mv` 後、spec の書き換えに成功して progress の書き込みに失敗すると、`rollback()` が移動しか戻さず、backlog 行を削った spec が残る）を修正。書き込み順を progress → spec に変え（progress で落ちれば spec は無傷）、`rollback()` が書きかけの progress を消し、spec を元の中身に書き戻してから移動を巻き戻すようにした。書き込みを注入できる `writeFile` を足し、「progress は書けるが spec は書けない」失敗を注入する回帰テストと、実ファイル系で `EISDIR` を起こす回帰テストの 2 本で `snapshot` の一致を表明している。
- `12:06` - Medium 1（コードフェンス内の `## 完了条件` を節の先頭と誤認する）を修正。節の探索を `tools/lint-docs.mjs` の `linesOutsideFences` に委ね、lint と同じ行集合を見るようにした。行ベースの `removeLineInSection` に作り替え、フェンス内の見出しを無視する回帰テスト 2 本を追加。
- `12:06` - Medium 2（完了条件 6 をテスト内の手書き複製に対して検証している）を修正。実物の `task/TEMPLATE-progress.md` を読んで見出し名・順番とメタ値を検証するテストを追加した（テンプレートは読むだけで変更していない）。
- `12:06` - Low 2 件（git リポジトリ外での実行がスタックトレースを出す／Complexity プレースホルダと `lint:docs` の関係が案内されない）も修正した。`npm run ci` は 422 件全通過。
