import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  SearchResponse,
  SelectResponse,
  StatusResponse,
  SubtitleResult,
} from '@/lib/messages';
import type { PopupMessage } from '@/lib/messages';

function sendMessage<T>(message: PopupMessage): Promise<T> {
  return browser.runtime.sendMessage(message);
}

type Tab = 'search' | 'upload';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubtitleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusResponse>({ loaded: false, cueCount: 0, offsetMs: 0 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (resp.results.length === 0) setError('No Burmese subtitles found for this title.');
      } else {
        setError(resp.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleSelect = useCallback(async (result: SubtitleResult) => {
    const key = result.source === 'os' ? `os:${result.fileId}` : `subdl:${result.sdUrl}`;
    setLoading(true);
    setError('');
    setSelectedKey(key);
    try {
      const msg: PopupMessage = result.source === 'os'
        ? { type: 'SELECT', source: 'os', fileId: result.fileId! }
        : { type: 'SELECT', source: 'subdl', sdUrl: result.sdUrl! };
      const resp = await sendMessage<SelectResponse>(msg);
      if (resp.ok) {
        setStatus(s => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
      } else {
        setError(resp.error);
        setSelectedKey(null);
      }
    } catch (err) {
      setError(String(err));
      setSelectedKey(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      setError('Please select a .srt subtitle file.');
      return;
    }
    setLoading(true);
    setError('');
    setUploadedFileName(file.name);
    try {
      const srtText = await file.text();
      const resp = await sendMessage<SelectResponse>({ type: 'LOAD_LOCAL', srtText });
      if (resp.ok) {
        setStatus(s => ({ ...s, loaded: true, cueCount: resp.cueCount, offsetMs: 0 }));
      } else {
        setError(resp.error);
        setUploadedFileName('');
      }
    } catch (err) {
      setError(String(err));
      setUploadedFileName('');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleOffset = useCallback(async (deltaMs: number) => {
    try {
      await sendMessage({ type: 'OFFSET', deltaMs });
      setStatus(s => ({ ...s, offsetMs: s.offsetMs + deltaMs }));
    } catch {}
  }, []);

  const handleClear = useCallback(async () => {
    try {
      await sendMessage({ type: 'CLEAR' });
      setStatus({ loaded: false, cueCount: 0, offsetMs: 0 });
      setSelectedKey(null);
      setUploadedFileName('');
      setResults([]);
    } catch {}
  }, []);

  const offsetSeconds = (status.offsetMs / 1000).toFixed(1);
  const offsetSign = status.offsetMs > 0 ? '+' : '';

  return (
    <div className="w-[360px] bg-gray-950 text-gray-100 font-sans flex flex-col select-none">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-gray-900 to-gray-950 border-b border-gray-800/80">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[15px] font-bold text-amber-400 tracking-tight leading-none">
              Myanmar Subtitles
            </h1>
            <p className="text-[11px] text-gray-500 mt-0.5 tracking-wide">မြန်မာ ကြားဖြတ်စာတန်း</p>
          </div>
          {status.loaded && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] bg-green-950 text-green-400 border border-green-800/60 px-2 py-1 rounded-full font-medium">
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor">
                  <circle cx="5" cy="5" r="5" />
                </svg>
                {status.cueCount} cues
              </span>
              <button
                onClick={handleClear}
                title="Clear subtitles"
                className="text-gray-600 hover:text-red-400 transition-colors text-xs leading-none p-1"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-900 border-b border-gray-800">
        {(['search', 'upload'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(''); }}
            className={`flex-1 py-2.5 text-xs font-medium transition-all ${
              tab === t
                ? 'text-amber-400 border-b-2 border-amber-500'
                : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent'
            }`}
          >
            {t === 'search' ? '🔍  Search Online' : '📁  Local File'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">
        {tab === 'search' && (
          <>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Movie or show title..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                           placeholder-gray-600 focus:outline-none focus:border-amber-500
                           focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700
                           disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed
                           text-white px-4 py-2 rounded-lg text-sm font-medium transition-all
                           min-w-[72px] flex items-center justify-center gap-1.5"
              >
                {loading ? <Spinner /> : 'Search'}
              </button>
            </div>

            {error ? <ErrorBanner message={error} onDismiss={() => setError('')} /> : null}

            {results.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">
                  {results.length} result{results.length !== 1 ? 's' : ''} · Burmese subtitles
                </p>
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto -mr-1 pr-1">
                  {results.map(r => {
                    const key = r.source === 'os' ? `os:${r.fileId}` : `subdl:${r.sdUrl}`;
                    return (
                      <ResultCard
                        key={key}
                        result={r}
                        selected={selectedKey === key}
                        loading={loading}
                        onSelect={() => handleSelect(r)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {!loading && results.length === 0 && !error && (
              <p className="text-[11px] text-gray-600 text-center py-6">
                Search for a movie or TV show to find<br />Burmese subtitles on OpenSubtitles
              </p>
            )}
          </>
        )}

        {tab === 'upload' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                dragOver
                  ? 'border-amber-500 bg-amber-950/20 scale-[1.01]'
                  : uploadedFileName
                    ? 'border-green-700/60 bg-green-950/10 hover:border-green-600'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'
              }`}
            >
              <div className="text-3xl mb-2">
                {loading ? '⏳' : uploadedFileName ? '✅' : '📄'}
              </div>
              {uploadedFileName ? (
                <>
                  <p className="text-sm text-green-400 font-medium truncate max-w-[200px] mx-auto">
                    {uploadedFileName}
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">Click or drop to replace</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400 font-medium">Drop .srt file here</p>
                  <p className="text-[10px] text-gray-600 mt-1">or click to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-2 mt-3 text-xs text-gray-500">
                <Spinner /> Parsing subtitles...
              </div>
            )}

            {error ? <div className="mt-3"><ErrorBanner message={error} onDismiss={() => setError('')} /></div> : null}
          </>
        )}
      </div>

      {/* Sync controls */}
      {status.loaded && (
        <div className="border-t border-gray-800 bg-gray-900/70 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">
              Sync Offset
            </span>
            <span className={`text-xs font-mono font-semibold tabular-nums ${
              status.offsetMs === 0
                ? 'text-gray-500'
                : status.offsetMs > 0
                  ? 'text-blue-400'
                  : 'text-orange-400'
            }`}>
              {offsetSign}{offsetSeconds}s
            </span>
          </div>
          <div className="flex items-center gap-1">
            <OffsetBtn label="−1s" onClick={() => handleOffset(-1000)} />
            <OffsetBtn label="−½s" onClick={() => handleOffset(-500)} />
            <button
              onClick={() => handleOffset(-status.offsetMs)}
              disabled={status.offsetMs === 0}
              className="flex-1 text-[10px] text-gray-500 hover:text-gray-300 disabled:text-gray-700
                         py-1.5 rounded-lg bg-gray-800 hover:bg-gray-750 disabled:bg-gray-800/50
                         transition-colors disabled:cursor-not-allowed"
            >
              Reset
            </button>
            <OffsetBtn label="+½s" onClick={() => handleOffset(500)} />
            <OffsetBtn label="+1s" onClick={() => handleOffset(1000)} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800/40">
        <p className="text-[9px] text-gray-700 text-center tracking-wide">
          Powered by OpenSubtitles
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/50 rounded-lg p-2.5 mb-3">
      <span className="text-red-500 text-xs mt-px shrink-0">⚠</span>
      <p className="text-[11px] text-red-300 flex-1 leading-relaxed">{message}</p>
      <button
        onClick={onDismiss}
        className="text-red-700 hover:text-red-500 text-xs shrink-0 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

function ResultCard({
  result,
  selected,
  loading,
  onSelect,
}: {
  result: SubtitleResult;
  selected: boolean;
  loading: boolean;
  onSelect: () => void;
}) {
  const sourceBadge = result.source === 'subdl'
    ? { label: 'SubDL', cls: 'bg-blue-950 text-blue-400 border-blue-800/50' }
    : { label: 'OS', cls: 'bg-orange-950 text-orange-400 border-orange-800/50' };

  return (
    <button
      onClick={onSelect}
      disabled={loading}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-sm ${
        selected
          ? 'bg-amber-950/30 border-amber-600/50 shadow-inner'
          : 'bg-gray-800/50 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 font-medium text-gray-100 leading-snug text-[13px]">
          {result.featureTitle}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 mt-px">
          {result.year ? (
            <span className="text-[10px] bg-gray-700/80 text-gray-400 px-1.5 py-0.5 rounded font-mono">
              {result.year}
            </span>
          ) : null}
          <span className={`text-[9px] border px-1.5 py-0.5 rounded font-bold tracking-wide ${sourceBadge.cls}`}>
            {sourceBadge.label}
          </span>
          {selected ? <span className="text-amber-400 text-xs font-bold">✓</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-1">
        {result.releaseName ? (
          <span className="text-[10px] text-gray-600 truncate max-w-[180px]" title={result.releaseName}>
            {result.releaseName}
          </span>
        ) : null}
        {result.downloadCount > 0 ? (
          <span className="text-[10px] text-gray-500 shrink-0">↓ {result.downloadCount.toLocaleString()}</span>
        ) : null}
      </div>
    </button>
  );
}

function OffsetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 active:bg-gray-600
                 text-[11px] text-gray-400 hover:text-gray-200 transition-colors font-mono"
    >
      {label}
    </button>
  );
}
