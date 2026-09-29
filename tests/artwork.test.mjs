import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { server, assertSafeDirectory } from '../server/artwork-service/server.mjs';

test('artwork refuses directory symlinks outside the media root', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'prism-test-'));
  try {
    const root = path.join(temporary, 'media');
    const outside = path.join(temporary, 'outside');
    await mkdir(root); await mkdir(outside); await mkdir(path.join(root, 'safe'));
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await assertSafeDirectory(path.join(root, 'safe'), root);
    await assert.rejects(assertSafeDirectory(path.join(root, 'escape'), root), /symbolic links/);
    await assert.rejects(assertSafeDirectory(outside, root), /Unsafe/);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
test('artwork blocks foreign origins and requires administrator before reading uploads', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  try {
    const forbidden = await realFetch(base + '/items/1/artwork', { method: 'POST', headers: { Origin: 'https://evil.test' } });
    assert.equal(forbidden.status, 403);
    const unsigned = await realFetch(base + '/items/1/artwork', { method: 'POST', body: '{}' });
    assert.equal(unsigned.status, 401);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ Id: 'viewer', Policy: { IsAdministrator: false } }) });
    const viewer = await realFetch(base + '/items/1/artwork', { method: 'POST', headers: { Authorization: 'MediaBrowser Token="viewer"' }, body: '{}' });
    assert.equal(viewer.status, 403);
  } finally { globalThis.fetch = realFetch; await new Promise(resolve => server.close(resolve)); }
});
