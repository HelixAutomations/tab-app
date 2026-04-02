import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiPhone, FiPhoneIncoming, FiPhoneOutgoing, FiFileText, FiClock, FiCheck, FiLink, FiX, FiRefreshCw, FiChevronRight, FiEdit3, FiSave, FiUploadCloud, FiSearch } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import { isDevOwner } from '../../app/admin';

// ── Types ────────────────────────────────────────────────────────────────────
interface CallRecord {
  recording_id: string;
  from_party: string | null;
  from_label: string | null;
  to_party: string | null;
  to_label: string | null;
  call_type: string | null;
  duration_seconds: number | null;
  start_time_utc: string;
  document_sentiment_score: number | null;
  ai_document_sentiment: string | null;
  matched_team_initials: string | null;
  is_internal?: boolean;
  resolved_name?: string;
  resolved_source?: string;
  resolved_ref?: string | null;
  resolved_area?: string | null;
}

interface ClioActivity {
  id: number;
  date: string;
  quantity_in_hours: number;
  total: number;
  type: string;
  note: string | null;
  matter?: { id?: number; display_number?: string; description?: string } | null;
  activity_description?: { name?: string } | null;
  user?: { id?: number; name?: string } | null;
}

interface TranscriptSentence {
  sentence_index: number;
  speaker: string;
  content: string;
  sentiment: number | null;
}

interface TranscriptData {
  sentences: TranscriptSentence[];
  summaries: { summary_source: string; summary_type: string; summary_text: string }[];
  recording: {
    document_sentiment_score: number | null;
    document_emotion_json: string | null;
  } | null;
}

interface AttendanceNote {
  summary: string;
  topics: string[];
  actionItems: string[];
  attendanceNote: string;
  duration: number;
  date: string;
  parties: { from: string; to: string };
  teamMember: string | null;
}

interface MatterOption {
  key: string;
  displayNumber: string;
  clientName: string;
  description: string;
}

interface NotePipelineState {
  saving: boolean;
  saved: boolean;
  blobUrl: string | null;
  uploading: boolean;
  uploaded: boolean;
  ndResult: { fileName?: string; uploadedTo?: string } | null;
  linkedMatterRef: string | null;
  matterChainLoading: boolean;
  matterChainRef: string | null;
}

interface CallsAndNotesProps {
  isDarkMode: boolean;
  userInitials: string;
  userEmail?: string;
  isNarrow?: boolean;
  isActive?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDuration(secs: number | null): string {
  if (!secs || secs <= 0) return '0s';
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function externalPartyName(call: CallRecord): string {
  const isInbound = call.call_type === 'inbound';
  const label = isInbound ? call.from_label : call.to_label;
  const party = isInbound ? call.from_party : call.to_party;
  // Prefer resolved name over phone-number labels
  if (call.resolved_name) return call.resolved_name;
  return label || party || 'Unknown';
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CallsAndNotes({ isDarkMode, userInitials, userEmail, isNarrow, isActive = true }: CallsAndNotesProps) {
  const showAll = isDevOwner({ Initials: userInitials, Email: userEmail || '' } as any);
  // Shared tokens — match OperationsDashboard
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const cardShadow = isDarkMode ? '0 1px 3px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.05)';
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const hoverBg = isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(13,47,96,0.03)';
  const tabActiveBg = isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(13,47,96,0.015)';

  // ── State ──
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [activities, setActivities] = useState<ClioActivity[]>([]);
  const [isLoadingCalls, setIsLoadingCalls] = useState(false);
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [callTab, setCallTab] = useState<'external' | 'internal'>('external');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [generatingNoteFor, setGeneratingNoteFor] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState<AttendanceNote | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<Record<string, TranscriptData>>({});
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const callsLoadedKeyRef = useRef<string | null>(null);
  const activitiesLoadedKeyRef = useRef<string | null>(null);
  const activitiesScheduledKeyRef = useRef<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);

  // ── Note pipeline state ──
  const [pipeline, setPipeline] = useState<NotePipelineState>({
    saving: false, saved: false, blobUrl: null,
    uploading: false, uploaded: false, ndResult: null,
    linkedMatterRef: null, matterChainLoading: false, matterChainRef: null,
  });
  const [matterSearch, setMatterSearch] = useState('');
  const [matterOptions, setMatterOptions] = useState<MatterOption[]>([]);
  const [matterDropdownOpen, setMatterDropdownOpen] = useState(false);
  const [matterSearchLoading, setMatterSearchLoading] = useState(false);
  const matterPickerRef = useRef<HTMLDivElement>(null);

  // Close matter dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (matterPickerRef.current && !matterPickerRef.current.contains(e.target as Node)) setMatterDropdownOpen(false);
    };
    if (matterDropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [matterDropdownOpen]);

  useEffect(() => {
    callsLoadedKeyRef.current = null;
    activitiesLoadedKeyRef.current = null;
    activitiesScheduledKeyRef.current = null;
    setCalls([]);
    setActivities([]);
    setIsLoadingCalls(false);
    setIsLoadingActivities(false);
    setSelectedCallId(null);
    setGeneratedNote(null);
  }, [userInitials, userEmail, showAll]);

  useEffect(() => {
    if (!isActive) {
      setPanelVisible(false);
      return;
    }

    const node = rootRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setPanelVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPanelVisible(true);
          observer.disconnect();
        }
      },
      {
        root: null,
        threshold: 0.15,
        rootMargin: '200px 0px',
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [isActive]);

  const panelActivated = isActive && panelVisible;
  const callsFetchKey = `${userInitials}:${userEmail || ''}`;
  const activitiesFetchKey = `${userInitials}:${showAll ? 'all' : 'user'}`;
  const callsPendingActivation = panelActivated && callsLoadedKeyRef.current !== callsFetchKey && !isLoadingCalls && calls.length === 0;

  // ── Fetch calls ──
  const fetchCalls = useCallback(async () => {
    try {
      setIsLoadingCalls(true);
      const res = await fetch(`/api/dubberCalls?teamInitials=${encodeURIComponent(userInitials)}&limit=50`);
      if (res?.ok) {
        const data = await res.json();
        setCalls(data.recordings || []);
      }
    } catch { /* silent */ }
    finally { setIsLoadingCalls(false); }
  }, [userInitials]);

  // ── Fetch recent Clio activities ──
  const fetchActivities = useCallback(async () => {
    try {
      setIsLoadingActivities(true);
      const res = await fetch(`/api/dubberCalls/activities?initials=${encodeURIComponent(userInitials)}${showAll ? '&all=true' : ''}`);
      if (res?.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch { /* silent */ }
    finally { setIsLoadingActivities(false); }
  }, [userInitials, showAll]);

  useEffect(() => {
    if (!panelActivated) return;
    if (callsLoadedKeyRef.current === callsFetchKey) return;
    callsLoadedKeyRef.current = callsFetchKey;
    void fetchCalls();
  }, [panelActivated, fetchCalls, callsFetchKey]);

  useEffect(() => {
    if (!panelActivated) return;
    if (activitiesLoadedKeyRef.current === activitiesFetchKey || activitiesScheduledKeyRef.current === activitiesFetchKey) return;
    activitiesScheduledKeyRef.current = activitiesFetchKey;
    setIsLoadingActivities(true);

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    const run = () => {
      if (disposed) return;
      activitiesScheduledKeyRef.current = null;
      activitiesLoadedKeyRef.current = activitiesFetchKey;
      void fetchActivities();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as typeof window & {
        requestIdleCallback: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => run(), { timeout: 1500 });
    } else {
      timeoutId = setTimeout(run, 1200);
    }

    return () => {
      disposed = true;
      if (activitiesScheduledKeyRef.current === activitiesFetchKey) {
        activitiesScheduledKeyRef.current = null;
        setIsLoadingActivities(false);
      }
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as typeof window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }, [panelActivated, fetchActivities, activitiesFetchKey]);

  // ── Generate attendance note ──
  const generateNote = useCallback(async (recordingId: string) => {
    setGeneratingNoteFor(recordingId);
    setGeneratedNote(null);
    setPipeline({ saving: false, saved: false, blobUrl: null, uploading: false, uploaded: false, ndResult: null, linkedMatterRef: null, matterChainLoading: true, matterChainRef: null });
    setMatterSearch('');
    try {
      const [noteRes, chainRes] = await Promise.all([
        fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/attendance-note`, { method: 'POST' }),
        fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/matter-chain`).catch(() => null),
      ]);
      if (noteRes?.ok) {
        const data = await noteRes.json();
        setGeneratedNote(data.note || null);
      }
      if (chainRes?.ok) {
        const chainData = await chainRes.json();
        const instrRef = chainData?.chain?.instruction?.ref;
        if (instrRef) {
          setPipeline(prev => ({ ...prev, matterChainRef: instrRef, linkedMatterRef: instrRef, matterChainLoading: false }));
          setMatterSearch(instrRef);
        } else {
          setPipeline(prev => ({ ...prev, matterChainLoading: false }));
        }
      } else {
        setPipeline(prev => ({ ...prev, matterChainLoading: false }));
      }
    } catch { /* silent */ }
    finally { setGeneratingNoteFor(null); }
  }, []);

  // ── Search matters for picker ──
  const searchMatters = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setMatterOptions([]); return; }
    setMatterSearchLoading(true);
    try {
      const res = await fetch(`/api/matters-unified?search=${encodeURIComponent(q)}&limit=20`);
      if (res?.ok) {
        const data = await res.json();
        const matters = (data.matters || data || []).slice(0, 20);
        setMatterOptions(matters.map((m: any) => ({
          key: m.displayNumber || m.display_number || m.matterId || '',
          displayNumber: m.displayNumber || m.display_number || '',
          clientName: m.clientName || m.client_name || '',
          description: m.description || '',
        })));
      }
    } catch { /* silent */ }
    finally { setMatterSearchLoading(false); }
  }, []);

  // Debounced matter search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMatterSearchChange = useCallback((val: string) => {
    setMatterSearch(val);
    setPipeline(prev => ({ ...prev, linkedMatterRef: val || prev.linkedMatterRef }));
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchMatters(val), 300);
  }, [searchMatters]);

  // ── Save note to Azure Storage ──
  const saveNote = useCallback(async (recordingId: string) => {
    if (!generatedNote) return;
    setPipeline(prev => ({ ...prev, saving: true }));
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/save-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-initials': userInitials },
        body: JSON.stringify({ note: generatedNote, matterRef: pipeline.linkedMatterRef }),
      });
      if (res?.ok) {
        const data = await res.json();
        setPipeline(prev => ({ ...prev, saving: false, saved: true, blobUrl: data.blobUrl }));
      } else {
        setPipeline(prev => ({ ...prev, saving: false }));
      }
    } catch {
      setPipeline(prev => ({ ...prev, saving: false }));
    }
  }, [generatedNote, userInitials, pipeline.linkedMatterRef]);

  // ── Upload note to NetDocuments ──
  const uploadToND = useCallback(async (recordingId: string) => {
    if (!generatedNote || !pipeline.linkedMatterRef) return;
    setPipeline(prev => ({ ...prev, uploading: true }));
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/upload-note-nd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: generatedNote, matterRef: pipeline.linkedMatterRef }),
      });
      if (res?.ok) {
        const data = await res.json();
        setPipeline(prev => ({ ...prev, uploading: false, uploaded: true, ndResult: { fileName: data.fileName, uploadedTo: data.uploadedTo } }));
      } else {
        setPipeline(prev => ({ ...prev, uploading: false }));
      }
    } catch {
      setPipeline(prev => ({ ...prev, uploading: false }));
    }
  }, [generatedNote, pipeline.linkedMatterRef]);

  // ── Fetch transcript on demand ──
  const fetchTranscript = useCallback(async (recordingId: string) => {
    if (transcriptCache[recordingId]) return;
    setLoadingTranscript(recordingId);
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/transcript`);
      if (res?.ok) {
        const data = await res.json();
        setTranscriptCache(prev => ({ ...prev, [recordingId]: data }));
      }
    } catch { /* silent */ }
    finally { setLoadingTranscript(null); }
  }, [transcriptCache]);

  // ── Confirm resolved name ──
  const confirmName = useCallback(async (call: CallRecord) => {
    if (!call.resolved_name) return;
    const isInbound = call.call_type === 'inbound';
    const field = isInbound ? 'from_label' : 'to_label';
    setConfirming(call.recording_id);
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(call.recording_id)}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: call.resolved_name, field }),
      });
      if (res?.ok) {
        setCalls(prev => prev.map(c =>
          c.recording_id === call.recording_id
            ? { ...c, [field]: call.resolved_name, resolved_name: undefined, resolved_source: undefined }
            : c
        ));
      }
    } catch { /* silent */ }
    finally { setConfirming(null); }
  }, []);

  // ── Filtered calls ──
  const externalCalls = calls.filter(c => !c.is_internal);
  const internalCalls = calls.filter(c => c.is_internal);
  const displayCalls = callTab === 'external' ? externalCalls : internalCalls;
  const selectedCall = calls.find(c => c.recording_id === selectedCallId) || null;

  // ── Render ──
  return (
    <div ref={rootRef} style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 2fr', gap: 6 }}>

      {/* ── LEFT: Attendance Notes & Time Entries ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '2px 0 3px', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FiFileText size={10} style={{ color: accent, flexShrink: 0 }} />
          Attendance Notes
        </div>
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', minHeight: 180 }}>

          {/* Generated note preview */}
          {generatedNote ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, animation: 'opsDashFadeIn 0.25s ease both' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: accent, letterSpacing: '0.3px' }}>AI ATTENDANCE NOTE</span>
                <button
                  onClick={() => setGeneratedNote(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 2 }}
                >
                  <FiX size={12} />
                </button>
              </div>
              <div style={{ fontSize: 9, color: muted, display: 'flex', gap: 8 }}>
                <span>{generatedNote.date}</span>
                <span>{generatedNote.duration}m</span>
                <span>{generatedNote.parties.from} → {generatedNote.parties.to}</span>
              </div>
              <div style={{ fontSize: 11, color: text, lineHeight: 1.5 }}>
                {generatedNote.summary}
              </div>
              {generatedNote.topics.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {generatedNote.topics.map((t, i) => (
                    <span key={i} style={{ fontSize: 9, padding: '2px 6px', background: isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(13,47,96,0.05)', color: accent, fontWeight: 500 }}>{t}</span>
                  ))}
                </div>
              )}
              {generatedNote.actionItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.3px' }}>ACTION ITEMS</span>
                  {generatedNote.actionItems.map((a, i) => (
                    <div key={i} style={{ fontSize: 10, color: text, paddingLeft: 8, borderLeft: `2px solid ${accent}` }}>{a}</div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.5, padding: '6px 8px', background: isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                {generatedNote.attendanceNote}
              </div>

              {/* ── Matter Picker ── */}
              <div ref={matterPickerRef} style={{ position: 'relative' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.3px', marginBottom: 3 }}>LINK TO MATTER</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <FiSearch size={10} style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: muted }} />
                    <input
                      type="text"
                      value={matterSearch}
                      onChange={e => { handleMatterSearchChange(e.target.value); setMatterDropdownOpen(true); }}
                      onFocus={() => { if (matterSearch.length >= 2) setMatterDropdownOpen(true); }}
                      placeholder={pipeline.matterChainLoading ? 'Resolving…' : 'Search matter ref or client…'}
                      style={{
                        width: '100%', padding: '4px 8px 4px 22px', fontSize: 10,
                        background: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${pipeline.linkedMatterRef ? (isDarkMode ? 'rgba(32,178,108,0.3)' : 'rgba(32,178,108,0.2)') : cardBorder}`,
                        color: text, outline: 'none', fontFamily: 'Raleway, sans-serif',
                      }}
                    />
                    {pipeline.matterChainRef && (
                      <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 8, color: colours.green }}>
                        auto-linked
                      </span>
                    )}
                  </div>
                </div>
                {/* Matter dropdown */}
                {matterDropdownOpen && matterOptions.length > 0 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20,
                    background: isDarkMode ? '#081c30' : '#fff',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)'}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: 160, overflow: 'auto',
                  }}>
                    {matterOptions.map((opt) => (
                      <div
                        key={opt.key}
                        onClick={() => {
                          setMatterSearch(opt.displayNumber || opt.key);
                          setPipeline(prev => ({ ...prev, linkedMatterRef: opt.displayNumber || opt.key }));
                          setMatterDropdownOpen(false);
                        }}
                        style={{
                          padding: '5px 8px', cursor: 'pointer', fontSize: 10, color: text,
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ fontWeight: 600, color: accent }}>{opt.displayNumber}</span>
                        {opt.clientName && <span style={{ marginLeft: 6, color: muted }}>{opt.clientName}</span>}
                        {opt.description && <div style={{ fontSize: 9, color: muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.description}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {matterSearchLoading && (
                  <div style={{ fontSize: 9, color: muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <FiRefreshCw size={8} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Searching…
                  </div>
                )}
              </div>

              {/* ── Pipeline Actions ── */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                {/* Save to storage */}
                <button
                  onClick={() => selectedCallId && saveNote(selectedCallId)}
                  disabled={pipeline.saving || pipeline.saved}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    fontSize: 9, fontWeight: 600,
                    background: pipeline.saved
                      ? (isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.06)')
                      : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)'),
                    border: `1px solid ${pipeline.saved
                      ? (isDarkMode ? 'rgba(32,178,108,0.3)' : 'rgba(32,178,108,0.15)')
                      : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)')}`,
                    color: pipeline.saved ? colours.green : accent,
                    cursor: pipeline.saving || pipeline.saved ? 'default' : 'pointer',
                    opacity: pipeline.saving ? 0.5 : 1,
                  }}
                >
                  {pipeline.saving ? (
                    <><FiRefreshCw size={10} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Saving…</>
                  ) : pipeline.saved ? (
                    <><FiCheck size={10} /> Saved</>
                  ) : (
                    <><FiSave size={10} /> Save note</>
                  )}
                </button>

                {/* Upload to ND */}
                <button
                  onClick={() => selectedCallId && uploadToND(selectedCallId)}
                  disabled={pipeline.uploading || pipeline.uploaded || !pipeline.linkedMatterRef}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    fontSize: 9, fontWeight: 600,
                    background: pipeline.uploaded
                      ? (isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.06)')
                      : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)'),
                    border: `1px solid ${pipeline.uploaded
                      ? (isDarkMode ? 'rgba(32,178,108,0.3)' : 'rgba(32,178,108,0.15)')
                      : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)')}`,
                    color: pipeline.uploaded ? colours.green : (!pipeline.linkedMatterRef ? muted : accent),
                    cursor: pipeline.uploading || pipeline.uploaded || !pipeline.linkedMatterRef ? 'default' : 'pointer',
                    opacity: pipeline.uploading || !pipeline.linkedMatterRef ? 0.5 : 1,
                  }}
                >
                  {pipeline.uploading ? (
                    <><FiRefreshCw size={10} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Uploading…</>
                  ) : pipeline.uploaded ? (
                    <><FiCheck size={10} /> Filed</>
                  ) : (
                    <><FiUploadCloud size={10} /> Upload to ND</>
                  )}
                </button>
              </div>

              {/* Upload result */}
              {pipeline.ndResult && (
                <div style={{ fontSize: 9, color: colours.green, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <FiCheck size={9} />
                  <span>{pipeline.ndResult.fileName} → {pipeline.ndResult.uploadedTo}</span>
                </div>
              )}
            </div>
          ) : (
            /* Recent time entries */
            <div style={{ flex: 1 }}>
              {!panelActivated ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                  <FiClock size={12} style={{ color: muted, opacity: 0.45 }} />
                  <span style={{ fontSize: 10, color: muted }}>Loads when visible</span>
                </div>
                ) : isLoadingActivities ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                  <FiRefreshCw size={12} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite' }} />
                  <span style={{ fontSize: 10, color: muted }}>Loading time entries…</span>
                </div>
              ) : activities.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 4 }}>
                  <FiClock size={16} style={{ color: muted, opacity: 0.4 }} />
                  <span style={{ fontSize: 10, color: muted }}>No time entries this week</span>
                </div>
              ) : (
                <div className="ops-dash-scroll" style={{ maxHeight: 280, overflow: 'auto' }}>
                  {/* Column headers */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '60px 1fr 50px 50px',
                    padding: '5px 8px 4px', fontSize: 8, fontWeight: 600, color: muted,
                    letterSpacing: '0.4px', borderBottom: `1px solid ${cardBorder}`,
                    background: tabActiveBg,
                  }}>
                    <span>DATE</span>
                    <span>MATTER</span>
                    <span style={{ textAlign: 'right' }}>HRS</span>
                    <span style={{ textAlign: 'right' }}>VALUE</span>
                  </div>
                  {activities.slice(0, 30).map((act, i) => {
                    const dateParts = act.date?.split('-');
                    const shortDate = dateParts ? `${dateParts[2]}/${dateParts[1]}` : '';
                    return (
                      <div
                        key={act.id}
                        style={{
                          display: 'grid', gridTemplateColumns: showAll ? '60px 40px 1fr 50px 50px' : '60px 1fr 50px 50px',
                          padding: '5px 8px', fontSize: 10, color: text,
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                          animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both`,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = hoverBg; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ color: muted, fontSize: 9 }}>{shortDate}</span>
                        {showAll && <span style={{ color: accent, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.user?.name?.split(' ')[0] || '—'}</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {act.matter?.display_number || act.activity_description?.name || act.type || '—'}
                        </span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {typeof act.quantity_in_hours === 'number' ? act.quantity_in_hours.toFixed(1) : '—'}
                        </span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: muted }}>
                          {typeof act.total === 'number' ? `£${act.total.toFixed(0)}` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Call Log ── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '2px 0 3px', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <FiPhone size={10} style={{ color: accent, flexShrink: 0 }} />
          Calls
        </div>
        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 180 }}>

          {/* Tabs: External / Internal */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${cardBorder}` }}>
            {(['external', 'internal'] as const).map((tab, tabIdx) => (
              <div
                key={tab}
                onClick={() => { setCallTab(tab); setSelectedCallId(null); setGeneratedNote(null); }}
                style={{
                  padding: '10px 14px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
                  color: callTab === tab ? accent : muted,
                  borderBottom: callTab === tab ? `2px solid ${accent}` : '2px solid transparent',
                  cursor: 'pointer', userSelect: 'none', textAlign: 'center',
                  background: callTab === tab ? tabActiveBg : 'transparent',
                  transition: 'color 0.2s ease, background 0.2s ease, border-color 0.2s ease',
                }}
              >
                {tab === 'external' ? 'External' : 'Internal'}
                <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.6 }}>
                  {tab === 'external' ? externalCalls.length : internalCalls.length}
                </span>
              </div>
            ))}
          </div>

          {/* Call list */}
          <div ref={scrollRef} className="ops-dash-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', maxHeight: 280 }}>
            {!panelActivated ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                <FiPhone size={12} style={{ color: muted, opacity: 0.45 }} />
                <span style={{ fontSize: 10, color: muted }}>Loads when visible</span>
              </div>
            ) : (isLoadingCalls || callsPendingActivation) ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                <FiRefreshCw size={12} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite' }} />
                <span style={{ fontSize: 10, color: muted }}>Loading calls…</span>
              </div>
            ) : displayCalls.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 4 }}>
                <FiPhone size={16} style={{ color: muted, opacity: 0.4 }} />
                <span style={{ fontSize: 10, color: muted }}>No {callTab} calls</span>
              </div>
            ) : (
              <>
                {/* Column headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '18px 50px 1fr 50px 40px',
                  padding: '5px 8px 4px', fontSize: 8, fontWeight: 600, color: muted,
                  letterSpacing: '0.4px', borderBottom: `1px solid ${cardBorder}`,
                  background: tabActiveBg,
                }}>
                  <span />
                  <span>TIME</span>
                  <span>PARTY</span>
                  <span style={{ textAlign: 'right' }}>DUR</span>
                  <span />
                </div>
                {displayCalls.map((call, i) => {
                  const isInbound = call.call_type === 'inbound';
                  const partyName = externalPartyName(call);
                  const isSelected = selectedCallId === call.recording_id;
                  const hasResolvedSuggestion = !!call.resolved_name;
                  const isConfirming = confirming === call.recording_id;

                  return (
                    <React.Fragment key={call.recording_id}>
                      <div
                        onClick={() => {
                          const nextId = isSelected ? null : call.recording_id;
                          setSelectedCallId(nextId);
                          setGeneratedNote(null);
                          if (nextId) fetchTranscript(call.recording_id);
                        }}
                        style={{
                          display: 'grid', gridTemplateColumns: '18px 50px 1fr 50px 40px',
                          padding: '5px 8px', fontSize: 10, color: text, cursor: 'pointer',
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                          background: isSelected ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.04)') : 'transparent',
                          transition: 'background 0.15s ease',
                          animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both`,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = hoverBg; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {/* Direction icon */}
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          {isInbound
                            ? <FiPhoneIncoming size={10} style={{ color: colours.green }} />
                            : <FiPhoneOutgoing size={10} style={{ color: accent }} />
                          }
                        </span>

                        {/* Time */}
                        <span style={{ fontSize: 9, color: muted }}>
                          {formatTime(call.start_time_utc)}
                        </span>

                        {/* Party name */}
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontStyle: hasResolvedSuggestion ? 'italic' : 'normal',
                          color: hasResolvedSuggestion ? accent : text,
                        }}>
                          {partyName}
                          {hasResolvedSuggestion && (
                            <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.5 }}>({call.resolved_source})</span>
                          )}
                        </span>

                        {/* Duration */}
                        <span style={{ textAlign: 'right', fontSize: 9, color: muted, fontVariantNumeric: 'tabular-nums' }}>
                          {formatDuration(call.duration_seconds)}
                        </span>

                        {/* Action hints */}
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          {hasResolvedSuggestion && !isConfirming && (
                            <button
                              onClick={e => { e.stopPropagation(); confirmName(call); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: colours.green, padding: 1, display: 'flex' }}
                              title="Confirm name"
                            >
                              <FiCheck size={10} />
                            </button>
                          )}
                          {isConfirming && <FiRefreshCw size={10} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite' }} />}
                          {isSelected && <FiChevronRight size={10} style={{ color: accent, transform: 'rotate(90deg)' }} />}
                        </span>
                      </div>

                      {/* Expanded detail */}
                      {isSelected && (
                        <div style={{
                          padding: '6px 12px 10px', borderBottom: `1px solid ${cardBorder}`,
                          background: isDarkMode ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.015)',
                          animation: 'opsDashRowFade 0.15s ease both',
                        }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 9, color: muted }}>{formatDate(call.start_time_utc)} · {formatTime(call.start_time_utc)}</span>
                            <span style={{ fontSize: 9, color: muted }}>{formatDuration(call.duration_seconds)}</span>
                            {call.matched_team_initials && (
                              <span style={{ fontSize: 9, fontWeight: 600, color: accent }}>{call.matched_team_initials}</span>
                            )}
                          </div>
                          {/* Pipeline match info */}
                          {call.resolved_ref && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: text, marginBottom: 6 }}>
                              <FiLink size={9} style={{ color: accent }} />
                              <span>{call.resolved_ref}</span>
                              {call.resolved_area && <span style={{ color: muted }}>· {call.resolved_area}</span>}
                            </div>
                          )}
                          {/* Transcript */}
                          {(() => {
                            const td = transcriptCache[call.recording_id];
                            const isLoading = loadingTranscript === call.recording_id;
                            if (isLoading) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 6px', fontSize: 9, color: muted }}>
                                  <FiRefreshCw size={9} style={{ animation: 'opsDashSpin 1s linear infinite' }} />
                                  Loading transcript…
                                </div>
                              );
                            }
                            if (!td || td.sentences.length === 0) return null;

                            // Show AI summary if available
                            const aiSummary = td.summaries?.find(s => s.summary_type === 'ai');

                            return (
                              <div style={{ marginBottom: 6 }}>
                                {/* AI Summary */}
                                {aiSummary && (
                                  <div style={{
                                    padding: '5px 8px', marginBottom: 5, fontSize: 9, lineHeight: 1.5,
                                    color: isDarkMode ? '#d1d5db' : '#374151',
                                    background: isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(13,47,96,0.03)',
                                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)'}`,
                                  }}>
                                    <div style={{ fontSize: 8, fontWeight: 700, color: accent, letterSpacing: '0.4px', marginBottom: 3 }}>AI SUMMARY</div>
                                    {aiSummary.summary_text}
                                  </div>
                                )}

                                {/* Transcript sentences */}
                                <div style={{ fontSize: 8, fontWeight: 700, color: muted, letterSpacing: '0.4px', marginBottom: 3 }}>
                                  TRANSCRIPT · {td.sentences.length} sentences
                                </div>
                                <div style={{
                                  maxHeight: 160, overflowY: 'auto', padding: '4px 6px',
                                  background: isDarkMode ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.02)',
                                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                                }}>
                                  {td.sentences.map((s, si) => (
                                    <div key={si} style={{
                                      fontSize: 9, lineHeight: 1.5, padding: '1px 0',
                                      color: isDarkMode ? '#d1d5db' : '#374151',
                                    }}>
                                      <span style={{ color: muted, fontSize: 8, marginRight: 4, fontVariantNumeric: 'tabular-nums' }}>{si + 1}.</span>
                                      {s.content}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Generate attendance note button */}
                          <button
                            onClick={() => generateNote(call.recording_id)}
                            disabled={!!generatingNoteFor}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                              fontSize: 9, fontWeight: 600,
                              background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)',
                              border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)'}`,
                              color: accent, cursor: generatingNoteFor ? 'wait' : 'pointer',
                              opacity: generatingNoteFor ? 0.5 : 1,
                              transition: 'opacity 0.15s ease',
                            }}
                          >
                            {generatingNoteFor === call.recording_id ? (
                              <><FiRefreshCw size={10} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Generating…</>
                            ) : (
                              <><FiEdit3 size={10} /> Generate attendance note</>
                            )}
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
