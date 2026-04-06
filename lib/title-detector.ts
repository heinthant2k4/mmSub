// lib/title-detector.ts
// Pure module — detects the current movie/show title from major streaming sites.

/**
 * Strip common streaming suffixes/prefixes from a raw title string.
 * Returns a trimmed string, or empty string if nothing remains.
 */
function stripStreamingSuffixes(raw: string): string {
  const patterns = [
    // Netflix uses both "- Netflix" and "| Netflix" depending on context
    /\s*[-|]\s*Netflix$/i,
    /\s*\|\s*Disney\+$/i,
    /\s*\|\s*Disney Plus$/i,
    /\s*[-|]\s*Max$/i,
    /\s*\|\s*Hulu$/i,
    /\s*\|\s*Peacock$/i,
    /\s*[-|]\s*Amazon Prime Video$/i,
    /\s*[-|]\s*Prime Video$/i,
    /\s*[-|]\s*Amazon$/i,
    /\s*[-|]\s*Apple TV\+$/i,
    /\s*[-|]\s*Apple TV Plus$/i,
    /\s*[-|]\s*Paramount\+$/i,
    /\s*[-|]\s*Crunchyroll$/i,
  ];

  let title = raw.trim();

  // Strip "Watch " prefix (Amazon Prime)
  title = title.replace(/^Watch\s+/i, '');

  for (const pattern of patterns) {
    title = title.replace(pattern, '').trim();
  }

  return title;
}

/**
 * Query the first matching element from a list of selectors.
 * Returns trimmed text content or empty string.
 */
function queryText(...selectors: string[]): string {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      const text = el?.textContent?.trim();
      if (text) return text;
    } catch {
      // Invalid selector — skip
    }
  }
  return '';
}

/**
 * Detect the movie/show title from the current streaming page.
 * Returns an empty string if nothing useful is found.
 */
export function detectTitle(): string {
  const hostname = document.location?.hostname ?? '';

  let title = '';

  if (hostname.includes('netflix.com')) {
    // Netflix data-uia attributes are the most stable Netflix identifiers.
    // Multiple fallbacks because Netflix A/B tests their DOM frequently.
    title = queryText(
      '[data-uia="video-title"]',
      '[data-uia="player-title"]',
      '.watch-video--player-view [data-uia="video-title"]',
      '.title-card-title-text',
      '.VideoTitle',
      '[class*="videoTitle"]',
      '[class*="PlayerTitle"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('disneyplus.com')) {
    title = queryText(
      '[data-testid="content-title"]',
      '[data-testid="player-title"]',
      '[class*="DetailTitle"]',
      '[class*="PlayerTitle"]',
      '[class*="ContentTitle"]',
      '.content-title',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('amazon.com') || hostname.includes('primevideo.com')) {
    title = queryText(
      '.atvwebplayersdk-title-text',
      '[data-automation-id="title"]',
      '[data-testid="title"]',
      '.dv-node-dp-title',
      'h1[data-automation-id="detail-page-title"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('tv.apple.com')) {
    title = queryText(
      '[data-testid="videoTitle"]',
      '.video-title',
      '[class*="VideoTitle"]',
      'h1[class*="title"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('hbo.com') || hostname.includes('max.com')) {
    title = queryText(
      '[data-testid="video-player-title"]',
      '[class*="TitleName"]',
      '[class*="VideoTitle"]',
      '[data-testid="title"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('paramountplus.com')) {
    title = queryText(
      '[data-testid="video-title"]',
      '[class*="VideoTitle"]',
      '[class*="ContentTitle"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else if (hostname.includes('crunchyroll.com')) {
    title = queryText(
      '[data-testid="series-title"]',
      '[class*="SeriesTitle"]',
      'h1[class*="title"]',
    );
    if (!title) title = stripStreamingSuffixes(document.title);

  } else {
    title = stripStreamingSuffixes(document.title);
  }

  // Reject empty strings or values that are just the hostname
  if (!title || title === hostname) return '';

  // Reject if it's still obviously a browser tab default (too short or too generic)
  if (title.length < 2) return '';

  return title;
}
