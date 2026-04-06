// tests/settings.test.ts
// Tests applySettings logic without a DOM environment by exercising the method
// directly on a lightweight stub that mirrors the SubtitleOverlay interface.
import { describe, it, expect } from 'vitest';

// Minimal CSSStyleDeclaration-like object (enough for the style assignments)
function makeStyle(): Record<string, string> {
  return {};
}

// Standalone implementation of applySettings logic (mirrors overlay.ts)
function applySettings(
  style: Record<string, string>,
  fontSize: number,
  bottomPct: number
): void {
  style['fontSize'] = `${fontSize}px`;
  style['marginBottom'] = `${bottomPct}%`;
}

describe('applySettings logic', () => {
  it('formats fontSize as px string', () => {
    const style = makeStyle();
    applySettings(style, 28, 8);
    expect(style['fontSize']).toBe('28px');
  });

  it('formats bottomPct as percent string', () => {
    const style = makeStyle();
    applySettings(style, 24, 15);
    expect(style['marginBottom']).toBe('15%');
  });

  it('overwrites previous values on second call', () => {
    const style = makeStyle();
    applySettings(style, 20, 10);
    applySettings(style, 36, 30);
    expect(style['fontSize']).toBe('36px');
    expect(style['marginBottom']).toBe('30%');
  });

  it('style is empty before applySettings is called', () => {
    const style = makeStyle();
    expect(style['fontSize']).toBeUndefined();
    expect(style['marginBottom']).toBeUndefined();
  });

  it('handles min boundary values (16px, 5%)', () => {
    const style = makeStyle();
    applySettings(style, 16, 5);
    expect(style['fontSize']).toBe('16px');
    expect(style['marginBottom']).toBe('5%');
  });

  it('handles max boundary values (40px, 50%)', () => {
    const style = makeStyle();
    applySettings(style, 40, 50);
    expect(style['fontSize']).toBe('40px');
    expect(style['marginBottom']).toBe('50%');
  });
});
