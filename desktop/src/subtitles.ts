export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
};

function timestampSeconds(value: string) {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) return Number.NaN;
  const seconds = parts.pop() ?? 0;
  const minutes = parts.pop() ?? 0;
  const hours = parts.pop() ?? 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function plainCueText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

export function parseWebVtt(value: string): SubtitleCue[] {
  const blocks = value.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim());
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) continue;
    const [rawStart, rawEnd] = lines[timingIndex].split('-->');
    const start = timestampSeconds(rawStart);
    const end = timestampSeconds(rawEnd.trim().split(/\s+/)[0]);
    const text = plainCueText(lines.slice(timingIndex + 1).join('\n'));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && text) cues.push({ start, end, text });
  }
  return cues.sort((a, b) => a.start - b.start);
}
