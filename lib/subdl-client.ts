import { SUBDL_API_KEY, SUBDL_BASE_URL, SUBDL_DOWNLOAD_BASE_URL, SUBDL_LANGUAGE } from './config';
import type { SubtitleResult } from './messages';
import { unzip } from 'fflate';

export async function searchSubDL(query: string): Promise<SubtitleResult[]> {
  if (!SUBDL_API_KEY) return [];

  const params = new URLSearchParams({
    api_key: SUBDL_API_KEY,
    film_name: query,
    languages: SUBDL_LANGUAGE,
    subs_per_page: '30',
  });

  const resp = await fetch(`${SUBDL_BASE_URL}/subtitles?${params}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(`SubDL search failed: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();

  if (!json.status || !Array.isArray(json.subtitles)) {
    return [];
  }

  const movie = json.results?.[0];

  return json.subtitles.map((sub: any) => ({
    source: 'subdl' as const,
    sdUrl: sub.url ?? '',
    releaseName: sub.release_name ?? '',
    featureTitle: movie?.name ?? 'Unknown',
    language: sub.lang ?? SUBDL_LANGUAGE,
    downloadCount: sub.download_count ?? 0,
    uploadDate: sub.release_date ?? '',
    year: movie?.year,
  } satisfies SubtitleResult));
}

export async function downloadSubDL(sdUrl: string): Promise<string> {
  const resp = await fetch(`${SUBDL_DOWNLOAD_BASE_URL}${sdUrl}`);

  if (!resp.ok) {
    throw new Error(`SubDL download failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = new Uint8Array(await resp.arrayBuffer());
  return extractSrtFromZip(buffer);
}

function extractSrtFromZip(data: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, files) => {
      if (err) {
        reject(new Error(`ZIP extraction failed: ${err.message}`));
        return;
      }

      // Prefer root-level .srt, then any nested .srt
      const entries = Object.entries(files);
      const srtEntry =
        entries.find(([name]) => !name.includes('/') && name.toLowerCase().endsWith('.srt')) ??
        entries.find(([name]) => name.toLowerCase().endsWith('.srt'));

      if (!srtEntry) {
        reject(new Error('No .srt file found in ZIP'));
        return;
      }

      resolve(new TextDecoder('utf-8').decode(srtEntry[1]));
    });
  });
}
