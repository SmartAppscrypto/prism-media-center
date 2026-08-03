import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { demoItems } from './demoData';
import { getLibrary, getPlaybackDetails, getViews, playbackUrl, signIn, subtitleUrl } from './jellyfin';
import type { LibraryView, MediaItem, PrismSession, SubtitleTrack } from './types';

const sessionKey = 'prism-session';

function formatRuntime(minutes?: number) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}H ${remainder}M` : `${remainder}M`;
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = Math.floor(seconds % 60);
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function Poster({ item, onSelect }: { item: MediaItem; onSelect?: (item: MediaItem) => void }) {
  const style = item.imageUrl
    ? { backgroundImage: `url("${item.imageUrl}")` }
    : { '--hue': item.hue } as React.CSSProperties;
  const artwork = (
    <>
      {!item.imageUrl && <span className="poster__geometry" />}
      {!item.imageUrl && <span className="poster__title">{item.title}</span>}
      <span className="poster__year">{item.year}</span>
    </>
  );
  return onSelect ? (
    <button className="poster" style={style} onClick={() => onSelect(item)} aria-label={`Open ${item.title}`}>{artwork}</button>
  ) : (
    <div className="poster" style={style} aria-label={`${item.title} poster`}>{artwork}</div>
  );
}

function Connect({ onConnected, onDemo }: { onConnected: (session: PrismSession) => void; onDemo: () => void }) {
  const [serverUrl, setServerUrl] = useState('http://192.168.1.10:8096');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      onConnected(await signIn(serverUrl, username, password));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="connect">
      <section className="connect__intro">
        <p className="eyebrow">YOUR COLLECTION · IN A NEW LIGHT</p>
        <h1>PRISM</h1>
        <p>Your films stay on your NAS. Prism turns them into a room worth wandering through.</p>
      </section>
      <form className="connect__form" onSubmit={submit}>
        <label>Server address<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} required /></label>
        <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={loading}>{loading ? 'CONNECTING…' : 'ENTER PRISM'}</button>
        <button className="text-button" type="button" onClick={onDemo}>EXPLORE THE DEMO</button>
      </form>
    </main>
  );
}

function Player({ item, session, onClose }: { item: MediaItem; session: PrismSession; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackError, setPlaybackError] = useState('');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [mediaSourceId, setMediaSourceId] = useState(item.id);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number | null>(null);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      setSubtitleMenuOpen(false);
    }, 3000);
  }, []);

  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    let cancelled = false;

    getPlaybackDetails(item, session).then((details) => {
      if (cancelled) return;
      setMediaSourceId(details.mediaSourceId);
      setSubtitleTracks(details.subtitles);
      const english = details.subtitles.find((track) => ['eng', 'en'].includes(track.language?.toLowerCase() ?? ''));
      const audioIsEnglish = ['eng', 'en'].includes(details.audioLanguage?.toLowerCase() ?? '');
      const automaticTrack = !audioIsEnglish ? english : details.subtitles.find((track) => track.isForced && ['eng', 'en'].includes(track.language?.toLowerCase() ?? ''));
      setSelectedSubtitle(automaticTrack?.index ?? null);

      const source = playbackUrl(item, session, details.mediaSourceId);
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => setPaused(true)));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setPlaybackError('Playback could not start. Check the Jellyfin transcoding log.');
        });
      } else {
        video.src = source;
        void video.play().catch(() => setPaused(true));
      }
    }).catch(() => setPlaybackError('Prism could not prepare this title for playback.'));

    return () => { cancelled = true; hls?.destroy(); };
  }, [item, session]);

  useEffect(() => {
    Array.from(videoRef.current?.textTracks ?? []).forEach((track, index) => {
      track.mode = subtitleTracks[index]?.index === selectedSubtitle ? 'showing' : 'disabled';
    });
  }, [selectedSubtitle, subtitleTracks]);

  useEffect(() => {
    revealChrome();
    return () => window.clearTimeout(idleTimerRef.current);
  }, [revealChrome]);

  useEffect(() => {
    function onPlayerKeyDown(event: KeyboardEvent) {
      revealChrome();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(event.key === 'ArrowRight' ? 10 : -10);
      } else if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePlayback();
      }
    }
    window.addEventListener('keydown', onPlayerKeyDown);
    return () => window.removeEventListener('keydown', onPlayerKeyDown);
  }, [revealChrome, seekBy, togglePlayback]);

  function updateVolume(nextVolume: number) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  }

  return (
    <div
      className={`player ${chromeVisible ? '' : 'player--idle'}`}
      onMouseMove={revealChrome}
      onMouseDown={revealChrome}
      onTouchStart={revealChrome}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        tabIndex={-1}
        onClick={togglePlayback}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onEnded={onClose}
      >
        {subtitleTracks.map((track) => (
          <track
            key={track.index}
            kind="subtitles"
            src={subtitleUrl(item, session, mediaSourceId, track.index)}
            srcLang={track.language || 'und'}
            label={track.label}
            default={selectedSubtitle === track.index}
            onLoad={() => {
              Array.from(videoRef.current?.textTracks ?? []).forEach((textTrack, index) => {
                textTrack.mode = subtitleTracks[index]?.index === selectedSubtitle ? 'showing' : 'disabled';
              });
            }}
          />
        ))}
      </video>
      <button onClick={onClose} className="player__close player__chrome" aria-label="Close player">← BACK</button>
      {playbackError && <p className="player__error" role="alert">{playbackError}</p>}
      <div className="player__controls player__chrome">
        <button onClick={togglePlayback} aria-label={paused ? 'Play' : 'Pause'}>{paused ? '▶' : 'Ⅱ'}</button>
        <span className="player__time">{formatClock(currentTime)}</span>
        <input
          className="player__scrubber"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => {
            const nextTime = Number(event.target.value);
            if (videoRef.current) videoRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          aria-label="Playback position"
        />
        <span className="player__time">{formatClock(duration)}</span>
        <button
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
          }}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >{muted ? 'MUTE' : 'VOL'}</button>
        <input
          className="player__volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={muted ? 0 : volume}
          onChange={(event) => updateVolume(Number(event.target.value))}
          aria-label="Volume"
        />
        <div className="subtitle-control">
          <button
            className={selectedSubtitle !== null ? 'subtitle-control__active' : ''}
            onClick={() => { setSubtitleMenuOpen((open) => !open); revealChrome(); }}
            aria-label="Subtitles"
            aria-expanded={subtitleMenuOpen}
          >CC</button>
          {subtitleMenuOpen && (
            <div className="subtitle-menu">
              <p>SUBTITLES</p>
              <button className={selectedSubtitle === null ? 'is-selected' : ''} onClick={() => setSelectedSubtitle(null)}>Off</button>
              {subtitleTracks.map((track) => (
                <button
                  key={track.index}
                  className={selectedSubtitle === track.index ? 'is-selected' : ''}
                  onClick={() => setSelectedSubtitle(track.index)}
                >{track.label}{track.isForced ? ' · FORCED' : ''}</button>
              ))}
              {!subtitleTracks.length && <span>No text subtitles</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<PrismSession | null>(() => {
    const stored = localStorage.getItem(sessionKey);
    if (!stored) return null;
    try { return JSON.parse(stored) as PrismSession; }
    catch { localStorage.removeItem(sessionKey); return null; }
  });
  const [demo, setDemo] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [views, setViews] = useState<LibraryView[]>([]);
  const [activeView, setActiveView] = useState<LibraryView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [libraryLoading, setLibraryLoading] = useState(false);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    localStorage.setItem(sessionKey, JSON.stringify(session));
    Promise.all([getViews(session), getLibrary(session)]).then(([serverViews, library]) => {
      if (!cancelled) { setViews(serverViews); setItems(library); }
    }).catch((reason: unknown) => {
      if (!cancelled) setLibraryError(reason instanceof Error ? reason.message : 'The library could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (playing) setPlaying(false);
        else if (selected) setSelected(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playing, selected]);

  const visibleItems = demo ? demoItems : items;

  function selectView(view: LibraryView | null) {
    if (!session) return;
    setActiveView(view);
    setMenuOpen(false);
    setSelected(null);
    setLibraryError('');
    setLibraryLoading(true);
    getLibrary(session, view ?? undefined).then(setItems).catch((reason: unknown) => {
      setLibraryError(reason instanceof Error ? reason.message : 'The library could not be loaded.');
    }).finally(() => setLibraryLoading(false));
  }

  function disconnect() {
    localStorage.removeItem(sessionKey);
    setSession(null);
    setDemo(false);
    setItems([]);
    setSelected(null);
  }

  if (!session && !demo) return <Connect onConnected={setSession} onDemo={() => setDemo(true)} />;
  if (playing && selected && session) return <Player item={selected} session={session} onClose={() => setPlaying(false)} />;

  return (
    <main className={`library ${selected ? 'library--inspect' : ''}`}>
      <header>
        <div className="header__brand">
          {!demo && <button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Open library menu"><span /><span /><span /></button>}
          <button className="wordmark" onClick={() => setSelected(null)}>PRISM</button>
        </div>
        <div className="header__right">
          <span>{demo ? 'DEMO LIBRARY' : `${visibleItems.length} TITLES`}</span>
          <button className="text-button" onClick={disconnect}>{demo ? 'CONNECT SERVER' : 'SIGN OUT'}</button>
        </div>
      </header>

      {!demo && (
        <>
          <button className={`drawer-scrim ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-label="Close library menu" />
          <aside className={`library-drawer ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
            <div className="library-drawer__top"><span>PRISM</span><button onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button></div>
            <p className="eyebrow">YOUR LIBRARIES</p>
            <nav>
              <button className={!activeView ? 'is-active' : ''} onClick={() => selectView(null)}><span>All Media</span><small>{!activeView ? visibleItems.length : ''}</small></button>
              {views.map((view, index) => (
                <button key={view.id} className={activeView?.id === view.id ? 'is-active' : ''} onClick={() => selectView(view)}>
                  <span>{view.name}</span><small>{String(index + 1).padStart(2, '0')}</small>
                </button>
              ))}
            </nav>
            <div className="library-drawer__footer"><span>{session?.username}</span><button onClick={disconnect}>SIGN OUT</button></div>
          </aside>
        </>
      )}

      {libraryError && <div className="library-error">{libraryError} <button onClick={disconnect}>Reconnect</button></div>}
      {!libraryError && (libraryLoading || !visibleItems.length) && <div className="loading">DEVELOPING {activeView?.name?.toUpperCase() || 'YOUR LIBRARY'}…</div>}

      <section className="wall" aria-label="Media library">
        {visibleItems.map((item) => <Poster key={item.id} item={item} onSelect={setSelected} />)}
      </section>

      {selected && (
        <section className="inspect" style={{
          '--selected-hue': selected.hue,
          ...(selected.backdropUrl ? { '--backdrop': `url("${selected.backdropUrl}")` } : {})
        } as React.CSSProperties}>
          <button className="inspect__scrim" onClick={() => setSelected(null)} aria-label="Reshelve title" />
          <div className="inspect__poster"><Poster item={selected} /></div>
          <article className="inspect__copy">
            <button className="reshelve" onClick={() => setSelected(null)}>← RESHELVE</button>
            <p className="eyebrow">{[selected.year, formatRuntime(selected.runtimeMinutes), selected.type.toUpperCase()].filter(Boolean).join(' · ')}</p>
            <h2>{selected.title}</h2>
            <p className="overview">{selected.overview || 'No synopsis is available for this title yet.'}</p>
            {demo ? (
              <button className="play play--disabled" onClick={() => alert('Connect Prism to your Jellyfin server to play your own media.')}><span>▶</span> CONNECT TO PLAY</button>
            ) : selected.type === 'Series' ? (
              <button className="play play--disabled" disabled><span>＋</span> EPISODE BROWSING NEXT</button>
            ) : selected.type === 'MusicAlbum' || selected.type === 'Audio' ? (
              <button className="play play--disabled" disabled><span>♫</span> MUSIC PLAYBACK NEXT</button>
            ) : (
              <button className="play" onClick={() => setPlaying(true)}><span>▶</span> PLAY</button>
            )}
          </article>
        </section>
      )}
    </main>
  );
}
