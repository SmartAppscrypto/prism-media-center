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
    };
  }
}
