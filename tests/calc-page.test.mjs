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

// この作業が完了すると progress/calc-page.* は progress/archive/ へ移動する
// (CLAUDE.md の アーカイブ 手順)。テストコードは以後変更しない方針なので、
// どちらの場所にあっても見つかるようにしておく。
function resolveProgressFixture(filename) {
  const livePath = path.join(rootDir, 'progress', filename);
  if (fs.existsSync(livePath)) return livePath;
  return path.join(rootDir, 'progress', 'archive', filename);
}

const figma = JSON.parse(
  fs.readFileSync(resolveProgressFixture('calc-page.figma.json'), 'utf8')
);
const referencePngPath = resolveProgressFixture('calc-page.png');

// file:// では type="module" のスクリプトが CORS で読み込めないため、
// 静的ファイルサーバーを立てて http 経由で提供する。
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
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

let server;
let pageUrl;

// トークン表 (progress/calc-page.figma.json) にあるフォントウェイト名を CSS の font-weight 数値と対応させる
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

let browser;
let page;

before(async () => {
  server = await startStaticServer(srcDir);
  pageUrl = `http://127.0.0.1:${server.address().port}/calc.html`;
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: figma.canvas.width, height: figma.canvas.height } });
  await page.goto(pageUrl);
});

after(async () => {
  // browser 起動前に失敗した場合でもサーバーは確実に閉じる(片方の失敗で
  // もう片方の後始末が飛ばないようにする)
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
      const style = getComputedStyle(el);
      const out = {};
      for (const p of props) out[p] = style[p];
      return out;
    },
    props
  );
}

async function pseudoComputedStyle(selector, pseudo, props) {
  return page.$eval(
    selector,
    (el, [pseudo, props]) => {
      const style = getComputedStyle(el, pseudo);
      const out = {};
      for (const p of props) out[p] = style[p];
      return out;
    },
    [pseudo, props]
  );
}

// --- 構造 ---

test('数値を入力できる欄が 2 つある', async () => {
  const count = await page.$$eval('input[type="number"]', (els) => els.length);
  assert.equal(count, 2);
});

test('足し算と引き算を選択できる操作がある', async () => {
  const ops = await page.$$eval('.operation', (els) =>
    els.map((el) => el.dataset.op)
  );
  assert.deepEqual(ops.sort(), ['add', 'sub']);
});

test('計算ボタンがある', async () => {
  const count = await page.$$eval('#calculate', (els) => els.length);
  assert.equal(count, 1);
});

test('結果表示がある', async () => {
  const count = await page.$$eval('#result', (els) => els.length);
  assert.equal(count, 1);
});

// --- トークン: 色・角丸・パディング・ギャップ・幅・高さ ---

test('container: fill / border / borderRadius / padding / width', async () => {
  const style = await computedStyle('.container', [
    'backgroundColor',
    'borderColor',
    'borderWidth',
    'borderStyle',
    'borderRadius',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'width',
  ]);
  const el = figma.elements.container;
  assert.equal(style.backgroundColor, hexToRgb(el.fill));
  assert.equal(style.borderColor, hexToRgb(el.border.color));
  assert.equal(style.borderWidth, px(el.border.width));
  assert.equal(style.borderStyle, el.border.style);
  assert.equal(style.borderRadius, px(el.borderRadius));
  assert.equal(style.paddingTop, px(el.padding.top));
  assert.equal(style.paddingRight, px(el.padding.right));
  assert.equal(style.paddingBottom, px(el.padding.bottom));
  assert.equal(style.paddingLeft, px(el.padding.left));
  assert.equal(style.width, px(el.width));
});

test('calculator: gap / width', async () => {
  const style = await computedStyle('.calculator', ['gap', 'width']);
  const el = figma.elements.calculatorUi;
  assert.equal(style.gap, px(el.gap));
  assert.equal(style.width, px(el.width));
});

test('title: color / fontSize / fontWeight', async () => {
  const style = await computedStyle('.calculator-title', ['color', 'fontSize', 'fontWeight']);
  const el = figma.elements.title;
  assert.equal(style.color, hexToRgb(el.color));
  assert.equal(style.fontSize, px(el.fontSize));
  assert.equal(Number(style.fontWeight), el.fontWeight);
});

test('inputs: gap / width', async () => {
  const style = await computedStyle('.inputs', ['gap', 'width']);
  const el = figma.elements.inputs;
  assert.equal(style.gap, px(el.gap));
  assert.equal(style.width, px(el.width));
});

for (const [selector, key] of [
  ['#number1', 'fieldNumber1'],
  ['#number2', 'fieldNumber2'],
]) {
  test(`${key}: field の gap / width、input の fill / border / borderRadius / padding / width / height`, async () => {
    const fieldEl = figma.elements[key];
    const fieldSelector = `${selector} >> xpath=..`;
    const fieldStyle = await computedStyle(fieldSelector, ['gap', 'width']);
    assert.equal(fieldStyle.gap, px(fieldEl.gap));
    assert.equal(fieldStyle.width, px(fieldEl.width));

    const inputEl = fieldEl.input;
    const inputStyle = await computedStyle(selector, [
      'backgroundColor',
      'borderColor',
      'borderWidth',
      'borderStyle',
      'borderRadius',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'width',
      'height',
    ]);
    assert.equal(inputStyle.backgroundColor, hexToRgb(inputEl.fill));
    assert.equal(inputStyle.borderColor, hexToRgb(inputEl.border.color));
    assert.equal(inputStyle.borderWidth, px(inputEl.border.width));
    assert.equal(inputStyle.borderStyle, inputEl.border.style);
    assert.equal(inputStyle.borderRadius, px(inputEl.borderRadius));
    assert.equal(inputStyle.paddingTop, px(inputEl.padding.top));
    assert.equal(inputStyle.paddingRight, px(inputEl.padding.right));
    assert.equal(inputStyle.paddingBottom, px(inputEl.padding.bottom));
    assert.equal(inputStyle.paddingLeft, px(inputEl.padding.left));
    assert.equal(inputStyle.width, px(inputEl.width));
    assert.equal(inputStyle.height, px(inputEl.height));

    const placeholderStyle = await pseudoComputedStyle(selector, '::placeholder', [
      'color',
      'fontSize',
      'fontWeight',
    ]);
    assert.equal(placeholderStyle.color, hexToRgb(inputEl.placeholder.color));
    assert.equal(placeholderStyle.fontSize, px(inputEl.placeholder.fontSize));
    assert.equal(Number(placeholderStyle.fontWeight), inputEl.placeholder.fontWeight);
  });

  test(`${key}: label の color / fontSize / fontWeight`, async () => {
    const el = figma.elements[key].label;
    const labelSelector = `label[for="${selector.slice(1)}"]`;
    const style = await computedStyle(labelSelector, ['color', 'fontSize', 'fontWeight']);
    assert.equal(style.color, hexToRgb(el.color));
    assert.equal(style.fontSize, px(el.fontSize));
    assert.equal(Number(style.fontWeight), el.fontWeight);
  });
}

test('operationSelector: gap / width', async () => {
  const style = await computedStyle('.operation-selector', ['gap', 'width']);
  const el = figma.elements.operationSelector;
  assert.equal(style.gap, px(el.gap));
  assert.equal(style.width, px(el.width));
});

for (const [selector, key] of [
  ['#operation-add', 'operationAdd'],
  ['#operation-sub', 'operationSubtract'],
]) {
  test(`${key}: fill / border / borderRadius / padding / width / height / ラベル`, async () => {
    const el = figma.elements[key];
    const style = await computedStyle(selector, [
      'backgroundColor',
      'borderColor',
      'borderWidth',
      'borderStyle',
      'borderRadius',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'width',
      'height',
      'color',
      'fontSize',
      'fontWeight',
    ]);
    assert.equal(style.backgroundColor, hexToRgb(el.fill));
    assert.equal(style.borderColor, hexToRgb(el.border.color));
    assert.equal(style.borderWidth, px(el.border.width));
    assert.equal(style.borderStyle, el.border.style);
    assert.equal(style.borderRadius, px(el.borderRadius));
    assert.equal(style.paddingTop, px(el.padding.top));
    assert.equal(style.paddingRight, px(el.padding.right));
    assert.equal(style.paddingBottom, px(el.padding.bottom));
    assert.equal(style.paddingLeft, px(el.padding.left));
    assert.equal(style.width, px(el.width));
    assert.equal(style.height, px(el.height));
    assert.equal(style.color, hexToRgb(el.label.color));
    assert.equal(style.fontSize, px(el.label.fontSize));
    assert.equal(Number(style.fontWeight), el.label.fontWeight);
  });
}

test('calculateButton: fill / borderRadius / padding / width / height / ラベル', async () => {
  const el = figma.elements.calculateButton;
  const style = await computedStyle('#calculate', [
    'backgroundColor',
    'borderRadius',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'width',
    'height',
    'color',
    'fontSize',
    'fontWeight',
  ]);
  assert.equal(style.backgroundColor, hexToRgb(el.fill));
  assert.equal(style.borderRadius, px(el.borderRadius));
  assert.equal(style.paddingTop, px(el.padding.top));
  assert.equal(style.paddingRight, px(el.padding.right));
  assert.equal(style.paddingBottom, px(el.padding.bottom));
  assert.equal(style.paddingLeft, px(el.padding.left));
  assert.equal(style.width, px(el.width));
  assert.equal(style.height, px(el.height));
  assert.equal(style.color, hexToRgb(el.label.color));
  assert.equal(style.fontSize, px(el.label.fontSize));
  assert.equal(Number(style.fontWeight), el.label.fontWeight);
});

test('resultArea: gap / width / label / value', async () => {
  const el = figma.elements.resultArea;
  const areaStyle = await computedStyle('.result-area', ['gap', 'width']);
  assert.equal(areaStyle.gap, px(el.gap));
  assert.equal(areaStyle.width, px(el.width));

  const labelStyle = await computedStyle('.result-label', ['color', 'fontSize', 'fontWeight']);
  assert.equal(labelStyle.color, hexToRgb(el.label.color));
  assert.equal(labelStyle.fontSize, px(el.label.fontSize));
  assert.equal(Number(labelStyle.fontWeight), el.label.fontWeight);

  const valueStyle = await computedStyle('#result', ['color', 'fontSize', 'fontWeight']);
  assert.equal(valueStyle.color, hexToRgb(el.value.color));
  assert.equal(valueStyle.fontSize, px(el.value.fontSize));
  assert.equal(Number(valueStyle.fontWeight), el.value.fontWeight);
});

// --- 状態: 操作選択の見た目切り替え ---

test('初期状態は足し算が選択されている(見た目が operationAdd のトークン)', async () => {
  const pressed = await page.$eval('#operation-add', (el) => el.getAttribute('aria-pressed'));
  assert.equal(pressed, 'true');
  const style = await computedStyle('#operation-add', ['backgroundColor']);
  assert.equal(style.backgroundColor, hexToRgb(figma.elements.operationAdd.fill));
});

test('引き算を選ぶと選択状態が切り替わる', async () => {
  await page.click('#operation-sub');
  const addPressed = await page.$eval('#operation-add', (el) => el.getAttribute('aria-pressed'));
  const subPressed = await page.$eval('#operation-sub', (el) => el.getAttribute('aria-pressed'));
  assert.equal(addPressed, 'false');
  assert.equal(subPressed, 'true');
  const subStyle = await computedStyle('#operation-sub', ['backgroundColor']);
  assert.equal(subStyle.backgroundColor, hexToRgb(figma.elements.operationAdd.fill));
  // 選択解除された足し算は非選択トークン(operationSubtract の塗り)に戻る
  const addStyle = await computedStyle('#operation-add', ['backgroundColor']);
  assert.equal(addStyle.backgroundColor, hexToRgb(figma.elements.operationSubtract.fill));
  await page.click('#operation-add'); // 以降の例のために既定へ戻す
});

// --- レビュー指摘への対応 ---

test('演算ボタンは記号だけでなくアクセシブルネームを持つ', async () => {
  const addLabel = await page.$eval('#operation-add', (el) => el.getAttribute('aria-label'));
  const subLabel = await page.$eval('#operation-sub', (el) => el.getAttribute('aria-label'));
  assert.equal(addLabel, '足し算');
  assert.equal(subLabel, '引き算');
});

test('結果表示はライブリージョンとして通知される', async () => {
  const style = await page.$eval('#result', (el) => ({
    role: el.getAttribute('role'),
    ariaLive: el.getAttribute('aria-live'),
    ariaAtomic: el.getAttribute('aria-atomic'),
  }));
  assert.equal(style.role, 'status');
  assert.equal(style.ariaLive, 'polite');
  assert.equal(style.ariaAtomic, 'true');
});

test('Calculate ボタンをキーボードでフォーカスすると、白い縁を挟んだフォーカスリングが付く', async () => {
  await page.focus('#number1');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
  }
  const focused = await page.evaluate(() => document.activeElement.id);
  assert.equal(focused, 'calculate');
  const style = await computedStyle('#calculate', ['outlineStyle', 'outlineOffset', 'boxShadow']);
  assert.equal(style.outlineStyle, 'solid');
  assert.equal(style.outlineOffset, '2px');
  assert.notEqual(style.boxShadow, 'none');
});

test('入力欄で Enter キーを押すと計算される', async () => {
  await page.fill('#number1', '4');
  await page.fill('#number2', '9');
  await page.click('#operation-add');
  await page.press('#number2', 'Enter');
  const result = await page.$eval('#result', (el) => el.textContent);
  assert.equal(result, '13');
});

// --- 例: 仕様の「例」表の 4 行 ---

async function calculate({ left, right, op }) {
  await page.fill('#number1', String(left));
  await page.fill('#number2', String(right));
  await page.click(op === 'add' ? '#operation-add' : '#operation-sub');
  await page.click('#calculate');
  return page.$eval('#result', (el) => el.textContent);
}

test('左 2、右 3、足し算、計算 → 結果が 5', async () => {
  assert.equal(await calculate({ left: 2, right: 3, op: 'add' }), '5');
});

test('左 5、右 3、引き算、計算 → 結果が 2', async () => {
  assert.equal(await calculate({ left: 5, right: 3, op: 'sub' }), '2');
});

test('左 -1.5、右 0.5、足し算、計算 → 結果が -1', async () => {
  assert.equal(await calculate({ left: -1.5, right: 0.5, op: 'add' }), '-1');
});

test('左 0、右 0、引き算、計算 → 結果が 0', async () => {
  assert.equal(await calculate({ left: 0, right: 0, op: 'sub' }), '0');
});

// --- 残差以外の視覚検証: PNG とのピクセル不一致率 ---

test('progress/calc-page.png とのピクセル不一致率が 0.5% 以下である', async () => {
  // 直前のテストで入力・結果表示が変化しているため、初期状態に戻してから比較する
  await page.reload();

  const screenshotBuffer = await page.screenshot();
  const actual = PNG.sync.read(screenshotBuffer);
  const expected = PNG.sync.read(fs.readFileSync(referencePngPath));

  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);

  const diff = new PNG({ width: actual.width, height: actual.height });
  const mismatchedPixels = pixelmatch(
    actual.data,
    expected.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold: 0.1 }
  );

  const diffDir = path.join(rootDir, 'progress');
  fs.writeFileSync(path.join(diffDir, 'calc-page.diff.png'), PNG.sync.write(diff));

  const ratio = mismatchedPixels / (actual.width * actual.height);
  assert.ok(
    ratio <= 0.005,
    `ピクセル不一致率 ${(ratio * 100).toFixed(3)}% が 0.5% を超えている(progress/calc-page.diff.png を参照)`
  );
});
