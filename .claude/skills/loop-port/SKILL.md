---
name: loop-port
description: このリポジトリのループエンジニアリング機構（spec 駆動・凍結ガード・Stop hook・アーカイブ）を別のリポジトリへ持ち出すときに、どこを書き換えるかと、その書き換えを何を基準に決めるかの手引き。移植・エクスポート・他プロジェクトへの適用で使う。
---

# ループ機構の移植

このリポジトリのループを別のプロジェクトへ持ち出すときに **書き換えが要る箇所** と、
その箇所を **何を基準に埋めるか（方針）** を並べる。

対象は 2 つ。

- ループの骨格（`tools/`・`task/` 構造・テンプレ・CI ゲート・hook）
- ループの実行系である `CLAUDE.md`

前提: 移植先は Node とは限らない。ここでは「Node 以外へ持ち出しても壊れない形」を基準に書く。

---

## 0. 先に読む: 移植の順序

1. **`CLAUDE.md` を先に埋める。** ツールより先である。ループを回すのはツールではなく `CLAUDE.md` で、
   固有語のヒットもここが最多（22 件）である。ツールは `CLAUDE.md` が要求する検査を機械化しているにすぎない
2. **共通化・パッケージ化をしない。** 1 回目の移植は手で行い、書き換えた箇所を記録する。
   2 つ目のプロジェクトが存在する前に抽象化すると speculative generality になる
   （`backlog/0044-second-project-port` の主張がこれである）
3. **工程は減らしてよいが、ゲートは減らさない。** e2e・見た目・プレビューは移植先に無いなら省く。
   Verify 2 段・Critical ゼロ・凍結ガード・進捗結合は省かない

## 1. 分類

固有語スキャンだけでは移植コストを測れない。**言語固有語（`npm` / `package.json` / `playwright` など）と
レイアウト固有語（`src/` / `tests/` / `task/` など）は別軸である。** 実測（2026-08-27）:

| ファイル | 言語固有語 | レイアウト固有語 | 移植時の扱い |
|---|---:|---:|---|
| `tools/check-actions.mjs` | 0 | 0 | そのまま（GitHub 前提のみ） |
| `tools/stop-hook-ci-dir.mjs` | 2 | 0 | そのまま（コメントのみ） |
| `tools/guard-worktree.mjs` | 0 | 1 | 定数 1 個を差し替え |
| `tools/archive.mjs` | 0 | 4 | ほぼそのまま（`task/` 名を使うなら無変更） |
| `tools/check-progress-coupling.mjs` | 0 | 4 | 定数 1 個を差し替え |
| `tools/lint-docs.mjs` | 1 | 8 | テンプレ定義に追随。旧レイアウト分を削る |
| `tools/promote.mjs` | 1 | 6 | ほぼそのまま |
| `tools/start-task.mjs` | 5 | 7 | 依存導入コマンドとモデル表を差し替え |
| `tools/check-protected-paths.mjs` | 8 | 5 | **最重要。保護対象の再定義が要る** |
| `tools/run-unit-tests.mjs` | 3 | 1 | 移植先の慣習しだいで不要になる |
| `tools/e2e-needed.mjs` | 7 | 3 | 作り直すか、丸ごと落とす |
| `tools/setup-playwright.mjs` | 5 | 0 | 作り直すか、丸ごと落とす |

「言語固有語 0 件だから無変更で動く」は成り立たない。`check-progress-coupling.mjs` と
`guard-worktree.mjs` は言語には依存しないが **ディレクトリ名には依存する**。

これを踏まえた 4 層。

| 層 | 中身 | 扱い |
|---|---|---|
| 不変 | ループの原則、進捗・spec の型、ガードの判定構造、Stop hook の骨格 | そのまま持ち出す |
| 穴 | 検証コマンド・実装ディレクトリ名・依存導入・保護対象・モデル表・レビュアー名 | **埋める**（本文 2 章） |
| 作り直し | e2e / 見た目 / プレビューの工程 | 移植先に対応物があるときだけ作る |
| 置いていく | `specs/`・`progress/`（移行前の遺物）、`src/` のアプリ、算術テスト、Figma 抽出物、legacy 例外リスト | 持ち出さない |

---

## 2. 変更箇所カタログ

各項目は **場所 / 現在の値 / 方針（何を基準に決めるか）** で書く。

### 2.1 検証コマンドの契約（最初に決める）

| 場所 | 現在の値 |
|---|---|
| `package.json` の `scripts.ci` | `npm run lint && npm run lint:docs && npm run test:unit` |
| `tools/check-protected-paths.mjs:471` | `git show <ref>:package.json` を読み、`scripts` の変化を違反にする |
| `tools/stop-hook-ci-dir.mjs` + `.claude/settings.json` の Stop hook | `cd <CI 対象ディレクトリ> && npm run ci` |
| `.github/workflows/ci.yml` の `verify` ジョブ | `npm run ci` |

**方針。** ここは「検証コマンド（何を実行するか）」と「その定義がどのファイルにあるか」の **2 つ**を移す。
片方だけ移すと凍結が空洞化する。`command` だけを差し替えて `definedIn` を `package.json` のまま
残すと、移植先の `Makefile` や `pyproject.toml` を書き換えて検証を弱める経路が開く。

移植先ごとの `definedIn` の当たり:

| 移植先 | command | definedIn |
|---|---|---|
| Python | `make ci` / `uv run task ci` | `Makefile` / `pyproject.toml` |
| Swift | `make ci` / `swift test` | `Makefile` / `Package.swift` |
| Go | `make ci` | `Makefile` |
| Gradle | `./gradlew check` | `build.gradle(.kts)` |

判断基準は 1 つ。**「そのファイルを書き換えると検証が弱まるか」。** 弱まるなら `definedIn` に入れて凍結する。

`readScripts()` 相当は「定義ファイルから検証コマンドの定義部分を取り出す」1 関数に閉じ込める。
JSON でない形式（Makefile など）では、パースせず **ファイル内容の同一性**で判定してよい。
判定は緩くするより強くする側に倒す。

### 2.2 実装ディレクトリの名前

| 場所 | 現在の値 | 効果 |
|---|---|---|
| `tools/check-progress-coupling.mjs:57` | `['src/', 'tests/', 'tools/']` | ここを触る PR に progress 更新を要求する |
| `tools/guard-worktree.mjs:40` | `['src', 'tests', 'tools']` | プライマリチェックアウトでの実装編集をブロックする |

**方針。** 「**触ったら実装変更とみなす場所**」を列挙する。ソースだけでなく **テストとループのツール自身**を
含めるのが要点である。ツールを外すと、ゲートを緩める変更が進捗の記録なしに入る。
`Sources/`・`app/`・`lib/`・`internal/` など移植先の慣習名に置き換える。ビルド生成物は入れない。

### 2.3 依存導入コマンド

| 場所 | 現在の値 |
|---|---|
| `tools/start-task.mjs:269` | `exec('npm', ['ci'], { cwd: worktreePath })` |

**方針。** worktree は空の `node_modules` を持つので導入が要る。基準は
**「新しい worktree でその 1 コマンドを打てば検証が走る状態になるか」**。
`uv sync` / `poetry install` / `bundle install` / `go mod download` / `swift package resolve` など。
導入が不要な言語（依存が全部グローバル、あるいは vendored）では **この呼び出しごと落とす**。
空コマンドを置かない。

### 2.4 テストの列挙

| 場所 | 現在の値 |
|---|---|
| `tools/run-unit-tests.mjs:13` | `E2E_TEST_FILE = 'calc-page.test.mjs'` を除いて `tests/*.test.mjs` を `node --test` に渡す |

**方針。** このツールが存在する理由は **Node のテストランナーが自動発見しないから**である。
移植先のランナーが自前で発見するなら（pytest・go test ./...・swift test・JUnit）**このツールは要らない**。
消して `ci` から直接ランナーを呼ぶ。

残す場合の基準は「新しいテストを足したときに、**別のファイルへの登録を忘れると黙って実行されない**」
状態を作らないこと。登録忘れが検知されない列挙は、検証を弱める穴である。

### 2.5 条件付き工程（e2e・見た目・プレビュー）

| 場所 | 現在の値 |
|---|---|
| `tools/e2e-needed.mjs:19-20,61-64` | `src/`・`tests/calc-page.test.mjs`・`tools/setup-playwright.mjs`・`package.json`・`calc-page.*` の差分で発火 |
| `tools/setup-playwright.mjs` | Playwright ブラウザの導入 |
| `package.json` の `test:e2e` / `pretest:e2e` | `node --test tests/calc-page.test.mjs` |
| `.github/workflows/ci.yml` の `e2e` ジョブ | base 版 `e2e-needed.mjs` で判定してから実行 |
| `.github/workflows/preview.yml` | Cloudflare Pages。プロジェクト名 `simple-loop-engineering`、公開元 `src`、検証対象 `/calc.html` |
| `.claude/skills/figma-extract` | Figma 抽出物の保存先・命名 |
| `.claude/agents/visual-design-reviewer.md` | トークン契約・計算スタイル・ピクセル残差のレビュー |

**方針。** これらは **省略可能な工程**であって、プラグイン枠ではない。移植先に UI が無いなら
**ファイルごと消す**。空の `e2e-needed`（常に false を返す）や空の `visual-design-reviewer` を置かない。
存在しない工程を「存在するが何もしない」形で残すと、後から本当に必要になったときに
「すでにある（ように見える）」ため誰も作らない。

作る場合の設計基準は 2 つ。

- **発火条件は差分のパスで決める。** 「重い工程を毎回回すか、間引くか」を人間の裁量にしない
- **判定コードは base リビジョン側を実行する。** 候補側を実行すると、判定を常に false にする変更と
  実装変更を同じ PR に入れるだけで工程を間引ける（`ci.yml` の `e2e` ジョブと `guard.yml` が
  そうしている理由がこれである）。この仕掛けは移植先でもそのまま持ち出す

### 2.6 保護対象（凍結）の再定義

| 場所 | 現在の値 |
|---|---|
| `tools/check-protected-paths.mjs:31-35` `TEMPLATES` | `task/TEMPLATE-spec.md`・`task/TEMPLATE-progress.md`・`specs/TEMPLATE.md`・`progress/TEMPLATE.md` |
| 同 `:42` `CHECKER` | `tools/check-protected-paths.mjs` 自身 |
| 同 `:57-68` `GATE_HELPERS` | `run-unit-tests` / `e2e-needed` / `check-progress-coupling` / `stop-hook-ci-dir` / `check-actions` |
| 同 `:81-90` `APPEND_ONLY_DIRS` | `task/`（`progress.md` 除外）・`specs/`・`tests/`・`.github/workflows/` |
| 同 `:28` `ALLOW_LABEL` | `allow-protected-change` |
| `CLAUDE.md`「変えてはいけないもの」 | 上と対になる人間向けの一覧 |

**方針。** 保護対象を選ぶ基準は 1 つだけである。

> **それを書き換えれば停止条件を「達成」できてしまうか。**

該当するのは 4 種類。移植先でもこの 4 種類を洗い直す。

1. **期待値**（spec の完了条件、テストの期待値、トークン表、抽出物）
2. **検証コマンドの定義**（2.1 の `definedIn`）
3. **ゲートの判定コード**（`GATE_HELPERS` 相当。**チェッカー自身を筆頭に含める**）
4. **型**（テンプレート。見出し名・順番が変わると lint が意味を失う）

移植で落とすもの: `specs/TEMPLATE.md`・`progress/TEMPLATE.md`・`APPEND_ONLY_DIRS` の `specs/` 行。
これは移行前の遺物で、新しいリポジトリには存在しない。

移植で足すべきもの: 移植先に **ビルド定義・lint 設定・CI 設定** が別ファイルであるなら、それらを
`GATE_HELPERS` 相当に足す。判断は `.claude/skills/add-protected-path` の手続きに従う。
**`CLAUDE.md` の一覧に行を足すだけではガードは検知しない**（これは移植先でも同じ落とし穴である）。

### 2.7 モデルルーティング

| 場所 | 現在の値 |
|---|---|
| `tools/start-task.mjs:39` | `{ S: 'haiku', M: 'sonnet', L: 'fable' }` |
| `tools/start-task.mjs:45` | `DEFAULT_COMPLEXITY = 'M'` |
| `tools/lint-docs.mjs:50` | `COMPLEXITY_VALUES = ['S','M','L']` |
| `.claude/agents/spec-author.md` | `model: fable` |

**方針。** 等級（S/M/L）の意味は不変。**対応先のモデル名だけがプロジェクトと時期に依存する。**
基準は「実装 1 件あたりの設計判断の量」であって、コード行数ではない。
移植先のコストとレイテンシの許容範囲で表を引き直す。表を変えるのはコード変更であり、
PR レビューを通す（会話ごとの裁量にしない）ことは移植後も守る。

### 2.8 レビュアーエージェント

| 場所 | 現在の値 |
|---|---|
| `.claude/agents/codex-reviewer.md` | `codex review --uncommitted`。差分の正しさ・保守性・仕様逸脱 |
| `.claude/agents/visual-design-reviewer.md` | 見た目 |
| `.claude/agents/spec-author.md` | spec / progress 起草 |
| `task/TEMPLATE-progress.md` のチェックリスト | `レビューサブエージェント (<レビュアー名>) の承認取得` |

**方針。** 不変なのは **「実装したのと別の視点が Critical ゼロを宣言するまで完了にしない」** という構造であり、
エージェント名でも `codex` でもない。移植先では次を決めればよい。

- **別視点をどう用意するか**（別モデル、別 CLI、人間のレビュー）
- **重大度の語彙**（Critical / High / Medium / Low）と、**何がブロッキングか**
- **レビュアーがテストを再実行しないこと**（read-only サンドボックスの `EPERM` 切り分けにトークンを溶かす。
  合否は親が貼った実測結果で判定する）

この 3 点目は移植先の言語に関係なく効く。エージェント定義に必ず書き写す。

### 2.9 ホスティングと CI の前提

| 場所 | 前提 |
|---|---|
| `tools/archive.mjs:164,185` | `gh pr view` / `gh repo view`（GitHub CLI） |
| `tools/check-actions.mjs:303` | `gh api repos/{owner}/{repo}/commits/<sha>/check-runs` |
| `tools/start-task.mjs:266` | worktree を **`main`** から切る |
| `.github/workflows/*.yml` | GitHub Actions、`actions/setup-node@v4`、`node-version: '22'` |
| `guard.yml` / `ci.yml` | PR ラベル（`allow-protected-change` / `no-progress-needed`）で例外を通す |

**方針。** GitHub 以外（GitLab・Forgejo・社内 Gerrit）へ移すなら、置き換えるのは
**「PR がマージ済みか」と「HEAD のチェックが全部緑か」を答える 2 つの問い合わせ**だけである。
どちらも 1 関数（`checkPrWithGh` / `fetchChecksFromGh`）に閉じているので、そこだけ差し替える。

例外の経路（ラベル）に対応物が無いホストなら、**例外を無くす**側に倒す。
「例外が申請できない」は運用上の不便だが、「例外が黙って通る」は検証の破綻である。

既定ブランチが `main` でないなら `start-task.mjs:266` を直す。`master` のまま
worktree を `main` から切ろうとすると、開始が毎回失敗する。

### 2.10 hook と権限

| 場所 | 現在の値 |
|---|---|
| `.claude/settings.json` PreToolUse | `guard-worktree.mjs`（プライマリでの実装編集をブロック） |
| `.claude/settings.json` Stop | `stop-hook-ci-dir.mjs` → `npm run ci` → `check-actions.mjs`、`timeout: 900` |
| `.claude/settings.json` PostToolUse | `check-actions.mjs --on-bash-post` |
| `.claude/settings.local.json` | `Bash(npm run *)` の許可 |

**方針。** 構造（編集前にブロック / 停止時に CI と Actions を確認）は不変。
差し替えるのは **CI コマンドと許可リストの語彙**だけである。

`timeout` は移植先の CI の実測時間から決める。短すぎる timeout は Stop hook を
「たまに落ちる邪魔なもの」にし、必ず無効化される。**検証が重いなら timeout を伸ばす。
検証を削らない。**

許可リスト（`settings.local.json`）は移植先のコマンド名に置き換える。非対話実行では
許可リストに無いコマンドが黙って拒否され、エージェントが「何もしない」ように見える。

### 2.11 lint の型と自然言語の固定文字列

| 場所 | 現在の値 |
|---|---|
| `tools/lint-docs.mjs:26-35` `SPEC_HEADINGS` | `種別 / 対象 / 背景 / 仕様 / 範囲外 / 失敗時 / 例 / 完了条件` |
| 同 `:38` `METADATA_KEYS` | `Target Spec / Branch / PR / Status` |
| 同 `:41` `STATUS_VALUES` | `Not Started / In Progress / Blocked / Done` |
| 同 `:53` `BACKLOG_INCOMPLETE_LINE` | `未確定（incomplete）。昇格時に埋める。` |
| 同 `:99-102` `LEGACY_PROGRESS_WITHOUT_PR` | `task/archive/0001-math-add/progress.md` ほか 1 件 |
| 同 `:66` `WORK_DIR_PATTERN` | `^(\d{4})-([^/\\]+)$` |

**方針。** 見出しの **名前**は翻訳してよいが、**数と順番と役割は変えない**。
とくに「完了条件」を落とさない。ここが検証の宛先であり、これが無い spec は incomplete である。

`LEGACY_PROGRESS_WITHOUT_PR` は **必ず空にする。** このリポジトリの歴史的例外であり、
移植先に持ち込むと「PR 行の無い進捗を書いてよい」という抜け穴を最初から開けることになる。

`WORK_DIR_PATTERN` を絞らない。ID（4 桁）だけを制約し、slug の文字種は
`start-task` / `archive` / `lint-docs` の 3 者で **同じ広さ**に揃える。狭い側に寄せると
「開始はできるが lint だけ落ちる」作業が生まれ、そのリポジトリの全 PR が緑にならなくなる。

### 2.12 `CLAUDE.md`（固有語 22 件・移植コストの本体）

埋める穴は次のとおり。それ以外は**書き換えない**。

| 穴 | 現在の値 | 決め方 |
|---|---|---|
| ディレクトリ表 | `src/`・`tests/`・`specs/`・`progress/` | 2.2 と揃える。`specs/`・`progress/` の行は落とす |
| 共通の検証 | `npm run ci` | 2.1 の command |
| 見た目のテスト | `npm run test:e2e` | 無いなら「見た目」節ごと落とす |
| Figma / トークン表 | `.claude/skills/figma-extract` | デザインの正が Figma でないなら、その節を書き換えるか落とす |
| レビュアー名 | `codex-reviewer` / `visual-design-reviewer` | 2.8 |
| 変えてはいけないもの | 12 行の一覧 | 2.6 で洗い直す |
| コーディング規約 | 「vanilla の `.mjs`」「純関数」「CSS 変数」 | 移植先の規約に置き換える |
| PR スクリーンキャプチャ | `.claude/skills/gh-pr-attach-image` | ホストが GitHub でないなら手順ごと差し替え |

**書き換えてはいけない（不変の原則）:**

- 開発ループの 7 工程と、その順番（Plan → Implement → Verify(自己) → Verify(外部) → Fix → Record → Archive）
- **Critical が残っている状態で「完了」と報告しない。Status を Done にしない。アーカイブもしない**
- **実行したコマンドの出力を、要約せずに会話に貼る**（「確認した」ではなく「確認した結果」）
- **停止条件を満たすために期待値・検証コマンド・ゲートを書き換えない**
- コミットとマージの表（spec/progress は docs PR、アーカイブは main に直接）
- 1 worktree = 1 作業 = 1 ブランチ
- トークンコストの節（レビュアーに渡すのは差分・spec・実測結果だけ。往復 5 回上限）

これらは言語にもホストにも依存しない。**移植で最初に削られやすく、削ると
ループが「動いているように見えて何も検証していない」状態になる。**

### 2.13 持ち出さないもの

| 対象 | 理由 |
|---|---|
| `src/`（`calc.*`・`math.mjs`・`assets/`） | このリポジトリのアプリ |
| `tests/add|sub|mul|div|vec-add|calc-page.test.mjs` | 同上 |
| `specs/`・`progress/`（`TEMPLATE.md` 含む） | 移行前の遺物。新規リポジトリには最初から無い |
| `progress/archive/` のシンボリックリンク | 上の遺物への互換リンク |
| `task/archive/`・`backlog/` の中身 | このリポジトリの作業履歴 |
| `.gitignore` の `progress/calc-page.diff.png` | 同上（`**/*.diff.png`・`.worktrees/` は残す） |
| `package.json` の `name` / `devDependencies` | プロジェクト固有 |

**持ち出す**のは `tests/` のうち **ループのツール自身のテスト**である
（`archive` / `archive-ownership` / `check-actions` / `e2e-needed` / `gate-helpers` / `guard-stderr` /
`guard-worktree` / `lint-docs` / `lint-docs-false-negatives` / `progress-coupling` / `promote` /
`protected-paths` / `run-unit-tests` / `start-task` / `start-task-claim` / `stop-hook-ci-dir`）。
ゲートを移植してテストを置いていくと、**移植先ではゲートが正しく効いているか誰も確かめていない**状態になる。
定数を差し替えたら、対応するテストの期待値も同じ PR で直す。

### 2.14 利用者向け文言の追随

| 場所 | 現在の値 |
|---|---|
| `tools/check-progress-coupling.mjs` の利用者向け文字列リテラル（`console.error` / `console.log` の実引数） | `progress.md`・`task/<id>-<slug>/progress.md` などの語彙が定数ではなく文字列に直書きされている |
| `tools/guard-worktree.mjs` の利用者向け文字列リテラル（同上） | `node tools/start-task.mjs` など、ガードが案内する開始コマンドが直書きされている |

**方針。** 定数（`IMPLEMENTATION_DIRS`・`TASK_DIR`・`PROGRESS_FILE` 相当）を差し替えても
文言は追随しない。エラー経路だけでなく**成功時の文言**と**めったに通らない分岐**
（`foreign` 経路、ガードが案内する開始コマンド）も見る。記録では書いた後も含めて
5 回踏んでおり、人手で潰す限り漏れる。利用者向け文字列に対する移植元語彙
（`progress.md`・`task/`・`npm run ci`・`tools/`）の走査を移植の受け入れ確認に入れる。
コメントは対象外。

出典: task/archive/0044-second-project-port/notes/port-log.md 2.7

### 2.15 台帳の git 追跡（移植の前提条件）

| 場所 | 現在の値 |
|---|---|
| 移植先の `.gitignore` | 移植元では `task/` は追跡されている |

**方針。** 凍結ガードも進捗結合の検査も git の差分を見るので、台帳が追跡されていなければ
どちらのゲートも原理的に成立しない。これはマニフェストの項目ではなく**移植可否の前提条件**である。
台帳を追跡に切り替えるのは技術的修正ではなく方針変更（台帳に顧客固有情報が載る）なので、
移植者が黙って `.gitignore` を変えず、人間の判断を仰ぐ。満たせない移植先ではゲート層を移植できない。

出典: task/archive/0044-second-project-port/notes/port-log.md 2.6 (a)

### 2.16 移植先に既存のループがあるとき

| 場所 | 現在の値 |
|---|---|
| `CLAUDE.md` の開発ループ 7 工程 | カタログは移植先に `CLAUDE.md` やフェーズ運用が無い前提で書かれている |
| `tools/start-task.mjs` の Plan 入口 | 同上。移植先の開始手順と二重になりうる |
| 2.12 の不変の原則 | 原則は同じでも、置き場は既存節の中が正しいことがある |

**方針。** 既存のフェーズ・クオリティゲート・レビュアーがあるなら**置き換えず対応づける**。
「既にあるものを見つけて、無いものだけ足す」。原則が同じでも置き場は既存節の中
（記録の「Critical ゼロ」は既存節への 1 行追記が正解だった）。Core は「台帳の層」と
「ゲートの層」に分けて考え、既にある層は移植しない。例外は 2.18（既存ワークフローを
撤去する場合）であり、そのときは対応づけではなく撤去と導入 PR の分割が正しい。

出典: task/archive/0044-second-project-port/notes/port-log.md 2.6 (c)

### 2.17 Stop hook の終了コード

| 場所 | 現在の値 |
|---|---|
| `.claude/settings.json` の Stop hook | `… && npm run ci 1>&2 && …` の形。検証失敗時は exit 1 |
| `tools/check-actions.mjs:198,344` | 止めるときに exit 2 |

**方針。** セッションを止めるのは **exit 2** だけであり、exit 1 は非ブロッキング
（表示はされるが止まらない）。移植先では検証失敗の経路を exit 2 にする
（記録の移植先の形: `{ <検証コマンド> 1>&2 || exit 2; }`）。hook の登録
（`settings.json` 相当）が無ければ exit 2 を返しても何も起きないので、登録まで含めて
1 セットとする。移植元自身にこの穴が残っている（`.claude/settings.json` の Stop hook は
今も検証失敗時に exit 1 で終わる）。

出典: task/archive/0044-second-project-port/notes/port-log.md 4 節 (c)

### 2.18 既存ワークフローを撤去するとき（導入 PR の分割）

| 場所 | 現在の値 |
|---|---|
| `tools/check-progress-coupling.mjs` | base に既にある progress の更新だけを数える。新規作成は数えない |
| `tools/check-protected-paths.mjs` | 既存の保護対象の変更を検知する |
| `guard.yml` / `ci.yml` のラベル | `allow-protected-change` ほか。移植先にラベルが無いことがある |
| 2.16 | 既存ループの対応づけを説く。撤去する場合の例外は書いていない |
| 2.12 不変のコミットとマージの表 | spec/progress を docs PR で先に入れることを前提にする |

**方針。** 移植先の既存ワークフローを**撤去**する場合、2.16 の「置き換えではなく対応づけ」
は当てはまらない。撤去すると、記録が「未解決」としていた 2 件（台帳ライフサイクルの衝突
2.6 (d)、別名 spec の衝突 2.6 (e)）は解消する。代わりに**導入 PR 自身がゲートに落ちる**
という別の問題が現れる。これは docs PR と実装 PR の 2 本に分けることで解ける。

進捗結合の検査は「base に既にある progress の内容を書き足した更新」だけを数えるので、
spec + progress を実装と同じ PR で作ると必ず落ちる。これはブートストラップの例外ではなく、
移植先での最初の適用例である。凍結ガードは、移植先に既にある保護対象（hook の配線・
CI ワークフロー・既存テスト）を変更するぶんを検知するので、実装 PR には
`allow-protected-change` が要る。ラベルは移植先のリポジトリに存在しないことがある
（3 件目の移植では作成が必要だった）。実測の順序: docs PR（spec + progress + テンプレート）
を先に main へ入れる → 実装 PR の base をそれにする → マージ後に base を main へ切り替える。

出典: task/0052-loop-port-catalog-revision/spec.md（アーカイブ後は task/archive/ 配下に移る）

---

## 3. 移植後の受け入れ確認

移植が終わったかどうかは、次が **実際の出力で** 示せたときとする。自己申告にしない。

1. `<検証コマンド>` が緑（出力を貼る）
2. `node tools/lint-docs.mjs`（相当）が、移植した空の `task/` 構造で緑
3. `start-task --next-id` が `0001` を返す
4. **わざと落とす検査:** 保護パスを 1 行変える PR を作り、ガードが赤くなることを確認する。
   ラベルを付けると緑になることも確認する
5. **わざと落とす検査:** 実装ディレクトリを触って progress を更新しない PR を作り、
   progress 結合の検査が赤くなることを確認する
6. Stop hook が、意図的に壊した検証で実際にセッションを止める

4〜6 を飛ばさない。**ゲートは「置いた」ことではなく「落ちること」で確認する。**
移植直後のゲートは、定数の差し替え漏れで**常に通る**状態になりやすい。

---

## 4. アンチパターン

- **空実装で工程を残す。** 常に false を返す `e2e-needed`、何も見ない `visual-design-reviewer`。
  「すでにある」ため誰も作らない
- **`CLAUDE.md` の「変えてはいけないもの」に行を足して終わる。** ガードは検知しない。
  判定コード側（`check-protected-paths.mjs`）に足すまでが 1 セット
- **チェッカー自身を保護対象から外す。** 2 PR で恒久的に無効化できる
- **候補側の判定コードを CI で実行する。** 判定を骨抜きにする変更と実装変更を同じ PR に入れれば回避できる
- **timeout や検証が重いことを理由に Stop hook を外す。** 伸ばす側に倒す
- **`LEGACY_PROGRESS_WITHOUT_PR` をそのまま持ち込む。** 最初から抜け穴を開けることになる
- **1 回目の移植で共通化する。** 実測前の抽象は剥がすコストのほうが高い。
  手で移し、書き換えた箇所を 1 件ずつ記録する
- **導入 PR を 1 本にまとめる。** spec + progress + 実装を 1 本の PR にすると
  進捗結合で必ず落ちる。docs PR を先に入れる（2.18）
