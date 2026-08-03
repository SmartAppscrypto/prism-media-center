import { describe, expect, it } from 'vitest';
import { adaptivePlaybackUrl, directPlaybackUrl, directPlayMimeType } from './jellyfin';
import type { MediaItem, PlaybackDetails, PrismSession } from './types';

const baseDetails: PlaybackDetails = {
  mediaSourceId: 'source',
  path: '/media/Home Movies/clip.mp4',
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  videoCodec: 'h264',
  audioCodec: 'aac',
  subtitles: []
};

describe('playback selection', () => {
  it('identifies browser-compatible H.264/AAC MP4 files for direct play', () => {
    expect(directPlayMimeType(baseDetails)).toBe('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  });

  it('falls back for containers that Chromium cannot play directly', () => {
    expect(directPlayMimeType({ ...baseDetails, path: '/media/clip.mkv', container: 'matroska,webm' })).toBeUndefined();
  });

  it('allows audio stream-copy in adaptive playback', () => {
    const item = { id: 'item' } as MediaItem;
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;
    const url = new URL(adaptivePlaybackUrl(item, session, 'source'));
    expect(url.searchParams.get('AllowVideoStreamCopy')).toBe('true');
    expect(url.searchParams.get('AllowAudioStreamCopy')).toBe('true');
    expect(url.searchParams.get('MaxAudioChannels')).toBe('8');
  });

  it('includes the source extension in a static direct-play URL', () => {
    const item = { id: 'item' } as MediaItem;
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;
    const url = directPlaybackUrl(item, session, baseDetails);

    expect(url).toContain('/Videos/item/stream.mp4?');
    expect(url).toContain('Static=true');
    expect(url).toContain('MediaSourceId=source');
  });
});
