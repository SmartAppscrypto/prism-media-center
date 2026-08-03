import type { MediaItem } from './types';

const films = [
  ['Vermilion Coast', 1974, 25], ['Night Static', 1999, 260],
  ['The Long Meridian', 2012, 195], ['Saltwater Hymn', 1968, 210],
  ['Paper Moons', 1987, 80], ['Orbital Decay', 2021, 230],
  ['The Winter Palace', 1965, 250], ['Cassette', 1983, 330],
  ['Low Country', 2007, 140], ['Neon Cathedral', 1995, 310],
  ['The Last Projectionist', 2019, 45], ['Amber & Ash', 1978, 55],
  ['Midnight Freight', 1955, 240], ['The Glass Divide', 2016, 200],
  ['Sirocco', 1962, 35], ['Half Light', 2003, 270],
  ['The Cartographer', 1991, 150], ['Nocturne No. 9', 2014, 290]
] as const;

export const demoItems: MediaItem[] = films.map(([title, year, hue], index) => ({
  id: `demo-${index}`,
  title,
  year,
  hue,
  runtimeMinutes: 98 + (index * 7) % 48,
  type: 'Movie',
  overview: index === 2
    ? 'A government surveyor is sent to chart the last unmapped valley on the continent — and finds a town that has been waiting for him for forty years.'
    : 'A forgotten story returns in a wash of light, memory, and impossible choices.'
}));

