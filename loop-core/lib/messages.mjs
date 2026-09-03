/**
 * 利用者向け文言。語彙は layout 定数から生成し、直書きしない。
 */

import {
  CLI_INVOCATION,
  IMPLEMENTATION_DIR_NAMES,
  PROGRESS_FILE,
  TASK_DIR,
} from './layout.mjs';

export const BYPASS_LABEL = 'no-progress-needed';

function implLabel() {
  return IMPLEMENTATION_DIR_NAMES.join('・');
}

function progressPathHint() {
  return `${PROGRESS_FILE}（${TASK_DIR}<id>-<slug>/${PROGRESS_FILE}）`;
}

export function docsOnlyMessage() {
  return `${implLabel()} に変更がないため対象外です。`;
}

export function coupledMessage() {
  return `実装の変更に、進行中の作業の ${PROGRESS_FILE} がちょうど 1 件伴っています。`;
}

export function bypassLabelMessage(label = BYPASS_LABEL) {
  return `ラベル ${label} があるため通過させます（人間による明示承認）。`;
}

export function missingProgressLines() {
  return [
    `実装（${implLabel()}）を変更していますが、進行中の作業の`,
    `${progressPathHint()} の更新が含まれていません。`,
    `工程を進めたら、その作業の progress を同じ PR で更新してください。`,
    `数えるのは、base に既にある ${PROGRESS_FILE} の内容を書き足した更新だけです。`,
  ];
}

export function newProgressNotCountedLines() {
  return [
    `この PR で新しく作った ${PROGRESS_FILE} は数えません。spec + progress は`,
    '先に計画用ブランチの docs PR で main へ入れてください。',
  ];
}

export function unchangedProgressLines() {
  return [
    `進行中の作業の ${PROGRESS_FILE} が差分に出ていますが、中身が変わっていません`,
    '（実行ビットなど、ファイルのモードだけの変更です）:',
  ];
}

export function unchangedProgressAdviceLines() {
  return [
    `工程を進めたら、その作業の ${PROGRESS_FILE} の内容——Status・チェックボックス・`,
    '試行ログ——を書き足して、同じ PR に含めてください。モードを変えただけでは',
    '進捗を記録したことになりません。',
  ];
}

export function strayProgressLines() {
  return [
    `進行中の作業の ${PROGRESS_FILE} に、その場の更新でない変更が含まれています:`,
  ];
}

export function strayProgressAdviceLines() {
  return [
    `数えるのは、base に既にある ${PROGRESS_FILE} の内容を書き足した更新だけです。`,
    '新規追加・削除・種別の変更（symlink への置き換えなど）・作業ディレクトリを',
    'またぐ移動（アーカイブを含む）は、実装 PR に混ぜないでください。',
    '1 PR = 1 作業です。',
    'spec + progress の新規作成は計画用ブランチの docs PR へ、',
    'アーカイブは main への直接コミットへ分けてください。',
  ];
}

export function foreignProgressLines(work, branch, headBranch) {
  return [
    `更新された ${PROGRESS_FILE} がこの PR の作業のものではありません: ${work}`,
    `  ${TASK_DIR}${work}/${PROGRESS_FILE} の Branch（base 側）: ${branch ?? '（行がありません）'}`,
    `  この PR の head ブランチ: ${headBranch}`,
    `この PR のブランチで進めている作業の ${PROGRESS_FILE} を更新してください。`,
    `別の作業の ${PROGRESS_FILE} を触っているなら、PR を分けてください。`,
    'Branch は base（merge-base）側から読みます。着手時に main へ入れた値が',
    '正であり、この PR で書き換えても判定は変わりません。',
  ];
}

export function multipleProgressLines(count) {
  return [`進行中の作業の ${PROGRESS_FILE} が ${count} 件更新されています:`];
}

export function startTaskHint() {
  return `実装は worktree で行う。\`${CLI_INVOCATION} start-task\` で開始する。`;
}

export function blockImplementationMessage(filePath) {
  return [
    `プライマリチェックアウトの実装ファイルは編集できません: ${filePath}`,
    startTaskHint(),
  ].join('\n');
}

export function noManifestMessage(manifestPath) {
  return `マニフェストが無い: ${manifestPath}`;
}

export function missingStructureMessage(missing) {
  return [
    'Core が期待する構造がありません:',
    ...missing.map((item) => `  - ${item}`),
  ].join('\n');
}

export function couplingUsage() {
  return `使い方: ${CLI_INVOCATION} check-progress-coupling <base-ref>`;
}

export function protectedPathsUsage() {
  return `使い方: ${CLI_INVOCATION} check-protected-paths <base-ref>`;
}
