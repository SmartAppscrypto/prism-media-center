const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { writeJsonAtomic } = require('../desktop/electron/storage.cjs');

test('concurrent cache writes remain complete, ordered and private', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-storage-'));
  const file = path.join(root, 'session.json');
  try {
    await Promise.all(Array.from({ length: 20 }, (_, revision) => writeJsonAtomic(file, { revision, text: 'x'.repeat(revision * 1000) })));
    assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { revision: 19, text: 'x'.repeat(19000) });
    assert.deepEqual(await fs.readdir(root), ['session.json']);
    if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    const snapshot = { revision: 20 };
    const pending = writeJsonAtomic(file, snapshot);
    snapshot.revision = 21;
    await pending;
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).revision, 20);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
