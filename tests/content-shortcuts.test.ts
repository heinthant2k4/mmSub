import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleShortcut } from '../lib/shortcut-handler';
import type { SyncEngine } from '../lib/sync-engine';
import type { SubtitleOverlay } from '../lib/overlay';

// Minimal mocks — only the methods shortcut-handler calls
function makeSyncEngine(): SyncEngine {
  return {
    adjustOffset: vi.fn(),
    getOffset: vi.fn().mockReturnValue(0),
  } as unknown as SyncEngine;
}

function makeOverlay(): SubtitleOverlay {
  return {
    showToast: vi.fn(),
  } as unknown as SubtitleOverlay;
}

interface FakeKeyboardEventInit {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}

function makeEvent(opts: FakeKeyboardEventInit): KeyboardEvent {
  const preventDefault = vi.fn();
  return {
    key: opts.key,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    preventDefault,
  } as unknown as KeyboardEvent;
}

describe('handleShortcut', () => {
  let syncEngine: SyncEngine;
  let overlay: SubtitleOverlay;
  let onClear: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    syncEngine = makeSyncEngine();
    overlay = makeOverlay();
    onClear = vi.fn();
  });

  it('Alt+ArrowLeft fires adjustOffset(-500)', () => {
    const event = makeEvent({ key: 'ArrowLeft', altKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(syncEngine.adjustOffset).toHaveBeenCalledWith(-500);
  });

  it('Alt+ArrowRight fires adjustOffset(+500)', () => {
    const event = makeEvent({ key: 'ArrowRight', altKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(syncEngine.adjustOffset).toHaveBeenCalledWith(500);
  });

  it('Alt+Shift+ArrowLeft fires adjustOffset(-1000)', () => {
    const event = makeEvent({ key: 'ArrowLeft', altKey: true, shiftKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(syncEngine.adjustOffset).toHaveBeenCalledWith(-1000);
  });

  it('Alt+Shift+ArrowRight fires adjustOffset(+1000)', () => {
    const event = makeEvent({ key: 'ArrowRight', altKey: true, shiftKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(syncEngine.adjustOffset).toHaveBeenCalledWith(1000);
  });

  it('Alt+C calls onClear', () => {
    const event = makeEvent({ key: 'c', altKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(onClear).toHaveBeenCalledOnce();
    expect(syncEngine.adjustOffset).not.toHaveBeenCalled();
  });

  it('Alt+C (uppercase key) also calls onClear', () => {
    const event = makeEvent({ key: 'C', altKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(true);
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('Unrelated key Ctrl+Z does nothing', () => {
    const event = makeEvent({ key: 'z', ctrlKey: true });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(false);
    expect(syncEngine.adjustOffset).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('Plain ArrowLeft without Alt does nothing', () => {
    const event = makeEvent({ key: 'ArrowLeft' });
    const handled = handleShortcut(event, { syncEngine, overlay, onClear });
    expect(handled).toBe(false);
    expect(syncEngine.adjustOffset).not.toHaveBeenCalled();
  });

  it('preventDefault is called on handled keys', () => {
    const event = makeEvent({ key: 'ArrowLeft', altKey: true });
    handleShortcut(event, { syncEngine, overlay, onClear });
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('preventDefault is NOT called on unhandled keys', () => {
    const event = makeEvent({ key: 'z', ctrlKey: true });
    handleShortcut(event, { syncEngine, overlay, onClear });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('shows toast after offset adjustment', () => {
    const event = makeEvent({ key: 'ArrowRight', altKey: true });
    handleShortcut(event, { syncEngine, overlay, onClear });
    expect(overlay.showToast).toHaveBeenCalledOnce();
    expect(overlay.showToast).toHaveBeenCalledWith(expect.stringContaining('Offset'));
  });

  it('does NOT show toast on Alt+C clear', () => {
    const event = makeEvent({ key: 'c', altKey: true });
    handleShortcut(event, { syncEngine, overlay, onClear });
    expect(overlay.showToast).not.toHaveBeenCalled();
  });
});
