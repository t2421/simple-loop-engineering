# loop-core

ループエンジニアリングの再利用コア。npm パッケージではない。
バージョンは `VERSION`。CLI 入口は `bin/loop.mjs`。

## 配置

```
loop-core/
  VERSION
  CLAUDE_CONFIG_COMPAT
  bin/loop.mjs
  install.mjs
  ledger/     台帳（start-task / archive / promote / lint-docs）
  gate/       ゲート（protected-paths / progress-coupling / …）
  lib/        共有（layout / messages / manifest / holes / check-compat）
  templates/
  tests/
```

台帳だけ欲しいリポジトリは `node loop-core/install.mjs <dest> --layer=ledger`。
ゲートだけなら `--layer=gate`。

## インストール（パッケージマネージャ不要）

```
node loop-core/install.mjs /path/to/other-repo
```

コピー先で:

```
node loop-core/bin/loop.mjs --help
```

消費リポジトリには `loop.manifest.json`（0042 契約）と、台帳コマンドなら `task/` + テンプレ 2 種が要る。

## 版ずれ

`.claude/claude-config.version` と `CLAUDE_CONFIG_COMPAT` を
`node loop-core/bin/loop.mjs check-compat` が比較する。
