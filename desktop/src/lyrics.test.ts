import { describe, expect, it } from 'vitest';
import { activeLyricIndex, estimatedLyricIndex, estimatedLyricStart, parseLrc } from './lyrics';

describe('synchronized lyrics', () => {
  const lines = parseLrc('[00:03.20]First line\n[00:08.50][00:14.00]Chorus');

  it('parses and orders multiple LRC timestamps', () => {
    expect(lines).toEqual([
      { text: 'First line', startSeconds: 3.2 },
      { text: 'Chorus', startSeconds: 8.5 },
      { text: 'Chorus', startSeconds: 14 }
    ]);
  });

  it('selects the current line around playback time', () => {
    expect(activeLyricIndex(lines, 2)).toBe(-1);
    expect(activeLyricIndex(lines, 9)).toBe(1);
  });

  it('soft-syncs plain lyrics across the playable part of a track', () => {
    const plain = [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }];
    expect(estimatedLyricStart(0, plain.length, 100)).toBe(6);
    expect(estimatedLyricIndex(plain, 5, 100)).toBe(-1);
    expect(estimatedLyricIndex(plain, 52, 100)).toBe(1);
  });
});

describe('lyrics provider fallback', () => {
  it('continues to the public lyrics provider when server lyrics fail', async () => {
    const { vi } = await import('vitest');
    const { resolveTrackLyrics } = await import('./lyrics');
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).includes('/Lyrics')) throw new Error('Server lyrics unavailable');
      return { ok: true, json: async () => ({ syncedLyrics: '[00:01]Recovered line' }) };
    }));
    try {
      const lyrics = await resolveTrackLyrics({ id: 'fallback-audit', title: 'Test', artist: 'Test Artist', type: 'Audio', hue: 0 },
        { title: 'Test Album' }, { serverUrl: 'http://server', accessToken: 'test', userId: 'viewer', username: 'viewer' });
      expect(lyrics?.lines[0].text).toBe('Recovered line');
    } finally { vi.unstubAllGlobals(); }
  });
});
