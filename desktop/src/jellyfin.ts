import type { LibraryView, MediaItem, PlaybackDetails, PrismSession } from './types';

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
    `Version="0.3.1"`
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
    Fields: 'Overview,PrimaryImageAspectRatio,ProductionYear,RunTimeTicks,BackdropImageTags',
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

  return result.Items.map((item, index) => {
    const id = String(item.Id);
    const backdropTags = item.BackdropImageTags as string[] | undefined;
    return {
      id,
      title: String(item.Name ?? 'Untitled'),
      year: typeof item.ProductionYear === 'number' ? item.ProductionYear : undefined,
      runtimeMinutes: typeof item.RunTimeTicks === 'number' ? Math.round(item.RunTimeTicks / 600_000_000) : undefined,
      overview: typeof item.Overview === 'string' ? item.Overview : undefined,
      type: (item.Type as MediaItem['type']) ?? 'Video',
      hue: (index * 47 + 195) % 360,
      imageUrl: `${session.serverUrl}/Items/${id}/Images/Primary?maxWidth=640&quality=90&api_key=${encodeURIComponent(session.accessToken)}`,
      backdropUrl: backdropTags?.length
        ? `${session.serverUrl}/Items/${id}/Images/Backdrop/0?maxWidth=1920&quality=88&api_key=${encodeURIComponent(session.accessToken)}`
        : undefined
    };
  });
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

export function adaptivePlaybackUrl(item: MediaItem, session: PrismSession, mediaSourceId = item.id) {
  const params = new URLSearchParams({
    api_key: session.accessToken,
    DeviceId: deviceId(),
    MediaSourceId: mediaSourceId,
    PlaySessionId: crypto.randomUUID(),
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    AudioBitrate: '192000',
    MaxAudioChannels: '8',
    TranscodingAudioChannels: '2',
    SegmentContainer: 'ts',
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
