import { describe, expect, it } from 'vitest';
import { compareArtistsThenTitles, compareTitles, sortableTitle, titleInitial } from './sorting';

describe('film title sorting', () => {
  it('ignores a leading The for sorting and alphabet jumps', () => {
    expect(sortableTitle('The Matrix')).toBe('Matrix');
    expect(titleInitial('The Addams Family')).toBe('A');
  });

  it('does not remove the same letters from a word', () => {
    expect(sortableTitle('Theater Camp')).toBe('Theater Camp');
  });

  it('orders films by the meaningful title', () => {
    const titles = ['The Matrix', 'Arrival', 'The Addams Family'];
    expect(titles.sort(compareTitles)).toEqual(['The Addams Family', 'Arrival', 'The Matrix']);
  });

  it('orders music by artist and then album title', () => {
    const albums = [
      { artist: 'The Smiths', title: 'Meat Is Murder' },
      { artist: 'Björk', title: 'Post' },
      { artist: 'Björk', title: 'Debut' }
    ];
    expect(albums.sort(compareArtistsThenTitles).map((album) => album.title)).toEqual(['Debut', 'Post', 'Meat Is Murder']);
  });
});
