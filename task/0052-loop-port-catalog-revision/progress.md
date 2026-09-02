# Progress: `0052-loop-port-catalog-revision`

- **Target Spec:** `task/0052-loop-port-catalog-revision/spec.md`
- **Branch:** `feat/0052-loop-port-catalog-revision`
- **PR:** `未作成`
- **Status:** `Not Started` (Phase: `Plan`)
- **Complexity:** `M`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [ ] Specの要件・受け入れ条件の確認（`task/archive/0044-second-project-port/notes/port-log.md` の 2.6 (a)(c)・2.7「新規項目」・4 節 (c)・5 節「`loop-port` スキルへ」を読み、spec「背景」の対応表と照合する。記録は凍結対象なので読むだけ）
- [ ] 2.14〜2.17 の 4 節を `.claude/skills/loop-port/SKILL.md` に追加（記録の該当節を出典に、「場所 / 現在の値」表・`**方針。**` 段落・`出典:` 行の 3 要素で書く）
- [ ] 2.18 を追加（spec「背景」の引用ブロック 5 点を出典に。2.16 と相互参照する）
- [ ] 4 章「アンチパターン」に `**導入 PR を 1 本にまとめる。**` を追加（2.18 を参照）
- [ ] spec「例」の grep・`git diff` をすべて実行し、出力を会話に貼る（削除行 0・変更ファイル 2 件を含む）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得（spec「仕様」の節ごとの必須命題と本文の 1 対 1 照合を依頼する。差分・spec・「例」の実測出力だけを渡す）
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `--:--` - spec・progress を起草（`spec-author`）。Complexity は `M`: 変更ファイルは 1 つだが、記録 5 節の申し送り 4 件と未記録の 5 件目を既存カタログの書式へ書き換える判断を含み、定型作業ではない。凍結対象には触れないので `allow-protected-change` は不要。移植元の Stop hook（`.claude/settings.json`）が今も検証失敗時に exit 1 を返すことを実測し、spec「背景」に現在の値として記録した（修正は範囲外）。
