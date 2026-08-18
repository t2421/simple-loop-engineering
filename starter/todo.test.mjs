import { test } from "node:test";
import assert from "node:assert/strict";
import { add, toggle, remove, activeCount } from "./todo.mjs";

test("add: タスクを1件追加できる", () => {
  const list = add([], "牛乳を買う");
  assert.equal(list.length, 1);
  assert.equal(list[0].text, "牛乳を買う");
  assert.equal(list[0].done, false);
});

test("toggle: 完了にできる", () => {
  const list = add([], "牛乳を買う");
  const after = toggle(list, list[0].id);
  assert.equal(after[0].done, true);
});

test("toggle: 2回押すと未完了に戻る", () => {
  const list = add([], "牛乳を買う");
  const once = toggle(list, list[0].id);
  const twice = toggle(once, list[0].id);
  assert.equal(twice[0].done, false);
});

test("remove: タスクを削除できる", () => {
  const list = add([], "牛乳を買う");
  const after = remove(list, list[0].id);
  assert.equal(after.length, 0);
});

test("remove: 存在しないIDでも壊れない", () => {
  const list = add([], "牛乳を買う");
  const after = remove(list, 9999);
  assert.equal(after.length, 1);
});

test("activeCount: 未完了の件数を返す", () => {
  let list = add(add([], "A"), "B");
  list = toggle(list, list[0].id);
  assert.equal(activeCount(list), 1);
});
