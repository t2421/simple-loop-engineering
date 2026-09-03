/**
 * CLAUDE.md テンプレートの穴。未記入の `{{NAME}}` を lint が列挙する。
 */

export const CLAUDE_MD_HOLES = Object.freeze([
  'VERIFY_COMMAND',
  'INSTALL_COMMAND',
  'ARTIFACT_LAYOUT',
  'REVIEWER_CODE',
  'REVIEWER_VISUAL',
  'HAS_VISUAL',
  'CORE_CLI',
  'CLAUDE_CONFIG_REF',
]);

const HOLE_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

/**
 * 既知の穴のうち、本文に残っているものを重複なく名前順で返す。
 *
 * @param {string} markdown
 * @returns {string[]}
 */
export function findUnfilledHoles(markdown) {
  if (typeof markdown !== 'string') return [];
  const known = new Set(CLAUDE_MD_HOLES);
  const found = new Set();
  for (const match of markdown.matchAll(HOLE_RE)) {
    if (known.has(match[1])) found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * @param {string[]} holes
 * @returns {string[]}
 */
export function unfilledHoleReasons(holes) {
  return holes.map((name) => `CLAUDE.md の穴が未記入: {{${name}}}`);
}
