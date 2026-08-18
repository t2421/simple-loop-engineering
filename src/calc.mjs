import { add, sub } from './math.mjs';

const form = document.getElementById('calculator-form');
const operationButtons = Array.from(document.querySelectorAll('.operation'));
const number1Input = document.getElementById('number1');
const number2Input = document.getElementById('number2');
const resultValue = document.getElementById('result');

let selectedOperation = 'add';

function selectOperation(op) {
  selectedOperation = op;
  for (const button of operationButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.op === op));
  }
}

function parseNumber(input) {
  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : 0;
}

function calculate() {
  const a = parseNumber(number1Input);
  const b = parseNumber(number2Input);
  const result = selectedOperation === 'add' ? add(a, b) : sub(a, b);
  resultValue.textContent = String(result);
}

for (const button of operationButtons) {
  button.addEventListener('click', () => selectOperation(button.dataset.op));
}

// Calculate ボタンのクリックと、入力欄での Enter 押下の両方をここで処理する
form.addEventListener('submit', (event) => {
  event.preventDefault();
  calculate();
});
