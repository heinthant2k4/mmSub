// entrypoints/background.ts
import { searchSubtitles, downloadSubtitle } from '@/lib/api-client';
import { searchSubDL, downloadSubDL } from '@/lib/subdl-client';
import { deduplicateResults } from '@/lib/dedup';
import { parseSrt } from '@/lib/srt-parser';
import { parseAss } from '@/lib/ass-parser';
import { SubtitleCache } from '@/lib/cache';
import type {
  PopupMessage,
  ContentMessage,
  SearchResponse,
  SelectResponse,
  StatusResponse,
  TitleResponse,
} from '@/lib/messages';

export default defineBackground(() => {
  const cache = new SubtitleCache();
  const tabState = new Map<number, { cueCount: number; offsetMs: number }>();

  async function sendToContent(tabId: number, message: ContentMessage): Promise<void> {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
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
              const searchOpts = {
                season: message.season,
                episode: message.episode,
                contentType: message.contentType,
              };
              // Run both APIs in parallel; if one fails, still return the other
              const [osResults, subdlResults] = await Promise.allSettled([
                searchSubtitles(message.query, searchOpts),
                searchSubDL(message.query, searchOpts),
              ]);

              const merged = [
                ...(osResults.status === 'fulfilled' ? osResults.value : []),
                ...(subdlResults.status === 'fulfilled' ? subdlResults.value : []),
              ];

              if (merged.length === 0) {
                const err =
                  osResults.status === 'rejected' ? String(osResults.reason) : 'No results found';
                return { ok: false, error: err } satisfies SearchResponse;
              }

              return { ok: true, results: deduplicateResults(merged) } satisfies SearchResponse;
            } catch (err) {
              return { ok: false, error: String(err) } satisfies SearchResponse;
            }
          }

          case 'SELECT': {
            try {
              let srtText: string;

              if (message.source === 'os') {
                srtText = (await cache.get(message.fileId)) ?? null as any;
                if (!srtText) {
                  srtText = await downloadSubtitle(message.fileId);
                  await cache.set(message.fileId, srtText);
                }
              } else {
                srtText = (await cache.get(message.sdUrl)) ?? null as any;
                if (!srtText) {
                  srtText = await downloadSubDL(message.sdUrl);
                  await cache.set(message.sdUrl, srtText);
                }
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
              const cues = message.format === 'ass'
                ? parseAss(message.srtText)
                : parseSrt(message.srtText);
              tabState.set(tabId, { cueCount: cues.length, offsetMs: 0 });
              await sendToContent(tabId, { type: 'LOAD_CUES', cues });
              return { ok: true, cueCount: cues.length } satisfies SelectResponse;
            } catch (err) {
              return { ok: false, error: String(err) } satisfies SelectResponse;
            }
          }

          case 'OFFSET': {
            const state = tabState.get(tabId);
            if (state) state.offsetMs += message.deltaMs;
            await sendToContent(tabId, { type: 'ADJUST_OFFSET', deltaMs: message.deltaMs });
            return { ok: true };
          }

          case 'CLEAR': {
            tabState.delete(tabId);
            await sendToContent(tabId, { type: 'CLEAR' });
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

          case 'GET_TITLE': {
            try {
              const result = await browser.tabs.sendMessage(tabId, {
                type: 'GET_TITLE',
              } satisfies ContentMessage);
              return result as TitleResponse;
            } catch {
              return { title: '' } satisfies TitleResponse;
            }
          }
        }
      };

      handle().then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
      return true;
    }
  );
});
