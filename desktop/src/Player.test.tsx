import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Player } from './App';
import type { ComponentProps } from 'react';
vi.mock('./jellyfin', async (importOriginal) => ({ ...await importOriginal<typeof import('./jellyfin')>(), getPlaybackDetails: () => new Promise(() => {}) }));
const preferences: ComponentProps<typeof Player>['preferences'] = {
  showAllMedia: false, libraryOrder: [], hiddenLibraryIds: [], subtitleColor: 'white', subtitleSize: 'medium', subtitleBackground: 'soft', skipSeconds: 10, gridDensity: 'comfortable', defaultSort: 'alphabetical', reducedMotion: false, autoEnglishSubtitles: true
};
afterEach(() => { cleanup(); delete window.prismWindow; });
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
