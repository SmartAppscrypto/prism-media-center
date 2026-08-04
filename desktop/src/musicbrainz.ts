import type { AlbumMetadata, MediaItem } from './types';

type MusicBrainzRelease = {
  id: string;
  score?: number;
  title?: string;
  date?: string;
  country?: string;
  status?: string;
  barcode?: string;
  'track-count'?: number;
  'release-group'?: { id?: string; 'primary-type'?: string };
  media?: Array<{ format?: string }>;
  'label-info'?: Array<{ 'catalog-number'?: string; label?: { name?: string } }>;
};

type CoverArtResponse = {
  images?: Array<{
    back?: boolean;
    types?: string[];
    image?: string;
    thumbnails?: Record<string, string>;
  }>;
};

const cache = new Map<string, Promise<AlbumMetadata | null>>();

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function releaseScore(release: MusicBrainzRelease, album: MediaItem) {
  const releaseYear = Number(release.date?.slice(0, 4));
  const yearScore = album.year && releaseYear
    ? releaseYear === album.year ? 35 : Math.max(0, 12 - Math.abs(releaseYear - album.year) * 4)
    : 0;
  const format = release.media?.[0]?.format?.toLowerCase() ?? '';
  const formatScore = format.includes('cd') ? 12 : format.includes('digital') ? 7 : 0;
  const countryScore = release.country === 'US' ? 5 : 0;
  const officialScore = release.status === 'Official' ? 4 : 0;
  return (release.score ?? 0) + yearScore + formatScore + countryScore + officialScore;
}

async function coverArtFor(releaseId: string) {
  const response = await fetch(`https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`, {
    headers: { Accept: 'application/json' }
  });
  if (response.status === 404) return undefined;
  if (!response.ok) return undefined;
  const data = await response.json() as CoverArtResponse;
  const back = data.images?.find((image) => image.back || image.types?.some((type) => type.toLowerCase() === 'back'));
  return back?.thumbnails?.['1200'] ?? back?.thumbnails?.['500'] ?? back?.image;
}

function mapRelease(release: MusicBrainzRelease, backCoverUrl?: string): AlbumMetadata {
  return {
    releaseId: release.id,
    releaseGroupId: release['release-group']?.id,
    releaseDate: release.date,
    country: release.country,
    status: release.status,
    format: release.media?.[0]?.format,
    trackCount: release['track-count'],
    barcode: release.barcode,
    labels: unique((release['label-info'] ?? []).map((entry) => entry.label?.name)),
    catalogNumbers: unique((release['label-info'] ?? []).map((entry) => entry['catalog-number'])),
    primaryType: release['release-group']?.['primary-type'],
    backCoverUrl,
    sourceUrl: `https://musicbrainz.org/release/${release.id}`
  };
}

async function lookupAlbum(album: MediaItem): Promise<AlbumMetadata | null> {
  const terms = [`release:\"${album.title.replaceAll('"', '')}\"`];
  if (album.artist) terms.push(`artist:\"${album.artist.replaceAll('"', '')}\"`);
  if (album.year) terms.push(`date:${album.year}`);
  const params = new URLSearchParams({ query: terms.join(' AND '), fmt: 'json', limit: '12' });
  const response = await fetch(`https://musicbrainz.org/ws/2/release/?${params}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`MusicBrainz returned ${response.status}.`);
  const data = await response.json() as { releases?: MusicBrainzRelease[] };
  const candidates = [...(data.releases ?? [])]
    .filter((release) => release.id)
    .sort((left, right) => releaseScore(right, album) - releaseScore(left, album));
  if (!candidates.length) return null;

  const artworkCandidates = candidates.slice(0, 6);
  const artwork = await Promise.all(artworkCandidates.map(async (release) => ({
    release,
    backCoverUrl: await coverArtFor(release.id)
  })));
  const withBack = artwork.find((candidate) => candidate.backCoverUrl);
  const selected = withBack ?? { release: candidates[0], backCoverUrl: undefined };
  return mapRelease(selected.release, selected.backCoverUrl);
}

export function getAlbumMetadata(album: MediaItem) {
  const key = [album.title, album.artist, album.year].join('|').toLowerCase();
  let result = cache.get(key);
  if (!result) {
    result = lookupAlbum(album).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, result);
  }
  return result;
}
