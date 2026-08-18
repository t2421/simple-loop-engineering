---
name: verify-frontend-change
description: UIのコードを変更した後、必ず実行する検証手順。「実装できた気がする」で完了報告しないためのもの。
---

# UIの変更を検証する

コード編集が終わった直後、これを最後まで実行してから「完了」と報告すること。
途中で失敗したら修正してから**最初からやり直す**。部分的に確認できただけの状態で終わらせない。

重要: 実行したコマンドの**出力を会話に貼ること**。
「確認しました」という報告だけでは、後続の停止条件の判定材料にならない。

## 1. 自動で確認する

```bash
npx playwright test          # E2E
npx tsc --noEmit             # 型（TypeScriptの場合）
npm run build                # ビルドが通るか
```

## 2. 実際に操作して確認する

`npx playwright test --headed` か dev server で、以下を必ず通す。

- 追加した機能のハッピーパスを1回通す
- 異常系を最低1つ試す（空入力、存在しないID、連打）
- **キーボードだけで**同じ操作ができるか（Tab / Enter / Space / Escape）
- フォーカスリングが各ステップで見えているか

## 3. コンソールを確認する

```js
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
```

エラーが0件であることを確認し、件数を報告に含める。

## 4. アクセシビリティを機械で確認する

```bash
npx @axe-core/cli http://localhost:5173
```

violations の件数を報告に含める。0件でない場合は直してから再実行する。

## 5. レイアウトを確認する

375 / 768 / 1280px の各幅で、横スクロールが発生していないことを確認する。

```js
await page.setViewportSize({ width: 375, height: 800 });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth
);
```

## 完了の定義

1〜5がすべて通り、**それぞれの出力が会話に出ている**状態。
1(テスト)が緑なだけでは「動作確認済み」とは言わない。
