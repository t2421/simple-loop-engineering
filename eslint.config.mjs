import js from '@eslint/js';
import globals from 'globals';

/**
 * フラット設定。`@eslint/js` の recommended をベースにする。
 * 独自ルールは足さない（`specs/ci-lint.md` の範囲外）。
 *
 * globals は動く場所で分ける。`src/` はブラウザ、`tests/` と `tools/` は Node。
 */
export default [
  {
    ignores: ['node_modules/', '.worktrees/', 'progress/', 'specs/', 'backlog/'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', 'loop-core/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Playwright のテストは、`page.evaluate` / `page.$eval` に渡すコールバックが
    // ブラウザ側で動く。同じファイルに Node とブラウザの両方の文脈が同居する。
    //
    // ブラウザ globals を丸ごと合流させると、Node 側のコードが `window` などを
    // 誤参照しても no-undef が黙る。実際にコールバックで使う 2 つだけを足す。
    files: ['tests/calc-page.test.mjs'],
    languageOptions: {
      globals: { getComputedStyle: 'readonly', document: 'readonly' },
    },
  },
];
