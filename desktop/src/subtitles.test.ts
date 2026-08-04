import { describe, expect, it } from 'vitest';
import { parseWebVtt } from './subtitles';

describe('PRISM subtitle rendering', () => {
  it('parses WebVTT cues and strips unsafe styling markup', () => {
    const cues = parseWebVtt('WEBVTT\n\n1\n00:00:02.500 --> 00:00:05.000 align:center\n<i>Hello</i><br>world');
    expect(cues).toEqual([{ start: 2.5, end: 5, text: 'Hello\nworld' }]);
  });

  it('accepts minute-only timestamps and comma milliseconds', () => {
    expect(parseWebVtt('00:04,250 --> 00:06,000\nForeign dialogue')[0]).toEqual({ start: 4.25, end: 6, text: 'Foreign dialogue' });
  });
});
