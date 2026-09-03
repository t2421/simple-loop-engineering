import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKER, VERSION_PIN, findViolations, hasAllowLabel } from '../gate/check-protected-paths.mjs';

const empty = { changes: [] };

test('コアの VERSION 変更は違反、新規追加は許可', () => {
  const changed = findViolations({
    ...empty,
    changes: [{ status: 'M', path: VERSION_PIN }],
  });
  assert.equal(changed.length, 1);
  assert.match(changed[0].reason, /バージョン/);

  const added = findViolations({
    ...empty,
    changes: [{ status: 'A', path: VERSION_PIN }],
  });
  assert.deepEqual(added, []);
});

test('コアの VERSION 削除・リネームも違反', () => {
  assert.equal(
    findViolations({ ...empty, changes: [{ status: 'D', path: VERSION_PIN }] }).length,
    1,
  );
  assert.equal(
    findViolations({
      ...empty,
      changes: [
        { status: 'R', path: 'loop-core/VERSION.bak', oldPath: VERSION_PIN, similarity: 100 },
      ],
    }).length,
    1,
  );
});

test('チェッカー経路は loop-core/gate 側', () => {
  assert.equal(CHECKER, 'loop-core/gate/check-protected-paths.mjs');
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: CHECKER }],
  });
  assert.equal(v.length, 1);
});

test('allow-protected-change ラベル判定は変わらない', () => {
  assert.equal(hasAllowLabel(['allow-protected-change']), true);
  assert.equal(hasAllowLabel([]), false);
  assert.equal(hasAllowLabel(null), false);
});
