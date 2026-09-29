import type { ProductionDetails, ProductionFacetKey, ProductionScanProgress } from './types';

export {};

declare global {
  interface Window {
    prismSession?: {
      load: () => Promise<import('./types').PrismSession | null>;
      save: (value: import('./types').PrismSession) => Promise<boolean>;
      clear: () => Promise<void>;
    };
    prismWindow?: {
      platform: string;
      startDrag: (x: number, y: number) => void;
      moveDrag: (x: number, y: number) => void;
      endDrag: () => void;
      minimize: () => void;
      toggleMaximize: () => void;
      setFullscreen: (enabled: boolean) => void;
      toggleFullscreen: () => void;
      close: () => void;
    };
    prismMetadata?: {
      hasTmdbToken: () => Promise<boolean>;
      saveTmdbToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
      clearTmdbToken: () => Promise<boolean>;
      getTmdbMovie: (identifiers: { tmdbId?: string; imdbId?: string }) => Promise<{ budget?: number; revenue?: number; source: 'TMDb' } | null>;
      getProduction: (item: { title: string; year?: number; scrapeIfMissing?: boolean }) => Promise<ProductionDetails | null>;
      findProductionMatches: (query: { items: Array<{ id: string; title: string; year?: number }>; field: ProductionFacetKey; value: string }) => Promise<string[]>;
      scanProduction: (items: Array<{ title: string; year?: number }>) => Promise<{ ok: boolean; total?: number; found?: number; missing?: number; skipped?: number; error?: string }>;
      onProductionProgress: (callback: (progress: ProductionScanProgress) => void) => () => void;
    };
    prismNativePlayer?: {
      status: () => Promise<{ available: boolean; error?: string; surface?: { className: string; subviewCount: number } | null }>;
      start: (mediaUrl: string, subtitleStyle: { color: string; size: string; background: string }) => Promise<{ ok: boolean; error?: string }>;
      state: () => Promise<{ active: boolean; playing: boolean; paused: boolean; ended: boolean; error: boolean; timeMs: number; durationMs: number; volume: number; subtitleTrack: number; message: string }>;
      setPaused: (paused: boolean) => Promise<boolean>;
      seek: (milliseconds: number) => Promise<boolean>;
      setVolume: (volume: number) => Promise<boolean>;
      addSubtitle: (subtitleUrl: string) => Promise<boolean>;
      selectSubtitle: (track: number) => Promise<boolean>;
      disableSubtitles: () => Promise<boolean>;
      stop: () => Promise<boolean>;
    };
  }
}
