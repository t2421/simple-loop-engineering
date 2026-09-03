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

/** 人間による明示承認の経路。この PR ラベルが付いていればガードを通過させる */
export const ALLOW_LABEL = 'allow-protected-change';

/** ループの固有値を宣言するマニフェスト。ツールが固有値を探す場所の契約 */
const MANIFEST = 'loop.manifest.json';

/** 見出し・順番を固定した型。移動しても中身を変えてもいけない */
const TEMPLATES = [
  'task/TEMPLATE-spec.md',
  'task/TEMPLATE-progress.md',
  'specs/TEMPLATE.md',
  'progress/TEMPLATE.md',
];

/**
 * 判定の根拠そのもの。ガードジョブは base リビジョンのこのファイルを実行するので、
 * これを書き換えられるとガードを恒久的に無効化できる。移動も変更も削除も許さない。
 */
const CHECKER = 'tools/check-protected-paths.mjs';

/** 作業の仕様はこのファイル名だけにする */
const SPEC_FILE = 'spec.md';

/**
 * CI のジョブが委譲する判定・実行ファイル。scripts やワークフローを触らずに
 * ユニットを間引いたり、e2e 判定を常に false にしたり、progress 結合の検査を
 * 骨抜きにしたりできないようにする。
 * 新規追加は導入 PR のため許可。変更・削除・移動は許さない。
 *
 * `tools/check-progress-coupling.mjs` も同じ性質を持つ。ガードジョブは base 版を
 * 実行するので骨抜き PR 自体は無傷の base 版で検査されるが、それがマージされた
 * 瞬間に以後の base が骨抜き版になる（2 PR で恒久的に無効化できる）。
 */
const GATE_HELPERS = [
  'tools/run-unit-tests.mjs',
  'tools/e2e-needed.mjs',
  'tools/check-progress-coupling.mjs',
  // Stop hook が CI を回す対象ディレクトリの判定。書き換えれば変更の無い
  // チェックアウトを指させ、セッション停止時の検証を骨抜きにできる
  'tools/stop-hook-ci-dir.mjs',
  // push した HEAD の GitHub Actions の結果の判定。Stop hook が委譲する。
  // 書き換えれば、赤い・未確定の Actions のまま会話を終えられる
  'tools/check-actions.mjs',
  // プライマリチェックアウトでの実装編集を止める PreToolUse hook の判定。
  // 骨抜きにすれば worktree の規律が消え、実装が進捗の記録なしに main へ入る
  'tools/guard-worktree.mjs',
  // マニフェストの読み取り・検証。既定値で補う・自己保護を外す改変を止める
  'tools/loop-manifest.mjs',
  // **hook の配線そのもの。** 上の判定コードをすべて凍結しても、ここから登録を
  // 消せば判定は 1 行も変えずに呼ばれなくなる。判定の所在だけでなく
  // 呼び出しの所在も守る（検証コマンドの definedIn と同じ構造）。
  // 配線の網羅は tests/hook-wiring.test.mjs が実物から機械検証する
  '.claude/settings.json',
];

function isGateHelper(filePath) {
  return GATE_HELPERS.includes(filePath);
}

/**
 * マニフェスト由来の単一ファイル保護（マニフェスト自身を含む）。
 *
 * @param {string} filePath
 * @param {string[]} extraProtectedPaths
 * @returns {boolean}
 */
function isManifestProtected(filePath, extraProtectedPaths) {
  return filePath === MANIFEST || extraProtectedPaths.includes(filePath);
}

/**
 * 既存ファイルの内容変更・削除を禁じ、新規追加は許すディレクトリ。
 *
 * `archiveMove` が true のディレクトリだけ、`<prefix>X` → `<prefix>archive/X` の
 * 内容同一の移動（アーカイブ作業）を許す。`tests/` と `.github/workflows/` は
 * 移動も許さない。リネームでディレクトリの外へ出せば、テストの削除や CI の
 * 無効化ができてしまうため。
 */
const APPEND_ONLY_DIRS = [
  // `task/<id>-<slug>/` には spec.md・progress.md・関連ファイル（Figma 抽出物など）が
  // 同居する。期待値は spec.md だけでなく抽出物にもあるので、配下は原則すべて守る。
  // 除外は progress.md だけ。進捗は工程を進めるたびに更新するもので、保護すると
  // 作業 PR が毎回ラベルを要求することになり、ガードが形骸化する。
  { prefix: 'task/', label: '仕様', archiveMove: true, exclude: 'progress.md', specFile: SPEC_FILE },
  { prefix: 'specs/', label: '仕様', archiveMove: true },
  { prefix: 'tests/', label: 'テスト', archiveMove: false },
  { prefix: '.github/workflows/', label: 'ワークフロー', archiveMove: false },
];

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
  return name !== dir.specFile && name !== dir.exclude;
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
 * @param {string[]} [extraProtectedPaths]
 * @param {string[]} [definedInPaths]
 * @returns {boolean}
 */
function isProtectedPath(p, extraProtectedPaths = [], definedInPaths = []) {
  return (
    p === CHECKER
    || isGateHelper(p)
    || isManifestProtected(p, extraProtectedPaths)
    || definedInPaths.includes(p)
    || TEMPLATES.includes(p)
    || APPEND_ONLY_DIRS.some((d) => covers(d, p))
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
 * 検証コマンド定義の比較用シグネチャ。
 *
 * JSON で `scripts` オブジェクトを持つファイルは、そのオブジェクトだけを見る
 * （依存の増減で検証が弱まるわけではない）。それ以外の形式は内容の同一性。
 * 形式名は問わない。JSON パースを前提にしない。
 *
 * @param {string} raw
 * @returns {string}
 */
export function verifyDefinitionSignature(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed !== null
      && typeof parsed === 'object'
      && !Array.isArray(parsed)
      && parsed.scripts !== null
      && typeof parsed.scripts === 'object'
      && !Array.isArray(parsed.scripts)
    ) {
      const scripts = parsed.scripts;
      const sorted = Object.fromEntries(
        Object.keys(scripts).sort().map((key) => [key, scripts[key]]),
      );
      return JSON.stringify(sorted);
    }
  } catch {
    // 形式非依存。JSON でなければ内容そのもの
  }
  return raw;
}

/**
 * 2 つの scripts オブジェクトが変わったかを判定する純関数。
 * キーの増減と値の変更の両方を見る。
 *
 * @param {Record<string, string>} baseScripts
 * @param {Record<string, string>} headScripts
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
 * @param {string[]} [input.definedInPaths] - マニフェスト `verify.definedIn` のパス
 * @param {Record<string, boolean>} [input.definedInChanged] - 定義シグネチャが変わったか
 * @param {string[]} [input.extraProtectedPaths] - マニフェスト `protectedPaths`（自身を含む）
 * @param {Set<string>} [input.baseArchivedIds] - base の `archive/` にある作業の ID。
 *   **`main()` は必ず渡すこと。** 渡さないと PR をまたぐ ID 再利用を検知できない
 * @returns {Array<{path: string, reason: string}>} 違反の一覧。空なら通過
 */
export function findViolations({
  changes,
  definedInPaths = [],
  definedInChanged = {},
  extraProtectedPaths = [],
  baseArchivedIds = new Set(),
}) {
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
    if (kind === 'appeared' && from !== undefined && isProtectedPath(from, extraProtectedPaths, definedInPaths)) continue;

    // --- 単一ファイルの規則 ---

    if (path === CHECKER) {
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

    if (isManifestProtected(path, extraProtectedPaths)) {
      if (kind === 'appeared' && from === undefined) continue;
      violations.push({ path: render(e), reason: 'ループマニフェストは変更も移動もできない' });
      continue;
    }

    if (TEMPLATES.includes(path)) {
      violations.push({ path: render(e), reason: '型（TEMPLATE）は変更も移動もできない' });
      continue;
    }

    if (definedInPaths.includes(path)) {
      if (kind === 'appeared' && from === undefined) continue;
      if (kind === 'modified') {
        if (definedInChanged[path]) {
          violations.push({ path, reason: '検証コマンドの定義が変わっている' });
        }
        continue;
      }
      violations.push({ path: render(e), reason: '検証コマンドの定義ファイルは削除も移動もできない' });
      continue;
    }

    // --- 保護ディレクトリの規則 ---

    const dir = APPEND_ONLY_DIRS.find((d) => covers(d, path));
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
 * 指定した ref のファイル内容を読む。無ければ null。
 *
 * @param {string} ref
 * @param {string} filePath
 * @returns {string | null}
 */
function tryGitShow(ref, filePath) {
  try {
    return execFileSync('git', ['show', `${ref}:${filePath}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * 指定 ref のマニフェストから definedIn と protectedPaths を読む。
 * ファイルが無ければ null。壊れているときは例外（既定値で補わない）。
 *
 * @param {string} ref
 * @returns {{ definedInPaths: string[], extraProtectedPaths: string[] } | null}
 */
function readManifestFieldsAt(ref) {
  const raw = tryGitShow(ref, MANIFEST);
  if (raw === null) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${MANIFEST}: JSON として読めない: ${err.message}`, { cause: err });
  }
  let definedIn = data?.verify?.definedIn;
  if (typeof definedIn === 'string') definedIn = [definedIn];
  if (!Array.isArray(definedIn) || definedIn.length === 0) {
    throw new Error(`${MANIFEST}: 必須項目 verify.definedIn がありません`);
  }
  const extraProtectedPaths = Array.isArray(data?.protectedPaths) ? data.protectedPaths : [];
  if (!extraProtectedPaths.includes(MANIFEST)) {
    throw new Error(`${MANIFEST}: マニフェストが保護パス一覧に自分自身を含んでいない`);
  }
  return { definedInPaths: definedIn, extraProtectedPaths };
}

/**
 * base と HEAD の宣言を和集合にする。
 *
 * HEAD だけを見ると、同じ PR で `definedIn` から定義ファイルを外し、
 * そのファイルの検証コマンドを空にできる。base 側に載っていたパスも
 * 凍らせる。導入 PR（base にマニフェストが無い）は HEAD だけを使う。
 *
 * base 側は merge-base ではなく base 先端（例: origin/main）から読む。
 * 分岐後に main へ追加された definedIn / protectedPaths を、古いブランチが
 * 取り込まないまま回避できないようにする。
 *
 * @param {string} baseRef
 * @returns {{ definedInPaths: string[], extraProtectedPaths: string[] }}
 */
function readMergedManifestFields(baseRef) {
  const head = readManifestFieldsAt('HEAD');
  if (head === null) {
    throw new Error(`マニフェストが無い: ${MANIFEST}`);
  }
  const base = readManifestFieldsAt(baseRef);
  if (base === null) return head;
  return {
    definedInPaths: [...new Set([...base.definedInPaths, ...head.definedInPaths])],
    extraProtectedPaths: [...new Set([...base.extraProtectedPaths, ...head.extraProtectedPaths])],
  };
}

/**
 * definedIn 各ファイルの検証定義シグネチャが base と HEAD で違うか。
 *
 * @param {string} mergeBase
 * @param {string[]} definedInPaths
 * @returns {Record<string, boolean>}
 */
function buildDefinedInChanged(mergeBase, definedInPaths) {
  /** @type {Record<string, boolean>} */
  const definedInChanged = {};
  for (const filePath of definedInPaths) {
    const headRaw = tryGitShow('HEAD', filePath);
    if (headRaw === null) {
      throw new Error(`verify.definedIn が指すファイルが存在しない: ${filePath}`);
    }
    const baseRaw = tryGitShow(mergeBase, filePath);
    if (baseRaw === null) {
      definedInChanged[filePath] = true;
      continue;
    }
    definedInChanged[filePath] =
      verifyDefinitionSignature(baseRaw) !== verifyDefinitionSignature(headRaw);
  }
  return definedInChanged;
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
  for (const dir of APPEND_ONLY_DIRS) {
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
  let definedInPaths;
  let definedInChanged;
  let extraProtectedPaths;
  let baseArchivedIds;
  let raw;
  let mergeBase;
  try {
    // 内容比較（definedIn の定義シグネチャ・archived ID）は分岐点（merge-base）に揃える。
    // 差分は base...HEAD（三点）なので、base 先端を見ると分岐後に main 側で
    // scripts が変わったときに誤検知する。宣言の和集合だけは base 先端から読む。
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
    ({ definedInPaths, extraProtectedPaths } = readMergedManifestFields(baseRef));
    definedInChanged = buildDefinedInChanged(mergeBase, definedInPaths);
    // これを渡さないと PR をまたぐ ID 再利用を取り逃がす
    baseArchivedIds = readBaseArchivedIds(mergeBase);
  } catch (err) {
    // 読めなかったものを「変更なし」と扱わない
    console.error(`差分を解釈できませんでした: ${err.message}`);
    process.exit(1);
  }

  const violations = findViolations({
    changes,
    definedInPaths,
    definedInChanged,
    extraProtectedPaths,
    baseArchivedIds,
  });

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
