import type { SubtitleResult } from './messages';

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(srt|zip|sub|idx)$/i, '')   // strip extension
    .replace(/[.\-_\s]+/g, ' ')              // unify separators
    .trim();
}

/**
 * Merge results from multiple sources, removing duplicates.
 *
 * Two entries are considered duplicates when they share the same year and
 * normalized release name. When a duplicate is found we keep whichever entry
 * is "better": SubDL is preferred over OpenSubtitles (no User-Agent issues),
 * and within the same source we keep the higher download count.
 *
 * Results without a release name or year cannot be matched and are kept as-is.
 */
export function deduplicateResults(results: SubtitleResult[]): SubtitleResult[] {
  const keyed = new Map<string, SubtitleResult>();
  const unkeyed: SubtitleResult[] = [];

  for (const result of results) {
    if (!result.releaseName || !result.year) {
      unkeyed.push(result);
      continue;
    }

    const key = `${result.year}:${normalize(result.releaseName)}`;
    const existing = keyed.get(key);

    if (!existing) {
      keyed.set(key, result);
      continue;
    }

    const preferNew =
      (result.source === 'subdl' && existing.source === 'os') ||
      (result.source === existing.source && result.downloadCount > existing.downloadCount);

    if (preferNew) keyed.set(key, result);
  }

  return [...keyed.values(), ...unkeyed].sort((a, b) => b.downloadCount - a.downloadCount);
}
