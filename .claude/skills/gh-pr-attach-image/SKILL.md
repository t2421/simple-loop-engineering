---
name: gh-pr-attach-image
description: >-
  Uploads images to a GitHub pull request as user-attachments without
  committing files to the git repository. Use when attaching screenshots to a
  PR, adding UI captures to a pull request body or comment, or when the user
  asks to paste images on a GitHub PR without putting them in the repo.
origin: user
---

# GitHub PR に画像を添付する

リポジトリに PNG をコミットしない。GitHub の PR 添付（`user-attachments`）に上げ、本文またはコメントの markdown から参照する。ブラウザで PR にドロップしたときと同じ置き場。

`gh` には公式の添付コマンドが無い。この skill のスクリプトを使う。

このリポジトリでは `.claude/skills/gh-pr-attach-image/` が正。Cursor 用は `.cursor/skills/gh-pr-attach-image` から同じディレクトリを参照する。

## 使わないこと

- `git add` / commit / push で画像をブランチに載せない
- gist に上げない（バイナリ非対応、可視性も違う）
- `https://github.com/upload/policies/assets` は使わない（PAT では 422）
- 失敗したらリポジトリへフォールバックしない。エラーを報告する

## 手順

1. 画像は `/tmp` など git 管理外に置く。キャプチャもリポジトリ配下に書かない。
2. `gh auth status` が通っていることを確認する。
3. この skill のスクリプトでアップロードする。パスはこの skill の場所に合わせる。

```bash
# このリポジトリ
bash .claude/skills/gh-pr-attach-image/scripts/upload.sh /tmp/default.png /tmp/add-result.png
bash .claude/skills/gh-pr-attach-image/scripts/upload.sh --pr 3 /tmp/default.png
bash .claude/skills/gh-pr-attach-image/scripts/upload.sh --pr 3 --comment /tmp/default.png
```

cwd が対象リポジトリでないときは `--repo owner/name` を付ける。

4. `--pr` を使わない場合は、出力された `![alt](https://github.com/user-attachments/assets/...)` を `gh pr edit` の本文へ入れる。既存本文を消さない。
5. 貼った URL が `https://github.com/user-attachments/assets/` で始まることを確認する。

## スクリプトの中身

`scripts/upload.sh` は次の非公式エンドポイントに `gh auth token` の Bearer で POST する。

```
POST https://uploads.github.com/user-attachments/assets
  ?name=<filename>&content_type=<mime>&repository_id=<id>
Authorization: Bearer <gh auth token>
Accept: application/json
body: raw file bytes
```

成功は HTTP 201 と `{"url":"https://github.com/user-attachments/assets/<uuid>"}`。

対応拡張子: `png` / `jpg` / `jpeg` / `gif` / `webp` / `svg`。

## 見た目レビュー用

UI 変更の PR では、Figma 抽出 PNG ではなくブラウザで描画した画面を添付する。仕様に状態があるなら、レビューに必要な状態分を添える。
