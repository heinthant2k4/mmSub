# Architecture

## Three-Layer Extension Model

Browser extensions built on Manifest V3 have three isolated JavaScript contexts. myanSub uses all three.

```mermaid
flowchart TD
    POP["Layer 1 — Popup (React)\nLifecycle: spawns on toolbar click, dies on close\nPersistence: browser.storage.sync\n(subtitleSettings, recentSubtitles)"]

    BG["Layer 2 — Background Service Worker\nLifecycle: event-driven, may be suspended\nPersistence: tabState Map (ephemeral — intentionally lost on suspend)\nKey design: Promise.allSettled so one API failure never blocks the other"]

    CS["Layer 3 — Content Script\nLifecycle: injected at document_idle, lives as long as the tab\nPersistence: in-memory (syncEngine, overlay)\nSettings applied via storage.onChanged — bypasses suspended SW"]

    POP -->|"PopupMessage\nbrowser.runtime.sendMessage"| BG
    BG -->|"ContentMessage\nbrowser.tabs.sendMessage"| CS
    BG <-->|fetch| APIs["OpenSubtitles API\nSubDL API"]
```

---

## Sync Engine

The sync engine converts a flat array of cues into frame-accurate subtitle display.

```mermaid
flowchart TD
    L["loadCues(cues[])"] --> S["sort by startMs"]
    S --> R["reset offsetMs to 0"]

    G["getCueAt(timeMs)"] --> E["effectiveMs = timeMs − offsetMs"]
    E --> B["binary search\nstartMs ≤ effectiveMs < endMs"]
    B --> C{"match?"}
    C -->|yes| RET["return cue"]
    C -->|no| NULL["return null"]

    A["adjustOffset(deltaMs)"] --> O["offsetMs += deltaMs\n+ = subtitles appear later\n− = subtitles appear earlier"]
```

The binary search is O(log n). A 2-hour film with ~7 200 cues completes in ~13 iterations — cheap enough to run inside a 60 fps `requestAnimationFrame` loop without dropping frames.

---

## Shadow DOM Overlay

Streaming sites aggressively style the video container and inject their own overlays. Attaching subtitle elements directly to the DOM risks CSS conflicts, JavaScript removal, and z-index wars.

myanSub solves this with a Shadow DOM host:

```mermaid
flowchart TD
    VP["video.parentElement"]
    VP --> H["#myansub-host\nposition: absolute · z-index: 2147483647"]
    H --> SR["#shadow-root  mode: open"]
    SR --> ST["style  (scoped — no leak in or out)"]
    SR --> SUB[".subtitle-text"]
    SR --> TOAST[".sync-toast"]
```

The host is repositioned by a `ResizeObserver` on the video element and moved inside the fullscreen element on `fullscreenchange`.

---

## Subtitle Deduplication

Both APIs often return the same subtitle file. Deduplication runs after merging:

```mermaid
flowchart TD
    OS["OpenSubtitles results"] --> M["merge arrays"]
    SD["SubDL results"] --> M
    M --> N["normalize(releaseName)\nlowerCase · strip ext · replace [._-] → space · collapse whitespace"]
    N --> K["key = year + ':' + normalizedName"]
    K --> P{"duplicate key?"}
    P -->|yes| W["keep SubDL over OS\nor higher downloadCount if same source"]
    P -->|no| KEEP["keep as-is"]
    W --> SORT["sort by downloadCount desc"]
    KEEP --> SORT
    SORT --> R["Result list"]
```

---

## Message Type Contracts

All communication between layers is typed in `lib/messages.ts`. Adding a new message requires:

1. Add variant to `PopupMessage` or `ContentMessage`
2. Handle it in the receiving `switch` statement
3. TypeScript will error if any case is unhandled (exhaustive check via `satisfies`)

This prevents the most common extension bug: sending a message that nobody listens for.

```mermaid
flowchart LR
    subgraph Popup
        PM["PopupMessage\nSEARCH · SELECT · LOAD_LOCAL\nOFFSET · GET_STATUS · GET_TITLE\nAPPLY_SETTINGS · CLEAR"]
    end
    subgraph Background
        SR["SearchResponse\nSelectResponse\nStatusResponse\nTitleResponse"]
        CM["ContentMessage\nLOAD_CUES · ADJUST_OFFSET\nGET_TITLE · SETTINGS · CLEAR"]
    end
    subgraph Content
        direction LR
        CS["handles ContentMessage\nreturns TitleResponse"]
    end
    PM -->|sendMessage| Background
    Background -->|response| SR
    CM -->|sendMessage| CS
```
