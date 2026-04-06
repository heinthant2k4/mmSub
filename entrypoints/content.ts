// entrypoints/content.ts
import { SyncEngine } from '@/lib/sync-engine';
import { SubtitleOverlay } from '@/lib/overlay';
import { detectTitle } from '@/lib/title-detector';
import { handleShortcut } from '@/lib/shortcut-handler';
import type { ContentMessage, TitleResponse } from '@/lib/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    const syncEngine = new SyncEngine();
    const overlay = new SubtitleOverlay();
    let animFrameId: number | null = null;
    let activeVideo: HTMLVideoElement | null = null;

    // Find the largest/most relevant video on the page
    function findVideo(): HTMLVideoElement | null {
      const videos = Array.from(document.querySelectorAll('video'));
      if (videos.length === 0) return null;

      // Prefer a playing video, otherwise take the largest by resolution
      const playing = videos.filter((v) => !v.paused && !v.ended);
      const candidates = playing.length > 0 ? playing : videos;

      return candidates.reduce((best, v) => {
        const area = v.videoWidth * v.videoHeight;
        const bestArea = best.videoWidth * best.videoHeight;
        return area > bestArea ? v : best;
      });
    }

    // Animation frame sync loop — runs every frame while subtitles are loaded
    function startSyncLoop(): void {
      if (animFrameId !== null) return;

      function tick() {
        if (activeVideo) {
          const timeMs = activeVideo.currentTime * 1000;
          const cue = syncEngine.getCueAt(timeMs);
          if (cue) {
            overlay.setText(cue.text);
          } else {
            overlay.clear();
          }
        }
        animFrameId = requestAnimationFrame(tick);
      }

      animFrameId = requestAnimationFrame(tick);
    }

    function stopSyncLoop(): void {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    }

    // Watch for dynamically inserted videos (e.g. Netflix loads video after page)
    const observer = new MutationObserver(() => {
      if (!activeVideo || !document.contains(activeVideo)) {
        const video = findVideo();
        if (video) {
          activeVideo = video;
          overlay.attachTo(video);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Try to attach to a video immediately on load
    const initialVideo = findVideo();
    if (initialVideo) {
      activeVideo = initialVideo;
      overlay.attachTo(initialVideo);
    }

    // Keyboard shortcuts for sync adjustment
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      // Only fire when subtitles are loaded (sync loop is running)
      if (animFrameId === null) return;

      handleShortcut(event, {
        syncEngine,
        overlay,
        onClear: () => {
          stopSyncLoop();
          syncEngine.loadCues([]);
          overlay.clear();
          browser.runtime.sendMessage({ type: 'CLEAR' } satisfies ContentMessage);
        },
      });
    });

    // Listen for messages from background service worker
    browser.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
      switch (message.type) {
        case 'LOAD_CUES': {
          // Re-detect video in case it changed
          const video = findVideo();
          if (video) {
            activeVideo = video;
            overlay.attachTo(video);
          }
          syncEngine.loadCues(message.cues);
          startSyncLoop();
          break;
        }
        case 'ADJUST_OFFSET': {
          syncEngine.adjustOffset(message.deltaMs);
          break;
        }
        case 'CLEAR': {
          stopSyncLoop();
          syncEngine.loadCues([]);
          overlay.clear();
          break;
        }
        case 'GET_TITLE': {
          const title = detectTitle();
          sendResponse({ title } satisfies TitleResponse);
          return true;
        }
      }
    });
  },
});
