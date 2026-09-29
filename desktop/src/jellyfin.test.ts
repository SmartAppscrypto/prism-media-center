import { afterEach, describe, expect, it, vi } from 'vitest';
import { signIn, normalizeServerJson, adaptivePlaybackUrl, audioPlaybackUrl, directPlaybackUrl, directPlayMimeType, directStreamMimeType, downloadRemoteSubtitle, getAlbumTracks, getItemDetails, getLibrary, getPersonMovies, getPlaybackVersions, getSeriesEpisodes, getServerLyrics, searchRemoteSubtitles } from './jellyfin';
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

  it('describes preserved HEVC and E-AC-3 streams for client capability checks', () => {
    expect(directStreamMimeType({ ...baseDetails, videoCodec: 'hevc', audioCodec: 'eac3' })).toBe('video/mp4; codecs="hvc1, ec-3"');
  });

  it('allows audio stream-copy in adaptive playback', () => {
    const item = { id: 'item' } as MediaItem;
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;
    const url = new URL(adaptivePlaybackUrl(item, session, { ...baseDetails, path: '/media/feature.mkv', container: 'mkv', videoCodec: 'hevc', audioCodec: 'eac3' }));
    expect(url.searchParams.get('AllowVideoStreamCopy')).toBe('true');
    expect(url.searchParams.get('AllowAudioStreamCopy')).toBe('true');
    expect(url.searchParams.get('VideoCodec')).toBe('hevc');
    expect(url.searchParams.get('AudioCodec')).toBe('eac3');
    expect(url.searchParams.get('SegmentContainer')).toBe('mp4');
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

  it('maps music libraries to albums with artist information', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Items: [{
        Id: 'album',
        Name: 'Kind of Blue',
        Type: 'MusicAlbum',
        AlbumArtist: 'Miles Davis',
        ProductionYear: 1959
      }] })
    }));

    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;
    const albums = await getLibrary(session, { id: 'music', name: 'Music', collectionType: 'music' });

    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({ title: 'Kind of Blue', artist: 'Miles Davis', type: 'MusicAlbum', year: 1959 });
    const requestUrl = String(vi.mocked(fetch).mock.calls[0][0]);
    expect(new URL(requestUrl).searchParams.get('IncludeItemTypes')).toBe('MusicAlbum');
  });

  it('loads album tracks in disc and track order for direct audio playback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ Items: [{
        Id: 'track-1',
        Name: 'So What',
        Type: 'Audio',
        AlbumArtist: 'Miles Davis',
        ParentIndexNumber: 1,
        IndexNumber: 1,
        RunTimeTicks: 5400000000
      }] })
    }));
    const session = { serverUrl: 'http://server/', accessToken: 'a token', userId: 'user', username: 'name' } as PrismSession;
    const tracks = await getAlbumTracks({ id: 'album', title: 'Kind of Blue', type: 'MusicAlbum', hue: 195 }, session);

    expect(tracks[0]).toMatchObject({ title: 'So What', artist: 'Miles Davis', trackNumber: 1, discNumber: 1, runtimeMinutes: 9 });
    expect(audioPlaybackUrl(tracks[0], session)).toBe('http://server/Audio/track-1/stream?Static=true&api_key=a%20token');
  });

  it('recognizes progressing lyric timestamps even when server metadata omits the synchronized flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        Metadata: { IsSynced: false },
        Lyrics: [
          { Text: 'First line', Start: 50_000_000 },
          { Text: 'Second line', Start: 120_000_000 }
        ]
      })
    }));
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;

    await expect(getServerLyrics({ id: 'track' } as MediaItem, session)).resolves.toMatchObject({
      synced: true,
      lines: [{ text: 'First line', startSeconds: 5 }, { text: 'Second line', startSeconds: 12 }]
    });
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

  it('loads only library movies for a selected cast member', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Items: [{ Id: 'movie-1', Name: 'I, Robot', Type: 'Movie', ProductionYear: 2004 }] })
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;

    await expect(getPersonMovies({ id: 'will-smith', name: 'Will Smith', type: 'Actor' }, session)).resolves.toMatchObject([
      { id: 'movie-1', title: 'I, Robot', type: 'Movie', year: 2004 }
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('PersonIds=will-smith');
    expect(String(fetchMock.mock.calls[0][0])).toContain('IncludeItemTypes=Movie');
  });

  it('resolves name-only crew entries before loading their movies', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ Id: 'alex-proyas' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ Items: [{ Id: 'dark-city', Name: 'Dark City', Type: 'Movie' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;

    await expect(getPersonMovies({ name: 'Alex Proyas', role: 'Director' }, session)).resolves.toMatchObject([
      { id: 'dark-city', title: 'Dark City' }
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/Persons/Alex%20Proyas');
    expect(String(fetchMock.mock.calls[1][0])).toContain('PersonIds=alex-proyas');
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

  it('identifies forced and hash-matched remote subtitles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        Id: 'provider-result',
        Name: 'English foreign parts only',
        ProviderName: 'Open Subtitles',
        Format: 'srt',
        Forced: true,
        IsHashMatch: true,
        DownloadCount: 42
      }]
    }));

    const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;
    await expect(searchRemoteSubtitles({ id: 'item' } as MediaItem, session)).resolves.toEqual([{
      id: 'provider-result',
      name: 'English foreign parts only',
      provider: 'Open Subtitles',
      format: 'srt',
      forced: true,
      hashMatch: true,
      downloads: 42
    }]);
  });

  it('downloads a selected remote subtitle without restarting playback itself', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const session = { serverUrl: 'http://server/', accessToken: 'token', userId: 'user', username: 'name' } as PrismSession;

    await downloadRemoteSubtitle({ id: 'item' } as MediaItem, session, 'provider/result');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://server/Items/item/RemoteSearch/Subtitles/provider%2Fresult',
      expect.objectContaining({ method: 'POST' })
    );
  });
});


describe('Jellyfin 12 compatibility', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('normalizes nested DTOs without renaming provider dictionary keys', () => {
    expect(normalizeServerJson({ items: [{ id: 'one', providerIds: { MusicBrainzAlbum: 'mb' }, mediaSources: [{ runTimeTicks: 100 }] }] }))
      .toEqual({ Items: [{ Id: 'one', ProviderIds: { MusicBrainzAlbum: 'mb' }, MediaSources: [{ RunTimeTicks: 100 }] }] });
  });
  it('signs in and loads a camelCase library', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ accessToken: 'test', user: { id: 'u', name: 'viewer' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'one', name: 'My Movie', type: 'Movie', runTimeTicks: 600000000 }] }) }));
    const session = await signIn('http://localhost:8096', 'viewer', 'test');
    expect(session.accessToken).toBe('test');
    expect((await getLibrary(session))[0]).toMatchObject({ id: 'one', title: 'My Movie' });
  });
});

describe('authenticated request boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());
  const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'viewer' };
  it('rejects unsafe server addresses before attempting authentication', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    for (const url of ['file:///tmp/media', 'https://user:pass@server', 'https://server?token=x', 'https://server#x']) {
      await expect(signIn(url, 'viewer', 'password')).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds authenticated auxiliary requests and prevents redirects', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ Lyrics: [] }) });
    vi.stubGlobal('fetch', fetch);
    await getServerLyrics({ id: 'item' } as MediaItem, session);
    await downloadRemoteSubtitle({ id: 'item' } as MediaItem, session, 'subtitle');
    for (const [, init] of fetch.mock.calls) {
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it('encodes server-provided identifiers as a single URL segment', () => {
    const result = new URL(directPlaybackUrl({ id: 'item/other?test' } as MediaItem, session, baseDetails));
    expect(result.pathname).toBe('/Videos/item%2Fother%3Ftest/stream.mp4');
  });
});
