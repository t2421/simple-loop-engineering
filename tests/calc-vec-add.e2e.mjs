import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// この作業が完了すると task/0051-calc-vec-add/ は task/archive/ へ移動する
// (CLAUDE.md の アーカイブ 手順)。どちらの場所にあっても見つかるようにしておく。
function resolveFixture(filename) {
  const livePath = path.join(rootDir, 'task', '0051-calc-vec-add', filename);
  if (fs.existsSync(livePath)) return livePath;
  return path.join(rootDir, 'task', 'archive', '0051-calc-vec-add', filename);
}

const figma = JSON.parse(fs.readFileSync(resolveFixture('calc-vec-add.figma.json'), 'utf8'));
const referencePngPath = resolveFixture('calc-vec-add.png');

/**
 * ピクセル比較の色の許容差。
 *
 * Figma のラスタライザと Chromium は、同じフォント・同じ位置でも
 * アンチエイリアスの階調が一致しない。特に濃色背景の白文字(ヘッダー)で差が大きい。
 * これは実装の欠陥ではなく描画器の違いなので、per-pixel の色許容差で吸収する。
 *
 * この値でも版ずれは検出できることを確認済み(spec の「改訂の記録」と進捗の試行ログ)。
 * 余白 1px・入力欄の高さ 1px・行送り 1px のいずれも 0.5% を超えて落ちる。
 * 一方、色そのものの取り違えと軸の 1px ずれはこの閾値を通ってしまうため、
 * 下の「トークン」と「SVG の幾何」で別途、値として直接検証する。
 */
const PIXEL_COLOR_THRESHOLD = 0.3;

/** 領域ごとのピクセル不一致率の上限(完了条件 6)。 */
const PIXEL_MISMATCH_LIMIT = 0.005;

// file:// では type="module" のスクリプトが CORS で読み込めないため、
// 静的ファイルサーバーを立てて http 経由で提供する。
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function startStaticServer(rootPath) {
  const server = http.createServer((req, res) => {
    const requestPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = path.join(rootPath, requestPath);
    if (!filePath.startsWith(rootPath)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function px(n) {
  return `${n}px`;
}

let server;
let pageUrl;
let browser;
let page;
/** 読み込みで発生した外部ホストへのリクエスト(完了条件 9)。 */
const externalRequests = [];
const pageErrors = [];

before(async () => {
  server = await startStaticServer(srcDir);
  pageUrl = `http://127.0.0.1:${server.address().port}/vector.html`;
  browser = await chromium.launch();
  page = await browser.newPage({
    viewport: { width: figma.canvas.width, height: figma.canvas.height },
  });
  page.on('request', (request) => {
    if (!request.url().startsWith(`http://127.0.0.1:${server.address().port}/`)) {
      externalRequests.push(request.url());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  await page.goto(pageUrl);
  await page.evaluate(() => globalThis.document.fonts.ready);
});

after(async () => {
  // browser 起動前に失敗した場合でもサーバーは確実に閉じる
  try {
    if (browser) await browser.close();
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
});

async function computedStyle(selector, props) {
  return page.$eval(
    selector,
    (el, props) => {
      const style = globalThis.getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = style[p];
      return out;
    },
    props
  );
}

/** ベクトルを計算し、数値結果の文字列を返す。 */
async function calculate({ ax, ay, bx, by }) {
  await page.fill('#vec-a-x', String(ax));
  await page.fill('#vec-a-y', String(ay));
  await page.fill('#vec-b-x', String(bx));
  await page.fill('#vec-b-y', String(by));
  await page.click('#vec-add-calculate');
  return page.$eval('#vec-add-result', (el) => el.textContent.trim());
}

// --- 構造 ---

test('ベクトル A・B の数値入力が 4 つある', async () => {
  const ids = await page.$$eval('input[type="number"]', (els) => els.map((el) => el.id));
  assert.deepEqual(ids, ['vec-a-x', 'vec-a-y', 'vec-b-x', 'vec-b-y']);
});

test('計算ボタンと数値結果と SVG がある', async () => {
  assert.equal(await page.$$eval('#vec-add-calculate', (els) => els.length), 1);
  assert.equal(await page.$$eval('#vec-add-result', (els) => els.length), 1);
  assert.equal(await page.$$eval('#vec-add-canvas', (els) => els.length), 1);
});

test('数値結果はライブリージョンとして通知される', async () => {
  const attrs = await page.$eval('#vec-add-result', (el) => ({
    role: el.getAttribute('role'),
    ariaLive: el.getAttribute('aria-live'),
  }));
  assert.equal(attrs.role, 'status');
  assert.equal(attrs.ariaLive, 'polite');
});

test('入力欄はラベルと結び付いている', async () => {
  const labelled = await page.$$eval('input[type="number"]', (els) =>
    els.map((el) => Boolean(globalThis.document.querySelector(`label[for="${el.id}"]`)))
  );
  assert.deepEqual(labelled, [true, true, true, true]);
});

test('ページの読み込みでエラーが出ない', () => {
  assert.deepEqual(pageErrors, []);
});

test('外部ホストへリクエストしない(完了条件 9)', () => {
  assert.deepEqual(externalRequests, []);
});

// --- トークン: 抽出 JSON との一致 ---

test('canvas: 背景色', async () => {
  const style = await computedStyle('body', ['backgroundColor']);
  assert.equal(style.backgroundColor, hexToRgb(figma.canvas.fill));
});

test('headerBar: 塗り / 高さ / パディング', async () => {
  const el = figma.elements.headerBar;
  const style = await computedStyle('.header-bar', [
    'backgroundColor',
    'height',
    'paddingLeft',
    'paddingRight',
  ]);
  assert.equal(style.backgroundColor, hexToRgb(el.fill));
  assert.equal(style.height, px(el.height));
  assert.equal(style.paddingLeft, px(el.padding.left));
  assert.equal(style.paddingRight, px(el.padding.right));
});

test('headerBar: ロゴ / タイトル / サブタイトル / バッジ', async () => {
  const el = figma.elements.headerBar;

  const logo = await computedStyle('.logo', ['backgroundColor', 'width', 'height', 'borderRadius']);
  assert.equal(logo.backgroundColor, hexToRgb(el.logo.fill));
  assert.equal(logo.width, px(el.logo.width));
  assert.equal(logo.height, px(el.logo.height));
  assert.equal(logo.borderRadius, px(el.logo.borderRadius));

  for (const [selector, token] of [
    ['.header-title', el.title],
    ['.header-subtitle', el.subtitle],
    ['.status-badge', el.statusBadge.label],
  ]) {
    const style = await computedStyle(selector, ['color', 'fontSize', 'fontWeight', 'lineHeight']);
    assert.equal(style.color, hexToRgb(token.color), selector);
    assert.equal(style.fontSize, px(token.fontSize), selector);
    assert.equal(Number(style.fontWeight), token.fontWeight, selector);
    assert.equal(style.lineHeight, px(token.lineHeight), selector);
  }

  const badge = await computedStyle('.status-badge', [
    'backgroundColor',
    'borderRadius',
    'paddingTop',
    'paddingLeft',
  ]);
  assert.equal(badge.backgroundColor, hexToRgb(el.statusBadge.fill));
  assert.equal(badge.borderRadius, px(el.statusBadge.borderRadius));
  assert.equal(badge.paddingTop, px(el.statusBadge.padding.top));
  assert.equal(badge.paddingLeft, px(el.statusBadge.padding.left));
});

test('layout: カラム幅とギャップ', async () => {
  const el = figma.elements.layout;
  const wrapper = await computedStyle('.content-wrapper', ['gap', 'paddingTop', 'paddingLeft']);
  assert.equal(wrapper.gap, px(el.columnGap));
  assert.equal(wrapper.paddingTop, px(el.padding.top));
  assert.equal(wrapper.paddingLeft, px(el.padding.left));

  const left = await computedStyle('.left-column', ['width', 'gap']);
  assert.equal(left.width, px(el.leftColumnWidth));
  assert.equal(left.gap, px(el.leftColumnGap));

  const right = await computedStyle('.right-column', ['width']);
  assert.equal(right.width, px(el.rightColumnWidth));
});

test('card: 塗り / 角丸 / パディング / 内側の枠線', async () => {
  const el = figma.elements.card;
  for (const selector of ['.input-card', '.results-card', '.graph-card']) {
    const style = await computedStyle(selector, [
      'backgroundColor',
      'borderRadius',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'boxShadow',
    ]);
    assert.equal(style.backgroundColor, hexToRgb(el.fill), selector);
    assert.equal(style.borderRadius, px(el.borderRadius), selector);
    assert.equal(style.paddingTop, px(el.padding.top), selector);
    assert.equal(style.paddingRight, px(el.padding.right), selector);
    assert.equal(style.paddingBottom, px(el.padding.bottom), selector);
    assert.equal(style.paddingLeft, px(el.padding.left), selector);
    // Figma は内側ストローク。内寸を減らさないよう inset の影で描く。
    assert.ok(
      style.boxShadow.includes('inset'),
      `${selector}: 内側ストロークが inset の影で描かれていない (${style.boxShadow})`
    );
    assert.ok(
      style.boxShadow.includes(hexToRgb(el.border.color)),
      `${selector}: 枠線の色が ${el.border.color} でない (${style.boxShadow})`
    );
  }
});

test('inputCard: 見出し / ヒント / ベクトル名 / ラベル / 入力欄 / ボタン', async () => {
  const el = figma.elements.inputCard;

  for (const [selector, token] of [
    ['.input-card .card-title', el.cardTitle],
    ['.input-card .card-hint', el.cardHint],
    ['.input-card .vector-name', el.vectorName],
    ['.input-card .field-label', el.fieldLabel],
  ]) {
    const style = await computedStyle(selector, ['color', 'fontSize', 'fontWeight', 'lineHeight']);
    assert.equal(style.color, hexToRgb(token.color), selector);
    assert.equal(style.fontSize, px(token.fontSize), selector);
    assert.equal(Number(style.fontWeight), token.fontWeight, selector);
    assert.equal(style.lineHeight, px(token.lineHeight), selector);
  }

  const input = await computedStyle('#vec-a-x', [
    'backgroundColor',
    'height',
    'width',
    'borderRadius',
    'paddingLeft',
    'paddingRight',
    'color',
    'fontSize',
    'fontWeight',
  ]);
  assert.equal(input.backgroundColor, hexToRgb(el.fieldInput.fill));
  assert.equal(input.height, px(el.fieldInput.height));
  assert.equal(input.width, px(el.fieldInput.width));
  assert.equal(input.borderRadius, px(el.fieldInput.borderRadius));
  assert.equal(input.paddingLeft, px(el.fieldInput.padding.left));
  assert.equal(input.paddingRight, px(el.fieldInput.padding.right));
  assert.equal(input.color, hexToRgb(el.fieldInput.color));
  assert.equal(input.fontSize, px(el.fieldInput.fontSize));
  assert.equal(Number(input.fontWeight), el.fieldInput.fontWeight);

  const button = await computedStyle('#vec-add-calculate', [
    'backgroundColor',
    'width',
    'height',
    'borderRadius',
    'color',
    'fontSize',
    'fontWeight',
  ]);
  assert.equal(button.backgroundColor, hexToRgb(el.calcButton.fill));
  assert.equal(button.width, px(el.calcButton.width));
  assert.equal(button.height, px(el.calcButton.height));
  assert.equal(button.borderRadius, px(el.calcButton.borderRadius));
  assert.equal(button.color, hexToRgb(el.calcButton.label.color));
  assert.equal(button.fontSize, px(el.calcButton.label.fontSize));
  assert.equal(Number(button.fontWeight), el.calcButton.label.fontWeight);
});

test('inputCard: ベクトルの色ドット', async () => {
  const vectors = figma.elements.graphCard.vectors;
  const dotA = await computedStyle('.vector-dot-a', ['backgroundColor', 'width', 'height']);
  assert.equal(dotA.backgroundColor, hexToRgb(vectors.a.stroke));
  assert.equal(dotA.width, px(figma.elements.inputCard.vectorDot.width));
  assert.equal(dotA.height, px(figma.elements.inputCard.vectorDot.height));

  const dotB = await computedStyle('.vector-dot-b', ['backgroundColor']);
  assert.equal(dotB.backgroundColor, hexToRgb(vectors.b.stroke));
});

test('resultsCard: 見出し / 行 / ラベル / 値', async () => {
  const el = figma.elements.resultsCard;

  const title = await computedStyle('.results-card .card-title', [
    'color',
    'fontSize',
    'fontWeight',
    'lineHeight',
  ]);
  assert.equal(title.color, hexToRgb(el.cardTitle.color));
  assert.equal(title.fontSize, px(el.cardTitle.fontSize));
  assert.equal(Number(title.fontWeight), el.cardTitle.fontWeight);
  assert.equal(title.lineHeight, px(el.cardTitle.lineHeight));

  const row = await computedStyle('.result-row', [
    'paddingTop',
    'paddingBottom',
    'borderBottomColor',
    'borderBottomWidth',
    'borderBottomStyle',
  ]);
  assert.equal(row.paddingTop, px(el.resultRow.padding.top));
  assert.equal(row.paddingBottom, px(el.resultRow.padding.bottom));
  assert.equal(row.borderBottomColor, hexToRgb(el.resultRow.borderBottom.color));
  assert.equal(row.borderBottomWidth, px(el.resultRow.borderBottom.width));
  assert.equal(row.borderBottomStyle, el.resultRow.borderBottom.style);

  for (const [selector, token] of [
    ['.result-label', el.resultLabel],
    ['#vec-add-result', el.resultValue],
  ]) {
    const style = await computedStyle(selector, ['color', 'fontSize', 'fontWeight', 'lineHeight']);
    assert.equal(style.color, hexToRgb(token.color), selector);
    assert.equal(style.fontSize, px(token.fontSize), selector);
    assert.equal(Number(style.fontWeight), token.fontWeight, selector);
    assert.equal(style.lineHeight, px(token.lineHeight), selector);
  }
});

test('resultsCard: 加算の 1 行だけを描く(範囲外を実装していない)', async () => {
  const labels = await page.$$eval('.result-row .result-label', (els) =>
    els.map((el) => el.textContent.trim())
  );
  assert.deepEqual(labels, [figma.elements.resultsCard.resultLabel.text]);
});

test('graphCard: 見出し / ヒント / 作業領域 / グリッド', async () => {
  const el = figma.elements.graphCard;

  for (const [selector, token] of [
    ['.graph-card .card-title', el.cardTitle],
    ['.graph-card .card-hint', el.cardHint],
  ]) {
    const style = await computedStyle(selector, ['color', 'fontSize', 'fontWeight', 'lineHeight']);
    assert.equal(style.color, hexToRgb(token.color), selector);
    assert.equal(style.fontSize, px(token.fontSize), selector);
    assert.equal(Number(style.fontWeight), token.fontWeight, selector);
    assert.equal(style.lineHeight, px(token.lineHeight), selector);
  }

  const workspace = await computedStyle('.graph-workspace-row', ['height']);
  assert.equal(workspace.height, px(el.workspaceRow.height));

  const grid = await computedStyle('.grid-container', ['width', 'height', 'marginTop']);
  assert.equal(grid.width, px(el.grid.width));
  assert.equal(grid.height, px(el.grid.height));
  assert.equal(grid.marginTop, px(el.grid.offsetTop));
});

test('graphCard: グリッド線と軸のストローク', async () => {
  const el = figma.elements.graphCard;
  const gridLine = await computedStyle('.grid-lines line', ['stroke', 'strokeWidth']);
  assert.equal(gridLine.stroke, hexToRgb(el.grid.gridLine.stroke));
  assert.equal(gridLine.strokeWidth, px(el.grid.gridLine.strokeWidth));

  const axis = await computedStyle('.axis', ['stroke', 'strokeWidth']);
  assert.equal(axis.stroke, hexToRgb(el.grid.axis.stroke));
  assert.equal(axis.strokeWidth, px(el.grid.axis.strokeWidth));

  const tick = await computedStyle('.tick-labels text', ['fill', 'fontSize', 'fontWeight']);
  assert.equal(tick.fill, hexToRgb(el.grid.tickLabel.color));
  assert.equal(tick.fontSize, px(el.grid.tickLabel.fontSize));
  assert.equal(Number(tick.fontWeight), el.grid.tickLabel.fontWeight);
});

test('graphCard: 凡例', async () => {
  const el = figma.elements.graphCard.legend;
  const box = await computedStyle('.floating-legend', [
    'top',
    'left',
    'borderRadius',
    'paddingTop',
    'gap',
    'borderColor',
    'borderWidth',
    'backgroundColor',
    'backdropFilter',
  ]);
  assert.equal(box.top, px(el.offsetTop));
  assert.equal(box.left, px(el.offsetLeft));
  assert.equal(box.borderRadius, px(el.borderRadius));
  assert.equal(box.paddingTop, px(el.padding.top));
  assert.equal(box.gap, px(el.gap));
  assert.equal(box.borderColor, hexToRgb(el.border.color));
  assert.equal(box.borderWidth, px(el.border.width));
  assert.equal(box.backgroundColor, el.fill);
  assert.equal(box.backdropFilter, `blur(${el.backdropBlur}px)`);

  const label = await computedStyle('#legend-a', ['color', 'fontSize', 'fontWeight', 'lineHeight']);
  assert.equal(label.color, hexToRgb(el.label.color));
  assert.equal(label.fontSize, px(el.label.fontSize));
  assert.equal(Number(label.fontWeight), el.label.fontWeight);
  assert.equal(label.lineHeight, px(el.label.lineHeight));

  const sumLabel = await computedStyle('#legend-sum', ['color', 'fontWeight']);
  assert.equal(sumLabel.color, hexToRgb(el.sumLabel.color));
  assert.equal(Number(sumLabel.fontWeight), el.sumLabel.fontWeight);
});

// --- SVG の幾何(ピクセル比較の閾値では捕まらない 1px のずれを、値として直接見る) ---

test('SVG: 軸は抽出 JSON の実測位置に引かれている', async () => {
  const { axis, width, height } = figma.elements.graphCard.grid;
  const axes = await page.$$eval('#axes line', (els) =>
    els.map((el) => ({
      x1: Number(el.getAttribute('x1')),
      y1: Number(el.getAttribute('y1')),
      x2: Number(el.getAttribute('x2')),
      y2: Number(el.getAttribute('y2')),
    }))
  );
  // 期待値は抽出 JSON から引く。実装のリテラルを写さない。
  assert.deepEqual(axes[0], { x1: axis.centerX, y1: 0, x2: axis.centerX, y2: height });
  assert.deepEqual(axes[1], { x1: 0, y1: axis.centerY, x2: width, y2: axis.centerY });
});

test('SVG: グリッドの外枠が抽出 JSON のトークンどおり', async () => {
  const { frame } = figma.elements.graphCard.grid;
  const style = await computedStyle('.grid-frame', ['stroke', 'strokeWidth']);
  assert.equal(style.stroke, hexToRgb(frame.stroke));
  assert.equal(style.strokeWidth, px(frame.strokeWidth));
  const rx = await page.$eval('.grid-frame', (el) => el.getAttribute('rx'));
  assert.equal(Number(rx), frame.borderRadius);
});

test('SVG: グリッド線は ±1..±6 の 12 本ずつで、半ピクセルに載る', async () => {
  const { unitPx, originX, axisRange } = figma.elements.graphCard.grid;
  const lines = await page.$$eval('#grid-lines line', (els) =>
    els.map((el) => ({
      x1: Number(el.getAttribute('x1')),
      y1: Number(el.getAttribute('y1')),
      x2: Number(el.getAttribute('x2')),
      y2: Number(el.getAttribute('y2')),
    }))
  );
  assert.equal(lines.length, axisRange * 2 * 2);

  const lattice = (origin) => {
    const out = [];
    for (let unit = -axisRange; unit <= axisRange; unit++) {
      if (unit === 0) continue;
      out.push(origin + unitPx * unit + 0.5);
    }
    return out;
  };

  const gridLine = figma.elements.graphCard.grid.gridLine;
  const vertical = lines
    .filter((l) => l.x1 === l.x2)
    .map((l) => l.x1)
    .sort((a, b) => a - b);
  assert.deepEqual(vertical, lattice(gridLine.originX), '縦グリッド線');

  // 横線のラティスは y 側だけ 1px 上にある(抽出 JSON の gridLine.originY)。
  // ここを見ていないと、軸だけ直してグリッドを直し忘れる形がすり抜ける。
  const horizontal = lines
    .filter((l) => l.y1 === l.y2)
    .map((l) => l.y1)
    .sort((a, b) => a - b);
  assert.deepEqual(horizontal, lattice(gridLine.originY), '横グリッド線');

  // originX は spec の座標規則(矢印・目盛りが使う原点)と一致していること
  assert.equal(gridLine.originX, originX);
});

test('SVG: 目盛りラベルは抽出 JSON の位置規則どおり', async () => {
  const { unitPx, originX, originY, tickLabel } = figma.elements.graphCard.grid;
  const labels = await page.$$eval('#tick-labels text', (els) =>
    els.map((el) => ({
      text: el.textContent,
      x: Number(el.getAttribute('x')),
      y: Number(el.getAttribute('y')),
      anchor: el.getAttribute('text-anchor'),
    }))
  );
  const xOne = labels.find((l) => l.text === '1' && l.anchor === 'start');
  assert.equal(xOne.x, originX + unitPx * 1 + tickLabel.xOffsetFromGridLine);
  assert.equal(xOne.y, tickLabel.xBaselineTop + tickLabel.lineHeight / 2);

  const yOne = labels.find((l) => l.text === '1' && l.anchor === 'end');
  assert.equal(yOne.x, tickLabel.yRightEdge);
  assert.equal(yOne.y, originY - unitPx * 1);
});

test('描画された 1px 要素の色と位置を実ピクセルで確かめる', async () => {
  // グリッド枠・軸・グリッド線は低コントラストの 1px で、pixelmatch の色許容差では
  // 位置ずれも色違いも判定を跨がない(閾値 0.1 に戻しても同じ)。
  // 計算スタイルだけでは display:none や要素の消失も捕まらないので、
  // 実際に描かれたピクセルを名指しで確かめる。
  await page.reload();
  await page.evaluate(() => globalThis.document.fonts.ready);
  const shot = PNG.sync.read(await page.screenshot());
  const svg = await page.$eval('#vec-add-canvas', (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y) };
  });
  const hexAt = (sx, sy) => {
    const i = (shot.width * (svg.y + sy) + (svg.x + sx)) << 2;
    return (
      '#' +
      [0, 1, 2].map((k) => shot.data[i + k].toString(16).padStart(2, '0')).join('')
    );
  };
  const { grid } = figma.elements.graphCard;
  const { unitPx } = grid;
  // 枠線: SVG 座標 x=0 の縦辺(角丸を避けて中ほどを見る)
  assert.equal(hexAt(0, 400), grid.frame.stroke, 'グリッド枠');
  // 縦軸: インクは列 centerX-1 と centerX
  assert.equal(hexAt(grid.axis.centerX, 100), grid.axis.stroke, '縦軸');
  // 横軸: インクは行 centerY-1 と centerY
  assert.equal(hexAt(100, grid.axis.centerY), grid.axis.stroke, '横軸');
  // 縦グリッド線 (unit +1) と横グリッド線 (unit -6)
  assert.equal(hexAt(grid.gridLine.originX + unitPx, 100), grid.gridLine.stroke, '縦グリッド線');
  // 横グリッド線のサンプル点は凡例(左上に absolute で重なる)の外に取る。
  // 凡例は計算後にラベルが伸びるので、左寄りの座標だと誤検出しうる。
  assert.equal(
    hexAt(400, grid.gridLine.originY - unitPx * 6),
    grid.gridLine.stroke,
    '横グリッド線'
  );
});

test('SVG: 初期状態では矢印を描かない', async () => {
  await page.reload();
  await page.evaluate(() => globalThis.document.fonts.ready);
  assert.equal(await page.$$eval('#vector-arrows line', (els) => els.length), 0);
  assert.equal(await page.$eval('#vec-add-result', (el) => el.textContent.trim()), '—');

  // 未計算のうちは凡例も値を持たない。マークアップに和を焼き込むと
  // 「結果は — なのに凡例には和がある」という食い違いになり、
  // その和は addVec の戻り値でもない(完了条件 5)。
  const legendTexts = await page.$$eval('.legend-label', (els) =>
    els.map((el) => el.textContent.trim())
  );
  assert.deepEqual(legendTexts, ['ベクトル A', 'ベクトル B', 'A + B']);
});

test('SVG: 矢印の終点が座標規則どおり (完了条件 8)', async () => {
  const { unitPx, originX, originY } = figma.elements.graphCard.grid;
  await calculate({ ax: 2, ay: 3, bx: 4, by: 5 });
  const lines = await page.$$eval('#vector-arrows line', (els) =>
    els.map((el) => ({
      cls: el.getAttribute('class'),
      x1: Number(el.getAttribute('x1')),
      y1: Number(el.getAttribute('y1')),
      x2: Number(el.getAttribute('x2')),
      y2: Number(el.getAttribute('y2')),
    }))
  );
  assert.equal(lines.length, 3);
  const at = (x, y) => ({ x: originX + unitPx * x, y: originY - unitPx * y });
  const cases = [
    ['vector-line-a', 2, 3],
    ['vector-line-b', 4, 5],
    ['vector-line-sum', 6, 8],
  ];
  for (const [cls, x, y] of cases) {
    const line = lines.find((l) => l.cls === cls);
    const end = at(x, y);
    assert.equal(line.x1, originX, cls);
    assert.equal(line.y1, originY, cls);
    assert.equal(line.x2, end.x, cls);
    assert.equal(line.y2, end.y, cls);
  }
  // y は上向きが正(画面座標では反転する)
  assert.ok(lines.find((l) => l.cls === 'vector-line-sum').y2 < originY);
});

test('SVG: 負の成分でも座標規則どおり (完了条件 8)', async () => {
  const { unitPx, originX, originY } = figma.elements.graphCard.grid;
  await calculate({ ax: -4, ay: -6, bx: 1, by: 2 });
  const sum = await page.$eval('.vector-line-sum', (el) => ({
    x2: Number(el.getAttribute('x2')),
    y2: Number(el.getAttribute('y2')),
  }));
  assert.equal(sum.x2, originX + unitPx * -3);
  assert.equal(sum.y2, originY - unitPx * -4);
});

test('SVG: 和は破線で、3 本の stroke は抽出 JSON の色', async () => {
  const vectors = figma.elements.graphCard.vectors;
  for (const [selector, token] of [
    ['.vector-line-a', vectors.a],
    ['.vector-line-b', vectors.b],
    ['.vector-line-sum', vectors.sum],
  ]) {
    const style = await computedStyle(selector, ['stroke', 'strokeWidth', 'strokeDasharray']);
    assert.equal(style.stroke, hexToRgb(token.stroke), selector);
    assert.equal(style.strokeWidth, px(token.strokeWidth), selector);
    if (token.dash) {
      assert.equal(style.strokeDasharray, token.dash.map(px).join(', '), selector);
    } else {
      assert.equal(style.strokeDasharray, 'none', selector);
    }
  }
});

test('SVG: 各矢印は両端に矢じりを持つ', async () => {
  const markers = await page.$$eval('#vector-arrows line', (els) =>
    els.map((el) => ({
      start: el.getAttribute('marker-start'),
      end: el.getAttribute('marker-end'),
    }))
  );
  assert.equal(markers.length, 3);
  for (const m of markers) {
    assert.ok(m.start && m.start.startsWith('url(#arrowhead-'));
    assert.ok(m.end && m.end.startsWith('url(#arrowhead-'));
  }
});

// --- 例: 仕様の「例」表 ---

test('A (2, 3)、B (4, 5) → (6, 8)', async () => {
  assert.equal(await calculate({ ax: 2, ay: 3, bx: 4, by: 5 }), '(6, 8)');
});

test('A (-1.5, 0.5)、B (0.5, -0.5) → (-1, 0)', async () => {
  assert.equal(await calculate({ ax: -1.5, ay: 0.5, bx: 0.5, by: -0.5 }), '(-1, 0)');
});

test('A (0, 0)、B (0, 0) → (0, 0)', async () => {
  assert.equal(await calculate({ ax: 0, ay: 0, bx: 0, by: 0 }), '(0, 0)');
});

test('A (-4, -6)、B (1, 2) → (-3, -4)', async () => {
  assert.equal(await calculate({ ax: -4, ay: -6, bx: 1, by: 2 }), '(-3, -4)');
});

test('A (3, 4)、B (-1, 2) → (2, 6) (Figma の既定値)', async () => {
  assert.equal(await calculate({ ax: 3, ay: 4, bx: -1, by: 2 }), '(2, 6)');
});

test('空欄のまま計算すると (0, 0)', async () => {
  assert.equal(await calculate({ ax: '', ay: '', bx: '', by: '' }), '(0, 0)');
});

test('非数(badInput)を入れても 0 として計算される', async () => {
  // type=number は `-` や `1e` を編集中の値として受けるが、value は空文字で読める。
  // novalidate が無いとネイティブ検証が submit を止め、結果が前の値のまま残る。
  await page.reload();
  await page.evaluate(() => globalThis.document.fonts.ready);
  for (const id of ['#vec-a-x', '#vec-a-y', '#vec-b-x', '#vec-b-y']) await page.fill(id, '');
  await page.click('#vec-a-x');
  await page.keyboard.type('-');
  // 他の 3 欄は空 => 0。`-` も非数なので 0。よって和は (0, 0)。
  // novalidate が無いと submit が発火せず、初期表示の `—` のまま残って落ちる。
  await page.click('#vec-add-calculate');
  assert.equal(await page.$eval('#vec-add-result', (el) => el.textContent.trim()), '(0, 0)');
});

test('入力欄で Enter を押しても計算される', async () => {
  await page.fill('#vec-a-x', '7');
  await page.fill('#vec-a-y', '8');
  await page.fill('#vec-b-x', '1');
  await page.fill('#vec-b-y', '1');
  await page.press('#vec-b-y', 'Enter');
  assert.equal(await page.$eval('#vec-add-result', (el) => el.textContent.trim()), '(8, 9)');
});

test('計算すると凡例が実際の値を映す', async () => {
  await calculate({ ax: 3, ay: 4, bx: -1, by: 2 });
  const texts = await page.$$eval('.legend-label', (els) => els.map((el) => el.textContent.trim()));
  assert.deepEqual(texts, ['ベクトル A (3, 4)', 'ベクトル B (-1, 2)', 'A + B (2, 6)']);
});

// --- 残差以外の視覚検証: 領域ごとのピクセル不一致率(完了条件 6) ---

test('抽出 PNG との領域ごとのピクセル不一致率が 0.5% 以下である', async () => {
  // Figma の既定値と同じ状態にしてから比較する
  await page.reload();
  await page.evaluate(() => globalThis.document.fonts.ready);
  await calculate({ ax: 3, ay: 4, bx: -1, by: 2 });

  const actual = PNG.sync.read(await page.screenshot());
  const expected = PNG.sync.read(fs.readFileSync(referencePngPath));
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);

  const cropRegion = (png, r) => {
    const out = new PNG({ width: r.width, height: r.height });
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        const si = (png.width * (r.y + y) + (r.x + x)) << 2;
        const di = (out.width * y + x) << 2;
        for (let k = 0; k < 4; k++) out.data[di + k] = png.data[si + k];
      }
    }
    return out;
  };

  // TEMP-DIAG: CI(ubuntu)の実測値を採るための一時計測。値が決まったら消す。
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
    const row = [];
    for (const [name, region] of Object.entries(figma.pixelRegions)) {
      const a = cropRegion(actual, region);
      const b = cropRegion(expected, region);
      const d = new PNG({ width: region.width, height: region.height });
      const n = pixelmatch(a.data, b.data, d.data, region.width, region.height, { threshold: t });
      row.push(`${name}=${((n / (region.width * region.height)) * 100).toFixed(3)}%`);
    }
    console.error(`TEMP-DIAG threshold=${t} ${row.join(' ')}`);
  }

  const failures = [];
  for (const [name, region] of Object.entries(figma.pixelRegions)) {
    const a = cropRegion(actual, region);
    const b = cropRegion(expected, region);
    const diff = new PNG({ width: region.width, height: region.height });
    const mismatched = pixelmatch(a.data, b.data, diff.data, region.width, region.height, {
      threshold: PIXEL_COLOR_THRESHOLD,
    });
    const ratio = mismatched / (region.width * region.height);
    // 差分画像は作業ディレクトリに置く(.gitignore の `**/*.diff.png` が拾う)
    fs.writeFileSync(
      path.join(path.dirname(referencePngPath), `calc-vec-add-${name}.diff.png`),
      PNG.sync.write(diff)
    );
    if (ratio > PIXEL_MISMATCH_LIMIT) {
      failures.push(`${name}: ${(ratio * 100).toFixed(3)}%`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `ピクセル不一致率が 0.5% を超えている領域がある(task/calc-vec-add.diff-*.png を参照): ${failures.join(', ')}`
  );
});
