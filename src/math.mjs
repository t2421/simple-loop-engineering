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
 * 2 つの有限数の積を返す純関数。
 * 引数は変更しない。
 *
 * @param {number} a - 乗数。有限数
 * @param {number} b - 乗数。有限数
 * @returns {number} a と b の積
 */
export function mul(a, b) {
  return a * b;
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

/**
 * 2 次元ベクトルの和を返す純関数。
 * 引数は変更しない。戻り値は入力とは別の新しい配列である。
 *
 * @param {[number, number]} a - 加数のベクトル。長さ 2 の配列。各要素は有限数
 * @param {[number, number]} b - 加数のベクトル。長さ 2 の配列。各要素は有限数
 * @returns {[number, number]} 成分ごとの和
 * @throws {TypeError} a または b が長さ 2 の配列でないとき
 */
export function addVec(a, b) {
  if (!isVec2(a) || !isVec2(b)) {
    throw new TypeError('長さ 2 の配列が必要です');
  }
  return [a[0] + b[0], a[1] + b[1]];
}

/**
 * @param {unknown} value
 * @returns {value is [unknown, unknown]}
 */
function isVec2(value) {
  return Array.isArray(value) && value.length === 2;
}
