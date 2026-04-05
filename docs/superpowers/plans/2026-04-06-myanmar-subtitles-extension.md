# Myanmar Subtitles Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that overlays Burmese subtitles (from OpenSubtitles or local .srt files) on any HTML5 video playing in the browser.

**Architecture:** WXT (Manifest V3) extension with React popup, Shadow DOM content script overlay, and a background service worker handling API calls and caching. The popup lets users search OpenSubtitles or upload local .srt files. The content script detects `<video>` elements, renders a subtitle overlay inside a Shadow DOM, and syncs cues to `video.currentTime`. Communication flows via `browser.runtime.sendMessage` (popup↔background) and `browser.tabs.sendMessage` (background→content).

**Tech Stack:** WXT, TypeScript, React, Tailwind CSS, Shadow DOM, Padauk font, Vitest

---

## File Structure

```
myanSub/
├── wxt.config.ts                        — WXT config: React module, permissions, web_accessible_resources
├── package.json                         — Dependencies and scripts
├── tailwind.config.ts                   — Tailwind config scoped to popup
├── postcss.config.cjs                   — PostCSS for Tailwind
├── tsconfig.json                        — TypeScript config
├── assets/
│   └── fonts/
│       ├── Padauk-Regular.ttf           — Padauk font (bundled)
│       └── Padauk-Bold.ttf              — Padauk bold variant
├── public/
│   ├── icon-16.png                      — Extension icon 16px
│   ├── icon-48.png                      — Extension icon 48px
│   └── icon-128.png                     — Extension icon 128px
├── entrypoints/
│   ├── background.ts                    — Service worker: API relay, caching, message hub
│   ├── popup/
│   │   ├── main.tsx                     — React entry point
│   │   ├── App.tsx                      — Root component: search, results, upload, controls
│   │   ├── index.html                   — Popup HTML shell
│   │   └── style.css                    — Tailwind entry (imports)
│   └── content.ts                       — Content script: video detection, Shadow DOM overlay, sync
├── lib/
│   ├── srt-parser.ts                    — Parse SRT text → array of {start, end, text} cues
│   ├── api-client.ts                    — OpenSubtitles REST API wrapper (search + download)
│   ├── overlay.ts                       — Shadow DOM subtitle renderer + fullscreen handler
│   ├── sync-engine.ts                   — Cue lookup by time, offset adjustment
│   ├── cache.ts                         — chrome.storage.local read/write/evict
│   ├── messages.ts                      — Typed message definitions (popup↔bg↔content)
│   └── config.ts                        — API key, base URL constants
├── tests/
│   ├── srt-parser.test.ts              — Unit tests for SRT parser
│   ├── sync-engine.test.ts             — Unit tests for sync engine
│   ├── api-client.test.ts              — Unit tests for API client
│   └── cache.test.ts                   — Unit tests for cache layer
└── vitest.config.ts                     — Vitest config
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ POPUP (React)                                                   │
│  User types title → sendMessage({type:'SEARCH', query})         │
│  User uploads .srt → sendMessage({type:'LOAD_LOCAL', srtText})  │
│  User picks result → sendMessage({type:'SELECT', fileId})       │
│  User adjusts sync → sendMessage({type:'OFFSET', delta})        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ browser.runtime.sendMessage
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACKGROUND (Service Worker)                                     │
│  SEARCH  → fetch OpenSubtitles /subtitles?query=X&languages=my │
│           → return results to popup                             │
│  SELECT  → check cache → if miss: fetch /download {file_id}    │
│           → download .srt from link → parse → cache             │
│           → sendMessage to content tab with cues                │
│  LOAD_LOCAL → parse SRT → sendMessage to content tab with cues  │
│  OFFSET  → relay to content tab                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ browser.tabs.sendMessage
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT (Shadow DOM)                                     │
│  Receives cues[] → stores in sync engine                        │
│  requestAnimationFrame loop:                                    │
│    read video.currentTime → find active cue → render in overlay │
│  Handles fullscreen: re-attach overlay to fullscreen element    │
│  Handles resize: ResizeObserver keeps overlay aligned           │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Risks & Mitigations

1. **Netflix DRM / shadow DOM**: Netflix uses its own player. Content script must search for `<video>` across shadow roots and iframes. Mitigation: use `document.querySelectorAll('video')` + MutationObserver to detect dynamically injected videos.
2. **Fullscreen overlay**: When video goes fullscreen, overlay must move inside the fullscreen element or it won't be visible. Mitigation: listen to `fullscreenchange` event and re-parent the overlay.
3. **OpenSubtitles rate limits**: Free tier is limited (5 downloads/day for unauthenticated). Mitigation: cache aggressively in `chrome.storage.local`; support local .srt upload as primary fallback.
4. **Content Security Policy**: Some sites block inline styles/fonts. Mitigation: Shadow DOM isolates styles; font loaded via `@font-face` inside shadow root using `chrome.runtime.getURL`.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `wxt.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.cjs`

- [ ] **Step 1: Initialize WXT project**

```bash
cd /home/heinthant/myanSub
pnpm init
pnpm add -D wxt @wxt-dev/module-react react react-dom @types/react @types/react-dom
pnpm add -D typescript tailwindcss @tailwindcss/postcss postcss
pnpm add -D vitest
```

- [ ] **Step 2: Create `wxt.config.ts`**

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Myanmar Subtitles',
    description: 'Overlay Burmese subtitles on any video in your browser',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://api.opensubtitles.com/*'],
    web_accessible_resources: [
      {
        resources: ['assets/fonts/*'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
```

- [ ] **Step 3: Create `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./entrypoints/popup/**/*.{tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        myanmar: ['Padauk', 'Noto Sans Myanmar', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Create `postcss.config.cjs`**

```js
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 5: Download Padauk font files**

```bash
mkdir -p /home/heinthant/myanSub/assets/fonts
curl -L -o /home/heinthant/myanSub/assets/fonts/Padauk-Regular.ttf \
  "https://github.com/nicknicknicknick/Padauk/raw/main/Padauk-Regular.ttf" 2>/dev/null || \
curl -L -o /home/heinthant/myanSub/assets/fonts/Padauk-Regular.ttf \
  "https://fonts.google.com/download?family=Padauk" 2>/dev/null
```

If automated download fails, manually download from https://fonts.google.com/specimen/Padauk and place `Padauk-Regular.ttf` and `Padauk-Bold.ttf` in `assets/fonts/`.

- [ ] **Step 6: Create placeholder icons**

```bash
mkdir -p /home/heinthant/myanSub/public
# Generate simple colored squares as placeholder icons
node -e "
const { createCanvas } = require('canvas');
// If canvas not available, create minimal PNGs manually
" 2>/dev/null || echo "Add icon-16.png, icon-48.png, icon-128.png to public/ manually"
```

Create simple PNG icons (can be placeholder squares for now) at `public/icon-16.png`, `public/icon-48.png`, `public/icon-128.png`.

- [ ] **Step 7: Verify project builds**

```bash
cd /home/heinthant/myanSub
pnpm wxt build
```

Expected: Build completes (may warn about missing entrypoints — that's fine at this stage).

- [ ] **Step 8: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold WXT project with React, Tailwind, Padauk font"
```

---

## Task 2: Typed Message Definitions

**Files:**
- Create: `lib/messages.ts`

- [ ] **Step 1: Write message types**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/messages.ts
git commit -m "feat: add typed message definitions for popup/background/content communication"
```

---

## Task 3: SRT Parser (TDD)

**Files:**
- Create: `lib/srt-parser.ts`, `tests/srt-parser.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Create Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
});
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/srt-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseSrt } from '../lib/srt-parser';

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,500 --> 00:00:08,250
မင်္ဂလာပါ
ကျေးဇူးတင်ပါတယ်

3
00:01:00,000 --> 00:01:03,500
Goodbye!
`;

describe('parseSrt', () => {
  it('parses correct number of cues', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues).toHaveLength(3);
  });

  it('parses timestamps to milliseconds', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[0].startMs).toBe(1000);
    expect(cues[0].endMs).toBe(4000);
    expect(cues[1].startMs).toBe(5500);
    expect(cues[1].endMs).toBe(8250);
    expect(cues[2].startMs).toBe(60000);
    expect(cues[2].endMs).toBe(63500);
  });

  it('preserves multiline text', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[1].text).toBe('မင်္ဂလာပါ\nကျေးဇူးတင်ပါတယ်');
  });

  it('assigns sequential indices', () => {
    const cues = parseSrt(SAMPLE_SRT);
    expect(cues[0].index).toBe(1);
    expect(cues[1].index).toBe(2);
    expect(cues[2].index).toBe(3);
  });

  it('handles empty input', () => {
    expect(parseSrt('')).toEqual([]);
  });

  it('handles Windows line endings (CRLF)', () => {
    const crlf = "1\r\n00:00:01,000 --> 00:00:02,000\r\nTest\r\n\r\n";
    const cues = parseSrt(crlf);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Test');
  });

  it('strips HTML tags from subtitle text', () => {
    const html = "1\n00:00:01,000 --> 00:00:02,000\n<i>Italic</i> and <b>bold</b>\n\n";
    const cues = parseSrt(html);
    expect(cues[0].text).toBe('Italic and bold');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run tests/srt-parser.test.ts
```

Expected: FAIL — `parseSrt` not found.

- [ ] **Step 4: Implement SRT parser**

```ts
// lib/srt-parser.ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run tests/srt-parser.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/srt-parser.ts tests/srt-parser.test.ts vitest.config.ts
git commit -m "feat: implement SRT parser with full test coverage"
```

---

## Task 4: Sync Engine (TDD)

**Files:**
- Create: `lib/sync-engine.ts`, `tests/sync-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/sync-engine.test.ts
import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../lib/sync-engine';
import type { SubtitleCue } from '../lib/messages';

const CUES: SubtitleCue[] = [
  { index: 1, startMs: 1000, endMs: 4000, text: 'First' },
  { index: 2, startMs: 5000, endMs: 8000, text: 'Second' },
  { index: 3, startMs: 10000, endMs: 13000, text: 'Third' },
];

describe('SyncEngine', () => {
  it('returns null when no cues loaded', () => {
    const engine = new SyncEngine();
    expect(engine.getCueAt(1500)).toBeNull();
  });

  it('finds the correct cue for a given time', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(2000)?.text).toBe('First');
    expect(engine.getCueAt(6000)?.text).toBe('Second');
    expect(engine.getCueAt(11000)?.text).toBe('Third');
  });

  it('returns null between cues', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(4500)).toBeNull();
  });

  it('returns null before first cue', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    expect(engine.getCueAt(500)).toBeNull();
  });

  it('applies positive offset', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(1000); // shift subs 1s later
    // At time 2000, effective lookup is 2000 - 1000 = 1000, which is start of First
    expect(engine.getCueAt(2000)?.text).toBe('First');
    // At time 1500, effective lookup is 500, before First
    expect(engine.getCueAt(1500)).toBeNull();
  });

  it('applies negative offset', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(-500);
    // At time 500, effective lookup is 1000, start of First
    expect(engine.getCueAt(500)?.text).toBe('First');
  });

  it('accumulates offset adjustments', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(500);
    engine.adjustOffset(500);
    expect(engine.getOffset()).toBe(1000);
  });

  it('resets offset when new cues are loaded', () => {
    const engine = new SyncEngine();
    engine.loadCues(CUES);
    engine.adjustOffset(500);
    engine.loadCues(CUES);
    expect(engine.getOffset()).toBe(0);
  });

  it('uses binary search efficiently for large cue sets', () => {
    const engine = new SyncEngine();
    const manyCues: SubtitleCue[] = Array.from({ length: 10000 }, (_, i) => ({
      index: i + 1,
      startMs: i * 3000,
      endMs: i * 3000 + 2000,
      text: `Cue ${i + 1}`,
    }));
    engine.loadCues(manyCues);
    expect(engine.getCueAt(15001)?.text).toBe('Cue 6');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/sync-engine.test.ts
```

Expected: FAIL — `SyncEngine` not found.

- [ ] **Step 3: Implement sync engine**

```ts
// lib/sync-engine.ts
import type { SubtitleCue } from './messages';

export class SyncEngine {
  private cues: SubtitleCue[] = [];
  private offsetMs = 0;

  loadCues(cues: SubtitleCue[]): void {
    this.cues = [...cues].sort((a, b) => a.startMs - b.startMs);
    this.offsetMs = 0;
  }

  adjustOffset(deltaMs: number): void {
    this.offsetMs += deltaMs;
  }

  getOffset(): number {
    return this.offsetMs;
  }

  getCueAt(timeMs: number): SubtitleCue | null {
    if (this.cues.length === 0) return null;

    // Effective time = current time minus offset
    const effective = timeMs - this.offsetMs;

    // Binary search for the cue containing effective time
    let low = 0;
    let high = this.cues.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const cue = this.cues[mid];

      if (effective < cue.startMs) {
        high = mid - 1;
      } else if (effective >= cue.endMs) {
        low = mid + 1;
      } else {
        return cue;
      }
    }

    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/sync-engine.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync-engine.ts tests/sync-engine.test.ts
git commit -m "feat: implement sync engine with binary search and offset support"
```

---

## Task 5: Config & API Client

**Files:**
- Create: `lib/config.ts`, `lib/api-client.ts`, `tests/api-client.test.ts`

- [ ] **Step 1: Create config**

```ts
// lib/config.ts

// Get your free API key at https://www.opensubtitles.com/en/consumers
// Then replace the empty string below with your key
export const OPENSUBTITLES_API_KEY = '';

export const OPENSUBTITLES_BASE_URL = 'https://api.opensubtitles.com/api/v1';

export const BURMESE_LANGUAGE_CODE = 'my';
```

- [ ] **Step 2: Write failing tests**

```ts
// tests/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSubtitles, downloadSubtitle } from '../lib/api-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('searchSubtitles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends correct request to OpenSubtitles search endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await searchSubtitles('The Dark Knight');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/subtitles');
    expect(url).toContain('query=The+Dark+Knight');
    expect(url).toContain('languages=my');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('maps API response to SubtitleResult[]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            attributes: {
              files: [{ file_id: 123 }],
              language: 'my',
              download_count: 50,
              upload_date: '2024-01-15',
              feature_details: {
                title: 'The Dark Knight',
                year: 2008,
              },
            },
          },
        ],
      }),
    });

    const results = await searchSubtitles('The Dark Knight');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      fileId: 123,
      title: 'The Dark Knight',
      language: 'my',
      downloadCount: 50,
      uploadDate: '2024-01-15',
      featureTitle: 'The Dark Knight',
      year: 2008,
    });
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(searchSubtitles('test')).rejects.toThrow('401');
  });
});

describe('downloadSubtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends POST to download endpoint and fetches SRT content', async () => {
    // First call: POST /download → get link
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        link: 'https://dl.opensubtitles.org/file/123.srt',
        file_name: 'subtitle.srt',
      }),
    });
    // Second call: GET the SRT file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n',
    });

    const srt = await downloadSubtitle(456);

    // Verify POST /download
    const [url1, opts1] = mockFetch.mock.calls[0];
    expect(url1).toContain('/download');
    expect(opts1.method).toBe('POST');
    expect(JSON.parse(opts1.body)).toEqual({ file_id: 456 });

    // Verify SRT content fetched
    expect(srt).toContain('Hello');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run tests/api-client.test.ts
```

Expected: FAIL — `searchSubtitles` and `downloadSubtitle` not found.

- [ ] **Step 4: Implement API client**

```ts
// lib/api-client.ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm vitest run tests/api-client.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/config.ts lib/api-client.ts tests/api-client.test.ts
git commit -m "feat: implement OpenSubtitles API client with search and download"
```

---

## Task 6: Cache Layer (TDD)

**Files:**
- Create: `lib/cache.ts`, `tests/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/cache.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubtitleCache } from '../lib/cache';

// Mock chrome.storage.local
const store: Record<string, any> = {};
const mockStorage = {
  get: vi.fn((keys: string[]) => {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (key in store) result[key] = store[key];
    }
    return Promise.resolve(result);
  }),
  set: vi.fn((items: Record<string, any>) => {
    Object.assign(store, items);
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string[]) => {
    for (const key of keys) delete store[key];
    return Promise.resolve();
  }),
  getBytesInUse: vi.fn(() => Promise.resolve(0)),
};

vi.stubGlobal('chrome', { storage: { local: mockStorage } });

describe('SubtitleCache', () => {
  let cache: SubtitleCache;

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
    cache = new SubtitleCache();
  });

  it('returns null for cache miss', async () => {
    const result = await cache.get(999);
    expect(result).toBeNull();
  });

  it('stores and retrieves SRT text', async () => {
    await cache.set(123, 'srt content here');
    const result = await cache.get(123);
    expect(result).toBe('srt content here');
  });

  it('uses prefixed keys to avoid collisions', async () => {
    await cache.set(123, 'test');
    expect(mockStorage.set).toHaveBeenCalledWith({
      'srt_123': 'test',
    });
  });

  it('removes a cached entry', async () => {
    await cache.set(123, 'test');
    await cache.remove(123);
    const result = await cache.get(123);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run tests/cache.test.ts
```

Expected: FAIL — `SubtitleCache` not found.

- [ ] **Step 3: Implement cache**

```ts
// lib/cache.ts

const KEY_PREFIX = 'srt_';

export class SubtitleCache {
  private key(fileId: number): string {
    return `${KEY_PREFIX}${fileId}`;
  }

  async get(fileId: number): Promise<string | null> {
    const key = this.key(fileId);
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? null;
  }

  async set(fileId: number, srtText: string): Promise<void> {
    const key = this.key(fileId);
    await chrome.storage.local.set({ [key]: srtText });
  }

  async remove(fileId: number): Promise<void> {
    const key = this.key(fileId);
    await chrome.storage.local.remove([key]);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run tests/cache.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cache.ts tests/cache.test.ts
git commit -m "feat: implement SRT cache layer with chrome.storage.local"
```

---

## Task 7: Content Script — Shadow DOM Overlay

**Files:**
- Create: `lib/overlay.ts`, `entrypoints/content.ts`

- [ ] **Step 1: Create the overlay renderer**

```ts
// lib/overlay.ts

export class SubtitleOverlay {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private subtitleEl: HTMLDivElement;
  private resizeObserver: ResizeObserver;
  private video: HTMLVideoElement | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.id = 'myanmar-subtitles-host';

    this.shadow = this.host.attachShadow({ mode: 'open' });

    // Inject styles into shadow root
    const style = document.createElement('style');
    style.textContent = this.getStyles();
    this.shadow.appendChild(style);

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'subtitle-text';
    this.shadow.appendChild(this.subtitleEl);

    this.resizeObserver = new ResizeObserver(() => this.reposition());

    // Handle fullscreen changes
    document.addEventListener('fullscreenchange', () => this.handleFullscreen());
  }

  private getStyles(): string {
    // Use chrome.runtime.getURL for the font file
    const fontUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('assets/fonts/Padauk-Regular.ttf')
      : '';

    return `
      @font-face {
        font-family: 'Padauk';
        src: url('${fontUrl}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }

      :host {
        all: initial;
        position: absolute;
        bottom: 10%;
        left: 0;
        right: 0;
        z-index: 2147483647;
        pointer-events: none;
        display: flex;
        justify-content: center;
      }

      .subtitle-text {
        font-family: 'Padauk', 'Noto Sans Myanmar', 'Myanmar Text', sans-serif;
        font-size: 28px;
        line-height: 1.4;
        color: #ffffff;
        background: rgba(0, 0, 0, 0.75);
        padding: 4px 16px;
        border-radius: 4px;
        text-align: center;
        max-width: 80%;
        white-space: pre-line;
        text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
      }

      .subtitle-text:empty {
        display: none;
      }
    `;
  }

  attachTo(video: HTMLVideoElement): void {
    if (this.video === video) return;

    this.detach();
    this.video = video;

    // Ensure the video's parent is positioned
    const parent = video.parentElement;
    if (!parent) return;

    const parentPos = getComputedStyle(parent).position;
    if (parentPos === 'static') {
      parent.style.position = 'relative';
    }

    parent.appendChild(this.host);
    this.resizeObserver.observe(video);
    this.reposition();
  }

  detach(): void {
    if (this.video) {
      this.resizeObserver.unobserve(this.video);
      this.video = null;
    }
    this.host.remove();
  }

  setText(text: string): void {
    this.subtitleEl.textContent = text;
  }

  clear(): void {
    this.subtitleEl.textContent = '';
  }

  private reposition(): void {
    if (!this.video) return;
    const rect = this.video.getBoundingClientRect();
    const parentRect = this.video.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    this.host.style.position = 'absolute';
    this.host.style.left = `${rect.left - parentRect.left}px`;
    this.host.style.width = `${rect.width}px`;
    this.host.style.bottom = `${parentRect.bottom - rect.bottom + rect.height * 0.1}px`;
  }

  private handleFullscreen(): void {
    const fsElement = document.fullscreenElement;

    if (fsElement) {
      // Move overlay into the fullscreen element
      fsElement.appendChild(this.host);
    } else if (this.video?.parentElement) {
      // Return overlay to video parent
      this.video.parentElement.appendChild(this.host);
    }

    this.reposition();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    document.removeEventListener('fullscreenchange', () => this.handleFullscreen());
    this.detach();
  }
}
```

- [ ] **Step 2: Create the content script**

```ts
// entrypoints/content.ts
import { defineContentScript } from 'wxt/sandbox';
import { SyncEngine } from '@/lib/sync-engine';
import { SubtitleOverlay } from '@/lib/overlay';
import type { ContentMessage } from '@/lib/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    const syncEngine = new SyncEngine();
    const overlay = new SubtitleOverlay();
    let animFrameId: number | null = null;
    let activeVideo: HTMLVideoElement | null = null;

    // Find the largest playing video on the page
    function findVideo(): HTMLVideoElement | null {
      const videos = Array.from(document.querySelectorAll('video'));
      if (videos.length === 0) return null;

      // Prefer playing video, then largest
      const playing = videos.filter((v) => !v.paused);
      const candidates = playing.length > 0 ? playing : videos;

      return candidates.reduce((best, v) => {
        const area = v.videoWidth * v.videoHeight;
        const bestArea = best.videoWidth * best.videoHeight;
        return area > bestArea ? v : best;
      });
    }

    // Sync loop: runs every animation frame
    function startSyncLoop(): void {
      if (animFrameId !== null) return;

      function tick() {
        if (activeVideo) {
          const timeMs = activeVideo.currentTime * 1000;
          const cue = syncEngine.getCueAt(timeMs);
          if (cue) {
            overlay.setText(cue.text);
          } else {
            overlay.clear();
          }
        }
        animFrameId = requestAnimationFrame(tick);
      }

      animFrameId = requestAnimationFrame(tick);
    }

    function stopSyncLoop(): void {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    }

    // Watch for dynamically inserted videos
    const observer = new MutationObserver(() => {
      if (!activeVideo || !document.contains(activeVideo)) {
        const video = findVideo();
        if (video) {
          activeVideo = video;
          overlay.attachTo(video);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Try to find a video immediately
    const video = findVideo();
    if (video) {
      activeVideo = video;
      overlay.attachTo(video);
    }

    // Listen for messages from background
    browser.runtime.onMessage.addListener((message: ContentMessage) => {
      switch (message.type) {
        case 'LOAD_CUES': {
          const video = findVideo();
          if (video) {
            activeVideo = video;
            overlay.attachTo(video);
          }
          syncEngine.loadCues(message.cues);
          startSyncLoop();
          break;
        }
        case 'ADJUST_OFFSET': {
          syncEngine.adjustOffset(message.deltaMs);
          break;
        }
        case 'CLEAR': {
          stopSyncLoop();
          syncEngine.loadCues([]);
          overlay.clear();
          break;
        }
      }
    });
  },
});
```

- [ ] **Step 3: Verify build compiles**

```bash
pnpm wxt build
```

Expected: Build succeeds with content script bundled.

- [ ] **Step 4: Commit**

```bash
git add lib/overlay.ts entrypoints/content.ts
git commit -m "feat: implement content script with Shadow DOM overlay and sync loop"
```

---

## Task 8: Background Service Worker

**Files:**
- Create: `entrypoints/background.ts`

- [ ] **Step 1: Implement the background script**

```ts
// entrypoints/background.ts
import { defineBackground } from 'wxt/sandbox';
import { searchSubtitles, downloadSubtitle } from '@/lib/api-client';
import { parseSrt } from '@/lib/srt-parser';
import { SubtitleCache } from '@/lib/cache';
import type {
  PopupMessage,
  ContentMessage,
  SearchResponse,
  SelectResponse,
  StatusResponse,
  SubtitleCue,
} from '@/lib/messages';

export default defineBackground(() => {
  const cache = new SubtitleCache();

  // Track state per tab
  const tabState = new Map<number, { cueCount: number; offsetMs: number }>();

  async function sendToContent(tabId: number, message: ContentMessage): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // Content script might not be ready yet
      console.warn('Failed to send message to content script in tab', tabId);
    }
  }

  browser.runtime.onMessage.addListener(
    (message: PopupMessage, sender, sendResponse) => {
      // Get the active tab
      const handleMessage = async (): Promise<any> => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const tabId = tab?.id;
        if (!tabId) return { ok: false, error: 'No active tab' };

        switch (message.type) {
          case 'SEARCH': {
            try {
              const results = await searchSubtitles(message.query);
              return { ok: true, results } satisfies SearchResponse;
            } catch (err) {
              return { ok: false, error: String(err) } satisfies SearchResponse;
            }
          }

          case 'SELECT': {
            try {
              // Check cache first
              let srtText = await cache.get(message.fileId);

              if (!srtText) {
                srtText = await downloadSubtitle(message.fileId);
                await cache.set(message.fileId, srtText);
              }

              const cues = parseSrt(srtText);
              tabState.set(tabId, { cueCount: cues.length, offsetMs: 0 });

              await sendToContent(tabId, { type: 'LOAD_CUES', cues });
              return { ok: true, cueCount: cues.length } satisfies SelectResponse;
            } catch (err) {
              return { ok: false, error: String(err) } satisfies SelectResponse;
            }
          }

          case 'LOAD_LOCAL': {
            try {
              const cues = parseSrt(message.srtText);
              tabState.set(tabId, { cueCount: cues.length, offsetMs: 0 });

              await sendToContent(tabId, { type: 'LOAD_CUES', cues });
              return { ok: true, cueCount: cues.length } satisfies SelectResponse;
            } catch (err) {
              return { ok: false, error: String(err) } satisfies SelectResponse;
            }
          }

          case 'OFFSET': {
            const state = tabState.get(tabId);
            if (state) {
              state.offsetMs += message.deltaMs;
            }
            await sendToContent(tabId, {
              type: 'ADJUST_OFFSET',
              deltaMs: message.deltaMs,
            });
            return { ok: true };
          }

          case 'GET_STATUS': {
            const state = tabState.get(tabId);
            return {
              loaded: !!state && state.cueCount > 0,
              cueCount: state?.cueCount ?? 0,
              offsetMs: state?.offsetMs ?? 0,
            } satisfies StatusResponse;
          }
        }
      };

      // Return true to indicate async response
      handleMessage().then(sendResponse);
      return true;
    }
  );
});
```

- [ ] **Step 2: Verify build compiles**

```bash
pnpm wxt build
```

Expected: Build succeeds with background script bundled.

- [ ] **Step 3: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat: implement background service worker with API relay and caching"
```

---

## Task 9: Popup UI

**Files:**
- Create: `entrypoints/popup/index.html`, `entrypoints/popup/style.css`, `entrypoints/popup/main.tsx`, `entrypoints/popup/App.tsx`

- [ ] **Step 1: Create popup HTML shell**

```html
<!-- entrypoints/popup/index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Myanmar Subtitles</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create Tailwind entry CSS**

```css
/* entrypoints/popup/style.css */
@import "tailwindcss";
```

- [ ] **Step 3: Create React entry point**

```tsx
// entrypoints/popup/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = document.getElementById('root')!;
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Create App component**

```tsx
// entrypoints/popup/App.tsx
import { useState, useCallback, useEffect } from 'react';
import type {
  PopupMessage,
  SearchResponse,
  SelectResponse,
  StatusResponse,
  SubtitleResult,
} from '@/lib/messages';

function sendMessage<T>(message: PopupMessage): Promise<T> {
  return browser.runtime.sendMessage(message);
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubtitleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusResponse>({
    loaded: false,
    cueCount: 0,
    offsetMs: 0,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Fetch status on mount
  useEffect(() => {
    sendMessage<StatusResponse>({ type: 'GET_STATUS' }).then(setStatus);
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);

    const resp = await sendMessage<SearchResponse>({ type: 'SEARCH', query });
    setLoading(false);

    if (resp.ok) {
      setResults(resp.results);
      if (resp.results.length === 0) {
        setError('No Burmese subtitles found for this title.');
      }
    } else {
      setError(resp.error);
    }
  }, [query]);

  const handleSelect = useCallback(async (fileId: number) => {
    setLoading(true);
    setError('');
    setSelectedId(fileId);

    const resp = await sendMessage<SelectResponse>({ type: 'SELECT', fileId });
    setLoading(false);

    if (resp.ok) {
      setStatus((s) => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
    } else {
      setError(resp.error);
      setSelectedId(null);
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    const srtText = await file.text();
    const resp = await sendMessage<SelectResponse>({ type: 'LOAD_LOCAL', srtText });
    setLoading(false);

    if (resp.ok) {
      setStatus((s) => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
    } else {
      setError(resp.error);
    }
  }, []);

  const handleOffset = useCallback(async (deltaMs: number) => {
    await sendMessage({ type: 'OFFSET', deltaMs });
    setStatus((s) => ({ ...s, offsetMs: s.offsetMs + deltaMs }));
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch]
  );

  return (
    <div className="w-[360px] min-h-[400px] bg-gray-900 text-gray-100 p-4 font-sans">
      {/* Header */}
      <h1 className="text-lg font-bold text-amber-400 mb-3 font-myanmar">
        Myanmar Subtitles
      </h1>

      {/* Search */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search movie title..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm
                     placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700
                     text-white px-4 py-2 rounded text-sm font-medium"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* Upload local SRT */}
      <label className="block mb-3 cursor-pointer">
        <span className="text-xs text-gray-400">Or upload a local .srt file:</span>
        <input
          type="file"
          accept=".srt"
          onChange={handleFileUpload}
          className="block mt-1 text-xs text-gray-400 file:mr-2 file:py-1 file:px-3
                     file:rounded file:border-0 file:bg-gray-700 file:text-gray-300
                     file:cursor-pointer hover:file:bg-gray-600"
        />
      </label>

      {/* Error */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-2 mb-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="mb-3 max-h-[200px] overflow-y-auto">
          <h2 className="text-xs text-gray-400 mb-1">Results:</h2>
          {results.map((r) => (
            <button
              key={r.fileId}
              onClick={() => handleSelect(r.fileId)}
              disabled={loading}
              className={`w-full text-left p-2 rounded mb-1 text-sm transition
                ${selectedId === r.fileId
                  ? 'bg-amber-900/50 border border-amber-600'
                  : 'bg-gray-800 hover:bg-gray-750 border border-gray-700'
                }`}
            >
              <div className="font-medium">
                {r.featureTitle} {r.year ? `(${r.year})` : ''}
              </div>
              <div className="text-xs text-gray-400">
                Downloads: {r.downloadCount}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Status & Controls */}
      {status.loaded && (
        <div className="border-t border-gray-700 pt-3">
          <div className="text-xs text-green-400 mb-2">
            Subtitles loaded — {status.cueCount} cues
          </div>

          {/* Sync offset controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Sync:</span>
            <button
              onClick={() => handleOffset(-500)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs"
            >
              -0.5s
            </button>
            <span className="text-xs text-gray-300 min-w-[60px] text-center">
              {status.offsetMs >= 0 ? '+' : ''}
              {(status.offsetMs / 1000).toFixed(1)}s
            </span>
            <button
              onClick={() => handleOffset(500)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs"
            >
              +0.5s
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-800 text-[10px] text-gray-600 text-center">
        Powered by OpenSubtitles API
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify build compiles**

```bash
pnpm wxt build
```

Expected: Build succeeds with popup bundled.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat: implement popup UI with search, file upload, and sync controls"
```

---

## Task 10: Generate Extension Icons

**Files:**
- Create: `public/icon-16.png`, `public/icon-48.png`, `public/icon-128.png`

- [ ] **Step 1: Generate icons using Node.js canvas (or use placeholder SVGs)**

Create a simple script that generates the icons, or create minimal placeholder PNGs. The icon should be a golden "မ" (Myanmar letter) on a dark background.

```bash
# If canvas is not available, create 1x1 pixel PNG placeholders
# and replace with proper icons later
node -e "
const fs = require('fs');
// Minimal 16x16 PNG (dark square placeholder)
const png16 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADklEQVQ4jWNgGAWDEwAAAhAAATHKiwkAAAAASUVORK5CYII=', 'base64');
const png48 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAADklEQVRoge3BAQ0AAADCIPunfg43YAAAAJ8BH7wAAQFvf4sAAAAASUVORK5CYII=', 'base64');
const png128 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAADklEQVR42u3BAQ0AAADCIPunfg43YAAAAE8BHlgAAQHiPdkAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('public/icon-16.png', png16);
fs.writeFileSync('public/icon-48.png', png48);
fs.writeFileSync('public/icon-128.png', png128);
console.log('Placeholder icons created');
"
```

- [ ] **Step 2: Commit**

```bash
git add public/
git commit -m "chore: add placeholder extension icons"
```

---

## Task 11: Integration Testing — Full Build & Load

- [ ] **Step 1: Run full build**

```bash
pnpm wxt build
```

Expected: Clean build with no errors. Output in `.output/chrome-mv3/`.

- [ ] **Step 2: Run all unit tests**

```bash
pnpm vitest run
```

Expected: All tests pass (srt-parser, sync-engine, api-client, cache).

- [ ] **Step 3: Manual test — load extension in Chrome**

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `.output/chrome-mv3/`
4. Verify extension loads without errors
5. Click the extension icon → popup opens with search UI
6. Open a YouTube video → verify no console errors from content script

- [ ] **Step 4: Manual test — upload local SRT**

1. Create a test SRT file with Burmese text
2. Open a YouTube video
3. Open extension popup → upload the SRT
4. Verify Burmese subtitles appear overlaid on the video in Padauk font

- [ ] **Step 5: Manual test — search OpenSubtitles**

1. Add your API key to `lib/config.ts`
2. Rebuild: `pnpm wxt build`
3. Open extension popup → search for a movie
4. Select a result → verify subtitles load and display

- [ ] **Step 6: Commit final state**

```bash
git add -A
git commit -m "chore: integration testing complete, all components verified"
```
