/**
 * CLAUDE.md「変えてはいけないもの」の遵守を、base ブランチとの差分から機械的に検知する。
 *
 * 判定ロジックは純関数として公開し、テスト可能にしてある。
 * CLI としては `node tools/check-protected-paths.mjs <base-ref>` で実行する。
 * 違反があれば理由を表示して終了コード 1 で終わる。
 */

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 人間による明示承認の経路。この PR ラベルが付いていればガードを通過させる */
export const ALLOW_LABEL = 'allow-protected-change';

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
 * `ci` / e2e ジョブが委譲する実行ファイル。scripts やワークフローを触らずに
 * ユニットを間引いたり e2e 判定を常に false にしたりできないようにする。
 * 新規追加は導入 PR のため許可。変更・削除・移動は許さない。
 */
const GATE_HELPERS = ['tools/run-unit-tests.mjs', 'tools/e2e-needed.mjs'];

function isGateHelper(filePath) {
  return GATE_HELPERS.includes(filePath);
}

/**
 * 既存ファイルの内容変更・削除を禁じ、新規追加は許すディレクトリ。
 *
 * `archiveMove` が true のディレクトリだけ、同ディレクトリ内での内容同一の移動
 * （アーカイブ作業）を許す。`tests/` と `.github/workflows/` は移動も許さない。
 * リネームでディレクトリの外へ出せば、テストの削除や CI の無効化ができてしまうため。
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
 * 別名の spec の追加かを判定する純関数。
 * 作業ディレクトリ直下に足された `.md` のうち、`spec.md` と除外対象以外を指す。
 *
 * @param {{prefix: string, exclude?: string}} dir
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
 * `package.json` の `scripts` が変わったかを判定する純関数。
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
 * @param {Record<string, string>} [input.baseScripts] - base 側の package.json の scripts
 * @param {Record<string, string>} [input.headScripts] - head 側の package.json の scripts
 * @param {(path: string) => boolean} [input.baseHas] - base にそのパスがあるか。
 *   **`main()` は必ず渡すこと。** 渡さないと PR をまたぐすり替えを検知できない
 * @returns {Array<{path: string, reason: string}>} 違反の一覧。空なら通過
 */
export function findViolations({ changes, baseScripts, headScripts, baseHas = () => false }) {
  const violations = [];

  // 同じ差分の中で、保護ファイルを移動させたうえで同じパスに新規追加すると、
  // 「移動は許可」「新規追加は許可」の合わせ技で中身をすり替えられる。
  // 移動元のパスを覚えておき、そこへの追加を弾く。
  const movedAwayFrom = new Set(
    changes
      .filter((c) => (c.status === 'R' || c.status === 'C') && c.oldPath)
      .map((c) => c.oldPath),
  );

  for (const change of changes) {
    const { status, path, oldPath, similarity } = change;

    // 新規追加（ガード導入 PR）は許可。変更・削除・移動は許さない
    if ((path === CHECKER && status !== 'A') || oldPath === CHECKER) {
      violations.push({
        path: oldPath ? `${oldPath} -> ${path}` : path,
        reason: 'ガードの判定ロジック自体は変更も移動もできない',
      });
      continue;
    }

    if ((isGateHelper(path) && status !== 'A') || (oldPath && isGateHelper(oldPath))) {
      violations.push({
        path: oldPath ? `${oldPath} -> ${path}` : path,
        reason: '検証の委譲先は変更も移動もできない',
      });
      continue;
    }

    // 型は移動も内容変更も削除も許さない
    if (TEMPLATES.includes(path) || TEMPLATES.includes(oldPath)) {
      violations.push({
        path: oldPath ? `${oldPath} -> ${path}` : path,
        reason: '型（TEMPLATE）は変更も移動もできない',
      });
      continue;
    }

    if (path === 'package.json' && scriptsChanged(baseScripts, headScripts)) {
      violations.push({
        path: 'package.json',
        reason: '検証コマンド（scripts）が変わっている',
      });
      continue;
    }

    const isRename = status === 'R' || status === 'C';
    // 保護対象かどうかは、移動元と移動先の両方で見る。
    // 移動元だけで見ると、保護ディレクトリの外へ出す変更を取り逃がす。
    const fromDir = isRename
      ? APPEND_ONLY_DIRS.find((d) => covers(d, oldPath ?? ''))
      : undefined;
    const dir = APPEND_ONLY_DIRS.find((d) => covers(d, path));

    if (isRename) {
      // 保護ディレクトリの外から中へ移すのは新規追加と同じ。ただし、
      // 同じ差分で保護ファイルを退かせた跡地へ移し込むのはすり替えである
      if (!fromDir) {
        if (dir && movedAwayFrom.has(path)) {
          violations.push({
            path: `${oldPath} -> ${path}`,
            reason: `既存の${dir.label}を移動させた跡地に別の内容を移し込んでいる（すり替え）`,
          });
        } else if (dir && isAliasSpec(dir, path)) {
          // 追加（A）だけを見ていると、外から移し込む（R）経路が残る。
          // `backlog/<id>/spec.md` -> `task/<id>-<slug>/spec.md` の正規の昇格は
          // 名前が `spec.md` なので、この判定には掛からない
          violations.push({
            path: `${oldPath} -> ${path}`,
            reason: `${dir.label}は ${dir.specFile} だけにする（別名の spec を移し込んで Target Spec を付け替えられる）`,
          });
        }
        continue;
      }

      // 免除するのはアーカイブ移動だけ。移動先が保護ディレクトリ内であればよい、
      // では足りない。それだと `task/A/spec.md -> task/B/spec.md` で凍結対象を
      // 別作業へ付け替えたり、`archive/` から出して凍結を解いたりできてしまう。
      // `<prefix>X` -> `<prefix>archive/X` の対応する遷移だけを許す。
      const stayedInside = covers(fromDir, path);
      // 移動元がすでに archive/ の中なら、それはアーカイブ移動ではない。
      // 許すと `archive/X` -> `archive/archive/X` で凍結記録を正規パスから動かせる
      const alreadyArchived = oldPath.startsWith(`${fromDir.prefix}archive/`);
      const isArchiveMove =
        fromDir.archiveMove
        && similarity === 100
        && !alreadyArchived
        && path === archiveDestination(fromDir, oldPath);
      if (isArchiveMove) continue;

      const reason = !stayedInside
        ? `既存の${fromDir.label}が保護ディレクトリの外へ移動されている`
        : similarity !== 100
          ? `既存の${fromDir.label}が内容ごと移動されている`
          : fromDir.archiveMove
            ? `既存の${fromDir.label}は、${fromDir.prefix}archive/ への移動以外はできない`
            : `既存の${fromDir.label}は内容が同一でも移動できない`;
      violations.push({ path: `${oldPath} -> ${path}`, reason });
      continue;
    }

    if (!dir) continue;

    // 新規追加は許可。ただし 2 つだけ許さない
    if (status === 'A') {
      if (movedAwayFrom.has(path)) {
        // 移動させた跡地への追加は、移動と追加の合わせ技によるすり替え
        violations.push({
          path,
          reason: `既存の${dir.label}を移動させた跡地に別の内容を置いている（すり替え）`,
        });
      } else if (dir.archiveMove && baseHas(archiveDestination(dir, path))) {
        // PR1 でアーカイブ移動し、マージ後の PR2 で跡地に緩めた spec を置く 2 手を防ぐ。
        // 差分の中だけを見る movedAwayFrom では届かない。
        // ID は使い終わったら再利用しない規約なので、この追加が正当になることはない
        violations.push({
          path,
          reason: `すでにアーカイブ済みの${dir.label}と同じパスに新しく置いている（${archiveDestination(dir, path)} がある）`,
        });
      } else if (isAliasSpec(dir, path)) {
        // 別名の spec を足して progress の Target Spec をそこへ向ければ、
        // 以後その完了条件は保護を受けずに書き換えられる
        violations.push({
          path,
          reason: `${dir.label}は ${dir.specFile} だけにする（別名の spec は Target Spec の付け替えで凍結を迂回できる）`,
        });
      }
      continue;
    }

    if (status === 'D') {
      violations.push({ path, reason: `既存の${dir.label}が削除されている` });
    } else {
      violations.push({ path, reason: `既存の${dir.label}の内容が変わっている` });
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
 * 指定した ref の package.json の scripts を読む。ref が読めなければ例外を投げる。
 *
 * @param {string} ref - `git show` に渡す ref
 * @returns {Record<string, string>}
 */
function readScripts(ref) {
  const raw = execFileSync('git', ['show', `${ref}:package.json`], { encoding: 'utf8' });
  return JSON.parse(raw).scripts ?? {};
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
    baseScripts = readScripts(mergeBase);
    headScripts = readScripts('HEAD');
  } catch (err) {
    // 読めなかったものを「変更なし」と扱わない
    console.error(`差分を解釈できませんでした: ${err.message}`);
    process.exit(1);
  }

  // base のツリーを引く。これを渡さないと PR をまたぐすり替えを取り逃がす
  const baseHas = (p) => {
    try {
      execFileSync('git', ['cat-file', '-e', `${mergeBase}:${p}`], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  const violations = findViolations({ changes, baseScripts, headScripts, baseHas });

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
