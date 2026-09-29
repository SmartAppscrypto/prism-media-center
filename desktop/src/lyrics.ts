import { getServerLyrics } from './jellyfin';
import type { LyricLine, MediaItem, PrismSession, TrackLyrics } from './types';

const databaseName = 'prism-lyrics';
const storeName = 'tracks';
const memoryCache = new Map<string, TrackLyrics>();

type LrcLibResult = {
  id?: number;
  name?: string;
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

export function parseLrc(value: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const row of value.split(/\r?\n/)) {
    const timestamps = [...row.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
    if (!timestamps.length) continue;
    const text = row.replace(/\[[^\]]+\]/g, '').trim();
    if (!text) continue;
    for (const timestamp of timestamps) {
      lines.push({ text, startSeconds: Number(timestamp[1]) * 60 + Number(timestamp[2]) });
    }
  }
  return lines.sort((a, b) => (a.startSeconds ?? 0) - (b.startSeconds ?? 0));
}

export function activeLyricIndex(lines: LyricLine[], time: number) {
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].startSeconds;
    if (start === undefined || start > time + .08) break;
    active = index;
  }
  return active;
}

export function estimatedLyricStart(index: number, lineCount: number, duration: number) {
  if (lineCount <= 0 || duration <= 0) return undefined;
  const firstLine = Math.min(12, duration * .06);
  const finalLine = Math.max(firstLine, duration - Math.min(10, duration * .04));
  return lineCount === 1 ? firstLine : firstLine + (index / (lineCount - 1)) * (finalLine - firstLine);
}

export function estimatedLyricIndex(lines: LyricLine[], time: number, duration: number) {
  if (!lines.length || duration <= 0) return -1;
  let active = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const start = estimatedLyricStart(index, lines.length, duration);
    if (start === undefined || start > time + .08) break;
    active = index;
  }
  return active;
}

function plainLines(value: string): LyricLine[] {
  return value.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ text }));
}

function cacheKey(track: MediaItem, session: PrismSession) {
  return `${session.serverUrl}:${session.userId}:${track.id}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!globalThis.indexedDB) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(key: string): Promise<TrackLyrics | null> {
  if (memoryCache.has(key)) return memoryCache.get(key) ?? null;
  const database = await openDatabase().catch(() => null);
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => {
      const lyrics = request.result as TrackLyrics | undefined;
      if (lyrics) memoryCache.set(key, lyrics);
      resolve(lyrics ?? null);
      database.close();
    };
    request.onerror = () => { resolve(null); database.close(); };
  });
}

async function writeCache(key: string, lyrics: TrackLyrics) {
  memoryCache.set(key, lyrics);
  const database = await openDatabase().catch(() => null);
  if (!database) return;
  await new Promise<void>((resolve) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(lyrics, key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); resolve(); };
  });
}

function mapRemoteLyrics(result: LrcLibResult): TrackLyrics | null {
  if (result.instrumental) return { lines: [], synced: false, instrumental: true, source: 'LRCLIB' };
  const synced = result.syncedLyrics ? parseLrc(result.syncedLyrics) : [];
  if (synced.length) return { lines: synced, synced: true, instrumental: false, source: 'LRCLIB' };
  const plain = result.plainLyrics ? plainLines(result.plainLyrics) : [];
  return plain.length ? { lines: plain, synced: false, instrumental: false, source: 'LRCLIB' } : null;
}

async function fetchRemoteLyrics(track: MediaItem, album: Pick<MediaItem, 'title' | 'artist'>): Promise<TrackLyrics | null> {
  const artist = track.artist || album.artist;
  if (!artist || !track.title) return null;
  const exact = new URL('https://lrclib.net/api/get');
  exact.searchParams.set('artist_name', artist);
  exact.searchParams.set('track_name', track.title);
  exact.searchParams.set('album_name', album.title);
  if (track.runtimeSeconds) exact.searchParams.set('duration', String(Math.round(track.runtimeSeconds)));
  const exactResponse = await fetch(exact, { signal: AbortSignal.timeout(10000) });
  if (exactResponse.ok) return mapRemoteLyrics(await exactResponse.json() as LrcLibResult);
  if (exactResponse.status !== 404) throw new Error(`Lyrics provider returned ${exactResponse.status}.`);

  const search = new URL('https://lrclib.net/api/search');
  search.searchParams.set('artist_name', artist);
  search.searchParams.set('track_name', track.title);
  const searchResponse = await fetch(search, { signal: AbortSignal.timeout(10000) });
  if (!searchResponse.ok) throw new Error(`Lyrics provider returned ${searchResponse.status}.`);
  const matches = await searchResponse.json() as LrcLibResult[];
  const duration = track.runtimeSeconds ?? 0;
  matches.sort((a, b) => {
    const syncedDifference = Number(!a.syncedLyrics) - Number(!b.syncedLyrics);
    if (syncedDifference) return syncedDifference;
    return Math.abs((a.duration ?? duration) - duration) - Math.abs((b.duration ?? duration) - duration);
  });
  return matches.length ? mapRemoteLyrics(matches[0]) : null;
}

export async function resolveTrackLyrics(track: MediaItem, album: Pick<MediaItem, 'title' | 'artist'>, session: PrismSession, forceRefresh = false): Promise<TrackLyrics | null> {
  const key = cacheKey(track, session);
  let plainFallback: TrackLyrics | null = null;
  if (!forceRefresh) {
    const cached = await readCache(key);
    if (cached?.synced || cached?.instrumental) return cached;
    plainFallback = cached;
    const serverLyrics = await getServerLyrics(track, session).catch(() => null);
    if (serverLyrics?.synced || serverLyrics?.instrumental) {
      await writeCache(key, serverLyrics);
      return serverLyrics;
    }
    plainFallback ??= serverLyrics;
  }
  try {
    const remote = await fetchRemoteLyrics(track, album);
    if (remote) {
      await writeCache(key, remote);
      return remote;
    }
  } catch (error) {
    if (!plainFallback) throw error;
  }
  return plainFallback;
}
