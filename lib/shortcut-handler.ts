// lib/shortcut-handler.ts

import type { SyncEngine } from './sync-engine';
import type { SubtitleOverlay } from './overlay';

export interface ShortcutDeps {
  syncEngine: SyncEngine;
  overlay: SubtitleOverlay;
  onClear: () => void;
}

/**
 * Handle a keyboard shortcut event for subtitle sync adjustment.
 * Returns true if the event was handled (and preventDefault was called).
 */
export function handleShortcut(
  event: KeyboardEvent,
  deps: ShortcutDeps,
): boolean {
  const { syncEngine, overlay, onClear } = deps;

  if (!event.altKey) return false;

  // Alt+C → clear subtitles
  if (event.key === 'c' || event.key === 'C') {
    event.preventDefault();
    onClear();
    return true;
  }

  // Arrow key shortcuts
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const magnitude = event.shiftKey ? 1000 : 500;
    const deltaMs = direction * magnitude;

    event.preventDefault();
    syncEngine.adjustOffset(deltaMs);

    const offsetSec = (syncEngine.getOffset() / 1000).toFixed(1);
    const sign = syncEngine.getOffset() >= 0 ? '+' : '';
    overlay.showToast(`Offset: ${sign}${offsetSec}s`);

    return true;
  }

  return false;
}
