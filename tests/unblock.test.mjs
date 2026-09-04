import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parsePathExistsPredicate,
  parseUnblock,
  repoPathExists,
  evaluateBlockedUnblock,
} from '../loop-core/ledger/unblock.mjs';

test('parsePathExistsPredicate: 正規の相対パスを末尾スラッシュ無しで返す', () => {
  assert.equal(
    parsePathExistsPredicate('path-exists:task/archive/0044-second-project-port/'),
    'task/archive/0044-second-project-port',
  );
  assert.equal(
    parsePathExistsPredicate('path-exists:task/archive/0044-second-project-port'),
    'task/archive/0044-second-project-port',
  );
});

test('parsePathExistsPredicate: 解釈できない入力は null', () => {
  assert.equal(parsePathExistsPredicate(''), null);
  assert.equal(parsePathExistsPredicate('0044 が終わったら'), null);
  assert.equal(parsePathExistsPredicate('path-exists:'), null);
  assert.equal(parsePathExistsPredicate('path-exists:/abs'), null);
  assert.equal(parsePathExistsPredicate('path-exists:foo/../bar'), null);
  assert.equal(parsePathExistsPredicate('path-exists:foo/./bar'), null);
  assert.equal(parsePathExistsPredicate('path-exists:foo//bar'), null);
  assert.equal(parsePathExistsPredicate('path-exists:.'), null);
  assert.equal(parsePathExistsPredicate('path-exists:..'), null);
});

test('parseUnblock: フェンス外の Unblock だけを読む', () => {
  const md = [
    '- **Status:** `Blocked`',
    '- **Unblock:** `path-exists:task/archive/0044-second-project-port/`',
    '',
    '```',
    '- **Unblock:** `path-exists:ignored/`',
    '```',
  ].join('\n');
  assert.deepEqual(parseUnblock(md), {
    kind: 'path-exists',
    relPath: 'task/archive/0044-second-project-port',
  });
});

test('parseUnblock: 行が無ければ missing、空・非 path-exists は unparseable', () => {
  assert.deepEqual(parseUnblock('# none\n'), { kind: 'missing' });
  assert.deepEqual(parseUnblock('- **Unblock:**\n'), { kind: 'unparseable' });
  assert.deepEqual(parseUnblock('- **Unblock:** `0044 が終わったら`\n'), { kind: 'unparseable' });
});

test('parseUnblock: フェンスの中の Unblock は missing', () => {
  const md = [
    '- **Status:** `Blocked`',
    '',
    '```',
    '- **Unblock:** `path-exists:task/archive/0044-second-project-port/`',
    '```',
  ].join('\n');
  assert.deepEqual(parseUnblock(md), { kind: 'missing' });
});

test('repoPathExists: ファイルでもディレクトリでも真。無いパスは偽', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unblock-'));
  fs.mkdirSync(path.join(root, 'task', 'archive', '0044-second-project-port'), { recursive: true });
  fs.writeFileSync(path.join(root, 'note.txt'), 'x');
  assert.equal(repoPathExists(root, 'task/archive/0044-second-project-port'), true);
  assert.equal(repoPathExists(root, 'note.txt'), true);
  assert.equal(repoPathExists(root, 'task/archive/9999-none'), false);
});

test('evaluateBlockedUnblock: 満たされた path-exists だけ selectable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unblock-eval-'));
  fs.mkdirSync(path.join(root, 'task', 'archive', '0044-second-project-port'), { recursive: true });

  const met = evaluateBlockedUnblock(
    '- **Unblock:** `path-exists:task/archive/0044-second-project-port/`\n',
    root,
  );
  assert.deepEqual(met, { selectable: true, skipReason: null });

  const missing = evaluateBlockedUnblock('- **Status:** `Blocked`\n', root);
  assert.deepEqual(missing, { selectable: false, skipReason: '解除述語が無い' });

  const unparseable = evaluateBlockedUnblock('- **Unblock:** `0044 が終わったら`\n', root);
  assert.deepEqual(unparseable, { selectable: false, skipReason: '解釈できない' });

  const unmet = evaluateBlockedUnblock(
    '- **Unblock:** `path-exists:task/archive/9999-none/`\n',
    root,
  );
  assert.deepEqual(unmet, { selectable: false, skipReason: null });
});
