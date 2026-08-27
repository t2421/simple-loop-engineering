/**
 * CLAUDE.md「変えてはいけないもの」の遵守を、base ブランチとの差分から機械的に検知する。
 *
 * 判定ロジックは純関数として公開し、テスト可能にしてある。
 * CLI としては `node tools/check-protected-paths.mjs <base-ref>` で実行する。
 * 違反があれば理由を表示して終了コード 1 で終わる。
 *
 * ## 構造: 分解してから判定する
 *
 * git のステータス（A/M/D/R/C）で規則を分岐させない。まず `decompose()` で
 * 差分を 3 種類の「出来事」に分解する。
 *
 * - appeared: 保護パスに内容が現れた（A、保護外からの R/C の移動先）
 * - removed:  保護パスから内容が消えた（D、R の移動元）
 * - modified: その場で内容が変わった（M など）
 *
 * 規則は出来事ごとに 1 箇所だけ書く。以前はステータスごとの分岐に同じ規則を
 * 重複して書いており、「A に足して R に足し忘れる」抜けを 3 度作った。
 * 持ち込み経路（A / R / C）はすべて appeared に正規化されるので、
 * この構造では入れ忘れ自体が起こらない。
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/**
 * マニフェストのパス。**このファイルは import を持てない**（CI が base リビジョンの版を
 * `$RUNNER_TEMP` へ取り出して単体実行するため）。読み取りは最小限を自前に持つ。
 */
export const MANIFEST_PATH = 'loop.manifest.json';

/**
 * 人間による明示承認の経路。この PR ラベルが付いていればガードを通過させる。
 *
 * マニフェスト側にも `protected.allowLabel` があるが、**ここは定数のままにする。**
 * ラベル名をマニフェストから読むと、マニフェストを書き換えて「常に付いている扱いの
 * ラベル名」に差し替える経路が開く。承認の合図は判定コード側に固定する。
 */
export const ALLOW_LABEL = 'allow-protected-change';

/**
 * 判定に使う固有値。**base リビジョンのマニフェストから組み立てる。**
 *
 * ディスク上のマニフェスト（＝候補側）を読んではならない。読むと、保護パスを削る
 * マニフェストの変更と、保護パスの変更を同じ PR に入れるだけでガードを迂回できる。
 * このファイル自身を base 版で実行しているのと同じ理由である。
 *
 * `main()` が base から読んで差し込む。テストは直接渡す。
 */
let CONFIG = null;

/**
 * マニフェストのオブジェクトから、判定に使う形へ組み立てる純関数。
 *
 * @param {object} manifest
 * @returns {object}
 */
export function configFromManifest(manifest) {
  const ledger = manifest.ledger;
  return {
    templates: manifest.protected.templates,
    checker: manifest.protected.checker,
    self: manifest.protected.self,
    gateHelpers: manifest.protected.gateHelpers,
    specFile: ledger.specFile,
    ledgerDocs: ledger.docs,
    verifyDefinedIn: manifest.verify.definedIn,
    appendOnlyDirs: manifest.protected.appendOnlyDirs.map((d) => ({
      prefix: d.prefix,
      label: d.label,
      archiveMove: d.archiveMove === true,
      // 台帳のディレクトリだけが「1 作業 1 spec」の規約に従う。
      // 直下に置いてよい文書は **許可リスト**である（単数の除外では、
      // 設計書や実装計画を複数持つ移植先を弾いてしまう）
      ledgerDocs: d.ledger === true ? ledger.docs : undefined,
      exclude: d.ledger === true ? ledger.progressFile : undefined,
      specFile: d.ledger === true ? ledger.specFile : undefined,
    })),
  };
}

/**
 * 判定に使う固有値を差し込む。テストと `main()` の両方から使う。
 *
 * @param {object} manifest
 */
export function useManifest(manifest) {
  CONFIG = configFromManifest(manifest);
}

function config() {
  if (CONFIG === null) {
    throw new Error('マニフェストが読み込まれていません（useManifest を先に呼ぶ）');
  }
  return CONFIG;
}


/**
 * CI のジョブが委譲する判定・実行ファイルか。マニフェストの `protected.gateHelpers`。
 * ここを空にされると、検証コマンドを触らずにユニットを間引いたり、条件付き工程の
 * 判定を常に false にしたりできる。だからマニフェスト自身も保護対象である。
 */
function isGateHelper(filePath) {
  return config().gateHelpers.includes(filePath);
}

/**
 * 既存ファイルの内容変更・削除を禁じ、新規追加は許すディレクトリ。
 *
 * `archiveMove` が true のディレクトリだけ、`<prefix>X` → `<prefix>archive/X` の
 * 内容同一の移動（アーカイブ作業）を許す。`tests/` と `.github/workflows/` は
 * 移動も許さない。リネームでディレクトリの外へ出せば、テストの削除や CI の
 * 無効化ができてしまうため。
 */


/**
 * 別名の spec かを判定する純関数。
 * 作業ディレクトリ直下にある `.md` のうち、`spec.md` と除外対象以外を指す。
 *
 * @param {{prefix: string, exclude?: string, specFile?: string}} dir
 * @param {string} p
 * @returns {boolean}
 */
function isAliasSpec(dir, p) {
  // `specFile` を持つディレクトリだけが「1 作業 1 spec」の規約に従う。
  // 旧 `specs/` はフラット命名（`specs/<名前>.md`）なので対象外。
  if (!dir.specFile) return false;
  if (!p.startsWith(dir.prefix) || !p.endsWith('.md')) return false;
  // 対象は作業ディレクトリ直下だけ。`task/X/notes/README.md` のような
  // 関連文書まで弾かない
  const rest = p.slice(dir.prefix.length).split('/');
  const depth = rest[0] === 'archive' ? 3 : 2;
  if (rest.length !== depth) return false;
  const name = rest[rest.length - 1];
  // **許可リストで判定する。** 移植先の台帳は作業ごとに複数の文書を持ちうる
  // （0044 の実測。単数の除外だと、設計書を足す通常の PR が毎回ラベルを要求する）
  return !dir.ledgerDocs.includes(name);
}

/**
 * アーカイブ済みの作業 ID を再利用しているかを判定する純関数。
 *
 * ディレクトリ名の完全一致ではなく **ID で照合する**。名前で照合すると、
 * `task/archive/0012-x/` がある状態で `task/0012-other/`（同じ ID・別 slug）を
 * 作れてしまう。CLAUDE.md は ID を識別子、slug をラベルと定めている。
 *
 * @param {{prefix: string, specFile?: string}} dir
 * @param {string} p
 * @param {Set<string>} baseArchivedIds - base の `<prefix>archive/` にある作業の ID
 * @returns {boolean}
 */
function archivedIdReused(dir, p, baseArchivedIds) {
  if (!dir.specFile || baseArchivedIds.size === 0) return false;
  const rest = p.slice(dir.prefix.length).split('/');
  // archive/ 側への追加はここでは見ない（能動側の再利用だけを弾く）
  if (rest[0] === 'archive') return false;
  const m = /^(\d{4})-/.exec(rest[0]);
  return m !== null && baseArchivedIds.has(m[1]);
}

/**
 * アーカイブ移動の唯一の正しい移動先を返す純関数。
 * `<prefix>X` に対して `<prefix>archive/X`。
 *
 * @param {{prefix: string}} dir
 * @param {string} oldPath
 * @returns {string}
 */
function archiveDestination(dir, oldPath) {
  const rest = oldPath.slice(dir.prefix.length);
  return `${dir.prefix}archive/${rest}`;
}

/**
 * そのパスが保護ディレクトリの対象かを判定する純関数。
 * `exclude` が指定されたディレクトリは、その名前のファイルだけを対象から外す。
 *
 * @param {{prefix: string, exclude?: string}} dir
 * @param {string} p
 * @returns {boolean}
 */
function covers(dir, p) {
  if (!p.startsWith(dir.prefix)) return false;
  if (!dir.exclude) return true;
  // 除外は `<prefix><作業ディレクトリ>/<exclude>` の 1 階層だけ。
  // 末尾一致にすると `task/progress.md` や深い階層まで外れてしまう
  const rest = p.slice(dir.prefix.length).split('/');
  const inArchive = rest[0] === 'archive';
  const depth = inArchive ? 3 : 2;
  return !(rest.length === depth && rest[rest.length - 1] === dir.exclude);
}

/**
 * 何らかの保護（単一ファイル・型・保護ディレクトリ）の対象かを判定する純関数。
 *
 * @param {string} p
 * @returns {boolean}
 */
function isProtectedPath(p) {
  return (
    p === config().checker
    || p === config().self
    || isGateHelper(p)
    || config().templates.includes(p)
    || config().appendOnlyDirs.some((d) => covers(d, p))
  );
}

/**
 * git が C クォートしたパス名（`"..."`）を元に戻す。
 * `-z` を使えば通常は出ないが、念のため受けられるようにしておく。
 *
 * @param {string} p
 * @returns {string}
 */
function unquotePath(p) {
  if (!p.startsWith('"') || !p.endsWith('"')) return p;
  const body = p.slice(1, -1);
  // 8 進エスケープは UTF-8 の「バイト」なので、いったんバイト列に積んでから復号する。
  // 1 文字ずつ復号するとマルチバイト文字が壊れる。
  const encoder = new TextEncoder();
  const bytes = [];
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '\\') {
      encoder.encode(body[i]).forEach((b) => bytes.push(b));
      continue;
    }
    const octal = body.slice(i + 1, i + 4);
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(parseInt(octal, 8));
      i += 3;
      continue;
    }
    const escaped = body[i + 1];
    if (escaped === undefined) {
      // 末尾が単独のバックスラッシュ。そのまま 1 バイトとして扱う
      bytes.push(0x5c);
      continue;
    }
    const map = { n: 0x0a, t: 0x09, r: 0x0d, '"': 0x22, '\\': 0x5c };
    bytes.push(map[escaped] ?? escaped.charCodeAt(0));
    i += 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/**
 * `git diff --name-status -M -z` の出力を構造化する純関数。
 *
 * `-z` は NUL 区切りでパス名をクォートしないため、非 ASCII・タブ・改行を含む
 * パスでも正しく読める。リネーム・コピーは「状態・旧パス・新パス」の 3 フィールド。
 *
 * @param {string} raw - `git diff --name-status -M -z <base>...HEAD` の標準出力
 * @returns {Array<{status: string, path: string, oldPath?: string, similarity?: number}>}
 */
export function parseNameStatus(raw) {
  const fields = raw.split('\0').filter((f) => f !== '');
  const changes = [];
  let i = 0;
  while (i < fields.length) {
    const code = fields[i];
    const rename = /^([RC])(\d+)$/.exec(code);
    const needed = rename ? 3 : 2;
    if (i + needed > fields.length) {
      // 途中で切れた出力を「差分なし」と読んで素通りさせない
      throw new Error(`差分の出力が途中で切れています: ${JSON.stringify(fields.slice(i))}`);
    }
    if (rename) {
      changes.push({
        status: rename[1],
        path: unquotePath(fields[i + 2]),
        oldPath: unquotePath(fields[i + 1]),
        similarity: Number(rename[2]),
      });
      i += 3;
    } else {
      changes.push({ status: code, path: unquotePath(fields[i + 1]) });
      i += 2;
    }
  }
  return changes;
}

/**
 * 差分を「出来事」に分解する純関数。ステータスの解釈はここで完結させ、
 * 判定側にはステータスを持ち込まない。
 *
 * @param {Array<{status: string, path: string, oldPath?: string, similarity?: number}>} changes
 * @returns {Array<{kind: 'appeared'|'removed'|'modified', path: string, from?: string, pairedTo?: string, similarity?: number}>}
 */
export function decompose(changes) {
  const events = [];
  for (const { status, path, oldPath, similarity } of changes) {
    if (status === 'A') {
      events.push({ kind: 'appeared', path });
    } else if (status === 'D') {
      events.push({ kind: 'removed', path });
    } else if (status === 'R' || status === 'C') {
      // C（コピー）は実 CLI では現れない（`-C` を渡していない）。現れた場合は
      // R と同じ扱いにする（安全側。移動元が保護対象なら違反として拾われる）
      events.push({ kind: 'removed', path: oldPath, pairedTo: path, similarity });
      events.push({ kind: 'appeared', path, from: oldPath, similarity });
    } else {
      // M / T などはすべて「その場で内容が変わった」として扱う
      events.push({ kind: 'modified', path });
    }
  }
  return events;
}

/**
 * 検証コマンドの定義が変わったかを判定する純関数。
 *
 * 移植元は JSON の `scripts` オブジェクトを比較していたが、**形式に依存させない。**
 * 定義の実体が `Makefile` や `pyproject.toml`、ワークフロー YAML のこともある
 * （0044 の実測。移植先は YAML 直書きだった）。
 * `jsonKey` を持つ定義は「その JSON キーの中身」を、持たない定義は
 * 「ファイルの内容そのもの」を比較する。呼び出し側が正規化して渡す。
 * キーの増減と値の変更の両方を見る。
 *
 * @param {Record<string, string>} baseScripts - base 側の scripts
 * @param {Record<string, string>} headScripts - head 側の scripts
 * @returns {boolean} 変わっていれば true
 */
export function scriptsChanged(baseScripts, headScripts) {
  const base = baseScripts ?? {};
  const head = headScripts ?? {};
  const keys = new Set([...Object.keys(base), ...Object.keys(head)]);
  for (const key of keys) {
    if (base[key] !== head[key]) return true;
  }
  return false;
}

/**
 * 差分に保護パスの変更が含まれるかを判定する純関数。
 *
 * @param {object} input
 * @param {Array<{status: string, path: string, oldPath?: string, similarity?: number}>} input.changes
 * @param {Record<string, string> | null} [input.baseScripts] - base 側の検証定義（パスごと）
 * @param {Record<string, string> | null} [input.headScripts] - head 側の検証定義（パスごと）
 * @param {Set<string>} [input.baseArchivedIds] - base の `archive/` にある作業の ID。
 *   **`main()` は必ず渡すこと。** 渡さないと PR をまたぐ ID 再利用を検知できない
 * @returns {Array<{path: string, reason: string}>} 違反の一覧。空なら通過
 */
export function findViolations({ changes, baseScripts, headScripts, baseArchivedIds = new Set() }) {
  const events = decompose(changes);
  const violations = [];

  // 同じ差分の中で保護ファイルが立ち退いたパス（移動元）。
  // ここへの持ち込みは、移動と追加の合わせ技によるすり替えである
  const vacated = new Set(
    events.filter((e) => e.kind === 'removed' && e.pairedTo !== undefined).map((e) => e.path),
  );

  /** 違反表示用。リネームは「旧 -> 新」で示す */
  const render = (e) => {
    if (e.from !== undefined) return `${e.from} -> ${e.path}`;
    if (e.pairedTo !== undefined) return `${e.path} -> ${e.pairedTo}`;
    return e.path;
  };

  for (const e of events) {
    const { kind, path, from, pairedTo, similarity } = e;

    // リネームの片割れの二重判定を避ける。移動元が保護対象なら removed 側の
    // 規則がそのリネームを代表する（免除するのも違反にするのも removed 側）
    if (kind === 'appeared' && from !== undefined && isProtectedPath(from)) continue;

    // --- 単一ファイルの規則 ---

    if (path === config().checker) {
      // 新規追加（ガード導入 PR）だけ許可
      if (kind === 'appeared' && from === undefined) continue;
      violations.push({ path: render(e), reason: 'ガードの判定ロジック自体は変更も移動もできない' });
      continue;
    }

    if (isGateHelper(path)) {
      // 新規追加（導入 PR）だけ許可
      if (kind === 'appeared' && from === undefined) continue;
      violations.push({ path: render(e), reason: '検証の委譲先は変更も移動もできない' });
      continue;
    }

    if (config().templates.includes(path)) {
      violations.push({ path: render(e), reason: '型（TEMPLATE）は変更も移動もできない' });
      continue;
    }

    // マニフェスト自身。**保護対象の筆頭である。** これを書き換えられると、
    // 保護パスの一覧ごと差し替えてガードを無効化できる
    if (path === config().self) {
      // 新規追加（導入 PR）だけ許可
      if (kind === 'appeared' && from === undefined) continue;
      violations.push({ path: render(e), reason: 'マニフェスト（固有値の宣言）は変更も移動もできない' });
      continue;
    }

    if (config().verifyDefinedIn.some((d) => d.path === path)) {
      // base 側が読めない＝導入 PR。比較対象が無いので判定しない
      if (baseScripts === null || headScripts === null) continue;
      if (scriptsChanged(baseScripts[path], headScripts[path])) {
        violations.push({ path, reason: '検証コマンドの定義が変わっている' });
      }
      continue;
    }

    // --- 保護ディレクトリの規則 ---

    const dir = config().appendOnlyDirs.find((d) => covers(d, path));
    if (!dir) continue;

    if (kind === 'modified') {
      violations.push({ path, reason: `既存の${dir.label}の内容が変わっている` });
      continue;
    }

    if (kind === 'removed') {
      if (pairedTo === undefined) {
        violations.push({ path, reason: `既存の${dir.label}が削除されている` });
        continue;
      }
      // 免除するのはアーカイブ移動だけ。移動先が保護ディレクトリ内であればよい、
      // では足りない。それだと `task/A/spec.md -> task/B/spec.md` で凍結対象を
      // 別作業へ付け替えたり、`archive/` から出して凍結を解いたりできてしまう。
      // 移動元がすでに archive/ の中なら、それもアーカイブ移動ではない
      // （許すと `archive/X` -> `archive/archive/X` で凍結記録を正規パスから動かせる）
      const alreadyArchived = path.startsWith(`${dir.prefix}archive/`);
      const isArchiveMove =
        dir.archiveMove
        && similarity === 100
        && !alreadyArchived
        && pairedTo === archiveDestination(dir, path);
      if (isArchiveMove) continue;

      const stayedInside = covers(dir, pairedTo);
      const reason = !stayedInside
        ? `既存の${dir.label}が保護ディレクトリの外へ移動されている`
        : similarity !== 100
          ? `既存の${dir.label}が内容ごと移動されている`
          : dir.archiveMove
            ? `既存の${dir.label}は、${dir.prefix}archive/ への移動以外はできない`
            : `既存の${dir.label}は内容が同一でも移動できない`;
      violations.push({ path: render(e), reason });
      continue;
    }

    // kind === 'appeared'
    // 持ち込み（A / 保護外からの R / C）はすべてここに正規化される。
    // 持ち込みに対する規則はこの 1 箇所にだけ書く
    if (vacated.has(path)) {
      violations.push({
        path: render(e),
        reason: `既存の${dir.label}を移動させた跡地に別の内容を${from !== undefined ? '移し込んでいる' : '置いている'}（すり替え）`,
      });
    } else if (archivedIdReused(dir, path, baseArchivedIds)) {
      // PR1 でアーカイブ移動し、マージ後の PR2 で同じ ID の作業を作り直す 2 手を防ぐ。
      // 差分の中だけを見る vacated では届かない。
      // ID は使い終わったら再利用しない規約なので、この持ち込みが正当になることはない
      violations.push({
        path: render(e),
        reason: `すでにアーカイブ済みの作業 ID を再利用している（base の archive/ に同じ ID の作業がある）`,
      });
    } else if (isAliasSpec(dir, path)) {
      // 別名の spec を持ち込んで progress の Target Spec をそこへ向ければ、
      // 以後その完了条件は保護を受けずに書き換えられる
      violations.push({
        path: render(e),
        reason: `${dir.label}は ${dir.specFile} だけにする（別名の spec で Target Spec を付け替えて凍結を迂回できる）`,
      });
    }
  }

  return violations;
}

/**
 * PR ラベルに承認ラベルが含まれるかを判定する純関数。
 * ラベル情報が取得できない場合は安全側に倒して false を返す。
 *
 * @param {string[] | null | undefined} labels
 * @returns {boolean}
 */
export function hasAllowLabel(labels) {
  if (!Array.isArray(labels)) return false;
  return labels.includes(ALLOW_LABEL);
}

/**
 * 環境変数からラベルの一覧を読む。
 * `PR_LABELS` は GitHub Actions から JSON 配列で渡す。読めなければ null。
 *
 * @returns {string[] | null}
 */
function readLabels() {
  const raw = process.env.PR_LABELS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * 指定した ref の「検証コマンドの定義」を、マニフェストの `verify.definedIn` に従って読む。
 *
 * `jsonKey` があれば JSON のそのキーを、無ければファイルの内容そのものを採る。
 * どれか 1 つでも読めなければ null を返す（＝導入 PR。比較しない）。
 *
 * @param {string} ref - `git show` に渡す ref
 * @param {Array<{path: string, jsonKey?: string}>} definedIn
 * @returns {Record<string, Record<string, string>> | null}
 */
function readVerifyDefinitions(ref, definedIn) {
  const out = {};
  for (const d of definedIn) {
    let raw;
    try {
      raw = execFileSync('git', ['show', `${ref}:${d.path}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
    if (d.jsonKey === undefined) {
      out[d.path] = { content: raw };
      continue;
    }
    try {
      out[d.path] = JSON.parse(raw)[d.jsonKey] ?? {};
    } catch (err) {
      throw new Error(`${ref}:${d.path} を JSON として読めません: ${err.message}`, { cause: err });
    }
  }
  return out;
}

/**
 * 指定した ref のマニフェストを読んで最小限の形を確かめる。
 *
 * **base 側から読む。** ディスク上（候補側）を読むと、保護パスを削るマニフェストの
 * 変更と保護パスの変更を同じ PR に入れるだけでガードを迂回できる。
 * このファイル自身を base 版で実行しているのと同じ理由である。
 *
 * このファイルは単体実行されるので `tools/loop-manifest.mjs` を import できない。
 * ここでは**判定に要る形だけ**を確かめる（完全な検査はあちらが持つ）。
 *
 * @param {string} ref
 * @returns {object}
 */
function readManifest(ref) {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${ref}:${MANIFEST_PATH}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // base にマニフェストが無いのは、**この仕組みを導入する PR だけ**である。
    // そのときだけ候補側で判定する（`.github/workflows/guard.yml` が
    // 「base にチェッカーが無いため候補側で判定します」とするのと同じ経路）。
    // マージ後は必ず base 側の経路になる。
    // **既定値では動かさない。** 候補側にも無ければそのまま失敗する。
    console.error(`::warning::${ref} にマニフェストが無いため候補側で判定します（導入 PR のみ想定）。`);
    try {
      raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    } catch (err) {
      throw new Error(
        `マニフェスト（${MANIFEST_PATH}）が base にも候補側にもありません。既定値では判定しません。\n`
        + `原因: ${err.message}`,
        { cause: err },
      );
    }
  }
  const manifest = JSON.parse(raw);
  const missing = [
    'ledger', 'protected', 'verify',
  ].filter((k) => manifest[k] === undefined || manifest[k] === null);
  if (missing.length > 0) {
    throw new Error(`${ref}:${MANIFEST_PATH} に必須項目がありません: ${missing.join(', ')}`);
  }
  if (manifest.protected.self !== MANIFEST_PATH) {
    throw new Error(
      `${ref}:${MANIFEST_PATH} の protected.self が自分自身を指していません: ${manifest.protected.self}\n`
      + 'マニフェストが自己保護していないと、書き換え放題になります。',
    );
  }
  return manifest;
}

/**
 * base の `<prefix>archive/` にある作業 ID を列挙する。
 * archive/ が base に無いなら再利用は起こり得ないので空を返す。
 *
 * @param {string} mergeBase
 * @returns {Set<string>}
 */
function readBaseArchivedIds(mergeBase) {
  const ids = new Set();
  for (const dir of config().appendOnlyDirs) {
    if (!dir.specFile) continue;
    let out;
    try {
      out = execFileSync('git', ['ls-tree', '--name-only', `${mergeBase}:${dir.prefix}archive`], {
        encoding: 'utf8',
        // base に archive/ が無いのは想定内で、下の catch が空集合として続行する。
        // 既定では git の stderr が親へ素通しになり `fatal: Not a valid object name`
        // が CI ログに出る。判定は正しいのに失敗と誤読されるので、ここだけ捨てる。
        // 他の git 呼び出しの stderr は fail-closed の説明として意図的に残している。
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      // base に archive/ 自体が無い（＝アーカイブ済みの作業が無い）
      continue;
    }
    for (const line of out.split('\n')) {
      const m = /^(\d{4})-/.exec(line.trim());
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

function main() {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('使い方: node tools/check-protected-paths.mjs <base-ref>');
    process.exit(1);
  }

  let changes;
  let baseScripts;
  let headScripts;
  let baseArchivedIds;
  let raw;
  let mergeBase;
  try {
    // 差分は base...HEAD（三点）なので、比較対象も分岐点（merge-base）に揃える。
    // base の先端を見ると、分岐後に main 側で scripts が変わった場合に誤検知する。
    mergeBase = execFileSync('git', ['merge-base', baseRef, 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    raw = execFileSync(
      'git',
      ['diff', '--name-status', '-M', '-z', `${baseRef}...HEAD`],
      { encoding: 'utf8' },
    );
  } catch (err) {
    // 差分が取れないまま素通りさせない（shallow clone 等）
    console.error(`base (${baseRef}) との差分を取得できませんでした: ${err.message}`);
    console.error('shallow clone の場合は fetch-depth: 0 が要ります。');
    process.exit(1);
  }

  try {
    changes = parseNameStatus(raw);
    // **base のマニフェストで判定する。** 候補側を読むと迂回できる
    useManifest(readManifest(mergeBase));
    baseScripts = readVerifyDefinitions(mergeBase, config().verifyDefinedIn);
    headScripts = readVerifyDefinitions('HEAD', config().verifyDefinedIn);
    // これを渡さないと PR をまたぐ ID 再利用を取り逃がす
    baseArchivedIds = readBaseArchivedIds(mergeBase);
  } catch (err) {
    // 読めなかったものを「変更なし」と扱わない
    console.error(`差分を解釈できませんでした: ${err.message}`);
    process.exit(1);
  }

  const violations = findViolations({ changes, baseScripts, headScripts, baseArchivedIds });

  if (violations.length === 0) {
    console.log(`保護パスの変更はありません（${changes.length} 件の差分を確認）。`);
    return;
  }

  const labels = readLabels();
  console.error(`保護パスの変更を ${violations.length} 件検知しました:`);
  for (const v of violations) {
    console.error(`  - ${v.path}: ${v.reason}`);
  }

  if (hasAllowLabel(labels)) {
    console.log(`\nラベル ${ALLOW_LABEL} があるため通過させます（人間による明示承認）。`);
    return;
  }

  console.error(
    `\n変更が正当なら、改訂内容と理由を spec に書いたうえで PR に ${ALLOW_LABEL} ラベルを付けてください。`,
  );
  process.exit(1);
}

// CLI として起動されたときだけ実行する（テストからの import では走らせない）。
// ファイル名で判定すると、別名にコピーして実行したとき（CI が base 版を
// 一時ファイルへ取り出す経路）に main() が黙って走らない。
// `import.meta.url` は realpath 解決済みなので、argv 側も realpath に揃える。
// 揃えないとパスに symlink 成分があるとき（/tmp -> /private/tmp 等）不一致になり、
// main() が走らないまま exit 0 になる。ガードが黙って成功するのが最悪の失敗方向。
if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  main();
}
