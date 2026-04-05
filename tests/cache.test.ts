import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubtitleCache } from '../lib/cache';

// Mock chrome.storage.local
const store: Record<string, any> = {};
const mockStorage = {
  get: vi.fn((keys: string[]) => {
    const result: Record<string, any> = {};
    for (const key of keys) {
      if (key in store) result[key] = store[key];
    }
    return Promise.resolve(result);
  }),
  set: vi.fn((items: Record<string, any>) => {
    Object.assign(store, items);
    return Promise.resolve();
  }),
  remove: vi.fn((keys: string[]) => {
    for (const key of keys) delete store[key];
    return Promise.resolve();
  }),
  getBytesInUse: vi.fn(() => Promise.resolve(0)),
};

vi.stubGlobal('chrome', { storage: { local: mockStorage } });

describe('SubtitleCache', () => {
  let cache: SubtitleCache;

  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
    vi.clearAllMocks();
    cache = new SubtitleCache();
  });

  it('returns null for cache miss', async () => {
    const result = await cache.get(999);
    expect(result).toBeNull();
  });

  it('stores and retrieves SRT text', async () => {
    await cache.set(123, 'srt content here');
    const result = await cache.get(123);
    expect(result).toBe('srt content here');
  });

  it('uses prefixed keys to avoid collisions', async () => {
    await cache.set(123, 'test');
    expect(mockStorage.set).toHaveBeenCalledWith({
      'srt_123': 'test',
    });
  });

  it('removes a cached entry', async () => {
    await cache.set(123, 'test');
    await cache.remove(123);
    const result = await cache.get(123);
    expect(result).toBeNull();
  });
});
