---
name: add-protected-path
description: >-
  Adds a path to (or removes one from) the CI guard that blocks changes to
  protected files. Use when something new must be frozen against agent edits,
  when CLAUDE.md's 変えてはいけないもの list needs a new entry, or when the
  guard must stop flagging a path it currently blocks.
origin: user
---

# 保護するパスを増やす・外す

CLAUDE.md「変えてはいけないもの」の一覧は、CI のガード（`.github/workflows/guard.yml`）が機械的に検知する。判定は `tools/check-protected-paths.mjs` にある。

**CLAUDE.md に行を足すだけではガードは検知しない。** 一覧・判定ロジック・テスト・spec の 4 つを揃える。

## 判断

まず「何を防ぐのか」を一文で決める。目的は**検証を弱める変更**を止めることである。触られたくないだけのファイルは対象にしない。守る対象が増えるほど正当な作業が止まり、`allow-protected-change` ラベルが常用されてガードが形骸化する。

## 手順

### 1. 新しい作業として spec / progress を起こす

保護を増やすことは新しい作業である。`specs/TEMPLATE.md` と `progress/TEMPLATE.md` からコピーして埋め、[コミットとマージ](../../../CLAUDE.md) の規約どおり計画用ブランチの docs PR で main へ入れる。

**アーカイブ済みの `specs/archive/guard-protected-paths.md` は編集しない。** 完了した作業の記録である。

### 2. CLAUDE.md「変えてはいけないもの」の一覧に行を足す

人間が読む一覧。判定の実体ではない。

### 3. `tools/check-protected-paths.mjs` の判定に足す

守り方は 3 つある。**該当する形を選ぶ。**

| 守るもの | 直す場所 | 追加で要ること |
|---|---|---|
| ディレクトリごと | `APPEND_ONLY_DIRS` に 1 エントリ | なし |
| 単一ファイル | `TEMPLATES` の配列に 1 行 | なし |
| ファイル内の特定の値 | `findViolations` に専用の判定 | `main()` の配線（下記） |

**ディレクトリごと守る場合**は `{ prefix, label, archiveMove }` の 3 つ組で足す。`label` は違反メッセージ（`既存の${label}の内容が変わっている`）に出るので省略しない。`archiveMove` は、内容が同一のままの同ディレクトリ内の移動（アーカイブ作業）を許すかどうか。`specs/` だけが `true` である。

```js
const APPEND_ONLY_DIRS = [
  { prefix: 'specs/', label: '仕様', archiveMove: true },
  { prefix: 'tests/', label: 'テスト', archiveMove: false },
];
```

**単一ファイルを守る場合**は `TEMPLATES` の配列に足すのが正規の形である。1 行で済み、判定ロジックを書く必要はない。

```js
const TEMPLATES = ['specs/TEMPLATE.md', 'progress/TEMPLATE.md'];
```

`CHECKER` の専用分岐を雛形にしない。あれには `status !== 'A'`（新規追加を許す）というガード導入 PR 専用の緩和が入っており、他のファイルにコピーすると意味のない抜け穴を持ち込む。

**ファイル内の特定の値を守る場合**（`package.json` の `scripts` がこれ）は、純関数を直すだけでは CLI で効かない。`main()` 側の配線も要る。

1. `findViolations` の引数に新しいキーを足して判定を書く
2. `main()` で base 側と head 側の値を読む（`readScripts` と同じ形。base は `mergeBase`、head は `HEAD`）
3. `findViolations({ changes, ... })` の呼び出しに新しいキーを渡す

3 を忘れると、テストは通るのに CI では検知しない。

### 4. `tests/protected-paths.test.mjs` にケースを足す

**違反側だけでなく許可側も書く。** 許可側を書かないと、正当な操作まで止めるガードになる。

- 違反: 内容変更・削除・保護ディレクトリの外へのリネーム
- 許可: 新規追加・（`archiveMove` が true なら）内容同一の同ディレクトリ内移動

### 5. `specs/` 側の「仕様」と「例」の両方に足す

手順 1 で起こした spec の「仕様」の列挙に足し、**「例」の表にも行を足す。** ガードの完了条件は「例」の各行をテストが網羅することを要求している。「仕様」だけ足して「例」を足さないと、完了条件を満たさない。

### 6. PR に `allow-protected-change` ラベルを付ける

この作業は必ず自分のガードに引っかかる。手順 3（`tools/check-protected-paths.mjs`）・手順 4（既存 `tests/`）・手順 5（既存 `specs/`）が**それぞれ独立に**違反判定される。ラベルは人間による明示承認の経路であり、引っかかること自体は正しい動作である。

## 効き始めるのはマージ後から

ガードは **base リビジョンの** `tools/check-protected-paths.mjs` を実行する。候補側のチェッカーを実行すると、判定を潰す変更と保護パスの変更を同じ PR に入れるだけで回避できてしまうためである。

したがって**保護を足す PR 自身は古い判定で評価される。** 新しい保護が効くのは、その PR がマージされた後の PR からである。導入 PR で新しい保護が効かないのは想定どおりで、異常ではない。

## 外すとき

同じ手順を踏む。外す理由を spec に書き、人間の承認を経る。テストからは違反側のケースを消し、許可されるようになったことを示すケースを残す。
