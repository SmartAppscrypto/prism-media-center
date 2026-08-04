import type { LibraryView, MediaDetails, MediaItem, PlaybackDetails, PrismSession } from './types';

const deviceIdKey = 'prism-device-id';

function normalizedUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function deviceId() {
  let id = localStorage.getItem(deviceIdKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(deviceIdKey, id);
  }
  return id;
}

function authorization(token?: string) {
  const parts = [
    `Client="Prism"`,
    `Device="Desktop"`,
    `DeviceId="${deviceId()}"`,
    `Version="0.12.0"`
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(', ')}`;
}

async function api<T>(serverUrl: string, path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${normalizedUrl(serverUrl)}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: authorization(token),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'The username or password is incorrect.' : `Server returned ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function signIn(serverUrl: string, username: string, password: string): Promise<PrismSession> {
  const result = await api<{
    AccessToken: string;
    User: { Id: string; Name: string };
  }>(serverUrl, '/Users/AuthenticateByName', {
    method: 'POST',
    body: JSON.stringify({ Username: username, Pw: password })
  });

  return {
    serverUrl: normalizedUrl(serverUrl),
    accessToken: result.AccessToken,
    userId: result.User.Id,
    username: result.User.Name
  };
}

export async function getViews(session: PrismSession): Promise<LibraryView[]> {
  const result = await api<{ Items: Array<Record<string, unknown>> }>(
    session.serverUrl,
    `/Users/${session.userId}/Views`,
    {},
    session.accessToken
  );
  return result.Items.map((view) => ({
    id: String(view.Id),
    name: String(view.Name ?? 'Library'),
    collectionType: typeof view.CollectionType === 'string' ? view.CollectionType : undefined
  }));
}

function itemTypes(collectionType?: string) {
  if (collectionType === 'movies') return 'Movie';
  if (collectionType === 'tvshows') return 'Series';
  if (collectionType === 'homevideos') return 'Video';
  if (collectionType === 'music') return 'MusicAlbum';
  return 'Movie,Series,Video';
}

export async function getLibrary(session: PrismSession, view?: LibraryView): Promise<MediaItem[]> {
  const params = new URLSearchParams({
    userId: session.userId,
    Recursive: 'true',
    IncludeItemTypes: itemTypes(view?.collectionType),
    Fields: 'Overview,PrimaryImageAspectRatio,ProductionYear,PremiereDate,RunTimeTicks,BackdropImageTags,ProviderIds',
    ImageTypeLimit: '1',
    EnableImageTypes: 'Primary,Backdrop',
    SortBy: 'SortName',
    SortOrder: 'Ascending'
  });
  if (view) params.set('ParentId', view.id);
  const result = await api<{ Items: Array<Record<string, unknown>> }>(
    session.serverUrl,
    `/Users/${session.userId}/Items?${params}`,
    {},
    session.accessToken
  );

  const mapped = result.Items.map((item, index) => {
    const id = String(item.Id);
    const backdropTags = item.BackdropImageTags as string[] | undefined;
    const providerIds = item.ProviderIds as Record<string, string> | undefined;
    return {
      id,
      seriesIds: item.Type === 'Series' ? [id] : undefined,
      title: String(item.Name ?? 'Untitled'),
      year: typeof item.ProductionYear === 'number' ? item.ProductionYear : undefined,
      releaseDate: typeof item.PremiereDate === 'string' ? item.PremiereDate : undefined,
      runtimeMinutes: typeof item.RunTimeTicks === 'number' ? Math.round(item.RunTimeTicks / 600_000_000) : undefined,
      overview: typeof item.Overview === 'string' ? item.Overview : undefined,
      type: (item.Type as MediaItem['type']) ?? 'Video',
      hue: (index * 47 + 195) % 360,
      imageUrl: `${session.serverUrl}/Items/${id}/Images/Primary?maxWidth=640&quality=90&api_key=${encodeURIComponent(session.accessToken)}`,
      backdropUrl: backdropTags?.length
        ? `${session.serverUrl}/Items/${id}/Images/Backdrop/0?maxWidth=1920&quality=88&api_key=${encodeURIComponent(session.accessToken)}`
        : undefined,
      providerKey: item.Type === 'Series'
        ? providerIds?.Tvdb ? `tvdb:${providerIds.Tvdb}`
          : providerIds?.Tmdb ? `tmdb:${providerIds.Tmdb}`
            : `title:${String(item.Name ?? '').trim().toLowerCase()}:${item.ProductionYear ?? ''}`
        : undefined
    };
  });

  const series = new Map<string, (typeof mapped)[number]>();
  const consolidated: Array<(typeof mapped)[number]> = [];
  for (const item of mapped) {
    if (item.type !== 'Series' || !item.providerKey) {
      consolidated.push(item);
      continue;
    }
    const existing = series.get(item.providerKey);
    if (existing) {
      existing.seriesIds = [...(existing.seriesIds ?? [existing.id]), item.id];
    } else {
      series.set(item.providerKey, item);
      consolidated.push(item);
    }
  }
  return consolidated.map(({ providerKey: _providerKey, ...item }) => item);
}

function mapMediaItem(item: Record<string, unknown>, session: PrismSession, index = 0): MediaItem {
  const id = String(item.Id);
  const backdropTags = item.BackdropImageTags as string[] | undefined;
  return {
    id,
    title: String(item.Name ?? 'Untitled'),
    year: typeof item.ProductionYear === 'number' ? item.ProductionYear : undefined,
    releaseDate: typeof item.PremiereDate === 'string' ? item.PremiereDate : undefined,
    runtimeMinutes: typeof item.RunTimeTicks === 'number' ? Math.round(item.RunTimeTicks / 600_000_000) : undefined,
    overview: typeof item.Overview === 'string' ? item.Overview : undefined,
    type: (item.Type as MediaItem['type']) ?? 'Movie',
    hue: (index * 47 + 195) % 360,
    imageUrl: `${session.serverUrl}/Items/${id}/Images/Primary?maxWidth=640&quality=90&api_key=${encodeURIComponent(session.accessToken)}`,
    backdropUrl: backdropTags?.length
      ? `${session.serverUrl}/Items/${id}/Images/Backdrop/0?maxWidth=1920&quality=88&api_key=${encodeURIComponent(session.accessToken)}`
      : undefined
  };
}

export async function getItemDetails(item: MediaItem, session: PrismSession): Promise<MediaDetails> {
  const result = await api<Record<string, unknown>>(
    session.serverUrl,
    `/Users/${session.userId}/Items/${item.id}?Fields=People,Studios,Genres,ProductionLocations,ProviderIds,Taglines`,
    {},
    session.accessToken
  );
  const people = (result.People as Array<Record<string, unknown>> | undefined) ?? [];
  const studios = (result.Studios as Array<Record<string, unknown>> | undefined) ?? [];
  const providerIds = (result.ProviderIds as Record<string, string> | undefined) ?? {};
  const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  return {
    people: people.map((person) => {
      const id = typeof person.Id === 'string' ? person.Id : undefined;
      return {
        id,
        name: String(person.Name ?? 'Unknown'),
        role: typeof person.Role === 'string' ? person.Role : undefined,
        type: typeof person.Type === 'string' ? person.Type : undefined,
        imageUrl: id ? `${session.serverUrl}/Items/${id}/Images/Primary?maxWidth=320&quality=86&api_key=${encodeURIComponent(session.accessToken)}` : undefined
      };
    }),
    studios: studios.map((studio) => String(studio.Name ?? '')).filter(Boolean),
    genres: ((result.Genres as string[] | undefined) ?? []).filter(Boolean),
    productionLocations: ((result.ProductionLocations as string[] | undefined) ?? []).filter(Boolean),
    officialRating: typeof result.OfficialRating === 'string' ? result.OfficialRating : undefined,
    communityRating: numeric(result.CommunityRating),
    criticRating: numeric(result.CriticRating),
    tagline: ((result.Taglines as string[] | undefined) ?? [])[0],
    budget: numeric(result.Budget),
    revenue: numeric(result.Revenue) ?? numeric(result.BoxOffice),
    tmdbId: providerIds.Tmdb,
    imdbId: providerIds.Imdb
  };
}

export async function getSimilarItems(item: MediaItem, session: PrismSession): Promise<MediaItem[]> {
  const params = new URLSearchParams({
    userId: session.userId,
    limit: '18',
    Fields: 'Overview,ProductionYear,PremiereDate,RunTimeTicks,BackdropImageTags'
  });
  const result = await api<{ Items?: Array<Record<string, unknown>> }>(
    session.serverUrl,
    `/Items/${item.id}/Similar?${params}`,
    {},
    session.accessToken
  );
  return (result.Items ?? []).filter((similar) => similar.Type === 'Movie').map((similar, index) => mapMediaItem(similar, session, index));
}

export async function getSeriesEpisodes(series: MediaItem, session: PrismSession): Promise<MediaItem[]> {
  const seriesIds = series.seriesIds?.length ? series.seriesIds : [series.id];
  const results = await Promise.all(seriesIds.map((seriesId) => api<{ Items: Array<Record<string, unknown>> }>(
    session.serverUrl,
    `/Shows/${seriesId}/Episodes?UserId=${encodeURIComponent(session.userId)}&Fields=Overview,RunTimeTicks,PrimaryImageAspectRatio`,
    {},
    session.accessToken
  )));
  const episodes = results.flatMap((result) => result.Items).map((episode, index) => {
    const id = String(episode.Id);
    return {
      id,
      title: String(episode.Name ?? `Episode ${episode.IndexNumber ?? index + 1}`),
      seasonNumber: typeof episode.ParentIndexNumber === 'number' ? episode.ParentIndexNumber : 0,
      episodeNumber: typeof episode.IndexNumber === 'number' ? episode.IndexNumber : index + 1,
      runtimeMinutes: typeof episode.RunTimeTicks === 'number' ? Math.round(episode.RunTimeTicks / 600_000_000) : undefined,
      overview: typeof episode.Overview === 'string' ? episode.Overview : undefined,
      type: 'Episode' as const,
      hue: series.hue,
      imageUrl: `${session.serverUrl}/Items/${id}/Images/Primary?maxWidth=720&quality=88&api_key=${encodeURIComponent(session.accessToken)}`
    };
  });
  const unique = new Map<string, MediaItem>();
  for (const episode of episodes) {
    const key = `${episode.seasonNumber}:${episode.episodeNumber}`;
    if (!unique.has(key)) unique.set(key, episode);
  }
  return [...unique.values()].sort((a, b) =>
    (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0)
  );
}

type JellyfinMediaStream = {
  Type?: string;
  Index?: number;
  Language?: string;
  DisplayLanguage?: string;
  DisplayTitle?: string;
  Codec?: string;
  Width?: number;
  Height?: number;
  IsDefault?: boolean;
  IsForced?: boolean;
};

type JellyfinMediaSource = {
  Id?: string;
  Name?: string;
  Path?: string;
  Container?: string;
  MediaStreams?: JellyfinMediaStream[];
};

function versionLabel(source: JellyfinMediaSource, video?: JellyfinMediaStream) {
  if (source.Name?.trim()) return source.Name.trim();
  const filename = source.Path?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '').trim();
  if (filename) return filename;
  if (video?.Height) return video.Height >= 2160 ? '4K' : `${video.Height}p`;
  return 'Default';
}

function mapPlaybackDetails(item: MediaItem, source: JellyfinMediaSource): PlaybackDetails {
  const streams = source.MediaStreams ?? [];
  const audio = streams.find((stream) => stream.Type === 'Audio' && stream.IsDefault)
    ?? streams.find((stream) => stream.Type === 'Audio');
  const video = streams.find((stream) => stream.Type === 'Video');
  const textCodecs = new Set(['srt', 'subrip', 'ass', 'ssa', 'webvtt', 'vtt']);
  const subtitles = streams
    .filter((stream) => stream.Type === 'Subtitle' && typeof stream.Index === 'number' && textCodecs.has(String(stream.Codec).toLowerCase()))
    .map((stream) => ({
      index: stream.Index as number,
      language: stream.Language,
      label: stream.DisplayTitle || stream.DisplayLanguage || stream.Language?.toUpperCase() || `Subtitle ${stream.Index}`,
      isDefault: Boolean(stream.IsDefault),
      isForced: Boolean(stream.IsForced)
    }));
  return {
    mediaSourceId: source.Id || item.id,
    label: versionLabel(source, video),
    path: source.Path,
    container: source.Container,
    videoCodec: video?.Codec,
    audioCodec: audio?.Codec,
    width: video?.Width,
    height: video?.Height,
    audioLanguage: audio?.Language,
    subtitles
  };
}

export async function getPlaybackVersions(item: MediaItem, session: PrismSession): Promise<PlaybackDetails[]> {
  const result = await api<{
    MediaSources?: JellyfinMediaSource[];
  }>(session.serverUrl, `/Items/${item.id}/PlaybackInfo?UserId=${encodeURIComponent(session.userId)}`, {}, session.accessToken);
  const sources = result.MediaSources?.filter((source) => !/^\[?trailer(?:-|\]|\s)/i.test(source.Name?.trim() ?? '')) ?? [];
  return (sources.length ? sources : result.MediaSources?.slice(0, 1) ?? [{}]).map((source) => mapPlaybackDetails(item, source));
}

export async function getPlaybackDetails(item: MediaItem, session: PrismSession, mediaSourceId?: string): Promise<PlaybackDetails> {
  const versions = await getPlaybackVersions(item, session);
  return versions.find((version) => version.mediaSourceId === mediaSourceId) ?? versions[0];
}

function sourceExtension(details: PlaybackDetails) {
  const match = details.path?.match(/\.([a-z0-9]+)$/i);
  if (match) return match[1].toLowerCase();
  return details.container?.split(',')[0].toLowerCase();
}

export function directPlayMimeType(details: PlaybackDetails) {
  const extension = sourceExtension(details);
  const videoCodecs: Record<string, string> = {
    h264: 'avc1.42E01E',
    hevc: 'hvc1',
    h265: 'hvc1',
    av1: 'av01.0.05M.08',
    vp8: 'vp8',
    vp9: 'vp09.00.10.08'
  };
  const audioCodecs: Record<string, string> = {
    aac: 'mp4a.40.2',
    mp3: 'mp3',
    opus: 'opus',
    vorbis: 'vorbis',
    ac3: 'ac-3',
    eac3: 'ec-3'
  };
  const videoCodec = videoCodecs[details.videoCodec?.toLowerCase() ?? ''];
  const audioCodec = details.audioCodec ? audioCodecs[details.audioCodec.toLowerCase()] : undefined;
  if (!videoCodec || (details.audioCodec && !audioCodec)) return undefined;
  const codecs = audioCodec ? `${videoCodec}, ${audioCodec}` : videoCodec;

  if (['mp4', 'm4v', 'mov'].includes(extension ?? '')) {
    return `video/mp4; codecs="${codecs}"`;
  }
  if (extension === 'webm' && ['vp8', 'vp9', 'av1'].includes(details.videoCodec?.toLowerCase() ?? '')) {
    return `video/webm; codecs="${codecs}"`;
  }
  return undefined;
}

export function directStreamMimeType(details: PlaybackDetails) {
  const videoCodecs: Record<string, string> = {
    h264: 'avc1.42E01E',
    hevc: 'hvc1',
    h265: 'hvc1',
    av1: 'av01.0.05M.08',
    vp8: 'vp8',
    vp9: 'vp09.00.10.08'
  };
  const audioCodecs: Record<string, string> = {
    aac: 'mp4a.40.2',
    mp3: 'mp3',
    opus: 'opus',
    vorbis: 'vorbis',
    ac3: 'ac-3',
    eac3: 'ec-3'
  };
  const videoCodec = videoCodecs[details.videoCodec?.toLowerCase() ?? ''];
  const audioCodec = details.audioCodec ? audioCodecs[details.audioCodec.toLowerCase()] : undefined;
  if (!videoCodec || (details.audioCodec && !audioCodec)) return undefined;
  return `video/mp4; codecs="${audioCodec ? `${videoCodec}, ${audioCodec}` : videoCodec}"`;
}

export function directPlaybackUrl(item: MediaItem, session: PrismSession, details: PlaybackDetails) {
  const extension = sourceExtension(details) || 'mp4';
  const params = new URLSearchParams({
    api_key: session.accessToken,
    Static: 'true',
    DeviceId: deviceId(),
    MediaSourceId: details.mediaSourceId
  });
  return `${session.serverUrl}/Videos/${item.id}/stream.${encodeURIComponent(extension)}?${params}`;
}

export function adaptivePlaybackUrl(item: MediaItem, session: PrismSession, details: PlaybackDetails) {
  const videoCodec = ({ h265: 'hevc' } as Record<string, string>)[details.videoCodec?.toLowerCase() ?? '']
    ?? details.videoCodec?.toLowerCase()
    ?? 'h264';
  const audioCodec = details.audioCodec?.toLowerCase() ?? 'aac';
  const params = new URLSearchParams({
    api_key: session.accessToken,
    DeviceId: deviceId(),
    MediaSourceId: details.mediaSourceId,
    PlaySessionId: crypto.randomUUID(),
    VideoCodec: videoCodec,
    AudioCodec: audioCodec,
    MaxAudioChannels: '8',
    SegmentContainer: 'mp4',
    MinSegments: '1',
    BreakOnNonKeyFrames: 'true',
    AllowVideoStreamCopy: 'true',
    AllowAudioStreamCopy: 'true',
    EnableAutoStreamCopy: 'true'
  });
  return `${session.serverUrl}/Videos/${item.id}/master.m3u8?${params}`;
}

export function subtitleUrl(item: MediaItem, session: PrismSession, mediaSourceId: string, streamIndex: number) {
  return `${session.serverUrl}/Videos/${item.id}/${encodeURIComponent(mediaSourceId)}/Subtitles/${streamIndex}/0/Stream.vtt?api_key=${encodeURIComponent(session.accessToken)}`;
}
