import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { playUiTone } from './uiSounds';
vi.mock('./uiSounds', () => ({ playUiTone: vi.fn() }));
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([
  ['Movie', 'movies'], ['Series', 'tvshows'], ['Video', 'homevideos'], ['MusicAlbum', 'music']
])('provides poster hover feedback for %s libraries', async (type, collectionType) => {
  localStorage.setItem('prism-session', JSON.stringify({ serverUrl: 'http://server', accessToken: 'test', userId: 'user', username: 'test' }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ Items: url.includes('/Views')
    ? [{ Id: 'library', Name: 'Library', CollectionType: collectionType }]
    : [{ Id: 'item', Name: 'Example', Type: type }] }) })));
  render(<App />);
  const poster = await screen.findByRole('button', { name: 'Open Example' });
  vi.mocked(playUiTone).mockClear();
  fireEvent.pointerEnter(poster);
  expect(playUiTone).toHaveBeenCalledWith('hover');
  expect(playUiTone).toHaveBeenCalledTimes(1);
});
