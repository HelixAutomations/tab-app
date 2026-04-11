import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiPhone, FiPhoneIncoming, FiPhoneOutgoing, FiFileText, FiClock, FiCheck, FiLink, FiX, FiRefreshCw, FiChevronRight, FiEdit3, FiSave, FiUploadCloud, FiSearch, FiMail } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import { isDevOwner } from '../../app/admin';
import clioLogo from '../../assets/clio.svg';

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
  created_at?: string | null;
  updated_at?: string | null;
  event_timestamp?: string | null;
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

interface SavedNote {
  id: number;
  recording_id: string;
  matter_ref: string | null;
  call_date: string | null;
  summary: string | null;
  topics: string | null;
  action_items: string | null;
  saved_by: string | null;
  saved_at: string;
  uploaded_nd: boolean;
  nd_file_name: string | null;
}

interface EmailJourneyEvent {
  eventId: string;
  sentAt: string;
  senderEmail: string;
  senderInitials?: string | null;
  recipientSummary: string;
  toRecipients: string[];
  ccRecipients: string[];
  bccRecipients: string[];
  subject?: string | null;
  source?: string | null;
  contextLabel?: string | null;
  enquiryRef?: string | null;
  instructionRef?: string | null;
  matterRef?: string | null;
  graphRequestId?: string | null;
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
  demoModeEnabled?: boolean;
  isActive?: boolean;
}

type JourneyFilter = 'all' | 'external' | 'internal' | 'notes' | 'activity' | 'emails';

type JourneyItem =
  | { key: string; kind: 'call'; timestamp: number; call: CallRecord }
  | { key: string; kind: 'note'; timestamp: number; note: SavedNote; linkedCall: CallRecord | null }
  | { key: string; kind: 'activity'; timestamp: number; activity: ClioActivity }
  | { key: string; kind: 'email'; timestamp: number; email: EmailJourneyEvent };

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

function hasExplicitTime(raw?: string | null): boolean {
  const value = String(raw || '').trim();
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return /\d{1,2}:\d{2}/.test(value);
}

function parseJourneyTimestamp(raw?: string | null): number {
  const value = String(raw || '').trim();
  if (!value) return 0;
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const timestamp = new Date(source).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatJourneyStamp(raw?: string | null): { primary: string; secondary?: string } {
  const value = String(raw || '').trim();
  if (!value) return { primary: '—' };
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const dateLabel = formatDate(source);
  if (!hasExplicitTime(value)) {
    return { primary: dateLabel };
  }
  return {
    primary: formatTime(source),
    secondary: dateLabel,
  };
}

function formatMoneyValue(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function formatCompactDateTime(raw?: string | null): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return null;
  const dateLabel = formatDate(source);
  if (!hasExplicitTime(value)) return dateLabel;
  return `${dateLabel} ${formatTime(source)}`;
}

function normaliseJourneyItem(raw: any): JourneyItem | null {
  if (!raw || !raw.type || !raw.key) return null;
  if (raw.type === 'call' && raw.call) {
    return {
      key: String(raw.key),
      kind: 'call',
      timestamp: parseJourneyTimestamp(raw.timestamp || raw.call.start_time_utc),
      call: raw.call,
    };
  }
  if (raw.type === 'attendance-note' && raw.note) {
    return {
      key: String(raw.key),
      kind: 'note',
      timestamp: parseJourneyTimestamp(raw.timestamp || raw.note.saved_at),
      note: raw.note,
      linkedCall: raw.linkedCall || null,
    };
  }
  if (raw.type === 'clio-activity' && raw.activity) {
    return {
      key: String(raw.key),
      kind: 'activity',
      timestamp: parseJourneyTimestamp(raw.timestamp || raw.activity.date),
      activity: raw.activity,
    };
  }
  if (raw.type === 'email-sent' && raw.email) {
    return {
      key: String(raw.key),
      kind: 'email',
      timestamp: parseJourneyTimestamp(raw.timestamp || raw.email.sentAt),
      email: raw.email,
    };
  }
  return null;
}

const JOURNEY_KIND_PRIORITY: Record<JourneyItem['kind'], number> = {
  call: 0,
  note: 1,
  email: 2,
  activity: 3,
};

function compareJourneyItems(left: JourneyItem, right: JourneyItem): number {
  const timestampDelta = right.timestamp - left.timestamp;
  if (timestampDelta !== 0) return timestampDelta;

  const kindDelta = JOURNEY_KIND_PRIORITY[left.kind] - JOURNEY_KIND_PRIORITY[right.kind];
  if (kindDelta !== 0) return kindDelta;

  return left.key.localeCompare(right.key);
}

function mergeJourneyItems(existing: JourneyItem[], incoming: JourneyItem[]): JourneyItem[] {
  const next = new Map(existing.map((item) => [item.key, item]));
  for (const item of incoming) next.set(item.key, item);
  return [...next.values()].sort(compareJourneyItems);
}

const DEMO_JOURNEY_CALL_ID = 'demo-journey-call';
const DEMO_JOURNEY_INTERNAL_CALL_ID = 'demo-journey-internal-call';

function buildDemoJourneySeed(userInitials: string, userEmail?: string) {
  const now = Date.now();
  const sentAt = new Date(now - (18 * 60 * 1000)).toISOString();
  const activityAt = new Date(now - (42 * 60 * 1000)).toISOString();
  const noteSavedAt = new Date(now - (75 * 60 * 1000)).toISOString();
  const callAt = new Date(now - (82 * 60 * 1000)).toISOString();
  const internalCallAt = new Date(now - (140 * 60 * 1000)).toISOString();
  const initials = String(userInitials || 'LZ').trim().toUpperCase() || 'LZ';
  const senderEmail = String(userEmail || 'lz@helix-law.com').trim().toLowerCase() || 'lz@helix-law.com';

  const externalCall: CallRecord = {
    recording_id: DEMO_JOURNEY_CALL_ID,
    from_party: '+447700900111',
    from_label: 'Sarah Carter',
    to_party: '+442034560001',
    to_label: 'Helix Law',
    call_type: 'inbound',
    duration_seconds: 942,
    start_time_utc: callAt,
    document_sentiment_score: 0.68,
    ai_document_sentiment: 'positive',
    matched_team_initials: initials,
    is_internal: false,
    resolved_name: 'Sarah Carter',
    resolved_source: 'enquiry-v2',
    resolved_ref: 'HLX-24018',
    resolved_area: 'Commercial',
  };

  const internalCall: CallRecord = {
    recording_id: DEMO_JOURNEY_INTERNAL_CALL_ID,
    from_party: '+442034560010',
    from_label: 'Luke Zelek',
    to_party: '+442034560021',
    to_label: 'Alex Clegg',
    call_type: 'outbound',
    duration_seconds: 428,
    start_time_utc: internalCallAt,
    document_sentiment_score: 0.22,
    ai_document_sentiment: 'neutral',
    matched_team_initials: initials,
    is_internal: true,
  };

  const savedNote: SavedNote = {
    id: 900001,
    recording_id: DEMO_JOURNEY_CALL_ID,
    matter_ref: 'HLX-33114-00012',
    call_date: callAt,
    summary: 'Explained the draft SPA issue list, agreed turnaround for mark-up, and confirmed directors need a side-letter before signing.',
    topics: null,
    action_items: null,
    saved_by: initials,
    saved_at: noteSavedAt,
    uploaded_nd: true,
    nd_file_name: 'Attendance Note - Sarah Carter - SPA mark-up.docx',
  };

  const attendanceNote: AttendanceNote = {
    summary: 'Client wants the SPA issue list turned within 24 hours and needs a director side-letter included before signature.',
    topics: ['SPA mark-up', 'Director side-letter', 'Completion timing'],
    actionItems: ['Send annotated SPA back to client', 'Draft director side-letter', 'Confirm Friday completion window with buyer solicitors'],
    attendanceNote: 'Sarah Carter called to walk through the current SPA mark-up. She confirmed the buyer has accepted the price point but is still pushing on warranty language and wants clarity around director authorities. We agreed Helix will return an annotated SPA and a draft side-letter today so the client can review before tomorrow morning. Client also asked for a completion-ready email pack once the revised drafting is out.',
    duration: 16,
    date: new Date(callAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    parties: { from: 'Sarah Carter', to: 'Helix Law' },
    teamMember: initials,
  };

  const transcript: TranscriptData = {
    summaries: [
      {
        summary_source: 'demo',
        summary_type: 'ai',
        summary_text: 'Client approved the commercial direction, needs the SPA mark-up and director side-letter today, and wants completion timing confirmed before market close tomorrow.',
      },
    ],
    recording: {
      document_sentiment_score: 0.68,
      document_emotion_json: JSON.stringify({ confidence: 'demo' }),
    },
    sentences: [
      { sentence_index: 1, speaker: 'Client', content: 'We are happy with the commercial points now, but I need the SPA mark-up and that director letter before we sign anything.', sentiment: 0.7 },
      { sentence_index: 2, speaker: 'Helix', content: 'We can send both today and package the completion email so your board can review everything together.', sentiment: 0.6 },
      { sentence_index: 3, speaker: 'Client', content: 'Perfect, if we can keep Friday live I can get final sign-off this afternoon.', sentiment: 0.72 },
    ],
  };

  const items: JourneyItem[] = [
    {
      key: `email-demo-journey`,
      kind: 'email' as const,
      timestamp: parseJourneyTimestamp(sentAt),
      email: {
        eventId: 'demo-email-journey',
        sentAt,
        senderEmail,
        senderInitials: initials,
        recipientSummary: 'Sarah Carter, buyer counsel +1',
        toRecipients: ['sarah.carter@example.com'],
        ccRecipients: ['buyer.counsel@example.com', 'assistant@example.com'],
        bccRecipients: [],
        subject: 'SPA mark-up and director side-letter for review',
        source: 'Home journey demo',
        contextLabel: 'Post-call follow-up',
        matterRef: 'HLX-33114-00012',
        instructionRef: 'HLX-33114-00012',
        enquiryRef: 'HLX-24018',
        graphRequestId: 'demo-graph-request',
      },
    },
    {
      key: `activity-demo-journey`,
      kind: 'activity' as const,
      timestamp: parseJourneyTimestamp(activityAt),
      activity: {
        id: 900001,
        date: activityAt,
        quantity_in_hours: 0.4,
        total: 140,
        type: 'TimeEntry',
        note: 'Reviewed SPA issue list and drafted follow-up actions after client call.',
        matter: { id: 3311400012, display_number: 'HLX-33114-00012', description: 'Carter acquisition support' },
        activity_description: { name: 'Telephone attendance and follow-up' },
        user: { id: 1, name: 'Luke Zelek' },
      },
    },
    {
      key: `note-demo-journey`,
      kind: 'note' as const,
      timestamp: parseJourneyTimestamp(callAt),
      note: savedNote,
      linkedCall: externalCall,
    },
    {
      key: `call-${DEMO_JOURNEY_CALL_ID}`,
      kind: 'call' as const,
      timestamp: parseJourneyTimestamp(callAt),
      call: externalCall,
    },
    {
      key: `call-${DEMO_JOURNEY_INTERNAL_CALL_ID}`,
      kind: 'call' as const,
      timestamp: parseJourneyTimestamp(internalCallAt),
      call: internalCall,
    },
  ].sort(compareJourneyItems);

  return {
    items,
    latestTimestamp: items[0]?.timestamp || 0,
    generatedAt: new Date().toISOString(),
    transcriptCache: {
      [DEMO_JOURNEY_CALL_ID]: transcript,
    } as Record<string, TranscriptData>,
    savedNoteCache: {
      [DEMO_JOURNEY_CALL_ID]: {
        note: attendanceNote,
        meta: {
          matter_ref: savedNote.matter_ref,
          saved_by: savedNote.saved_by,
          saved_at: savedNote.saved_at,
          uploaded_nd: savedNote.uploaded_nd,
          nd_file_name: savedNote.nd_file_name,
        },
      },
    } as Record<string, { note: AttendanceNote; meta: { matter_ref?: string | null; saved_by?: string | null; saved_at?: string; uploaded_nd?: boolean; nd_file_name?: string | null } }>,
    generatedNote: attendanceNote,
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CallsAndNotes({ isDarkMode, userInitials, userEmail, isNarrow, demoModeEnabled = false, isActive = true }: CallsAndNotesProps) {
  const showAll = isDevOwner({ Initials: userInitials, Email: userEmail || '' } as any);
  const demoModeActive = React.useMemo(() => {
    if (demoModeEnabled) return true;
    try {
      return localStorage.getItem('demoModeEnabled') === 'true';
    } catch {
      return false;
    }
  }, [demoModeEnabled]);
  // Shared tokens — match OperationsDashboard
  const cardBg = isDarkMode ? 'rgba(6, 23, 51, 0.55)' : '#FFFFFF';
  const cardBorder = isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.08)';
  const cardShadow = isDarkMode ? '0 1px 3px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.05)';
  const accent = isDarkMode ? colours.accent : colours.highlight;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const hoverBg = isDarkMode ? 'rgba(54,144,206,0.06)' : 'rgba(13,47,96,0.03)';
  const tabActiveBg = isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(13,47,96,0.015)';
  const clioLogoFilter = isDarkMode ? 'brightness(0) invert(1)' : 'none';

  // ── State ──
  const [journeyItems, setJourneyItems] = useState<JourneyItem[]>([]);
  const [isLoadingJourney, setIsLoadingJourney] = useState(false);
  const [isRefreshingJourney, setIsRefreshingJourney] = useState(false);
  const [journeyMeta, setJourneyMeta] = useState({ generatedAt: null as string | null, latestTimestamp: 0, scope: 'user' as 'user' | 'all', cachedWindowSeconds: 45 });
  const defaultJourneyScope = showAll ? 'all' as const : 'user' as const;
  const [selectedJourneyScope, setSelectedJourneyScope] = useState<'user' | 'all'>(defaultJourneyScope);
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>('all');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [generatingNoteFor, setGeneratingNoteFor] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState<AttendanceNote | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<Record<string, TranscriptData>>({});
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const journeyLoadedKeyRef = useRef<string | null>(null);
  const journeyRequestContextRef = useRef('');
  const lastJourneyTimestampRef = useRef(0);
  const [panelVisible, setPanelVisible] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));
  const [savedNoteCache, setSavedNoteCache] = useState<Record<string, { note: AttendanceNote; meta: { matter_ref?: string | null; saved_by?: string | null; saved_at?: string; uploaded_nd?: boolean; nd_file_name?: string | null } }>>({});
  const [loadingSavedNote, setLoadingSavedNote] = useState<string | null>(null);
  const demoJourneySeed = React.useMemo(() => buildDemoJourneySeed(userInitials, userEmail), [userEmail, userInitials]);
  const resolvedJourneyScope = showAll ? selectedJourneyScope : 'user';
  const canToggleJourneyScope = showAll && !demoModeActive;
  const journeyRequestContext = `${userInitials}:${userEmail || ''}:${resolvedJourneyScope}`;
  journeyRequestContextRef.current = journeyRequestContext;

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
    journeyLoadedKeyRef.current = null;
    lastJourneyTimestampRef.current = 0;
    setJourneyItems([]);
    setSelectedJourneyScope(defaultJourneyScope);
    setJourneyMeta({ generatedAt: null, latestTimestamp: 0, scope: defaultJourneyScope, cachedWindowSeconds: 45 });
    setSavedNoteCache({});
    setJourneyFilter('all');
    setIsLoadingJourney(false);
    setIsRefreshingJourney(false);
    setSelectedCallId(null);
    setGeneratedNote(null);
  }, [defaultJourneyScope, demoModeActive, userEmail, userInitials]);

  useEffect(() => {
    journeyLoadedKeyRef.current = null;
    lastJourneyTimestampRef.current = 0;
    setJourneyItems([]);
    setJourneyMeta((prev) => ({
      generatedAt: null,
      latestTimestamp: 0,
      scope: resolvedJourneyScope,
      cachedWindowSeconds: prev.cachedWindowSeconds,
    }));
    setIsLoadingJourney(false);
    setIsRefreshingJourney(false);
  }, [resolvedJourneyScope]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

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
  const journeyFetchKey = `${journeyRequestContext}:${demoModeActive ? 'demo' : 'live'}`;

  const fetchJourney = useCallback(async (mode: 'full' | 'delta' = 'full') => {
    const requestContext = journeyRequestContext;
    if (demoModeActive) {
      setJourneyItems(demoJourneySeed.items);
      setJourneyMeta({
        generatedAt: demoJourneySeed.generatedAt,
        latestTimestamp: demoJourneySeed.latestTimestamp,
        scope: resolvedJourneyScope,
        cachedWindowSeconds: 0,
      });
      lastJourneyTimestampRef.current = demoJourneySeed.latestTimestamp;
      setTranscriptCache(demoJourneySeed.transcriptCache);
      setSavedNoteCache(demoJourneySeed.savedNoteCache);
      setIsLoadingJourney(false);
      setIsRefreshingJourney(false);
      return;
    }

    const params = new URLSearchParams({
      initials: userInitials,
      limit: String(isNarrow ? 80 : 100),
      scope: resolvedJourneyScope,
    });
    if (userEmail) params.set('email', userEmail);
    if (mode === 'delta' && lastJourneyTimestampRef.current > 0) {
      params.set('since', String(lastJourneyTimestampRef.current));
    }

    const headers: Record<string, string> = {};
    if (userInitials) headers['x-helix-initials'] = userInitials;
    if (userEmail) headers['x-user-email'] = userEmail;

    try {
      if (mode === 'full') setIsLoadingJourney(true);
      else setIsRefreshingJourney(true);

      const response = await fetch(`/api/home-journey?${params.toString()}`, { headers });
      if (!response.ok) return;

      const data = await response.json();
      if (journeyRequestContextRef.current !== requestContext) return;

      const nextItems = Array.isArray(data.items)
        ? data.items.map(normaliseJourneyItem).filter(Boolean) as JourneyItem[]
        : [];
      nextItems.sort(compareJourneyItems);
      const latestTimestamp = Math.max(
        Number(data.latestTimestamp || 0),
        ...nextItems.map((item) => item.timestamp),
      );

      setJourneyItems((prev) => (mode === 'delta' ? mergeJourneyItems(prev, nextItems) : nextItems));
      setJourneyMeta({
        generatedAt: data.generatedAt || new Date().toISOString(),
        latestTimestamp: latestTimestamp || 0,
        scope: data.scope === 'all' ? 'all' : 'user',
        cachedWindowSeconds: Number(data.cachedWindowSeconds || 45),
      });
      if (latestTimestamp > 0) lastJourneyTimestampRef.current = latestTimestamp;
    } catch {
      // silent - keep current snapshot
    } finally {
      if (mode === 'full') setIsLoadingJourney(false);
      else setIsRefreshingJourney(false);
    }
  }, [demoJourneySeed, demoModeActive, isNarrow, journeyRequestContext, resolvedJourneyScope, userEmail, userInitials]);

  useEffect(() => {
    if (!panelActivated) return;
    if (journeyLoadedKeyRef.current === journeyFetchKey) return;
    journeyLoadedKeyRef.current = journeyFetchKey;
    void fetchJourney('full');
  }, [fetchJourney, journeyFetchKey, panelActivated]);

  useEffect(() => {
    if (demoModeActive || !panelActivated || !isDocumentVisible || !journeyLoadedKeyRef.current) return;
    const intervalId = window.setInterval(() => {
      void fetchJourney('delta');
    }, 600_000); // 10 min safety net — SSE push handles real-time updates
    return () => window.clearInterval(intervalId);
  }, [demoModeActive, fetchJourney, isDocumentVisible, panelActivated]);

  // Realtime: when data-ops sync completes, fetch delta immediately instead of waiting for poll.
  useEffect(() => {
    if (demoModeActive || !panelActivated) return;

    let eventSource: EventSource | null = null;
    let refreshTimer: number | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        if (journeyLoadedKeyRef.current) {
          void fetchJourney('delta');
        }
      }, 1000); // 1s debounce — let server finish writing sync rows
    };

    try {
      eventSource = new EventSource('/api/data-operations/stream');
      eventSource.addEventListener('dataOps.synced', scheduleRefresh as EventListener);
      eventSource.onerror = () => {
        // Browser auto-retries; keep handler light.
      };
    } catch (error) {
      console.warn('[CallsAndNotes] Failed to connect data-ops realtime stream:', error);
    }

    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      try { if (eventSource) eventSource.close(); } catch { /* ignore */ }
    };
  }, [demoModeActive, panelActivated, fetchJourney]);

  // Re-fetch delta when tab/panel regains visibility (catch-up).
  // journeyItems.length is a guard (don't delta before initial load) but NOT a dep —
  // having it in deps created a feedback loop (fetch → items change → re-fetch → cache hit → stop).
  useEffect(() => {
    if (demoModeActive || !panelActivated || !isDocumentVisible || journeyItems.length === 0) return;
    void fetchJourney('delta');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoModeActive, fetchJourney, isDocumentVisible, panelActivated]);

  // ── Fetch a single saved note for inline display ──
  const fetchSavedNote = useCallback(async (recordingId: string) => {
    if (savedNoteCache[recordingId]) return savedNoteCache[recordingId];
    setLoadingSavedNote(recordingId);
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/saved-note`);
      if (res?.ok) {
        const data = await res.json();
        if (data.note) {
          const nextSavedNote = { note: data.note, meta: data.meta || {} };
          setSavedNoteCache(prev => {
            if (prev[recordingId]) return prev;
            return { ...prev, [recordingId]: nextSavedNote };
          });
          return nextSavedNote;
        }
      }
    } catch { /* silent */ }
    finally { setLoadingSavedNote(null); }
    return null;
  }, [savedNoteCache]);

  // ── Generate attendance note ──
  const generateNote = useCallback(async (recordingId: string) => {
    if (demoModeActive && recordingId === DEMO_JOURNEY_CALL_ID) {
      setGeneratedNote(demoJourneySeed.generatedNote);
      setPipeline({
        saving: false,
        saved: true,
        blobUrl: 'demo://attendance-note',
        uploading: false,
        uploaded: true,
        ndResult: { fileName: 'Attendance Note - Sarah Carter - SPA mark-up.docx', uploadedTo: 'HELIX01-01 demo workspace' },
        linkedMatterRef: 'HLX-33114-00012',
        matterChainLoading: false,
        matterChainRef: 'HLX-33114-00012',
      });
      setMatterSearch('HLX-33114-00012');
      return;
    }
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
        const linkedMatterRef = chainData?.chain?.matter?.displayNumber || chainData?.chain?.instruction?.matterDisplayNumber || chainData?.chain?.instruction?.ref;
        if (linkedMatterRef) {
          setPipeline(prev => ({ ...prev, matterChainRef: linkedMatterRef, linkedMatterRef, matterChainLoading: false }));
          setMatterSearch(linkedMatterRef);
        } else {
          setPipeline(prev => ({ ...prev, matterChainLoading: false }));
        }
      } else {
        setPipeline(prev => ({ ...prev, matterChainLoading: false }));
      }
    } catch { /* silent */ }
    finally { setGeneratingNoteFor(null); }
  }, [demoJourneySeed.generatedNote, demoModeActive]);

  // ── Search matters for picker ──
  const searchMatters = useCallback(async (q: string) => {
    if (demoModeActive) {
      if (!q || q.length < 2) {
        setMatterOptions([]);
        return;
      }
      setMatterOptions([
        {
          key: 'HLX-33114-00012',
          displayNumber: 'HLX-33114-00012',
          clientName: 'Sarah Carter',
          description: 'Carter acquisition support',
        },
      ]);
      return;
    }
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
  }, [demoModeActive]);

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
    if (demoModeActive && recordingId === DEMO_JOURNEY_CALL_ID) {
      setPipeline(prev => ({
        ...prev,
        saving: false,
        saved: true,
        blobUrl: 'demo://attendance-note',
        linkedMatterRef: prev.linkedMatterRef || 'HLX-33114-00012',
      }));
      setSavedNoteCache(prev => ({
        ...prev,
        [recordingId]: {
          note: generatedNote,
          meta: {
            matter_ref: pipeline.linkedMatterRef || 'HLX-33114-00012',
            saved_by: userInitials,
            saved_at: new Date().toISOString(),
            uploaded_nd: false,
            nd_file_name: null,
          },
        },
      }));
      return;
    }
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
        setSavedNoteCache(prev => ({ ...prev, [recordingId]: { note: generatedNote, meta: { matter_ref: pipeline.linkedMatterRef || null, saved_by: userInitials, saved_at: new Date().toISOString(), uploaded_nd: false, nd_file_name: null } } }));
        void fetchJourney('full');
      } else {
        setPipeline(prev => ({ ...prev, saving: false }));
      }
    } catch {
      setPipeline(prev => ({ ...prev, saving: false }));
    }
  }, [demoModeActive, fetchJourney, generatedNote, pipeline.linkedMatterRef, userInitials]);

  // ── Upload note to NetDocuments ──
  const uploadToND = useCallback(async (recordingId: string, overrides?: { note?: AttendanceNote | null; matterRef?: string | null }) => {
    const cachedSavedNote = savedNoteCache[recordingId];
    const noteToUpload = overrides?.note || (selectedCallId === recordingId ? generatedNote : null) || cachedSavedNote?.note || null;
    const matterRef = overrides?.matterRef || (selectedCallId === recordingId ? pipeline.linkedMatterRef : null) || cachedSavedNote?.meta?.matter_ref || null;
    if (!noteToUpload || !matterRef) return;
    if (demoModeActive && recordingId === DEMO_JOURNEY_CALL_ID) {
      setPipeline(prev => ({
        ...prev,
        uploading: false,
        uploaded: true,
        ndResult: {
          fileName: 'Attendance Note - Sarah Carter - SPA mark-up.docx',
          uploadedTo: 'HELIX01-01 demo workspace',
        },
      }));
      setSavedNoteCache(prev => {
        const existing = prev[recordingId];
        if (!existing) return prev;
        return {
          ...prev,
          [recordingId]: {
            ...existing,
            meta: {
              ...existing.meta,
              uploaded_nd: true,
              nd_file_name: 'Attendance Note - Sarah Carter - SPA mark-up.docx',
            },
          },
        };
      });
      return;
    }
    setPipeline(prev => ({ ...prev, uploading: true }));
    try {
      const res = await fetch(`/api/dubberCalls/${encodeURIComponent(recordingId)}/upload-note-nd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteToUpload, matterRef }),
      });
      if (res?.ok) {
        const data = await res.json();
        setPipeline(prev => ({ ...prev, uploading: false, uploaded: true, ndResult: { fileName: data.fileName, uploadedTo: data.uploadedTo } }));
        setSavedNoteCache(prev => {
          const existing = prev[recordingId];
          if (!existing) {
            return {
              ...prev,
              [recordingId]: {
                note: noteToUpload,
                meta: { matter_ref: matterRef, uploaded_nd: true, nd_file_name: data.fileName },
              },
            };
          }
          return {
            ...prev,
            [recordingId]: {
              ...existing,
              meta: { ...existing.meta, matter_ref: existing.meta?.matter_ref || matterRef, uploaded_nd: true, nd_file_name: data.fileName },
            },
          };
        });
        void fetchJourney('full');
      } else {
        setPipeline(prev => ({ ...prev, uploading: false }));
      }
    } catch {
      setPipeline(prev => ({ ...prev, uploading: false }));
    }
  }, [demoModeActive, fetchJourney, generatedNote, pipeline.linkedMatterRef, savedNoteCache, selectedCallId]);

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
        setJourneyItems(prev => prev.map((item) => {
          if (item.kind === 'call' && item.call.recording_id === call.recording_id) {
            return {
              ...item,
              call: { ...item.call, [field]: call.resolved_name, resolved_name: undefined, resolved_source: undefined },
            };
          }
          if (item.kind === 'note' && item.linkedCall?.recording_id === call.recording_id) {
            return {
              ...item,
              linkedCall: { ...item.linkedCall, [field]: call.resolved_name, resolved_name: undefined, resolved_source: undefined },
            };
          }
          return item;
        }));
      }
    } catch { /* silent */ }
    finally { setConfirming(null); }
  }, []);

  const calls = React.useMemo(() => {
    const map = new Map<string, CallRecord>();
    for (const item of journeyItems) {
      if (item.kind === 'call') map.set(item.call.recording_id, item.call);
      if (item.kind === 'note' && item.linkedCall) map.set(item.linkedCall.recording_id, item.linkedCall);
    }
    return [...map.values()].sort((left, right) => parseJourneyTimestamp(right.start_time_utc) - parseJourneyTimestamp(left.start_time_utc));
  }, [journeyItems]);

  const savedNotes = React.useMemo(() => journeyItems
    .filter((item): item is Extract<JourneyItem, { kind: 'note' }> => item.kind === 'note')
    .map((item) => item.note), [journeyItems]);

  const activities = React.useMemo(() => journeyItems
    .filter((item): item is Extract<JourneyItem, { kind: 'activity' }> => item.kind === 'activity')
    .map((item) => item.activity), [journeyItems]);

  const emailEvents = React.useMemo(() => journeyItems
    .filter((item): item is Extract<JourneyItem, { kind: 'email' }> => item.kind === 'email')
    .map((item) => item.email), [journeyItems]);

  const notedIds = React.useMemo(() => new Set(savedNotes.map((note) => note.recording_id)), [savedNotes]);
  const savedNotesByRecordingId = React.useMemo(() => (
    savedNotes.reduce((acc, note) => {
      acc[note.recording_id] = note;
      return acc;
    }, {} as Record<string, SavedNote>)
  ), [savedNotes]);
  const externalCalls = calls.filter(c => !c.is_internal);
  const internalCalls = calls.filter(c => c.is_internal);

  const filteredJourneyItems = React.useMemo(() => {
    return journeyItems.filter((item) => {
      switch (journeyFilter) {
        case 'external':
          if (item.kind === 'call') return !item.call.is_internal;
          if (item.kind === 'note') return !!item.linkedCall && !item.linkedCall.is_internal;
          return false;
        case 'internal':
          if (item.kind === 'call') return !!item.call.is_internal;
          if (item.kind === 'note') return !!item.linkedCall?.is_internal;
          return false;
        case 'notes':
          return item.kind === 'note';
        case 'activity':
          return item.kind === 'activity';
        case 'emails':
          return item.kind === 'email';
        default:
          return true;
      }
    });
  }, [journeyFilter, journeyItems]);

  const journeyFilterCounts = React.useMemo(() => ({
    all: journeyItems.length,
    external: externalCalls.length,
    internal: internalCalls.length,
    notes: savedNotes.length,
    activity: activities.length,
    emails: emailEvents.length,
  }), [activities.length, emailEvents.length, externalCalls.length, internalCalls.length, journeyItems.length, savedNotes.length]);

  const emptyJourneyLabel = React.useMemo(() => {
    switch (journeyFilter) {
      case 'external':
        return resolvedJourneyScope === 'all' ? 'team external calls' : 'your external calls';
      case 'internal':
        return resolvedJourneyScope === 'all' ? 'team internal calls' : 'your internal calls';
      case 'notes':
        return resolvedJourneyScope === 'all' ? 'team notes' : 'your notes';
      case 'emails':
        return resolvedJourneyScope === 'all' ? 'team emails' : 'your emails';
      case 'activity':
        return resolvedJourneyScope === 'all' ? 'team activity entries' : 'your activity entries';
      default:
        return resolvedJourneyScope === 'all' ? 'team journey items' : 'activity for you';
    }
  }, [journeyFilter, resolvedJourneyScope]);

  // Duplicate detection: attendance notes that have a matching Clio time entry (same date + matter)
  const timeEntryKeys = React.useMemo(() => {
    const s = new Set<string>();
    for (const act of activities) {
      if (act.date && act.matter?.display_number) s.add(`${act.date}:${act.matter.display_number}`);
    }
    return s;
  }, [activities]);
  const selectedCall = calls.find(c => c.recording_id === selectedCallId) || null;
  const liveStatusLabel = demoModeActive ? 'Demo' : (!panelActivated ? 'Idle' : !isDocumentVisible ? 'Paused' : isRefreshingJourney ? 'Refreshing' : 'Live');
  const canManualJourneyRefresh = panelActivated && !isLoadingJourney && !isRefreshingJourney;

  const handleManualJourneyRefresh = React.useCallback(() => {
    if (!canManualJourneyRefresh) return;
    void fetchJourney('full');
  }, [canManualJourneyRefresh, fetchJourney]);

  const openCallFromJourney = React.useCallback((call: CallRecord) => {
    setJourneyFilter('all');
    setSelectedCallId(call.recording_id);
    setGeneratedNote(null);
    fetchTranscript(call.recording_id);
    if (notedIds.has(call.recording_id)) fetchSavedNote(call.recording_id);
  }, [fetchSavedNote, fetchTranscript, notedIds]);
  const streamDateColumnWidth = 48;
  const streamRowGap = 6;
  const streamRowPadding = '6px 8px';
  const streamDetailPadding = '0 8px 6px';
  const streamCardPadding = '6px 8px';
  const streamIconColumnWidth = 14;
  const streamAccessoryColumnWidth = 22;

  // ── Render ──
  return (
    <div ref={rootRef} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Generated note preview (inline above call card) */}
        {generatedNote && (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, marginBottom: 6, animation: 'opsDashFadeIn 0.25s ease both' }}>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          </div>
        )}

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: muted, padding: '2px 0 3px', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
            <FiPhone size={10} style={{ color: accent, flexShrink: 0 }} />
            <span>Activity</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
            {canToggleJourneyScope && ([
              { key: 'all', label: 'Team', suffix: 'all' },
              { key: 'user', label: 'Mine', suffix: 'only' },
            ] as const).map((scopeOption) => {
              const active = resolvedJourneyScope === scopeOption.key;
              return (
                <button
                  key={scopeOption.key}
                  type="button"
                  onClick={() => {
                    if (resolvedJourneyScope === scopeOption.key) return;
                    setSelectedJourneyScope(scopeOption.key);
                    setSelectedCallId(null);
                    setGeneratedNote(null);
                  }}
                  title={scopeOption.key === 'all' ? 'Show team activity' : 'Show only my activity'}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    border: `1px solid ${active ? (isDarkMode ? 'rgba(135,243,243,0.36)' : 'rgba(54,144,206,0.26)') : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.08)')}`,
                    background: active ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)') : 'transparent',
                    color: active ? text : muted,
                    padding: '5px 8px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    flexShrink: 0,
                  }}
                >
                  <span>{scopeOption.label}</span>
                  <span style={{ opacity: 0.72 }}>{scopeOption.suffix}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={handleManualJourneyRefresh}
              disabled={!canManualJourneyRefresh}
              title={canManualJourneyRefresh ? 'Refresh activity now' : `Activity ${liveStatusLabel.toLowerCase()}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 20,
                height: 20,
                padding: 0,
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.08)'}`,
                borderRadius: 0,
                background: 'transparent',
                color: liveStatusLabel === 'Paused' ? muted : accent,
                cursor: canManualJourneyRefresh ? 'pointer' : 'default',
                opacity: canManualJourneyRefresh ? 0.92 : 0.58,
                fontFamily: 'Raleway, sans-serif',
                margin: 0,
                appearance: 'none',
                WebkitAppearance: 'none',
                flexShrink: 0,
              }}
            >
              {isRefreshingJourney || isLoadingJourney ? (
                <FiRefreshCw size={9} style={{ animation: 'opsDashSpin 1s linear infinite' }} />
              ) : canManualJourneyRefresh ? (
                <FiRefreshCw size={9} />
              ) : (
                <FiClock size={9} />
              )}
            </button>
          </div>
        </div>

        <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 220 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 10px', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.06)'}` }}>
            {([
              { key: 'all', label: 'All', count: journeyFilterCounts.all, icon: <FiPhone size={9} style={{ color: accent, opacity: 0.86 }} /> },
              { key: 'external', label: 'External', count: journeyFilterCounts.external, icon: <FiPhoneIncoming size={9} style={{ color: colours.green, opacity: 0.9 }} /> },
              { key: 'internal', label: 'Internal', count: journeyFilterCounts.internal, icon: <FiLink size={9} style={{ color: muted, opacity: 0.92 }} /> },
              { key: 'notes', label: 'Notes', count: journeyFilterCounts.notes, icon: <FiFileText size={9} style={{ color: colours.orange, opacity: 0.9 }} /> },
              { key: 'emails', label: 'Emails', count: journeyFilterCounts.emails, icon: <FiMail size={9} style={{ color: colours.green, opacity: 0.9 }} /> },
              { key: 'activity', label: 'Activity', count: journeyFilterCounts.activity, icon: <img src={clioLogo} alt="Clio" style={{ width: 10, height: 10, opacity: isDarkMode ? 0.88 : 0.72, filter: clioLogoFilter }} /> },
            ] as const).map((filter) => {
              const active = journeyFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => {
                    setJourneyFilter(filter.key);
                    setSelectedCallId(null);
                    setGeneratedNote(null);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 7px',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.25px',
                    textTransform: 'uppercase',
                    border: `1px solid ${active ? (isDarkMode ? 'rgba(135,243,243,0.16)' : 'rgba(54,144,206,0.16)') : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.07)')}`,
                    background: active ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.04)') : 'transparent',
                    color: active ? text : muted,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>{filter.icon}</span>
                  <span>{filter.label}</span>
                  <span style={{ opacity: 0.7 }}>{filter.count}</span>
                </button>
              );
            })}
          </div>

          <div ref={scrollRef} className="ops-dash-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto', maxHeight: isNarrow ? 360 : 420 }}>
            {!panelActivated ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                <FiPhone size={12} style={{ color: muted, opacity: 0.45 }} />
                <span style={{ fontSize: 10, color: muted }}>Loads when visible</span>
              </div>
            ) : (isLoadingJourney && journeyItems.length === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
                <img src={clioLogo} alt="Clio" style={{ width: 18, height: 18, opacity: isDarkMode ? 0.7 : 0.45, filter: clioLogoFilter }} />
                <span style={{ fontSize: 10, color: muted }}>Loading journey…</span>
              </div>
            ) : filteredJourneyItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 4 }}>
                <FiPhone size={16} style={{ color: muted, opacity: 0.4 }} />
                <span style={{ fontSize: 10, color: muted }}>No {emptyJourneyLabel}</span>
              </div>
            ) : (
              <>
                {filteredJourneyItems.map((item, i) => {
                  if (item.kind === 'call') {
                    const call = item.call;
                    const isInbound = call.call_type === 'inbound';
                    const partyName = externalPartyName(call);
                    const isSelected = selectedCallId === call.recording_id;
                    const hasResolvedSuggestion = !!call.resolved_name;
                    const isConfirming = confirming === call.recording_id;
                    const stamp = formatJourneyStamp(call.start_time_utc);
                    const savedNoteSummary = savedNotesByRecordingId[call.recording_id] || null;
                    const hasSavedNote = Boolean(savedNoteSummary || notedIds.has(call.recording_id));
                    const cachedSavedNote = savedNoteCache[call.recording_id];
                    const inlineGeneratedNote = isSelected ? generatedNote : null;
                    const inlineUploadNote = inlineGeneratedNote || cachedSavedNote?.note || null;
                    const inlineUploadMatterRef = (isSelected ? pipeline.linkedMatterRef : null) || cachedSavedNote?.meta?.matter_ref || savedNoteSummary?.matter_ref || null;
                    const isGeneratingInline = generatingNoteFor === call.recording_id;
                    const isUploadingInline = pipeline.uploading && isSelected;
                    const hasPersistedCraft = Boolean(savedNoteSummary || cachedSavedNote || hasSavedNote || (pipeline.saved && isSelected));
                    const hasNdCue = Boolean(savedNoteSummary?.uploaded_nd || cachedSavedNote?.meta?.uploaded_nd || (pipeline.uploaded && isSelected));
                    const canInlineUpload = !isUploadingInline && !hasNdCue && (Boolean(inlineUploadNote && inlineUploadMatterRef) || hasPersistedCraft);
                    const craftTone = hasPersistedCraft ? colours.orange : accent;
                    const ndTone = hasNdCue ? colours.green : muted;
                    const uploadTone = hasNdCue ? colours.green : (canInlineUpload ? accent : muted);
                    const craftLabel = isGeneratingInline ? 'Craft…' : hasPersistedCraft ? 'Saved' : 'Craft';
                    const ndLabel = 'ND';
                    const uploadLabel = 'Upload';
                    const actionBoxBaseStyle: React.CSSProperties = {
                      minHeight: 18,
                      padding: '3px 6px',
                      display: 'grid',
                      gridTemplateColumns: '6px auto',
                      alignItems: 'center',
                      justifyContent: 'center',
                      columnGap: 5,
                      fontSize: 7,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      lineHeight: 1.1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontFamily: 'Raleway, sans-serif',
                      flexShrink: 0,
                      borderRadius: 0,
                      appearance: 'none',
                      WebkitAppearance: 'none',
                    };
                    const craftDotStyle: React.CSSProperties = {
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      border: `1px solid ${craftTone}`,
                      background: hasPersistedCraft ? craftTone : 'transparent',
                      boxSizing: 'border-box',
                      opacity: isGeneratingInline ? 0.6 : 1,
                    };
                    const ndDotStyle: React.CSSProperties = {
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      border: `1px solid ${ndTone}`,
                      background: hasNdCue ? ndTone : 'transparent',
                      boxSizing: 'border-box',
                      opacity: hasNdCue ? 1 : 0.72,
                    };
                    const uploadDotStyle: React.CSSProperties = {
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      border: `1px solid ${uploadTone}`,
                      background: hasNdCue ? uploadTone : (canInlineUpload ? 'transparent' : uploadTone),
                      boxSizing: 'border-box',
                      opacity: isUploadingInline ? 0.6 : (canInlineUpload || hasNdCue ? 1 : 0.72),
                    };

                    return (
                      <React.Fragment key={item.key}>
                        <div style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both` }}>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, color: muted }}>
                            <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.05, color: stamp.secondary ? text : muted }}>{stamp.primary}</span>
                            <span style={{ fontSize: 7, lineHeight: 1.05, opacity: stamp.secondary ? 0.82 : 0.45 }}>{stamp.secondary || '—'}</span>
                          </div>
                          <div
                            onClick={() => {
                              const nextId = isSelected ? null : call.recording_id;
                              setSelectedCallId(nextId);
                              setGeneratedNote(null);
                              if (nextId) {
                                fetchTranscript(call.recording_id);
                                if (notedIds.has(call.recording_id)) fetchSavedNote(call.recording_id);
                              }
                            }}
                            style={{
                              padding: streamCardPadding,
                              fontSize: 10,
                              color: text,
                              cursor: 'pointer',
                              background: isSelected ? (isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.04)') : 'transparent',
                              border: `1px solid ${isSelected ? accent : cardBorder}`,
                              borderLeft: `2px solid ${isInbound ? colours.green : accent}`,
                              transition: 'background 0.15s ease, border-color 0.15s ease',
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = hoverBg; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div style={{ display: 'grid', gridTemplateColumns: `${streamIconColumnWidth}px minmax(0, 1fr) auto`, alignItems: 'center', gap: 6 }}>
                              <span style={{ display: 'flex', alignItems: 'center' }}>
                                {isInbound
                                  ? <FiPhoneIncoming size={10} style={{ color: colours.green }} />
                                  : <FiPhoneOutgoing size={10} style={{ color: accent }} />
                                }
                              </span>
                              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: hasResolvedSuggestion ? 'italic' : 'normal', color: hasResolvedSuggestion ? accent : text }}>
                                  {partyName}
                                  {hasResolvedSuggestion && (
                                    <span style={{ fontSize: 8, marginLeft: 4, opacity: 0.5 }}>({call.resolved_source})</span>
                                  )}
                                </span>
                                <span style={{ fontSize: 8, color: muted, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                  <span>{isInbound ? 'Incoming call' : 'Outgoing call'}</span>
                                  {call.resolved_ref && <span style={{ color: accent }}>{call.resolved_ref}</span>}
                                  {call.resolved_area && <span>· {call.resolved_area}</span>}
                                  {call.matched_team_initials && <span style={{ fontWeight: 700, color: accent }}>{call.matched_team_initials}</span>}
                                </span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: `42px auto ${streamAccessoryColumnWidth}px`, alignItems: 'center', columnGap: 4, minWidth: 0, flexShrink: 0 }}>
                                <span style={{ width: 42, textAlign: 'right', fontSize: 9, color: muted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                  {formatDuration(call.duration_seconds)}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minWidth: 0 }}>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      openCallFromJourney(call);
                                      await generateNote(call.recording_id);
                                    }}
                                    disabled={isGeneratingInline || hasPersistedCraft}
                                    title={hasPersistedCraft ? 'Attendance note already saved' : 'Craft attendance note'}
                                    style={{
                                      ...actionBoxBaseStyle,
                                      border: `1px solid ${hasPersistedCraft
                                        ? (isDarkMode ? 'rgba(255,140,0,0.18)' : 'rgba(255,140,0,0.12)')
                                        : (isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)')}`,
                                      background: hasPersistedCraft
                                        ? (isDarkMode ? 'rgba(255,140,0,0.08)' : 'rgba(255,140,0,0.05)')
                                        : (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)'),
                                      color: craftTone,
                                      cursor: hasPersistedCraft ? 'default' : (isGeneratingInline ? 'wait' : 'pointer'),
                                      opacity: isGeneratingInline ? 0.58 : 1,
                                    }}
                                  >
                                    <span style={craftDotStyle} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{craftLabel}</span>
                                  </button>
                                  <span
                                    style={{
                                      ...actionBoxBaseStyle,
                                      border: `1px solid ${hasNdCue ? (isDarkMode ? 'rgba(32,178,108,0.22)' : 'rgba(32,178,108,0.12)') : cardBorder}`,
                                      background: hasNdCue ? (isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.04)') : 'transparent',
                                      color: ndTone,
                                      cursor: 'default',
                                      opacity: hasNdCue ? 1 : 0.72,
                                    }}
                                    title={hasNdCue ? 'Attendance note uploaded to NetDocuments' : 'Attendance note not uploaded to NetDocuments yet'}
                                  >
                                    <span style={ndDotStyle} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ndLabel}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      openCallFromJourney(call);
                                      let nextNote = inlineUploadNote;
                                      let nextMatterRef = inlineUploadMatterRef;
                                      if ((!nextNote || !nextMatterRef) && hasPersistedCraft) {
                                        const loadedSavedNote = await fetchSavedNote(call.recording_id);
                                        nextNote = nextNote || loadedSavedNote?.note || null;
                                        nextMatterRef = nextMatterRef || loadedSavedNote?.meta?.matter_ref || null;
                                      }
                                      if (nextNote && nextMatterRef) {
                                        await uploadToND(call.recording_id, { note: nextNote, matterRef: nextMatterRef });
                                      }
                                    }}
                                    disabled={!canInlineUpload}
                                    title={hasNdCue ? 'Attendance note already uploaded to NetDocuments' : (canInlineUpload ? 'Upload attendance note to NetDocuments' : 'Generate or load a linked matter before uploading to NetDocuments')}
                                    style={{
                                      ...actionBoxBaseStyle,
                                      border: `1px solid ${hasNdCue
                                        ? (isDarkMode ? 'rgba(32,178,108,0.22)' : 'rgba(32,178,108,0.12)')
                                        : canInlineUpload
                                          ? (isDarkMode ? 'rgba(135,243,243,0.18)' : 'rgba(54,144,206,0.18)')
                                          : cardBorder}`,
                                      background: hasNdCue
                                        ? (isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.05)')
                                        : canInlineUpload
                                          ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.08)')
                                          : 'transparent',
                                      color: uploadTone,
                                      cursor: canInlineUpload ? 'pointer' : 'default',
                                      opacity: canInlineUpload || hasNdCue ? 1 : 0.55,
                                    }}
                                  >
                                    <span style={uploadDotStyle} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{uploadLabel}</span>
                                  </button>
                                </div>
                                <div style={{ width: streamAccessoryColumnWidth, minWidth: streamAccessoryColumnWidth, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
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
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamDetailPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}` }}>
                            <div />
                            <div style={{
                              padding: '5px 10px 8px', border: `1px solid ${cardBorder}`,
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

                          {/* Saved note inline */}
                          {(() => {
                            const cached = savedNoteCache[call.recording_id];
                            const isLoadingSaved = loadingSavedNote === call.recording_id;
                            if (isLoadingSaved) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 6px', fontSize: 9, color: muted }}>
                                  <FiRefreshCw size={9} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Loading saved note…
                                </div>
                              );
                            }
                            if (!cached) return null;
                            const sn = cached.note;
                            const sm = cached.meta;
                            return (
                              <div style={{
                                padding: '6px 8px', marginBottom: 6,
                                background: isDarkMode ? 'rgba(32,178,108,0.06)' : 'rgba(32,178,108,0.03)',
                                border: `1px solid ${isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)'}`,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                  <span style={{ fontSize: 8, fontWeight: 700, color: colours.green, letterSpacing: '0.4px' }}>
                                    SAVED NOTE{sm?.uploaded_nd ? <span style={{ marginLeft: 6, color: accent }}>· ND ✓</span> : null}
                                  </span>
                                  <span style={{ fontSize: 8, color: muted }}>
                                    {sm?.saved_by}{sm?.saved_at ? ` · ${new Date(sm.saved_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                                    {sm?.matter_ref ? <span style={{ marginLeft: 4, color: accent }}>{sm.matter_ref}</span> : null}
                                  </span>
                                </div>
                                <div style={{ fontSize: 10, color: text, lineHeight: 1.5 }}>{sn.summary}</div>
                                {sn.topics?.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                                    {sn.topics.map((t: string, ti: number) => (
                                      <span key={ti} style={{ fontSize: 8, padding: '1px 5px', background: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.04)', color: colours.green }}>{t}</span>
                                    ))}
                                  </div>
                                )}
                                {sn.actionItems?.length > 0 && (
                                  <div style={{ marginTop: 4 }}>
                                    {sn.actionItems.map((a: string, ai: number) => (
                                      <div key={ai} style={{ fontSize: 9, color: text, paddingLeft: 6, borderLeft: `2px solid ${colours.green}`, marginBottom: 2 }}>{a}</div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ fontSize: 9, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.5, marginTop: 4, padding: '4px 6px', background: isDarkMode ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.02)', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto' }}>
                                  {sn.attendanceNote}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Generate / Regenerate attendance note button */}
                          <button
                            onClick={() => generateNote(call.recording_id)}
                            disabled={!!generatingNoteFor}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                              fontSize: 9, fontWeight: 600,
                              background: savedNoteCache[call.recording_id]
                                ? (isDarkMode ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.06)')
                                : (isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)'),
                              border: `1px solid ${savedNoteCache[call.recording_id]
                                ? (isDarkMode ? 'rgba(255,140,0,0.2)' : 'rgba(255,140,0,0.1)')
                                : (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)')}`,
                              color: savedNoteCache[call.recording_id] ? colours.orange : accent,
                              cursor: generatingNoteFor ? 'wait' : 'pointer',
                              opacity: generatingNoteFor ? 0.5 : 1,
                              transition: 'opacity 0.15s ease',
                            }}
                          >
                            {generatingNoteFor === call.recording_id ? (
                              <><FiRefreshCw size={10} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> Generating…</>
                            ) : savedNoteCache[call.recording_id] ? (
                              <><FiEdit3 size={10} /> Regenerate note</>
                            ) : (
                              <><FiEdit3 size={10} /> Generate attendance note</>
                            )}
                          </button>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  }

                  if (item.kind === 'note') {
                    const note = item.note;
                    const linkedCall = item.linkedCall;
                    const stamp = formatJourneyStamp(linkedCall?.start_time_utc || note.call_date || note.saved_at);
                    const isDuplicate = !!(note.call_date && note.matter_ref && timeEntryKeys.has(`${note.call_date}:${note.matter_ref}`));
                    const savedStamp = formatCompactDateTime(note.saved_at);
                    const callStamp = linkedCall ? formatCompactDateTime(linkedCall.start_time_utc) : formatCompactDateTime(note.call_date);
                    return (
                      <div key={item.key} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, color: muted }}>
                          <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.05, color: stamp.secondary ? text : muted }}>{stamp.primary}</span>
                          <span style={{ fontSize: 7, lineHeight: 1.05, opacity: stamp.secondary ? 0.82 : 0.45 }}>{stamp.secondary || '—'}</span>
                        </div>
                        <div
                          onClick={() => {
                            if (linkedCall) {
                              openCallFromJourney(linkedCall);
                            }
                          }}
                          style={{
                            padding: streamCardPadding,
                            border: `1px solid ${cardBorder}`,
                            borderLeft: `2px solid ${note.uploaded_nd ? colours.green : colours.orange}`,
                            background: isDarkMode ? 'rgba(255,140,0,0.05)' : 'rgba(255,140,0,0.03)',
                            cursor: linkedCall ? 'pointer' : 'default',
                          }}
                          onMouseEnter={e => { if (linkedCall) e.currentTarget.style.background = hoverBg; }}
                          onMouseLeave={e => { if (linkedCall) e.currentTarget.style.background = isDarkMode ? 'rgba(255,140,0,0.05)' : 'rgba(255,140,0,0.03)'; }}
                          title={linkedCall ? 'Open linked call' : 'Saved attendance note'}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: `${streamIconColumnWidth}px minmax(0, 1fr) auto`, gap: 6, alignItems: 'start' }}>
                            <span style={{ display: 'flex', alignItems: 'center' }}><FiFileText size={10} style={{ color: colours.orange }} /></span>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.summary || 'Attendance note'}</span>
                              <span style={{ fontSize: 8, color: muted, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                                {note.matter_ref && <span style={{ color: accent }}>{note.matter_ref}</span>}
                                {linkedCall && <span>Call {callStamp || formatTime(linkedCall.start_time_utc)}</span>}
                                {linkedCall && <span>{externalPartyName(linkedCall)}</span>}
                                {note.saved_by && <span>Saved by {note.saved_by}{savedStamp ? ` · ${savedStamp}` : ''}</span>}
                                {isDuplicate && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><FiLink size={8} style={{ color: accent, opacity: 0.6 }} />Time entry matched</span>
                                )}
                              </span>
                              <span style={{ fontSize: 8, color: muted, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                <span>{note.uploaded_nd ? 'Uploaded to ND' : 'Ready to upload to ND'}</span>
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {note.uploaded_nd ? (
                                <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.08)', color: colours.green, letterSpacing: '0.3px' }}>ND ✓</span>
                              ) : (
                                <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: isDarkMode ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.08)', color: colours.orange, letterSpacing: '0.3px' }}>Saved</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (item.kind === 'email') {
                    const email = item.email;
                    const stamp = formatJourneyStamp(email.sentAt);
                    const refLabel = email.matterRef || email.instructionRef || email.enquiryRef || null;

                    return (
                      <div key={item.key} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, color: muted }}>
                          <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.05, color: stamp.secondary ? text : muted }}>{stamp.primary}</span>
                          <span style={{ fontSize: 7, lineHeight: 1.05, opacity: stamp.secondary ? 0.82 : 0.45 }}>{stamp.secondary || '—'}</span>
                        </div>
                        <div style={{ padding: streamCardPadding, border: `1px solid ${cardBorder}`, borderLeft: `2px solid ${colours.green}`, background: isDarkMode ? 'rgba(32,178,108,0.05)' : 'rgba(32,178,108,0.03)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: `${streamIconColumnWidth}px minmax(0, 1fr) auto`, gap: 6, alignItems: 'start' }}>
                            <span style={{ display: 'flex', alignItems: 'center' }}><FiMail size={10} style={{ color: colours.green }} /></span>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email.subject || 'Sent email'}</span>
                              <span style={{ fontSize: 8, color: muted, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                                <span>{email.senderInitials || email.senderEmail}</span>
                                <span>to {email.recipientSummary}</span>
                                {email.source && <span style={{ color: accent }}>{email.source}</span>}
                                {email.contextLabel && <span>{email.contextLabel}</span>}
                                {refLabel && <span style={{ color: accent }}>{refLabel}</span>}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <span style={{ fontSize: 7, fontWeight: 700, padding: '1px 5px', borderRadius: 999, background: isDarkMode ? 'rgba(32,178,108,0.12)' : 'rgba(32,178,108,0.08)', color: colours.green, letterSpacing: '0.3px' }}>EMAIL</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const activity = item.activity;
                  const stamp = formatJourneyStamp(activity.event_timestamp || activity.created_at || activity.updated_at || activity.date);
                  const activityLabel = activity.matter?.display_number
                    ? `${activity.matter.display_number} · ${activity.activity_description?.name || activity.type || 'Activity'}`
                    : (activity.activity_description?.name || activity.note || activity.type || 'Activity');
                  const activityHours = activity.quantity_in_hours != null ? `${activity.quantity_in_hours.toFixed(1)}h` : null;
                  const activityValue = formatMoneyValue(activity.total);

                  return (
                    <div key={item.key} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: `opsDashRowFade 0.2s ease ${0.02 * i}s both` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, color: muted }}>
                        <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.05, color: stamp.secondary ? text : muted }}>{stamp.primary}</span>
                        <span style={{ fontSize: 7, lineHeight: 1.05, opacity: stamp.secondary ? 0.82 : 0.45 }}>{stamp.secondary || '—'}</span>
                      </div>
                      <div style={{ padding: streamCardPadding, border: `1px solid ${cardBorder}`, borderLeft: `2px solid ${accent}`, background: isDarkMode ? 'rgba(54,144,206,0.04)' : 'rgba(13,47,96,0.02)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: `${streamIconColumnWidth}px minmax(0, 1fr) auto`, gap: 6, alignItems: 'start' }}>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={clioLogo} alt="Clio" style={{ width: 12, height: 12, opacity: isDarkMode ? 0.88 : 0.72, filter: clioLogoFilter }} /></span>
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activityLabel}</span>
                            <span style={{ fontSize: 8, color: muted, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {activity.user?.name && <span>{activity.user.name}</span>}
                              {activity.note && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activity.note}</span>}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', fontSize: 8, color: muted }}>
                            {activityHours && <span>{activityHours}</span>}
                            {activityValue && <span>{activityValue}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
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
