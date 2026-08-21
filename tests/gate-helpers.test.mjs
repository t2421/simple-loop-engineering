import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findViolations } from '../tools/check-protected-paths.mjs';

const empty = { changes: [], baseScripts: {}, headScripts: {} };

test('tools/run-unit-tests.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/run-unit-tests.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'tools/run-unit-tests.mjs');
});

test('tools/e2e-needed.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/e2e-needed.mjs' }],
  });
  assert.equal(v.length, 1);
});

test('tools/check-progress-coupling.mjs の内容変更は違反になる', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/check-progress-coupling.mjs' }],
  });
  assert.equal(v.length, 1);
  assert.equal(v[0].path, 'tools/check-progress-coupling.mjs');
});

test('tools/check-progress-coupling.mjs の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'tools/check-progress-coupling.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'tools/check-progress-coupling.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('検証の委譲先の削除・リネームも違反になる', () => {
  const deleted = findViolations({
    ...empty,
    changes: [{ status: 'D', path: 'tools/run-unit-tests.mjs' }],
  });
  assert.equal(deleted.length, 1);

  const renamed = findViolations({
    ...empty,
    changes: [
      {
        status: 'R',
        path: 'tools/x.mjs',
        oldPath: 'tools/e2e-needed.mjs',
        similarity: 100,
      },
    ],
  });
  assert.equal(renamed.length, 1);
});

test('検証の委譲先の新規追加は違反にならない（導入 PR）', () => {
  const v = findViolations({
    ...empty,
    changes: [
      { status: 'A', path: 'tools/run-unit-tests.mjs' },
      { status: 'A', path: 'tools/e2e-needed.mjs' },
      { status: 'A', path: 'tools/check-progress-coupling.mjs' },
    ],
  });
  assert.deepEqual(v, []);
});

test('tools/setup-playwright.mjs は委譲先ではないので変更しても違反にならない', () => {
  const v = findViolations({
    ...empty,
    changes: [{ status: 'M', path: 'tools/setup-playwright.mjs' }],
  });
  assert.deepEqual(v, []);
});
