// lib/messages.ts

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

// Popup → Background messages
export type PopupMessage =
  | { type: 'SEARCH'; query: string; season?: number; episode?: number; contentType?: 'movie' | 'tv' }
  | { type: 'SELECT'; source: 'os'; fileId: number }
  | { type: 'SELECT'; source: 'subdl'; sdUrl: string }
  | { type: 'LOAD_LOCAL'; srtText: string }
  | { type: 'OFFSET'; deltaMs: number }
  | { type: 'GET_STATUS' }
  | { type: 'CLEAR' };

// Background → Content messages
export type ContentMessage =
  | { type: 'LOAD_CUES'; cues: SubtitleCue[] }
  | { type: 'ADJUST_OFFSET'; deltaMs: number }
  | { type: 'CLEAR' };

// Unified subtitle result from either source
export interface SubtitleResult {
  source: 'os' | 'subdl';
  /** OpenSubtitles file ID (source === 'os') */
  fileId?: number;
  /** SubDL download path e.g. /subtitle/123-456.zip (source === 'subdl') */
  sdUrl?: string;
  /** Release/file name — used for deduplication */
  releaseName: string;
  featureTitle: string;
  language: string;
  downloadCount: number;
  uploadDate: string;
  year?: number;
}

// Background → Popup responses
export type SearchResponse =
  | { ok: true; results: SubtitleResult[] }
  | { ok: false; error: string };

export type SelectResponse =
  | { ok: true; cueCount: number }
  | { ok: false; error: string };

export type StatusResponse = {
  loaded: boolean;
  cueCount: number;
  offsetMs: number;
};
