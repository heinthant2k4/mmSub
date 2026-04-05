// lib/messages.ts

export interface SubtitleCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

// Popup → Background messages
export type PopupMessage =
  | { type: 'SEARCH'; query: string }
  | { type: 'SELECT'; fileId: number }
  | { type: 'LOAD_LOCAL'; srtText: string }
  | { type: 'OFFSET'; deltaMs: number }
  | { type: 'GET_STATUS' };

// Background → Content messages
export type ContentMessage =
  | { type: 'LOAD_CUES'; cues: SubtitleCue[] }
  | { type: 'ADJUST_OFFSET'; deltaMs: number }
  | { type: 'CLEAR' };

// Search result from OpenSubtitles
export interface SubtitleResult {
  fileId: number;
  title: string;
  language: string;
  downloadCount: number;
  uploadDate: string;
  featureTitle: string;
  year?: number;
}

// Background → Popup responses
export type SearchResponse = {
  ok: true;
  results: SubtitleResult[];
} | {
  ok: false;
  error: string;
};

export type SelectResponse = {
  ok: true;
  cueCount: number;
} | {
  ok: false;
  error: string;
};

export type StatusResponse = {
  loaded: boolean;
  cueCount: number;
  offsetMs: number;
};
