import { waitFor, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Player } from './App';
import type { ComponentProps } from 'react';
const playback = vi.hoisted(() => vi.fn());
vi.mock('./jellyfin', async (importOriginal) => ({ ...await importOriginal<typeof import('./jellyfin')>(), getPlaybackDetails: playback }));
beforeEach(() => {
  playback.mockImplementation(() => new Promise(() => {}));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
const preferences: ComponentProps<typeof Player>['preferences'] = {
  showAllMedia: false, libraryOrder: [], hiddenLibraryIds: [], subtitleColor: 'white', subtitleSize: 'medium', subtitleBackground: 'soft', skipSeconds: 10, gridDensity: 'comfortable', defaultSort: 'alphabetical', reducedMotion: false, autoEnglishSubtitles: true
};
afterEach(() => { cleanup(); delete window.prismWindow; delete window.prismNativePlayer; vi.restoreAllMocks(); vi.useRealTimers(); });
describe('desktop player controls', () => {
  it.each(['darwin', 'win32'])('offers a dedicated fullscreen control on %s', (platform) => {
    const toggleFullscreen = vi.fn();
    window.prismWindow = { platform, toggleFullscreen, setFullscreen: vi.fn() } as unknown as Window['prismWindow'];
    const { container } = render(<Player item={{ id: '1', title: 'Test', type: 'Movie', hue: 0 }} session={{ serverUrl: 'http://localhost:8096', accessToken: 'test', userId: '1', username: 'viewer' }} preferences={preferences} onPreferencesChange={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle full screen' }));
    expect(toggleFullscreen).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.player__drag-region')).toBeInTheDocument();
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 3600, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: 600, configurable: true });
    fireEvent.durationChange(video); fireEvent.timeUpdate(video);
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('50:00');
  });
});

const props = {
  item: { id: '1', title: 'Test', type: 'Movie' as const, hue: 0 },
  session: { serverUrl: 'http://localhost:8096', accessToken: 'test', userId: '1', username: 'viewer' },
  preferences, onPreferencesChange: () => {}, onClose: () => {}
};
describe('player audit regressions', () => {
  it('keeps slider arrows and button activation separate from global shortcuts', () => {
    const toggleFullscreen = vi.fn();
    window.prismWindow = { platform: 'darwin', toggleFullscreen } as unknown as Window['prismWindow'];
    const { container } = render(<Player {...props} />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: 60, configurable: true });
    video.currentTime = 20;
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Volume' }), { key: 'ArrowRight' });
    expect(video.currentTime).toBe(20);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(video.currentTime).toBe(30);
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    expect(toggleFullscreen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'f' });
    expect(toggleFullscreen).toHaveBeenCalledOnce();
  });
  it('does not put infinity into the scrubber for unknown durations', () => {
    const { container } = render(<Player {...props} />);
    const video = container.querySelector('video')!;
    Object.defineProperty(video, 'duration', { value: Infinity });
    fireEvent.durationChange(video);
    expect(screen.getByRole('slider', { name: 'Playback position' })).toHaveAttribute('max', '0');
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('—');
  });
  it('restores the previous native volume and reports bridge failures', async () => {
    playback.mockResolvedValue({ mediaSourceId: '1', label: 'Test', subtitles: [] });
    let volume = 35;
    const state = vi.fn(async () => ({ timeMs: 1000, durationMs: 30000, volume, playing: true, paused: false, ended: false }));
    const setVolume = vi.fn(async (value: number) => { volume = value * 100; return true; });
    window.prismNativePlayer = { status: async () => ({ available: true }), start: async () => ({ ok: true }),
      state, setVolume, disableSubtitles: async () => true, stop: async () => true } as unknown as Window['prismNativePlayer'];
    render(<Player {...props} />);
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0.35'));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0'));
    await new Promise(resolve => setTimeout(resolve, 300));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(setVolume).toHaveBeenLastCalledWith(.35);
    state.mockRejectedValue(new Error('IPC unavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('stopped responding');
  });
});
