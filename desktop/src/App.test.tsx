import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    fireEvent.click(within(morePage).getByRole('button', { name: 'Open Vermilion Coast' }));
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
