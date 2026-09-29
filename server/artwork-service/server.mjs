import http from 'node:http';
import { mkdir, open, lstat, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const port = Number(process.env.PORT || 8097);
const jellyfinUrl = String(process.env.JELLYFIN_URL || 'http://jellyfin:8096').replace(/\/+$/, '');
const jellyfinMediaRoot = normalizePosix(process.env.JELLYFIN_HOME_VIDEOS_PATH || '/media/Home Videos');
const artworkRoot = path.resolve(process.env.ARTWORK_ROOT || '/home-videos');
const maxBodyBytes = 35 * 1024 * 1024;
const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || 'file://,null,http://localhost:5173,http://127.0.0.1:5173').split(',').map((value) => value.trim()).filter(Boolean));

async function artworkRootStatus() {
  const probe = path.join(artworkRoot, `.prism-health-${process.pid}-${Date.now()}.tmp`);
  try {
    const handle = await open(probe, 'wx', 0o600);
    await handle.close();
    await unlink(probe);
    return { writable: true };
  } catch (error) {
    await unlink(probe).catch(() => undefined);
    return { writable: false, error: error.code || error.message };
  }
}

function normalizePosix(value) {
  return path.posix.resolve('/', String(value).replaceAll('\\', '/'));
}

function corsHeaders(origin) {
  const allowed = !origin || allowedOrigins.has('*') || allowedOrigins.has(origin);
  return {
    ...(allowed && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
}

function send(response, status, body, origin) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) });
  response.end(JSON.stringify(body));
}

async function jellyfin(pathname, authorization, init = {}) {
  return fetch(`${jellyfinUrl}${pathname}`, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json', Authorization: authorization, ...init.headers }
  });
}

async function authenticatedItem(itemId, authorization) {
  if (!authorization?.startsWith('MediaBrowser ')) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const me = await jellyfin('/Users/Me', authorization);
  if (!me.ok) throw Object.assign(new Error('PRISM Server rejected this session.'), { status: 401 });
  const rawUser = await me.json();
  const policy = rawUser.Policy ?? rawUser.policy;
  const user = { Id: rawUser.Id ?? rawUser.id, Policy: { IsAdministrator: policy?.IsAdministrator ?? policy?.isAdministrator } };
  if (user.Policy?.IsAdministrator !== true) throw Object.assign(new Error('Only server administrators may change artwork.'), { status: 403 });
  const itemResponse = await jellyfin(`/Users/${encodeURIComponent(user.Id)}/Items/${encodeURIComponent(itemId)}`, authorization);
  if (!itemResponse.ok) throw Object.assign(new Error('That Home Video is not available to this user.'), { status: itemResponse.status });
  const item = await itemResponse.json();
  return { Path: item.Path ?? item.path, Type: item.Type ?? item.type };
}

function resolveItemDirectory(item) {
  const mediaPath = normalizePosix(item.Path || '');
  const relative = path.posix.relative(jellyfinMediaRoot, mediaPath);
  if (!mediaPath || relative.startsWith('..') || path.posix.isAbsolute(relative)) {
    throw Object.assign(new Error('Artwork changes are restricted to the Home Videos library.'), { status: 403 });
  }
  if (!['Video', 'Movie'].includes(item.Type)) throw Object.assign(new Error('Only video artwork can be changed here.'), { status: 400 });
  const relativeDirectory = path.posix.dirname(relative);
  const localDirectory = path.resolve(artworkRoot, relativeDirectory);
  const rootPrefix = artworkRoot.endsWith(path.sep) ? artworkRoot : `${artworkRoot}${path.sep}`;
  if (localDirectory !== artworkRoot && !localDirectory.startsWith(rootPrefix)) {
    throw Object.assign(new Error('The media path is outside the allowed artwork directory.'), { status: 403 });
  }
  const filename = path.posix.basename(relative);
  const extension = path.posix.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  if (!stem || stem === '.' || stem === '..') throw Object.assign(new Error('The Home Video filename is not valid for sidecar artwork.'), { status: 400 });
  return { directory: localDirectory, stem };
}

async function readJsonBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBodyBytes) throw Object.assign(new Error('The image is larger than the 25 MB upload limit.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('The artwork request was not valid JSON.'), { status: 400 }); }
}

export async function assertSafeDirectory(directory, root = artworkRoot) {
  const canonicalRoot = await realpath(root);
  const relative = path.relative(root, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw Object.assign(new Error('Unsafe artwork path.'), { status: 403 });
  let cursor = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Object.assign(new Error('Artwork folders must not contain symbolic links.'), { status: 403 });
  }
  const resolved = await realpath(directory);
  if (resolved !== canonicalRoot && !resolved.startsWith(canonicalRoot + path.sep)) throw Object.assign(new Error('Unsafe artwork path.'), { status: 403 });
}

async function rejectLink(target) {
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile()) throw Object.assign(new Error('Artwork target must be a regular file.'), { status: 403 });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

async function preservePrevious(target, directory, imageType) {
  try { await stat(target); }
  catch { return; }
  const metadata = path.join(directory, '.prism-artwork');
  await mkdir(metadata).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  await assertSafeDirectory(metadata);
  const history = path.join(metadata, 'history');
  await mkdir(history).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  await assertSafeDirectory(history);
  const stamp = new Date().toISOString().replaceAll(':', '-');
  await rename(target, path.join(history, `${imageType}-${stamp}-${randomUUID()}.jpg`));
}

async function saveArtwork(item, imageType, dataUrl) {
  if (!['poster', 'backdrop'].includes(imageType)) throw Object.assign(new Error('Unknown artwork type.'), { status: 400 });
  const match = /^data:image\/(jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!match) throw Object.assign(new Error('PRISM Server accepts normalized JPEG artwork only.'), { status: 415 });
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 512 || bytes.length > 25 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw Object.assign(new Error('The normalized artwork file is invalid or too large.'), { status: 400 });
  }
  const { directory, stem } = resolveItemDirectory(item);
  const target = path.join(directory, `${stem}-${imageType}.jpg`);
  const temporary = path.join(directory, `.${stem}-${imageType}.${process.pid}.${Date.now()}.tmp`);
  await assertSafeDirectory(directory);
  await rejectLink(target);
  await preservePrevious(target, directory, `${stem}-${imageType}`);
  try {
    const handle = await open(temporary, 'wx', 0o644);
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return target;
}

async function refreshItem(itemId, authorization) {
  const params = new URLSearchParams({ Recursive: 'false', MetadataRefreshMode: 'None', ImageRefreshMode: 'Full', ReplaceAllImages: 'false' });
  await jellyfin(`/Items/${encodeURIComponent(itemId)}/Refresh?${params}`, authorization, { method: 'POST' });
}

export const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || '';
  if (origin && !allowedOrigins.has(origin)) {
    send(response, 403, { ok: false, error: 'Origin not allowed.' }, '');
    return;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    const storage = await artworkRootStatus();
    send(response, storage.writable ? 200 : 503, {
      ok: storage.writable,
      service: 'PRISM Artwork',
      storage,
      uid: typeof process.getuid === 'function' ? process.getuid() : null
    }, origin);
    return;
  }
  const match = request.url?.match(/^\/items\/([^/]+)\/artwork$/);
  if (request.method !== 'POST' || !match) {
    send(response, 404, { ok: false, error: 'Not found.' }, origin);
    return;
  }
  try {
    const authorization = request.headers.authorization || '';
    const itemId = decodeURIComponent(match[1]);
    const item = await authenticatedItem(itemId, authorization);
    const body = await readJsonBody(request);
    await saveArtwork(item, body.imageType, body.dataUrl);
    await refreshItem(itemId, authorization);
    send(response, 200, { ok: true, imageType: body.imageType, updatedAt: Date.now() }, origin);
  } catch (error) {
    console.error(error);
    send(response, Number(error.status) || (error.code === 'EACCES' ? 403 : 500), { ok: false, error: error.code === 'EACCES' ? 'The Home Videos folder is not writable by PRISM Server.' : (error.status ? error.message : 'Artwork could not be saved.') }, origin);
  }
});

server.requestTimeout = 30000;
server.headersTimeout = 10000;
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(port, '0.0.0.0', () => console.log(`PRISM Artwork listening on ${port}`));
}
