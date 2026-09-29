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

test('artwork replacement preserves the old file on failure and serializes revision history', async () => {
  const { saveArtwork } = await import('../server/artwork-service/server.mjs');
  const { writeFile, readFile, readdir } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'prism-artwork-'));
  const original = Buffer.alloc(600, 1); original[0] = 0xff; original[1] = 0xd8;
  const replacement = Buffer.from(original); replacement[10] = 2;
  const latest = Buffer.from(original); latest[10] = 3;
  const item = { Path: '/media/Home Videos/clip.mp4', Type: 'Video' };
  const data = bytes => `data:image/jpeg;base64,${bytes.toString('base64')}`;
  const target = path.join(root, 'clip-poster.jpg');
  try {
    await writeFile(target, original);
    await writeFile(path.join(root, '.prism-artwork'), 'blocked directory');
    await assert.rejects(saveArtwork(item, 'poster', data(replacement), root));
    assert.deepEqual(await readFile(target), original);
    assert.deepEqual((await readdir(root)).filter(name => name.endsWith('.tmp')), []);
    await rm(path.join(root, '.prism-artwork'));
    await Promise.all([saveArtwork(item, 'poster', data(replacement), root), saveArtwork(item, 'poster', data(latest), root)]);
    assert.deepEqual(await readFile(target), latest);
    const history = path.join(root, '.prism-artwork/history');
    const versions = await Promise.all((await readdir(history)).map(name => readFile(path.join(history, name))));
    assert.equal(versions.length, 2);
    assert.ok(versions.some(bytes => bytes.equals(original)));
    assert.ok(versions.some(bytes => bytes.equals(replacement)));
    await assert.rejects(saveArtwork({ ...item, Path: '/media/Movies/clip.mp4' }, 'poster', data(latest), root));
  } finally { await rm(root, { recursive: true, force: true }); }
});
