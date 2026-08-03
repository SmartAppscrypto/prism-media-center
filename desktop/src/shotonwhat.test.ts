import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { parseShotOnWhatPage, slugify } = require('../electron/shotonwhat.cjs') as {
  parseShotOnWhatPage: (html: string, title: string, year: number, url: string) => Record<string, string[]> | null;
  slugify: (title: string) => string;
};

describe('ShotOnWhat production metadata', () => {
  it('builds stable title-and-year slugs', () => {
    expect(slugify("Master and Commander: The Far Side of the World")).toBe('master-and-commander-the-far-side-of-the-world');
    expect(slugify("Amélie")).toBe('amelie');
  });

  it('extracts structured camera and lens data only for an exact title match', () => {
    const html = `
      <meta property="og:title" content="The Matrix (1999)" />
      <div>Cinematography by | <a href="/person">Bill Pope</a><br/></div>
      <script>
        var dataLayer_content = {"pagePostTerms":{"acquisition":["Celluloid"],"cameras":["Pan-Arri 435 Camera"],"lenses":["Panavision Primo Primes Spherical Lenses"],"film-negative-stock":["Kodak Vision 500T 5279 Neg. Film"],"distributed-aspect-ratio":["2.39:1"]}};
        dataLayer.push( dataLayer_content );
      </script>`;
    const parsed = parseShotOnWhatPage(html, 'The Matrix', 1999, 'https://shotonwhat.com/the-matrix-1999');

    expect(parsed?.cameras).toEqual(['Pan-Arri 435 Camera']);
    expect(parsed?.lenses).toEqual(['Panavision Primo Primes Spherical Lenses']);
    expect(parsed?.cinematographers).toEqual(['Bill Pope']);
    expect(parseShotOnWhatPage(html, 'The Matrix Reloaded', 2003, 'https://shotonwhat.com/the-matrix-1999')).toBeNull();
  });
});
