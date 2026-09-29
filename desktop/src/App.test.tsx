import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('Prism shell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('opens the demo library and inspects a title', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open The Long Meridian' }));
    expect(screen.getByRole('heading', { name: 'The Long Meridian' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect to play' })).toBeInTheDocument();
  });

  it('opens the full film page and links similar library titles', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open The Long Meridian' }));
    const moreButton = screen.getByRole('button', { name: 'More about The Long Meridian' });
    expect(moreButton).toHaveTextContent('•••');
    expect(moreButton).not.toHaveTextContent('MORE');
    fireEvent.click(moreButton);

    const morePage = screen.getByRole('region', { name: 'More about The Long Meridian' });
    expect(morePage).toBeInTheDocument();
    expect(screen.getByText('PRODUCTION FORMAT')).toBeInTheDocument();
    expect(screen.getByText('YOUR COPY')).toBeInTheDocument();
    expect(within(morePage).getByRole('button', { name: 'Open Vermilion Coast' })).toBeInTheDocument();
    fireEvent.click(within(morePage).getByRole('button', { name: 'Back to film' }));
    expect(screen.queryByRole('region', { name: 'More about The Long Meridian' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More about The Long Meridian' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'More about The Long Meridian' })).getByRole('button', { name: 'Open Vermilion Coast' }));
    expect(screen.getByRole('heading', { name: 'Vermilion Coast' })).toBeInTheDocument();
  });

  it('keeps header tools minimal while supporting sorting and alphabet jumps', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));

    expect(screen.queryByRole('button', { name: 'SIGN OUT' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to O' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Jump to Z' })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort library' }), { target: { value: 'released' } });
    const posterButtons = within(screen.getByRole('region', { name: 'Media library' })).getAllByRole('button');
    expect(posterButtons[0]).toHaveAccessibleName('Open Orbital Decay');
  });

  it('switches cleanly between pointer and arrow-key poster navigation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));

    const wall = screen.getByRole('region', { name: 'Media library' });
    const posters = within(wall).getAllByRole('button');
    fireEvent.pointerMove(posters[1]);
    expect(posters[1]).toHaveFocus();
    expect(wall).toHaveClass('wall--pointer');

    fireEvent.keyDown(posters[1], { key: 'ArrowRight' });
    expect(posters[2]).toHaveFocus();
    expect(wall).toHaveClass('wall--keyboard');

    fireEvent.pointerMove(posters[0]);
    expect(posters[0]).toHaveFocus();
    expect(wall).toHaveClass('wall--pointer');
  });

  it('returns from title details to the gallery top through the PRISM logo', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    const wall = screen.getByRole('region', { name: 'Media library' });
    const scrollTo = vi.fn();
    wall.scrollTo = scrollTo;
    fireEvent.click(screen.getByRole('button', { name: 'Open The Long Meridian' }));
    fireEvent.click(screen.getByRole('button', { name: 'More about The Long Meridian' }));
    fireEvent.click(screen.getByRole('button', { name: 'PRISM' }));
    expect(screen.queryByRole('heading', { name: 'The Long Meridian' })).not.toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(within(wall).getAllByRole('button')[0]).toHaveFocus();
  });

  it('lets directional navigation reach the top control and return to the first poster', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    const wall = screen.getByRole('region', { name: 'Media library' });
    wall.scrollTo = vi.fn();
    const posters = within(wall).getAllByRole('button');
    fireEvent.keyDown(posters[0], { key: 'ArrowUp' });
    const top = screen.getByRole('button', { name: 'Back to top' });
    expect(top).toHaveFocus();
    fireEvent.keyDown(top, { key: 'ArrowDown' });
    expect(posters[0]).toHaveFocus();
    fireEvent.keyDown(posters[3], { key: 'Home' });
    expect(wall.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(posters[0]).toHaveFocus();
  });

  it('refreshes random ordering without losing titles or changing the sort mode', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    const wall = screen.getByRole('region', { name: 'Media library' });
    wall.scrollTo = vi.fn();
    const sort = screen.getByRole('combobox', { name: 'Sort library' });
    expect(screen.queryByRole('button', { name: 'Refresh random sorting' })).not.toBeInTheDocument();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    fireEvent.change(sort, { target: { value: 'random' } });
    const titles = () => within(wall).getAllByRole('button').map((button) => button.getAttribute('aria-label'));
    const before = titles();
    random.mockReturnValue(0.999);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh random sorting' }));
    expect(titles()).not.toEqual(before);
    expect([...titles()].sort()).toEqual([...before].sort());
    expect(sort).toHaveValue('random');
    expect(wall.scrollTo).toHaveBeenCalled();
    random.mockRestore();
  });

  it('opens persistent settings with All Media hidden and reorderable libraries', async () => {
    localStorage.setItem('prism-session', JSON.stringify({ serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'steven' }));
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/Views') ? { Items: [
        { Id: 'home', Name: 'Home Videos and Photos', CollectionType: 'homevideos' },
        { Id: 'shows', Name: 'Shows', CollectionType: 'tvshows' },
        { Id: 'movies', Name: 'Movies', CollectionType: 'movies' }
      ] } : { Items: [] }
    })));

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Open library menu' }));
    expect(screen.queryByRole('button', { name: 'All Media' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(await screen.findByText('Movies')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Show All Media' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Move Shows up' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('prism-preferences') ?? '{}').libraryOrder.slice(0, 2)).toEqual(['shows', 'movies']));
  });
});

describe('audit regressions', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  const session = { serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'viewer' };
  const response = (Items: unknown[]) => ({ ok: true, json: async () => ({ Items }) });
  const views = [{ Id: 'movies', Name: 'Movies', CollectionType: 'movies' }, { Id: 'shows', Name: 'Shows', CollectionType: 'tvshows' }];

  it('recovers from invalid saved preference types and values', () => {
    localStorage.setItem('prism-preferences', JSON.stringify({ libraryOrder: null, hiddenLibraryIds: 42, defaultSort: 'bogus', skipSeconds: -100, reducedMotion: 'false' }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    expect(screen.getByRole('combobox', { name: 'Sort library' })).toHaveValue('alphabetical');
    expect(JSON.parse(localStorage.getItem('prism-preferences')!).skipSeconds).toBe(10);
    expect(screen.getByRole('main')).not.toHaveClass('library--reduced-motion');
  });

  it('shows an empty library after loading, and keeps the closed drawer inert', async () => {
    localStorage.setItem('prism-session', JSON.stringify(session));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.includes('/Views') ? views : [])));
    const { container } = render(<App />);
    expect(await screen.findByText(/No titles yet/)).toBeInTheDocument();
    expect(container.querySelector('.library-drawer')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Open library menu' }));
    expect(container.querySelector('.library-drawer')).not.toHaveAttribute('inert');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.querySelector('.library-drawer')).toHaveAttribute('inert');
  });

  it('ignores late responses after switching libraries quickly', async () => {
    localStorage.setItem('prism-session', JSON.stringify(session));
    let resolveShows!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/Views')) return Promise.resolve(response(views));
      if (url.includes('ParentId=shows')) return new Promise(resolve => { resolveShows = resolve; });
      return Promise.resolve(response([{ Id: 'movie', Name: 'Correct movie', Type: 'Movie' }]));
    }));
    render(<App />);
    await screen.findByRole('button', { name: 'Open Correct movie' });
    screen.getByRole('region', { name: 'Media library' }).scrollTo = vi.fn();
    fireEvent.click(screen.getByRole('button', { name: 'Open library menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Shows/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Open library menu' }));
    fireEvent.click(screen.getByRole('button', { name: /Movies/ }));
    await screen.findByRole('button', { name: 'Open Correct movie' });
    await act(async () => { resolveShows(response([{ Id: 'show', Name: 'Stale show', Type: 'Series' }])); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Stale show' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Open Correct movie' })).toBeInTheDocument();
  });

  it('sorts full dates and year-only releases on the same timeline', async () => {
    localStorage.setItem('prism-session', JSON.stringify(session));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => response(url.includes('/Views') ? views : [
      { Id: 'old', Name: 'Old', Type: 'Movie', ProductionYear: 1990 },
      { Id: 'new', Name: 'New', Type: 'Movie', PremiereDate: '2026-01-01T00:00:00Z' }
    ])));
    render(<App />);
    await screen.findByRole('button', { name: 'Open Old' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort library' }), { target: { value: 'released' } });
    expect(within(screen.getByRole('region', { name: 'Media library' })).getAllByRole('button')[0]).toHaveAccessibleName('Open New');
  });
});

it('shows title artwork when a server poster fails to load', async () => {
  localStorage.clear();
  localStorage.setItem('prism-session', JSON.stringify({ serverUrl: 'http://server', accessToken: 'token', userId: 'user', username: 'viewer' }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ Items: url.includes('/Views')
    ? [{ Id: 'movies', Name: 'Movies', CollectionType: 'movies' }]
    : [{ Id: 'test', Name: 'Missing poster', Type: 'Movie' }] }) })));
  try {
    render(<App />);
    const poster = await screen.findByRole('button', { name: 'Open Missing poster' });
    fireEvent.error(poster.querySelector('img')!);
    expect(poster).toHaveTextContent('Missing poster');
    expect(poster.querySelector('img')).toBeNull();
  } finally { cleanup(); vi.unstubAllGlobals(); }
});
