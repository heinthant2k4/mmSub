# Architecture

## Three-Layer Extension Model

Browser extensions built on Manifest V3 have three isolated JavaScript contexts. mmSub uses all three.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1 — Popup (React)                                        │
│  Lifecycle: spawns when user clicks the toolbar icon, dies      │
│             when popup closes. No persistent state.             │
│                                                                 │
│  Responsibilities:                                              │
│  · Search UI (query, contentType, season, episode)              │
│  · File upload (drag-and-drop or browse)                        │
│  · Display settings (font size, vertical position)             │
│  · Recent subtitles list                                        │
│  · Sync offset controls                                         │
│                                                                 │
│  State persistence: browser.storage.sync                        │
│  (subtitleSettings, recentSubtitles survive popup close)        │
└────────────────────────┬────────────────────────────────────────┘
                         │  PopupMessage  (browser.runtime.sendMessage)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Background Service Worker                            │
│  Lifecycle: event-driven, may be suspended by the browser.      │
│             Must not keep in-memory state across suspensions.   │
│             (tabState Map is intentionally lost on suspend —    │
│              GET_STATUS returns 0 cues, which is safe.)         │
│                                                                 │
│  Responsibilities:                                              │
│  · Dual-source subtitle search (OpenSubtitles + SubDL)          │
│  · ZIP extraction (fflate)                                      │
│  · SRT / ASS parsing                                           │
│  · Subtitle cache (browser.storage.local, 10 MB budget)         │
│  · Tab state (cueCount, offsetMs per tabId)                     │
│  · Message relay to content script                              │
│                                                                 │
│  Key design: Promise.allSettled ensures one API failure         │
│  never blocks results from the other source.                    │
└────────────────────────┬────────────────────────────────────────┘
                         │  ContentMessage  (browser.tabs.sendMessage)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3 — Content Script                                       │
│  Lifecycle: injected into every page at document_idle.          │
│             Lives as long as the tab is open.                   │
│                                                                 │
│  Responsibilities:                                              │
│  · Video discovery (largest / playing video heuristic)          │
│  · MutationObserver for dynamically inserted videos             │
│  · requestAnimationFrame sync loop                              │
│  · Keyboard shortcut interception                               │
│  · Shadow DOM overlay management                                │
│  · Title detection for popup pre-fill                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Sync Engine

The sync engine converts a flat array of cues into frame-accurate subtitle display.

```
loadCues(cues[])
  └── sort by startMs
  └── reset offsetMs to 0

getCueAt(timeMs)
  └── effectiveMs = timeMs - offsetMs
  └── binary search for cue where startMs ≤ effectiveMs < endMs
  └── returns cue or null

adjustOffset(deltaMs)
  └── offsetMs += deltaMs
  └── positive = subtitles appear later
  └── negative = subtitles appear earlier

getOffset() → offsetMs
```

The binary search is O(log n). For a 2-hour film with one cue per second that's ~7200 cues — the search completes in ~13 iterations. The animation frame loop runs at 60 fps but the search is cheap enough to never cause dropped frames.

---

## Shadow DOM Overlay

Streaming sites aggressively style the video container and inject their own overlays. Attaching subtitle elements directly to the DOM risks:

- CSS conflicts (`.subtitle` class collisions)
- Streaming site JavaScript removing unknown children
- z-index wars

mmSub solves this by attaching a Shadow DOM host:

```
video.parentElement
  └── #myanmar-subtitles-host  (position: absolute, z-index: 2147483647)
        └── #shadow-root (mode: open)
              ├── <style>  (scoped — no leak in or out)
              ├── .subtitle-text
              └── .sync-toast
```

The host is repositioned by a `ResizeObserver` on the video element and moved inside the fullscreen element on `fullscreenchange`.

---

## Subtitle Deduplication

Both APIs often return the same subtitle file. Deduplication runs after merging results:

```
normalize(releaseName)
  └── toLowerCase
  └── strip extension (.srt, .ass, .zip)
  └── replace [._-] with space
  └── collapse whitespace

key = `${year ?? ''}:${normalize(releaseName)}`

For each key:
  └── keep SubDL entry over OS entry (SubDL serves direct files, no download quota)
  └── if same source, keep higher downloadCount
  └── final sort: downloadCount descending
```

---

## Message Type Contracts

All communication between layers is typed in `lib/messages.ts`. Adding a new message requires:

1. Add variant to `PopupMessage` or `ContentMessage`
2. Handle it in the receiving `switch` statement
3. TypeScript will error if any case is unhandled (exhaustive check via `satisfies`)

This prevents the most common extension bug: sending a message that nobody listens for.
