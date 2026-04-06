import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  SearchResponse,
  SelectResponse,
  StatusResponse,
  TitleResponse,
  SubtitleResult,
} from '@/lib/messages';
import type { PopupMessage } from '@/lib/messages';

function sendMessage<T>(message: PopupMessage): Promise<T> {
  return browser.runtime.sendMessage(message);
}

type Tab = 'search' | 'upload';
type ContentType = 'movie' | 'tv';

export default function App() {
  const [tab, setTab] = useState<Tab>('search');
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [season, setSeason] = useState<number | ''>('');
  const [episode, setEpisode] = useState<number | ''>('');
  const [results, setResults] = useState<SubtitleResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<StatusResponse>({ loaded: false, cueCount: 0, offsetMs: 0 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [detectedTitle, setDetectedTitle] = useState('');
  const [recentSubtitles, setRecentSubtitles] = useState<SubtitleResult[]>([]);
  const [fontSize, setFontSize] = useState(24);
  const [bottomPct, setBottomPct] = useState(8);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleContentTypeChange = useCallback((type: ContentType) => {
    setContentType(type);
    if (type === 'movie') {
      setSeason('');
      setEpisode('');
    }
  }, []);

  useEffect(() => {
    sendMessage<StatusResponse>({ type: 'GET_STATUS' }).then(setStatus).catch(() => {});
    sendMessage<TitleResponse>({ type: 'GET_TITLE' }).then((res) => {
      if (res?.title) {
        setDetectedTitle(res.title);
        setQuery(res.title);
      }
    }).catch(() => {});
    browser.storage.sync.get(['subtitleSettings', 'recentSubtitles']).then((data: Record<string, unknown>) => {
      const saved = data['subtitleSettings'] as { fontSize?: number; bottomPct?: number } | undefined;
      if (saved) {
        setFontSize(saved.fontSize ?? 24);
        setBottomPct(saved.bottomPct ?? 8);
      }
      const recents = data['recentSubtitles'] as SubtitleResult[] | undefined;
      if (Array.isArray(recents)) setRecentSubtitles(recents);
    }).catch(() => {});
  }, []);

  const saveToRecents = useCallback((result: SubtitleResult) => {
    setRecentSubtitles(prev => {
      const key = result.source === 'os' ? `os:${result.fileId}` : `subdl:${result.sdUrl}`;
      const filtered = prev.filter(r => {
        const rKey = r.source === 'os' ? `os:${r.fileId}` : `subdl:${r.sdUrl}`;
        return rKey !== key;
      });
      const next = [result, ...filtered].slice(0, 5);
      browser.storage.sync.set({ recentSubtitles: next }).catch(() => {});
      return next;
    });
  }, []);

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
        saveToRecents(result);
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
  }, [saveToRecents]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const msg: PopupMessage = {
        type: 'SEARCH',
        query,
        contentType,
        ...(contentType === 'tv' && season !== '' ? { season: season as number } : {}),
        ...(contentType === 'tv' && episode !== '' ? { episode: episode as number } : {}),
      };
      const resp = await sendMessage<SearchResponse>(msg);
      if (resp.ok) {
        setResults(resp.results);
        if (resp.results.length === 0) setError('No subtitles found for this title.');
      } else {
        setError(resp.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [query, contentType, season, episode]);

  const processFile = useCallback(async (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.srt') && !lowerName.endsWith('.ass') && !lowerName.endsWith('.ssa')) {
      setError('Please select a .srt, .ass, or .ssa subtitle file.');
      return;
    }
    const format: 'srt' | 'ass' =
      lowerName.endsWith('.ass') || lowerName.endsWith('.ssa') ? 'ass' : 'srt';
    setLoading(true);
    setError('');
    setUploadedFileName(file.name);
    try {
      const srtText = await file.text();
      const resp = await sendMessage<SelectResponse>({ type: 'LOAD_LOCAL', srtText, format });
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

  const applyAndSaveSettings = useCallback((nextFontSize: number, nextBottomPct: number) => {
    browser.storage.sync.set({ subtitleSettings: { fontSize: nextFontSize, bottomPct: nextBottomPct } }).catch(() => {});
    sendMessage({ type: 'APPLY_SETTINGS', fontSize: nextFontSize, bottomPct: nextBottomPct }).catch(() => {});
  }, []);

  const handleFontSizeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setFontSize(next);
    applyAndSaveSettings(next, bottomPct);
  }, [bottomPct, applyAndSaveSettings]);

  const handleBottomPctChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    setBottomPct(next);
    applyAndSaveSettings(fontSize, next);
  }, [fontSize, applyAndSaveSettings]);

  const offsetSeconds = (status.offsetMs / 1000).toFixed(1);
  const offsetSign = status.offsetMs > 0 ? '+' : '';

  return (
    <div className="w-[380px] bg-white text-[#202124] flex flex-col" style={{ fontFamily: "'Google Sans', 'Roboto', sans-serif" }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between border-b border-[#DADCE0]">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #1A73E8 0%, #1557B0 100%)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[14px] font-semibold leading-tight text-[#202124]">
              myanSub
            </h1>
            <p className="text-[11px] text-[#5F6368] leading-tight">Myanmar subtitle overlay</p>
          </div>
        </div>

        {status.loaded ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: '#E6F4EA', color: '#1E8E3E' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E3E]" />
              {status.cueCount} cues
            </span>
            <button
              onClick={handleClear}
              title="Clear subtitles"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#5F6368] hover:bg-[#F1F3F4] hover:text-[#D93025] transition-colors md-ripple"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {/* Tab bar — MD3 style */}
      <div className="flex border-b border-[#DADCE0] bg-white">
        {(['search', 'upload'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(''); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-medium relative transition-colors md-ripple"
            style={{
              color: tab === t ? '#1A73E8' : '#5F6368',
              borderBottom: tab === t ? '2px solid #1A73E8' : '2px solid transparent',
            }}
          >
            {t === 'search' ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
                Search Online
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                </svg>
                Local File
              </>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3">
        {tab === 'search' && (
          <>
            {/* Movie / TV — MD3 Segmented button */}
            <div className="flex rounded-full border border-[#DADCE0] overflow-hidden h-9">
              <SegmentedBtn
                label="Movie"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                  </svg>
                }
                active={contentType === 'movie'}
                onClick={() => handleContentTypeChange('movie')}
              />
              <SegmentedBtn
                label="TV Show"
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/>
                  </svg>
                }
                active={contentType === 'tv'}
                onClick={() => handleContentTypeChange('tv')}
              />
            </div>

            {/* Search field — MD3 outlined text field */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={contentType === 'tv' ? 'TV show title…' : 'Movie title…'}
                  className="w-full h-10 px-3 text-[13px] text-[#202124] placeholder-[#9AA0A6] outline-none transition-all peer"
                  style={{
                    background: 'transparent',
                    border: '1.5px solid #DADCE0',
                    borderRadius: '8px',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#1A73E8')}
                  onBlur={e => (e.target.style.borderColor = '#DADCE0')}
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                className="h-10 px-4 rounded-lg text-[13px] font-medium transition-all flex items-center gap-1.5 shrink-0 md-ripple"
                style={{
                  background: loading || !query.trim() ? '#F1F3F4' : '#1A73E8',
                  color: loading || !query.trim() ? '#9AA0A6' : '#FFFFFF',
                  cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? <MdSpinner /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                )}
                Search
              </button>
            </div>

            {/* Detected title chip */}
            {detectedTitle ? (
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#1A73E8">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span className="text-[11px] text-[#1A73E8] truncate" title={detectedTitle}>
                  Detected: {detectedTitle}
                </span>
              </div>
            ) : null}

            {/* Season/Episode — TV only */}
            {contentType === 'tv' ? (
              <div className="flex gap-2">
                <MdInput
                  label="Season"
                  type="number"
                  min={1}
                  value={season}
                  onChange={e => setSeason(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10)))}
                  placeholder="1"
                />
                <MdInput
                  label="Episode"
                  type="number"
                  min={1}
                  value={episode}
                  onChange={e => setEpisode(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10)))}
                  placeholder="1"
                />
              </div>
            ) : null}

            {error ? <MdError message={error} onDismiss={() => setError('')} /> : null}

            {/* Recent subtitles */}
            {recentSubtitles.length > 0 && results.length === 0 ? (
              <div>
                <p className="text-[11px] font-medium text-[#5F6368] uppercase tracking-wider mb-2">Recent</p>
                <div className="space-y-1">
                  {recentSubtitles.map(r => {
                    const key = r.source === 'os' ? `os:${r.fileId}` : `subdl:${r.sdUrl}`;
                    return (
                      <MdResultCard
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
            ) : null}

            {/* Results */}
            {results.length > 0 ? (
              <div>
                <p className="text-[11px] font-medium text-[#5F6368] uppercase tracking-wider mb-2">
                  {results.length} result{results.length !== 1 ? 's' : ''} · Myanmar subtitles
                </p>
                <div className="space-y-1 max-h-[220px] overflow-y-auto -mr-1 pr-1">
                  {results.map(r => {
                    const key = r.source === 'os' ? `os:${r.fileId}` : `subdl:${r.sdUrl}`;
                    return (
                      <MdResultCard
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
            ) : null}

            {!loading && results.length === 0 && !error && recentSubtitles.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                     style={{ background: '#E8F0FE' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#1A73E8">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                </div>
                <p className="text-[13px] text-[#5F6368] font-medium">Search for subtitles</p>
                <p className="text-[11px] text-[#9AA0A6] mt-0.5">OpenSubtitles · SubDL</p>
              </div>
            ) : null}
          </>
        )}

        {tab === 'upload' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all"
              style={{
                borderColor: dragOver ? '#1A73E8' : uploadedFileName ? '#1E8E3E' : '#DADCE0',
                background: dragOver ? '#E8F0FE' : uploadedFileName ? '#E6F4EA' : '#F8F9FA',
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center"
                     style={{ background: uploadedFileName ? '#1E8E3E' : '#1A73E8', opacity: loading ? 0.6 : 1 }}>
                  {loading ? (
                    <MdSpinner white />
                  ) : uploadedFileName ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 15h8v2H8zm0-4h8v2H8zm0-4h5v2H8z"/>
                    </svg>
                  )}
                </div>
                {uploadedFileName ? (
                  <>
                    <p className="text-[13px] font-medium text-[#1E8E3E] truncate max-w-[200px]">{uploadedFileName}</p>
                    <p className="text-[11px] text-[#5F6368]">Click or drop to replace</p>
                  </>
                ) : (
                  <>
                    <p className="text-[13px] font-medium text-[#3C4043]">Drop subtitle file here</p>
                    <p className="text-[11px] text-[#5F6368]">.srt · .ass · .ssa &nbsp;·&nbsp; or click to browse</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".srt,.ass,.ssa"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {error ? <MdError message={error} onDismiss={() => setError('')} /> : null}
          </>
        )}
      </div>

      {/* Sync controls — shown when subtitles loaded */}
      {status.loaded ? (
        <div className="border-t border-[#DADCE0] px-4 py-3 bg-[#F8F9FA]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-[#5F6368] uppercase tracking-wider">Sync Offset</span>
            <span className="text-[12px] font-medium tabular-nums font-mono"
                  style={{ color: status.offsetMs === 0 ? '#9AA0A6' : status.offsetMs > 0 ? '#1A73E8' : '#E37400' }}>
              {offsetSign}{offsetSeconds}s
            </span>
          </div>
          <div className="flex gap-1">
            <SyncBtn label="−1s" onClick={() => handleOffset(-1000)} />
            <SyncBtn label="−0.5s" onClick={() => handleOffset(-500)} />
            <button
              onClick={() => handleOffset(-status.offsetMs)}
              disabled={status.offsetMs === 0}
              className="flex-1 text-[11px] font-medium py-1.5 rounded-lg transition-colors md-ripple disabled:opacity-40"
              style={{ background: '#E8EAED', color: '#3C4043' }}
            >
              Reset
            </button>
            <SyncBtn label="+0.5s" onClick={() => handleOffset(500)} />
            <SyncBtn label="+1s" onClick={() => handleOffset(1000)} />
          </div>
        </div>
      ) : null}

      {/* Settings — MD3 expansion panel */}
      <div className="border-t border-[#DADCE0]">
        <button
          onClick={() => setSettingsOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-[12px] font-medium text-[#5F6368] hover:bg-[#F1F3F4] transition-colors md-ripple"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
            Display settings
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
               style={{ transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}>
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </button>

        {settingsOpen ? (
          <div className="px-4 pb-4 pt-1 flex flex-col gap-4 bg-[#F8F9FA]">
            {/* Font size */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-[#3C4043]">Font size</span>
                <span className="text-[12px] font-medium text-[#1A73E8]">{fontSize}px</span>
              </div>
              <input
                type="range" min={16} max={40} step={2} value={fontSize}
                onChange={handleFontSizeChange}
                className="w-full"
                style={{ '--progress': `${((fontSize - 16) / 24) * 100}%` } as React.CSSProperties}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[#9AA0A6]">16px</span>
                <span className="text-[10px] text-[#9AA0A6]">40px</span>
              </div>
            </div>

            {/* Vertical position */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] text-[#3C4043]">Vertical position</span>
                <span className="text-[12px] font-medium text-[#1A73E8]">{bottomPct}% from bottom</span>
              </div>
              <input
                type="range" min={5} max={50} step={1} value={bottomPct}
                onChange={handleBottomPctChange}
                className="w-full"
                style={{ '--progress': `${((bottomPct - 5) / 45) * 100}%` } as React.CSSProperties}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[#9AA0A6]">Bottom</span>
                <span className="text-[10px] text-[#9AA0A6]">Center</span>
              </div>
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="rounded-lg p-3 flex gap-2.5" style={{ background: '#E8F0FE' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#1A73E8" className="shrink-0 mt-0.5">
                <path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
              </svg>
              <div className="text-[10px] text-[#1557B0] leading-relaxed">
                <p className="font-medium mb-0.5">Keyboard shortcuts</p>
                <p>Alt+← / Alt+→ · ±0.5s offset</p>
                <p>Alt+Shift+← / → · ±1s offset</p>
                <p>Alt+C · Clear subtitles</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#DADCE0] flex items-center justify-center gap-2">
        <a
          href="https://www.opensubtitles.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#9AA0A6] hover:text-[#1A73E8] transition-colors"
        >
          OpenSubtitles
        </a>
        <span className="text-[#DADCE0] text-[10px]">·</span>
        <a
          href="https://subdl.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[#9AA0A6] hover:text-[#1A73E8] transition-colors"
        >
          SubDL
        </a>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function SegmentedBtn({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 text-[12px] font-medium transition-all md-ripple"
      style={{
        background: active ? '#E8F0FE' : 'transparent',
        color: active ? '#1A73E8' : '#5F6368',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function MdInput({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex-1 flex flex-col gap-1">
      <label className="text-[10px] font-medium text-[#5F6368] uppercase tracking-wider">{label}</label>
      <input
        {...props}
        className="h-9 px-3 text-[13px] text-[#202124] placeholder-[#9AA0A6] outline-none rounded-lg transition-all"
        style={{ border: '1.5px solid #DADCE0' }}
        onFocus={e => (e.target.style.borderColor = '#1A73E8')}
        onBlur={e => (e.target.style.borderColor = '#DADCE0')}
      />
    </div>
  );
}

function MdError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg p-3" style={{ background: '#FCE8E6' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#D93025" className="shrink-0 mt-px">
        <path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
      </svg>
      <p className="text-[12px] text-[#D93025] flex-1 leading-relaxed">{message}</p>
      <button onClick={onDismiss} className="text-[#D93025] hover:opacity-70 transition-opacity shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </div>
  );
}

function MdResultCard({
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
    ? { label: 'SubDL', bg: '#E8F0FE', color: '#1A73E8' }
    : { label: 'OS', bg: '#FEF7E0', color: '#B06000' };

  return (
    <button
      onClick={onSelect}
      disabled={loading}
      className="w-full text-left px-3 py-2.5 rounded-lg border transition-all md-ripple disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: selected ? '#E8F0FE' : '#FFFFFF',
        borderColor: selected ? '#1A73E8' : '#DADCE0',
        boxShadow: selected ? 'none' : '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[13px] font-medium text-[#202124] leading-snug">
          {result.featureTitle}
        </span>
        <div className="flex items-center gap-1 shrink-0 mt-px">
          {result.year ? (
            <span className="text-[10px] text-[#5F6368] font-mono">{result.year}</span>
          ) : null}
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ background: sourceBadge.bg, color: sourceBadge.color }}>
            {sourceBadge.label}
          </span>
          {selected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1A73E8">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {result.releaseName ? (
          <p className="text-[10px] text-[#9AA0A6] truncate flex-1">{result.releaseName}</p>
        ) : <span className="flex-1" />}
        {result.uploaderName ? (
          <span className="text-[10px] text-[#5F6368] shrink-0 flex items-center gap-0.5">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
            {result.uploaderName}
          </span>
        ) : null}
        {result.downloadCount > 0 ? (
          <span className="text-[10px] text-[#9AA0A6] shrink-0">↓ {result.downloadCount.toLocaleString()}</span>
        ) : null}
      </div>
    </button>
  );
}

function SyncBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium font-mono text-[#3C4043] transition-colors md-ripple"
      style={{ background: '#E8EAED' }}
    >
      {label}
    </button>
  );
}

function MdSpinner({ white }: { white?: boolean }) {
  return (
    <svg
      className="animate-spin"
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      style={{ color: white ? 'white' : '#1A73E8' }}
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
