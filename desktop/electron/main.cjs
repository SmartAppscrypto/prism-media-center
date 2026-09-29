const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { findShotOnWhatPage, slugify } = require('./shotonwhat.cjs');

const { writeJsonAtomic } = require('./storage.cjs');
const { trustedPage, trustedSender } = require('./security.cjs');
const appFile = path.join(__dirname, '..', 'dist', 'index.html');
const devServer = app.isPackaged ? undefined : process.env.VITE_DEV_SERVER_URL;
function handle(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!trustedSender(event, appFile, devServer)) throw new Error('Untrusted IPC sender.');
    return callback(event, ...args);
  });
}
function listen(channel, callback) {
  ipcMain.on(channel, (event, ...args) => {
    if (trustedSender(event, appFile, devServer)) callback(event, ...args);
  });
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const windowDrags = new Map();
const tmdbCacheMaxAge = 30 * 24 * 60 * 60 * 1000;
const productionMissMaxAge = 30 * 24 * 60 * 60 * 1000;
const productionLookups = new Map();
const productionFacetFields = new Set([
  'acquisition', 'cameras', 'lenses', 'lensManufacturers', 'cameraAperture', 'filmStock', 'filmGauge',
  'captureResolution', 'captureFormats', 'projectResolution', 'frameRate', 'finishingProcess', 'aspectRatio', 'cinematographers'
]);
let productionCache;
let productionScanRunning = false;
let nativePlayer;

function nativePlayerPaths() {
  const packagedRuntime = path.join(process.resourcesPath, 'vlc');
  const developmentRuntime = process.platform === 'win32'
    ? process.env.PRISM_VLC_DIR || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VideoLAN', 'VLC')
    : '/Applications/VLC.app/Contents/MacOS';
  const runtime = fsSync.existsSync(packagedRuntime) ? packagedRuntime : developmentRuntime;
  return {
    library: process.platform === 'win32'
      ? path.join(runtime, 'libvlc.dll')
      : path.join(runtime, 'lib', 'libvlc.5.dylib'),
    plugins: path.join(runtime, 'plugins')
  };
}

function getNativePlayer() {
  if (nativePlayer !== undefined) return nativePlayer;
  try { nativePlayer = require('./native/build/Release/prism_vlc.node'); }
  catch { nativePlayer = null; }
  return nativePlayer;
}

function prismDataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

async function readJson(filename, fallback) {
  try { return JSON.parse(await fs.readFile(prismDataPath(filename), 'utf8')); }
  catch { return fallback; }
}

async function writeJson(filename, value) {
  await writeJsonAtomic(prismDataPath(filename), value);
}

async function getProductionCache() {
  if (!productionCache) productionCache = await readJson('prism-production-cache.json', {});
  return productionCache;
}

function productionKey(item) {
  if (typeof item?.title !== 'string' || !Number.isInteger(item?.year) || item.year < 1880 || item.year > 2200) return '';
  return `${slugify(item.title)}:${item.year}`;
}

async function lookupProduction(item, scrapeIfMissing) {
  const key = productionKey(item);
  if (!key) return null;
  const cache = await getProductionCache();
  const cached = cache[key];
  if (cached?.data) return cached.data;
  if (cached && Date.now() - cached.checkedAt < productionMissMaxAge) return null;
  if (!scrapeIfMissing) return null;
  if (productionLookups.has(key)) return productionLookups.get(key);

  const lookup = findShotOnWhatPage(item.title, item.year).then(async (data) => {
    cache[key] = { checkedAt: Date.now(), data };
    await writeJson('prism-production-cache.json', cache);
    return data;
  }).finally(() => productionLookups.delete(key));
  productionLookups.set(key, lookup);
  return lookup;
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
  return fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
}

let memorySession = null;
let sessionWrites = Promise.resolve();
function validSession(value) {
  if (!value || !['serverUrl', 'accessToken', 'userId', 'username'].every((key) => typeof value[key] === 'string' && value[key].length <= 8192)) return false;
  try { const url = new URL(value.serverUrl); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && Boolean(value.accessToken && value.userId); }
  catch { return false; }
}
handle('prism-session-load', async () => {
  if (memorySession) return memorySession;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const stored = await readJson('prism-session.json', {});
    const value = JSON.parse(safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')));
    return validSession(value) ? value : null;
  } catch { return null; }
});
handle('prism-session-save', async (_event, value) => {
  if (!validSession(value)) throw new Error('Invalid session.');
  memorySession = value;
  if (!safeStorage.isEncryptionAvailable()) return false;
  const encrypted = safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  sessionWrites = sessionWrites.catch(() => undefined).then(() => writeJson('prism-session.json', { encrypted }));
  await sessionWrites;
  return true;
});
handle('prism-session-clear', async () => {
  memorySession = null;
  sessionWrites = sessionWrites.catch(() => undefined).then(() => fs.rm(prismDataPath('prism-session.json'), { force: true }));
  await sessionWrites;
});

handle('prism-tmdb-status', async () => Boolean(await readTmdbToken()));

handle('prism-tmdb-save', async (_event, rawToken) => {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (!token) return { ok: false, error: 'Enter a TMDb token.' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Secure storage is not available on this computer.' };
  try {
    const response = await tmdbRequest('/authentication', token);
    if (!response.ok) return { ok: false, error: 'TMDb did not accept that token.' };
    await writeJson('prism-secrets.json', { tmdbToken: safeStorage.encryptString(token).toString('base64') });
    return { ok: true };
  } catch {
    return { ok: false, error: 'PRISM could not reach TMDb.' };
  }
});

handle('prism-tmdb-clear', async () => {
  await writeJson('prism-secrets.json', {});
  return true;
});

handle('prism-tmdb-movie', async (_event, identifiers) => {
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

handle('prism-production-get', async (_event, item) => {
  try { return await lookupProduction(item, Boolean(item?.scrapeIfMissing)); }
  catch { return null; }
});

handle('prism-production-find', async (_event, query) => {
  const field = typeof query?.field === 'string' && productionFacetFields.has(query.field) ? query.field : '';
  const value = typeof query?.value === 'string' ? query.value.trim().toLocaleLowerCase() : '';
  if (!field || !value || !Array.isArray(query?.items)) return [];
  const cache = await getProductionCache();
  return query.items.slice(0, 5000).filter((item) => {
    const data = cache[productionKey(item)]?.data;
    return typeof item?.id === 'string' && Array.isArray(data?.[field])
      && data[field].some((candidate) => typeof candidate === 'string' && candidate.trim().toLocaleLowerCase() === value);
  }).map((item) => item.id);
});

handle('prism-production-scan', async (event, rawItems) => {
  if (productionScanRunning) return { ok: false, error: 'A production scan is already running.' };
  const items = Array.isArray(rawItems) ? rawItems
    .filter((item) => productionKey(item))
    .slice(0, 5000) : [];
  productionScanRunning = true;
  let found = 0;
  let missing = 0;
  let skipped = 0;
  try {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const cache = await getProductionCache();
      const cached = cache[productionKey(item)];
      if (cached?.data || (cached && Date.now() - cached.checkedAt < productionMissMaxAge)) {
        skipped += 1;
      } else {
        const data = await lookupProduction(item, true);
        if (data) found += 1;
        else missing += 1;
      }
      event.sender.send('prism-production-progress', {
        current: index + 1,
        total: items.length,
        found,
        missing,
        skipped,
        title: item.title
      });
    }
    return { ok: true, total: items.length, found, missing, skipped };
  } catch (reason) {
    return { ok: false, error: reason?.code === 'RATE_LIMITED' ? 'ShotOnWhat asked PRISM to pause. Try again later.' : 'The production scan stopped because the source could not be reached.' };
  } finally {
    productionScanRunning = false;
  }
});

handle('prism-native-status', (event) => {
  const bridge = getNativePlayer();
  const runtime = nativePlayerPaths();
  const window = BrowserWindow.fromWebContents(event.sender);
  return {
    available: Boolean(bridge && window && fsSync.existsSync(runtime.library) && fsSync.existsSync(runtime.plugins)),
    surface: bridge && window ? bridge.inspectParent(window.getNativeWindowHandle()) : null
  };
});

handle('prism-native-start', (event, mediaUrl, subtitleStyle) => {
  const bridge = getNativePlayer();
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!bridge || !window || typeof mediaUrl !== 'string') return { ok: false, error: 'The native player is not available.' };
  let parsed;
  try { parsed = new URL(mediaUrl); }
  catch { return { ok: false, error: 'The media address is invalid.' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { ok: false, error: 'The native player only accepts media server URLs.' };
  const runtime = nativePlayerPaths();
  const colors = { white: '16777215', warm: '16773842', yellow: '16770140', cyan: '11138559' };
  const sizes = { small: '20', medium: '16', large: '12' };
  const backgrounds = { none: '0', soft: '120', strong: '210' };
  const error = bridge.start(
    window.getNativeWindowHandle(),
    runtime.library,
    runtime.plugins,
    parsed.toString(),
    colors[subtitleStyle?.color] || colors.white,
    sizes[subtitleStyle?.size] || sizes.medium,
    backgrounds[subtitleStyle?.background] || backgrounds.soft
  );
  return error ? { ok: false, error } : { ok: true };
});

handle('prism-native-state', () => getNativePlayer()?.state() ?? { active: false, error: true, message: 'The native player is unavailable.' });
handle('prism-native-pause', (_event, paused) => Boolean(getNativePlayer()?.setPaused(Boolean(paused))));
handle('prism-native-seek', (_event, milliseconds) => Number.isFinite(milliseconds) && Boolean(getNativePlayer()?.setTime(Math.max(0, Math.round(milliseconds)))));
handle('prism-native-volume', (_event, volume) => Number.isFinite(volume) && Boolean(getNativePlayer()?.setVolume(Math.round(Math.max(0, Math.min(1.25, volume)) * 100))));
handle('prism-native-subtitle-off', () => Boolean(getNativePlayer()?.disableSubtitles()));
handle('prism-native-stop', () => { getNativePlayer()?.stop(); return true; });

listen('prism-window-drag-start', (event, point) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  windowDrags.set(event.sender.id, { window, pointer: point, bounds: window.getBounds() });
});

listen('prism-window-drag-move', (event, point) => {
  const drag = windowDrags.get(event.sender.id);
  if (!drag || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
  drag.window.setPosition(
    Math.round(drag.bounds.x + point.x - drag.pointer.x),
    Math.round(drag.bounds.y + point.y - drag.pointer.y),
    false
  );
});

listen('prism-window-drag-end', (event) => windowDrags.delete(event.sender.id));
listen('prism-window-minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
listen('prism-window-toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (window.isMaximized()) window.unmaximize();
  else window.maximize();
});
listen('prism-window-set-fullscreen', (event, enabled) => BrowserWindow.fromWebContents(event.sender)?.setFullScreen(Boolean(enabled)));
listen('prism-window-toggle-fullscreen', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) window.setFullScreen(!window.isFullScreen());
});
listen('prism-window-close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

function createWindow() {
  const isWindows = process.platform === 'win32';
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    // The VLC surface sits behind Electron's transparent renderer. Its own
    // Windows child surface paints the picture and solid-black letterboxing.
    backgroundColor: '#00000000',
    transparent: true,
    frame: !isWindows,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (!trustedPage(url, appFile, devServer)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!trustedPage(url, appFile, devServer)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (devServer) {
    window.loadURL(devServer);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  window.on('closed', () => getNativePlayer()?.stop());
  const resizeNativeSurface = () => getNativePlayer()?.resize?.(window.getNativeWindowHandle());
  window.on('resize', resizeNativeSurface);
  window.on('maximize', resizeNativeSurface);
  window.on('unmaximize', resizeNativeSurface);
  window.on('enter-full-screen', resizeNativeSurface);
  window.on('leave-full-screen', resizeNativeSurface);
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
