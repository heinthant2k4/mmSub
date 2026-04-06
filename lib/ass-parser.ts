import type { SubtitleCue } from './messages';

/**
 * Convert an ASS timestamp (H:MM:SS.cc) to milliseconds.
 * cc = centiseconds (1/100 second), so multiply by 10 to get ms.
 */
function assTimeToMs(time: string): number {
  const [h, m, rest] = time.split(':');
  const dotIdx = rest?.indexOf('.') ?? -1;
  const s = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest ?? '0';
  const cc = dotIdx >= 0 ? rest.slice(dotIdx + 1) : '0';
  return (
    parseInt(h ?? '0', 10) * 3600000 +
    parseInt(m ?? '0', 10) * 60000 +
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
 * Parse the Format: line from the [Events] section and return
 * the column indices for Start, End, and Text fields.
 * Falls back to standard ASS defaults if the line is absent.
 */
function parseFormatLine(formatLine: string): { startIdx: number; endIdx: number; textIdx: number } {
  // Default indices for standard Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
  const defaults = { startIdx: 1, endIdx: 2, textIdx: 9 };

  const afterPrefix = formatLine.slice('Format:'.length).trim();
  const cols = afterPrefix.split(',').map(c => c.trim().toLowerCase());

  const startIdx = cols.indexOf('start');
  const endIdx = cols.indexOf('end');
  const textIdx = cols.indexOf('text');

  if (startIdx === -1 || endIdx === -1 || textIdx === -1) return defaults;
  return { startIdx, endIdx, textIdx };
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
 * - Format: line for non-standard column order
 * - Returns cues sorted by startMs with sequential indices
 */
export function parseAss(text: string): SubtitleCue[] {
  if (!text.trim()) return [];

  // Normalize line endings
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const cues: SubtitleCue[] = [];
  let inEvents = false;
  let startIdx = 1;
  let endIdx = 2;
  let textIdx = 9;

  for (const line of lines) {
    const trimmed = line.trim();

    // Track sections
    if (trimmed.startsWith('[')) {
      inEvents = trimmed === '[Events]';
      continue;
    }

    if (!inEvents) continue;

    // Parse Format: line to get column positions
    if (trimmed.startsWith('Format:')) {
      ({ startIdx, endIdx, textIdx } = parseFormatLine(trimmed));
      continue;
    }

    // Only process Dialogue lines, skip Comment and others
    if (!trimmed.startsWith('Dialogue:')) continue;

    const afterPrefix = trimmed.slice('Dialogue:'.length).trimStart();
    const parts = afterPrefix.split(',');
    const minCols = Math.max(startIdx, endIdx, textIdx) + 1;
    if (parts.length < minCols) continue;

    const startStr = parts[startIdx].trim();
    const endStr = parts[endIdx].trim();
    // Rejoin everything from textIdx onward as the Text field (commas allowed in text)
    const textRaw = parts.slice(textIdx).join(',');

    const startMs = assTimeToMs(startStr);
    const endMs = assTimeToMs(endStr);

    if (!isFinite(startMs) || !isFinite(endMs)) continue;
    if (endMs < startMs) continue;

    // Process text: strip override tags, then replace soft line breaks
    const cueText = stripOverrideTags(textRaw)
      .replace(/\\N/g, '\n')
      .replace(/\\n/g, '\n');

    cues.push({ index: 0, startMs, endMs, text: cueText });
  }

  // Sort by startMs
  cues.sort((a, b) => a.startMs - b.startMs);

  // Assign sequential indices starting at 1
  for (let i = 0; i < cues.length; i++) {
    cues[i].index = i + 1;
  }

  return cues;
}
