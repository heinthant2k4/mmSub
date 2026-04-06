import {
  OPENSUBTITLES_API_KEY,
  OPENSUBTITLES_BASE_URL,
  OPENSUBTITLES_LANGUAGE,
} from './config';
import type { SubtitleResult, SearchOpts } from './messages';

export type { SearchOpts };

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Api-Key': OPENSUBTITLES_API_KEY,
  };
}

export async function searchSubtitles(query: string, opts?: SearchOpts): Promise<SubtitleResult[]> {
  const params = new URLSearchParams({
    query,
    languages: OPENSUBTITLES_LANGUAGE,
  });

  if (opts?.contentType) {
    params.set('type', opts.contentType === 'tv' ? 'episode' : 'movie');
  }
  if (opts?.season != null) {
    params.set('season_number', String(opts.season));
  }
  if (opts?.episode != null) {
    params.set('episode_number', String(opts.episode));
  }

  const resp = await fetch(`${OPENSUBTITLES_BASE_URL}/subtitles?${params}`, {
    method: 'GET',
    headers: headers(),
  });

  if (!resp.ok) {
    throw new Error(`OpenSubtitles search failed: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();

  return json.data.map((item: any) => {
    const attr = item.attributes;
    const file = attr.files?.[0];
    const feature = attr.feature_details ?? {};

    return {
      source: 'os',
      fileId: file?.file_id ?? 0,
      releaseName: file?.file_name ?? '',
      featureTitle: feature.title ?? 'Unknown',
      language: attr.language ?? OPENSUBTITLES_LANGUAGE,
      downloadCount: attr.download_count ?? 0,
      uploadDate: attr.upload_date ?? '',
      year: feature.year,
      uploaderName: attr.uploader?.name ?? undefined,
    } satisfies SubtitleResult;
  });
}

export async function downloadSubtitle(fileId: number): Promise<string> {
  // Step 1: Request download link
  const resp = await fetch(`${OPENSUBTITLES_BASE_URL}/download`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ file_id: fileId }),
  });

  if (!resp.ok) {
    throw new Error(`OpenSubtitles download failed: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  const link = json.link;

  if (!link) {
    throw new Error('No download link in response');
  }

  // Step 2: Fetch the actual SRT file
  const srtResp = await fetch(link);
  if (!srtResp.ok) {
    throw new Error(`Failed to fetch SRT file: ${srtResp.status}`);
  }

  return srtResp.text();
}
