export type AudioBands = {
  bass: number;
  mid: number;
  high: number;
  energy: number;
};

function average(data: ArrayLike<number>, start: number, end: number) {
  const from = Math.max(0, Math.min(data.length, start));
  const to = Math.max(from + 1, Math.min(data.length, end));
  let total = 0;
  for (let index = from; index < to; index += 1) total += data[index] ?? 0;
  return total / (to - from) / 255;
}

export function analyseFrequencyData(data: ArrayLike<number>): AudioBands {
  if (!data.length) return { bass: 0, mid: 0, high: 0, energy: 0 };
  const bassEnd = Math.max(2, Math.floor(data.length * 0.09));
  const midEnd = Math.max(bassEnd + 1, Math.floor(data.length * 0.36));
  const highEnd = Math.max(midEnd + 1, Math.floor(data.length * 0.78));
  return {
    bass: average(data, 0, bassEnd),
    mid: average(data, bassEnd, midEnd),
    high: average(data, midEnd, highEnd),
    energy: average(data, 0, highEnd)
  };
}
