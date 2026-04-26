import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FiPhone, FiPhoneIncoming, FiPhoneOutgoing, FiFileText, FiClock, FiCheck, FiLink, FiX, FiRefreshCw, FiChevronRight, FiChevronDown, FiEdit3, FiSave, FiUploadCloud, FiSearch, FiMail, FiCode, FiDownload } from 'react-icons/fi';
import { colours } from '../../app/styles/colours';
import { isDevOwner } from '../../app/admin';
import { useFreshIds } from '../../hooks/useFreshIds';
import clioLogo from '../../assets/clio.svg';
import { getProxyBaseUrl } from '../../utils/getProxyBaseUrl';
import { disposeOnHmr, onServerBounced } from '../../utils/devHmr';
import { useRealtimeChannel } from '../../hooks/useRealtimeChannel';
import AttendanceNoteBox, { type AttendanceNoteBoxPayload, type AttendanceNoteBoxSaveLegStatus } from './AttendanceNoteBox';

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
  systemPrompt?: string;
  userPrompt?: string;
}

interface MatterOption {
  key: string;
  displayNumber: string;
  clientName: string;
  description: string;
  source?: 'current' | 'legacy';
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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

interface CallsAndNotesProps {
  isDarkMode: boolean;
  userInitials: string;
  userEmail?: string;
  userRate?: number | string | null;
  isNarrow?: boolean;
  demoModeEnabled?: boolean;
  isActive?: boolean;
  matterLookupOptions?: MatterOption[];
}

type JourneyFilter = 'all' | 'external' | 'internal' | 'notes' | 'activity' | 'emails';

type JourneyItem =
  | { key: string; kind: 'call'; timestamp: number; call: CallRecord }
  | { key: string; kind: 'note'; timestamp: number; note: SavedNote; linkedCall: CallRecord | null }
  | { key: string; kind: 'activity'; timestamp: number; activity: ClioActivity }
  | { key: string; kind: 'email'; timestamp: number; email: EmailJourneyEvent };

const LONDON_TIMEZONE = 'Europe/London';

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: LONDON_TIMEZONE });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const todayLabel = now.toLocaleDateString('en-CA', { timeZone: LONDON_TIMEZONE });
  const dateLabel = d.toLocaleDateString('en-CA', { timeZone: LONDON_TIMEZONE });
  const isToday = dateLabel === todayLabel;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLabel = yesterday.toLocaleDateString('en-CA', { timeZone: LONDON_TIMEZONE });
  const isYesterday = dateLabel === yesterdayLabel;
  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: LONDON_TIMEZONE });
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

function matchesJourneyFilter(item: JourneyItem, journeyFilter: JourneyFilter): boolean {
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
    from_label: '[Demo] Demo Client',
    to_party: '+442034560001',
    to_label: 'Helix Law',
    call_type: 'inbound',
    duration_seconds: 942,
    start_time_utc: callAt,
    document_sentiment_score: 0.68,
    ai_document_sentiment: 'positive',
    matched_team_initials: initials,
    is_internal: false,
    resolved_name: '[Demo] Demo Client',
    resolved_source: 'enquiry-v2',
    resolved_ref: 'HLX-24018',
    resolved_area: 'Commercial',
  };

  const internalCall: CallRecord = {
    recording_id: DEMO_JOURNEY_INTERNAL_CALL_ID,
    from_party: '+442034560010',
    from_label: '[Demo] Fee Earner',
    to_party: '+442034560021',
    to_label: '[Demo] Colleague',
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
    summary: '[Demo] Explained the draft SPA issue list, agreed turnaround for mark-up, and confirmed directors need a side-letter before signing.',
    topics: null,
    action_items: null,
    saved_by: initials,
    saved_at: noteSavedAt,
    uploaded_nd: true,
    nd_file_name: '[Demo] Attendance Note - Demo Client - SPA mark-up.docx',
  };

  const attendanceNote: AttendanceNote = {
    summary: 'Client wants the SPA issue list turned within 24 hours and needs a director side-letter included before signature.',
    topics: ['SPA mark-up', 'Director side-letter', 'Completion timing'],
    actionItems: ['Send annotated SPA back to client', 'Draft director side-letter', 'Confirm Friday completion window with buyer solicitors'],
    attendanceNote: '[Demo fixture] Demo Client called to walk through the current SPA mark-up. They confirmed the buyer has accepted the price point but is still pushing on warranty language and wants clarity around director authorities. We agreed Helix will return an annotated SPA and a draft side-letter today so the client can review before tomorrow morning. Client also asked for a completion-ready email pack once the revised drafting is out.',
    duration: 16,
    date: new Date(callAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    parties: { from: '[Demo] Demo Client', to: 'Helix Law' },
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
        recipientSummary: '[Demo] Demo Client, buyer counsel +1',
        toRecipients: ['demo.client@example.com'],
        ccRecipients: ['demo.buyer.counsel@example.com', 'demo.assistant@example.com'],
        bccRecipients: [],
        subject: '[Demo] SPA mark-up and director side-letter for review',
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
        note: '[Demo] Reviewed SPA issue list and drafted follow-up actions after client call.',
        matter: { id: 3311400012, display_number: 'HLX-33114-00012', description: '[Demo] Demo Client acquisition support' },
        activity_description: { name: '[Demo] Telephone attendance and follow-up' },
        user: { id: 1, name: '[Demo] Fee Earner' },
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

// ── Prompt Inspector (collapsible viewer for AI prompts) ─────────────────────
function NotePromptInspector({ systemPrompt, userPrompt, isDarkMode, accent, text, muted }: {
  systemPrompt: string; userPrompt: string; isDarkMode: boolean;
  accent: string; text: string; muted: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<'system' | 'user'>('system');

  const promptBg = isDarkMode ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.02)';
  const promptBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  return (
    <div style={{ borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, width: '100%',
          padding: '6px 0 4px', background: 'none', border: 'none', cursor: 'pointer',
          color: muted, fontSize: 9, fontWeight: 600, letterSpacing: '0.3px',
          fontFamily: 'Raleway, sans-serif',
        }}
      >
        {open ? <FiChevronDown size={10} /> : <FiChevronRight size={10} />}
        <FiCode size={9} />
        <span>AI PROMPT INSPECTOR</span>
      </button>
      {open && (
        <div style={{ animation: 'opsDashFadeIn 0.15s ease both', paddingBottom: 4 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 6 }}>
            {(['system', 'user'] as const).map(t => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    flex: 1, padding: '4px 8px', fontSize: 9, fontWeight: active ? 700 : 500,
                    background: active ? (isDarkMode ? 'rgba(13,47,96,0.45)' : 'rgba(214,232,255,0.55)') : 'transparent',
                    borderBottom: `2px solid ${active ? accent : 'transparent'}`,
                    border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid',
                    borderBottomColor: active ? accent : 'transparent',
                    color: active ? text : muted, cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif', textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  {t === 'system' ? 'System Prompt' : 'User Prompt'}
                </button>
              );
            })}
          </div>
          {/* Content */}
          <div style={{
            fontSize: 9, lineHeight: 1.55, color: isDarkMode ? '#d1d5db' : '#374151',
            background: promptBg, border: `1px solid ${promptBorder}`,
            padding: '8px 10px', whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto',
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
          }}>
            {tab === 'system' ? systemPrompt : userPrompt}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CallsAndNotes({ isDarkMode, userInitials, userEmail, userRate, isNarrow, demoModeEnabled = false, isActive = true, matterLookupOptions = [] }: CallsAndNotesProps) {
  const showAll = isDevOwner({ Initials: userInitials, Email: userEmail || '' } as any);
  // Dubber API requests go directly to the Express backend on localhost to avoid
  // HTTP/1.1 connection exhaustion — the 6+ SSE streams through the CRA proxy
  // consume all per-origin connection slots, starving regular fetches.
  const dubberApiBaseUrl = React.useMemo(() => {
    const baseUrl = getProxyBaseUrl();
    if (baseUrl) return baseUrl;
    if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      return 'http://localhost:8080';
    }
    return '';
  }, []);
  // Activities disabled in production — local and staging only
  const activitiesEnabled = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (['staging', 'uat', 'dev', 'preview'].some((s) => hostname.includes(s))) return true;
    return false;
  }, []);
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
  const [lastStableJourneyItems, setLastStableJourneyItems] = useState<JourneyItem[]>([]);
  const [isLoadingJourney, setIsLoadingJourney] = useState(false);
  const [isRefreshingJourney, setIsRefreshingJourney] = useState(false);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [journeyWarnings, setJourneyWarnings] = useState<Record<string, string> | null>(null);
  const callCentreEnabled = ['LZ', 'AC'].includes((userInitials || '').trim().toUpperCase());
  const [journeyMeta, setJourneyMeta] = useState({ generatedAt: null as string | null, latestTimestamp: 0, scope: 'user' as 'user' | 'all', cachedWindowSeconds: 120 });
  const defaultJourneyScope = callCentreEnabled ? 'user' as const : (showAll ? 'all' as const : 'user' as const);
  const [selectedJourneyScope, setSelectedJourneyScope] = useState<'user' | 'all'>(defaultJourneyScope);
  // In Call Centre Mine view, "external only" hides team↔team internal calls (e.g. AC → LZ),
  // which are legitimate calls I need to see. Only apply the external default in Team view
  // where the internal chatter would otherwise swamp the feed.
  const defaultJourneyFilter: JourneyFilter = callCentreEnabled
    ? (selectedJourneyScope === 'user' ? 'all' : 'external')
    : 'all';
  // CALL_CENTRE_EXTERNAL — Phase A dev-preview flag. Gates the prod Call Centre
  // surface (external-only, enlarged "Add to file" primary, chip row hidden).
  // Per rollout ladder, kept inline LZ/AC until the box (Cut 2) + fork (Cut 3)
  // ship. Promote to `canSeeCallCentre()` in src/app/admin.ts when ready.
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>(defaultJourneyFilter);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [generatingNoteFor, setGeneratingNoteFor] = useState<string | null>(null);
  const [generatedNote, setGeneratedNote] = useState<AttendanceNote | null>(null);
  const [noteDetailOpen, setNoteDetailOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [transcriptCache, setTranscriptCache] = useState<Record<string, TranscriptData>>({});
  const [loadingTranscript, setLoadingTranscript] = useState<string | null>(null);
  const [transcriptErrors, setTranscriptErrors] = useState<Record<string, string>>({});
  const [noteGenError, setNoteGenError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attendanceSaveLegs, setAttendanceSaveLegs] = useState<AttendanceNoteBoxSaveLegStatus[]>([]);
  // Synthetic recording id for standalone "manual" attendance notes (no call selected).
  // Regenerated after each successful save to start a fresh draft.
  const [manualRecordingId, setManualRecordingId] = useState<string>(() => {
    try {
      const u = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return `manual-${u}`;
    } catch { return `manual-${Date.now()}`; }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const rightRailRef = useRef<HTMLDivElement>(null);
  const [rightRailHeight, setRightRailHeight] = useState<number | null>(null);
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
  const journeyRequestLimit = React.useMemo(() => {
    if (!callCentreEnabled) return isNarrow ? 80 : 100;
    return resolvedJourneyScope === 'user' ? 40 : 70;
  }, [callCentreEnabled, isNarrow, resolvedJourneyScope]);
  const journeyRequestContext = `${userInitials}:${userEmail || ''}:${resolvedJourneyScope}`;
  journeyRequestContextRef.current = journeyRequestContext;

  // ── Note pipeline state ──
  const [pipeline, setPipeline] = useState<NotePipelineState>({
    saving: false, saved: false, blobUrl: null,
    uploading: false, uploaded: false, ndResult: null,
    linkedMatterRef: null, matterChainLoading: false, matterChainRef: null,
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [matterSearch, setMatterSearch] = useState('');
  const [matterOptions, setMatterOptions] = useState<MatterOption[]>([]);
  const [matterDropdownOpen, setMatterDropdownOpen] = useState(false);
  const [matterSearchLoading, setMatterSearchLoading] = useState(false);
  const [matterLegacyAvailable, setMatterLegacyAvailable] = useState(false);
  const [matterIncludeLegacy, setMatterIncludeLegacy] = useState(false);
  const matterPickerRef = useRef<HTMLDivElement>(null);
  const matterSearchRequestRef = useRef(0);
  const localMatterLookupOptions = React.useMemo(() => {
    const seen = new Set<string>();
    return (matterLookupOptions || [])
      .map((matter) => ({
        key: String(matter.key || matter.displayNumber || '').trim(),
        displayNumber: String(matter.displayNumber || matter.key || '').trim(),
        clientName: String(matter.clientName || '').trim(),
        description: String(matter.description || '').trim(),
        source: matter.source || 'current',
      } as MatterOption))
      .filter((matter) => {
        const key = (matter.displayNumber || matter.key).toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [matterLookupOptions]);

  const filterLocalMatterLookupOptions = useCallback((q: string, limit = 20): MatterOption[] => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return localMatterLookupOptions
      .filter((matter) => (
        (matter.displayNumber || '').toLowerCase().includes(needle)
        || (matter.clientName || '').toLowerCase().includes(needle)
        || (matter.description || '').toLowerCase().includes(needle)
      ))
      .slice(0, limit);
  }, [localMatterLookupOptions]);

  const resetSelectedWorkspace = useCallback(() => {
    setGeneratedNote(null);
    setNoteDetailOpen(false);
    setNoteGenError(null);
    setAttendanceSaveLegs([]);
    setSaveError(null);
    setUploadError(null);
    setMatterSearch('');
    setMatterOptions([]);
    setMatterDropdownOpen(false);
    setMatterLegacyAvailable(false);
    setMatterIncludeLegacy(false);
    setPipeline({
      saving: false,
      saved: false,
      blobUrl: null,
      uploading: false,
      uploaded: false,
      ndResult: null,
      linkedMatterRef: null,
      matterChainLoading: false,
      matterChainRef: null,
    });
  }, []);

  // Close matter dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (matterPickerRef.current && !matterPickerRef.current.contains(e.target as Node)) setMatterDropdownOpen(false);
    };
    if (matterDropdownOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [matterDropdownOpen]);

  // ── Elapsed timer for transcript/craft loading feedback ──
  useEffect(() => {
    const isActive = !!loadingTranscript || !!generatingNoteFor;
    if (!isActive) { setElapsedSeconds(0); return; }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loadingTranscript, generatingNoteFor]);

  useEffect(() => {
    journeyLoadedKeyRef.current = null;
    lastJourneyTimestampRef.current = 0;
    setJourneyItems([]);
    setLastStableJourneyItems([]);
    setSelectedJourneyScope(defaultJourneyScope);
    setJourneyMeta({ generatedAt: null, latestTimestamp: 0, scope: defaultJourneyScope, cachedWindowSeconds: 120 });
    setSavedNoteCache({});
    setJourneyFilter(defaultJourneyFilter);
    setIsLoadingJourney(false);
    setIsRefreshingJourney(false);
    setSelectedCallId(null);
    resetSelectedWorkspace();
  }, [defaultJourneyFilter, defaultJourneyScope, demoModeActive, resetSelectedWorkspace, userEmail, userInitials]);

  useEffect(() => {
    journeyLoadedKeyRef.current = null;
    lastJourneyTimestampRef.current = 0;
    setJourneyMeta((prev) => ({
      generatedAt: prev.generatedAt,
      latestTimestamp: prev.latestTimestamp,
      scope: resolvedJourneyScope,
      cachedWindowSeconds: prev.cachedWindowSeconds,
    }));
    setJourneyError(null);
    setJourneyWarnings(null);
    setSelectedCallId(null);
    resetSelectedWorkspace();
  }, [resetSelectedWorkspace, resolvedJourneyScope]);

  useEffect(() => {
    if (journeyItems.length > 0) {
      setLastStableJourneyItems(journeyItems);
    }
  }, [journeyItems]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibilityChange = () => setIsDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    // Once panelVisible is latched true we never reset it — the component
    // stays mounted via display:none so re-detecting intersection is just
    // wasted work that causes a flash + SSE reconnection when the user
    // navigates back to Home.
    if (panelVisible || !isActive) return;

    const node = rootRef.current;
    if (!node) return;

    const isNodeNearViewport = () => {
      if (typeof window === 'undefined') return false;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      return rect.top <= viewportHeight + 200 && rect.bottom >= -200;
    };

    if (isNodeNearViewport()) {
      setPanelVisible(true);
      return;
    }

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
  }, [isActive, panelVisible]);

  // Sync the call-list max-height to the right rail (filing workspace) so the
  // list never extends past the form. Only active in call-centre mode, wide layout.
  useEffect(() => {
    if (!callCentreEnabled || isNarrow) {
      setRightRailHeight(null);
      return;
    }
    const node = rightRailRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      setRightRailHeight(null);
      return;
    }
    const measure = () => {
      const h = node.getBoundingClientRect().height;
      if (h > 0) setRightRailHeight(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [callCentreEnabled, isNarrow, selectedCallId]);

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
      setActivitiesLoading(false);
      return;
    }

    const params = new URLSearchParams({
      initials: userInitials,
      limit: String(journeyRequestLimit),
      scope: resolvedJourneyScope,
    });
    const primarySources = callCentreEnabled ? 'calls' : 'calls,notes,emails';
    if (userEmail) params.set('email', userEmail);

    const headers: Record<string, string> = {};
    if (userInitials) headers['x-helix-initials'] = userInitials;
    if (userEmail) headers['x-user-email'] = userEmail;

    // ── Delta mode: single request for all sources ──
    if (mode === 'delta') {
      params.set('sources', primarySources);
      if (lastJourneyTimestampRef.current > 0) {
        params.set('since', String(lastJourneyTimestampRef.current));
      }
      try {
        setIsRefreshingJourney(true);
        const response = await fetch(`/api/home-journey?${params.toString()}`, { headers });
        if (!response.ok) return;
        const data = await response.json();
        if (journeyRequestContextRef.current !== requestContext) return;
        setJourneyError(null);
        if (data.warnings) setJourneyWarnings(prev => ({ ...(prev || {}), ...data.warnings }));
        const nextItems = Array.isArray(data.items)
          ? data.items.map(normaliseJourneyItem).filter(Boolean) as JourneyItem[]
          : [];
        nextItems.sort(compareJourneyItems);
        const latestTimestamp = Math.max(Number(data.latestTimestamp || 0), ...nextItems.map((item) => item.timestamp));
        setJourneyItems(prev => mergeJourneyItems(prev, nextItems));
        setJourneyMeta({
          generatedAt: data.generatedAt || new Date().toISOString(),
          latestTimestamp: latestTimestamp || 0,
          scope: data.scope === 'all' ? 'all' : 'user',
          cachedWindowSeconds: Number(data.cachedWindowSeconds || 45),
        });
        if (latestTimestamp > 0) lastJourneyTimestampRef.current = latestTimestamp;
      } catch {
        // keep current snapshot on delta fail
      } finally {
        setIsRefreshingJourney(false);
      }
      return;
    }

    // ── Full mode: progressive load — fast sources first, Clio activities second ──
    setIsLoadingJourney(true);
    setJourneyError(null);
    setJourneyWarnings(null);
    setActivitiesLoading(!callCentreEnabled && activitiesEnabled);

    const fastParams = new URLSearchParams(params);
    fastParams.set('sources', primarySources);

    // Activities only fetched in non-production environments
    const slowPromise = !callCentreEnabled && activitiesEnabled
      ? (() => {
          const slowParams = new URLSearchParams(params);
          slowParams.set('sources', 'activities');
          return fetch(`/api/home-journey?${slowParams.toString()}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null);
        })()
      : Promise.resolve(null);

    // Await fast sources — show items immediately
    try {
      const fastRes = await fetch(`/api/home-journey?${fastParams.toString()}`, { headers });
      if (journeyRequestContextRef.current !== requestContext) { setIsLoadingJourney(false); setActivitiesLoading(false); return; }
      if (fastRes.ok) {
        const data = await fastRes.json();
        const nextItems = Array.isArray(data.items) ? data.items.map(normaliseJourneyItem).filter(Boolean) as JourneyItem[] : [];
        nextItems.sort(compareJourneyItems);
        setJourneyItems(nextItems);
        setJourneyWarnings(data.warnings || null);
        const ts = Math.max(Number(data.latestTimestamp || 0), ...nextItems.map(i => i.timestamp));
        setJourneyMeta({ generatedAt: data.generatedAt || new Date().toISOString(), latestTimestamp: ts || 0, scope: data.scope === 'all' ? 'all' : 'user', cachedWindowSeconds: Number(data.cachedWindowSeconds || 45) });
        if (ts > 0) lastJourneyTimestampRef.current = ts;
      } else {
        setJourneyError('Unable to load calls and notes.');
      }
    } catch {
      setJourneyError('Connection error — check your network.');
    }
    setIsLoadingJourney(false);

    // Await activities — merge into existing items
    try {
      const slowData = await slowPromise;
      if (journeyRequestContextRef.current !== requestContext) { setActivitiesLoading(false); return; }
      if (slowData) {
        const activityItems = Array.isArray(slowData.items) ? slowData.items.map(normaliseJourneyItem).filter(Boolean) as JourneyItem[] : [];
        if (activityItems.length > 0) {
          setJourneyItems(prev => {
            const merged = mergeJourneyItems(prev, activityItems);
            merged.sort(compareJourneyItems);
            return merged;
          });
        }
        if (slowData.warnings) setJourneyWarnings(prev => ({ ...(prev || {}), ...slowData.warnings }));
        const ts = Math.max(Number(slowData.latestTimestamp || 0), ...activityItems.map(i => i.timestamp));
        if (ts > lastJourneyTimestampRef.current) {
          lastJourneyTimestampRef.current = ts;
          setJourneyMeta(prev => ({ ...prev, latestTimestamp: ts }));
        }
      }
    } catch { /* activities failed — fast sources still visible */ }
    setActivitiesLoading(false);
  }, [activitiesEnabled, callCentreEnabled, demoJourneySeed, demoModeActive, journeyRequestContext, journeyRequestLimit, resolvedJourneyScope, userEmail, userInitials]);

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
  // Uses shared EventSource via useRealtimeChannel so we don't open a 2nd connection to
  // /api/data-operations/stream (Home.tsx already subscribes). Chrome's 6-per-origin SSE cap
  // means each duplicate stalls on refresh; sharing eliminates the issue.
  useRealtimeChannel(
    '/api/data-operations/stream',
    {
      event: 'dataOps.synced',
      name: 'callsAndNotes.dataOps',
      enabled: !demoModeActive && panelActivated,
      debounceMs: 1000,
      onChange: () => {
        if (journeyLoadedKeyRef.current) {
          void fetchJourney('delta');
        }
      },
    }
  );

  // Re-fetch delta when tab/panel regains visibility (catch-up).
  // journeyItems.length is a guard (don't delta before initial load) but NOT a dep —
  // having it in deps created a feedback loop (fetch → items change → re-fetch → cache hit → stop).
  useEffect(() => {
    if (demoModeActive || !panelActivated || !isDocumentVisible || journeyItems.length === 0 || isLoadingJourney || journeyLoadedKeyRef.current !== journeyFetchKey) return;
    void fetchJourney('delta');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoModeActive, fetchJourney, isDocumentVisible, isLoadingJourney, journeyFetchKey, panelActivated]);

  // ── Fetch a single saved note for inline display ──
  const fetchSavedNote = useCallback(async (recordingId: string) => {
    if (savedNoteCache[recordingId]) return savedNoteCache[recordingId];
    setLoadingSavedNote(recordingId);
    try {
      const res = await fetch(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/saved-note`);
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
  }, [dubberApiBaseUrl, savedNoteCache]);

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
        ndResult: { fileName: '[Demo] Attendance Note - Demo Client - SPA mark-up.docx', uploadedTo: 'HELIX01-01 demo workspace' },
        linkedMatterRef: 'HLX-33114-00012',
        matterChainLoading: false,
        matterChainRef: 'HLX-33114-00012',
      });
      setMatterSearch('HLX-33114-00012');
      return;
    }
    setGeneratingNoteFor(recordingId);
    setGeneratedNote(null);
    setNoteGenError(null);
    setSaveError(null);
    setUploadError(null);
    setPipeline({ saving: false, saved: false, blobUrl: null, uploading: false, uploaded: false, ndResult: null, linkedMatterRef: null, matterChainLoading: true, matterChainRef: null });
    setMatterSearch('');
    try {
      const [noteRes, chainRes] = await Promise.all([
        fetchWithTimeout(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/attendance-note`, { method: 'POST' }, 90000),
        fetchWithTimeout(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/matter-chain`, {}, 12000).catch(() => null),
      ]);
      if (noteRes?.ok) {
        const data = await noteRes.json();
        setGeneratedNote(data.note || null);
        setNoteDetailOpen(false);
        if (data.note) rootRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        let errorMsg = 'Failed to generate attendance note. Try again.';
        try {
          const errData = await noteRes.json();
          switch (errData.code) {
            case 'NO_TRANSCRIPT': errorMsg = 'No transcript available for this call. The recording may still be processing.'; break;
            case 'AI_UNAVAILABLE': errorMsg = 'AI service is temporarily unavailable. Try again in a moment.'; break;
            case 'AI_PARSE_ERROR': errorMsg = 'AI returned an unexpected response. Try again.'; break;
            case 'DB_ERROR': errorMsg = 'Unable to load call data. Try again.'; break;
          }
        } catch {
          // non-JSON response — use default message
        }
        setNoteGenError(errorMsg);
      }
      if (chainRes?.ok) {
        const chainData = await chainRes.json();
        const linkedMatterRef = chainData?.chain?.matter?.displayNumber || chainData?.chain?.instruction?.matterDisplayNumber || chainData?.chain?.instruction?.ref;
        if (linkedMatterRef) {
          setPipeline(prev => ({ ...prev, matterChainRef: linkedMatterRef, linkedMatterRef, matterChainLoading: false }));
          setMatterSearch(linkedMatterRef);
        } else {
          // No chain match — default internal calls to the admin matter
          const matchedCallItem = journeyItems.find(
            (j): j is Extract<JourneyItem, { kind: 'call' }> =>
              j.kind === 'call' && j.call.recording_id === recordingId
          );
          const isInternal = matchedCallItem?.call?.is_internal;
          if (isInternal) {
            setPipeline(prev => ({ ...prev, matterChainRef: 'HELIX01-01', linkedMatterRef: 'HELIX01-01', matterChainLoading: false }));
            setMatterSearch('HELIX01-01');
          } else {
            setPipeline(prev => ({ ...prev, matterChainLoading: false }));
          }
        }
      } else {
        setPipeline(prev => ({ ...prev, matterChainLoading: false }));
      }
    } catch (err: unknown) {
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'request timed out'
        : err instanceof Error
          ? err.message
          : 'Network error';
      setNoteGenError(`Connection error — ${msg}`);
    }
    finally { setGeneratingNoteFor(null); }
  }, [demoJourneySeed.generatedNote, demoModeActive, dubberApiBaseUrl, journeyItems]);

  // ── Search matters for picker ──
  const searchMatters = useCallback(async (q: string, options?: { includeLegacy?: boolean }) => {
    const trimmed = q.trim();
    const includeLegacy = options?.includeLegacy === true;
    if (demoModeActive) {
      if (!trimmed || trimmed.length < 2) {
        setMatterOptions([]);
        setMatterLegacyAvailable(false);
        return;
      }
      setMatterOptions([
        {
          key: 'HLX-33114-00012',
          displayNumber: 'HLX-33114-00012',
          clientName: '[Demo] Demo Client',
          description: '[Demo] Demo Client acquisition support',
          source: 'current',
        },
      ]);
      setMatterLegacyAvailable(false);
      return;
    }
    if (!trimmed || trimmed.length < 2) {
      setMatterOptions([]);
      setMatterLegacyAvailable(false);
      return;
    }
    const hasLocalMatterLookup = localMatterLookupOptions.length > 0;
    const localMatches = hasLocalMatterLookup ? filterLocalMatterLookupOptions(trimmed, 20) : [];
    const requestId = matterSearchRequestRef.current + 1;
    matterSearchRequestRef.current = requestId;
    if (localMatches.length > 0) {
      setMatterSearchLoading(false);
      setMatterOptions(localMatches);
      setMatterLegacyAvailable(false);
      return;
    }
    setMatterSearchLoading(true);
    setMatterOptions([]);
    setMatterLegacyAvailable(false);
    try {
      if (!hasLocalMatterLookup) {
        const currentRes = await fetch(`${dubberApiBaseUrl}/api/matter-operations/search?term=${encodeURIComponent(trimmed)}&limit=20`);
        const currentData = currentRes?.ok ? await currentRes.json() : null;
        const currentMatters = Array.isArray(currentData?.matters) ? currentData.matters.slice(0, 20) : [];

        if (matterSearchRequestRef.current !== requestId) return;

        if (currentMatters.length > 0) {
          setMatterOptions(currentMatters.map((matter: any) => ({
            key: matter.displayNumber || matter.display_number || matter.matterId || matter.id || '',
            displayNumber: matter.displayNumber || matter.display_number || '',
            clientName: matter.clientName || matter.client_name || '',
            description: matter.description || matter.matterDescription || '',
            source: 'current',
          })).filter((matter: MatterOption) => Boolean(matter.displayNumber || matter.key)));
          setMatterLegacyAvailable(false);
          return;
        }
      }

      const legacyRes = await fetch(`${dubberApiBaseUrl}/api/outstanding-balances/matter-search?q=${encodeURIComponent(trimmed)}&limit=${includeLegacy ? 20 : 1}`);
      const legacyData = legacyRes?.ok ? await legacyRes.json() : null;
      const legacyMatters = Array.isArray(legacyData?.results) ? legacyData.results : [];

      if (matterSearchRequestRef.current !== requestId) return;

      if (!includeLegacy) {
        setMatterOptions([]);
        setMatterLegacyAvailable(legacyMatters.length > 0);
        return;
      }

      setMatterOptions(legacyMatters.slice(0, 20).map((matter: any) => ({
        key: matter.displayNumber || matter.matterId || '',
        displayNumber: matter.displayNumber || '',
        clientName: matter.clientName || '',
        description: matter.description || '',
        source: 'legacy',
      })).filter((matter: MatterOption) => Boolean(matter.displayNumber || matter.key)));
      setMatterLegacyAvailable(false);
    } catch { /* silent */ }
    finally {
      if (matterSearchRequestRef.current === requestId) {
        setMatterSearchLoading(false);
      }
    }
  }, [demoModeActive, dubberApiBaseUrl, filterLocalMatterLookupOptions, localMatterLookupOptions.length]);

  // Debounced matter search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleMatterSearchChange = useCallback((val: string) => {
    setMatterSearch(val);
    setPipeline(prev => ({ ...prev, linkedMatterRef: val || prev.linkedMatterRef }));
    setMatterIncludeLegacy(false);
    setMatterLegacyAvailable(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => searchMatters(val), 300);
  }, [searchMatters]);

  const handleMatterLegacyReveal = useCallback(() => {
    if (!matterSearch.trim() || matterSearch.trim().length < 2) return;
    setMatterIncludeLegacy(true);
    setMatterDropdownOpen(true);
    void searchMatters(matterSearch, { includeLegacy: true });
  }, [matterSearch, searchMatters]);

  // ── Save note to Azure Storage ──
  const saveNote = useCallback(async (
    recordingId: string,
    overrides?: { note?: AttendanceNote | null; matterRef?: string | null },
    options?: { refreshJourney?: boolean },
  ) => {
    const cachedSavedNote = savedNoteCache[recordingId];
    const noteToSave = overrides?.note || (selectedCallId === recordingId ? generatedNote : null) || cachedSavedNote?.note || null;
    const matterRef = overrides?.matterRef || (selectedCallId === recordingId ? pipeline.linkedMatterRef : null) || cachedSavedNote?.meta?.matter_ref || null;
    if (!noteToSave) return { ok: false, message: 'No note to save yet.' };
    if (selectedCallId === recordingId) {
      setGeneratedNote(noteToSave);
    }
    if (matterRef) {
      setPipeline(prev => ({ ...prev, linkedMatterRef: matterRef }));
    }
    if (demoModeActive && recordingId === DEMO_JOURNEY_CALL_ID) {
      setPipeline(prev => ({
        ...prev,
        saving: false,
        saved: true,
        blobUrl: 'demo://attendance-note',
        linkedMatterRef: matterRef || prev.linkedMatterRef || 'HLX-33114-00012',
      }));
      setSavedNoteCache(prev => ({
        ...prev,
        [recordingId]: {
          note: noteToSave,
          meta: {
            matter_ref: matterRef || pipeline.linkedMatterRef || 'HLX-33114-00012',
            saved_by: userInitials,
            saved_at: new Date().toISOString(),
            uploaded_nd: cachedSavedNote?.meta?.uploaded_nd || false,
            nd_file_name: cachedSavedNote?.meta?.nd_file_name || null,
          },
        },
      }));
      return { ok: true, message: 'Saved to journey' };
    }
    setPipeline(prev => ({ ...prev, saving: true }));
    setSaveError(null);
    try {
      const res = await fetchWithTimeout(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/save-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-initials': userInitials },
        body: JSON.stringify({ note: noteToSave, matterRef }),
      }, 30000);
      if (res?.ok) {
        const data = await res.json();
        setPipeline(prev => ({ ...prev, saving: false, saved: true, blobUrl: data.blobUrl, linkedMatterRef: matterRef || prev.linkedMatterRef }));
        setSavedNoteCache(prev => ({
          ...prev,
          [recordingId]: {
            note: noteToSave,
            meta: {
              matter_ref: matterRef || cachedSavedNote?.meta?.matter_ref || null,
              saved_by: userInitials,
              saved_at: new Date().toISOString(),
              uploaded_nd: cachedSavedNote?.meta?.uploaded_nd || false,
              nd_file_name: cachedSavedNote?.meta?.nd_file_name || null,
            },
          },
        }));
        setSaveError(null);
        if (options?.refreshJourney !== false) void fetchJourney('full');
        return { ok: true, message: 'Saved to journey', blobUrl: data.blobUrl };
      } else {
        setPipeline(prev => ({ ...prev, saving: false }));
        setSaveError('Failed to save note. Try again.');
        return { ok: false, message: 'Failed to save note. Try again.' };
      }
    } catch (saveErr: unknown) {
      setPipeline(prev => ({ ...prev, saving: false }));
      const detail = saveErr instanceof DOMException && saveErr.name === 'AbortError'
        ? 'request timed out'
        : saveErr instanceof Error ? saveErr.message : 'Network error';
      console.error('[saveNote] failed:', detail);
      setSaveError(`Connection error — ${detail}`);
      return { ok: false, message: `Connection error — ${detail}` };
    }
  }, [demoModeActive, dubberApiBaseUrl, fetchJourney, generatedNote, pipeline.linkedMatterRef, savedNoteCache, selectedCallId, userInitials]);

  // ── Upload note to NetDocuments ──
  const uploadToND = useCallback(async (
    recordingId: string,
    overrides?: { note?: AttendanceNote | null; matterRef?: string | null },
    options?: { refreshJourney?: boolean },
  ) => {
    const cachedSavedNote = savedNoteCache[recordingId];
    const noteToUpload = overrides?.note || (selectedCallId === recordingId ? generatedNote : null) || cachedSavedNote?.note || null;
    const matterRef = overrides?.matterRef || (selectedCallId === recordingId ? pipeline.linkedMatterRef : null) || cachedSavedNote?.meta?.matter_ref || null;
    if (!noteToUpload || !matterRef) return { ok: false, message: 'Link a matter before uploading to NetDocuments.' };
    if (demoModeActive && recordingId === DEMO_JOURNEY_CALL_ID) {
      setPipeline(prev => ({
        ...prev,
        uploading: false,
        uploaded: true,
        ndResult: {
          fileName: '[Demo] Attendance Note - Demo Client - SPA mark-up.docx',
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
              nd_file_name: '[Demo] Attendance Note - Demo Client - SPA mark-up.docx',
            },
          },
        };
      });
      return { ok: true, message: 'Uploaded to NetDocuments', fileName: '[Demo] Attendance Note - Demo Client - SPA mark-up.docx' };
    }
    setPipeline(prev => ({ ...prev, uploading: true }));
    setUploadError(null);
    try {
      const res = await fetch(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/upload-note-nd`, {
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
        setUploadError(null);
        if (options?.refreshJourney !== false) void fetchJourney('full');
        return { ok: true, message: 'Uploaded to NetDocuments', fileName: data.fileName, uploadedTo: data.uploadedTo };
      } else {
        setPipeline(prev => ({ ...prev, uploading: false }));
        setUploadError('Failed to upload to NetDocuments. Try again.');
        return { ok: false, message: 'Failed to upload to NetDocuments. Try again.' };
      }
    } catch {
      setPipeline(prev => ({ ...prev, uploading: false }));
      setUploadError('Connection error — upload failed.');
      return { ok: false, message: 'Connection error — upload failed.' };
    }
  }, [demoModeActive, dubberApiBaseUrl, fetchJourney, generatedNote, pipeline.linkedMatterRef, savedNoteCache, selectedCallId]);

  const recordClioTimeEntry = useCallback(async (payload: AttendanceNoteBoxPayload, options?: { refreshJourney?: boolean }) => {
    if (!payload.recordClioTimeEntry) return { ok: true, skipped: true, message: 'Not requested' };
    if (demoModeActive && payload.recordingId === DEMO_JOURNEY_CALL_ID) {
      return { ok: true, message: `Recorded ${payload.chargeableMinutes} min in Clio` };
    }
    try {
      const res = await fetch(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(payload.recordingId)}/clio-time-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matterDisplayNumber: payload.matterDisplayNumber,
          chargeableMinutes: payload.chargeableMinutes,
          narrative: payload.narrative,
          date: payload.date,
          userInitials,
        }),
      });
      if (res?.ok) {
        const data = await res.json();
        if (options?.refreshJourney !== false) void fetchJourney('full');
        return {
          ok: true,
          message: data?.activity?.id ? `Activity #${data.activity.id}` : `Recorded ${payload.chargeableMinutes} min in Clio`,
        };
      }
      let message = 'Failed to record Clio time entry.';
      let retriable = true;
      try {
        const errData = await res.json();
        if (typeof errData?.error === 'string' && errData.error.trim()) {
          message = errData.error;
        }
        if (typeof errData?.retriable === 'boolean') {
          retriable = errData.retriable;
        }
      } catch {
        // non-JSON response
      }
      return { ok: false, message, retriable };
    } catch (error: unknown) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection error recording Clio time entry.',
        retriable: true,
      };
    }
  }, [demoModeActive, dubberApiBaseUrl, fetchJourney, userInitials]);

  const buildWorkspaceAttendanceNote = useCallback((call: CallRecord, payload: AttendanceNoteBoxPayload): AttendanceNote => {
    const cachedSavedNote = savedNoteCache[payload.recordingId]?.note;
    const baseNote = (selectedCallId === payload.recordingId ? generatedNote : null) || cachedSavedNote || null;
    const summary = payload.narrative.trim().slice(0, 500);
    const fallbackPartyName = externalPartyName(call);
    return {
      summary: summary || baseNote?.summary || `Call with ${fallbackPartyName}`,
      topics: baseNote?.topics || [],
      actionItems: payload.actionPoints.length > 0 ? payload.actionPoints : (baseNote?.actionItems || []),
      attendanceNote: baseNote?.attendanceNote || payload.narrative.trim(),
      duration: baseNote?.duration || Math.max(1, Math.ceil(Math.max(payload.durationSec, 0) / 60)),
      date: payload.date,
      parties: baseNote?.parties || {
        from: call.from_label || call.from_party || fallbackPartyName,
        to: call.to_label || call.to_party || userInitials || 'Helix',
      },
      teamMember: baseNote?.teamMember || userInitials || null,
      systemPrompt: baseNote?.systemPrompt,
      userPrompt: baseNote?.userPrompt,
    };
  }, [generatedNote, savedNoteCache, selectedCallId, userInitials]);

  const calls = React.useMemo(() => {
    const map = new Map<string, CallRecord>();
    for (const item of journeyItems) {
      if (item.kind === 'call') map.set(item.call.recording_id, item.call);
      if (item.kind === 'note' && item.linkedCall) map.set(item.linkedCall.recording_id, item.linkedCall);
    }
    return [...map.values()].sort((left, right) => parseJourneyTimestamp(right.start_time_utc) - parseJourneyTimestamp(left.start_time_utc));
  }, [journeyItems]);

  const handleAttendanceWorkspaceSave = useCallback(async (payload: AttendanceNoteBoxPayload) => {
    // ── Prospect target: single-leg save to prospect doc-workspace ──
    if (payload.target === 'prospect') {
      if (!payload.enquiryId) return;
      setAttendanceSaveLegs([
        { leg: 'save-note', status: 'running' },
        { leg: 'upload-nd', status: 'skipped', message: 'Prospect notes file to doc-workspace' },
        { leg: 'clio-time-entry', status: 'skipped', message: 'Not billable' },
        { leg: 'todo-reconcile', status: 'skipped', message: 'Deferred' },
      ]);

      // Build a minimal AttendanceNote from the payload narrative.
      const fallbackCall = calls.find((entry) => entry.recording_id === payload.recordingId);
      const baseNote: AttendanceNote = fallbackCall
        ? buildWorkspaceAttendanceNote(fallbackCall, payload)
        : {
            summary: payload.narrative.trim().slice(0, 500) || `Call with ${payload.contactName || 'Prospect'}`,
            topics: [],
            actionItems: payload.actionPoints,
            attendanceNote: payload.narrative.trim(),
            duration: Math.max(1, Math.ceil(Math.max(payload.durationSec, 0) / 60)),
            date: payload.date,
            parties: { from: payload.contactName || 'Prospect', to: userInitials || 'Helix' },
            teamMember: userInitials || null,
          };

      try {
        const res = await fetch(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(payload.recordingId)}/save-prospect-note`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-initials': userInitials },
          body: JSON.stringify({
            note: baseNote,
            enquiryId: payload.enquiryId,
            passcode: payload.passcode || undefined,
            contactName: payload.contactName || undefined,
          }),
        });
        if (res?.ok) {
          const data = await res.json();
          setAttendanceSaveLegs(prev => prev.map((entry) => (
            entry.leg === 'save-note'
              ? { ...entry, status: 'success' as const, message: data.filename || 'Filed to prospect workspace' }
              : entry
          )));
        } else {
          let message = 'Failed to file prospect note.';
          try { const errData = await res.json(); if (errData?.error) message = errData.error; } catch {}
          setAttendanceSaveLegs(prev => prev.map((entry) => (
            entry.leg === 'save-note' ? { ...entry, status: 'failed' as const, message, retriable: true } : entry
          )));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection error filing prospect note.';
        setAttendanceSaveLegs(prev => prev.map((entry) => (
          entry.leg === 'save-note' ? { ...entry, status: 'failed' as const, message, retriable: true } : entry
        )));
      }
      return;
    }

    // ── Matter target: existing 3-leg flow ──
    const call = calls.find((entry) => entry.recording_id === payload.recordingId);
    if (!call) return;

    const noteToPersist = buildWorkspaceAttendanceNote(call, payload);
    setGeneratedNote(noteToPersist);
    setPipeline(prev => ({ ...prev, linkedMatterRef: payload.matterDisplayNumber }));

    setAttendanceSaveLegs([
      { leg: 'save-note', status: 'running' },
      { leg: 'upload-nd', status: payload.uploadToNd ? 'idle' : 'skipped', message: payload.uploadToNd ? undefined : 'Not requested' },
      { leg: 'clio-time-entry', status: payload.recordClioTimeEntry ? 'idle' : 'skipped', message: payload.recordClioTimeEntry ? undefined : 'Not requested' },
      { leg: 'todo-reconcile', status: 'skipped', message: 'Deferred' },
    ]);

    const patchLeg = (leg: AttendanceNoteBoxSaveLegStatus['leg'], patch: Partial<AttendanceNoteBoxSaveLegStatus>) => {
      setAttendanceSaveLegs(prev => prev.map((entry) => (entry.leg === leg ? { ...entry, ...patch } : entry)));
    };

    const saveResult = await saveNote(
      payload.recordingId,
      { note: noteToPersist, matterRef: payload.matterDisplayNumber },
      { refreshJourney: false },
    );
    patchLeg('save-note', saveResult.ok
      ? { status: 'success', message: saveResult.message }
      : { status: 'failed', message: saveResult.message, retriable: true });

    if (payload.uploadToNd) {
      patchLeg('upload-nd', { status: 'running', message: undefined });
      const uploadResult = await uploadToND(
        payload.recordingId,
        { note: noteToPersist, matterRef: payload.matterDisplayNumber },
        { refreshJourney: false },
      );
      patchLeg('upload-nd', uploadResult.ok
        ? { status: 'success', message: uploadResult.fileName || uploadResult.message }
        : { status: 'failed', message: uploadResult.message, retriable: true });
    }

    if (payload.recordClioTimeEntry) {
      patchLeg('clio-time-entry', { status: 'running', message: undefined });
      const clioResult = await recordClioTimeEntry(payload, { refreshJourney: false });
      patchLeg('clio-time-entry', clioResult.ok
        ? { status: 'success', message: clioResult.message }
        : { status: 'failed', message: clioResult.message, retriable: clioResult.retriable });
    }

    void fetchJourney('full');
  }, [buildWorkspaceAttendanceNote, calls, dubberApiBaseUrl, fetchJourney, recordClioTimeEntry, saveNote, uploadToND, userInitials]);

  // ── Fetch transcript on demand ──
  const fetchTranscript = useCallback(async (recordingId: string) => {
    if (transcriptCache[recordingId]) return;
    setLoadingTranscript(recordingId);
    setTranscriptErrors(prev => { const next = { ...prev }; delete next[recordingId]; return next; });
    try {
      const res = await fetchWithTimeout(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(recordingId)}/transcript`, {}, 20000);
      if (res?.ok) {
        const data = await res.json();
        setTranscriptCache(prev => ({ ...prev, [recordingId]: data }));
      } else {
        setTranscriptErrors(prev => ({ ...prev, [recordingId]: 'Could not load transcript.' }));
      }
    } catch (err: unknown) {
      const message = err instanceof DOMException && err.name === 'AbortError'
        ? 'Transcript request timed out.'
        : 'Network error loading transcript.';
      setTranscriptErrors(prev => ({ ...prev, [recordingId]: message }));
    }
    finally { setLoadingTranscript(null); }
  }, [dubberApiBaseUrl, transcriptCache]);

  // ── Confirm resolved name ──
  const confirmName = useCallback(async (call: CallRecord) => {
    if (!call.resolved_name) return;
    const isInbound = call.call_type === 'inbound';
    const field = isInbound ? 'from_label' : 'to_label';
    setConfirming(call.recording_id);
    try {
      const res = await fetch(`${dubberApiBaseUrl}/api/dubberCalls/${encodeURIComponent(call.recording_id)}/resolve`, {
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
  }, [dubberApiBaseUrl]);

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
  const selectedCall = React.useMemo(
    () => calls.find((call) => call.recording_id === selectedCallId) || null,
    [calls, selectedCallId],
  );
  const selectedSavedNoteSummary = React.useMemo(
    () => (selectedCallId ? savedNotesByRecordingId[selectedCallId] || null : null),
    [savedNotesByRecordingId, selectedCallId],
  );
  const selectedCachedSavedNote = selectedCallId ? savedNoteCache[selectedCallId] || null : null;
  const selectedWorkspaceNote = React.useMemo(() => {
    if (!selectedCall) return null;
    if (generatedNote) return generatedNote;
    if (selectedCachedSavedNote?.note) return selectedCachedSavedNote.note;
    if (selectedSavedNoteSummary?.summary) {
      return {
        summary: selectedSavedNoteSummary.summary,
        topics: [],
        actionItems: [],
        attendanceNote: selectedSavedNoteSummary.summary,
        duration: Math.max(1, Math.ceil(Math.max(selectedCall.duration_seconds || 0, 0) / 60)),
        date: selectedSavedNoteSummary.call_date || selectedCall.start_time_utc,
        parties: {
          from: selectedCall.from_label || selectedCall.from_party || externalPartyName(selectedCall),
          to: selectedCall.to_label || selectedCall.to_party || userInitials || 'Helix',
        },
        teamMember: userInitials || null,
      } as AttendanceNote;
    }
    return null;
  }, [generatedNote, selectedCachedSavedNote, selectedCall, selectedSavedNoteSummary, userInitials]);
  const selectedWorkspaceMatter = React.useMemo(() => {
    const matterRef = pipeline.linkedMatterRef || pipeline.matterChainRef || selectedCachedSavedNote?.meta?.matter_ref || selectedSavedNoteSummary?.matter_ref || null;
    if (!matterRef) return null;
    return {
      displayNumber: matterRef,
      description: selectedWorkspaceNote?.summary || selectedSavedNoteSummary?.summary || undefined,
    };
  }, [pipeline.linkedMatterRef, pipeline.matterChainRef, selectedCachedSavedNote, selectedSavedNoteSummary, selectedWorkspaceNote]);
  const selectedTranscriptText = React.useMemo(() => {
    if (!selectedCallId) return '';
    if (loadingTranscript === selectedCallId) return 'Loading transcript…';
    const transcriptError = transcriptErrors[selectedCallId];
    if (transcriptError) return transcriptError;
    const transcript = transcriptCache[selectedCallId];
    if (!transcript) return '';
    const summaryText = transcript.summaries?.find((summary) => summary.summary_type === 'overall')?.summary_text || '';
    const sentenceText = transcript.sentences
      .map((sentence, index) => `${index + 1}. ${sentence.speaker ? `${sentence.speaker}: ` : ''}${sentence.content}`)
      .join('\n');
    return [summaryText ? `AI summary\n${summaryText}` : '', sentenceText].filter(Boolean).join('\n\n');
  }, [loadingTranscript, selectedCallId, transcriptCache, transcriptErrors]);
  const workspaceSaving = React.useMemo(
    () => attendanceSaveLegs.some((leg) => leg.status === 'running') || pipeline.saving || pipeline.uploading,
    [attendanceSaveLegs, pipeline.saving, pipeline.uploading],
  );

  const filteredJourneyItems = React.useMemo(() => {
    return journeyItems.filter((item) => matchesJourneyFilter(item, journeyFilter));
  }, [journeyFilter, journeyItems]);

  const visibleJourneyItems = React.useMemo(() => {
    if (filteredJourneyItems.length > 0 || !isLoadingJourney || lastStableJourneyItems.length === 0) {
      return filteredJourneyItems;
    }
    return lastStableJourneyItems.filter((item) => matchesJourneyFilter(item, journeyFilter));
  }, [filteredJourneyItems, isLoadingJourney, journeyFilter, lastStableJourneyItems]);

  const freshJourneyKeys = useFreshIds(visibleJourneyItems, (item) => item.key);

  const journeyFilterCounts = React.useMemo(() => ({
    all: journeyItems.length,
    external: externalCalls.length,
    internal: internalCalls.length,
    notes: savedNotes.length,
    activity: activities.length,
    emails: emailEvents.length,
  }), [activities.length, emailEvents.length, externalCalls.length, internalCalls.length, journeyItems.length, savedNotes.length]);

  const visibleJourneyFilterCounts = React.useMemo(() => {
    if (journeyItems.length > 0 || !isLoadingJourney || lastStableJourneyItems.length === 0) {
      return journeyFilterCounts;
    }
    const fallbackCalls = lastStableJourneyItems.reduce((map, item) => {
      if (item.kind === 'call') map.set(item.call.recording_id, item.call);
      if (item.kind === 'note' && item.linkedCall) map.set(item.linkedCall.recording_id, item.linkedCall);
      return map;
    }, new Map<string, CallRecord>());
    const fallbackSavedNotes = lastStableJourneyItems.filter((item): item is Extract<JourneyItem, { kind: 'note' }> => item.kind === 'note');
    const fallbackActivities = lastStableJourneyItems.filter((item): item is Extract<JourneyItem, { kind: 'activity' }> => item.kind === 'activity');
    const fallbackEmails = lastStableJourneyItems.filter((item): item is Extract<JourneyItem, { kind: 'email' }> => item.kind === 'email');
    const fallbackCallsList = [...fallbackCalls.values()];
    return {
      all: lastStableJourneyItems.length,
      external: fallbackCallsList.filter((call) => !call.is_internal).length,
      internal: fallbackCallsList.filter((call) => !!call.is_internal).length,
      notes: fallbackSavedNotes.length,
      activity: fallbackActivities.length,
      emails: fallbackEmails.length,
    };
  }, [isLoadingJourney, journeyFilterCounts, journeyItems.length, lastStableJourneyItems]);

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
  const liveStatusLabel = demoModeActive ? 'Demo' : (!panelActivated ? 'Idle' : !isDocumentVisible ? 'Paused' : isRefreshingJourney ? 'Refreshing' : 'Live');
  const canManualJourneyRefresh = panelActivated && !isLoadingJourney && !isRefreshingJourney;

  const handleManualJourneyRefresh = React.useCallback(() => {
    if (!canManualJourneyRefresh) return;
    void fetchJourney('full');
  }, [canManualJourneyRefresh, fetchJourney]);

  const openCallFromJourney = React.useCallback((call: CallRecord) => {
    setJourneyFilter(defaultJourneyFilter);
    setSelectedCallId(call.recording_id);
    resetSelectedWorkspace();
    fetchTranscript(call.recording_id);
    if (notedIds.has(call.recording_id)) fetchSavedNote(call.recording_id);
  }, [defaultJourneyFilter, fetchSavedNote, fetchTranscript, notedIds, resetSelectedWorkspace]);
  const streamDateColumnWidth = 48;
  const streamRowGap = 6;
  const streamRowPadding = '6px 8px';
  const streamDetailPadding = '0 8px 6px';
  const streamCardPadding = '6px 8px';
  const streamIconColumnWidth = 14;
  const streamAccessoryColumnWidth = 22;
  const streamViewportTrimPx = 14;
  const syncedJourneyListHeight = callCentreEnabled && !isNarrow
    ? Math.max((rightRailHeight && rightRailHeight > 0 ? rightRailHeight : 560) - streamViewportTrimPx, 280)
    : (isNarrow ? 360 : 420);

  // Billable units: 6-minute increments. Minimum 1 unit per recorded call.
  // Rate is hourly — each unit = rate / 10. Parsed once from props.
  const parsedUserRate = React.useMemo(() => {
    const raw = userRate;
    if (raw == null) return null;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [userRate]);
  const unitsForDuration = React.useCallback((seconds: number | null | undefined) => {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    if (s <= 0) return 0;
    return Math.max(1, Math.ceil(s / 360));
  }, []);
  const formatGbp = React.useCallback((amount: number) => {
    if (!Number.isFinite(amount)) return '£—';
    const rounded = Math.round(amount * 100) / 100;
    return rounded % 1 === 0 ? `£${rounded.toFixed(0)}` : `£${rounded.toFixed(2)}`;
  }, []);

  // ── Render ──
  return (
    <div ref={rootRef} data-helix-region="home/calls-and-notes" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Generating progress banner */}
        {!callCentreEnabled && generatingNoteFor && !generatedNote && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginBottom: 6,
            background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.04)',
            border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(13,47,96,0.1)'}`,
            animation: 'opsDashFadeIn 0.2s ease both',
          }}>
            <FiRefreshCw size={11} style={{ color: accent, animation: 'opsDashSpin 1s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: text, fontWeight: 600 }}>
              Generating attendance note{elapsedSeconds > 0 ? ` — ${elapsedSeconds}s` : ''}
            </span>
            <span style={{ fontSize: 9, color: muted }}>usually takes ~10s</span>
          </div>
        )}

        {/* Generated note preview (inline above call card) */}
        {!callCentreEnabled && generatedNote && (
          <div style={{ background: cardBg, border: `1px solid ${cardBorder}`, boxShadow: cardShadow, marginBottom: 6, animation: 'opsDashFadeIn 0.25s ease both' }}>
            {/* ── Header bar ── */}
            <div style={{ padding: '10px 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.4px', textTransform: 'uppercase' }}>AI Attendance Note</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: muted }}>
                  <span>{generatedNote.date}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span><FiClock size={8} style={{ marginRight: 2, verticalAlign: '-1px' }} />{generatedNote.duration}m</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{generatedNote.parties.from} → {generatedNote.parties.to}</span>
                  {generatedNote.teamMember && <><span style={{ opacity: 0.4 }}>·</span><span style={{ fontWeight: 600 }}>{generatedNote.teamMember}</span></>}
                </div>
              </div>
              <button onClick={() => setGeneratedNote(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 2, marginTop: -2 }}><FiX size={12} /></button>
            </div>

            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* ── Summary + inline topics ── */}
              <div>
                <div style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.55 }}>
                  {generatedNote.summary}
                </div>
                {generatedNote.topics.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                    {generatedNote.topics.map((t, i) => (
                      <span key={i} style={{ fontSize: 7, padding: '1px 5px', background: isDarkMode ? 'rgba(135,243,243,0.06)' : 'rgba(54,144,206,0.04)', color: isDarkMode ? 'rgba(135,243,243,0.7)' : accent, fontWeight: 600, letterSpacing: '0.2px', textTransform: 'uppercase' }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Expandable details (action items + full note + prompts) ── */}
              <div>
                <button
                  onClick={() => setNoteDetailOpen(prev => !prev)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: 9, fontWeight: 600, color: muted, letterSpacing: '0.3px',
                  }}
                >
                  {noteDetailOpen ? <FiChevronDown size={10} /> : <FiChevronRight size={10} />}
                  Full note{generatedNote.actionItems.length > 0 ? ` · ${generatedNote.actionItems.length} action items` : ''}
                </button>

                {noteDetailOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                    {/* Action Items */}
                    {generatedNote.actionItems.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: muted, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Action Items</span>
                        {generatedNote.actionItems.map((a, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 10, color: text, lineHeight: 1.45 }}>
                            <span style={{ color: accent, fontSize: 6, marginTop: 4, flexShrink: 0 }}>●</span>
                            <span>{a}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Full Attendance Note */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: muted, letterSpacing: '0.4px', textTransform: 'uppercase' }}>Attendance Note</span>
                        <button
                          onClick={() => {
                            const blob = new Blob([generatedNote.attendanceNote], { type: 'text/plain' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `attendance-note-${selectedCallId || 'draft'}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          title="Download attendance note"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: '0 2px', display: 'flex', alignItems: 'center' }}
                        >
                          <FiDownload size={9} />
                        </button>
                      </div>
                      <div style={{
                        fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.6,
                        padding: '8px 10px',
                        background: isDarkMode ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.015)',
                        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                        whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto',
                        fontFamily: 'Raleway, sans-serif',
                      }}>
                        {generatedNote.attendanceNote}
                      </div>
                    </div>

                    {/* Prompt Inspector */}
                    {(generatedNote.systemPrompt || generatedNote.userPrompt) && (
                      <NotePromptInspector
                        systemPrompt={generatedNote.systemPrompt || ''}
                        userPrompt={generatedNote.userPrompt || ''}
                        isDarkMode={isDarkMode}
                        accent={accent}
                        text={text}
                        muted={muted}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── Matter Picker ── */}
              <div ref={matterPickerRef} style={{ position: 'relative', borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`, paddingTop: 6 }}>
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
                {matterDropdownOpen && matterSearch.trim().length >= 2 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20,
                    background: isDarkMode ? '#081c30' : '#fff',
                    border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)'}`,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: 160, overflow: 'auto',
                  }}>
                    {!matterSearchLoading && matterOptions.length === 0 && !matterLegacyAvailable && (
                      <div style={{ padding: '7px 8px', fontSize: 10, color: muted }}>
                        {matterIncludeLegacy ? 'No legacy matters found.' : 'No current matters found.'}
                      </div>
                    )}
                    {!matterSearchLoading && matterOptions.length === 0 && matterLegacyAvailable && (
                      <div style={{ padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, color: muted }}>No current matters found.</div>
                        <button
                          type="button"
                          onClick={handleMatterLegacyReveal}
                          style={{
                            alignSelf: 'flex-start',
                            padding: '4px 8px',
                            background: 'transparent',
                            border: `1px solid ${cardBorder}`,
                            color: accent,
                            cursor: 'pointer',
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            fontFamily: 'Raleway, sans-serif',
                            borderRadius: 0,
                          }}
                        >
                          Check legacy matters?
                        </button>
                      </div>
                    )}
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
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '1px 5px',
                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(6,23,51,0.14)'}`,
                            background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.03)',
                            color: muted,
                            borderRadius: 0,
                          }}
                        >
                          {opt.source === 'legacy' ? 'Legacy' : 'Current'}
                        </span>
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

              {/* Save / upload error feedback */}
              {saveError && !pipeline.saved && (
                <div style={{ fontSize: 9, color: colours.cta, padding: '2px 0' }}>{saveError}</div>
              )}
              {uploadError && !pipeline.uploaded && (
                <div style={{ fontSize: 9, color: colours.cta, padding: '2px 0' }}>{uploadError}</div>
              )}
            </div>
          </div>
        )}

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '2px 0 3px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="home-section-header" style={{ minWidth: 0 }}>
            <FiPhone className="home-section-header-icon" />
            {callCentreEnabled ? 'Call Centre' : 'Activity'}
          </span>

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
                    // Re-apply the scope-appropriate default filter: Mine shows
                    // everything (including team↔team internal calls); Team defaults
                    // to external-only so office chatter does not swamp the feed.
                    if (callCentreEnabled) {
                      setJourneyFilter(scopeOption.key === 'user' ? 'all' : 'external');
                    }
                  }}
                  title={scopeOption.key === 'all' ? (callCentreEnabled ? 'Show team calls' : 'Show team activity') : (callCentreEnabled ? 'Show only my calls' : 'Show only my activity')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    border: `1px solid ${active ? (isDarkMode ? 'rgba(54,144,206,0.55)' : 'rgba(54,144,206,0.32)') : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.08)')}`,
                    background: active ? (isDarkMode ? 'rgba(13,47,96,0.55)' : 'rgba(214,232,255,0.6)') : 'transparent',
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
              title={canManualJourneyRefresh ? (callCentreEnabled ? 'Refresh call centre now' : 'Refresh activity now') : `${callCentreEnabled ? 'Call Centre' : 'Activity'} ${liveStatusLabel.toLowerCase()}`}
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
              {isRefreshingJourney || isLoadingJourney || activitiesLoading ? (
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
            {!callCentreEnabled && ([
              { key: 'all', label: 'All', count: journeyFilterCounts.all, icon: <FiPhone size={9} style={{ color: accent, opacity: 0.86 }} /> },
              { key: 'external', label: 'External', count: journeyFilterCounts.external, icon: <FiPhoneIncoming size={9} style={{ color: accent, opacity: 0.9 }} /> },
              { key: 'internal', label: 'Internal', count: journeyFilterCounts.internal, icon: <FiLink size={9} style={{ color: muted, opacity: 0.92 }} /> },
              { key: 'notes', label: 'Notes', count: journeyFilterCounts.notes, icon: <FiFileText size={9} style={{ color: colours.orange, opacity: 0.9 }} /> },
              { key: 'emails', label: 'Emails', count: journeyFilterCounts.emails, icon: <FiMail size={9} style={{ color: colours.green, opacity: 0.9 }} /> },
              ...(activitiesEnabled ? [{ key: 'activity' as const, label: 'Activity', count: journeyFilterCounts.activity, icon: activitiesLoading
                ? <FiRefreshCw size={9} style={{ color: muted, opacity: 0.7, animation: 'opsDashSpin 1s linear infinite' }} />
                : <img src={clioLogo} alt="Clio" style={{ width: 10, height: 10, opacity: isDarkMode ? 0.88 : 0.72, filter: clioLogoFilter }} /> }] : []),
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
                    border: `1px solid ${active ? (isDarkMode ? 'rgba(54,144,206,0.32)' : 'rgba(54,144,206,0.22)') : (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.07)')}`,
                    background: active ? (isDarkMode ? 'rgba(13,47,96,0.4)' : 'rgba(214,232,255,0.45)') : 'transparent',
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
            {callCentreEnabled && (
                <span className="helix-eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: muted, opacity: 0.82, lineHeight: 1.1 }}>
                <FiPhoneIncoming size={9} style={{ color: accent, opacity: 0.9 }} />
                External Calls
                <span style={{ opacity: 0.72, fontVariantNumeric: 'tabular-nums' }}>{visibleJourneyFilterCounts.external}</span>
              </span>
            )}
            {journeyMeta.generatedAt && !isLoadingJourney && (
              <span style={{ marginLeft: 'auto', fontSize: 8, color: muted, opacity: 0.7, whiteSpace: 'nowrap', alignSelf: 'center', fontVariantNumeric: 'tabular-nums' }}>
                as of {new Date(journeyMeta.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: LONDON_TIMEZONE })}
              </span>
            )}
          </div>
          <div style={{ display: callCentreEnabled ? 'grid' : 'block', gridTemplateColumns: callCentreEnabled && !isNarrow ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr', alignItems: callCentreEnabled && !isNarrow ? 'stretch' : 'start', flex: 1, minHeight: 0 }}>
          <div ref={scrollRef} className="ops-dash-scroll" style={{ minHeight: 0, overflowY: 'auto', overflowX: 'hidden', maxHeight: syncedJourneyListHeight, height: callCentreEnabled && !isNarrow ? `calc(100% - ${streamViewportTrimPx}px)` : undefined, paddingBottom: callCentreEnabled && !isNarrow ? 8 : 0, boxSizing: 'border-box', borderRight: callCentreEnabled && !isNarrow ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.06)'}` : 'none', scrollPaddingBottom: 24 }}>
            {!panelActivated ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 }}>
                <FiPhone size={12} style={{ color: muted, opacity: 0.45 }} />
                <span style={{ fontSize: 10, color: muted }}>Loads when visible</span>
              </div>
            ) : (journeyError && visibleJourneyItems.length === 0) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 14px', gap: 8 }}>
                <span style={{ fontSize: 10, color: colours.cta }}>{journeyError}</span>
                <button
                  onClick={() => { setJourneyError(null); void fetchJourney('full'); }}
                  style={{ fontSize: 9, fontWeight: 600, padding: '4px 10px', background: isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.06)', border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(13,47,96,0.1)'}`, color: accent, cursor: 'pointer' }}
                >
                  Retry
                </button>
              </div>
            ) : (isLoadingJourney && visibleJourneyItems.length === 0) ? (
              <div aria-label="Loading calls & notes" style={{ display: 'flex', flexDirection: 'column' }}>
                {Array.from({ length: 8 }).map((_, i) => {
                  const skelBlock = isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.06)';
                  const skelLine = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(6,23,51,0.08)';
                  const pulseStyle: React.CSSProperties = { animation: 'opsDashPulse 1.4s ease-in-out infinite', animationDelay: `${i * 0.08}s` };
                  return (
                    <div
                      key={`skel-${i}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`,
                        gap: streamRowGap,
                        padding: streamRowPadding,
                        borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3 }}>
                        <div style={{ ...pulseStyle, height: 8, width: 32, background: skelLine }} />
                        <div style={{ ...pulseStyle, height: 6, width: 24, background: skelBlock, opacity: 0.7 }} />
                      </div>
                      <div
                        style={{
                          padding: streamCardPadding,
                          background: 'transparent',
                          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(6,23,51,0.04)'}`,
                          borderLeft: `2px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(6,23,51,0.08)'}`,
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: `${streamIconColumnWidth}px minmax(0, 1fr) auto`, alignItems: 'center', gap: 6 }}>
                          <div style={{ ...pulseStyle, width: 10, height: 10, borderRadius: '50%', background: skelLine }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                            <div style={{ ...pulseStyle, height: 9, width: `${55 + ((i * 7) % 30)}%`, background: skelLine }} />
                            <div style={{ ...pulseStyle, height: 7, width: `${35 + ((i * 5) % 20)}%`, background: skelBlock, opacity: 0.7 }} />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', columnGap: 4, flexShrink: 0 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, order: 1 }}>
                              <div style={{ ...pulseStyle, width: 32, height: 8, background: skelBlock }} />
                              <div style={{ ...pulseStyle, width: 18, height: 6, background: skelBlock, opacity: 0.6 }} />
                            </div>
                            {callCentreEnabled ? (
                              <>
                                <div style={{ ...pulseStyle, minHeight: 30, width: 100, background: skelLine, order: 2 }} />
                                <div style={{ ...pulseStyle, minHeight: 30, width: 100, background: skelBlock, order: 3 }} />
                              </>
                            ) : (
                              <>
                                <div style={{ ...pulseStyle, width: 48, height: 18, background: skelLine, order: 2 }} />
                                <div style={{ ...pulseStyle, width: streamAccessoryColumnWidth, height: 8, background: skelBlock, order: 3, opacity: 0.5 }} />
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : visibleJourneyItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 14px', gap: 4 }}>
                <FiPhone size={16} style={{ color: muted, opacity: 0.4 }} />
                <span style={{ fontSize: 10, color: muted }}>No {emptyJourneyLabel}</span>
              </div>
            ) : (
              <>
                {journeyWarnings && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', marginBottom: 4, fontSize: 9, color: colours.orange, background: isDarkMode ? 'rgba(255,140,0,0.06)' : 'rgba(255,140,0,0.03)', border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.08)'}` }}>
                    Some data sources unavailable: {Object.values(journeyWarnings).join('; ')}
                  </div>
                )}
                {visibleJourneyItems.map((item, i) => {
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
                    // Time-entry filing status: did we see a Clio TimeEntry activity
                    // for this call's date + matter ref?
                    const hasTimeEntry = Boolean(
                      savedNoteSummary?.call_date
                      && savedNoteSummary?.matter_ref
                      && timeEntryKeys.has(`${savedNoteSummary.call_date}:${savedNoteSummary.matter_ref}`),
                    );
                    const canInlineUpload = !isUploadingInline && !hasNdCue && (Boolean(inlineUploadNote && inlineUploadMatterRef) || hasPersistedCraft);
                    const craftTone = hasPersistedCraft ? colours.orange : accent;
                    const ndTone = hasNdCue ? colours.green : muted;
                    const uploadTone = hasNdCue ? colours.green : (canInlineUpload ? accent : muted);
                    const craftLabel = isGeneratingInline ? 'Craft…' : hasPersistedCraft ? 'Saved' : 'Craft';
                    const ndLabel = 'ND';
                    const uploadLabel = 'Upload';
                    const actionBoxBaseStyle: React.CSSProperties = callCentreEnabled ? {
                      // ~2x button weight — bigger hit target, readable label.
                      // Full 10x is unachievable in the row budget without
                      // changing layout; Cut 2 moves the primary action into
                      // a dedicated column and can go bigger still.
                      minHeight: 30,
                      padding: '6px 12px',
                      display: 'grid',
                      gridTemplateColumns: '8px auto',
                      alignItems: 'center',
                      justifyContent: 'center',
                      columnGap: 7,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
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
                    } : {
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
                        <div data-fresh={freshJourneyKeys.has(item.key) ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: freshJourneyKeys.has(item.key) ? 'opsDashRowFade 0.2s ease both' : undefined }}>
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, color: muted }}>
                            <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.05, color: stamp.secondary ? text : muted }}>{stamp.primary}</span>
                            <span style={{ fontSize: 7, lineHeight: 1.05, opacity: stamp.secondary ? 0.82 : 0.45 }}>{stamp.secondary || '—'}</span>
                          </div>
                          <div
                            onClick={() => {
                              const nextId = isSelected ? null : call.recording_id;
                              setSelectedCallId(nextId);
                              resetSelectedWorkspace();
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
                              background: isSelected ? (isDarkMode ? 'rgba(13,47,96,0.5)' : 'rgba(214,232,255,0.55)') : 'transparent',
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
                              <div style={{ display: 'flex', alignItems: 'center', columnGap: 4, minWidth: 0, flexShrink: 0 }}>
                                {(() => {
                                  const units = unitsForDuration(call.duration_seconds);
                                  return (
                                    <span
                                      style={{ minWidth: 42, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0, order: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}
                                      title={`Duration ${formatDuration(call.duration_seconds)} · ${units} billable unit${units === 1 ? '' : 's'} (6 min each)`}
                                    >
                                      <span style={{ fontSize: 9, color: muted }}>{formatDuration(call.duration_seconds)}</span>
                                      <span style={{ fontSize: 8, color: muted, opacity: 0.7, marginTop: 1 }}>{units > 0 ? `${units}u` : '—'}</span>
                                    </span>
                                  );
                                })()}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3, minWidth: 0, order: callCentreEnabled ? 3 : 2 }}>
                                  {callCentreEnabled ? (
                                    <>
                                      {(() => {
                                        const units = unitsForDuration(call.duration_seconds);
                                        const amount = parsedUserRate != null && units > 0 ? (units * parsedUserRate) / 10 : null;
                                        // £ pill tracks filing status. Pending: "Record Time · £x".
                                        // Done: "{N} units · £x recorded".
                                        const costLit = hasTimeEntry;
                                        const amountLabel = amount != null ? formatGbp(amount) : null;
                                        const costLabel = costLit
                                          ? (amountLabel
                                            ? `${units} unit${units === 1 ? '' : 's'} · ${amountLabel}`
                                            : `${units} unit${units === 1 ? '' : 's'} recorded`)
                                          : (amountLabel ? `Record Time · ${amountLabel}` : 'Record Time');
                                        const costBorder = costLit
                                          ? (isDarkMode ? 'rgba(135,243,243,0.22)' : 'rgba(54,144,206,0.2)')
                                          : cardBorder;
                                        const costBg = costLit
                                          ? (isDarkMode ? 'rgba(135,243,243,0.08)' : 'rgba(54,144,206,0.06)')
                                          : 'transparent';
                                        const costColor = costLit ? (isDarkMode ? accent : colours.highlight) : muted;
                                        return (
                                          <span
                                            style={{
                                              ...actionBoxBaseStyle,
                                              minWidth: 96,
                                              padding: '6px 10px',
                                              border: `1px solid ${costBorder}`,
                                              background: costBg,
                                              color: costColor,
                                              cursor: 'default',
                                              opacity: 1,
                                            }}
                                            title={costLit
                                              ? `Clio time entry recorded · ${units} unit${units === 1 ? '' : 's'}${amountLabel ? ` · ${amountLabel} at £${parsedUserRate}/hr` : ''}`
                                              : amountLabel
                                                ? `No Clio time entry yet · suggested ${units} unit${units === 1 ? '' : 's'} (${amountLabel}) at £${parsedUserRate}/hr`
                                                : 'No Clio time entry yet — open this call to record time'}
                                          >
                                            <img
                                              src={clioLogo}
                                              alt=""
                                              style={{ width: 10, height: 10, opacity: costLit ? 0.95 : 0.6, filter: clioLogoFilter, flexShrink: 0 }}
                                            />
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{costLabel}</span>
                                          </span>
                                        );
                                      })()}
                                      <span
                                        style={{
                                          ...actionBoxBaseStyle,
                                          gridTemplateColumns: '6px auto',
                                          minWidth: 96,
                                          padding: '6px 10px',
                                          border: `1px solid ${hasNdCue
                                            ? (isDarkMode ? 'rgba(32,178,108,0.22)' : 'rgba(32,178,108,0.14)')
                                            : cardBorder}`,
                                          background: hasNdCue
                                            ? (isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.04)')
                                            : 'transparent',
                                          color: hasNdCue ? colours.green : muted,
                                          cursor: 'default',
                                          opacity: hasNdCue ? 1 : 0.8,
                                        }}
                                        title={hasNdCue ? 'Attendance note uploaded to NetDocuments' : 'Not yet uploaded to NetDocuments'}
                                      >
                                        <span style={ndDotStyle} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{hasNdCue ? 'Saved to File' : 'Save to File'}</span>
                                      </span>
                                    </>
                                  ) : (
                                    <>
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
                                    </>
                                  )}
                                </div>
                                <div style={{ width: streamAccessoryColumnWidth, minWidth: streamAccessoryColumnWidth, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2, order: callCentreEnabled ? 2 : 3 }}>
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

                        {isSelected && !callCentreEnabled && (
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
                            const tError = transcriptErrors[call.recording_id];
                            if (isLoading) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 6px', fontSize: 9, color: muted }}>
                                  <FiRefreshCw size={9} style={{ animation: 'opsDashSpin 1s linear infinite' }} />
                                  Loading transcript{elapsedSeconds > 0 ? ` (${elapsedSeconds}s)` : ''}…
                                </div>
                              );
                            }
                            if (tError) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 6px', fontSize: 9, color: colours.cta }}>
                                  {tError}
                                  <span onClick={() => fetchTranscript(call.recording_id)} style={{ cursor: 'pointer', textDecoration: 'underline', color: accent }}>Retry</span>
                                </div>
                              );
                            }
                            if (!td) return null;
                            const hasSentences = td.sentences.length > 0;
                            const aiSummaryOnly = !hasSentences && td.summaries?.some(s => s.summary_type === 'overall');
                            if (!hasSentences && !aiSummaryOnly) return null;

                            // Show AI summary if available
                            const aiSummary = td.summaries?.find(s => s.summary_type === 'overall');

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
                                {hasSentences && (<>
                                <div style={{ fontSize: 8, fontWeight: 700, color: muted, letterSpacing: '0.4px', marginBottom: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span>TRANSCRIPT · {td.sentences.length} sentences</span>
                                  <button
                                    onClick={() => {
                                      const lines = td.sentences.map((s, i) => `${i + 1}. ${s.speaker ? s.speaker + ': ' : ''}${s.content}`).join('\n');
                                      const blob = new Blob([lines], { type: 'text/plain' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `transcript-${call.recording_id}.txt`;
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    }}
                                    title="Download transcript as .txt"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: '0 2px', display: 'flex', alignItems: 'center' }}
                                  >
                                    <FiDownload size={9} />
                                  </button>
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
                                </>)}
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

                          {/* Note generation error */}
                          {noteGenError && selectedCallId === call.recording_id && !generatingNoteFor && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', marginBottom: 4, fontSize: 9, color: colours.cta, background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.04)', border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.1)'}` }}>
                              {noteGenError}
                            </div>
                          )}
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
                            ) : (savedNoteCache[call.recording_id] || (generatedNote && selectedCallId === call.recording_id)) ? (
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
                      <div key={item.key} data-fresh={freshJourneyKeys.has(item.key) ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: freshJourneyKeys.has(item.key) ? 'opsDashRowFade 0.2s ease both' : undefined }}>
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
                      <div key={item.key} data-fresh={freshJourneyKeys.has(item.key) ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: freshJourneyKeys.has(item.key) ? 'opsDashRowFade 0.2s ease both' : undefined }}>
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
                    <div key={item.key} data-fresh={freshJourneyKeys.has(item.key) ? 'true' : undefined} style={{ display: 'grid', gridTemplateColumns: `${streamDateColumnWidth}px minmax(0, 1fr)`, gap: streamRowGap, padding: streamRowPadding, borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`, animation: freshJourneyKeys.has(item.key) ? 'opsDashRowFade 0.2s ease both' : undefined }}>
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
                {/* Bottom spacer: guarantees the last row clears the scroll-port
                    edge so it can never appear half-clipped against the
                    rightRailHeight cap (subpixel rounding + border math). */}
                <div aria-hidden="true" style={{ flex: '0 0 16px', height: 16 }} />
              </>
            )}
          </div>
          {callCentreEnabled && (
            <div
              ref={rightRailRef}
              data-helix-region="home/calls-and-notes/right-rail"
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                // Let the rail grow with the (always-rendered) filing form.
                maxHeight: 'none',
                overflow: 'visible',
                borderTop: isNarrow ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(6,23,51,0.06)'}` : 'none',
                background: isDarkMode ? 'rgba(2,6,23,0.32)' : 'rgba(244,244,246,0.65)',
              }}
            >
              {!selectedCall ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, padding: '10px 10px 12px' }}>
                  <div style={{ minHeight: 0, flex: 1, display: 'flex' }}>
                    <AttendanceNoteBox
                      variant="embedded"
                      isDarkMode={isDarkMode}
                      userInitials={userInitials}
                      recordingId={manualRecordingId}
                      callDate={new Date().toISOString()}
                      durationSec={0}
                      isBlankDraft
                      generatedSummary=""
                      generatedBody=""
                      actionItems={[]}
                      transcriptText=""
                      matterOptions={localMatterLookupOptions}
                      saveLegs={attendanceSaveLegs}
                      saving={workspaceSaving}
                      onClose={() => {
                        setAttendanceSaveLegs([]);
                        // Rotate the draft id so toggles/state reset cleanly.
                        try {
                          const u = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                          setManualRecordingId(`manual-${u}`);
                        } catch { setManualRecordingId(`manual-${Date.now()}`); }
                      }}
                      onSave={handleAttendanceWorkspaceSave}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, padding: '10px 10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '2px 2px 0' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{externalPartyName(selectedCall)}</span>
                      <span style={{ fontSize: 9, color: muted, lineHeight: 1.4 }}>
                        {selectedCall.call_type === 'inbound' ? 'Incoming call' : 'Outgoing call'} · {formatDate(selectedCall.start_time_utc)} · {formatTime(selectedCall.start_time_utc)} · {formatDuration(selectedCall.duration_seconds)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {(selectedSavedNoteSummary || selectedCachedSavedNote || pipeline.saved) && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', background: isDarkMode ? 'rgba(255,140,0,0.08)' : 'rgba(255,140,0,0.05)', border: `1px solid ${isDarkMode ? 'rgba(255,140,0,0.18)' : 'rgba(255,140,0,0.12)'}`, color: colours.orange, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Filed</span>
                        )}
                        {(selectedSavedNoteSummary?.uploaded_nd || selectedCachedSavedNote?.meta?.uploaded_nd || pipeline.uploaded) && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', background: isDarkMode ? 'rgba(32,178,108,0.08)' : 'rgba(32,178,108,0.05)', border: `1px solid ${isDarkMode ? 'rgba(32,178,108,0.18)' : 'rgba(32,178,108,0.12)'}`, color: colours.green, letterSpacing: '0.04em', textTransform: 'uppercase' }}>ND</span>
                        )}
                        {attendanceSaveLegs.some((leg) => leg.leg === 'clio-time-entry' && leg.status === 'success') && (
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.05)', border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.12)'}`, color: accent, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Clio</span>
                        )}
                        {selectedWorkspaceMatter && (
                          <span style={{ fontSize: 8, color: accent, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            {selectedWorkspaceMatter.displayNumber}{pipeline.matterChainRef === selectedWorkspaceMatter.displayNumber ? ' · auto-linked' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void generateNote(selectedCall.recording_id)}
                      disabled={generatingNoteFor === selectedCall.recording_id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 10px',
                        background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(13,47,96,0.04)',
                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.14)'}`,
                        color: accent,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        cursor: generatingNoteFor === selectedCall.recording_id ? 'wait' : 'pointer',
                        fontFamily: 'Raleway, sans-serif',
                        opacity: generatingNoteFor === selectedCall.recording_id ? 0.7 : 1,
                      }}
                    >
                      {generatingNoteFor === selectedCall.recording_id ? <FiRefreshCw size={10} style={{ animation: 'opsDashSpin 1s linear infinite' }} /> : <FiEdit3 size={10} />}
                      {selectedWorkspaceNote ? 'Regenerate note' : 'Generate note'}
                    </button>
                  </div>

                  {noteGenError && selectedCallId === selectedCall.recording_id && !generatingNoteFor && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', fontSize: 9, color: colours.cta, background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.04)', border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.1)'}` }}>
                      {noteGenError}
                    </div>
                  )}

                  {!selectedWorkspaceNote && generatingNoteFor !== selectedCall.recording_id && (
                    <div style={{ padding: '6px 8px', fontSize: 9, color: muted, lineHeight: 1.5, background: isDarkMode ? 'rgba(54,144,206,0.05)' : 'rgba(13,47,96,0.03)', border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.12)' : 'rgba(13,47,96,0.08)'}` }}>
                      Generate a note to prefill the narrative and action points, or file manually using the workspace below.
                    </div>
                  )}

                  <div style={{ minHeight: 0, flex: 1, display: 'flex' }}>
                    <AttendanceNoteBox
                      variant="embedded"
                      isDarkMode={isDarkMode}
                      userInitials={userInitials}
                      recordingId={selectedCall.recording_id}
                      callDate={selectedCall.start_time_utc}
                      durationSec={selectedCall.duration_seconds || 0}
                      generatedSummary={selectedWorkspaceNote?.summary || ''}
                      generatedBody={selectedWorkspaceNote?.attendanceNote || ''}
                      actionItems={selectedWorkspaceNote?.actionItems || []}
                      transcriptText={selectedTranscriptText}
                      prefillMatter={selectedWorkspaceMatter}
                      matterOptions={localMatterLookupOptions}
                      saveLegs={attendanceSaveLegs}
                      saving={workspaceSaving}
                      onClose={() => {
                        setSelectedCallId(null);
                        resetSelectedWorkspace();
                      }}
                      onSave={handleAttendanceWorkspaceSave}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
