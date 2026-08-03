import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';

describe('Prism shell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('opens the demo library and inspects a title', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open The Long Meridian' }));
    expect(screen.getByRole('heading', { name: 'The Long Meridian' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▶ CONNECT TO PLAY' })).toBeInTheDocument();
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
});
