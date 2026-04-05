import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchSubtitles, downloadSubtitle } from '../lib/api-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('searchSubtitles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends correct request to OpenSubtitles search endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await searchSubtitles('The Dark Knight');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/subtitles');
    expect(url).toContain('query=The+Dark+Knight');
    expect(url).toContain('languages=my');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('maps API response to SubtitleResult[]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            attributes: {
              files: [{ file_id: 123 }],
              language: 'my',
              download_count: 50,
              upload_date: '2024-01-15',
              feature_details: {
                title: 'The Dark Knight',
                year: 2008,
              },
            },
          },
        ],
      }),
    });

    const results = await searchSubtitles('The Dark Knight');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      fileId: 123,
      title: 'The Dark Knight',
      language: 'my',
      downloadCount: 50,
      uploadDate: '2024-01-15',
      featureTitle: 'The Dark Knight',
      year: 2008,
    });
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(searchSubtitles('test')).rejects.toThrow('401');
  });
});

describe('downloadSubtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends POST to download endpoint and fetches SRT content', async () => {
    // First call: POST /download → get link
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        link: 'https://dl.opensubtitles.org/file/123.srt',
        file_name: 'subtitle.srt',
      }),
    });
    // Second call: GET the SRT file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n',
    });

    const srt = await downloadSubtitle(456);

    // Verify POST /download
    const [url1, opts1] = mockFetch.mock.calls[0];
    expect(url1).toContain('/download');
    expect(opts1.method).toBe('POST');
    expect(JSON.parse(opts1.body)).toEqual({ file_id: 456 });

    // Verify SRT content fetched
    expect(srt).toContain('Hello');
  });
});
