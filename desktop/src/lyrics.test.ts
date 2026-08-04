import { describe, expect, it } from 'vitest';
import { activeLyricIndex, estimatedLyricIndex, estimatedLyricStart, lyricLineProgress, parseLrc } from './lyrics';

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

  it('measures progress toward the next line', () => {
    expect(lyricLineProgress(lines, 0, 5.85, 20)).toBeCloseTo(.5);
  });

  it('soft-syncs plain lyrics across the playable part of a track', () => {
    const plain = [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }];
    expect(estimatedLyricStart(0, plain.length, 100)).toBe(6);
    expect(estimatedLyricIndex(plain, 5, 100)).toBe(-1);
    expect(estimatedLyricIndex(plain, 52, 100)).toBe(1);
  });
});
