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

/**
 * 2 つの有限数の商を返す純関数。
 * 引数は変更しない。
 *
 * @param {number} a - 被除数。有限数
 * @param {number} b - 除数。0 でない有限数
 * @returns {number} a を b で割った商
 * @throws {RangeError} b が 0 のとき
 */
export function div(a, b) {
  if (b === 0) {
    throw new RangeError('0 で割ることはできません');
  }
  return a / b;
}
