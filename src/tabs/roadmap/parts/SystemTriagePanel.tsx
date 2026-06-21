import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colours } from '../../../app/styles/colours';
import { fetchAuditTeam, type TeamMember } from '../../../utils/auditClient';
import { buildRequestAuthHeaders } from '../../../utils/requestAuthContext';

type RangePreset = '5m' | '30m' | '1h' | '6h' | 'today' | 'yesterday' | 'week' | 'custom';
type Severity = 'critical' | 'warning' | 'notice' | 'clear';
type EvidenceTone = 'danger' | 'warning' | 'info';
export type SystemTriageEvidenceFilter = 'all' | 'server-errors' | 'client-errors' | 'slow-routes' | 'sessions';

interface TriageIssue {
  id: string;
  severity: Severity;
  title: string;
  summary: string;
  recommendedAction: string;
}

interface TriageCatalogAction {
  kind: 'retrigger-submission' | 'open-form-detail' | 'open-schema-ref' | 'copy-curl' | 'none';
  label: string;
  payload?: Record<string, unknown>;
}

interface TriageCatalogMatch {
  headline: string;
  explanation: string;
  action: TriageCatalogAction;
}

interface TriageEvidence {
  id: string;
  ts: string;
  source: string;
  categories?: SystemTriageEvidenceFilter[];
  tone: EvidenceTone;
  title: string;
  detail: string;
  user: string | null;
  path: string | null;
  status: number | null;
  durationMs: number | null;
  sessionId: string | null;
  exceptionType?: string | null;
  scope?: 'user' | 'global';
  submissionId?: string | null;
  clientSubmissionId?: string | null;
  formKey?: string | null;
  instructionRef?: string | null;
  route?: string | null;
  payloadFingerprint?: string | null;
  incidentKey?: string | null;
  incidentTitle?: string | null;
  incidentPriority?: number | null;
  catalogMatch?: TriageCatalogMatch | null;
}

type IncidentState = 'new' | 'acknowledged' | 'resolved';

interface UserSubmissionRow {
  id: string;
  formKey: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  summary: string | null;
  processingStatus: string | null;
  lastEvent: string | null;
  lastEventAt: string | null;
  retriggerCount: number;
  lastStep?: { name: string | null; status: string | null; error: string | null } | null;
}

interface Incident {
  signature: string;
  title: string;
  detail: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  affectedInitials: string[];
  tone: EvidenceTone;
  scope: 'user' | 'global' | 'mixed';
  status: number | null;
  durationMs: number | null;
  source: string;
  incidentPriority: number;
  rows: TriageEvidence[];
  catalogMatch?: TriageCatalogMatch | null;
}

interface SourceBreakdown {
  key: 'live' | 'local' | 'appInsights';
  label: string;
  status: string;
  colour: string;
  detail: string;
  rows: number;
  issueRows: number;
  lastSeen: string | null;
  returnedRows?: number;
}

const INCIDENT_STATE_STORAGE_KEY = 'helix.systemErrors.incidentState.v1';

const TRIAGE_LOADING_STYLE_ID = 'helix-triage-loading-keyframes';
if (typeof document !== 'undefined' && !document.getElementById(TRIAGE_LOADING_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = TRIAGE_LOADING_STYLE_ID;
  style.textContent = `
@keyframes helixTriageBarSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(220%); } }
@keyframes helixTriageShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes helixTriagePulse { 0%, 100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 1; transform: scale(1.35); } }
@keyframes helixTriageDots { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
@keyframes helixTriageSpin { to { transform: rotate(360deg); } }
@keyframes helixTriageFadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
`;
  document.head.appendChild(style);
}

const TRIAGE_LOADING_STAGES = [
  'Reaching live request log',
  'Scanning local telemetry',
  'Querying staging Log Analytics',
  'Clustering incidents',
];

const RANGE_PRESETS: RangePreset[] = ['5m', '30m', '1h', '6h', 'today', 'yesterday', 'week', 'custom'];

const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  '5m': '5 minutes',
  '30m': '30 minutes',
  '1h': 'Last hour',
  '6h': 'Last 6h',
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  custom: 'Custom',
};

function loadIncidentStateMap(): Record<string, IncidentState> {
  try {
    const raw = window.sessionStorage.getItem(INCIDENT_STATE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, IncidentState>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistIncidentStateMap(map: Record<string, IncidentState>) {
  try {
    window.sessionStorage.setItem(INCIDENT_STATE_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable; ignore
  }
}

function normaliseMessage(input: string): string {
  if (!input) return '';
  return input
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<guid>')
    .replace(/'[^']{1,80}'/g, "'<id>'")
    .replace(/\b\d{4,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function signatureFor(event: TriageEvidence): { signature: string; title: string } {
  if (event.incidentKey) {
    return { signature: event.incidentKey, title: event.incidentTitle || normaliseMessage(event.title || event.detail || 'Incident') || 'Incident' };
  }
  const sourceLower = (event.source || '').toLowerCase();
  if (sourceLower.includes('request')) {
    const method = (event.title || '').split(' ')[0] || 'REQ';
    const path = event.path || (event.title || '').split(' ').slice(1).join(' ') || event.title;
    const status = event.status != null ? event.status : '?';
    return { signature: `req::${method} ${path} ${status}`, title: `${method} ${path}  (${status})` };
  }
  if (sourceLower.includes('exception') || /exception|error/i.test(event.title || '')) {
    const type = event.exceptionType || (event.title || '').split(/\s+at\s+/)[0] || 'Exception';
    const message = normaliseMessage(event.detail || event.title || '');
    return { signature: `exc::${type}::${message}`, title: message ? `${type}: ${message}` : type };
  }
  const title = normaliseMessage(event.title || 'Event');
  return { signature: `evt::${title}`, title };
}

function eventIncidentPriority(event: TriageEvidence): number {
  if (typeof event.incidentPriority === 'number' && Number.isFinite(event.incidentPriority)) return event.incidentPriority;
  const text = `${event.title || ''} ${event.detail || ''} ${event.path || ''}`;
  if (event.catalogMatch) return 0;
  if (/MatterOpening|CompactMatterWizard|Invalid practice area|Asana credentials missing|UpdateATY-CWO|api\/updateaty-cwo|Invalid (column|object) name|SQL schema mismatch/i.test(text)) return 1;
  if (event.status != null && event.status >= 500) return 10;
  if (event.categories?.includes('server-errors')) return 12;
  if (event.categories?.includes('client-errors')) return /eventsource-error|stream error|Realtime\./i.test(text) ? 35 : 20;
  if (event.categories?.includes('slow-routes')) return 70;
  return 80;
}

function clusterEvidence(evidence: TriageEvidence[]): Incident[] {
  const map = new Map<string, Incident>();
  evidence.forEach((event) => {
    const { signature, title } = signatureFor(event);
    const existing = map.get(signature);
    const userScope = event.scope || 'user';
    const initialsUpper = (event.user || '').toString().toUpperCase().trim();
    const priority = eventIncidentPriority(event);
    if (existing) {
      existing.count += 1;
      existing.rows.push(event);
      existing.incidentPriority = Math.min(existing.incidentPriority, priority);
      if (event.ts > existing.lastSeen) existing.lastSeen = event.ts;
      if (event.ts < existing.firstSeen) existing.firstSeen = event.ts;
      if (initialsUpper && !existing.affectedInitials.includes(initialsUpper)) existing.affectedInitials.push(initialsUpper);
      if (event.tone === 'danger') existing.tone = 'danger';
      else if (event.tone === 'warning' && existing.tone !== 'danger') existing.tone = 'warning';
      if (existing.scope !== userScope) existing.scope = 'mixed';
      if (!existing.catalogMatch && event.catalogMatch) existing.catalogMatch = event.catalogMatch;
    } else {
      map.set(signature, {
        signature,
        title,
        detail: event.detail || '',
        count: 1,
        firstSeen: event.ts,
        lastSeen: event.ts,
        affectedInitials: initialsUpper ? [initialsUpper] : [],
        tone: event.tone,
        scope: userScope,
        status: event.status,
        durationMs: event.durationMs,
        source: event.source,
        incidentPriority: priority,
        rows: [event],
        catalogMatch: event.catalogMatch || null,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    if (a.incidentPriority !== b.incidentPriority) return a.incidentPriority - b.incidentPriority;
    const toneRank = (t: EvidenceTone) => (t === 'danger' ? 0 : t === 'warning' ? 1 : 2);
    const ta = toneRank(a.tone) - toneRank(b.tone);
    if (ta !== 0) return ta;
    if (b.count !== a.count) return b.count - a.count;
    return b.lastSeen.localeCompare(a.lastSeen);
  });
}

function buildEscalationText(incident: Incident, windowLabel: string): string {
  const initials = incident.affectedInitials.length ? incident.affectedInitials.join(', ') : 'unknown';
  const first = incident.rows[0];
  return [
    `[Helix Hub] ${incident.title}`,
    `Count: x${incident.count} | Window: ${windowLabel}`,
    `Affected: ${initials}${incident.scope === 'global' ? ' (global)' : ''}`,
    `Last seen: ${incident.lastSeen}`,
    first?.detail ? `Detail: ${first.detail}` : '',
    first?.path ? `Path: ${first.path}` : '',
  ].filter(Boolean).join('\n');
}

interface TriageResponse {
  ok: boolean;
  generatedAt: string;
  filters: {
    initials: string;
    since: string;
    until: string;
    limit: number;
  };
  sources: {
    live: boolean;
    localTelemetry: boolean;
    appInsights: {
      configured: boolean;
      status: string;
      name?: string;
      count: number;
    };
  };
  summary: {
    issueCount: number;
    evidenceCount: number;
    serverErrors: number;
    clientErrors: number;
    slowRequests: number;
    activeSessions: number;
    onlineUsers: number;
  };
  issues: TriageIssue[];
  evidence: TriageEvidence[];
}

interface SystemTriagePanelProps {
  viewerInitials: string | null;
  isDarkMode: boolean;
  enableStatFilters?: boolean;
}

function computeRange(preset: RangePreset, customSince: string, customUntil: string): { since: string; until: string } {
  const now = new Date();
  if (preset === 'custom' && customSince && customUntil) {
    return { since: new Date(customSince).toISOString(), until: new Date(customUntil).toISOString() };
  }
  if (preset === 'week') {
    const start = new Date(now);
    const day = start.getDay();
    const daysSinceMonday = (day + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: now.toISOString() };
  }
  if (preset === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: end.toISOString() };
  }
  if (preset === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { since: start.toISOString(), until: now.toISOString() };
  }
  const minutes = preset === '5m' ? 5 : preset === '30m' ? 30 : preset === '1h' ? 60 : 360;
  return { since: new Date(now.getTime() - minutes * 60 * 1000).toISOString(), until: now.toISOString() };
}

function evidenceLimitForPreset(preset: RangePreset): string {
  return ['today', 'yesterday', 'week', 'custom'].includes(preset) ? '240' : '90';
}

function toLocalInputValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '-';
  const sameDay = date.toDateString() === new Date().toDateString();
  if (sameDay) return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ago(iso: string | null): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function severityColour(severity: Severity): string {
  if (severity === 'critical') return colours.cta;
  if (severity === 'warning') return colours.orange;
  if (severity === 'notice') return colours.highlight;
  return colours.green;
}

function toneColour(tone: EvidenceTone): string {
  if (tone === 'danger') return colours.cta;
  if (tone === 'warning') return colours.orange;
  return colours.highlight;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'connected';
  if (status === 'workspace_not_configured') return 'not configured';
  if (status === 'query_failed') return 'query failed';
  return status.replace(/_/g, ' ');
}

function sourceBucket(event: TriageEvidence): SourceBreakdown['key'] {
  const source = String(event.source || '').toLowerCase();
  if (source.includes('live request')) return 'live';
  if (source === 'local telemetry' || source === 'client event' || source === 'session trace') return 'local';
  return 'appInsights';
}

function evidenceMatchesFilter(event: TriageEvidence, filter: SystemTriageEvidenceFilter): boolean {
  if (filter === 'all') return true;
  if (event.categories?.includes(filter)) return true;
  const text = `${event.title || ''} ${event.detail || ''}`;
  if (filter === 'server-errors') {
    if (event.status != null && event.status >= 500) return true;
    if (/exception/i.test(event.source) && event.tone === 'danger') return true;
    return false;
  }
  if (filter === 'client-errors') {
    if (event.status != null && event.status >= 400 && event.status < 500) return true;
    if (event.source === 'Client event' && event.tone === 'danger') return true;
    if (event.source === 'Session trace' && event.tone === 'danger') return true;
    if (event.source === 'Local telemetry' && (event.tone === 'danger' || /error|failed|request-failed/i.test(text))) return true;
    return false;
  }
  if (filter === 'slow-routes') return event.durationMs != null && event.durationMs >= 1500;
  if (filter === 'sessions') return event.source === 'Session trace';
  return true;
}

function isDefaultErrorsEvidence(event: TriageEvidence): boolean {
  if (event.source === 'Session trace') return false;
  return event.tone === 'danger'
    || Boolean(event.categories?.includes('server-errors'))
    || Boolean(event.categories?.includes('client-errors'));
}

function issueMatchesFilter(issue: TriageIssue, filter: SystemTriageEvidenceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'server-errors') return issue.id === 'server-errors';
  if (filter === 'client-errors') return issue.id === 'client-errors' || issue.id === 'app-insights-failures';
  if (filter === 'slow-routes') return issue.id === 'slow-requests';
  if (filter === 'sessions') return issue.id === 'busy-sessions' || issue.id === 'client-errors';
  return true;
}

const StatPill: React.FC<{
  label: string;
  value: number;
  colour: string;
  isDarkMode: boolean;
  active?: boolean;
  onClick?: () => void;
}> = ({ label, value, colour, isDarkMode, active = false, onClick }) => {
  const borderColour = active ? colour : isDarkMode ? colours.dark.border : colours.light.border;
  const content = (
    <>
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: active ? colour : isDarkMode ? colours.subtleGrey : colours.greyText }}>
        {label}
      </span>
      <span style={{ fontSize: 19, lineHeight: 1, fontWeight: 800, color: colour }}>{value}</span>
    </>
  );

  const style: React.CSSProperties = {
    border: `1px solid ${borderColour}`,
    background: active ? `${colour}14` : isDarkMode ? 'rgba(255,255,255,0.04)' : '#fff',
    padding: '8px 10px',
    minHeight: 54,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 3,
    cursor: onClick ? 'pointer' : 'default',
    textAlign: 'left',
    fontFamily: 'Raleway, sans-serif',
  };

  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} style={style}>
        {content}
      </button>
    );
  }

  return (
    <div style={style}>
      {content}
    </div>
  );
};

const ClearStatFilter: React.FC<{ isDarkMode: boolean; onClick: () => void }> = ({ isDarkMode, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
      background: 'transparent',
      color: isDarkMode ? colours.subtleGrey : colours.greyText,
      padding: '0 10px',
      minHeight: 54,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      fontFamily: 'Raleway, sans-serif',
      fontSize: 10,
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.4px',
    }}
  >
    All
  </button>
);

const SkeletonRows: React.FC<{ isDarkMode: boolean }> = ({ isDarkMode }) => {
  const baseBg = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const shimmerBg = isDarkMode
    ? 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)'
    : 'linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.10) 50%, rgba(0,0,0,0.04) 100%)';
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          style={{
            height: row === 0 ? 82 : 58,
            background: shimmerBg,
            backgroundColor: baseBg,
            backgroundSize: '200% 100%',
            animation: 'helixTriageShimmer 1.4s linear infinite',
            border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          }}
        />
      ))}
    </div>
  );
};

interface IncidentRowProps {
  incident: Incident;
  isDarkMode: boolean;
  text: string;
  muted: string;
  border: string;
  surfaceBg: string;
  state: IncidentState;
  onStateChange: (next: IncidentState | null) => void;
  windowLabel: string;
}

const IncidentRow: React.FC<IncidentRowProps> = ({ incident, isDarkMode, text, muted, border, surfaceBg, state, onStateChange, windowLabel }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionResult, setActionResult] = useState<{ kind: 'info' | 'success' | 'error'; message: string } | null>(null);
  const colour = toneColour(incident.tone);
  const stateDimmed = state === 'resolved';
  const stateLabel = state === 'acknowledged' ? 'Acknowledged' : state === 'resolved' ? 'Resolved' : null;
  const initialsToShow = incident.affectedInitials.slice(0, 3);
  const initialsOverflow = incident.affectedInitials.length - initialsToShow.length;
  const catalog = incident.catalogMatch || incident.rows.find((row) => row.catalogMatch)?.catalogMatch || null;
  const firstRow = incident.rows[0] || null;

  const copyToClipboard = useCallback(async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied('copy failed');
      window.setTimeout(() => setCopied(null), 1400);
    }
  }, []);

  const dispatchAction = useCallback(async () => {
    if (!catalog || actionBusy) return;
    const action = catalog.action;
    if (action.kind === 'none') return;
    setActionResult(null);
    if (action.kind === 'open-form-detail') {
      const submissionId = String((action.payload?.submissionId as string) || firstRow?.submissionId || '');
      if (!submissionId) {
        setActionResult({ kind: 'error', message: 'No submission id captured for this incident.' });
        return;
      }
      window.open(`forms?focusSubmission=${encodeURIComponent(submissionId)}`, '_blank', 'noopener');
      return;
    }
    if (action.kind === 'open-schema-ref') {
      window.open('.github/instructions/DATABASE_SCHEMA_REFERENCE.md', '_blank', 'noopener');
      return;
    }
    if (action.kind === 'copy-curl') {
      const route = String((action.payload?.route as string) || firstRow?.route || firstRow?.path || '');
      const curl = `curl -i -X ${(firstRow?.title || 'GET').split(' ')[0] || 'GET'} '${route}'`;
      await copyToClipboard('curl', curl);
      return;
    }
    if (action.kind === 'retrigger-submission') {
      const submissionId = String((action.payload?.submissionId as string) || firstRow?.submissionId || '');
      if (!submissionId) {
        setActionResult({ kind: 'error', message: 'No submission id captured for this incident.' });
        return;
      }
      setActionBusy(true);
      try {
        const response = await fetch(`/api/process-hub/submissions/${encodeURIComponent(submissionId)}/retrigger`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...buildRequestAuthHeaders() },
        });
        const body = await response.json().catch(() => null);
        if (!response.ok || body?.ok === false) {
          throw new Error(body?.error || body?.message || `Retrigger failed (${response.status})`);
        }
        setActionResult({ kind: 'success', message: 'Retrigger dispatched.' });
      } catch (err) {
        setActionResult({ kind: 'error', message: err instanceof Error ? err.message : 'Retrigger failed' });
      } finally {
        setActionBusy(false);
      }
      return;
    }
  }, [catalog, firstRow, actionBusy, copyToClipboard]);

  return (
    <div style={{ borderBottom: `1px solid ${border}`, opacity: stateDimmed ? 0.55 : 1, background: surfaceBg }}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '4px minmax(0, 1fr) auto',
          gap: 10,
          alignItems: 'center',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          color: text,
          fontFamily: 'Raleway, sans-serif',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={expanded}
      >
        <div style={{ alignSelf: 'stretch', background: colour, width: 4 }} />
        <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={incident.title}>{incident.title}</span>
            {incident.scope === 'global' && <MiniBadge value="GLOBAL" colour={muted} />}
            {stateLabel && <MiniBadge value={stateLabel.toUpperCase()} colour={state === 'resolved' ? colours.green : colours.highlight} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: muted, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontWeight: 800, color: colour }}>x{incident.count}</span>
            {incident.status != null && <MiniBadge value={String(incident.status)} colour={incident.status >= 500 ? colours.cta : incident.status >= 400 ? colours.orange : colours.green} />}
            <span>last {ago(incident.lastSeen)}</span>
            {initialsToShow.length > 0 && (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                {initialsToShow.map((init) => <MiniBadge key={init} value={init} colour={colours.highlight} />)}
                {initialsOverflow > 0 && <MiniBadge value={`+${initialsOverflow}`} colour={muted} />}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontSize: 11, color: muted, fontFamily: 'monospace' }}>{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${border}`, padding: '10px 14px 14px 22px', display: 'grid', gap: 10 }}>
          {catalog && (
            <div style={{
              border: `1px solid ${colours.highlight}`,
              borderLeft: `4px solid ${colours.highlight}`,
              background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.06)',
              padding: '8px 10px',
              display: 'grid',
              gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', color: colours.highlight }}>Recommended action</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: text }}>{catalog.headline}</span>
              </div>
              <div style={{ fontSize: 11, color: muted, lineHeight: 1.45 }}>{catalog.explanation}</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {catalog.action.kind !== 'none' && (
                  <button
                    type="button"
                    onClick={() => dispatchAction()}
                    disabled={actionBusy}
                    style={{
                      height: 28,
                      padding: '0 12px',
                      border: 'none',
                      background: colours.highlight,
                      color: '#fff',
                      cursor: actionBusy ? 'wait' : 'pointer',
                      fontFamily: 'Raleway, sans-serif',
                      fontSize: 11,
                      fontWeight: 800,
                      opacity: actionBusy ? 0.7 : 1,
                    }}
                  >
                    {actionBusy ? 'Working...' : catalog.action.label}
                  </button>
                )}
                {actionResult && (
                  <span style={{ fontSize: 11, color: actionResult.kind === 'error' ? colours.cta : actionResult.kind === 'success' ? colours.green : muted }}>
                    {actionResult.message}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {state !== 'acknowledged' && state !== 'resolved' && (
              <ActionButton label="Acknowledge" onClick={() => onStateChange('acknowledged')} isDarkMode={isDarkMode} />
            )}
            {state !== 'resolved' && (
              <ActionButton label="Mark resolved" onClick={() => onStateChange('resolved')} isDarkMode={isDarkMode} />
            )}
            {state !== 'new' && (
              <ActionButton label="Reset" onClick={() => onStateChange(null)} isDarkMode={isDarkMode} />
            )}
            <ActionButton label={copied === 'summary' ? 'Copied' : 'Copy escalation summary'} onClick={() => copyToClipboard('summary', buildEscalationText(incident, windowLabel))} isDarkMode={isDarkMode} />
            <ActionButton label={copied === 'signature' ? 'Copied' : 'Copy signature'} onClick={() => copyToClipboard('signature', incident.signature)} isDarkMode={isDarkMode} />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {incident.rows.map((row) => {
              const fullUrl = row.path && row.detail && row.detail.startsWith('http') ? row.detail : null;
              const detailShort = fullUrl ? (row.path || '') : row.detail;
              return (
                <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 10, fontSize: 11, color: muted, alignItems: 'center', padding: '4px 0', borderTop: `1px dashed ${border}` }}>
                  <span style={{ fontFamily: 'monospace' }}>{formatTime(row.ts)}</span>
                  <span style={{ color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={fullUrl || row.detail || ''}>
                    {detailShort || row.title}
                  </span>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {row.status != null && <MiniBadge value={String(row.status)} colour={row.status >= 500 ? colours.cta : row.status >= 400 ? colours.orange : colours.green} />}
                    {row.durationMs != null && row.durationMs > 0 && <MiniBadge value={`${row.durationMs}ms`} colour={row.durationMs >= 1500 ? colours.orange : muted} />}
                    {row.user && <MiniBadge value={row.user} colour={colours.highlight} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const ActionButton: React.FC<{ label: string; onClick: () => void; isDarkMode: boolean }> = ({ label, onClick, isDarkMode }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      height: 26,
      padding: '0 10px',
      border: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
      background: isDarkMode ? 'rgba(255,255,255,0.04)' : '#fff',
      color: isDarkMode ? colours.dark.text : colours.light.text,
      cursor: 'pointer',
      fontFamily: 'Raleway, sans-serif',
      fontSize: 11,
      fontWeight: 700,
    }}
  >
    {label}
  </button>
);

const SystemTriagePanel: React.FC<SystemTriagePanelProps> = ({ viewerInitials, isDarkMode, enableStatFilters = false }) => {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [initials, setInitials] = useState<string>('ALL');
  const [submittedInitials, setSubmittedInitials] = useState<string>('ALL');
  const [queryRunId, setQueryRunId] = useState<number>(0);
  const [preset, setPreset] = useState<RangePreset>('today');
  const now = useMemo(() => new Date(), []);
  const [customSince, setCustomSince] = useState<string>(() => toLocalInputValue(new Date(now.getTime() - 60 * 60 * 1000)));
  const [customUntil, setCustomUntil] = useState<string>(() => toLocalInputValue(now));
  const [data, setData] = useState<TriageResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<SystemTriageEvidenceFilter>('all');
  const [userSubmissions, setUserSubmissions] = useState<UserSubmissionRow[] | null>(null);
  const [submissionsLoading, setSubmissionsLoading] = useState<boolean>(false);
  const [submissionAction, setSubmissionAction] = useState<{ id: string; kind: 'success' | 'error'; message: string } | null>(null);
  const [submissionBusy, setSubmissionBusy] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const submissionsAbortRef = useRef<AbortController | null>(null);
  const loadingStartRef = useRef<number | null>(null);
  const [loadingStage, setLoadingStage] = useState<number>(0);
  const [loadingElapsedMs, setLoadingElapsedMs] = useState<number>(0);

  useEffect(() => {
    if (!loading && !submissionsLoading) {
      loadingStartRef.current = null;
      setLoadingStage(0);
      setLoadingElapsedMs(0);
      return;
    }
    if (loadingStartRef.current == null) loadingStartRef.current = Date.now();
    setLoadingStage(0);
    setLoadingElapsedMs(Date.now() - (loadingStartRef.current || Date.now()));
    const stageId = window.setInterval(() => {
      setLoadingStage((prev) => (prev + 1) % TRIAGE_LOADING_STAGES.length);
    }, 700);
    const tickId = window.setInterval(() => {
      setLoadingElapsedMs(Date.now() - (loadingStartRef.current || Date.now()));
    }, 100);
    return () => {
      window.clearInterval(stageId);
      window.clearInterval(tickId);
    };
  }, [loading, submissionsLoading]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAuditTeam(ctrl.signal).then(setTeam).catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const teamOptions = useMemo(() => {
    const seen = new Set<string>();
    return team
      .map((member) => ({ ...member, initials: String(member.initials || '').toUpperCase().trim() }))
      .filter((member) => {
        if (!member.initials || seen.has(member.initials)) return false;
        seen.add(member.initials);
        return true;
      })
      .sort((a, b) => a.initials.localeCompare(b.initials));
  }, [team]);

  const runQuery = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const range = computeRange(preset, customSince, customUntil);
    const evidenceLimit = evidenceLimitForPreset(preset);
    const params = new URLSearchParams({
      targetInitials: submittedInitials || 'ALL',
      since: range.since,
      until: range.until,
      limit: evidenceLimit,
    });

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/system-triage?${params.toString()}`, {
        signal: ctrl.signal,
        credentials: 'include',
        headers: buildRequestAuthHeaders(),
      });
      const body = await response.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (!response.ok || !body?.ok) {
        throw new Error(body?.message || body?.error || `System health check failed (${response.status})`);
      }
      setData(body as TriageResponse);
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Could not load system health data');
      }
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [customSince, customUntil, preset, submittedInitials]);

  useEffect(() => {
    void runQuery();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void runQuery();
    }, 30000);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [runQuery, queryRunId]);

  const submit = useCallback((event?: React.FormEvent) => {
    event?.preventDefault();
    const clean = initials.trim().toUpperCase();
    setSubmittedInitials(clean || 'ALL');
    setQueryRunId((prev) => prev + 1);
  }, [initials]);

  // Per-user submissions strip — only loads when a single user is selected
  const fetchUserSubmissions = useCallback(async () => {
    submissionsAbortRef.current?.abort();
    if (!submittedInitials || submittedInitials === 'ALL' || !/^[A-Z]{2,8}$/.test(submittedInitials)) {
      setUserSubmissions(null);
      return;
    }
    const range = computeRange(preset, customSince, customUntil);
    const hours = Math.max(0.25, Math.min(72, (Date.parse(range.until) - Date.parse(range.since)) / (60 * 60 * 1000)));
    const params = new URLSearchParams({ initials: submittedInitials, hours: String(hours), limit: '40' });
    const ctrl = new AbortController();
    submissionsAbortRef.current = ctrl;
    setSubmissionsLoading(true);
    try {
      const response = await fetch(`/api/system-triage/user-submissions?${params.toString()}`, {
        signal: ctrl.signal,
        credentials: 'include',
        headers: buildRequestAuthHeaders(),
      });
      const body = await response.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (response.ok && body?.ok) {
        setUserSubmissions(Array.isArray(body.submissions) ? body.submissions : []);
      } else {
        setUserSubmissions([]);
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== 'AbortError') setUserSubmissions([]);
    } finally {
      if (!ctrl.signal.aborted) setSubmissionsLoading(false);
    }
  }, [submittedInitials, preset, customSince, customUntil]);

  useEffect(() => {
    void fetchUserSubmissions();
    return () => { submissionsAbortRef.current?.abort(); };
  }, [fetchUserSubmissions, queryRunId]);

  const retriggerSubmission = useCallback(async (id: string) => {
    if (submissionBusy) return;
    setSubmissionBusy(id);
    setSubmissionAction(null);
    try {
      const response = await fetch(`/api/process-hub/submissions/${encodeURIComponent(id)}/retrigger`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...buildRequestAuthHeaders() },
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || body?.message || `Retrigger failed (${response.status})`);
      }
      setSubmissionAction({ id, kind: 'success', message: 'Retrigger dispatched.' });
      void fetchUserSubmissions();
    } catch (err) {
      setSubmissionAction({ id, kind: 'error', message: err instanceof Error ? err.message : 'Retrigger failed' });
    } finally {
      setSubmissionBusy(null);
    }
  }, [submissionBusy, fetchUserSubmissions]);

  const surfaceBg = isDarkMode ? colours.dark.cardBackground : '#fff';
  const shellBg = isDarkMode ? colours.darkBlue : colours.light.sectionBackground;
  const border = isDarkMode ? colours.dark.border : colours.light.border;
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const evidenceFilter = enableStatFilters ? activeFilter : 'all';
  const filteredEvidence = useMemo(() => {
    const rows = data?.evidence.filter((event) => evidenceMatchesFilter(event, evidenceFilter)) || [];
    if (evidenceFilter === 'all') {
      return rows.filter(isDefaultErrorsEvidence);
    }
    return rows;
  }, [data, evidenceFilter]);
  const evidenceStats = useMemo(() => {
    const all = data?.evidence || [];
    return {
      serverErrors: all.filter((event) => evidenceMatchesFilter(event, 'server-errors')).length,
      clientErrors: all.filter((event) => evidenceMatchesFilter(event, 'client-errors')).length,
      slowRoutes: all.filter((event) => evidenceMatchesFilter(event, 'slow-routes')).length,
      sessions: all.filter((event) => evidenceMatchesFilter(event, 'sessions')).length,
    };
  }, [data]);
  const appInsightsStatus = data?.sources?.appInsights?.status || 'not_loaded';
  const sourceBreakdown = useMemo<SourceBreakdown[]>(() => {
    const appInsightsLabel = data?.sources?.appInsights?.name || 'Staging logs';
    const rows: SourceBreakdown[] = [
      {
        key: 'live',
        label: 'Live request log',
        status: data?.sources?.live ? 'connected' : 'not loaded',
        colour: data?.sources?.live ? colours.green : muted,
        detail: 'Current backend request log for this local dev server.',
        rows: 0,
        issueRows: 0,
        lastSeen: null,
      },
      {
        key: 'local',
        label: 'Local telemetry',
        status: data?.sources?.localTelemetry ? 'connected' : 'not loaded',
        colour: data?.sources?.localTelemetry ? colours.green : muted,
        detail: 'Client events, session traces, and local operation telemetry.',
        rows: 0,
        issueRows: 0,
        lastSeen: null,
      },
      {
        key: 'appInsights',
        label: appInsightsLabel,
        status: sourceStatusLabel(appInsightsStatus),
        colour: appInsightsStatus === 'ok' ? colours.green : appInsightsStatus === 'query_failed' ? colours.orange : muted,
        detail: appInsightsStatus === 'ok'
          ? 'Persisted Hub telemetry from the scoped Log Analytics roles.'
          : appInsightsStatus === 'workspace_not_configured'
            ? 'Workspace ID is not configured for local staging evidence.'
            : 'Remote telemetry query did not return usable staging evidence.',
        rows: 0,
        issueRows: 0,
        lastSeen: null,
        returnedRows: data?.sources?.appInsights?.count || 0,
      },
    ];
    const byKey = new Map(rows.map((row) => [row.key, row]));
    for (const event of filteredEvidence) {
      const row = byKey.get(sourceBucket(event));
      if (!row) continue;
      row.rows += 1;
      if (event.tone === 'danger' || event.tone === 'warning') row.issueRows += 1;
      if (!row.lastSeen || event.ts > row.lastSeen) row.lastSeen = event.ts;
    }
    return rows;
  }, [appInsightsStatus, data, filteredEvidence, muted]);
  const incidents = useMemo(() => clusterEvidence(filteredEvidence), [filteredEvidence]);
  const totalIncidents = incidents.length;
  const [incidentStateMap, setIncidentStateMap] = useState<Record<string, IncidentState>>(() => {
    if (typeof window === 'undefined') return {};
    return loadIncidentStateMap();
  });
  const updateIncidentState = useCallback((signature: string, next: IncidentState | null) => {
    setIncidentStateMap((prev) => {
      const copy = { ...prev };
      if (next === null) delete copy[signature];
      else copy[signature] = next;
      persistIncidentStateMap(copy);
      return copy;
    });
  }, []);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => { setBannerDismissed(false); }, [data?.generatedAt]);
  const topIncident = incidents[0] || null;
  const topIncidentIsError = Boolean(topIncident?.rows.some(isDefaultErrorsEvidence));
  const showBanner = !bannerDismissed
    && topIncident
    && topIncidentIsError
    && (topIncident.count >= 3 || (topIncident.status != null && topIncident.status >= 500));
  const windowLabel = data ? `${formatTime(data.filters.since)} to ${formatTime(data.filters.until)}` : '';

  return (
    <section aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'Raleway, sans-serif', color: text }}>
      <form
        onSubmit={submit}
        aria-busy={loading}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 220px) minmax(260px, 1fr) auto',
          gap: 10,
          alignItems: 'end',
          padding: 12,
          background: shellBg,
          border: `1px solid ${border}`,
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: muted }}>User</span>
          <select
            value={initials}
            onChange={(event) => setInitials(event.target.value)}
            style={{
              height: 34,
              padding: '0 10px',
              border: `1px solid ${border}`,
              borderRadius: 0,
              background: isDarkMode ? colours.dark.background : '#fff',
              color: text,
              fontFamily: 'Raleway, sans-serif',
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            <option value="ALL">All users</option>
            {teamOptions.map((member) => (
              <option key={member.initials} value={member.initials}>{member.initials}{member.name ? ` - ${member.name}` : ''}</option>
            ))}
            {teamOptions.length === 0 && viewerInitials && viewerInitials !== 'ALL' && (
              <option value={viewerInitials}>{viewerInitials}</option>
            )}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase', color: muted }}>Window</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {RANGE_PRESETS.map((option) => {
              const active = preset === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPreset(option)}
                  aria-pressed={active}
                  style={{
                    height: 34,
                    padding: '0 11px',
                    border: `1px solid ${active ? colours.highlight : border}`,
                    borderRadius: 0,
                    background: active ? `${colours.highlight}1F` : 'transparent',
                    color: active ? colours.highlight : text,
                    cursor: 'pointer',
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: 12,
                    fontWeight: active ? 800 : 600,
                  }}
                >
                  {RANGE_PRESET_LABELS[option]}
                </button>
              );
            })}
            {preset === 'custom' && (
              <>
                <input
                  type="datetime-local"
                  value={customSince}
                  onChange={(event) => setCustomSince(event.target.value)}
                  style={{ height: 34, border: `1px solid ${border}`, background: isDarkMode ? colours.dark.background : '#fff', color: text, padding: '0 8px', fontFamily: 'Raleway, sans-serif' }}
                />
                <input
                  type="datetime-local"
                  value={customUntil}
                  onChange={(event) => setCustomUntil(event.target.value)}
                  style={{ height: 34, border: `1px solid ${border}`, background: isDarkMode ? colours.dark.background : '#fff', color: text, padding: '0 8px', fontFamily: 'Raleway, sans-serif' }}
                />
              </>
            )}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            height: 34,
            padding: '0 16px',
            border: 'none',
            borderRadius: 0,
            background: colours.cta,
            color: '#fff',
            cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'Raleway, sans-serif',
            fontWeight: 800,
            opacity: loading ? 0.85 : 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {loading && (
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.35)',
                borderTopColor: '#fff',
                animation: 'helixTriageSpin 0.8s linear infinite',
              }}
            />
          )}
          {loading ? 'Refreshing' : 'Run'}
        </button>
      </form>

      {submittedInitials && submittedInitials !== 'ALL' && (
        <div style={{ border: `1px solid ${border}`, background: surfaceBg }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderBottom: `1px solid ${border}`, gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: muted }}>
              Recent submissions ({submittedInitials})
            </span>
            <span style={{ fontSize: 11, color: muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {submissionsLoading ? (
                <>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: `2px solid ${colours.highlight}33`,
                      borderTopColor: colours.highlight,
                      animation: 'helixTriageSpin 0.8s linear infinite',
                    }}
                  />
                  Loading submissions
                </>
              ) : userSubmissions ? `${userSubmissions.length} in window` : ''}
            </span>
          </div>
          {(!userSubmissions || userSubmissions.length === 0) && !submissionsLoading && (
            <div style={{ padding: '10px 12px', fontSize: 12, color: muted }}>
              No submissions in this window. If they say they clicked submit, the click never reached the server.
            </div>
          )}
          {userSubmissions && userSubmissions.length > 0 && (
            <div style={{ display: 'grid', gap: 4, padding: 6 }}>
              {userSubmissions.map((row) => {
                const status = (row.processingStatus || '').toLowerCase();
                const failed = /fail|error/.test(status);
                const accent = failed ? colours.cta : /awaiting/.test(status) ? colours.orange : /complete/.test(status) ? colours.green : colours.highlight;
                const tsLabel = row.submittedAt ? new Date(row.submittedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={row.id} style={{ borderLeft: `3px solid ${accent}`, padding: '5px 8px', background: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', display: 'grid', gridTemplateColumns: '60px 110px 1fr auto', gap: 8, alignItems: 'center', fontSize: 11 }}>
                    <span style={{ fontFamily: 'monospace', color: muted }}>{tsLabel}</span>
                    <span style={{ color: accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', fontSize: 10 }}>
                      {row.formKey || 'form'} - {(row.processingStatus || 'unknown')}
                    </span>
                    <span style={{ color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.lastStep?.error || row.summary || ''}>
                      {row.lastStep?.error ? <span style={{ color: colours.cta }}>{row.lastStep.error}</span> : (row.summary || '(no summary)')}
                      {row.retriggerCount > 0 && <span style={{ color: colours.orange, marginLeft: 6 }}>(retried x{row.retriggerCount})</span>}
                    </span>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      {failed && (
                        <button
                          type="button"
                          onClick={() => void retriggerSubmission(row.id)}
                          disabled={submissionBusy === row.id}
                          style={{ border: 'none', background: colours.highlight, color: '#fff', padding: '3px 8px', fontFamily: 'Raleway, sans-serif', fontSize: 10, fontWeight: 800, cursor: submissionBusy === row.id ? 'wait' : 'pointer', borderRadius: 0 }}
                        >
                          {submissionBusy === row.id ? '...' : 'Retrigger'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.open(`forms?focusSubmission=${encodeURIComponent(row.id)}`, '_blank', 'noopener')}
                        style={{ border: `1px solid ${border}`, background: 'transparent', color: text, padding: '3px 8px', fontFamily: 'Raleway, sans-serif', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}
                      >
                        Open
                      </button>
                    </span>
                    {submissionAction?.id === row.id && (
                      <span style={{ gridColumn: '1 / -1', fontSize: 10, color: submissionAction.kind === 'error' ? colours.cta : colours.green, paddingLeft: 8 }}>
                        {submissionAction.message}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            display: 'grid',
            gap: 10,
            padding: '11px 14px',
            border: `1px solid ${colours.highlight}`,
            background: `${colours.highlight}10`,
            color: text,
            fontSize: 12,
            fontWeight: 700,
            animation: 'helixTriageFadeIn 220ms ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: `2px solid ${colours.highlight}33`,
                borderTopColor: colours.highlight,
                animation: 'helixTriageSpin 0.9s linear infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
              <span>{TRIAGE_LOADING_STAGES[loadingStage] || 'Working'}</span>
              <span aria-hidden="true" style={{ display: 'inline-flex', gap: 2 }}>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    style={{
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: colours.highlight,
                      animation: `helixTriageDots 1s ${dot * 0.15}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </span>
            </span>
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: muted, fontSize: 11, fontWeight: 600 }}>{submittedInitials || 'ALL'}</span>
              <span style={{ color: muted, fontSize: 11, fontFamily: 'monospace' }}>{(loadingElapsedMs / 1000).toFixed(1)}s</span>
            </span>
          </div>
          <div
            style={{
              position: 'relative',
              height: 3,
              background: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '45%',
                height: '100%',
                background: `linear-gradient(90deg, transparent 0%, ${colours.highlight} 50%, transparent 100%)`,
                animation: 'helixTriageBarSlide 1.3s ease-in-out infinite',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: muted, fontSize: 10, fontWeight: 600 }}>
            {TRIAGE_LOADING_STAGES.map((label, index) => (
              <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: index === loadingStage ? 1 : 0.55 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: index === loadingStage ? colours.highlight : (isDarkMode ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'),
                    animation: index === loadingStage ? 'helixTriagePulse 1s ease-in-out infinite' : 'none',
                  }}
                />
                {label.replace(/^(Reaching|Scanning|Querying|Clustering)\s+/, '')}
              </span>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: 12, border: `1px solid ${colours.cta}`, background: `${colours.cta}12`, color: colours.cta, fontSize: 12, fontWeight: 700 }}>
          {error}
        </div>
      )}

      {!data && loading ? (
        <SkeletonRows isDarkMode={isDarkMode} />
      ) : data ? (
        <>
          {showBanner && topIncident && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${toneColour(topIncident.tone)}`, background: `${toneColour(topIncident.tone)}10`, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneColour(topIncident.tone), flexShrink: 0 }} />
              <span style={{ fontWeight: 800, color: text }}>Top incident:</span>
              <span style={{ color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }} title={topIncident.title}>{topIncident.title}</span>
              <span style={{ fontFamily: 'monospace', color: toneColour(topIncident.tone), fontWeight: 800 }}>x{topIncident.count}</span>
              <button type="button" onClick={() => setBannerDismissed(true)} style={{ border: 'none', background: 'transparent', color: muted, cursor: 'pointer', fontSize: 14, padding: '0 4px' }} aria-label="Dismiss banner">x</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <StatPill label="Server errors" value={evidenceStats.serverErrors} colour={evidenceStats.serverErrors > 0 ? colours.cta : colours.green} isDarkMode={isDarkMode} active={enableStatFilters && activeFilter === 'server-errors'} onClick={enableStatFilters ? () => setActiveFilter('server-errors') : undefined} />
            <StatPill label="Client errors" value={evidenceStats.clientErrors} colour={evidenceStats.clientErrors > 0 ? colours.cta : colours.green} isDarkMode={isDarkMode} active={enableStatFilters && activeFilter === 'client-errors'} onClick={enableStatFilters ? () => setActiveFilter('client-errors') : undefined} />
            <StatPill label="Slow routes" value={evidenceStats.slowRoutes} colour={evidenceStats.slowRoutes > 0 ? colours.orange : colours.green} isDarkMode={isDarkMode} active={enableStatFilters && activeFilter === 'slow-routes'} onClick={enableStatFilters ? () => setActiveFilter('slow-routes') : undefined} />
            {evidenceStats.sessions > 0 && (
              <StatPill label="Sessions" value={evidenceStats.sessions} colour={colours.highlight} isDarkMode={isDarkMode} active={enableStatFilters && activeFilter === 'sessions'} onClick={enableStatFilters ? () => setActiveFilter('sessions') : undefined} />
            )}
            {enableStatFilters && activeFilter !== 'all' && (
              <ClearStatFilter isDarkMode={isDarkMode} onClick={() => setActiveFilter('all')} />
            )}
          </div>

          <div style={{ background: surfaceBg, border: `1px solid ${border}`, minHeight: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${border}` }}>
              <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.6px', color: text }}>Incidents</span>
              <span style={{ fontSize: 10, fontFamily: 'monospace', color: muted }}>
                {totalIncidents} {totalIncidents === 1 ? 'group' : 'groups'} ({filteredEvidence.length} rows)
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: muted }}>
                {windowLabel}
              </span>
              {loading && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: muted }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      border: `2px solid ${colours.highlight}33`,
                      borderTopColor: colours.highlight,
                      animation: 'helixTriageSpin 0.8s linear infinite',
                    }}
                  />
                  Refreshing
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, padding: 12, borderBottom: `1px solid ${border}`, background: isDarkMode ? 'rgba(255,255,255,0.025)' : colours.light.sectionBackground }}>
              {sourceBreakdown.map((source) => (
                <SourceInsightCard key={source.key} source={source} isDarkMode={isDarkMode} text={text} muted={muted} border={border} />
              ))}
            </div>
            {incidents.length === 0 ? (
              <div style={{ padding: 18, color: muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: colours.green, flexShrink: 0 }} />
                {evidenceFilter === 'all'
                  ? `No failures in this window. Healthy traffic is hidden on the Errors view; switch filter or widen the window to see more.`
                  : 'No incidents matched this filter.'}
              </div>
            ) : (
              <div style={{ display: 'grid', maxHeight: 480, overflowY: 'auto' }}>
                {incidents.map((incident) => (
                  <IncidentRow
                    key={incident.signature}
                    incident={incident}
                    isDarkMode={isDarkMode}
                    text={text}
                    muted={muted}
                    border={border}
                    surfaceBg={surfaceBg}
                    state={incidentStateMap[incident.signature] || 'new'}
                    onStateChange={(next) => updateIncidentState(incident.signature, next)}
                    windowLabel={windowLabel}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
};

const SourceInsightCard: React.FC<{
  source: SourceBreakdown;
  isDarkMode: boolean;
  text: string;
  muted: string;
  border: string;
}> = ({ source, isDarkMode, text, muted, border }) => (
  <div style={{ border: `1px solid ${border}`, background: isDarkMode ? 'rgba(255,255,255,0.04)' : '#fff', padding: 10, minWidth: 0 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: source.colour, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.label}</span>
      </span>
      <span style={{ fontSize: 10, color: source.colour, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{source.status}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      <MiniBadge value={`${source.rows} rows`} colour={source.rows > 0 ? colours.highlight : muted} />
      <MiniBadge value={`${source.issueRows} issue rows`} colour={source.issueRows > 0 ? colours.cta : colours.green} />
      {typeof source.returnedRows === 'number' && <MiniBadge value={`${source.returnedRows} returned`} colour={source.returnedRows > 0 ? colours.highlight : muted} />}
    </div>
    <div style={{ marginTop: 7, color: muted, fontSize: 11, lineHeight: 1.4 }}>
      {source.detail}
    </div>
    <div style={{ marginTop: 6, color: muted, fontSize: 10, fontFamily: 'monospace' }}>
      {source.lastSeen ? `last ${ago(source.lastSeen)}` : 'no matching rows in this view'}
    </div>
  </div>
);

const MiniBadge: React.FC<{ value: string; colour: string }> = ({ value, colour }) => (
  <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: colour, background: `${colour}18`, padding: '1px 5px', whiteSpace: 'nowrap' }}>
    {value}
  </span>
);

export default SystemTriagePanel;