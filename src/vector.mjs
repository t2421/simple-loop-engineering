import { addVec } from './math.mjs';

/**
 * グラフの座標規則。仕様の「構造と操作」と
 * task/0051-calc-vec-add/calc-vec-add.figma.json の graphCard.grid が正。
 *
 * 数学座標 (y 上向き) を画面座標 (y 下向き) に反転する。
 */
const ORIGIN_X = 250;
const ORIGIN_Y = 250;
const UNIT_PX = 35;
const AXIS_RANGE = 6;

/**
 * 1px のグリッド線を 1 物理ピクセルに載せるための半ピクセル。
 * SVG のストロークは座標を中心に引かれるので、整数座標では 2 列に割れる。
 */
const GRID_LINE_HALF_PX = 0.5;

/** 目盛りラベルの位置。抽出 JSON の graphCard.grid.tickLabel が正。 */
const TICK_X_OFFSET = -12;
const TICK_X_BASELINE_TOP = 254;
const TICK_X_BOX_HEIGHT = 13;
const TICK_Y_RIGHT_EDGE = 244;

const SVG_NS = 'http://www.w3.org/2000/svg';

const form = document.getElementById('vector-form');
const inputs = {
  ax: document.getElementById('vec-a-x'),
  ay: document.getElementById('vec-a-y'),
  bx: document.getElementById('vec-b-x'),
  by: document.getElementById('vec-b-y'),
};
const resultValue = document.getElementById('vec-add-result');
const gridLinesGroup = document.getElementById('grid-lines');
const tickLabelsGroup = document.getElementById('tick-labels');
const arrowsGroup = document.getElementById('vector-arrows');
const legend = {
  a: document.getElementById('legend-a'),
  b: document.getElementById('legend-b'),
  sum: document.getElementById('legend-sum'),
};

/**
 * 数学座標を SVG の画面座標へ変換する純関数。
 *
 * @param {number} x
 * @param {number} y
 * @returns {{x: number, y: number}}
 */
export function toCanvas(x, y) {
  return { x: ORIGIN_X + UNIT_PX * x, y: ORIGIN_Y - UNIT_PX * y };
}

/**
 * 入力欄の値を数値にする。空欄・非数は 0 とみなす
 * (既存のスカラー計算機 src/calc.mjs と同じ規則)。
 *
 * @param {HTMLInputElement} input
 * @returns {number}
 */
function parseNumber(input) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : 0;
}

/**
 * ベクトルを `(x, y)` 形式の文字列にする純関数。
 *
 * @param {readonly [number, number]} vec
 * @returns {string}
 */
export function formatVec(vec) {
  return `(${vec[0]}, ${vec[1]})`;
}

function createSvg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

/** グリッド線を描く。軸 (0) の位置には引かない。 */
function drawGrid() {
  for (let unit = -AXIS_RANGE; unit <= AXIS_RANGE; unit++) {
    if (unit === 0) continue;
    // 1px の線を 1 物理ピクセルに載せる。整数座標だとストロークが半分ずつ
    // 2 列にまたがってぼやけ、抽出 PNG の輪郭と一致しない。
    const offset = ORIGIN_X + UNIT_PX * unit + GRID_LINE_HALF_PX;
    gridLinesGroup.append(
      createSvg('line', { x1: offset, y1: 0, x2: offset, y2: 500 }),
      createSvg('line', { x1: 0, y1: offset, x2: 500, y2: offset })
    );
  }
}

/** 目盛りラベルを描く。 */
function drawTickLabels() {
  for (let unit = -AXIS_RANGE; unit <= AXIS_RANGE; unit++) {
    if (unit === 0) continue;

    const xLabel = createSvg('text', {
      x: ORIGIN_X + UNIT_PX * unit + TICK_X_OFFSET,
      y: TICK_X_BASELINE_TOP + TICK_X_BOX_HEIGHT / 2,
      'text-anchor': 'start',
      'dominant-baseline': 'central',
    });
    xLabel.textContent = String(unit);

    const yLabel = createSvg('text', {
      x: TICK_Y_RIGHT_EDGE,
      y: ORIGIN_Y - UNIT_PX * unit,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
    });
    yLabel.textContent = String(unit);

    tickLabelsGroup.append(xLabel, yLabel);
  }
}

/**
 * 3 本の矢印を描き直す。原点から各ベクトルの終点まで引く。
 *
 * @param {readonly [number, number]} a
 * @param {readonly [number, number]} b
 * @param {readonly [number, number]} sum
 */
function drawVectors(a, b, sum) {
  arrowsGroup.replaceChildren();
  const specs = [
    { vec: a, className: 'vector-line-a', marker: 'arrowhead-a' },
    { vec: b, className: 'vector-line-b', marker: 'arrowhead-b' },
    { vec: sum, className: 'vector-line-sum', marker: 'arrowhead-sum' },
  ];
  for (const { vec, className, marker } of specs) {
    const end = toCanvas(vec[0], vec[1]);
    arrowsGroup.append(
      createSvg('line', {
        class: className,
        x1: ORIGIN_X,
        y1: ORIGIN_Y,
        x2: end.x,
        y2: end.y,
        'marker-start': `url(#${marker})`,
        'marker-end': `url(#${marker})`,
      })
    );
  }
}

function calculate() {
  const a = [parseNumber(inputs.ax), parseNumber(inputs.ay)];
  const b = [parseNumber(inputs.bx), parseNumber(inputs.by)];
  // 成分の足し算は公開済みの addVec に委ねる(完了条件 5)。ここで足さない。
  const sum = addVec(a, b);

  resultValue.textContent = formatVec(sum);
  legend.a.textContent = `ベクトル A ${formatVec(a)}`;
  legend.b.textContent = `ベクトル B ${formatVec(b)}`;
  legend.sum.textContent = `A + B ${formatVec(sum)}`;
  drawVectors(a, b, sum);
}

drawGrid();
drawTickLabels();

// 計算ボタンのクリックと、入力欄での Enter 押下の両方をここで処理する
form.addEventListener('submit', (event) => {
  event.preventDefault();
  calculate();
});
