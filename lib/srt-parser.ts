import type { SubtitleCue } from './messages';

function timeToMs(time: string): number {
  const [h, m, rest] = time.split(':');
  const [s, ms] = rest.split(',');
  return (
    parseInt(h, 10) * 3600000 +
    parseInt(m, 10) * 60000 +
    parseInt(s, 10) * 1000 +
    parseInt(ms, 10)
  );
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

export function parseSrt(srtText: string): SubtitleCue[] {
  if (!srtText.trim()) return [];

  // Normalize line endings
  const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into blocks by double newline
  const blocks = normalized.trim().split(/\n\n+/);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;

    const startMs = timeToMs(timeMatch[1]);
    const endMs = timeToMs(timeMatch[2]);
    const text = stripHtml(lines.slice(2).join('\n').trim());

    cues.push({ index, startMs, endMs, text });
  }

  return cues;
}
