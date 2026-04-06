# Architecture

## Three-Layer Extension Model

Browser extensions built on Manifest V3 have three isolated JavaScript contexts. myanSub uses all three.

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1 — Popup (React)                                     │
│  Lifecycle: spawns on toolbar click, dies on close           │
│  Persistence: browser.storage.sync                           │
│  (subtitleSettings, recentSubtitles survive popup close)     │
└───────────────────────────┬──────────────────────────────────┘
                            │  PopupMessage
                            │  browser.runtime.sendMessage
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Layer 2 — Background Service Worker                         │
│  Lifecycle: event-driven, may be suspended by browser        │
│  Persistence: tabState Map (ephemeral — lost on suspend)     │
│  Key design: Promise.allSettled so one API failure           │
│  never blocks results from the other source                  │◀──▶ OpenSubtitles
└───────────────────────────┬──────────────────────────────────┘◀──▶ SubDL
                            │  ContentMessage
                            │  browser.tabs.sendMessage
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  Layer 3 — Content Script                                    │
│  Lifecycle: injected at document_idle, lives as long as tab  │
│  Persistence: in-memory (syncEngine, overlay)                │
│  Settings: applied via storage.onChanged — bypasses SW       │
└──────────────────────────────────────────────────────────────┘
```

---

## Sync Engine

The sync engine converts a flat array of cues into frame-accurate subtitle display.

```
loadCues(cues[])
  └── sort by startMs
  └── reset offsetMs to 0

getCueAt(timeMs)
  └── effectiveMs = timeMs − offsetMs
  └── binary search: find cue where startMs ≤ effectiveMs < endMs
  └── returns cue or null

adjustOffset(deltaMs)
  └── offsetMs += deltaMs
      positive → subtitles appear later
      negative → subtitles appear earlier
```

The binary search is O(log n). A 2-hour film with ~7 200 cues completes in ~13 iterations — cheap enough to run inside a 60 fps `requestAnimationFrame` loop without dropping frames.

---

## Shadow DOM Overlay

Streaming sites aggressively style the video container and inject their own overlays. Attaching subtitle elements directly to the DOM risks CSS conflicts, JavaScript removal, and z-index wars.

myanSub solves this with a Shadow DOM host:

```
video.parentElement
  └── #myansub-host  (position: absolute, z-index: 2147483647)
        └── shadow-root  (mode: open)
              ├── <style>  (scoped — no leak in or out)
              ├── .subtitle-text
              └── .sync-toast
```

The host is repositioned by a `ResizeObserver` on the video element and moved inside the fullscreen element on `fullscreenchange`.

---

## Subtitle Deduplication

Both APIs often return the same subtitle file. Deduplication runs after merging:

```
normalize(releaseName)
  └── toLowerCase
  └── strip extension (.srt, .ass, .zip)
  └── replace [._-] with space
  └── collapse whitespace

key = `${year ?? ''}:${normalize(releaseName)}`

For each duplicate key:
  └── keep SubDL entry over OS entry  (SubDL = direct files, no quota)
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

```
Popup  ──PopupMessage──▶  Background  ──ContentMessage──▶  Content Script
         SEARCH                         LOAD_CUES
         SELECT                         ADJUST_OFFSET
         LOAD_LOCAL                     GET_TITLE
         OFFSET                         SETTINGS
         GET_STATUS      ◀─response─    CLEAR
         GET_TITLE
         APPLY_SETTINGS
         CLEAR
```
