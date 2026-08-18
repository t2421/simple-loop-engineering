// Todoの状態を扱う純粋な関数だけを置く場所。
// DOMに触らないので、ブラウザなしでテストできる（＝ループが回せる）。

let nextId = 1;

export function add(list, text) {
  return [...list, { id: nextId++, text, done: false }];
}

export function toggle(list, id) {
  return list.map((t) => (t.id === id ? { ...t, done: true } : t));
}

export function remove(list, id) {
  throw new Error("not implemented");
}

export function activeCount(list) {
  return list.filter((t) => !t.done).length;
}
