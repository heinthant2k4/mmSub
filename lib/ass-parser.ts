import type { SubtitleCue } from './messages';

/**
 * Convert an ASS timestamp (H:MM:SS.cc) to milliseconds.
 * cc = centiseconds (1/100 second), so multiply by 10 to get ms.
 */
function assTimeToMs(time: string): number {
  const [h, m, rest] = time.split(':');
  const [s, cc] = rest.split('.');
  return (
    parseInt(h, 10) * 3600000 +
    parseInt(m, 10) * 60000 +
    parseInt(s, 10) * 1000 +
    parseInt(cc, 10) * 10
  );
}

/**
 * Strip ASS override tags of the form {...} from a text string.
 */
function stripOverrideTags(text: string): string {
  return text.replace(/\{[^}]*\}/g, '');
}

/**
 * Parse ASS/SSA subtitle files and return an array of SubtitleCue objects.
 *
 * Handles:
 * - [Events] section only
 * - Dialogue: lines (skips Comment: lines)
 * - H:MM:SS.cc timestamps (centiseconds → ms)
 * - {override tag} stripping
 * - \N and \n line breaks
 * - CRLF line endings
 * - Returns cues sorted by startMs with sequential indices
 */
export function parseAss(text: string): SubtitleCue[] {
  if (!text.trim()) return [];

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const cues: SubtitleCue[] = [];
  let inEvents = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track sections
    if (trimmed.startsWith('[')) {
      inEvents = trimmed === '[Events]';
      continue;
    }

    if (!inEvents) continue;

    // Only process Dialogue lines, skip Comment and others
    if (!trimmed.startsWith('Dialogue:')) continue;

    // Split on comma with a max of 10 parts (9 commas = fields 1-9, remainder is Text)
    // Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
    const afterPrefix = trimmed.slice('Dialogue:'.length).trimStart();
    // Remove the leading space after "Dialogue: " if present
    const parts = afterPrefix.split(',');
    if (parts.length < 10) continue;

    // Rejoin everything from index 9 onward as the Text field
    const startStr = parts[1].trim();
    const endStr = parts[2].trim();
    const textRaw = parts.slice(9).join(',');

    const startMs = assTimeToMs(startStr);
    const endMs = assTimeToMs(endStr);

    // Process text: strip override tags, then replace soft line breaks
    const text = stripOverrideTags(textRaw)
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n');

    cues.push({ index: 0, startMs, endMs, text });
  }

  // Sort by startMs
  cues.sort((a, b) => a.startMs - b.startMs);

  // Assign sequential indices starting at 1
  for (let i = 0; i < cues.length; i++) {
    cues[i].index = i + 1;
  }

  return cues;
}
