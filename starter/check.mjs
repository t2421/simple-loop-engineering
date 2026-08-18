// 依存ゼロの静的チェッカー。
// 「アクセシブルであること」「トークンを使っていること」を、件数という測れる形に落とす。
// 使い方: node check.mjs

import { readFileSync } from "node:fs";

const html = readFileSync("./index.html", "utf8");
const problems = [];

// 1. クリックできる要素がネイティブの button / a かどうか
//    div や span に onclick を付けるとキーボードで操作できない
//    onclick を代入している変数を、その createElement の要素名まで辿って判定する
const onclickTargets = [...html.matchAll(/const\s+(\w+)\s*=\s*document\.createElement\("(\w+)"\)/g)];
const assigned = [...html.matchAll(/(\w+)\.onclick\s*=/g)].map((m) => m[1]);
for (const varName of assigned) {
  const decl = onclickTargets.find((t) => t[1] === varName);
  if (decl && !["button", "a"].includes(decl[2])) {
    problems.push(
      `clickable-non-button: <${decl[2]}> にonclickを付けている（変数 ${varName}）。キーボードで操作できない`
    );
  }
}

// 2. CSS変数を使わずに色をハードコードしていないか（:root の定義内は除く）
const rootBlock = html.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? "";
const cssArea = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
const outsideRoot = cssArea.replace(rootBlock, "");
for (const m of outsideRoot.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
  problems.push(`hardcoded-color: ${m[0]} が :root の外で直接指定されている`);
}

// 3. 操作できる要素にアクセシブルな名前があるか
const toggleHasLabel = /aria-label/.test(html);
if (!toggleHasLabel) {
  problems.push("missing-label: aria-label が1つも無い。状態を切り替える要素に名前が無い");
}

// 結果を出力する（この出力がそのまま停止条件の判定材料になる）
if (problems.length === 0) {
  console.log("check: problems 0");
  process.exit(0);
}
console.log(`check: problems ${problems.length}`);
for (const p of problems) console.log("  - " + p);
process.exit(1);
