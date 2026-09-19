import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayButton } from './PlayButton';

vi.mock('./uiSounds', () => ({ playUiTone: vi.fn() }));
import { playUiTone } from './uiSounds';

describe('PlayButton activation', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('plays one immediate tick and hands off once after the release transition', () => {
    const onPlay = vi.fn();
    render(<PlayButton ariaLabel="Play film" sound onPlay={onPlay} />);
    const button = screen.getByRole('button', { name: 'Play film' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(playUiTone).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();
    vi.advanceTimersByTime(220);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('does not launch on a cancelled press or keyboard focus loss', () => {
    const onPlay = vi.fn();
    render(<PlayButton ariaLabel="Play film" onPlay={onPlay} />);
    const button = screen.getByRole('button', { name: 'Play film' });
    fireEvent.keyDown(button, { key: ' ' });
    expect(button).toHaveClass('play--pressed');
    fireEvent.blur(button);
    expect(button).not.toHaveClass('play--pressed');
    fireEvent.pointerCancel(button);
    vi.runAllTimers();
    expect(onPlay).not.toHaveBeenCalled();
  });

  it.each(['app', 'system'])('skips the transition for %s reduced motion', (source) => {
    vi.stubGlobal('matchMedia', () => ({ matches: source === 'system' }));
    const onPlay = vi.fn();
    render(<PlayButton ariaLabel="Play film" reducedMotion={source === 'app'} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.play__ring')).toBeNull();
  });

  it('cancels pending playback when removed or disabled', () => {
    const onPlay = vi.fn();
    const { rerender, unmount } = render(<PlayButton ariaLabel="Play film" onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button'));
    rerender(<PlayButton ariaLabel="Play film" disabled onPlay={onPlay} />);
    vi.runAllTimers();
    fireEvent.click(screen.getByRole('button'));
    expect(onPlay).not.toHaveBeenCalled();
    rerender(<PlayButton ariaLabel="Play film" onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button'));
    unmount();
    vi.runAllTimers();
    expect(onPlay).not.toHaveBeenCalled();
  });
});
