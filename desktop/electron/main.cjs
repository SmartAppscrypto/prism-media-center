const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const windowDrags = new Map();
const tmdbCacheMaxAge = 30 * 24 * 60 * 60 * 1000;

function prismDataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

async function readJson(filename, fallback) {
  try { return JSON.parse(await fs.readFile(prismDataPath(filename), 'utf8')); }
  catch { return fallback; }
}

async function writeJson(filename, value) {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(prismDataPath(filename), JSON.stringify(value), { mode: 0o600 });
}

async function readTmdbToken() {
  const secrets = await readJson('prism-secrets.json', {});
  if (!secrets.tmdbToken || !safeStorage.isEncryptionAvailable()) return '';
  try { return safeStorage.decryptString(Buffer.from(secrets.tmdbToken, 'base64')); }
  catch { return ''; }
}

function tmdbRequest(pathname, token) {
  const url = new URL(`https://api.themoviedb.org/3${pathname}`);
  const headers = { Accept: 'application/json' };
  if (token.startsWith('eyJ')) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set('api_key', token);
  return fetch(url, { headers });
}

ipcMain.handle('prism-tmdb-status', async () => Boolean(await readTmdbToken()));

ipcMain.handle('prism-tmdb-save', async (_event, rawToken) => {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) return { ok: false, error: 'Enter a TMDb token.' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Secure storage is not available on this Mac.' };
  try {
    const response = await tmdbRequest('/authentication', token);
    if (!response.ok) return { ok: false, error: 'TMDb did not accept that token.' };
    await writeJson('prism-secrets.json', { tmdbToken: safeStorage.encryptString(token).toString('base64') });
    return { ok: true };
  } catch {
    return { ok: false, error: 'PRISM could not reach TMDb.' };
  }
});

ipcMain.handle('prism-tmdb-clear', async () => {
  await writeJson('prism-secrets.json', {});
  return true;
});

ipcMain.handle('prism-tmdb-movie', async (_event, identifiers) => {
  const token = await readTmdbToken();
  if (!token) return null;
  const tmdbId = typeof identifiers?.tmdbId === 'string' ? identifiers.tmdbId : '';
  const imdbId = typeof identifiers?.imdbId === 'string' ? identifiers.imdbId : '';
  const cacheKey = tmdbId ? `tmdb:${tmdbId}` : imdbId ? `imdb:${imdbId}` : '';
  if (!cacheKey) return null;
  const cache = await readJson('prism-tmdb-cache.json', {});
  if (cache[cacheKey] && Date.now() - cache[cacheKey].cachedAt < tmdbCacheMaxAge) return cache[cacheKey].data;

  try {
    let resolvedTmdbId = tmdbId;
    if (!resolvedTmdbId && imdbId) {
      const findResponse = await tmdbRequest(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, token);
      if (!findResponse.ok) return null;
      const found = await findResponse.json();
      resolvedTmdbId = String(found.movie_results?.[0]?.id ?? '');
    }
    if (!resolvedTmdbId) return null;
    const response = await tmdbRequest(`/movie/${encodeURIComponent(resolvedTmdbId)}?language=en-US`, token);
    if (!response.ok) return null;
    const movie = await response.json();
    const data = {
      budget: Number(movie.budget) > 0 ? Number(movie.budget) : undefined,
      revenue: Number(movie.revenue) > 0 ? Number(movie.revenue) : undefined,
      source: 'TMDb'
    };
    cache[cacheKey] = { cachedAt: Date.now(), data };
    await writeJson('prism-tmdb-cache.json', cache);
    return data;
  } catch {
    return null;
  }
});

ipcMain.on('prism-window-drag-start', (event, point) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  windowDrags.set(event.sender.id, { window, pointer: point, bounds: window.getBounds() });
});

ipcMain.on('prism-window-drag-move', (event, point) => {
  const drag = windowDrags.get(event.sender.id);
  if (!drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  drag.window.setPosition(
    Math.round(drag.bounds.x + point.x - drag.pointer.x),
    Math.round(drag.bounds.y + point.y - drag.pointer.y),
    false
  );
});

ipcMain.on('prism-window-drag-end', (event) => windowDrags.delete(event.sender.id));

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#050506',
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    window.loadURL(devServer);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
