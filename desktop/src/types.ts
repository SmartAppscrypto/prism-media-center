export type PrismSession = {
  serverUrl: string;
  accessToken: string;
  userId: string;
  username: string;
};

export type MediaItem = {
  id: string;
  seriesIds?: string[];
  title: string;
  year?: number;
  releaseDate?: string;
  seasonNumber?: number;
  episodeNumber?: number;
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
  label: string;
  path?: string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  audioLanguage?: string;
  subtitles: SubtitleTrack[];
};

export type MediaPerson = {
  id?: string;
  name: string;
  role?: string;
  type?: string;
  imageUrl?: string;
};

export type MediaDetails = {
  people: MediaPerson[];
  studios: string[];
  genres: string[];
  productionLocations: string[];
  officialRating?: string;
  communityRating?: number;
  criticRating?: number;
  tagline?: string;
  budget?: number;
  revenue?: number;
  tmdbId?: string;
  imdbId?: string;
  financialSource?: 'TMDb';
};
