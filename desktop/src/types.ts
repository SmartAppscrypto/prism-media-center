export type PrismSession = {
  serverUrl: string;
  accessToken: string;
  userId: string;
  username: string;
};

export type MediaItem = {
  id: string;
  title: string;
  year?: number;
  runtimeMinutes?: number;
  overview?: string;
  imageUrl?: string;
  backdropUrl?: string;
  type: 'Movie' | 'Series' | 'Episode' | 'Video' | 'MusicAlbum' | 'Audio';
  hue: number;
};

export type LibraryView = {
  id: string;
  name: string;
  collectionType?: string;
};

export type SubtitleTrack = {
  index: number;
  language?: string;
  label: string;
  isDefault: boolean;
  isForced: boolean;
};

export type PlaybackDetails = {
  mediaSourceId: string;
  audioLanguage?: string;
  subtitles: SubtitleTrack[];
};
