import type { ProductionDetails, ProductionScanProgress } from './types';

export {};

declare global {
  interface Window {
    prismWindow?: {
      startDrag: (x: number, y: number) => void;
      moveDrag: (x: number, y: number) => void;
      endDrag: () => void;
    };
    prismMetadata?: {
      hasTmdbToken: () => Promise<boolean>;
      saveTmdbToken: (token: string) => Promise<{ ok: boolean; error?: string }>;
      clearTmdbToken: () => Promise<boolean>;
      getTmdbMovie: (identifiers: { tmdbId?: string; imdbId?: string }) => Promise<{ budget?: number; revenue?: number; source: 'TMDb' } | null>;
      getProduction: (item: { title: string; year?: number; scrapeIfMissing?: boolean }) => Promise<ProductionDetails | null>;
      scanProduction: (items: Array<{ title: string; year?: number }>) => Promise<{ ok: boolean; total?: number; found?: number; missing?: number; skipped?: number; error?: string }>;
      onProductionProgress: (callback: (progress: ProductionScanProgress) => void) => () => void;
    };
    prismNativePlayer?: {
      status: () => Promise<{ available: boolean; error?: string; surface?: { className: string; subviewCount: number } | null }>;
      start: (mediaUrl: string, subtitleStyle: { color: string; size: string; background: string }) => Promise<{ ok: boolean; error?: string }>;
      state: () => Promise<{ active: boolean; playing: boolean; paused: boolean; ended: boolean; error: boolean; timeMs: number; durationMs: number; volume: number; message: string }>;
      setPaused: (paused: boolean) => Promise<boolean>;
      seek: (milliseconds: number) => Promise<boolean>;
      setVolume: (volume: number) => Promise<boolean>;
      addSubtitle: (subtitleUrl: string) => Promise<boolean>;
      disableSubtitles: () => Promise<boolean>;
      stop: () => Promise<boolean>;
    };
  }
}
