// entrypoints/popup/App.tsx
import { useState, useCallback, useEffect } from 'react';
import type {
  PopupMessage,
  SearchResponse,
  SelectResponse,
  StatusResponse,
  SubtitleResult,
} from '@/lib/messages';

function sendMessage<T>(message: PopupMessage): Promise<T> {
  return browser.runtime.sendMessage(message);
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubtitleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusResponse>({
    loaded: false,
    cueCount: 0,
    offsetMs: 0,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Fetch subtitle status on popup open
  useEffect(() => {
    sendMessage<StatusResponse>({ type: 'GET_STATUS' }).then(setStatus).catch(() => {});
  }, []);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);

    try {
      const resp = await sendMessage<SearchResponse>({ type: 'SEARCH', query });
      if (resp.ok) {
        setResults(resp.results);
        if (resp.results.length === 0) {
          setError('No Burmese subtitles found for this title.');
        }
      } else {
        setError(resp.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSelect = useCallback(async (fileId: number) => {
    setLoading(true);
    setError('');
    setSelectedId(fileId);

    try {
      const resp = await sendMessage<SelectResponse>({ type: 'SELECT', fileId });
      if (resp.ok) {
        setStatus((s) => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
      } else {
        setError(resp.error);
        setSelectedId(null);
      }
    } catch (err) {
      setError(String(err));
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');

    try {
      const srtText = await file.text();
      const resp = await sendMessage<SelectResponse>({ type: 'LOAD_LOCAL', srtText });
      if (resp.ok) {
        setStatus((s) => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
      } else {
        setError(resp.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOffset = useCallback(async (deltaMs: number) => {
    try {
      await sendMessage({ type: 'OFFSET', deltaMs });
      setStatus((s) => ({ ...s, offsetMs: s.offsetMs + deltaMs }));
    } catch {}
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch]
  );

  return (
    <div className="w-[360px] min-h-[400px] bg-gray-900 text-gray-100 p-4 font-sans">
      {/* Header */}
      <h1 className="text-lg font-bold text-amber-400 mb-3">
        Myanmar Subtitles
      </h1>

      {/* Search bar */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search movie title..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm
                     placeholder-gray-500 focus:outline-none focus:border-amber-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700
                     text-white px-4 py-2 rounded text-sm font-medium transition-colors"
        >
          {loading ? '...' : 'Search'}
        </button>
      </div>

      {/* Local SRT file upload */}
      <label className="block mb-3 cursor-pointer">
        <span className="text-xs text-gray-400">Or upload a local .srt file:</span>
        <input
          type="file"
          accept=".srt"
          onChange={handleFileUpload}
          className="block mt-1 text-xs text-gray-400
                     file:mr-2 file:py-1 file:px-3 file:rounded file:border-0
                     file:bg-gray-700 file:text-gray-300 file:cursor-pointer
                     hover:file:bg-gray-600"
        />
      </label>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded p-2 mb-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Search results */}
      {results.length > 0 && (
        <div className="mb-3 max-h-[200px] overflow-y-auto">
          <p className="text-xs text-gray-400 mb-1">Results:</p>
          {results.map((r) => (
            <button
              key={r.fileId}
              onClick={() => handleSelect(r.fileId)}
              disabled={loading}
              className={`w-full text-left p-2 rounded mb-1 text-sm transition-colors
                ${
                  selectedId === r.fileId
                    ? 'bg-amber-900/50 border border-amber-600'
                    : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'
                }`}
            >
              <div className="font-medium">
                {r.featureTitle} {r.year ? `(${r.year})` : ''}
              </div>
              <div className="text-xs text-gray-400">
                Downloads: {r.downloadCount}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Status and sync controls (shown when subtitles are loaded) */}
      {status.loaded && (
        <div className="border-t border-gray-700 pt-3">
          <p className="text-xs text-green-400 mb-2">
            ✓ Subtitles loaded — {status.cueCount} cues
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Sync:</span>
            <button
              onClick={() => handleOffset(-500)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition-colors"
            >
              −0.5s
            </button>
            <span className="text-xs text-gray-300 min-w-[56px] text-center">
              {status.offsetMs >= 0 ? '+' : ''}
              {(status.offsetMs / 1000).toFixed(1)}s
            </span>
            <button
              onClick={() => handleOffset(500)}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs transition-colors"
            >
              +0.5s
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="mt-4 pt-3 border-t border-gray-800 text-[10px] text-gray-600 text-center">
        Powered by OpenSubtitles
      </p>
    </div>
  );
}
