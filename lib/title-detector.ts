// lib/title-detector.ts
// Pure module — detects the current movie/show title from major streaming sites.

/**
 * Strip common streaming suffixes/prefixes from a raw title string.
 * Returns a trimmed string, or empty string if nothing remains.
 */
function stripStreamingSuffixes(raw: string): string {
  const suffixes = [
    /\s*-\s*Netflix$/i,
    /\s*\|\s*Disney\+$/i,
    /\s*\|\s*Max$/i,
    /\s*\|\s*Hulu$/i,
    /\s*\|\s*Peacock$/i,
    /\s*-\s*Amazon$/i,
    /\s*-\s*Apple TV\+$/i,
  ];

  let title = raw.trim();

  // Strip "Watch " prefix (Amazon Prime)
  title = title.replace(/^Watch\s+/i, '');

  for (const pattern of suffixes) {
    title = title.replace(pattern, '').trim();
  }

  return title;
}

/**
 * Detect the movie/show title from the current streaming page.
 * Returns an empty string if nothing useful is found.
 */
export function detectTitle(): string {
  const hostname = document.location?.hostname ?? '';

  // Attempt site-specific selectors first, then fall back to document.title
  let title = '';

  if (hostname.includes('netflix.com')) {
    const el = document.querySelector(
      '.title-card-title-text, .VideoTitle, [data-uia="video-title"]'
    );
    title = el?.textContent?.trim() ?? '';
    if (!title) {
      title = stripStreamingSuffixes(document.title);
    }
  } else if (hostname.includes('disneyplus.com')) {
    const el = document.querySelector('[data-testid="content-title"], .content-title, [class*="DetailTitle"], [class*="PlayerTitle"]');
    title = el?.textContent?.trim() ?? '';
    if (!title) {
      title = stripStreamingSuffixes(document.title);
    }
  } else if (hostname.includes('amazon.com') || hostname.includes('primevideo.com')) {
    const el = document.querySelector(
      '.atvwebplayersdk-title-text, [data-automation-id="title"]'
    );
    title = el?.textContent?.trim() ?? '';
    if (!title) {
      title = stripStreamingSuffixes(document.title);
    }
  } else if (hostname.includes('tv.apple.com')) {
    const el = document.querySelector('.video-title, [data-testid="videoTitle"]');
    title = el?.textContent?.trim() ?? '';
    if (!title) {
      title = stripStreamingSuffixes(document.title);
    }
  } else if (hostname.includes('hbo.com') || hostname.includes('max.com')) {
    const el = document.querySelector('[data-testid="video-player-title"]');
    title = el?.textContent?.trim() ?? '';
    if (!title) {
      title = stripStreamingSuffixes(document.title);
    }
  } else {
    // Generic fallback
    title = stripStreamingSuffixes(document.title);
  }

  // Return empty string if result is empty or equals the hostname (not useful)
  if (!title || title === hostname) return '';
  return title;
}
