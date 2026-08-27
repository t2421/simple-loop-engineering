/**
 * ループ機構がプロジェクト固有として扱う値を、宣言 1 ファイルから読む。
 *
 * ## なぜ宣言なのか（実行機構ではない）
 *
 * ループが検証から必要としているのは「名前・コマンド・終了コード・出力」の 4 つだけである。
 * 実行時に差し替わるフック API は作らない。**このファイルは JSON を読んで検査するだけで、
 * マニフェストから読んだものを評価・実行しない。**
 *
 * ## なぜ「読めなければ既定値」ではないのか
 *
 * 既定値で補うと、マニフェストを消す・壊すだけで移植元の値に戻せてしまう。
 * ループのゲートは固有値の上に立っているので、それは検証を弱める経路になる。
 * **欠落・型不正は必ず明示的に失敗させる。**
 *
 * ## base 版を単体実行するツールはこれを import できない
 *
 * `tools/check-protected-paths.mjs`・`tools/check-progress-coupling.mjs`・
 * `tools/e2e-needed.mjs` は、CI が base リビジョンの版を `$RUNNER_TEMP` へ取り出して
 * 単体で実行する。相対 import は解決できない。それらは最小の読み取りを自前に持ち、
 * **`git show <base-ref>:<manifest>` から読む**（ディスク上の候補側を読むと、
 * マニフェストを書き換えるだけでガードを迂回できる）。
 *
 * ここは import できる側（`start-task` など）が使う。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** マニフェストのパス（リポジトリルートからの相対） */
export const MANIFEST_PATH = 'loop.manifest.json';

/** 欠けていたら失敗させる項目。パスは `.` 区切り */
export const REQUIRED_KEYS = Object.freeze([
  'workId.pattern',
  'verify.command',
  'verify.definedIn',
  'verify.invokedIn',
  'implementation.dirs',
  'ledger.dir',
  'ledger.specFile',
  'ledger.progressFile',
  'ledger.docs',
  'protected.self',
  'protected.checker',
  'protected.gateHelpers',
  'protected.templates',
  'protected.appendOnlyDirs',
  'protected.allowLabel',
  'complexityModels',
]);

/**
 * `.` 区切りのキーで値を引く純関数。無ければ undefined。
 *
 * @param {unknown} obj
 * @param {string} keyPath
 * @returns {unknown}
 */
function pick(obj, keyPath) {
  let cur = obj;
  for (const key of keyPath.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(key in cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * 正規表現の文字列に含まれる捕獲グループの数を数える純関数。
 *
 * 利用側は 1 番目を ID、2 番目を slug として使う。`^\\d{4}-.+$` のような
 * 「一致はするが捕獲しない」形を通すと、採番が `undefined` を数値化し、
 * slug の重複検知は `undefined` 同士の比較になって**無言で消える**。
 *
 * エスケープと文字クラスを落としてから `(` を数える（`(?:` などは捕獲しない）。
 *
 * @param {string} source
 * @returns {number}
 */
export function countCaptureGroups(source) {
  const withoutEscapes = source.replace(/\\./g, '');
  const withoutClasses = withoutEscapes.replace(/\[[^\]]*\]/g, '');
  return (withoutClasses.match(/\((?!\?)/g) ?? []).length;
}

/**
 * 値が「非空の文字列配列」かを判定する純関数。
 *
 * @param {unknown} v
 * @returns {boolean}
 */
function isStringArray(v) {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string' && x !== '');
}

/**
 * マニフェストの生テキストを解析して検査する純関数。
 *
 * **既定値で補わない。** 欠落・型不正はすべて理由の配列で返す。
 *
 * @param {string} raw - JSON のテキスト
 * @returns {{ok: true, manifest: object} | {ok: false, reasons: string[]}}
 */
export function parseManifest(raw) {
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reasons: [`JSON として読めません: ${err.message}`] };
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, reasons: ['最上位がオブジェクトではありません'] };
  }

  const reasons = [];
  for (const key of REQUIRED_KEYS) {
    if (pick(manifest, key) === undefined) reasons.push(`必須項目がありません: ${key}`);
  }
  // 欠落があるなら型は見ない。「無い」と「形が違う」を混ぜて出すと読みにくい
  if (reasons.length > 0) return { ok: false, reasons };

  if (typeof manifest.workId.pattern !== 'string') {
    reasons.push('workId.pattern は文字列である必要があります');
  } else {
    try {
      new RegExp(manifest.workId.pattern);
      if (countCaptureGroups(manifest.workId.pattern) < 2) {
        reasons.push(
          'workId.pattern は捕獲グループを 2 つ持つ必要があります（1 番目が ID、2 番目が slug）',
        );
      }
    } catch (err) {
      reasons.push(`workId.pattern が正規表現として不正です: ${err.message}`);
    }
  }
  if (!isStringArray(manifest.verify.command)) {
    reasons.push('verify.command は非空の文字列配列である必要があります');
  }
  if (!Array.isArray(manifest.verify.definedIn) || manifest.verify.definedIn.length === 0) {
    reasons.push('verify.definedIn は非空の配列である必要があります');
  } else if (!manifest.verify.definedIn.every((d) => d !== null && typeof d === 'object' && typeof d.path === 'string' && d.path !== '')) {
    reasons.push('verify.definedIn の各要素は { path } を持つ必要があります');
  }
  // **要素の型まで見る。** `[42]` を通すと `filePath.startsWith(42)` が `"42"` に
  // 強制され、実装の変更が全部 docs-only に落ちて進捗結合が無言で消える
  const isPathArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== '');
  if (!isPathArray(manifest.implementation.dirs)) {
    reasons.push('implementation.dirs は文字列の配列である必要があります');
  }
  if (manifest.implementation.files !== undefined && !isPathArray(manifest.implementation.files)) {
    reasons.push('implementation.files は文字列の配列である必要があります');
  }
  // 両方空なら「実装が存在しない」ことになり、進捗結合はあらゆる差分を素通りさせる。
  // 空の宣言は、ゲートを外したのと同じである
  if (isPathArray(manifest.implementation.dirs)
    && (manifest.implementation.dirs.length + (manifest.implementation.files ?? []).length) === 0) {
    reasons.push('implementation は dirs か files のどちらかに 1 件以上必要です');
  }
  if (!isStringArray(manifest.ledger.docs)) {
    reasons.push('ledger.docs は非空の文字列配列である必要があります');
  } else if (!manifest.ledger.docs.includes(manifest.ledger.specFile)) {
    reasons.push('ledger.docs に ledger.specFile が含まれていません');
  }
  if (!isStringArray(manifest.protected.gateHelpers)) {
    reasons.push('protected.gateHelpers は非空の文字列配列である必要があります');
  }
  if (!isStringArray(manifest.protected.templates)) {
    reasons.push('protected.templates は非空の文字列配列である必要があります');
  }
  if (!Array.isArray(manifest.protected.appendOnlyDirs) || manifest.protected.appendOnlyDirs.length === 0) {
    reasons.push('protected.appendOnlyDirs は非空の配列である必要があります');
  } else {
    // **要素の形まで見る。** `[{}]` を通すと、`covers()` が `startsWith(undefined)` で
    // 常に false になり、追記専用ディレクトリの保護が丸ごと消える。
    // 「あるか」だけの検査は、骨抜きの宣言を受け入れることと同じである
    manifest.protected.appendOnlyDirs.forEach((d, i) => {
      if (d === null || typeof d !== 'object' || typeof d.prefix !== 'string' || d.prefix === ''
        || typeof d.label !== 'string' || d.label === '') {
        reasons.push(`protected.appendOnlyDirs[${i}] は { prefix, label } を持つ必要があります`);
        return;
      }
      // **真偽値のフラグも型を見る。** `"ledger": "true"` は `=== true` で false に落ち、
      // 別名 spec の禁止とアーカイブ済み ID の再利用検知が無言で消える。
      // 三項式で既定値へ倒すのは「型不正を既定値で補う」ことである
      for (const flag of ['archiveMove', 'ledger']) {
        if (d[flag] !== undefined && typeof d[flag] !== 'boolean') {
          reasons.push(`protected.appendOnlyDirs[${i}].${flag} は真偽値である必要があります`);
        }
      }
    });
  }
  if (typeof manifest.protected.checker !== 'string' || manifest.protected.checker === '') {
    reasons.push('protected.checker は非空の文字列である必要があります');
  }
  if (typeof manifest.protected.allowLabel !== 'string' || manifest.protected.allowLabel === '') {
    reasons.push('protected.allowLabel は非空の文字列である必要があります');
  }
  if (manifest.complexityModels === null || typeof manifest.complexityModels !== 'object'
    || Array.isArray(manifest.complexityModels)
    || Object.values(manifest.complexityModels).some((v) => typeof v !== 'string' || v === '')) {
    reasons.push('complexityModels は文字列を値に持つオブジェクトである必要があります');
  } else {
    // 等級を書かない進捗は `M` とみなされる。表に `M` が無いと、既存の進捗を選んだ
    // 瞬間に落ちる。**読み込み時に落とすほうが、作業を選んだ後に落ちるより早い**
    const missing = ['S', 'M', 'L'].filter((g) => !Object.hasOwn(manifest.complexityModels, g));
    if (missing.length > 0) {
      reasons.push(`complexityModels に等級がありません: ${missing.join(', ')}`);
    }
  }
  for (const key of ['dir', 'specFile', 'progressFile']) {
    if (typeof manifest.ledger[key] !== 'string' || manifest.ledger[key] === '') {
      reasons.push(`ledger.${key} は非空の文字列である必要があります`);
    }
  }
  // **必須である。省略を空配列で補わない**（→ tools/check-protected-paths.mjs の同項目）
  if (!isStringArray(manifest.verify.invokedIn)) {
    reasons.push('verify.invokedIn は非空の文字列配列である必要があります');
  }

  // **稼働中の台帳が、実際に守られているかを見る。**
  // `ledger.dir` は start-task と進捗結合が読み、保護するパスは
  // `appendOnlyDirs[].prefix` が決める。この 2 つは別の値なので、移植で片方だけ
  // 書き換えると「新しい台帳を見て作業するのに、凍結は存在しない古いディレクトリを
  // 守り続ける」状態になる。稼働中の spec の書き換え・削除が違反 0 件になる
  const ledgerDirs = (Array.isArray(manifest.protected.appendOnlyDirs) ? manifest.protected.appendOnlyDirs : [])
    .filter((d) => d !== null && typeof d === 'object' && d.ledger === true)
    .map((d) => d.prefix);
  if (typeof manifest.ledger.dir === 'string' && !ledgerDirs.includes(manifest.ledger.dir)) {
    reasons.push(
      `ledger.dir（${manifest.ledger.dir}）を守る protected.appendOnlyDirs のエントリ`
      + `（ledger: true・同じ prefix）がありません`,
    );
  }

  // **自己保護。** マニフェスト自身が保護対象で無ければ、書き換え放題になる
  if (manifest.protected.self !== MANIFEST_PATH) {
    reasons.push(`protected.self が自分自身（${MANIFEST_PATH}）を指していません: ${manifest.protected.self}`);
  }
  if (manifest.install !== undefined && !isStringArray(manifest.install)) {
    // install は**省略可能**（0044 の移植先には対応物が無かった）。
    // 書くなら形は正しいことを求める
    reasons.push('install は省略するか、非空の文字列配列である必要があります');
  }
  if (manifest.conditionalStages !== undefined) {
    if (!Array.isArray(manifest.conditionalStages)) {
      reasons.push('conditionalStages は省略するか、配列である必要があります');
    } else {
      // **葉まで見る。** `triggers: [42]` を通すと `globToRegExp(42)` が `/^$/` になり、
      // あらゆる変更パスが不一致になって工程が無音のまま間引かれる
      manifest.conditionalStages.forEach((stage, i) => {
        const at = `conditionalStages[${i}]`;
        if (stage === null || typeof stage !== 'object') {
          reasons.push(`${at} はオブジェクトである必要があります`);
          return;
        }
        if (typeof stage.name !== 'string' || stage.name === '') {
          reasons.push(`${at}.name は非空の文字列である必要があります`);
        }
        if (!isStringArray(stage.command)) {
          reasons.push(`${at}.command は非空の文字列配列である必要があります`);
        }
        if (typeof stage.checker !== 'string' || stage.checker === '') {
          reasons.push(`${at}.checker は非空の文字列である必要があります`);
        }
        if (!isStringArray(stage.triggers)) {
          reasons.push(`${at}.triggers は非空の文字列配列である必要があります`);
        }
      });
    }
  }

  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, manifest };
}

/**
 * `verify.definedIn` が指すファイルがすべて実在するかを検査する純関数。
 *
 * 実在確認は呼び出し側から渡す。テストでファイルシステムを触らずに済ませるため。
 *
 * @param {object} manifest
 * @param {(p: string) => boolean} exists
 * @returns {string[]} 理由の配列。空なら通過
 */
export function checkDefinedInExists(manifest, exists) {
  return manifest.verify.definedIn
    .filter((d) => !exists(d.path))
    .map((d) => `verify.definedIn が指すファイルがありません: ${d.path}`);
}

/**
 * リポジトリのマニフェストを読む。読めない・不正なら Error を投げる。
 *
 * @param {string} rootDir
 * @returns {object}
 */
export function loadManifest(rootDir) {
  const file = path.join(rootDir, MANIFEST_PATH);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(
      `マニフェストがありません: ${file}\n`
      + '既定値では動かしません。ループの固有値はこのファイルが唯一の宣言です。\n'
      + `原因: ${err.message}`,
      { cause: err },
    );
  }
  const parsed = parseManifest(raw);
  if (!parsed.ok) {
    throw new Error(`マニフェストが不正です: ${file}\n  - ${parsed.reasons.join('\n  - ')}`);
  }
  const missing = checkDefinedInExists(parsed.manifest, (p) => fs.existsSync(path.join(rootDir, p)));
  if (missing.length > 0) {
    throw new Error(`マニフェストが不正です: ${file}\n  - ${missing.join('\n  - ')}`);
  }
  return parsed.manifest;
}

/**
 * このリポジトリのマニフェストを読む。ツールの位置からルートを解決する。
 * テストと、ルートを知らない呼び出し側が使う。
 *
 * @returns {object}
 */
export function repoManifest() {
  return loadManifest(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
}

function main() {
  const rootDir = process.argv[2] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const manifest = loadManifest(rootDir);
    console.log(`マニフェストは妥当です: ${path.join(rootDir, MANIFEST_PATH)}`);
    console.log(`  検証コマンド: ${manifest.verify.command.join(' ')}`);
    console.log(`  定義の所在: ${manifest.verify.definedIn.map((d) => d.path).join(', ')}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
