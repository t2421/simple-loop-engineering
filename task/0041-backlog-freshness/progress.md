# Progress: `0041-backlog-freshness`

- **Target Spec:** `task/0041-backlog-freshness/spec.md`
- **Branch:** `docs/0041-backlog-freshness`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)
- **Complexity:** `S`

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] 実装 (`CLAUDE.md` の「仕様」節に実測行の規約を追記)
- [x] 実装 (`backlog/0015-playwright-setup-readonly-cache/spec.md` に実測行を適用)
- [/] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- 2026-08-24 - backlog から昇格。置き場所は (a)（`CLAUDE.md`「仕様」節に書式規約を定める）に確定し、完了条件を記入。据え置き中の `0015` への実測行の適用を範囲内の例外とした。progress を新規作成。
- `12:10` - `node tools/start-task.mjs` が 0041 を選び、worktree を用意した（複雑度 `S` → haiku）
- `12:20` - `CLAUDE.md` の「仕様」節に実測行の規約を 2 行で追記。書式・置き場所・更新規則の 3 点を分けて書いた
- `12:25` - `backlog/0015-playwright-setup-readonly-cache/spec.md` の backlog 定型行の直後に実測行を適用。最終実測日（2026-08-23）と据え置き理由（対象環境の `PLAYWRIGHT_BROWSERS_PATH` の実測待ち）が 1 行で読めるようにした

```
=== 完了条件 6 の grep ===
1
=== 完了条件 7: 変更ファイル ===
CLAUDE.md
backlog/0015-playwright-setup-readonly-cache/spec.md
```

  共通の検証（`npm run ci`）の出力はここに書かない。会話に貼る（CLAUDE.md「進捗」）
- `12:30` - **仕様に無いが壊しうる箇所を確かめた。** 実測行を backlog 定型行の直後に置くと、昇格（`tools/promote.mjs` の `stripBacklogLine`）と干渉しうる。`removeLineInSection` は「定型行と、**直後が空行ならその空行も**」消す実装なので、実測行を直後に置いても定型行だけが消え、実測行は残る。実挙動を測った

```
--- 昇格前（backlog）---
## 背景

この項目は backlog。着手しない。progress は作らない。完了条件は未確定。
実測: 2026-08-23 — `tools/setup-playwright.mjs` は今も `npx playwright install chromium` を無条件に実

--- 昇格後（stripBacklogLine 適用後）---
## 背景

実測: 2026-08-23 — `tools/setup-playwright.mjs` は今も `npx playwright install chromium` を無条件に実
```

  昇格後も「いつ時点の観測で着手を決めたか」が spec に残るので、この挙動は望ましい。`tools/promote.mjs` は凍結対象であり、変更していない
- `12:35` - **spec の記述と現状のズレを 1 件記録する（spec は書き換えない）。** spec は 0015 を「現存する唯一の backlog 候補」と書いているが、起草後（2026-08-24）に `0045`〜`0049` が追加され、現在 backlog は 6 件ある。ただし spec の「範囲外」が「既存 backlog 全件への遡及適用は範囲外。ただし `0015` は例外として範囲内」と定めており、**やること・完了条件は変わらない**。着手後の spec 変更は原則しないため、ここに記録するにとどめる
- `12:40` - Verify (外部) を `codex-reviewer` に依頼（進捗の指名どおり）。**新しく入れた `grok-reviewer` を試したいという理由で指名を変えない。** その場の都合でレビュアーを差し替えるのは、ループが防ごうとしている逸脱そのものである
- `12:55` - `codex-reviewer` の判定: **Critical 0 / High 0 で承認。** Medium 1 件・Low 1 件・テスト追加の提案 1 件
- `13:00` - **Medium は私が書いた実測行の事実誤りだった。** 「影響範囲は `npm run test:e2e` だけ」と書いたが、`package.json` の `test` も `test:e2e` を呼ぶので `npm test` でも `pretest:e2e` が走る。実測して確かめた

```
test         "npm run test:unit && npm run test:e2e"
test:e2e     "node --test tests/calc-page.test.mjs tests/calc-vec-add.e2e.mjs"
pretest:e2e  "node tools/setup-playwright.mjs"
ci           "npm run lint && npm run lint:docs && npm run test:unit"
```

  実測行を「`pretest:e2e` を走らせる経路（`npm run test:e2e` と `npm test`）で、`npm run ci` は e2e を呼ばない」に直した。**この作業の目的は「1 行で事実が読めること」なので、その 1 行が不正確なのは目的に直接反する。**
  なお 0015 の背景の散文にも同じ不正確さがある（「影響範囲は `npm run test:e2e` だけである」）。spec 自身が「対象」の記述ズレを「昇格時に直す」と述べており、散文の修正はこの作業の範囲外なので触らない
- `13:05` - Low を反映。`CLAUDE.md` の規約が無条件の書式要求に読め、実測行を持たない既存 backlog 5 件（`0045`〜`0049`）が「規約違反」と読まれうる。「新規に起こすとき・実測して更新するとき」「既存の候補への遡及適用は求めない」を明記した（spec の「範囲外」と一致させた）
- `13:10` - **レビューの 3 件目は、この進捗ファイル自身の規約違反だった。** 共通の検証（`npm run ci`）の出力を試行ログに貼っていた。CLAUDE.md「共通の検証」「進捗」の両方が「progress には書かない」と定めている。該当箇所を削り、作業固有の証跡（grep の結果・昇格との干渉の実測）だけを残した。
  **これはこのセッションで繰り返していた癖である。** 0053・0054 の進捗（アーカイブ済み）にも同じ出力が入っている。遡及修正はこの作業の範囲外なので触らないが、機械で捕まえる検査の提案がレビューから出ている（下記）
- `13:15` - **範囲外として持ち越す提案（レビュアーからのテスト追加提案）。** `tools/lint-docs.mjs` に「progress の本文に共通検証の出力を貼らない」検査を足す。純関数 + ユニットテストで実装でき、ユニットテストの件数集計行や docs lint の成功メッセージを含む progress を違反にする（検知パターンの literal はここに書かない。書くとこの検査自身に引っかかる）。**0041 の範囲外なので別 backlog として起票するのが正しい**
