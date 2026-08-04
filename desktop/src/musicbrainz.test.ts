import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlbumMetadata } from './musicbrainz';

describe('MusicBrainz album metadata', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('selects a matching edition with confirmed rear artwork', async () => {
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/ws/2/release/')) return new Response(JSON.stringify({ releases: [
        {
          id: 'vinyl-release', score: 100, title: 'Test Album', date: '1995', country: 'US', status: 'Official',
          'track-count': 10, media: [{ format: '12" Vinyl' }], 'release-group': { id: 'group', 'primary-type': 'Album' }
        },
        {
          id: 'cd-release', score: 100, title: 'Test Album', date: '1995-07-04', country: 'US', status: 'Official',
          barcode: '12345', 'track-count': 12, media: [{ format: 'CD' }],
          'release-group': { id: 'group', 'primary-type': 'Album' },
          'label-info': [{ 'catalog-number': 'CAT-1', label: { name: 'Prism Records' } }]
        }
      ] }), { status: 200 });
      if (url.includes('cd-release')) return new Response(JSON.stringify({ images: [
        { back: true, thumbnails: { '1200': 'https://archive.example/back-1200.jpg' } }
      ] }), { status: 200 });
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', request);

    const metadata = await getAlbumMetadata({
      id: 'album-test', title: 'Test Album', artist: 'Test Artist', year: 1995, type: 'MusicAlbum', hue: 20
    });

    expect(metadata).toMatchObject({
      releaseId: 'cd-release', format: 'CD', trackCount: 12, barcode: '12345',
      labels: ['Prism Records'], catalogNumbers: ['CAT-1'], backCoverUrl: 'https://archive.example/back-1200.jpg'
    });
  });
});
