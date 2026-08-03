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
    `Version="0.2.0"`
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

export async function getPlaybackDetails(item: MediaItem, session: PrismSession): Promise<PlaybackDetails> {
  const result = await api<{
    MediaSources?: Array<{
      Id?: string;
      MediaStreams?: Array<{
        Type?: string;
        Index?: number;
        Language?: string;
        DisplayLanguage?: string;
        DisplayTitle?: string;
        Codec?: string;
        IsDefault?: boolean;
        IsForced?: boolean;
      }>;
    }>;
  }>(session.serverUrl, `/Items/${item.id}/PlaybackInfo?UserId=${encodeURIComponent(session.userId)}`, {}, session.accessToken);
  const source = result.MediaSources?.[0];
  const streams = source?.MediaStreams ?? [];
  const audio = streams.find((stream) => stream.Type === 'Audio' && stream.IsDefault)
    ?? streams.find((stream) => stream.Type === 'Audio');
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
    mediaSourceId: source?.Id || item.id,
    audioLanguage: audio?.Language,
    subtitles
  };
}

export function playbackUrl(item: MediaItem, session: PrismSession, mediaSourceId = item.id) {
  const params = new URLSearchParams({
    api_key: session.accessToken,
    DeviceId: deviceId(),
    MediaSourceId: mediaSourceId,
    PlaySessionId: crypto.randomUUID(),
    VideoCodec: 'h264',
    AudioCodec: 'aac',
    AudioBitrate: '192000',
    MaxAudioChannels: '2',
    TranscodingAudioChannels: '2',
    SegmentContainer: 'ts',
    MinSegments: '1',
    BreakOnNonKeyFrames: 'true',
    AllowVideoStreamCopy: 'true',
    AllowAudioStreamCopy: 'false',
    EnableAutoStreamCopy: 'true'
  });
  return `${session.serverUrl}/Videos/${item.id}/master.m3u8?${params}`;
}

export function subtitleUrl(item: MediaItem, session: PrismSession, mediaSourceId: string, streamIndex: number) {
  return `${session.serverUrl}/Videos/${item.id}/${encodeURIComponent(mediaSourceId)}/Subtitles/${streamIndex}/0/Stream.vtt?api_key=${encodeURIComponent(session.accessToken)}`;
}
