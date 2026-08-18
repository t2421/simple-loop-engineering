/**
 * 2 つの有限数の和を返す純関数。
 * 引数は変更しない。
 *
 * @param {number} a - 加数。有限数
 * @param {number} b - 加数。有限数
 * @returns {number} a と b の和
 */
export function add(a, b) {
  return a + b;
}

/**
 * 2 つの有限数の差を返す純関数。
 * 引数は変更しない。
 *
 * @param {number} a - 被減数。有限数
 * @param {number} b - 減数。有限数
 * @returns {number} a から b を引いた差
 */
export function sub(a, b) {
  return a - b;
}
