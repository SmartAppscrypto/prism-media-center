import { FormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { demoItems } from './demoData';
import { adaptivePlaybackUrl, audioPlaybackUrl, directPlaybackUrl, directPlayMimeType, directStreamMimeType, downloadRemoteSubtitle, getAlbumTracks, getItemDetails, getLibrary, getPlaybackDetails, getPlaybackVersions, getSeriesEpisodes, getSimilarItems, getViews, searchRemoteSubtitles, signIn, subtitleUrl } from './jellyfin';
import prismPlayAsset from './prismPlayAsset';
import type { AlbumMetadata, LibraryView, MediaDetails, MediaItem, PlaybackDetails, PrismSession, ProductionDetails, ProductionScanProgress, RemoteSubtitle, SubtitleTrack } from './types';
import { compareTitles, titleInitial } from './sorting';
import { parseWebVtt, type SubtitleCue } from './subtitles';
import { analyseFrequencyData, type AudioBands } from './audioReactive';
import { getAlbumMetadata } from './musicbrainz';

const sessionKey = 'prism-session';
const preferencesKey = 'prism-preferences';

function PrismPlayMark() {
  return (
    <span className="play__mark" aria-hidden="true">
      <span className="play__image-frame"><img src={prismPlayAsset} alt="" /></span>
      <span className="play__glint" />
    </span>
  );
}

type SortMode = 'alphabetical' | 'random' | 'released';
type PrismPreferences = {
  showAllMedia: boolean;
  libraryOrder: string[];
  hiddenLibraryIds: string[];
  subtitleColor: 'white' | 'warm' | 'yellow' | 'cyan';
  subtitleSize: 'small' | 'medium' | 'large';
  subtitleBackground: 'none' | 'soft' | 'strong';
  skipSeconds: 10 | 15 | 30;
  gridDensity: 'cinematic' | 'comfortable' | 'compact';
  defaultSort: SortMode;
  reducedMotion: boolean;
  autoEnglishSubtitles: boolean;
};

const defaultPreferences: PrismPreferences = {
  showAllMedia: false,
  libraryOrder: [],
  hiddenLibraryIds: [],
  subtitleColor: 'white',
  subtitleSize: 'medium',
  subtitleBackground: 'soft',
  skipSeconds: 10,
  gridDensity: 'comfortable',
  defaultSort: 'alphabetical',
  reducedMotion: false,
  autoEnglishSubtitles: true
};

function loadPreferences(): PrismPreferences {
  try {
    return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(preferencesKey) ?? '{}') } as PrismPreferences;
  } catch {
    return defaultPreferences;
  }
}

function defaultLibraryRank(view: LibraryView) {
  if (view.collectionType === 'movies' || view.name.toLowerCase() === 'movies') return 0;
  if (view.collectionType === 'tvshows' || view.name.toLowerCase() === 'shows') return 1;
  if (view.collectionType === 'homevideos') return 2;
  if (view.collectionType === 'music') return 3;
  if (view.name.toLowerCase().includes('playlist')) return 4;
  return 5;
}

function orderLibraryViews(views: LibraryView[], savedOrder: string[]) {
  const savedPositions = new Map(savedOrder.map((id, index) => [id, index]));
  return [...views].sort((a, b) => {
    const aSaved = savedPositions.get(a.id);
    const bSaved = savedPositions.get(b.id);
    if (aSaved !== undefined || bSaved !== undefined) return (aSaved ?? Number.MAX_SAFE_INTEGER) - (bSaved ?? Number.MAX_SAFE_INTEGER);
    return defaultLibraryRank(a) - defaultLibraryRank(b) || a.name.localeCompare(b.name);
  });
}

function windowDragProps() {
  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, a')) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      window.prismWindow?.startDrag(event.screenX, event.screenY);
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) window.prismWindow?.moveDrag(event.screenX, event.screenY);
    },
    onPointerUp(event: ReactPointerEvent<HTMLElement>) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      window.prismWindow?.endDrag();
    },
    onPointerCancel() {
      window.prismWindow?.endDrag();
    }
  };
}

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

function formatMoney(value?: number) {
  if (value === undefined) return 'NOT SUPPLIED BY SERVER';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function formatCodec(value?: string) {
  if (!value) return '—';
  const names: Record<string, string> = { h264: 'H.264', hevc: 'HEVC', h265: 'HEVC', eac3: 'E-AC-3', ac3: 'AC-3', aac: 'AAC', av1: 'AV1', vp9: 'VP9' };
  return names[value.toLowerCase()] ?? value.toUpperCase();
}

function Poster({ item, onSelect }: { item: MediaItem; onSelect?: (item: MediaItem) => void }) {
  const isAlbum = item.type === 'MusicAlbum' || item.type === 'Audio';
  const style = item.imageUrl
    ? { backgroundImage: `url("${item.imageUrl}")` }
    : { '--hue': item.hue } as React.CSSProperties;
  const artwork = (
    <>
      {!item.imageUrl && <span className="poster__geometry" />}
      {!item.imageUrl && !isAlbum && <span className="poster__title">{item.title}</span>}
      {!isAlbum && <span className="poster__year">{item.year}</span>}
      {isAlbum && (
        <span className="album-caption">
          <strong>{item.title}</strong>
          <small>{item.artist || item.year || 'ALBUM'}</small>
        </span>
      )}
    </>
  );
  const className = `poster ${isAlbum ? 'poster--album' : ''}`;
  return onSelect ? (
    <button className={className} data-letter={titleInitial(item.title)} style={style} onClick={() => onSelect(item)} aria-label={`Open ${item.title}${item.artist ? ` by ${item.artist}` : ''}`}>{artwork}</button>
  ) : (
    <div className={className} style={style} aria-label={`${item.title} ${isAlbum ? 'album cover' : 'poster'}`}>{artwork}</div>
  );
}

function AlbumArtwork({ item, metadata }: { item: MediaItem; metadata: AlbumMetadata | null }) {
  const [flipped, setFlipped] = useState(false);
  const backCoverUrl = metadata?.backCoverUrl;
  useEffect(() => setFlipped(false), [item.id]);
  if (!backCoverUrl) return <Poster item={item} />;
  return (
    <button
      className={`album-artwork-flip ${flipped ? 'is-flipped' : ''}`}
      onClick={() => setFlipped((value) => !value)}
      aria-label={`${flipped ? 'Show front cover' : 'Show rear cover'} for ${item.title}`}
      aria-pressed={flipped}
    >
      <span className="album-artwork-flip__inner">
        <span className="album-artwork-flip__face album-artwork-flip__front"><Poster item={item} /></span>
        <span className="album-artwork-flip__face album-artwork-flip__back">
          <img src={backCoverUrl} alt={`Rear cover for ${item.title}`} />
          <small>CLICK TO RETURN TO FRONT</small>
        </span>
      </span>
      <span className="album-artwork-flip__hint">FLIP COVER</span>
    </button>
  );
}

function AlbumPlayer({ album, session }: { album: MediaItem; session: PrismSession }) {
  const playerRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoplayRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frequencyDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const smoothedBandsRef = useRef<AudioBands>({ bass: 0, mid: 0, high: 0, energy: 0 });
  const lastBeatRef = useRef(0);
  const [tracks, setTracks] = useState<MediaItem[]>([]);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState('DEVELOPING TRACK LIST…');
  const currentTrack = tracks[trackIndex];

  const resetReactiveVisuals = useCallback(() => {
    window.cancelAnimationFrame(animationFrameRef.current ?? 0);
    animationFrameRef.current = undefined;
    const stage = playerRef.current?.closest<HTMLElement>('.inspect--album');
    stage?.style.setProperty('--audio-bass', '0');
    stage?.style.setProperty('--audio-mid', '0');
    stage?.style.setProperty('--audio-high', '0');
    stage?.style.setProperty('--audio-energy', '0');
    playerRef.current?.querySelectorAll<HTMLElement>('.album-player__waveform i').forEach((bar) => { bar.style.transform = 'scaleY(.08)'; });
  }, []);

  const runAudioAnalysis = useCallback(async () => {
    const audio = audioRef.current;
    const player = playerRef.current;
    if (!audio || !player) return;
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.58;
      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceRef.current = source;
      frequencyDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    await audioContextRef.current.resume();
    const analyser = analyserRef.current;
    const frequencyData = frequencyDataRef.current;
    if (!analyser || !frequencyData) return;
    window.cancelAnimationFrame(animationFrameRef.current ?? 0);

    const draw = (now: number) => {
      if (audio.paused || audio.ended) return;
      analyser.getByteFrequencyData(frequencyData);
      const measured = analyseFrequencyData(frequencyData);
      const previous = smoothedBandsRef.current;
      const smooth = (oldValue: number, nextValue: number, release = .76) => nextValue > oldValue ? oldValue * .35 + nextValue * .65 : oldValue * release + nextValue * (1 - release);
      const bands = {
        bass: smooth(previous.bass, measured.bass, .8),
        mid: smooth(previous.mid, measured.mid),
        high: smooth(previous.high, measured.high),
        energy: smooth(previous.energy, measured.energy, .79)
      };
      smoothedBandsRef.current = bands;
      const stage = player.closest<HTMLElement>('.inspect--album');
      stage?.style.setProperty('--audio-bass', bands.bass.toFixed(3));
      stage?.style.setProperty('--audio-mid', bands.mid.toFixed(3));
      stage?.style.setProperty('--audio-high', bands.high.toFixed(3));
      stage?.style.setProperty('--audio-energy', bands.energy.toFixed(3));

      const bars = player.querySelectorAll<HTMLElement>('.album-player__waveform i');
      bars.forEach((bar, index) => {
        const bin = Math.min(frequencyData.length - 1, Math.floor((index / Math.max(1, bars.length - 1)) ** 1.65 * frequencyData.length * .72));
        const level = (frequencyData[bin] ?? 0) / 255;
        bar.style.transform = `scaleY(${Math.max(.045, level ** .82).toFixed(3)})`;
        bar.style.opacity = String(.24 + level * .76);
      });

      const beatThreshold = Math.max(.34, previous.bass * 1.13, bands.energy * 1.48);
      if (measured.bass > beatThreshold && now - lastBeatRef.current > 230) {
        lastBeatRef.current = now;
        stage?.querySelectorAll<HTMLElement>('.album-reactive-ring').forEach((ring, index) => {
          ring.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: String(.34 - index * .055) },
            { transform: `translate(-50%, -50%) scale(${1.55 + index * .18})`, opacity: '0' }
          ], { duration: 1050 + index * 130, delay: index * 35, easing: 'cubic-bezier(.12,.58,.22,1)' });
        });
      }
      animationFrameRef.current = window.requestAnimationFrame(draw);
    };
    animationFrameRef.current = window.requestAnimationFrame(draw);
  }, []);

  useEffect(() => () => {
    resetReactiveVisuals();
    sourceRef.current?.disconnect();
    analyserRef.current?.disconnect();
    void audioContextRef.current?.close();
  }, [resetReactiveVisuals]);

  useEffect(() => {
    let cancelled = false;
    setTracks([]);
    setTrackIndex(0);
    setStatus('DEVELOPING TRACK LIST…');
    getAlbumTracks(album, session).then((nextTracks) => {
      if (cancelled) return;
      setTracks(nextTracks);
      setStatus(nextTracks.length ? '' : 'NO TRACKS FOUND');
    }).catch(() => {
      if (!cancelled) setStatus('PRISM COULD NOT LOAD THIS ALBUM');
    });
    return () => { cancelled = true; };
  }, [album, session]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    setCurrentTime(0);
    setDuration(0);
    audio.load();
    if (autoplayRef.current) void audio.play().catch(() => setStatus('PLAYBACK COULD NOT START'));
  }, [currentTrack]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      autoplayRef.current = true;
      await audio.play().catch(() => setStatus('PLAYBACK COULD NOT START'));
    } else audio.pause();
  }

  function chooseTrack(index: number) {
    autoplayRef.current = true;
    if (index === trackIndex) void audioRef.current?.play();
    else setTrackIndex(index);
  }

  function moveTrack(direction: -1 | 1) {
    if (!tracks.length) return;
    autoplayRef.current = true;
    setTrackIndex((trackIndex + direction + tracks.length) % tracks.length);
  }

  return (
    <section ref={playerRef} className={`album-player ${playing ? 'album-player--playing' : ''}`} aria-label="Album player">
      {currentTrack && <audio
        ref={audioRef}
        crossOrigin="anonymous"
        src={audioPlaybackUrl(currentTrack, session)}
        preload="metadata"
        onPlay={() => { setPlaying(true); setStatus(''); void runAudioAnalysis(); }}
        onPause={() => { setPlaying(false); resetReactiveVisuals(); }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => moveTrack(1)}
        onError={() => setStatus('THIS TRACK COULD NOT BE PLAYED')}
      />}
      <div className="album-player__transport">
        <button className="album-player__previous" onClick={() => moveTrack(-1)} disabled={!tracks.length} aria-label="Previous track">‹</button>
        <button className="album-player__toggle" onClick={() => void togglePlayback()} disabled={!currentTrack} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Ⅱ' : '▶'}</button>
        <button className="album-player__next" onClick={() => moveTrack(1)} disabled={!tracks.length} aria-label="Next track">›</button>
        <span className="album-player__now"><small>{playing ? `NOW PLAYING · ${album.title}` : 'READY'}</small><strong>{currentTrack?.title || album.title}</strong></span>
      </div>
      <div className="album-player__timeline">
        <span>{formatClock(currentTime)}</span>
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => {
          const nextTime = Number(event.target.value);
          if (audioRef.current) audioRef.current.currentTime = nextTime;
          setCurrentTime(nextTime);
        }} aria-label="Track position" />
        <span>{formatClock(duration)}</span>
      </div>
      <div className="album-player__waveform" aria-hidden="true">
        {Array.from({ length: 96 }, (_, index) => <i key={index} style={{ '--bar': `${18 + ((index * 37) % 80)}%` } as React.CSSProperties} />)}
      </div>
      {status && <p className="album-player__status">{status}</p>}
      {tracks.length > 0 && (
        <>
          <button className="album-player__tracks-toggle" onClick={() => setTracksOpen((open) => !open)} aria-expanded={tracksOpen}>TRACKS · {tracks.length}</button>
          {tracksOpen && <div className="album-track-list" aria-label="Tracks">
            {tracks.map((track, index) => (
              <button key={track.id} className={index === trackIndex ? 'is-active' : ''} onClick={() => chooseTrack(index)}>
                <span>{String(track.trackNumber ?? index + 1).padStart(2, '0')}</span>
                <strong>{track.title}</strong>
                <small>{formatRuntime(track.runtimeMinutes)}</small>
              </button>
            ))}
          </div>}
        </>
      )}
    </section>
  );
}

function MoreDetails({
  item,
  details,
  production,
  versions,
  similar,
  loading,
  error,
  onBack,
  onSelect
}: {
  item: MediaItem;
  details: MediaDetails | null;
  production: ProductionDetails | null;
  versions: PlaybackDetails[];
  similar: MediaItem[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onSelect: (item: MediaItem) => void;
}) {
  const cast = details?.people.filter((person) => person.type === 'Actor') ?? [];
  const crew = details?.people.filter((person) => person.type !== 'Actor') ?? [];
  return (
    <section className="more-page" aria-label={`More about ${item.title}`}>
      <div className="more-page__hero">
        <button className="reshelve back-button" aria-label="Back to film" onClick={onBack}><span aria-hidden="true">←</span><span>BACK TO FILM</span></button>
        <p className="eyebrow">THE FULL PICTURE</p>
        <h2>{item.title}</h2>
        {details?.tagline && <p className="more-page__tagline">“{details.tagline}”</p>}
        <div className="more-page__facts">
          <span>{item.year || '—'}<small>RELEASE</small></span>
          <span>{formatRuntime(item.runtimeMinutes) || '—'}<small>RUNTIME</small></span>
          <span>{details?.officialRating || 'NR'}<small>RATING</small></span>
          <span>{details?.communityRating?.toFixed(1) || '—'}<small>AUDIENCE</small></span>
          <span>{details?.criticRating ? `${Math.round(details.criticRating)}%` : '—'}<small>CRITICS</small></span>
        </div>
      </div>

      {loading && <p className="more-page__status">DEVELOPING THE DETAILS…</p>}
      {error && <p className="more-page__status more-page__status--error">{error}</p>}
      {!loading && (
        <div className="more-page__body">
          <section className="more-section">
            <p className="eyebrow">CAST</p>
            {cast.length ? <div className="people-grid">{cast.map((person, index) => (
              <article className="person-card" key={`${person.id || person.name}-${index}`}>
                <div style={person.imageUrl ? { backgroundImage: `url("${person.imageUrl}")` } : undefined}><span>{person.name.charAt(0)}</span></div>
                <strong>{person.name}</strong><small>{person.role || 'Cast'}</small>
              </article>
            ))}</div> : <p className="more-page__empty">Cast information has not been added to this title.</p>}
          </section>

          <section className="more-section more-section--crew">
            <p className="eyebrow">CREW</p>
            {crew.length ? <div className="crew-list">{crew.map((person, index) => (
              <div key={`${person.id || person.name}-${index}`}><span>{person.name}</span><small>{person.role || person.type || 'Crew'}</small></div>
            ))}</div> : <p className="more-page__empty">Crew information has not been added to this title.</p>}
          </section>

          <section className="more-section more-section--numbers">
            <p className="eyebrow">THE NUMBERS</p>
            <div className="financial-grid">
              <div><small>BUDGET</small><strong>{formatMoney(details?.budget)}</strong></div>
              <div><small>BOX OFFICE</small><strong>{formatMoney(details?.revenue)}</strong></div>
            </div>
            {details?.financialSource && <p className="financial-source">FINANCIAL DATA PROVIDED BY TMDB</p>}
          </section>

          <section className="more-section more-section--production-format">
            <p className="eyebrow">PRODUCTION FORMAT</p>
            {production ? (
              <>
                <dl className="production-spec-list">
                  {[
                    ['CINEMATOGRAPHY', production.cinematographers],
                    ['CAMERAS', production.cameras],
                    ['LENSES', production.lenses],
                    ['LENS MAKERS', production.lensManufacturers],
                    ['ACQUISITION', production.acquisition],
                    ['CAMERA APERTURE', production.cameraAperture],
                    ['FILM STOCK', production.filmStock],
                    ['FILM GAUGE', production.filmGauge],
                    ['CAPTURE RESOLUTION', production.captureResolution],
                    ['CAPTURE FORMAT', production.captureFormats],
                    ['PROJECT FORMAT', production.projectResolution],
                    ['FRAME RATE', production.frameRate],
                    ['FINISHING', production.finishingProcess],
                    ['NATIVE ASPECT RATIO', production.aspectRatio]
                  ].filter(([, values]) => values.length).map(([label, values]) => (
                    <div key={label as string}><dt>{label}</dt><dd>{(values as string[]).join(' · ')}</dd></div>
                  ))}
                </dl>
                <a className="production-source" href={production.sourceUrl} target="_blank" rel="noreferrer">COMMUNITY DATA FROM SHOTONWHAT ↗</a>
              </>
            ) : <p className="more-page__empty">No production format was found for this title. PRISM will check again during the next missing-data scan.</p>}
          </section>

          <section className="more-section more-section--specs">
            <p className="eyebrow">YOUR COPY</p>
            <div className="spec-grid">
              {versions.map((version) => (
                <article key={version.mediaSourceId}>
                  <h3>{version.label}</h3>
                  <dl>
                    <div><dt>PICTURE</dt><dd>{version.width && version.height ? `${version.width} × ${version.height}` : '—'}</dd></div>
                    <div><dt>VIDEO</dt><dd>{formatCodec(version.videoCodec)}</dd></div>
                    <div><dt>AUDIO</dt><dd>{formatCodec(version.audioCodec)}</dd></div>
                    <div><dt>CONTAINER</dt><dd>{version.container?.toUpperCase() || '—'}</dd></div>
                    <div><dt>SUBTITLES</dt><dd>{version.subtitles.length || 'NONE'}</dd></div>
                  </dl>
                </article>
              ))}
              {!versions.length && <p className="more-page__empty">Technical information is not available.</p>}
            </div>
          </section>

          <section className="more-section more-section--metadata">
            <p className="eyebrow">PRODUCTION</p>
            <dl className="metadata-list">
              <div><dt>STUDIOS</dt><dd>{details?.studios.join(' · ') || '—'}</dd></div>
              <div><dt>GENRES</dt><dd>{details?.genres.join(' · ') || '—'}</dd></div>
              <div><dt>LOCATIONS</dt><dd>{details?.productionLocations.join(' · ') || '—'}</dd></div>
            </dl>
          </section>

          <section className="more-section more-section--similar">
            <p className="eyebrow">SIMILAR FILMS IN YOUR LIBRARY</p>
            {similar.length ? <div className="similar-row">{similar.map((similarItem) => (
              <Poster key={similarItem.id} item={similarItem} onSelect={onSelect} />
            ))}</div> : <p className="more-page__empty">No related films were found in this library.</p>}
          </section>
        </div>
      )}
    </section>
  );
}

function AlbumMoreDetails({
  item,
  details,
  metadata,
  loading,
  error,
  onBack
}: {
  item: MediaItem;
  details: MediaDetails | null;
  metadata: AlbumMetadata | null;
  loading: boolean;
  error: string;
  onBack: () => void;
}) {
  const credits = details?.people ?? [];
  return (
    <section className="more-page album-more" aria-label={`More about ${item.title}`}>
      <div className="more-page__hero album-more__hero">
        <button className="reshelve back-button" aria-label="Back to album" onClick={onBack}><span aria-hidden="true">←</span><span>BACK TO ALBUM</span></button>
        <p className="eyebrow">THE COMPLETE EDITION</p>
        <h2>{item.title}</h2>
        {item.artist && <p className="more-page__tagline">{item.artist}</p>}
        <div className="more-page__facts">
          <span>{metadata?.releaseDate || item.year || '—'}<small>RELEASE</small></span>
          <span>{metadata?.format || '—'}<small>FORMAT</small></span>
          <span>{metadata?.country || '—'}<small>EDITION</small></span>
          <span>{metadata?.trackCount || '—'}<small>TRACKS</small></span>
          <span>{metadata?.status || '—'}<small>STATUS</small></span>
        </div>
      </div>

      {loading && <p className="more-page__status">DEVELOPING THE LINER NOTES…</p>}
      {error && <p className="more-page__status more-page__status--error">{error}</p>}
      {!loading && (
        <div className="more-page__body">
          <section className="more-section album-more__edition">
            <p className="eyebrow">THIS EDITION</p>
            <dl className="metadata-list">
              <div><dt>ARTIST</dt><dd>{item.artist || '—'}</dd></div>
              <div><dt>LABEL</dt><dd>{metadata?.labels.join(' · ') || details?.studios.join(' · ') || '—'}</dd></div>
              <div><dt>CATALOG NUMBER</dt><dd>{metadata?.catalogNumbers.join(' · ') || '—'}</dd></div>
              <div><dt>BARCODE</dt><dd>{metadata?.barcode || '—'}</dd></div>
              <div><dt>TYPE</dt><dd>{metadata?.primaryType || 'Album'}</dd></div>
              <div><dt>GENRES</dt><dd>{details?.genres.join(' · ') || '—'}</dd></div>
            </dl>
            {metadata && <a className="production-source" href={metadata.sourceUrl} target="_blank" rel="noreferrer">EDITION DATA FROM MUSICBRAINZ ↗</a>}
          </section>

          <section className="more-section album-more__artwork">
            <p className="eyebrow">THE PACKAGING</p>
            <div className="album-artwork-pair">
              <figure><img src={item.imageUrl} alt={`Front cover for ${item.title}`} /><figcaption>FRONT</figcaption></figure>
              {metadata?.backCoverUrl
                ? <figure><img src={metadata.backCoverUrl} alt={`Rear cover for ${item.title}`} /><figcaption>REAR</figcaption></figure>
                : <div className="album-artwork-missing"><span>REAR ARTWORK</span><small>NO COMMUNITY SCAN IS AVAILABLE FOR THIS EDITION</small></div>}
            </div>
            <p className="album-artwork-source">COVER IMAGES ARE CURATED BY THE MUSICBRAINZ COMMUNITY AND ARCHIVED BY THE INTERNET ARCHIVE.</p>
          </section>

          <section className="more-section album-more__credits">
            <p className="eyebrow">CREDITS &amp; CONTRIBUTORS</p>
            {credits.length ? <div className="crew-list">{credits.map((person, index) => (
              <div key={`${person.id || person.name}-${index}`}><span>{person.name}</span><small>{person.role || person.type || 'Contributor'}</small></div>
            ))}</div> : <p className="more-page__empty">Detailed credits have not been added to this album in PRISM Server yet.</p>}
          </section>
        </div>
      )}
    </section>
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

function Player({ item, session, preferences, mediaSourceId: preferredMediaSourceId, onPreferencesChange, onClose }: { item: MediaItem; session: PrismSession; preferences: PrismPreferences; mediaSourceId?: string; onPreferencesChange: (patch: Partial<PrismPreferences>) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const idleTimerRef = useRef<number | undefined>(undefined);
  const nativeModeRef = useRef(false);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
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
  const [nativeMode, setNativeMode] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
  const [subtitleLoadStatus, setSubtitleLoadStatus] = useState('');
  const [remoteSubtitles, setRemoteSubtitles] = useState<RemoteSubtitle[]>([]);
  const [remoteSubtitleStatus, setRemoteSubtitleStatus] = useState('');
  const [remoteSubtitleBusy, setRemoteSubtitleBusy] = useState(false);

  const revealChrome = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      setChromeVisible(false);
      setSubtitleMenuOpen(false);
    }, 3000);
  }, []);

  const togglePlayback = useCallback(() => {
    if (nativeModeRef.current) {
      void window.prismNativePlayer?.setPaused(!paused);
      setPaused(!paused);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [paused]);

  const seekBy = useCallback((seconds: number) => {
    if (nativeModeRef.current) {
      const nextTime = Math.max(0, Math.min(durationRef.current || Infinity, currentTimeRef.current + seconds));
      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);
      void window.prismNativePlayer?.seek(nextTime * 1000);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + seconds));
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let hls: Hls | undefined;
    let cancelled = false;
    let usingDirectPlay = false;
    let activeDetails: PlaybackDetails | undefined;

    const startAdaptivePlayback = (details: PlaybackDetails) => {
      usingDirectPlay = false;
      setPlaybackError('');
      const streamMimeType = directStreamMimeType(details);
      if (!streamMimeType || !MediaSource.isTypeSupported(streamMimeType)) {
        const format = [details.videoCodec?.toUpperCase(), details.audioCodec?.toUpperCase()].filter(Boolean).join(' / ');
        setPaused(true);
        setPlaybackError(`This PRISM desktop decoder does not support ${format || 'these media streams'}. Your server preserved the original streams, so no NAS transcoding was used.`);
        return;
      }
      const source = adaptivePlaybackUrl(item, session, details);
      if (Hls.isSupported()) {
        hls?.destroy();
        hls = new Hls({ enableWorker: true });
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => setPaused(true)));
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            const format = [details.videoCodec?.toUpperCase(), details.audioCodec?.toUpperCase()].filter(Boolean).join(' / ');
            setPlaybackError(`Playback could not start in direct-stream mode${format ? ` (${format})` : ''}. This copy may need a client-compatible audio track or container.`);
          }
        });
      } else {
        video.src = source;
        void video.play().catch(() => setPaused(true));
      }
    };

    const onVideoError = () => {
      if (usingDirectPlay && activeDetails) startAdaptivePlayback(activeDetails);
    };
    video.addEventListener('error', onVideoError);

    getPlaybackDetails(item, session, preferredMediaSourceId).then(async (details) => {
      if (cancelled) return;
      activeDetails = details;
      setMediaSourceId(details.mediaSourceId);
      setSubtitleTracks(details.subtitles);
      const english = details.subtitles.find((track) => ['eng', 'en'].includes(track.language?.toLowerCase() ?? ''));
      const audioIsEnglish = ['eng', 'en'].includes(details.audioLanguage?.toLowerCase() ?? '');
      const automaticTrack = preferences.autoEnglishSubtitles
        ? (!audioIsEnglish ? english : details.subtitles.find((track) => track.isForced && ['eng', 'en'].includes(track.language?.toLowerCase() ?? '')))
        : undefined;
      setSelectedSubtitle(automaticTrack?.index ?? null);

      const nativeStatus = await window.prismNativePlayer?.status().catch(() => ({ available: false }));
      if (cancelled) return;
      if (nativeStatus?.available && window.prismNativePlayer) {
        nativeModeRef.current = true;
        setNativeMode(true);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (cancelled) return;
        const result = await window.prismNativePlayer.start(directPlaybackUrl(item, session, details), {
          color: preferences.subtitleColor,
          size: preferences.subtitleSize,
          background: preferences.subtitleBackground
        });
        if (!result.ok) {
          nativeModeRef.current = false;
          setNativeMode(false);
          setPaused(true);
          setPlaybackError(result.error || 'The PRISM native player could not start this title.');
          return;
        }
        setPaused(false);
        setNativeReady(true);
        return;
      }

      const mimeType = directPlayMimeType(details);
      if (mimeType && video.canPlayType(mimeType)) {
        usingDirectPlay = true;
        video.src = directPlaybackUrl(item, session, details);
        void video.play().catch(() => setPaused(true));
      } else {
        startAdaptivePlayback(details);
      }
    }).catch(() => setPlaybackError('Prism could not prepare this title for playback.'));

    return () => {
      cancelled = true;
      if (nativeModeRef.current) void window.prismNativePlayer?.stop();
      nativeModeRef.current = false;
      setNativeReady(false);
      video.removeEventListener('error', onVideoError);
      hls?.destroy();
    };
  }, [item, preferences.autoEnglishSubtitles, preferredMediaSourceId, session]);

  useEffect(() => {
    if (nativeMode) {
      if (!nativeReady) return;
      void window.prismNativePlayer?.disableSubtitles();
      setSubtitleCues([]);
      if (selectedSubtitle === null) {
        setSubtitleLoadStatus('');
        return;
      }
      const controller = new AbortController();
      setSubtitleLoadStatus('Loading subtitle text…');
      fetch(subtitleUrl(item, session, mediaSourceId, selectedSubtitle), { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Server returned ${response.status}.`);
          return response.text();
        })
        .then((value) => {
          const cues = parseWebVtt(value);
          setSubtitleCues(cues);
          setSubtitleLoadStatus(cues.length ? '' : 'This subtitle file contains no readable text.');
        })
        .catch((reason: unknown) => {
          if ((reason as { name?: string })?.name !== 'AbortError') setSubtitleLoadStatus('PRISM could not load this subtitle file.');
        });
      return () => controller.abort();
    }
    Array.from(videoRef.current?.textTracks ?? []).forEach((track, index) => {
      track.mode = subtitleTracks[index]?.index === selectedSubtitle ? 'showing' : 'disabled';
    });
  }, [item, mediaSourceId, nativeMode, nativeReady, selectedSubtitle, session, subtitleTracks]);

  const activeSubtitleText = useMemo(() => subtitleCues
    .filter((cue) => currentTime >= cue.start && currentTime < cue.end)
    .map((cue) => cue.text), [currentTime, subtitleCues]);

  async function findForcedEnglishSubtitles() {
    setRemoteSubtitleBusy(true);
    setRemoteSubtitleStatus('Searching PRISM Server…');
    setRemoteSubtitles([]);
    try {
      const results = await searchRemoteSubtitles(item, session, 'eng');
      const forced = results.filter((result) => result.forced).sort((a, b) => Number(b.hashMatch) - Number(a.hashMatch) || (b.downloads ?? 0) - (a.downloads ?? 0));
      setRemoteSubtitles(forced.slice(0, 6));
      setRemoteSubtitleStatus(forced.length ? '' : 'No forced-English matches were found. A subtitle provider may need to be configured on PRISM Server.');
    } catch {
      setRemoteSubtitleStatus('PRISM Server could not search subtitle providers.');
    } finally {
      setRemoteSubtitleBusy(false);
    }
  }

  async function installRemoteSubtitle(result: RemoteSubtitle) {
    setRemoteSubtitleBusy(true);
    setRemoteSubtitleStatus('Adding forced English subtitles…');
    try {
      await downloadRemoteSubtitle(item, session, result.id);
      let addedTrack: SubtitleTrack | undefined;
      for (let attempt = 0; attempt < 8 && !addedTrack; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const details = await getPlaybackDetails(item, session, mediaSourceId);
        setSubtitleTracks(details.subtitles);
        addedTrack = details.subtitles.find((track) => track.isForced && ['eng', 'en'].includes(track.language?.toLowerCase() ?? ''));
      }
      if (addedTrack) {
        setSelectedSubtitle(addedTrack.index);
        setRemoteSubtitleStatus('Forced English added and selected.');
      } else setRemoteSubtitleStatus('The download was queued. It will appear after the server refreshes this film.');
    } catch {
      setRemoteSubtitleStatus('PRISM Server could not add that subtitle.');
    } finally {
      setRemoteSubtitleBusy(false);
    }
  }

  useEffect(() => {
    if (!nativeMode || !window.prismNativePlayer) return;
    let polling = false;
    const poll = window.setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const state = await window.prismNativePlayer!.state();
        const nextTime = Math.max(0, state.timeMs / 1000);
        const nextDuration = Math.max(0, state.durationMs / 1000);
        currentTimeRef.current = nextTime;
        durationRef.current = nextDuration;
        setCurrentTime(nextTime);
        setDuration(nextDuration);
        setVolume(Math.min(1, Math.max(0, state.volume / 100)));
        setMuted(state.volume === 0);
        setPaused(state.paused || (!state.playing && !state.ended));
        if (state.error) setPlaybackError(state.message || 'The PRISM native player could not decode this title.');
        if (state.ended) onClose();
      } finally {
        polling = false;
      }
    }, 250);
    return () => window.clearInterval(poll);
  }, [nativeMode, onClose]);

  useEffect(() => {
    revealChrome();
    return () => window.clearTimeout(idleTimerRef.current);
  }, [revealChrome]);

  useEffect(() => {
    function onPlayerKeyDown(event: KeyboardEvent) {
      revealChrome();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(event.key === 'ArrowRight' ? preferences.skipSeconds : -preferences.skipSeconds);
      } else if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePlayback();
      }
    }
    window.addEventListener('keydown', onPlayerKeyDown);
    return () => window.removeEventListener('keydown', onPlayerKeyDown);
  }, [preferences.skipSeconds, revealChrome, seekBy, togglePlayback]);

  function updateVolume(nextVolume: number) {
    if (nativeModeRef.current) {
      void window.prismNativePlayer?.setVolume(nextVolume);
      setVolume(nextVolume);
      setMuted(nextVolume === 0);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  }

  return (
    <div
      className={`player ${nativeMode ? 'player--native' : ''} ${chromeVisible ? '' : 'player--idle'}`}
      style={{
        '--subtitle-color': { white: '#ffffff', warm: '#fff2d2', yellow: '#ffe45c', cyan: '#a9f5ff' }[preferences.subtitleColor],
        '--subtitle-size': { small: 'clamp(1.05rem, 1.75vw, 1.7rem)', medium: 'clamp(1.25rem, 2.15vw, 2.15rem)', large: 'clamp(1.5rem, 2.7vw, 2.75rem)' }[preferences.subtitleSize],
        '--subtitle-background': { none: 'transparent', soft: 'rgb(0 0 0 / .48)', strong: 'rgb(0 0 0 / .82)' }[preferences.subtitleBackground]
      } as React.CSSProperties}
      onMouseMove={revealChrome}
      onMouseDown={revealChrome}
      onTouchStart={revealChrome}
    >
      <video
        ref={videoRef}
        className={nativeMode ? 'player__html-video--hidden' : ''}
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
      {nativeMode && <button className="player__native-click-target" onClick={togglePlayback} aria-label={paused ? 'Play' : 'Pause'} />}
      {nativeMode && selectedSubtitle !== null && activeSubtitleText.length > 0 && (
        <div className="player__subtitle-layer" aria-live="off">
          {activeSubtitleText.map((text, index) => <span key={`${text}-${index}`}>{text}</span>)}
        </div>
      )}
      <button onClick={onClose} className="player__close player__chrome back-button" aria-label="Close player"><span aria-hidden="true">←</span><span>BACK</span></button>
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
            currentTimeRef.current = nextTime;
            if (nativeModeRef.current) void window.prismNativePlayer?.seek(nextTime * 1000);
            else if (videoRef.current) videoRef.current.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
          aria-label="Playback position"
        />
        <span className="player__time">{formatClock(duration)}</span>
        <button
          onClick={() => {
            if (nativeModeRef.current) {
              const nextMuted = !muted;
              void window.prismNativePlayer?.setVolume(nextMuted ? 0 : (volume || 1));
              setMuted(nextMuted);
              return;
            }
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
              <button className={`subtitle-track-option ${selectedSubtitle === null ? 'is-selected' : ''}`} onClick={() => setSelectedSubtitle(null)}>Off</button>
              {subtitleTracks.map((track) => (
                <button
                  key={track.index}
                  className={`subtitle-track-option ${selectedSubtitle === track.index ? 'is-selected' : ''}`}
                  onClick={() => setSelectedSubtitle(track.index)}
                >{track.label}{track.isForced ? ' · FORCED' : ''}</button>
              ))}
              {!subtitleTracks.length && <span>No text subtitles</span>}
              {subtitleLoadStatus && <span className="subtitle-menu__status">{subtitleLoadStatus}</span>}

              <p>APPEARANCE</p>
              <div className="subtitle-customization subtitle-customization--colors" aria-label="Subtitle color">
                {(['white', 'warm', 'yellow', 'cyan'] as const).map((color) => (
                  <button
                    key={color}
                    className={preferences.subtitleColor === color ? 'is-selected' : ''}
                    style={{ '--swatch': { white: '#fff', warm: '#fff2d2', yellow: '#ffe45c', cyan: '#a9f5ff' }[color] } as React.CSSProperties}
                    onClick={() => onPreferencesChange({ subtitleColor: color })}
                    aria-label={`${color} subtitles`}
                  />
                ))}
              </div>
              <div className="subtitle-customization" aria-label="Subtitle size">
                {(['small', 'medium', 'large'] as const).map((size) => <button key={size} className={preferences.subtitleSize === size ? 'is-selected' : ''} onClick={() => onPreferencesChange({ subtitleSize: size })}>{size}</button>)}
              </div>
              <div className="subtitle-customization" aria-label="Subtitle background">
                {(['none', 'soft', 'strong'] as const).map((background) => <button key={background} className={preferences.subtitleBackground === background ? 'is-selected' : ''} onClick={() => onPreferencesChange({ subtitleBackground: background })}>{background}</button>)}
              </div>

              <p>FOREIGN PARTS ONLY</p>
              <button className="subtitle-search" disabled={remoteSubtitleBusy} onClick={() => void findForcedEnglishSubtitles()}>{remoteSubtitleBusy ? 'SEARCHING…' : 'FIND FORCED ENGLISH'}</button>
              {remoteSubtitles.map((result) => (
                <button className="subtitle-result" key={result.id} disabled={remoteSubtitleBusy} onClick={() => void installRemoteSubtitle(result)}>
                  <strong>{result.name}</strong>
                  <small>{[result.provider, result.format, result.hashMatch ? 'PERFECT MATCH' : ''].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
              {remoteSubtitleStatus && <span className="subtitle-menu__status">{remoteSubtitleStatus}</span>}
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
  const [preferences, setPreferences] = useState<PrismPreferences>(loadPreferences);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [playingItem, setPlayingItem] = useState<MediaItem | null>(null);
  const [libraryError, setLibraryError] = useState('');
  const [views, setViews] = useState<LibraryView[]>([]);
  const [activeView, setActiveView] = useState<LibraryView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerPage, setDrawerPage] = useState<'libraries' | 'settings'>('libraries');
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [playbackVersions, setPlaybackVersions] = useState<PlaybackDetails[]>([]);
  const [selectedMediaSourceId, setSelectedMediaSourceId] = useState<string | undefined>();
  const [moreOpen, setMoreOpen] = useState(false);
  const [mediaDetails, setMediaDetails] = useState<MediaDetails | null>(null);
  const [productionDetails, setProductionDetails] = useState<ProductionDetails | null>(null);
  const [similarItems, setSimilarItems] = useState<MediaItem[]>([]);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [albumMetadata, setAlbumMetadata] = useState<AlbumMetadata | null>(null);
  const [albumMetadataLoading, setAlbumMetadataLoading] = useState(false);
  const [albumMetadataError, setAlbumMetadataError] = useState('');
  const [tmdbConfigured, setTmdbConfigured] = useState(false);
  const [tmdbEditorOpen, setTmdbEditorOpen] = useState(false);
  const [tmdbTokenDraft, setTmdbTokenDraft] = useState('');
  const [tmdbStatus, setTmdbStatus] = useState('');
  const [productionScan, setProductionScan] = useState<ProductionScanProgress | null>(null);
  const [productionScanRunning, setProductionScanRunning] = useState(false);
  const [productionScanStatus, setProductionScanStatus] = useState('');
  const [seriesEpisodes, setSeriesEpisodes] = useState<MediaItem[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(preferences.defaultSort);
  const [randomNonce, setRandomNonce] = useState(0);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);
  const wallRef = useRef<HTMLElement>(null);
  const scrollbarTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem(preferencesKey, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      window.clearTimeout(scrollbarTimerRef.current);
      if (window.innerWidth - event.clientX <= 72) {
        setScrollbarVisible(true);
      } else {
        scrollbarTimerRef.current = window.setTimeout(() => setScrollbarVisible(false), 450);
      }
    }
    window.addEventListener('pointermove', onPointerMove);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.clearTimeout(scrollbarTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen || drawerPage !== 'settings') return;
    void window.prismMetadata?.hasTmdbToken().then(setTmdbConfigured);
  }, [drawerPage, menuOpen]);

  useEffect(() => window.prismMetadata?.onProductionProgress(setProductionScan), []);

  useEffect(() => {
    setAlbumMetadata(null);
    setAlbumMetadataError('');
    if (!selected || (selected.type !== 'MusicAlbum' && selected.type !== 'Audio')) return;
    let cancelled = false;
    setAlbumMetadataLoading(true);
    getAlbumMetadata(selected).then((metadata) => {
      if (!cancelled) setAlbumMetadata(metadata);
    }).catch((reason: unknown) => {
      if (!cancelled) setAlbumMetadataError(reason instanceof Error ? reason.message : 'Album metadata could not be loaded.');
    }).finally(() => {
      if (!cancelled) setAlbumMetadataLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    setPlaybackVersions([]);
    setSelectedMediaSourceId(undefined);
    setMoreOpen(false);
    setMediaDetails(null);
    setProductionDetails(null);
    setSimilarItems([]);
    setMoreError('');
    if (!selected || !session || selected.type === 'Series' || selected.type === 'MusicAlbum' || selected.type === 'Audio') return;
    let cancelled = false;
    getPlaybackVersions(selected, session).then((versions) => {
      if (cancelled) return;
      setPlaybackVersions(versions);
      setSelectedMediaSourceId(versions[0]?.mediaSourceId);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selected, session]);

  useEffect(() => {
    if (!moreOpen || !selected) return;
    if (demo || !session) {
      setMediaDetails({ people: [], studios: [], genres: [], productionLocations: [] });
      setSimilarItems(demoItems.filter((item) => item.id !== selected.id && item.type === 'Movie'));
      return;
    }
    let cancelled = false;
    setMoreLoading(true);
    setMoreError('');
    if (selected.type === 'MusicAlbum' || selected.type === 'Audio') {
      Promise.all([getItemDetails(selected, session), getAlbumMetadata(selected)]).then(([details, metadata]) => {
        if (cancelled) return;
        setMediaDetails(details);
        setAlbumMetadata(metadata);
      }).catch((reason: unknown) => {
        if (!cancelled) setMoreError(reason instanceof Error ? reason.message : 'The album details could not be loaded.');
      }).finally(() => {
        if (!cancelled) setMoreLoading(false);
      });
      return () => { cancelled = true; };
    }
    Promise.all([getItemDetails(selected, session), getSimilarItems(selected, session)]).then(async ([details, similar]) => {
      if (cancelled) return;
      const [financials, production] = await Promise.all([
        window.prismMetadata?.getTmdbMovie({ tmdbId: details.tmdbId, imdbId: details.imdbId }),
        window.prismMetadata?.getProduction({ title: selected.title, year: selected.year, scrapeIfMissing: true })
      ]);
      if (cancelled) return;
      setMediaDetails(financials ? {
        ...details,
        budget: financials.budget ?? details.budget,
        revenue: financials.revenue ?? details.revenue,
        financialSource: financials.source
      } : details);
      setProductionDetails(production ?? null);
      setSimilarItems(similar);
    }).catch((reason: unknown) => {
      if (!cancelled) setMoreError(reason instanceof Error ? reason.message : 'The extended details could not be loaded.');
    }).finally(() => {
      if (!cancelled) setMoreLoading(false);
    });
    return () => { cancelled = true; };
  }, [demo, moreOpen, selected, session]);

  async function saveTmdbToken() {
    setTmdbStatus('VERIFYING…');
    const result = await window.prismMetadata?.saveTmdbToken(tmdbTokenDraft);
    if (!result?.ok) {
      setTmdbStatus(result?.error || 'Secure metadata storage is only available in the installed app.');
      return;
    }
    setTmdbTokenDraft('');
    setTmdbEditorOpen(false);
    setTmdbConfigured(true);
    setTmdbStatus('CONNECTED');
  }

  async function scanMissingProductionData() {
    if (!session || !window.prismMetadata) {
      setProductionScanStatus('Scanning is available in the installed app while connected to your server.');
      return;
    }
    setProductionScanRunning(true);
    setProductionScan(null);
    setProductionScanStatus('PREPARING MOVIE LIBRARY…');
    try {
      const movieView = views.find((view) => view.collectionType === 'movies' || view.name.toLowerCase() === 'movies');
      const movies = activeView?.id === movieView?.id ? items : await getLibrary(session, movieView);
      const targets = movies.filter((item) => item.type === 'Movie' && item.year).map((item) => ({ title: item.title, year: item.year }));
      setProductionScanStatus('SCANNING MISSING TITLES…');
      const result = await window.prismMetadata.scanProduction(targets);
      setProductionScanStatus(result.ok
        ? `COMPLETE · ${result.found || 0} FOUND · ${result.skipped || 0} ALREADY CACHED · ${result.missing || 0} UNAVAILABLE`
        : result.error || 'The scan could not be completed.');
    } catch {
      setProductionScanStatus('The movie library could not be prepared for scanning.');
    } finally {
      setProductionScanRunning(false);
    }
  }

  useEffect(() => {
    setSeriesEpisodes([]);
    setSelectedSeason(null);
    setSeriesError('');
    if (!selected || selected.type !== 'Series' || !session) return;
    let cancelled = false;
    setSeriesLoading(true);
    getSeriesEpisodes(selected, session).then((episodes) => {
      if (cancelled) return;
      setSeriesEpisodes(episodes);
      setSelectedSeason(episodes[0]?.seasonNumber ?? 0);
    }).catch((reason: unknown) => {
      if (!cancelled) setSeriesError(reason instanceof Error ? reason.message : 'Episodes could not be loaded.');
    }).finally(() => {
      if (!cancelled) setSeriesLoading(false);
    });
    return () => { cancelled = true; };
  }, [selected, session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    localStorage.setItem(sessionKey, JSON.stringify(session));
    getViews(session).then(async (serverViews) => {
      const ordered = orderLibraryViews(serverViews, preferences.libraryOrder);
      const firstVisible = ordered.find((view) => !preferences.hiddenLibraryIds.includes(view.id));
      const initialView = preferences.showAllMedia ? null : firstVisible ?? null;
      const library = await getLibrary(session, initialView ?? undefined);
      if (!cancelled) {
        setViews(serverViews);
        setActiveView(initialView);
        setItems(library);
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setLibraryError(reason instanceof Error ? reason.message : 'The library could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (playingItem) setPlayingItem(null);
        else if (selected) setSelected(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playingItem, selected]);

  const visibleItems = demo ? demoItems : items;
  const orderedViews = useMemo(() => orderLibraryViews(views, preferences.libraryOrder), [preferences.libraryOrder, views]);
  const visibleDrawerViews = orderedViews.filter((view) => !preferences.hiddenLibraryIds.includes(view.id));
  const sortedItems = useMemo(() => {
    const result = [...visibleItems];
    if (sortMode === 'released') {
      const released = (item: MediaItem) => item.releaseDate ? Date.parse(item.releaseDate) : (item.year ?? 0) * 31_536_000_000;
      return result.sort((a, b) => released(b) - released(a) || compareTitles(a.title, b.title));
    }
    if (sortMode === 'random') {
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return result;
    }
    return result.sort((a, b) => compareTitles(a.title, b.title));
  }, [randomNonce, sortMode, visibleItems]);
  const availableLetters = useMemo(() => new Set(visibleItems.map((item) => titleInitial(item.title))), [visibleItems]);

  function updatePreferences(patch: Partial<PrismPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  function moveLibrary(viewId: string, direction: -1 | 1) {
    const ids = orderedViews.map((view) => view.id);
    const index = ids.indexOf(viewId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= ids.length) return;
    [ids[index], ids[destination]] = [ids[destination], ids[index]];
    updatePreferences({ libraryOrder: ids });
  }

  function toggleLibrary(viewId: string) {
    const hidden = preferences.hiddenLibraryIds.includes(viewId)
      ? preferences.hiddenLibraryIds.filter((id) => id !== viewId)
      : [...preferences.hiddenLibraryIds, viewId];
    updatePreferences({ hiddenLibraryIds: hidden });
  }

  function focusFirstPosterForLetter(letter: string) {
    setSortMode('alphabetical');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const poster = wallRef.current?.querySelector<HTMLButtonElement>(`.poster[data-letter="${letter}"]`);
      poster?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      poster?.focus({ preventScroll: true });
    }));
  }

  function navigatePosterGrid(event: ReactKeyboardEvent<HTMLElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const posters = Array.from(wallRef.current?.querySelectorAll<HTMLButtonElement>('button.poster') ?? []);
    const current = posters.indexOf(event.target as HTMLButtonElement);
    if (current < 0 || !posters.length) return;
    const columnCount = Math.max(1, getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length);
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columnCount, ArrowDown: columnCount };
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? posters.length - 1 : current + offsets[event.key];
    if (next < 0 || next >= posters.length) return;
    event.preventDefault();
    posters[next].focus();
    posters[next].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

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

  const dragRegion = <div className="window-drag-region" aria-hidden="true" {...windowDragProps()} />;

  if (!session && !demo) return <>{dragRegion}<Connect onConnected={setSession} onDemo={() => setDemo(true)} /></>;
  if (playingItem && session) return <>{dragRegion}<Player item={playingItem} session={session} preferences={preferences} mediaSourceId={playingItem.id === selected?.id ? selectedMediaSourceId : undefined} onPreferencesChange={updatePreferences} onClose={() => setPlayingItem(null)} /></>;

  const seasons = [...new Set(seriesEpisodes.map((episode) => episode.seasonNumber ?? 0))];
  const visibleEpisodes = seriesEpisodes.filter((episode) => (episode.seasonNumber ?? 0) === selectedSeason);
  const isMusicLibrary = activeView?.collectionType === 'music' || activeView?.name.toLowerCase() === 'music';

  return (
    <><div className="window-drag-region" aria-hidden="true" {...windowDragProps()} /><main className={`library library--grid-${preferences.gridDensity} ${isMusicLibrary ? 'library--music' : ''} ${preferences.reducedMotion ? 'library--reduced-motion' : ''} ${selected ? 'library--inspect' : ''}`}>
      <header {...windowDragProps()}>
        <div className="header__brand">
          {!demo && <button className="menu-trigger" onClick={() => { setDrawerPage('libraries'); setMenuOpen(true); }} aria-label="Open library menu"><span /><span /><span /></button>}
          <button className="wordmark" onClick={() => setSelected(null)}>PRISM</button>
        </div>
        <div className="header__tools" aria-label="Library navigation">
          <nav className="alphabet-rail" aria-label="Jump by title">
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
              <button key={letter} disabled={!availableLetters.has(letter)} onClick={() => focusFirstPosterForLetter(letter)} aria-label={`Jump to ${letter}`}>{letter}</button>
            ))}
          </nav>
          <span className="title-count">{demo ? 'DEMO LIBRARY' : `${visibleItems.length} ${isMusicLibrary ? 'ALBUMS' : 'TITLES'}`}</span>
          <label className="sort-control">
            <span>SORT</span>
            <select
              value={sortMode}
              onChange={(event) => {
                const mode = event.target.value as typeof sortMode;
                setSortMode(mode);
                if (mode === 'random') setRandomNonce((nonce) => nonce + 1);
              }}
              aria-label="Sort library"
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="random">Random</option>
              <option value="released">Date released</option>
            </select>
          </label>
        </div>
      </header>

      {!demo && (
        <>
          <button className={`drawer-scrim ${menuOpen ? 'is-open' : ''}`} onClick={() => setMenuOpen(false)} aria-label="Close library menu" />
          <aside className={`library-drawer ${menuOpen ? 'is-open' : ''}`} aria-hidden={!menuOpen}>
            <div className="library-drawer__top">
              <span>PRISM</span>
              <div className="library-drawer__actions">
                <button
                  className="settings-trigger"
                  onClick={() => setDrawerPage((page) => page === 'libraries' ? 'settings' : 'libraries')}
                  aria-label={drawerPage === 'libraries' ? 'Open settings' : 'Back to libraries'}
                >{drawerPage === 'libraries' ? '⚙︎' : '←'}</button>
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu">×</button>
              </div>
            </div>
            <p className="eyebrow">{drawerPage === 'libraries' ? 'YOUR LIBRARIES' : 'SETTINGS'}</p>
            {drawerPage === 'libraries' ? (
              <>
                <nav>
                  {preferences.showAllMedia && <button className={!activeView ? 'is-active' : ''} onClick={() => selectView(null)}><span>All Media</span><small>{!activeView ? visibleItems.length : ''}</small></button>}
                  {visibleDrawerViews.map((view, index) => (
                    <button key={view.id} className={activeView?.id === view.id ? 'is-active' : ''} onClick={() => selectView(view)}>
                      <span>{view.name}</span><small>{String(index + 1).padStart(2, '0')}</small>
                    </button>
                  ))}
                </nav>
                <div className="library-drawer__footer"><span>{session?.username}</span><button onClick={disconnect}>SIGN OUT</button></div>
              </>
            ) : (
              <div className="settings-panel">
                <section className="settings-section">
                  <h3>LIBRARIES</h3>
                  <label className="setting-toggle"><span>Show All Media</span><input type="checkbox" checked={preferences.showAllMedia} onChange={(event) => updatePreferences({ showAllMedia: event.target.checked })} /></label>
                  <p className="settings-hint">Reorder with the arrows. Hide any library with the visibility dot.</p>
                  <div className="settings-library-list">
                    {orderedViews.map((view, index) => {
                      const hidden = preferences.hiddenLibraryIds.includes(view.id);
                      return (
                        <div className={hidden ? 'is-hidden' : ''} key={view.id}>
                          <button className="library-visibility" onClick={() => toggleLibrary(view.id)} aria-label={`${hidden ? 'Show' : 'Hide'} ${view.name}`} aria-pressed={!hidden}>{hidden ? '○' : '●'}</button>
                          <span>{view.name}</span>
                          <button onClick={() => moveLibrary(view.id, -1)} disabled={index === 0} aria-label={`Move ${view.name} up`}>↑</button>
                          <button onClick={() => moveLibrary(view.id, 1)} disabled={index === orderedViews.length - 1} aria-label={`Move ${view.name} down`}>↓</button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="settings-section">
                  <h3>SUBTITLES</h3>
                  <label className="setting-select"><span>Color</span><select value={preferences.subtitleColor} onChange={(event) => updatePreferences({ subtitleColor: event.target.value as PrismPreferences['subtitleColor'] })}><option value="white">White</option><option value="warm">Warm white</option><option value="yellow">Cinema yellow</option><option value="cyan">Prism cyan</option></select></label>
                  <label className="setting-select"><span>Size</span><select value={preferences.subtitleSize} onChange={(event) => updatePreferences({ subtitleSize: event.target.value as PrismPreferences['subtitleSize'] })}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>
                  <label className="setting-select"><span>Background</span><select value={preferences.subtitleBackground} onChange={(event) => updatePreferences({ subtitleBackground: event.target.value as PrismPreferences['subtitleBackground'] })}><option value="none">None</option><option value="soft">Soft</option><option value="strong">Strong</option></select></label>
                  <label className="setting-toggle"><span>English on foreign audio</span><input type="checkbox" checked={preferences.autoEnglishSubtitles} onChange={(event) => updatePreferences({ autoEnglishSubtitles: event.target.checked })} /></label>
                </section>

                <section className="settings-section">
                  <h3>FILM METADATA</h3>
                  <div className="metadata-connection">
                    <span className={tmdbConfigured ? 'is-connected' : ''}>{tmdbConfigured ? 'TMDb connected' : 'TMDb not connected'}</span>
                    <button onClick={() => { setTmdbEditorOpen((open) => !open); setTmdbStatus(''); }}>{tmdbConfigured ? 'REPLACE' : 'CONNECT'}</button>
                  </div>
                  {tmdbEditorOpen && (
                    <div className="metadata-token-editor">
                      <label htmlFor="tmdb-token">TMDb API Read Access Token</label>
                      <input id="tmdb-token" type="password" value={tmdbTokenDraft} onChange={(event) => setTmdbTokenDraft(event.target.value)} autoComplete="off" spellCheck={false} />
                      <button onClick={() => void saveTmdbToken()} disabled={!tmdbTokenDraft.trim()}>VERIFY & SAVE</button>
                    </div>
                  )}
                  {tmdbStatus && <p className="metadata-status" role="status">{tmdbStatus}</p>}
                  <p className="settings-hint">Adds reported budget and revenue. Your token is encrypted in macOS secure storage.</p>
                  <p className="tmdb-attribution">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                  <div className="production-scan-control">
                    <div><strong>Production formats</strong><span>Camera, lenses, film stock and process</span></div>
                    <button onClick={() => void scanMissingProductionData()} disabled={productionScanRunning}>{productionScanRunning ? 'SCANNING' : 'SCAN MISSING'}</button>
                  </div>
                  {productionScanRunning && productionScan && (
                    <div className="production-progress" aria-live="polite">
                      <span style={{ width: `${Math.round((productionScan.current / Math.max(1, productionScan.total)) * 100)}%` }} />
                      <small>{productionScan.current} / {productionScan.total} · {productionScan.title}</small>
                    </div>
                  )}
                  {productionScanStatus && <p className="production-scan-status" role="status">{productionScanStatus}</p>}
                  <p className="settings-hint">Checks only uncached or previously missing films, one request at a time. Community data from ShotOnWhat.</p>
                </section>

                <section className="settings-section">
                  <h3>PLAYBACK & APPEARANCE</h3>
                  <label className="setting-select"><span>Arrow-key skip</span><select value={preferences.skipSeconds} onChange={(event) => updatePreferences({ skipSeconds: Number(event.target.value) as PrismPreferences['skipSeconds'] })}><option value="10">10 seconds</option><option value="15">15 seconds</option><option value="30">30 seconds</option></select></label>
                  <label className="setting-select"><span>Poster density</span><select value={preferences.gridDensity} onChange={(event) => updatePreferences({ gridDensity: event.target.value as PrismPreferences['gridDensity'] })}><option value="cinematic">Cinematic</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
                  <label className="setting-select"><span>Default sort</span><select value={preferences.defaultSort} onChange={(event) => { const mode = event.target.value as SortMode; updatePreferences({ defaultSort: mode }); setSortMode(mode); }}><option value="alphabetical">Alphabetical</option><option value="random">Random</option><option value="released">Date released</option></select></label>
                  <label className="setting-toggle"><span>Reduce motion</span><input type="checkbox" checked={preferences.reducedMotion} onChange={(event) => updatePreferences({ reducedMotion: event.target.checked })} /></label>
                </section>
                <button className="settings-reset" onClick={() => { setPreferences(defaultPreferences); setSortMode(defaultPreferences.defaultSort); }}>RESET SETTINGS</button>
              </div>
            )}
          </aside>
        </>
      )}

      {libraryError && <div className="library-error">{libraryError} <button onClick={disconnect}>Reconnect</button></div>}
      {!libraryError && (libraryLoading || !visibleItems.length) && <div className="loading">DEVELOPING {activeView?.name?.toUpperCase() || 'YOUR LIBRARY'}…</div>}

      <section ref={wallRef} className={`wall ${scrollbarVisible ? 'wall--scrollbar-visible' : ''}`} aria-label={isMusicLibrary ? 'Music albums' : 'Media library'} onKeyDown={navigatePosterGrid}>
        {sortedItems.map((item) => <Poster key={item.id} item={item} onSelect={setSelected} />)}
      </section>

      {selected && (
        <section className={`inspect ${moreOpen ? 'inspect--more' : ''} ${selected.type === 'MusicAlbum' || selected.type === 'Audio' ? 'inspect--album' : ''}`} style={{
          '--selected-hue': selected.hue,
          ...(selected.backdropUrl ? { '--backdrop': `url("${selected.backdropUrl}")` } : {})
        } as React.CSSProperties}>
          <button className="inspect__scrim" onClick={() => setSelected(null)} aria-label="Reshelve title" />
          {moreOpen ? (
            selected.type === 'MusicAlbum' || selected.type === 'Audio' ? (
              <AlbumMoreDetails
                item={selected}
                details={mediaDetails}
                metadata={albumMetadata}
                loading={moreLoading || albumMetadataLoading}
                error={moreError || albumMetadataError}
                onBack={() => setMoreOpen(false)}
              />
            ) : (
              <MoreDetails
                item={selected}
                details={mediaDetails}
                production={productionDetails}
                versions={playbackVersions}
                similar={similarItems}
                loading={moreLoading}
                error={moreError}
                onBack={() => setMoreOpen(false)}
                onSelect={(item) => { setMoreOpen(false); setSelected(item); }}
              />
            )
          ) : <>
            <div className="inspect__poster">
              {(selected.type === 'MusicAlbum' || selected.type === 'Audio') && <div className="album-reactive-field" aria-hidden="true">
                {Array.from({ length: 4 }, (_, index) => <i className="album-reactive-ring" key={`ring-${index}`} />)}
                {Array.from({ length: 54 }, (_, index) => <i className="album-orbit-dot" key={`dot-${index}`} style={{
                  '--dot-angle': `${(index * 137.5) % 360}deg`,
                  '--dot-radius': `${55 + (index % 9) * 8}%`,
                  '--dot-size': `${1 + (index % 4) * .65}px`,
                  '--dot-speed': `${18 + (index % 11) * 2.7}s`,
                  '--dot-delay': `${-index * .41}s`
                } as React.CSSProperties} />)}
              </div>}
              {selected.type === 'MusicAlbum' || selected.type === 'Audio'
                ? <AlbumArtwork item={selected} metadata={albumMetadata} />
                : <Poster item={selected} />}
            </div>
            <article className="inspect__copy">
            <button className="reshelve back-button" aria-label="Reshelve title" onClick={() => setSelected(null)}><span aria-hidden="true">←</span><span>RESHELVE</span></button>
            <p className="eyebrow">{[selected.artist, selected.year, formatRuntime(selected.runtimeMinutes), selected.type.toUpperCase()].filter(Boolean).join(' · ')}</p>
            <h2>{selected.title}</h2>
            <p className="overview">{selected.overview || 'No synopsis is available for this title yet.'}</p>
            {demo ? (
              <div className="inspect__actions">
                <button className="play play--disabled" aria-label="Connect to play" onClick={() => alert('Connect Prism to your Jellyfin server to play your own media.')}><PrismPlayMark /><span className="play__label">CONNECT TO PLAY</span></button>
                <button className="more-trigger" onClick={() => setMoreOpen(true)} aria-label={`More about ${selected.title}`}><span aria-hidden="true">•••</span></button>
              </div>
            ) : selected.type === 'Series' ? (
              <div className="show-browser">
                {seriesLoading && <p className="show-browser__status">DEVELOPING EPISODES…</p>}
                {seriesError && <p className="show-browser__status show-browser__status--error">{seriesError}</p>}
                {!seriesLoading && !seriesError && (
                  <>
                    <div className="season-tabs" aria-label="Seasons">
                      {seasons.map((season) => (
                        <button key={season} className={selectedSeason === season ? 'is-active' : ''} onClick={() => setSelectedSeason(season)}>
                          {season === 0 ? 'SPECIALS' : `SEASON ${season}`}
                        </button>
                      ))}
                    </div>
                    <div className="episode-list">
                      {visibleEpisodes.map((episode) => (
                        <button key={episode.id} className="episode-row" onClick={() => setPlayingItem(episode)}>
                          <span className="episode-row__number">{String(episode.episodeNumber ?? 0).padStart(2, '0')}</span>
                          <span className="episode-row__copy"><strong>{episode.title}</strong><small>{formatRuntime(episode.runtimeMinutes)}</small></span>
                          <span className="episode-row__play">▶</span>
                        </button>
                      ))}
                      {!visibleEpisodes.length && <p className="show-browser__status">NO EPISODES FOUND</p>}
                    </div>
                  </>
                )}
              </div>
            ) : selected.type === 'MusicAlbum' || selected.type === 'Audio' ? (
              session ? <div className="album-player-shell">
                <AlbumPlayer key={selected.id} album={selected} session={session} />
                <button className="more-trigger album-more-trigger" onClick={() => setMoreOpen(true)} aria-label={`More about ${selected.title}`}><span aria-hidden="true">•••</span></button>
              </div> : null
            ) : (
              <div className="inspect__actions">
                <div className="playback-actions">
                  <button className="play" aria-label={`Play ${selected.title}`} onClick={() => setPlayingItem(selected)}><PrismPlayMark /><span className="play__label">PLAY</span></button>
                  {playbackVersions.length > 1 && (
                    <label className="version-picker">
                      <span>VERSION</span>
                      <select value={selectedMediaSourceId} onChange={(event) => setSelectedMediaSourceId(event.target.value)} aria-label="Playback version">
                        {playbackVersions.map((version) => (
                          <option key={version.mediaSourceId} value={version.mediaSourceId}>{version.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <button className="more-trigger" onClick={() => setMoreOpen(true)} aria-label={`More about ${selected.title}`}><span aria-hidden="true">•••</span></button>
              </div>
            )}
            </article>
          </>}
        </section>
      )}
    </main></>
  );
}
