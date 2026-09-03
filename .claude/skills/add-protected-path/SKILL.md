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

CLAUDE.md「変えてはいけないもの」の一覧は、CI のガード（`.github/workflows/guard.yml`）が機械的に検知する。判定は `loop-core/gate/check-protected-paths.mjs` にある。

**CLAUDE.md に行を足すだけではガードは検知しない。** 一覧・判定ロジック・テスト・spec の 4 つを揃える。

## 判断

まず「何を防ぐのか」を一文で決める。目的は**検証を弱める変更**を止めることである。触られたくないだけのファイルは対象にしない。守る対象が増えるほど正当な作業が止まり、`allow-protected-change` ラベルが常用されてガードが形骸化する。

## 手順

### 1. 新しい作業として spec / progress を起こす

保護を増やすことは新しい作業である。`task/TEMPLATE-spec.md` と `task/TEMPLATE-progress.md` からコピーして埋め、[コミットとマージ](../../../CLAUDE.md) の規約どおり計画用ブランチの docs PR で main へ入れる。

**アーカイブ済みの `task/archive/0008-guard-protected-paths/spec.md` は編集しない。** 完了した作業の記録である。

### 2. CLAUDE.md「変えてはいけないもの」の一覧に行を足す

人間が読む一覧。判定の実体ではない。

### 3. `loop-core/gate/check-protected-paths.mjs` の判定に足す

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
  { prefix: '.github/workflows/', label: 'ワークフロー', archiveMove: false },
];
```

**単一ファイルを守る場合**は `TEMPLATES` の配列に足すのが最も短い。1 行で済み、判定ロジックを書く必要はない。

```js
const TEMPLATES = ['specs/TEMPLATE.md', 'progress/TEMPLATE.md'];
```

ただし `TEMPLATES` には**そのまま流用できない前提が 2 つある。** 足す前に確かめる。

| 前提 | 影響 |
|---|---|
| 違反メッセージが `型（TEMPLATE.md）は変更も移動もできない` に固定されている | テンプレ以外を足すと、実態と食い違うメッセージが出る |
| `status === 'A'` の除外が無い | **そのパスの新規作成まで違反になる** |

どちらかが困るなら、`TEMPLATES` には足さず専用の判定を書く。`CHECKER` の分岐がその例である。

```js
if ((path === CHECKER && status !== 'A') || oldPath === CHECKER) {
```

`CHECKER` を雛形にするときは `status !== 'A'`（新規追加を許す）の扱いを毎回決め直す。これはガード導入 PR 自身を通すための緩和であり、無条件にコピーすると意味のない抜け穴を持ち込む。

**ファイル内の特定の値を守る場合**（`package.json` の `scripts` がこれ）は、純関数を直すだけでは CLI で効かない。`main()` 側の配線も要る。

1. `findViolations` の引数に新しいキーを足して判定を書く
2. `main()` で base 側と head 側の値を読む（`readScripts` と同じ形。base は `mergeBase`、head は `HEAD`）
3. `findViolations({ changes, ... })` の呼び出しに新しいキーを渡す

3 を忘れると、テストは通るのに CI では検知しない。

### 4. `tests/protected-paths.test.mjs` にケースを足す

**違反側だけでなく許可側も書く。** 許可側を書かないと、正当な操作まで止めるガードになる。

- 違反: 内容変更・削除・保護ディレクトリの外へのリネーム
- 許可: 新規追加・（`archiveMove` が true なら）内容同一の同ディレクトリ内移動

### 5. spec の「仕様」と「例」の両方が埋まっていることを確かめる

**「仕様」の列挙と「例」の表の両方に行が要る。** ガードの完了条件は「例」の各行をテストが網羅することを要求しているので、「仕様」だけ書いて「例」を落とすと完了条件を満たさない。

手順 1 で spec を書ききっていれば、ここは確認だけで終わる。**それが普通の経路である。**

着手後に spec を書き換える必要が出た場合だけ、[コミットとマージ](../../../CLAUDE.md) の「spec の変更」に従う。着手後は原則変更しない。変更するなら内容と理由を進捗の試行ログに記録し、**人間の承認を経てから**行う。

### 6. PR に `allow-protected-change` ラベルを付ける

この作業は必ず自分のガードに引っかかる。手順 3（`loop-core/gate/check-protected-paths.mjs` の変更）と手順 4（既存 `tests/` の変更）が**それぞれ独立に**違反判定されるためである。手順 5 で着手後に spec を書き換えたなら、それも別に数えられる。

手順 2（CLAUDE.md）は違反にならない。CLAUDE.md はどの保護リストにも入っていない。

ラベルは人間による明示承認の経路であり、引っかかること自体は正しい動作である。

## 効き始めるのはマージ後から

ガードは **base リビジョンの** `loop-core/gate/check-protected-paths.mjs` を実行する。候補側のチェッカーを実行すると、判定を潰す変更と保護パスの変更を同じ PR に入れるだけで回避できてしまうためである。

したがって**保護を足す PR 自身は古い判定で評価される。** 新しい保護が効くのは、その PR がマージされた後の PR からである。導入 PR で新しい保護が効かないのは想定どおりで、異常ではない。

## 外すとき

同じ手順を踏む。外す理由を spec に書き、人間の承認を経る。テストからは違反側のケースを消し、許可されるようになったことを示すケースを残す。
