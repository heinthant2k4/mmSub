# Privacy Policy

**Extension:** myanSub  
**Version:** 1.0.0  
**Developer:** itkoko834  
**Last updated:** 7 April 2026

---

## Overview

myanSub is a browser extension that overlays Myanmar subtitles on streaming video. It is a fully client-side, open-source project. No data is ever sent to any server operated by the developer.

---

## Data We Collect

myanSub does **not** collect, transmit, or store any personal information on developer-operated servers. There are no user accounts, no login, and no analytics.

The extension reads the following from your browser **locally only**:

| Data | Purpose | Stored where |
|------|---------|-------------|
| Page hostname and page title | Auto-detect the movie or show name to pre-fill the search box | Never stored — read in memory only |
| DOM content near `<video>` elements | Detect title from streaming-site UI elements and `og:title` meta tags | Never stored — read in memory only |
| Subtitle files (`.srt`, `.ass`) | Display subtitles over video | `chrome.storage.local` on your device only |
| Display preferences (font size, position) | Remember your subtitle display settings | `chrome.storage.sync` on your device only |
| Recent subtitle list (up to 5 entries) | One-click reload of recently used subtitles | `chrome.storage.sync` on your device only |

---

## What We Do Not Do

- We do **not** track your browsing history.
- We do **not** read page content beyond what is needed to detect the video title.
- We do **not** send your data to any developer-operated server.
- We do **not** use cookies, fingerprinting, or any cross-site tracking.
- We do **not** include analytics, crash reporting, or telemetry of any kind.

---

## Third-Party Services

When you perform a subtitle search, myanSub sends the movie or show title to these subtitle databases:

| Service | What is sent | Privacy policy |
|---------|-------------|---------------|
| **OpenSubtitles** (`api.opensubtitles.com`) | The search query (movie title, optional season/episode) | https://www.opensubtitles.com/en/privacypolicy |
| **SubDL** (`api.subdl.com`, `dl.subdl.com`) | The search query (movie title, optional season/episode) | https://subdl.com/privacy |

No personally identifiable information (name, email, IP address beyond what those servers log by default) is sent by myanSub itself. Please review each service's own privacy policy for details on how they handle request metadata.

---

## Data Retention

All data stored by myanSub lives exclusively in your browser's local storage (`chrome.storage.local` and `chrome.storage.sync`). You can delete it at any time by:

- Removing the extension from your browser, or
- Going to `chrome://extensions` → myanSub → **Clear storage**

---

## Children's Privacy

myanSub does not knowingly collect any data from users of any age, as it collects no personal data at all. The extension imposes no age restriction.

---

## Changes to This Policy

If this policy changes materially, the updated policy will be committed to the public repository and the "Last updated" date above will be revised. Continued use of the extension after a policy change constitutes acceptance of the revised policy.

---

## Contact

For privacy questions, contact: **vibercoder99g@gmail.com**

Source code: https://github.com/heinthant2k4/mmSub
