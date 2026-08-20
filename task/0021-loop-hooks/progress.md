# Progress: `0021-loop-hooks`

- **Target Spec:** `task/0021-loop-hooks/spec.md`
- **Branch:** `feature/loop-hooks`
- **PR:** `未作成`
- **Status:** `In Progress` (Phase: `Verify (外部)`)

## タスクチェックリスト

構文チェックとテスト実行はここに書かない。`npm run ci` が強制する。

- [x] Specの要件・受け入れ条件の確認
- [x] テストの作成 (`tests/guard-worktree.test.mjs`)
- [x] 実装 (`tools/guard-worktree.mjs`、`.claude/settings.json`)
- [x] Stop hook の実セッションでの動作確認（出力を会話に貼る）
- [ ] レビューサブエージェント (`codex-reviewer`) の承認取得
- [ ] PR作成（進捗の **PR** に URL を書く。見た目の変更なら該当箇所のスクリーンキャプチャを本文に添付する。リポジトリには置かない）
- [ ] PRマージ後のアーカイブ

## 試行ログ・エラー履歴

- `05:55` - spec / progress を作成（計画用ブランチ `docs/deterministic-loop-plan`）。依存: `0020-start-task-tool`（ブロック時の誘導先）。
- `05:30` - RED: `tests/guard-worktree.test.mjs` を先に書き、`node --test` が `ERR_MODULE_NOT_FOUND`（`tools/guard-worktree.mjs` 未作成）で失敗することを確認。
- `05:40` - GREEN: `tools/guard-worktree.mjs` を実装。判定は純関数 `classifyEdit({filePath, rootDir})` に閉じ込め、`readFilePath` / `resolvePrimaryRoot` / `blockMessage` も pure で export。`npm run ci` は 204 tests / 0 fail。
- `05:42` - ルートの取り方: `git rev-parse --path-format=absolute --git-common-dir` の親をプライマリチェックアウトとする。worktree の中から呼ばれても同じ 1 つの基準で判定でき、`.worktrees/` 配下かどうかを相対パスの第 1 セグメントで決められる。
- `05:44` - `.claude/settings.json` を新設（PreToolUse: `Write|Edit` → guard、Stop: `npm run ci`）。CLI での再現（例の 5 行）は終了コード 2 / 0 を実測。Stop hook は設定が読み込まれた実セッションでの確認が残る。
- `06:10` - Verify (外部) 1 回目: `codex-reviewer` が**不承認**（Critical 0 / High 1 / Medium 4 / Low 4）。High-1「完了条件 5 の Stop hook 実セッション確認が未達」、Medium-2「Stop hook が失敗時に診断を握り潰す」、Medium-3「fail-open が無言」、Medium-4「realpath の非対称」。
- `06:20` - Medium-2 を修正: Stop hook のコマンドを `npm run ci 1>&2` にした。`npm run ci` の診断（eslint・`node:test`）は **stdout** に出るが、Stop hook は終了コード 2 以外のとき stdout をセッションに表示しない。stdout を stderr に寄せることで、終了コードを変えずに（失敗時 `exit=1` のまま）出力がセッションに届く。実測: 失敗時の stdout は 0 バイト、stderr に eslint の `no-undef` 診断。壊し方は `tools/tmp-ci-break.mjs` を一時的に置いて削除する可逆な手順（凍結対象は触っていない）。
- `06:25` - Medium-3 を修正: `primaryRoot()` と `main()` の stdin catch に `warnFailOpen()` を足した。fail-open は維持（終了コード 0）し、理由だけ stderr に 1 行出す。実測: `git` を PATH から外すと旧実装は無言で通過、新実装は `guard-worktree: ガードを適用せず通過させます（リポジトリのルートを特定できません: spawnSync git ENOENT）` を出して通過。
- `06:30` - Medium-4 を修正: `realPathOrSelf()` を足し、`rootDir` と `file_path` の両方を同じ解決に通す。実在する最も深い祖先まで `fs.realpathSync` し、残りを継ぎ足すので、まだ無いファイル（Write）でも壊れない。`classifyEdit` は純関数のまま（ファイルシステムを見ない）。実測: symlink 経由の `<link>/src/math.mjs` は旧実装が `exit=0`（`outside-repo` で無言の無効化）、新実装は `exit=2` でブロック。
- `06:35` - Low の扱い: (1) `stop_hook_active` は参照しない — この Stop hook は終了コード 2 を返さず停止をブロックしないので、再入ループが起きない。(2) matcher `Write|Edit` は未アンカーのまま — `NotebookEdit` などの編集系ツールも巻き込む方向の誤差であり、ガードとしては安全側に外れる。spec は「Write / Edit にマッチ」としか定めていないので狭めない。(3) 相対パスの解決は Medium-4 の修正で `main()` がルート起点に解決してから渡す形に揃えた。(4) `--path-format=absolute` は git 2.31+ が要る。満たさない環境では `git rev-parse` が失敗し、Medium-3 の警告付き fail-open に落ちる（無言では無効化されない）。
- `07:20` - High-1 を解消: この worktree をプロジェクトルートにしたヘッドレスセッション（`cd <worktree> && claude -p "..." --output-format json --max-turns 1 --model haiku < /dev/null`）を実際に走らせ、Stop hook の発火を transcript（`~/.claude/projects/-...-worktrees-feature-loop-hooks/*.jsonl`）の `attachment.hookEvent === "Stop"` で確認した。成功時は `type: hook_success` / `stdout: ""` / `stderr` に `npm run ci` の全出力（`# pass 204` / `# fail 0`）。cwd はこの worktree。
- `07:22` - 同じくヘッドレスセッションで**失敗時**を確認: `tools/tmp-ci-break.mjs`（一時ファイル）で lint を壊すと `type: hook_non_blocking_error` / `stderr` に eslint の `no-undef` 診断が入り、セッションに表示された。比較のため Stop hook のコマンドを一時的に旧版（`npm run ci`）へ戻して同じ実験をすると、同じ状況で `stderr: "Failed with non-blocking status code: No stderr output"`（診断は `stdout` に埋もれ、セッションには何も出ない）。Medium-2 の指摘どおりで、`1>&2` がそれを解いていることを実測で示した。実験後に `.claude/settings.json` と一時ファイルは元に戻し、`git status` で確認済み。
- `07:24` - 補足: `claude -p` のプロセスは応答と Stop hook の完了後も終了せず（このネスト実行環境の都合）、標準出力に応答が出ないまま残る。証跡は transcript 側から取った。プロセスは実験ごとに終了させた。
