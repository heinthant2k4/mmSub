import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config module so we can control SUBDL_API_KEY per test
vi.mock('../lib/config', () => ({
  SUBDL_API_KEY: 'test-key',
  SUBDL_BASE_URL: 'https://api.subdl.com/api/v1',
  SUBDL_DOWNLOAD_BASE_URL: 'https://dl.subdl.com',
  SUBDL_LANGUAGE: 'MY',
  OPENSUBTITLES_API_KEY: '',
  OPENSUBTITLES_BASE_URL: '',
  OPENSUBTITLES_LANGUAGE: 'my',
  BURMESE_LANGUAGE_CODE: 'my',
}));

import { searchSubDL } from '../lib/subdl-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const subDLResponse = {
  status: true,
  results: [{ name: 'Breaking Bad', year: 2008, sd_id: 123 }],
  subtitles: [{ url: '/subtitle/1-2.zip', release_name: 'Breaking.Bad.S03E07', lang: 'MY' }],
};

describe('searchSubDL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not append season/episode params when opts not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => subDLResponse,
    });

    await searchSubDL('Breaking Bad');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).not.toContain('season_number');
    expect(url).not.toContain('episode_number');
    expect(url).not.toContain('type=');
  });

  it('appends season_number, episode_number, and type=tv for TV show search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => subDLResponse,
    });

    await searchSubDL('Breaking Bad', { season: 3, episode: 7, contentType: 'tv' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('season_number=3');
    expect(url).toContain('episode_number=7');
    expect(url).toContain('type=tv');
  });

  it('appends type=movie without season/episode for movie search', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => subDLResponse,
    });

    await searchSubDL('Inception', { contentType: 'movie' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('type=movie');
    expect(url).not.toContain('season_number');
    expect(url).not.toContain('episode_number');
  });

  it('returns empty array when SUBDL_API_KEY is empty', async () => {
    // Temporarily override the module mock to simulate empty key
    const { SUBDL_API_KEY: _orig, ...rest } = await import('../lib/config');
    vi.doMock('../lib/config', () => ({ ...rest, SUBDL_API_KEY: '' }));

    // Import a fresh copy of the module that sees the empty key
    const { searchSubDL: searchWithEmptyKey } = await import('../lib/subdl-client?empty-key');
    // Since module caching will return same module, we test via the exported behavior directly
    // by checking the guard: when SUBDL_API_KEY is falsy, returns []
    // We use vi.importActual to confirm the guard logic is in place
    // Instead, assert that fetch is not called when key is empty
    // We'll use a workaround: reset module registry and remock
    vi.resetModules();
    vi.doMock('../lib/config', () => ({
      SUBDL_API_KEY: '',
      SUBDL_BASE_URL: 'https://api.subdl.com/api/v1',
      SUBDL_DOWNLOAD_BASE_URL: 'https://dl.subdl.com',
      SUBDL_LANGUAGE: 'MY',
      OPENSUBTITLES_API_KEY: '',
      OPENSUBTITLES_BASE_URL: '',
      OPENSUBTITLES_LANGUAGE: 'my',
      BURMESE_LANGUAGE_CODE: 'my',
    }));

    const { searchSubDL: searchEmpty } = await import('../lib/subdl-client');
    const result = await searchEmpty('Inception');

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
