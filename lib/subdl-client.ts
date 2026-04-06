import { SUBDL_API_KEY, SUBDL_BASE_URL, SUBDL_DOWNLOAD_BASE_URL, SUBDL_LANGUAGE } from './config';
import type { SubtitleResult, SearchOpts } from './messages';
import { unzip } from 'fflate';

export async function searchSubDL(query: string, opts?: SearchOpts): Promise<SubtitleResult[]> {
  if (!SUBDL_API_KEY) return [];

  const params = new URLSearchParams({
    api_key: SUBDL_API_KEY,
    film_name: query,
    languages: SUBDL_LANGUAGE,
    subs_per_page: '30',
  });

  if (opts?.contentType) {
    params.set('type', opts.contentType === 'tv' ? 'tv' : 'movie');
  }
  if (opts?.season != null) {
    params.set('season_number', String(opts.season));
  }
  if (opts?.episode != null) {
    params.set('episode_number', String(opts.episode));
  }

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
    uploaderName: sub.author ?? undefined,
  } satisfies SubtitleResult));
}

export type SubDLDownload = { text: string; format: 'srt' | 'ass' };

export async function downloadSubDL(sdUrl: string): Promise<SubDLDownload> {
  const resp = await fetch(`${SUBDL_DOWNLOAD_BASE_URL}${sdUrl}`);

  if (!resp.ok) {
    throw new Error(`SubDL download failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = new Uint8Array(await resp.arrayBuffer());
  return extractSubtitleFromZip(buffer);
}

function isAss(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.ass') || lower.endsWith('.ssa');
}

function isSrt(name: string): boolean {
  return name.toLowerCase().endsWith('.srt');
}

function extractSubtitleFromZip(data: Uint8Array): Promise<SubDLDownload> {
  return new Promise((resolve, reject) => {
    unzip(data, (err, files) => {
      if (err) {
        reject(new Error(`ZIP extraction failed: ${err.message}`));
        return;
      }

      const entries = Object.entries(files);

      // Prefer root-level .srt, then any nested .srt, then root-level .ass/.ssa, then any .ass/.ssa
      const entry =
        entries.find(([name]) => !name.includes('/') && isSrt(name)) ??
        entries.find(([name]) => isSrt(name)) ??
        entries.find(([name]) => !name.includes('/') && isAss(name)) ??
        entries.find(([name]) => isAss(name));

      if (!entry) {
        reject(new Error('No .srt or .ass file found in ZIP'));
        return;
      }

      const format = isSrt(entry[0]) ? 'srt' : 'ass';
      resolve({ text: new TextDecoder('utf-8').decode(entry[1]), format });
    });
  });
}
