import { describe, expect, it } from 'vitest';
import { analyseFrequencyData } from './audioReactive';

describe('audio frequency analysis', () => {
  it('returns silence for empty frequency data', () => {
    expect(analyseFrequencyData([])).toEqual({ bass: 0, mid: 0, high: 0, energy: 0 });
  });

  it('separates bass energy from higher frequencies', () => {
    const data = new Uint8Array(128);
    data.fill(230, 0, 11);
    data.fill(40, 11, 100);
    const bands = analyseFrequencyData(data);

    expect(bands.bass).toBeGreaterThan(0.85);
    expect(bands.bass).toBeGreaterThan(bands.mid * 4);
    expect(bands.high).toBeLessThan(0.2);
  });
});
