// entrypoints/background.ts
import { searchSubtitles, downloadSubtitle } from '@/lib/api-client';
import { parseSrt } from '@/lib/srt-parser';
import { SubtitleCache } from '@/lib/cache';
import type {
  PopupMessage,
  ContentMessage,
  SearchResponse,
  SelectResponse,
  StatusResponse,
} from '@/lib/messages';

export default defineBackground(() => {
  const cache = new SubtitleCache();

  // Track loaded cue count and offset per tab
  const tabState = new Map<number, { cueCount: number; offsetMs: number }>();

  async function sendToContent(tabId: number, message: ContentMessage): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // Content script might not be injected yet (e.g. on extension pages)
      console.warn('[Myanmar Subtitles] Failed to reach content script in tab', tabId);
    }
  }

  browser.runtime.onMessage.addListener(
    (message: PopupMessage, _sender, sendResponse) => {
      const handle = async (): Promise<any> => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const tabId = tab?.id;
        if (!tabId) return { ok: false, error: 'No active tab found' };

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
              // Check cache first to avoid re-downloading
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

      // Must return true to indicate we'll call sendResponse asynchronously
      handle().then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
      return true;
    }
  );
});
