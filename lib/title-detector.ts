// lib/title-detector.ts
// Universal title detection — works on any streaming site, including unofficial ones.
//
// Detection priority:
//  1. Site-specific DOM selectors (most precise for known platforms)
//  2. OpenGraph og:title meta tag (almost every site has this, usually clean)
//  3. Schema.org JSON-LD structured data (very clean when present)
//  4. Generic video-adjacent heading (h1/h2 near <video>)
//  5. document.title with comprehensive noise stripping (universal fallback)

// ── Noise stripping ───────────────────────────────────────────────────────────

const SITE_SUFFIXES = [
  // Official streaming suffixes (both dash and pipe variants)
  /\s*[-|]\s*Netflix$/i,
  /\s*[-|]\s*Disney\+$/i,
  /\s*[-|]\s*Disney Plus$/i,
  /\s*[-|]\s*Max$/i,
  /\s*[-|]\s*Hulu$/i,
  /\s*[-|]\s*Peacock$/i,
  /\s*[-|]\s*Amazon Prime Video$/i,
  /\s*[-|]\s*Prime Video$/i,
  /\s*[-|]\s*Amazon$/i,
  /\s*[-|]\s*Apple TV\+$/i,
  /\s*[-|]\s*Apple TV Plus$/i,
  /\s*[-|]\s*Paramount\+$/i,
  /\s*[-|]\s*Crunchyroll$/i,
  /\s*[-|]\s*Tubi$/i,
  /\s*[-|]\s*Pluto TV$/i,
  // Pirate site / generic noise
  /\s+\|\s+.{1,40}$/,          // strip "| SiteName" (≤40 chars — avoids over-stripping)
  /\s*[-|]\s*.{1,25}$/,        // strip "- ShortSiteName" as last resort
];

const PIRATE_NOISE = [
  /^Watch\s+/i,                         // "Watch Movie Name"
  /\s+\(\d{4}\)\s*$/,                   // "(2023)" year at end
  /\s+\d{4}\s*$/,                       // bare year at end "Movie 2023"
  /\s+(Full\s+)?Movie(\s+Online)?$/i,   // "Full Movie Online"
  /\s+Online\s*(Free)?$/i,              // "Online Free"
  /\s+Free(\s+Download)?$/i,            // "Free Download"
  /\s+(HD|HQ|CAM|HDCAM|HDRip|BluRay|WEBRip|WEB-DL)$/i, // quality tags
  /\s+\d{3,4}p$/i,                      // "1080p" "720p" "4K"
  /\s+(Season\s+\d+)?(\s+Episode\s+\d+)?$/i, // "Season 1 Episode 3" at end
  /\s+Subtitles?$/i,                    // "Movie Subtitles"
  /\s+Download$/i,
  /\s+Stream(ing)?$/i,
];

/**
 * Strip all streaming/pirate noise from a raw title string.
 * Applied iteratively until no pattern matches.
 */
function cleanTitle(raw: string): string {
  let title = raw.trim();

  // Strip "Watch " prefix first (very common on pirate sites)
  title = title.replace(/^Watch\s+/i, '').trim();

  // Strip official site suffixes (apply the first matching one)
  for (const pattern of SITE_SUFFIXES) {
    const cleaned = title.replace(pattern, '').trim();
    if (cleaned !== title) {
      title = cleaned;
      break;
    }
  }

  // Strip pirate noise patterns iteratively — removing one layer can expose another
  // (e.g. "Online Free HD" → strip "HD" → strip "Online Free" → strip "(2024)")
  let prev: string;
  do {
    prev = title;
    for (const pattern of PIRATE_NOISE) {
      title = title.replace(pattern, '').trim();
    }
  } while (title !== prev);

  return title;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Query the first matching element from a list of selectors, return trimmed text. */
function queryText(...selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      // Invalid selector — skip silently
    }
  }
  return '';
}

/** Read the OpenGraph og:title meta tag — present on almost every website. */
function getOgTitle(): string {
  try {
    const el = document.querySelector('meta[property="og:title"]');
    return (el as HTMLMetaElement | null)?.content?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * Extract title from Schema.org JSON-LD blocks.
 * Looks for @type Movie, TVSeries, TVEpisode, or VideoObject.
 */
function getJsonLdTitle(): string {
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let i = 0; i < scripts.length; i++) {
      const text = scripts[i].textContent;
      if (!text) continue;
      const data = JSON.parse(text);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const type: string = node?.['@type'] ?? '';
        if (/Movie|TVSeries|TVEpisode|VideoObject/i.test(type)) {
          const name: string = node?.name ?? node?.headline ?? '';
          if (name) return name.trim();
        }
      }
    }
  } catch {
    // JSON parse error or DOM access — ignore
  }
  return '';
}

/**
 * Find a heading element (h1/h2) that sits close to a <video> element.
 * Works as a generic fallback for sites with standard player layouts.
 */
function getVideoAdjacentHeading(): string {
  try {
    const video = document.querySelector('video');
    if (!video) return '';

    // Walk up at most 5 levels and look for a heading sibling or descendant
    let node: Element | null = video.parentElement;
    for (let depth = 0; depth < 5 && node; depth++) {
      const heading = node.querySelector('h1, h2');
      if (heading) {
        const text = heading.textContent?.trim();
        if (text && text.length > 1 && text.length < 200) return text;
      }
      node = node.parentElement;
    }
  } catch {
    // DOM traversal error — ignore
  }
  return '';
}

// ── Site-specific selectors ───────────────────────────────────────────────────

const SITE_SELECTORS: Array<{ host: string; selectors: string[] }> = [
  {
    host: 'netflix.com',
    selectors: [
      '[data-uia="video-title"]',
      '[data-uia="player-title"]',
      '.title-card-title-text',
      '.VideoTitle',
      '[class*="videoTitle"]',
      '[class*="PlayerTitle"]',
    ],
  },
  {
    host: 'disneyplus.com',
    selectors: [
      '[data-testid="content-title"]',
      '[data-testid="player-title"]',
      '[class*="DetailTitle"]',
      '[class*="PlayerTitle"]',
      '[class*="ContentTitle"]',
      '.content-title',
    ],
  },
  {
    host: 'amazon.com',
    selectors: [
      '.atvwebplayersdk-title-text',
      '[data-automation-id="title"]',
      '[data-testid="title"]',
      '.dv-node-dp-title',
    ],
  },
  {
    host: 'primevideo.com',
    selectors: [
      '.atvwebplayersdk-title-text',
      '[data-automation-id="title"]',
      '[data-testid="title"]',
    ],
  },
  {
    host: 'tv.apple.com',
    selectors: [
      '[data-testid="videoTitle"]',
      '.video-title',
      '[class*="VideoTitle"]',
    ],
  },
  {
    host: 'hbo.com',
    selectors: [
      '[data-testid="video-player-title"]',
      '[class*="TitleName"]',
      '[class*="VideoTitle"]',
    ],
  },
  {
    host: 'max.com',
    selectors: [
      '[data-testid="video-player-title"]',
      '[class*="TitleName"]',
      '[class*="VideoTitle"]',
    ],
  },
  {
    host: 'paramountplus.com',
    selectors: ['[data-testid="video-title"]', '[class*="VideoTitle"]'],
  },
  {
    host: 'crunchyroll.com',
    selectors: ['[data-testid="series-title"]', '[class*="SeriesTitle"]'],
  },
];

function getSiteSpecificTitle(hostname: string): string {
  const match = SITE_SELECTORS.find(s => hostname.includes(s.host));
  if (!match) return '';
  return queryText(...match.selectors);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Detect the movie/show title from the current page.
 * Works on official streaming sites, pirate sites, and any other video page.
 * Returns an empty string if no reliable title is found.
 */
export function detectTitle(): string {
  const hostname = document.location?.hostname ?? '';

  // 1. Site-specific selectors (most precise)
  const siteTitle = getSiteSpecificTitle(hostname);
  if (siteTitle) return siteTitle;

  // 2. OpenGraph og:title (almost every site has this, usually the cleanest signal)
  const ogTitle = getOgTitle();
  if (ogTitle) {
    const cleaned = cleanTitle(ogTitle);
    if (cleaned.length >= 2) return cleaned;
  }

  // 3. Schema.org JSON-LD structured data (very clean when present)
  const jsonldTitle = getJsonLdTitle();
  if (jsonldTitle) {
    const cleaned = cleanTitle(jsonldTitle);
    if (cleaned.length >= 2) return cleaned;
  }

  // 4. Generic heading near the video element
  const headingTitle = getVideoAdjacentHeading();
  if (headingTitle) {
    const cleaned = cleanTitle(headingTitle);
    if (cleaned.length >= 2) return cleaned;
  }

  // 5. document.title with full noise stripping (universal fallback)
  const docTitle = cleanTitle(document.title);
  if (!docTitle || docTitle === hostname || docTitle.length < 2) return '';
  return docTitle;
}
