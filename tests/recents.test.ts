// tests/recents.test.ts
// Tests the recent subtitles deduplication and capping logic
// (mirrors the saveToRecents behaviour from App.tsx)
import { describe, it, expect } from 'vitest';
import type { SubtitleResult } from '../lib/messages';

function makeResult(partial: Partial<SubtitleResult> & { source: 'os' | 'subdl' }): SubtitleResult {
  return {
    releaseName: 'Test.Release',
    featureTitle: 'Test Title',
    language: 'my',
    downloadCount: 100,
    uploadDate: '2024-01-01',
    ...partial,
  };
}

function resultKey(r: SubtitleResult): string {
  return r.source === 'os' ? `os:${r.fileId}` : `subdl:${r.sdUrl}`;
}

function addToRecents(prev: SubtitleResult[], result: SubtitleResult): SubtitleResult[] {
  const key = resultKey(result);
  const filtered = prev.filter(r => resultKey(r) !== key);
  return [result, ...filtered].slice(0, 5);
}

describe('recent subtitles list', () => {
  it('adds a new entry to the front', () => {
    const entry = makeResult({ source: 'os', fileId: 1 });
    const next = addToRecents([], entry);
    expect(next).toHaveLength(1);
    expect(next[0].fileId).toBe(1);
  });

  it('deduplicates by key — existing entry moves to front', () => {
    const a = makeResult({ source: 'os', fileId: 1, featureTitle: 'First' });
    const b = makeResult({ source: 'os', fileId: 2, featureTitle: 'Second' });
    const aUpdated = makeResult({ source: 'os', fileId: 1, featureTitle: 'First Updated' });
    const list = addToRecents([a, b], aUpdated);
    expect(list).toHaveLength(2);
    expect(list[0].featureTitle).toBe('First Updated');
    expect(list[1].featureTitle).toBe('Second');
  });

  it('caps the list at 5 entries', () => {
    let list: SubtitleResult[] = [];
    for (let i = 1; i <= 7; i++) {
      list = addToRecents(list, makeResult({ source: 'os', fileId: i }));
    }
    expect(list).toHaveLength(5);
    expect(list[0].fileId).toBe(7);
  });

  it('treats os and subdl entries with same numeric id as different keys', () => {
    const os = makeResult({ source: 'os', fileId: 1 });
    const subdl = makeResult({ source: 'subdl', sdUrl: '/subtitle/1.zip' });
    const list = addToRecents([os], subdl);
    expect(list).toHaveLength(2);
  });

  it('deduplicates subdl entries by sdUrl', () => {
    const a = makeResult({ source: 'subdl', sdUrl: '/subtitle/abc.zip', featureTitle: 'Old' });
    const b = makeResult({ source: 'subdl', sdUrl: '/subtitle/abc.zip', featureTitle: 'New' });
    const list = addToRecents([a], b);
    expect(list).toHaveLength(1);
    expect(list[0].featureTitle).toBe('New');
  });
});
