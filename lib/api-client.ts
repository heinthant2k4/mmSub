import {
  OPENSUBTITLES_API_KEY,
  OPENSUBTITLES_BASE_URL,
  BURMESE_LANGUAGE_CODE,
} from './config';
import type { SubtitleResult } from './messages';

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Api-Key': OPENSUBTITLES_API_KEY,
    'User-Agent': 'MyanmarSubtitles v1.0.0',
  };
}

export async function searchSubtitles(query: string): Promise<SubtitleResult[]> {
  const params = new URLSearchParams({
    query,
    languages: BURMESE_LANGUAGE_CODE,
  });

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
      fileId: file?.file_id ?? 0,
      title: feature.title ?? 'Unknown',
      language: attr.language ?? BURMESE_LANGUAGE_CODE,
      downloadCount: attr.download_count ?? 0,
      uploadDate: attr.upload_date ?? '',
      featureTitle: feature.title ?? 'Unknown',
      year: feature.year,
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
