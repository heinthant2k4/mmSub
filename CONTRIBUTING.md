# Contributing to mmSub

Thank you for helping bring Burmese subtitles to more people. Here's everything you need to get started.

---

## Quick Start

```bash
git clone https://github.com/heinthant2k4/mmSub.git
cd mmSub
pnpm install
pnpm dev          # starts Chrome with hot reload
```

---

## Project Conventions

### TypeScript

- Strict mode is on — no implicit `any`
- Use `browser.*` everywhere (never `chrome.*`) — WXT polyfills this for both browsers
- All inter-component contracts live in `lib/messages.ts` as discriminated unions
- Prefer ternary (`condition ? a : b`) over `&&` for JSX conditionals

### Testing

Every new module needs a corresponding test file in `tests/`. We use [Vitest](https://vitest.dev).

```bash
pnpm test          # run once
pnpm test --watch  # watch mode
```

Pure functions are easiest to test — if you're adding logic, extract it into a function in `lib/` rather than embedding it in a component or entrypoint.

### Commits

Use conventional commit messages:

```
feat: add support for VTT subtitle format
fix: handle ASS files with non-standard Format: line
test: add edge case for empty SRT input
refactor: extract ZIP entry selection into helper
```

---

## Architecture Overview

```
Popup  ──PopupMessage──▶  Background  ──ContentMessage──▶  Content Script
(React)                  (SW)                              (page)
```

- **Popup** sends typed `PopupMessage` to background
- **Background** fetches subtitles, caches them, parses them, forwards `LOAD_CUES` to content
- **Content script** runs the frame-accurate sync loop and manages the Shadow DOM overlay

When adding a new feature that spans all three layers, update `lib/messages.ts` first — it's the single source of truth for the message API.

---

## Adding a New Subtitle Source

1. Create `lib/your-source-client.ts` — export `searchYourSource()` and `downloadYourSource()`
2. Add the result to the `SubtitleResult` union with a new `source` discriminant in `lib/messages.ts`
3. Wire it into `entrypoints/background.ts` inside `Promise.allSettled([...])`
4. Add deduplication support in `lib/dedup.ts`
5. Add a source badge to `MdResultCard` in the popup
6. Write tests in `tests/your-source-client.test.ts`

---

## Adding a New Subtitle Format

1. Create `lib/your-format-parser.ts` — export `parseYourFormat(text: string): SubtitleCue[]`
2. Accept the new file extension in `processFile()` in `App.tsx`
3. Detect the format in `entrypoints/background.ts` `LOAD_LOCAL` and `SELECT` cases
4. Write tests in `tests/your-format-parser.test.ts`

---

## Pull Request Checklist

- [ ] `pnpm test` passes (all 93+ tests green)
- [ ] `pnpm build` produces no TypeScript errors
- [ ] New code uses `browser.*` not `chrome.*`
- [ ] New JSX uses ternary not `&&` for non-boolean values
- [ ] New inter-layer communication goes through `lib/messages.ts`
- [ ] Tests added for any new pure logic

---

## Reporting Issues

Please open a GitHub issue with:

- Browser and version
- Extension version
- Streaming site URL (no account info needed)
- What you expected vs. what happened
- Console errors (F12 → Console, filter by `[Myanmar Subtitles]`)
