import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';

describe('Prism shell', () => {
  beforeEach(() => localStorage.clear());

  it('opens the demo library and inspects a title', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'EXPLORE THE DEMO' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open The Long Meridian' }));
    expect(screen.getByRole('heading', { name: 'The Long Meridian' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '▶ CONNECT TO PLAY' })).toBeInTheDocument();
  });
});
