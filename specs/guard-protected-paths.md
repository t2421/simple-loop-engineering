# 保護パス変更の CI ガード

CLAUDE.md「変えてはいけないもの」の遵守を、プロンプト任せではなく CI で機械的に検知する。

## 種別

改善

## 対象

- 場所: `.github/workflows/`（ガード用の新規ジョブまたはワークフロー）、`tools/check-protected-paths.mjs`（検知スクリプト）
- 公開面: PR 上の CI チェック（ガードジョブ）。ローカルでは `node tools/check-protected-paths.mjs <base-ref>` で同じ判定を実行できる

## 背景

「変えてはいけないもの」（specs の完了条件・テンプレ・tests・`package.json` の scripts・CI の検証ステップ）は CLAUDE.md の文章でしか守られておらず、エージェントが従わなかった場合に無警告で PR に混入する。Loop Engineering の「無人のループは無人のままミスをする」への対策として、検証を弱める変更を CI で止める層を足す。

既存の `verify` ジョブ（`npm run ci`）は変更しない。ガードは追加のみ。

## 仕様

PR の差分（base ブランチとの比較）に次の変更が含まれるとき、ガードジョブは失敗する。

- `specs/TEMPLATE.md` / `progress/TEMPLATE.md` の変更
- `specs/` 配下（`archive/` 含む）の既存ファイルの内容変更・削除。新規追加は許可。内容が同一のままの移動（アーカイブ作業）は許可
- `tests/` 配下の既存テストファイルの内容変更・削除。新規追加は許可
- `package.json` の `scripts` の変更
- `.github/workflows/` 配下の既存ワークフローの変更・削除。新規追加は許可

例外: PR に `allow-protected-change` ラベルが付いているときはガードを通過させる（人間による明示承認の経路）。凍結ファイルの正規の改訂手続きは `specs/scripts-freeze-procedure.md` を参照。

判定ロジックは `tools/check-protected-paths.mjs` に置き、ワークフローはそれを呼ぶだけにする（ロジックをテスト可能にするため）。

## 範囲外

- ローカルフック（PreToolUse 等）による編集時ブロック
- GitHub の branch protection / CODEOWNERS 設定
- 保護対象の変更内容が「妥当かどうか」の判断（検知のみ）

## 失敗時

- base との差分が取得できない（shallow clone 等）: ガードジョブを失敗させる（素通りさせない）
- ラベル情報が取得できない: ラベル無しとして扱う（安全側に倒す）

## 例

| 操作または入力 | 期待結果 |
|---|---|
| 既存 `tests/add.test.mjs` の期待値を変更した PR | ガード失敗 |
| `package.json` の `scripts.ci` を変更した PR | ガード失敗 |
| `specs/TEMPLATE.md` を変更した PR | ガード失敗 |
| 新規 `specs/foo.md` と新規 `tests/foo.test.mjs` を追加した PR | ガード通過 |
| `specs/x.md` を内容同一のまま `specs/archive/x.md` へ移動した PR | ガード通過 |
| `src/` のみ変更した PR | ガード通過 |
| 保護パス変更あり + `allow-protected-change` ラベル | ガード通過 |

## 完了条件

次をすべて満たしたとき、この仕様は完了とする。検証はこれらの条件に対して行い、テスト実行結果などのコマンド出力を根拠にする。

1. 「対象」が仕様どおりに公開または修正されている。
2. 「例」がすべて、テストまたは再現手順で同じ結果になる。
3. 「失敗時」に書いた入力・操作で、仕様どおり失敗する。該当がなければこの項は「なし」。
4. 「範囲外」を実装していない。
5. `tools/check-protected-paths.mjs` の判定ロジックが `tests/` のユニットテストで「例」の各行を網羅している。既存の `verify` ジョブ（`npm run ci` の実行）が変更されていない。
