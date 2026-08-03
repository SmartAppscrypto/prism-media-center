import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptivePlaybackUrl, directPlaybackUrl, directPlayMimeType, getItemDetails, getLibrary, getPlaybackVersions, getSeriesEpisodes } from './jellyfin';
import type { MediaItem, PlaybackDetails, PrismSession } from './types';

const baseDetails: PlaybackDetails = {
  mediaSourceId: 'source',
  label: '1080p',
  path: '/media/Home Movies/clip.mp4',
  container: 'mov,mp4,m4a,3gp,3g2,mj2',
  videoCodec: 'h264',
  audioCodec: 'aac',
  subtitles: []
};

describe('playback selection', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('returns selectable versions while excluding grouped trailers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        MediaSources: [
          { Id: '4k', Name: 'Feature - 4K', Path: '/media/Feature - 4K.mkv', MediaStreams: [{ Type: 'Video', Codec: 'hevc', Height: 2160 }] },
          { Id: 'open-matte', Name: 'Feature - Open Matte', Path: '/media/Feature - Open Matte.mkv', MediaStreams: [{ Type: 'Video', Codec: 'h264', Height: 1080 }] },
          { Id: 'trailer', Name: '[Trailer-Theatrical Trailer]', Path: '/media/Feature[Trailer-Theatrical Trailer].mov', MediaStreams: [{ Type: 'Video', Codec: 'h264' }] }
        ]
      })
    }));

    const versions = await getPlaybackVersions({ id: 'item' } as MediaItem, { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' });
    expect(versions.map((version) => [version.mediaSourceId, version.label])).toEqual([
      ['4k', 'Feature - 4K'],
      ['open-matte', 'Feature - Open Matte']
    ]);
  });

  it('consolidates duplicate series that share a provider id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Items: [
        { Id: 'fallout-s1', Name: 'Fallout', Type: 'Series', ProductionYear: 2024, ProviderIds: { Tvdb: '416744' } },
        { Id: 'fallout-s2', Name: 'Fallout', Type: 'Series', ProductionYear: 2024, ProviderIds: { Tvdb: '416744' } }
      ] })
    }));

    const shows = await getLibrary({ serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' }, { id: 'shows', name: 'Shows', collectionType: 'tvshows' });
    expect(shows).toHaveLength(1);
    expect(shows[0].seriesIds).toEqual(['fallout-s1', 'fallout-s2']);
  });

  it('returns provider ids used for private TMDb enrichment', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ People: [], Studios: [], ProviderIds: { Tmdb: '22', Imdb: 'tt0325980' } })
    }));

    const details = await getItemDetails({ id: 'pirates' } as MediaItem, { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' });
    expect(details.tmdbId).toBe('22');
    expect(details.imdbId).toBe('tt0325980');
  });

  it('combines seasons and removes duplicate episode numbers', async () => {
    const response = (items: unknown[]) => ({ ok: true, json: async () => ({ Items: items }) });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response([{ Id: 's1e1', Name: 'The End', Type: 'Episode', ParentIndexNumber: 1, IndexNumber: 1 }]))
      .mockResolvedValueOnce(response([
        { Id: 's2e1', Name: 'The Innovator', Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 1 },
        { Id: 's2e2-a', Name: 'The Golden Rule', Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 2 },
        { Id: 's2e2-b', Name: 'The Golden Rule', Type: 'Episode', ParentIndexNumber: 2, IndexNumber: 2 }
      ])));

    const episodes = await getSeriesEpisodes({ id: 'fallout-s1', seriesIds: ['fallout-s1', 'fallout-s2'], title: 'Fallout', type: 'Series', hue: 195 }, { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' });
    expect(episodes.map((episode) => [episode.seasonNumber, episode.episodeNumber])).toEqual([[1, 1], [2, 1], [2, 2]]);
  });
});
