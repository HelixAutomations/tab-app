import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelBorder,
  reportingPanelShadow,
} from '../../Reporting/styles/reportingFoundation';
import { getApiUrl } from '../../../utils/getApiUrl';
import { getAreaGlyphMeta, renderAreaOfWorkGlyph } from '../../../components/filter/areaGlyphs';

type StreamKey = 'commercial' | 'construction' | 'property' | 'employment' | 'other';

type AudienceStream = {
  streamKey: StreamKey;
  label: string;
  isSendable: boolean;
  sortOrder: number;
  status: string;
  total: number;
  sendable: number;
  inspect: number;
  blocked: number;
  missingAcid: number;
  missingEmail: number;
  clients: number;
  withAcid: number;
  ranked: number;
  lastSeenAt: string | null;
  addedThisMonth: number;
  addedLastMonth: number;
  addedThisQuarter: number;
  glyph?: string;
};

type AudienceMember = {
  memberId: string;
  streamKey: StreamKey;
  acid: string;
  sourceEnquiryId: string;
  emailHash: string;
  emailDomain: string;
  areaOfWork: string;
  rank: number | null;
  tags: string[];
  client: boolean;
  matterId: string;
  clientStatus: string;
  qualificationStatus: string;
  qualificationReason: string;
  sendable: boolean;
  lastSeenAt: string | null;
  lastQualifiedAt: string | null;
};

type EmailCampaign = {
  campaignId: string;
  campaignKey: string;
  streamKey: StreamKey;
  status: string;
  campaignName: string;
  subject: string;
  preheader: string;
  senderEmail: string;
  signatureMode: string;
  excludeClients: boolean;
  rankMin: number | null;
  rankMax: number | null;
  selectedCount: number | null;
  blockedCount: number | null;
  sentCount: number | null;
  createdAt: string | null;
  createdBy: string;
  lockedAt: string | null;
  lockedBy: string;
  sentAt: string | null;
  sentBy: string;
};

type ProcessingEvent = {
  id: string;
  label: string;
  detail: string;
  status: 'running' | 'complete' | 'error' | 'selected' | 'waiting';
  at: string;
};

type SendGridBridgeState = {
  connectionStatus: 'idle' | 'loading' | 'ready' | 'error';
  activityStatus: 'idle' | 'loading' | 'ready' | 'error';
  message: string;
  connected?: boolean;
  statusCode?: number | null;
  scopeCount?: number;
  hasMailSend?: boolean;
  hasActivityRead?: boolean;
  activityAvailable?: boolean;
  sampleSize?: number;
  lastActivityAt?: string | null;
};

type SendResult = { status: 'ready' | 'error' | 'saved'; message: string } | null;
type PreviewDevice = 'desktop' | 'ipad' | 'mobile';

type MarketingEmailWorkbenchProps = {
  isDarkMode: boolean;
  operatorName?: string;
  operatorInitials?: string;
  operatorEmail?: string;
  demoModeEnabled?: boolean;
};

const STREAM_GLYPHS: Record<StreamKey, string> = {
  commercial: 'Commercial',
  construction: 'Construction',
  property: 'Property',
  employment: 'Employment',
  other: 'Other/Unsure',
};

const STREAM_OPTIONS: Array<{ streamKey: StreamKey; label: string }> = [
  { streamKey: 'commercial', label: 'Commercial' },
  { streamKey: 'construction', label: 'Construction' },
  { streamKey: 'property', label: 'Property' },
  { streamKey: 'employment', label: 'Employment' },
  { streamKey: 'other', label: 'Other' },
];

const SENDERS = [
  { value: 'automations@helix-law.com', label: 'Automations' },
  { value: 'team@helix-law.com', label: 'Team inbox' },
  { value: 'lz@helix-law.com', label: 'LZ' },
];

const SIGNATURES = [
  { value: 'data-hub-v2', label: 'Helix email v2' },
  { value: 'legacy', label: 'Legacy Helix' },
];

const RANK_OPTIONS = ['any', '0', '1', '2', '3', '4', '5', '6', '7'];
const EMAIL_DEMO_ENQUIRY_ID = 'DEMO-ENQ-0003';
const MEMBER_RENDER_LIMIT = 140;
const PREVIEW_FRAME_MIN_HEIGHT: Record<PreviewDevice, number> = { desktop: 640, ipad: 660, mobile: 700 };
const PREVIEW_EMAIL_CSS = `<style data-helix-preview-css>
html,body{margin:0!important;width:100%!important;overflow:hidden!important;background:#fff!important;}
body{font-family:Raleway,Arial,Helvetica,sans-serif!important;font-size:10pt!important;line-height:1.4!important;color:rgb(0,0,0)!important;}
table{border-collapse:collapse;max-width:100%;}
img{max-width:100%;height:auto;}
a{overflow-wrap:break-word;}
</style>`;

const formatNumber = (value: number): string => Number(value || 0).toLocaleString('en-GB');

const formatStamp = (value: string | null): string => {
  if (!value) return 'Not synced';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Not synced';
  return new Date(parsed).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const maskedContact = (member: AudienceMember): string => {
  if (member.emailDomain) return `…@${member.emailDomain}`;
  if (member.emailHash) return `${member.emailHash.slice(0, 10)}…`;
  return 'Hash pending';
};

const parseRank = (value: string): number | null => {
  if (value === 'any') return null;
  const next = Number(value);
  return Number.isInteger(next) && next >= 0 && next <= 7 ? next : null;
};

const buildPreviewDocument = (html: string): string => {
  const source = html.trim() || '<!DOCTYPE html><html><head></head><body>Preview loading...</body></html>';
  if (source.includes('data-helix-preview-css')) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${PREVIEW_EMAIL_CSS}</head>`);
  if (/<body\b[^>]*>/i.test(source)) return source.replace(/<body\b([^>]*)>/i, `<body$1>${PREVIEW_EMAIL_CSS}`);
  return `${PREVIEW_EMAIL_CSS}${source}`;
};

const resolveStreamAccentColor = (streamKey?: StreamKey): string => {
  if (!streamKey) return colours.blue;
  const lookup: Record<StreamKey, string> = {
    commercial: colours.blue,
    property: colours.green,
    construction: colours.orange,
    employment: colours.yellow,
    other: colours.greyText,
  };
  return lookup[streamKey];
};

const MarketingEmailWorkbench: React.FC<MarketingEmailWorkbenchProps> = ({
  isDarkMode,
  operatorName = '',
  operatorInitials = '',
  operatorEmail = '',
  demoModeEnabled = false,
}) => {
  const [streams, setStreams] = useState<AudienceStream[]>([]);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedStreamKey, setSelectedStreamKey] = useState<StreamKey | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composeSender, setComposeSender] = useState(SENDERS[0].value);
  const [composeSignature, setComposeSignature] = useState(SIGNATURES[0].value);
  const [composeSubject, setComposeSubject] = useState('');
  const [composePreheader, setComposePreheader] = useState('');
  const [composeBody, setComposeBody] = useState('Hello,\n\nWe are preparing a short update for this audience.\n\nKind regards,\nHelix Law');
  const [rankMin, setRankMin] = useState('any');
  const [rankMax, setRankMax] = useState('any');
  const [excludeClients, setExcludeClients] = useState(true);
  const [showRankEditor, setShowRankEditor] = useState(false);
  const [qualifiedOnly, setQualifiedOnly] = useState(true);
  const [memberQuery, setMemberQuery] = useState('');
  const [streamGridCollapsed, setStreamGridCollapsed] = useState(false);
  const [proofExpanded, setProofExpanded] = useState(false);
  const [composerSplitPct, setComposerSplitPct] = useState(68);
  const [composerResizing, setComposerResizing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFrameHeights, setPreviewFrameHeights] = useState<Record<PreviewDevice, number>>(PREVIEW_FRAME_MIN_HEIGHT);

  const [locking, setLocking] = useState(false);
  const [lockedCampaign, setLockedCampaign] = useState<EmailCampaign | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [qualityRunning, setQualityRunning] = useState(false);
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([]);
  const [sendGridBridge, setSendGridBridge] = useState<SendGridBridgeState>({ connectionStatus: 'idle', activityStatus: 'idle', message: 'SendGrid checks have not run in this session.' });

  const text = isDarkMode ? colours.dark.text : colours.darkBlue;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const edge = reportingPanelBorder(isDarkMode);
  const tone = colours.highlight;
  const surface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const elevated = isDarkMode ? colours.dark.cardHover : withAlpha(colours.sectionBackground, 0.92);
  const control = withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.05 : 0.05);
  const hover = withAlpha(tone, isDarkMode ? 0.14 : 0.08);
  const selected = withAlpha(tone, isDarkMode ? 0.16 : 0.1);
  const inkOnBlue = colours.dark.text;
  const composeLayoutRef = useRef<HTMLDivElement | null>(null);

  const apiPath = useCallback((path: string): string => {
    const suffix = demoModeEnabled ? `${path.includes('?') ? '&' : '?'}demo=1` : '';
    return getApiUrl(`/api/marketing-email${path}${suffix}`);
  }, [demoModeEnabled]);

  const addProcessingEvent = useCallback((event: Omit<ProcessingEvent, 'id' | 'at'>) => {
    setProcessingEvents((current) => [{
      ...event,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
    }, ...current].slice(0, 12));
  }, []);

  const loadStreams = useCallback(async (signal?: AbortSignal) => {
    setStreamsLoading(true);
    setError(null);
    try {
      const response = await fetch(apiPath('/streams'), { method: 'GET', credentials: 'include', signal });
      const payload = await response.json() as { ok?: boolean; error?: string; streams?: AudienceStream[]; generatedAt?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Streams failed (${response.status})`);
      setStreams(Array.isArray(payload.streams) ? payload.streams : []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Streams failed');
    } finally {
      if (!signal?.aborted) setStreamsLoading(false);
    }
  }, [apiPath]);

  const loadMembers = useCallback(async (streamKey: StreamKey, signal?: AbortSignal) => {
    setMembersLoading(true);
    try {
      const response = await fetch(apiPath(`/streams/${encodeURIComponent(streamKey)}/members?limit=500`), { method: 'GET', credentials: 'include', signal });
      const payload = await response.json() as { ok?: boolean; error?: string; members?: AudienceMember[] };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Members failed (${response.status})`);
      setMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMembers([]);
      setError(err instanceof Error ? err.message : 'Members failed');
    } finally {
      if (!signal?.aborted) setMembersLoading(false);
    }
  }, [apiPath]);

  const loadCampaigns = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(apiPath('/campaigns'), { method: 'GET', credentials: 'include', signal });
      const payload = await response.json() as { ok?: boolean; campaigns?: EmailCampaign[] };
      if (!response.ok || payload.ok === false) return;
      setCampaigns(Array.isArray(payload.campaigns) ? payload.campaigns : []);
    } catch {
      // history is non-blocking
    }
  }, [apiPath]);

  useEffect(() => {
    if (!composerResizing) return undefined;
    const onPointerMove = (event: PointerEvent) => {
      const rect = composeLayoutRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const next = ((event.clientX - rect.left) / rect.width) * 100;
      setComposerSplitPct(Math.max(44, Math.min(76, Math.round(next))));
    };
    const onPointerUp = () => setComposerResizing(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [composerResizing]);

  useEffect(() => {
    if (!selectedStreamKey) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const response = await fetch(getApiUrl('/api/enquiries-unified/email-lists/preview'), {
          method: 'POST',
          credentials: 'include',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sender: composeSender,
            subject: composeSubject.trim(),
            preheader: composePreheader.trim(),
            body: composeBody,
            signatureInitials: operatorInitials || '',
            signatureMode: composeSignature,
            operatorName: operatorName || operatorInitials || '',
            operatorEmail: operatorEmail.trim(),
          }),
        });
        const payload = await response.json() as { ok?: boolean; html?: string };
        if (!response.ok || payload.ok === false || !payload.html) throw new Error('Preview unavailable');
        setPreviewHtml(payload.html);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPreviewHtml('');
      } finally {
        if (!controller.signal.aborted) setPreviewLoading(false);
      }
    }, 320);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [composeBody, composePreheader, composeSender, composeSignature, composeSubject, operatorEmail, operatorInitials, operatorName, selectedStreamKey]);

  useEffect(() => {
    const controller = new AbortController();
    void loadStreams(controller.signal);
    void loadCampaigns(controller.signal);
    return () => controller.abort();
  }, [loadStreams, loadCampaigns]);

  useEffect(() => {
    if (!selectedStreamKey) return;
    const controller = new AbortController();
    void loadMembers(selectedStreamKey, controller.signal);
    return () => controller.abort();
  }, [loadMembers, selectedStreamKey]);

  const refreshAudience = useCallback(async (materialise = false) => {
    setRefreshing(true);
    setError(null);
    addProcessingEvent({
      label: materialise ? 'Materialise source rows' : 'Check source',
      detail: demoModeEnabled ? 'Demo lane check started' : 'Preview-only source check started',
      status: 'running',
    });
    try {
      const response = await fetch(apiPath('/streams/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 2500, materialise, demoMode: demoModeEnabled }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; materialised?: boolean; streams?: AudienceStream[]; generatedAt?: string; sourceCount?: number; changedCount?: number };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Refresh failed (${response.status})`);
      setStreams(Array.isArray(payload.streams) ? payload.streams : []);
      if (selectedStreamKey) await loadMembers(selectedStreamKey);
      addProcessingEvent({
        label: materialise ? 'Materialise complete' : 'Source check complete',
        detail: demoModeEnabled
          ? `Demo lane checked ${formatNumber(payload.sourceCount ?? 0)} seeded rows`
          : payload.materialised
            ? `${formatNumber(payload.sourceCount ?? 0)} source rows materialised`
            : `${formatNumber(payload.sourceCount ?? 0)} source rows checked. Spine unchanged.`,
        status: 'complete',
      });
      setSendResult({
        status: 'saved',
        message: demoModeEnabled
          ? `Demo view checked ${formatNumber(payload.sourceCount ?? 0)} seeded rows. Live spine hidden.`
          : payload.materialised
          ? `Materialised ${formatNumber(payload.sourceCount ?? 0)} source rows into the audience spine`
          : `Checked ${formatNumber(payload.sourceCount ?? 0)} source rows. Spine unchanged.`,
      });
    } catch (err) {
      addProcessingEvent({ label: 'Source check failed', detail: err instanceof Error ? err.message : 'Refresh failed', status: 'error' });
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, [addProcessingEvent, apiPath, demoModeEnabled, loadMembers, selectedStreamKey]);

  const patchMember = useCallback(async (member: AudienceMember, patch: Partial<Pick<AudienceMember, 'streamKey' | 'acid' | 'areaOfWork' | 'rank' | 'client'>>) => {
    setSavingMemberId(member.memberId);
    setSendResult(null);
    addProcessingEvent({ label: 'Recipient edit', detail: `${member.acid || member.sourceEnquiryId || 'Recipient'} update started`, status: 'running' });
    try {
      const response = await fetch(apiPath(`/streams/${encodeURIComponent(member.streamKey)}/members/${encodeURIComponent(member.memberId)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; member?: AudienceMember };
      if (!response.ok || payload.ok === false || !payload.member) throw new Error(payload.error || `Member update failed (${response.status})`);
      setMembers((current) => payload.member?.streamKey === selectedStreamKey
        ? current.map((entry) => entry.memberId === member.memberId ? payload.member as AudienceMember : entry)
        : current.filter((entry) => entry.memberId !== member.memberId));
      void loadStreams();
      addProcessingEvent({ label: 'Recipient edit saved', detail: `${payload.member.acid || payload.member.sourceEnquiryId || 'Recipient'} updated in the audience spine`, status: 'complete' });
      setSendResult({ status: 'saved', message: 'Audience spine member updated' });
    } catch (err) {
      addProcessingEvent({ label: 'Recipient edit failed', detail: err instanceof Error ? err.message : 'Member update failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'Member update failed' });
    } finally {
      setSavingMemberId(null);
    }
  }, [addProcessingEvent, apiPath, loadStreams, selectedStreamKey]);

  const qualityCheckStream = useCallback(async () => {
    if (!selectedStreamKey) return;
    setQualityRunning(true);
    setSendResult(null);
    const streamLabel = STREAM_OPTIONS.find((stream) => stream.streamKey === selectedStreamKey)?.label || selectedStreamKey;
    addProcessingEvent({ label: 'Validation started', detail: `${streamLabel} recipient rules are running`, status: 'running' });
    try {
      const response = await fetch(apiPath(`/streams/${encodeURIComponent(selectedStreamKey)}/quality`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoMode: demoModeEnabled }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; checkedCount?: number; updatedCount?: number };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Quality check failed (${response.status})`);
      await Promise.all([loadMembers(selectedStreamKey), loadStreams()]);
      addProcessingEvent({ label: 'Validation completed', detail: `${formatNumber(payload.checkedCount ?? 0)} recipients checked`, status: 'complete' });
      setSendResult({ status: 'saved', message: `Quality checked ${formatNumber(payload.checkedCount ?? 0)} spine members` });
    } catch (err) {
      addProcessingEvent({ label: 'Validation failed', detail: err instanceof Error ? err.message : 'Quality check failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'Quality check failed' });
    } finally {
      setQualityRunning(false);
    }
  }, [addProcessingEvent, apiPath, demoModeEnabled, loadMembers, loadStreams, selectedStreamKey]);

  const selectStream = useCallback((streamKey: StreamKey) => {
    const label = STREAM_OPTIONS.find((stream) => stream.streamKey === streamKey)?.label || streamKey;
    setSelectedStreamKey(streamKey);
    setStreamGridCollapsed(true);
    setLockedCampaign(null);
    setSendResult(null);
    setComposeSubject((current) => current);
    addProcessingEvent({ label: 'List selected', detail: `${label} list selected for proofing`, status: 'selected' });
  }, [addProcessingEvent]);

  const checkSendGridConnection = useCallback(async () => {
    setSendGridBridge((current) => ({ ...current, connectionStatus: 'loading', message: 'Checking SendGrid connection...' }));
    addProcessingEvent({ label: 'SendGrid connection check', detail: 'Provider scopes check started', status: 'running' });
    try {
      const response = await fetch(getApiUrl('/api/marketing-email/sendgrid/connection'), { method: 'GET', credentials: 'include' });
      const payload = await response.json() as { ok?: boolean; error?: string; configured?: boolean; providerOk?: boolean; statusCode?: number | null; scopeCount?: number; hasMailSend?: boolean; hasActivityRead?: boolean };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `SendGrid connection failed (${response.status})`);
      const connected = Boolean(payload.configured && payload.providerOk);
      setSendGridBridge((current) => ({
        ...current,
        connectionStatus: connected ? 'ready' : 'error',
        connected,
        statusCode: payload.statusCode ?? null,
        scopeCount: payload.scopeCount ?? 0,
        hasMailSend: Boolean(payload.hasMailSend),
        hasActivityRead: Boolean(payload.hasActivityRead),
        message: connected ? 'SendGrid connection is available.' : 'SendGrid key or provider check is not ready.',
      }));
      addProcessingEvent({ label: connected ? 'SendGrid connected' : 'SendGrid not ready', detail: `Scope count ${formatNumber(payload.scopeCount ?? 0)}`, status: connected ? 'complete' : 'error' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SendGrid connection failed';
      setSendGridBridge((current) => ({ ...current, connectionStatus: 'error', message }));
      addProcessingEvent({ label: 'SendGrid connection failed', detail: message, status: 'error' });
    }
  }, [addProcessingEvent]);

  const checkSendGridActivity = useCallback(async () => {
    setSendGridBridge((current) => ({ ...current, activityStatus: 'loading', message: 'Checking SendGrid activity access...' }));
    addProcessingEvent({ label: 'SendGrid activity check', detail: 'Activity summary access check started', status: 'running' });
    try {
      const response = await fetch(getApiUrl('/api/marketing-email/sendgrid/activity-summary'), { method: 'GET', credentials: 'include' });
      const payload = await response.json() as { ok?: boolean; error?: string; configured?: boolean; providerOk?: boolean; statusCode?: number | null; activityAvailable?: boolean; summary?: { sampleSize?: number; lastActivityAt?: string | null } };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `SendGrid activity check failed (${response.status})`);
      const available = Boolean(payload.configured && payload.providerOk && payload.activityAvailable);
      const sampleSize = payload.summary?.sampleSize ?? 0;
      setSendGridBridge((current) => ({
        ...current,
        activityStatus: available ? 'ready' : 'error',
        activityAvailable: available,
        statusCode: payload.statusCode ?? current.statusCode ?? null,
        sampleSize,
        lastActivityAt: payload.summary?.lastActivityAt ?? null,
        message: available ? 'SendGrid activity summary is available.' : 'SendGrid activity summary is not available from this key or account.',
      }));
      addProcessingEvent({ label: available ? 'SendGrid activity available' : 'SendGrid activity unavailable', detail: available ? `${formatNumber(sampleSize)} recent provider rows sampled` : `Provider status ${payload.statusCode ?? 'unknown'}`, status: available ? 'complete' : 'error' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SendGrid activity check failed';
      setSendGridBridge((current) => ({ ...current, activityStatus: 'error', message }));
      addProcessingEvent({ label: 'SendGrid activity failed', detail: message, status: 'error' });
    }
  }, [addProcessingEvent]);

  const selectedStream = useMemo(() => streams.find((stream) => stream.streamKey === selectedStreamKey) || null, [streams, selectedStreamKey]);
  const isLiveStream = selectedStream?.isSendable ?? true;

  const rankMinValue = parseRank(rankMin);
  const rankMaxValue = parseRank(rankMax);

  const segmentMembers = useMemo(() => members.filter((member) => {
    if (!member.sendable) return false;
    if (excludeClients && member.client) return false;
    if (rankMinValue != null && (member.rank == null || member.rank < rankMinValue)) return false;
    if (rankMaxValue != null && (member.rank == null || member.rank > rankMaxValue)) return false;
    return true;
  }), [members, excludeClients, rankMinValue, rankMaxValue]);

  const visibleMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    return members
      .filter((member) => (qualifiedOnly ? member.sendable : true))
      .filter((member) => {
        if (!query) return true;
        return [member.acid, member.sourceEnquiryId, member.areaOfWork, member.qualificationStatus, member.tags.join(' ')]
          .join(' ')
          .toLowerCase()
          .includes(query);
      });
  }, [members, qualifiedOnly, memberQuery]);

  const canTest = Boolean(operatorEmail.trim() && composeSubject.trim() && composeBody.trim());
  const canLock = Boolean(isLiveStream && composeSender && composeSignature && segmentMembers.length > 0 && !locking);
  const selectedSenderLabel = SENDERS.find((sender) => sender.value === composeSender)?.label || composeSender;
  const selectedSignatureLabel = SIGNATURES.find((signature) => signature.value === composeSignature)?.label || composeSignature;
  const campaignHeldCount = Math.max(0, members.length - segmentMembers.length);
  const campaignRankWindow = `${rankMin === 'any' ? 'Any' : rankMin} to ${rankMax === 'any' ? 'Any' : rankMax}`;
  const campaignDraftReady = Boolean(composeSubject.trim() && composeBody.trim());
  const campaignProofState = canTest ? 'Ready' : operatorEmail.trim() ? 'Needs subject/body' : 'No user email';
  const campaignLockState = lockedCampaign ? 'Locked' : canLock ? 'Ready to lock' : 'Needs list';
  const previewSubject = composeSubject.trim() || 'Subject pending';
  const previewPreheader = composePreheader.trim() || 'Preheader preview';
  const renderedPreviewHtml = buildPreviewDocument(previewHtml);

  const measurePreviewFrame = useCallback((device: PreviewDevice, frame: HTMLIFrameElement) => {
    try {
      const documentElement = frame.contentDocument?.documentElement;
      const bodyElement = frame.contentDocument?.body;
      const measuredHeight = Math.ceil(Math.max(
        documentElement?.scrollHeight ?? 0,
        bodyElement?.scrollHeight ?? 0,
      ));
      if (!measuredHeight) return;
      const nextHeight = Math.max(PREVIEW_FRAME_MIN_HEIGHT[device], measuredHeight + 2);
      setPreviewFrameHeights((current) => (current[device] === nextHeight ? current : { ...current, [device]: nextHeight }));
    } catch {
      // keep the static frame height when the preview document cannot be measured
    }
  }, []);

  const renderDevicePreview = (device: PreviewDevice) => (
    <article className={`mew-device mew-device--${device}`} aria-label={`${device} email preview`}>
      <div className="mew-device-chrome">
        <span>{device === 'ipad' ? 'iPad' : device}</span>
        <em>{selectedSenderLabel}</em>
      </div>
      <div className="mew-device-inbox-row">
        <strong>Helix Law</strong>
        <span>{previewSubject}</span>
        <small>{previewPreheader}</small>
      </div>
      <div className="mew-rendered-shell">
        <iframe
          className="mew-rendered-frame"
          title={`${device} SendGrid rendered email`}
          sandbox="allow-same-origin"
          scrolling="no"
          srcDoc={renderedPreviewHtml}
          style={{ height: previewFrameHeights[device] }}
          onLoad={(event) => measurePreviewFrame(device, event.currentTarget)}
        />
      </div>
    </article>
  );

  const lockCampaign = useCallback(async () => {
    if (!canLock) return;
    setLocking(true);
    setSendResult(null);
    addProcessingEvent({ label: 'Campaign lock started', detail: `${selectedStream?.label || selectedStreamKey} segment snapshot is being created`, status: 'running' });
    try {
      const createResponse = await fetch(apiPath('/campaigns'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamKey: selectedStreamKey,
          campaignName: `${selectedStream?.label || selectedStreamKey} update`,
          subject: composeSubject.trim(),
          preheader: composePreheader.trim(),
          body: composeBody,
          senderEmail: composeSender,
          signatureMode: composeSignature,
          excludeClients,
          rankMin: rankMinValue,
          rankMax: rankMaxValue,
          demoMode: demoModeEnabled,
        }),
      });
      const createPayload = await createResponse.json() as { ok?: boolean; error?: string; campaign?: EmailCampaign };
      if (!createResponse.ok || createPayload.ok === false || !createPayload.campaign?.campaignId) {
        throw new Error(createPayload.error || `Campaign create failed (${createResponse.status})`);
      }
      const lockResponse = await fetch(apiPath(`/campaigns/${encodeURIComponent(createPayload.campaign.campaignId)}/lock`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoMode: demoModeEnabled }),
      });
      const lockPayload = await lockResponse.json() as { ok?: boolean; error?: string; campaign?: EmailCampaign };
      if (!lockResponse.ok || lockPayload.ok === false || !lockPayload.campaign) {
        throw new Error(lockPayload.error || `Campaign lock failed (${lockResponse.status})`);
      }
      setLockedCampaign(lockPayload.campaign);
      addProcessingEvent({
        label: 'Campaign lock completed',
        detail: `${formatNumber(lockPayload.campaign.selectedCount ?? segmentMembers.length)} selected, ${formatNumber(lockPayload.campaign.blockedCount ?? 0)} held`,
        status: 'complete',
      });
      setSendResult({ status: 'saved', message: `Campaign locked for ${formatNumber(lockPayload.campaign.selectedCount ?? segmentMembers.length)} sendable members, ${formatNumber(lockPayload.campaign.blockedCount ?? 0)} held` });
      void loadCampaigns();
    } catch (err) {
      addProcessingEvent({ label: 'Campaign lock failed', detail: err instanceof Error ? err.message : 'Campaign lock failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'Campaign lock failed' });
    } finally {
      setLocking(false);
    }
  }, [addProcessingEvent, apiPath, canLock, selectedStreamKey, selectedStream, composeSubject, composePreheader, composeBody, composeSender, composeSignature, excludeClients, rankMinValue, rankMaxValue, demoModeEnabled, segmentMembers.length, loadCampaigns]);

  const sendTest = useCallback(async () => {
    if (!canTest) {
      setSendResult({ status: 'error', message: operatorEmail.trim() ? 'Add subject and body' : 'Current user email unavailable' });
      return;
    }
    setTestSending(true);
    setSendResult(null);
    addProcessingEvent({ label: 'Test send started', detail: `Sending proof to ${operatorEmail.trim()}`, status: 'running' });
    try {
      const response = await fetch(getApiUrl('/api/enquiries-unified/email-lists/test-send'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demoMode: true,
          enquiryId: EMAIL_DEMO_ENQUIRY_ID,
          recipientEmail: operatorEmail.trim(),
          sender: composeSender,
          campaignName: `${selectedStream?.label || selectedStreamKey} update`,
          subject: composeSubject.trim(),
          preheader: composePreheader.trim(),
          body: composeBody.trim(),
          signatureInitials: operatorInitials || '',
          signatureMode: composeSignature,
          operatorName: operatorName || operatorInitials || '',
          operatorEmail: operatorEmail.trim(),
          operatorConsent: 'email-lists-limited-stream',
          operatorActor: operatorInitials || operatorName || 'operator',
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || `Test send failed (${response.status})`);
      addProcessingEvent({ label: 'Test send completed', detail: `Proof sent to ${operatorEmail.trim()}`, status: 'complete' });
      setSendResult({ status: 'ready', message: 'Test email sent to you only' });
    } catch (err) {
      addProcessingEvent({ label: 'Test send failed', detail: err instanceof Error ? err.message : 'Test send failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'Test send failed' });
    } finally {
      setTestSending(false);
    }
  }, [addProcessingEvent, canTest, operatorEmail, composeSender, composeSubject, composePreheader, composeBody, composeSignature, operatorInitials, operatorName, selectedStream, selectedStreamKey]);

  const rootVars = {
    '--mew-edge': edge,
    '--mew-surface': surface,
    '--mew-elevated': elevated,
    '--mew-control': control,
    '--mew-text': text,
    '--mew-body': body,
    '--mew-muted': muted,
    '--mew-tone': tone,
    '--mew-blue': colours.helixBlue,
    '--mew-ink': inkOnBlue,
    '--mew-green': colours.green,
    '--mew-orange': colours.orange,
    '--mew-red': colours.red,
    '--mew-hover': hover,
    '--mew-selected': selected,
    '--mew-shadow': reportingPanelShadow(isDarkMode),
    '--mew-deep': withAlpha(colours.darkBlue, isDarkMode ? 0.72 : 0.88),
  } as React.CSSProperties;

  const statusTone = (status: string): string => {
    const key = status.toLowerCase();
    if (key === 'qualified') return colours.green;
    if (key === 'inspect') return colours.highlight;
    if (key.includes('missing')) return colours.orange;
    return colours.red;
  };

  const processingTone = (status: ProcessingEvent['status']): string => {
    if (status === 'complete') return colours.green;
    if (status === 'error') return colours.red;
    if (status === 'selected') return colours.accent;
    if (status === 'running') return colours.highlight;
    return muted;
  };

  return (
    <section className="mew-root" data-helix-region="marketing/email-operations" style={rootVars}>
      <style>{mewStyles}</style>

      <header className="mew-header" data-helix-region="marketing/email-operations/governor">
        <div className="mew-header-lead">
          <strong>Audience workbench</strong>
          <small>{demoModeEnabled ? 'Demo lane' : 'Governed email setup'}</small>
        </div>
        <div className="mew-header-side">
          <span className="mew-status-chip mew-status-chip--guard" title="Mass send is disabled by policy">Protected</span>
          <button type="button" className="mew-btn mew-btn--refresh" onClick={() => refreshAudience(false)} disabled={refreshing || streamsLoading} title={refreshing ? 'Checking source impact' : 'Check source impact'}>
            <FiRefreshCw className={refreshing ? 'is-spinning' : ''} size={12} aria-hidden="true" />
            <span>{refreshing ? 'Checking' : 'Check source'}</span>
          </button>
        </div>
      </header>

      {error && <div className="mew-banner mew-banner--error" role="alert">{error}</div>}
      {sendResult && <div className={`mew-banner mew-banner--${sendResult.status === 'error' ? 'error' : 'ok'}`} role="status">{sendResult.message}</div>}

      <div className={`mew-streams-wrap${streamGridCollapsed ? ' is-closed' : ' is-open'}`} aria-hidden={streamGridCollapsed}>
        <div className="mew-streams" data-helix-region="marketing/email-operations/streams" role="tablist" aria-label="Audience streams">
          {streams.map((stream) => {
            const meta = getAreaGlyphMeta(STREAM_GLYPHS[stream.streamKey]);
            const isSelected = stream.streamKey === selectedStreamKey;
            const heldCount = Math.max(0, stream.total - stream.sendable);
            return (
              <button
                key={stream.streamKey}
                type="button"
                role="tab"
                aria-selected={isSelected}
                style={{ '--stream-accent': meta.color } as React.CSSProperties}
                className={`mew-stream${isSelected ? ' is-selected' : ''}${stream.isSendable ? '' : ' is-inspect'}`}
                onClick={() => selectStream(stream.streamKey)}
              >
                <span className="mew-stream-glyph">{renderAreaOfWorkGlyph(STREAM_GLYPHS[stream.streamKey], meta.color, 'glyph', 22)}</span>
                <span className="mew-stream-info">
                  <strong>{stream.label}</strong>
                  <small>{stream.isSendable ? `${formatNumber(stream.total)} members · ${formatNumber(heldCount)} held` : 'Inspection only — not a campaign stream'}</small>
                </span>
                <span className="mew-stream-tally">
                  <strong style={{ color: stream.isSendable ? 'var(--stream-accent)' : 'var(--mew-muted)' }}>
                    {formatNumber(stream.isSendable ? stream.sendable : stream.total)}
                  </strong>
                  <small>{stream.isSendable ? 'sendable' : 'inspect'}</small>
                </span>
                <span className="mew-stream-arrow" aria-hidden="true">&#8250;</span>
              </button>
            );
          })}
          {streams.length === 0 && (
            <div className="mew-empty">{streamsLoading ? 'Loading streams…' : 'No streams found. Run the audience refresh to materialise members.'}</div>
          )}
        </div>
      </div>

      {streamGridCollapsed && selectedStream && (() => {
        const crumbMeta = getAreaGlyphMeta(STREAM_GLYPHS[selectedStream.streamKey]);
        return (
          <div className="mew-stream-crumb" data-helix-region="marketing/email-operations/stream-crumb">
            <span className="mew-stream-crumb-glyph">{renderAreaOfWorkGlyph(STREAM_GLYPHS[selectedStream.streamKey], crumbMeta.color, 'glyph', 16)}</span>
            <strong className="mew-stream-crumb-label">{selectedStream.label}</strong>
            <small className="mew-stream-crumb-stat">{formatNumber(selectedStream.sendable)} sendable · {formatNumber(selectedStream.total)} total</small>
            <button type="button" className="mew-stream-crumb-change" onClick={() => setStreamGridCollapsed(false)}>Change stream</button>
          </div>
        );
      })()}

      {selectedStreamKey && (
      <section className={`mew-panel mew-proof${proofExpanded ? ' is-expanded' : ''}`} data-helix-region="marketing/email-operations/proof">
        <div className="mew-panel-head mew-proof-head">
          <div className="mew-proof-title">
            <span className="mew-eyebrow">Proof recipients</span>
            <strong>{formatNumber(visibleMembers.length)} recipients</strong>
          </div>
          <button
            type="button"
            className="mew-proof-toggle"
            onClick={() => setProofExpanded((prev) => !prev)}
            title={proofExpanded ? 'Collapse proof recipients' : 'Expand proof recipients'}
            aria-expanded={proofExpanded}
          >
            <span>{proofExpanded ? 'Hide ledger' : 'Show ledger'}</span>
            <span className="mew-proof-toggle-mark" aria-hidden="true" />
          </button>
        </div>
        {proofExpanded && (
          <>
            <div className="mew-proof-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 13px', borderBottom: `1px solid ${edge}`, flexWrap: 'wrap', background: elevated }}>
              <label className="mew-toggle">
                <input type="checkbox" checked={qualifiedOnly} onChange={(event) => setQualifiedOnly(event.currentTarget.checked)} />
                Sendable only
              </label>
              <input
                className="mew-search"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.currentTarget.value)}
                placeholder="Search ACID, area, tags"
                aria-label="Search recipients"
                style={{ flex: 1, minWidth: 140 }}
              />
              <button type="button" className="mew-mini-action" onClick={() => refreshAudience(true)} disabled={refreshing || streamsLoading}>
                {refreshing ? 'Materialising' : 'Materialise source rows'}
              </button>
              <button type="button" className="mew-mini-action" onClick={qualityCheckStream} disabled={qualityRunning || membersLoading}>
                {qualityRunning ? 'Checking' : 'Quality check stream'}
              </button>
            </div>
            {streams.reduce((sum, stream) => sum + stream.total, 0) === 0 && !streamsLoading ? (
              <div className="mew-proof-empty" role="status" data-helix-region="marketing/email-operations/empty">
                <strong>Audience spine is empty.</strong>
                <span>Run <em>Refresh audience</em> to populate from new space enquiries, then segment and proof here.</span>
                <button type="button" className="mew-btn mew-btn--primary" onClick={() => refreshAudience(false)} disabled={refreshing}>
                  {refreshing ? 'Checking' : 'Check source'}
                </button>
              </div>
            ) : (
            <div className="mew-table-wrap mew-table-wrap--compact">
              <table className="mew-table mew-table--compact">
                <thead>
                  <tr>
                    {['Identity', 'Stream', 'Area', 'Rank', 'Client', 'Status'].map((heading) => (
                      <th key={heading} style={{ paddingTop: 6, paddingBottom: 6, fontSize: 8 }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.slice(0, 60).map((member) => (
                    <tr key={member.memberId}>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}>
                        <div className="mew-id" style={{ gap: 1 }}>
                          <input className="mew-ledger-input mew-ledger-input--strong" defaultValue={member.acid || ''} placeholder="No ACID" disabled={savingMemberId === member.memberId} onBlur={(event) => { const next = event.currentTarget.value.trim(); if (next !== (member.acid || '')) void patchMember(member, { acid: next }); }} />
                          <small style={{ fontSize: 8 }}>{maskedContact(member)}</small>
                        </div>
                      </td>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}>
                        <select className="mew-ledger-select" value={member.streamKey} disabled={savingMemberId === member.memberId} onChange={(event) => void patchMember(member, { streamKey: event.currentTarget.value as StreamKey })}>
                          {STREAM_OPTIONS.map((stream) => <option key={stream.streamKey} value={stream.streamKey}>{stream.label}</option>)}
                        </select>
                      </td>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}><input className="mew-ledger-input" defaultValue={member.areaOfWork || ''} placeholder="Area" disabled={savingMemberId === member.memberId} onBlur={(event) => { const next = event.currentTarget.value.trim(); if (next !== (member.areaOfWork || '')) void patchMember(member, { areaOfWork: next }); }} /></td>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}>
                        <select className="mew-ledger-select mew-ledger-select--rank" value={member.rank == null ? '' : String(member.rank)} disabled={savingMemberId === member.memberId} onChange={(event) => void patchMember(member, { rank: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })}>
                          <option value="">none</option>
                          {RANK_OPTIONS.filter((option) => option !== 'any').map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </td>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}>
                        <label className="mew-ledger-check">
                          <input type="checkbox" checked={member.client} disabled={savingMemberId === member.memberId} onChange={(event) => void patchMember(member, { client: event.currentTarget.checked })} />
                          {member.client ? 'Client' : 'Prospect'}
                        </label>
                      </td>
                      <td style={{ paddingTop: 5, paddingBottom: 5, fontSize: 10 }}>
                        <span className="mew-status" style={{ color: statusTone(member.qualificationStatus), fontSize: 8 }}>
                          <span className="mew-dot" style={{ width: 5, height: 5, background: statusTone(member.qualificationStatus) }} />
                          {member.qualificationStatus.slice(0, 3)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visibleMembers.length === 0 && (
                <div className="mew-empty" style={{ fontSize: 10, padding: '8px 12px' }}>{membersLoading ? 'Loading…' : 'No recipients.'}</div>
              )}
              {visibleMembers.length > 60 && (
                <small className="mew-more" style={{ fontSize: 8, padding: '6px 12px', color: muted }}>Showing 60 of {formatNumber(visibleMembers.length)}</small>
              )}
            </div>
            )}
          </>
        )}
      </section>
      )}

      {selectedStreamKey && (
      <section className="mew-panel mew-console" data-helix-region="marketing/email-operations/console">
        <div className="mew-panel-head" style={{ background: `${resolveStreamAccentColor(selectedStreamKey)}${isDarkMode ? '12' : '0a'}`, borderBottom: `1px solid ${resolveStreamAccentColor(selectedStreamKey)}${isDarkMode ? '2e' : '24'}` }}>
          <span className="mew-eyebrow">Campaign console</span>
          <strong>{isLiveStream ? `${formatNumber(segmentMembers.length)} in segment` : 'Inspection stream'}</strong>
          <span className="mew-console-context">{selectedStream?.label || 'Stream'} · {SENDERS.find((sender) => sender.value === composeSender)?.label}</span>
        </div>

        <div className="mew-setup-bar" data-helix-region="marketing/email-operations/setup">
          <label className="mew-setup-field">
            <span>From</span>
            <select value={composeSender} onChange={(event) => { setComposeSender(event.currentTarget.value); setLockedCampaign(null); }}>
              {SENDERS.map((sender) => <option key={sender.value} value={sender.value}>{sender.label}</option>)}
            </select>
          </label>
          <label className="mew-setup-field">
            <span>Signature</span>
            <select value={composeSignature} onChange={(event) => { setComposeSignature(event.currentTarget.value); setLockedCampaign(null); }}>
              {SIGNATURES.map((signature) => <option key={signature.value} value={signature.value}>{signature.label}</option>)}
            </select>
          </label>
          {showRankEditor && (
            <>
              <label className="mew-setup-field">
                <span>Rank from</span>
                <select value={rankMin} onChange={(event) => { setRankMin(event.currentTarget.value); setLockedCampaign(null); }}>
                  {RANK_OPTIONS.map((option) => <option key={option} value={option}>{option === 'any' ? 'Any' : option}</option>)}
                </select>
              </label>
              <label className="mew-setup-field">
                <span>Rank to</span>
                <select value={rankMax} onChange={(event) => { setRankMax(event.currentTarget.value); setLockedCampaign(null); }}>
                  {RANK_OPTIONS.map((option) => <option key={option} value={option}>{option === 'any' ? 'Any' : option}</option>)}
                </select>
              </label>
            </>
          )}
          <button
            type="button"
            className={`mew-rank-chip${showRankEditor ? ' mew-rank-chip--active' : ''}`}
            onClick={() => setShowRankEditor((prev) => !prev)}
            title={showRankEditor ? 'Collapse rank range' : 'Edit rank range'}
          >
            Rank {rankMin === 'any' ? '0' : rankMin}&#x2013;{rankMax === 'any' ? '4' : rankMax}
            <span className="mew-rank-chip-chevron">{showRankEditor ? '▾' : '▸'}</span>
          </button>
          <label className="mew-switch mew-setup-switch">
            <input type="checkbox" checked={excludeClients} onChange={(event) => { setExcludeClients(event.currentTarget.checked); setLockedCampaign(null); }} />
            <span className="mew-switch-track" aria-hidden="true" />
            Exclude clients ({formatNumber(selectedStream?.clients ?? 0)})
          </label>
          <div className="mew-setup-actions">
            <button type="button" className="mew-btn mew-btn--primary" onClick={lockCampaign} disabled={!canLock}>
              {locking ? 'Locking' : lockedCampaign ? 'Campaign locked' : 'Lock campaign'}
            </button>
            <button type="button" className="mew-btn mew-btn--ghost" onClick={sendTest} disabled={!canTest || testSending}>
              {testSending ? 'Sending' : 'Test send to me'}
            </button>
            <button type="button" className="mew-btn mew-btn--locked" disabled title="Mass send is disabled until suppression, audit, telemetry and approval controls are live">
              Mass send off
            </button>
          </div>
        </div>

        <div
          ref={composeLayoutRef}
          className={`mew-compose${composerResizing ? ' is-resizing' : ''}`}
          style={{ '--compose-left': `${composerSplitPct}%` } as React.CSSProperties}
        >
          <div className="mew-compose-fields">
            <label className="mew-field">
              <span>Subject</span>
              <input value={composeSubject} onChange={(event) => { setComposeSubject(event.currentTarget.value); setLockedCampaign(null); }} placeholder="Subject line" maxLength={240} />
            </label>
            <label className="mew-field">
              <span>Preheader</span>
              <input value={composePreheader} onChange={(event) => { setComposePreheader(event.currentTarget.value); setLockedCampaign(null); }} placeholder="Preview text shown in the inbox" maxLength={240} />
            </label>
            <label className="mew-field mew-field--body">
              <span>Body</span>
              <textarea value={composeBody} onChange={(event) => { setComposeBody(event.currentTarget.value); setLockedCampaign(null); }} rows={14} />
            </label>
          </div>

          <button
            type="button"
            className="mew-compose-resizer"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setComposerResizing(true);
            }}
            onDoubleClick={() => setComposerSplitPct(68)}
            aria-label="Resize composer and preview panels"
            title="Drag to resize composer and preview"
          />

          <aside className="mew-compose-side">
            <div className="mew-birdseye" data-helix-region="marketing/email-operations/compose-sidecar" aria-label="Campaign overview">
              <div className="mew-birdseye-head">
                <span className="mew-eyebrow">Campaign view</span>
                <strong>{selectedStream?.label || 'Select a list'}</strong>
              </div>
              <div className="mew-birdseye-counts" aria-label="Campaign recipient counts">
                <span><small>Selected</small><strong>{formatNumber(segmentMembers.length)}</strong></span>
                <span><small>Held</small><strong>{formatNumber(campaignHeldCount)}</strong></span>
                <span><small>Clients</small><strong>{excludeClients ? 'Off' : 'On'}</strong></span>
              </div>
              <dl className="mew-birdseye-details">
                <div><dt>From</dt><dd>{selectedSenderLabel}</dd></div>
                <div><dt>Signature</dt><dd>{selectedSignatureLabel}</dd></div>
                <div><dt>Rank</dt><dd>{campaignRankWindow}</dd></div>
                <div><dt>Subject</dt><dd>{composeSubject.trim() ? 'Ready' : 'Needed'}</dd></div>
                <div><dt>Proof</dt><dd>{campaignProofState}</dd></div>
                <div><dt>Lock</dt><dd>{campaignLockState}</dd></div>
              </dl>
              <div className="mew-birdseye-flow" aria-label="Campaign send path">
                <span className={campaignDraftReady ? 'is-ready' : ''}>Draft</span>
                <span className={canLock || lockedCampaign ? 'is-ready' : ''}>Snapshot</span>
                <span className={canTest ? 'is-ready' : ''}>Proof</span>
                <span>Mass send off</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
      )}

      {selectedStreamKey && (
      <section className="mew-panel mew-email-preview" data-helix-region="marketing/email-operations/preview">
        <div className="mew-email-bar">
          <span className="mew-eyebrow">Inbox preview</span>
          <strong>{selectedSenderLabel} | {selectedSignatureLabel}</strong>
          <small>{previewLoading ? 'Rendering signature' : 'Rendered from SendGrid email HTML'}</small>
        </div>
        <div className="mew-device-previews">
          {renderDevicePreview('desktop')}
          <div className="mew-device-pair">
            {renderDevicePreview('ipad')}
            {renderDevicePreview('mobile')}
          </div>
        </div>
      </section>
      )}

      {selectedStreamKey && (
      <section className="mew-panel mew-processing-window" data-helix-region="marketing/email-operations/processing-window" aria-live="polite">
        <div className="mew-panel-head mew-processing-head">
          <span className="mew-eyebrow">Processing window</span>
          <strong>{processingEvents.length > 0 ? `${formatNumber(processingEvents.length)} recent` : 'Waiting'}</strong>
        </div>
        {processingEvents.length === 0 ? (
          <div className="mew-processing-empty" aria-label="Waiting for email processing activity">
            <span className="mew-processing-pulse" aria-hidden="true" />
          </div>
        ) : (
          <div className="mew-processing-feed" role="list">
            {processingEvents.map((event) => (
              <article key={event.id} className="mew-processing-event" role="listitem" style={{ '--event-tone': processingTone(event.status) } as React.CSSProperties}>
                <span className="mew-processing-event-dot" aria-hidden="true" />
                <div className="mew-processing-event-copy">
                  <strong>{event.label}</strong>
                  <small>{event.detail}</small>
                </div>
                <time dateTime={event.at}>{formatStamp(event.at)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {selectedStreamKey && (
      <section className="mew-panel mew-sendgrid-bridge" data-helix-region="marketing/email-operations/sendgrid-bridge">
        <div className="mew-panel-head mew-sendgrid-head">
          <span className="mew-eyebrow">SendGrid bridge</span>
          <strong>{sendGridBridge.connected ? 'Connected' : 'Gateway checks'}</strong>
          <span className="mew-sendgrid-message">{sendGridBridge.message}</span>
        </div>
        <div className="mew-sendgrid-body">
          <div className="mew-sendgrid-actions">
            <button type="button" className="mew-mini-action" onClick={checkSendGridConnection} disabled={sendGridBridge.connectionStatus === 'loading'}>
              {sendGridBridge.connectionStatus === 'loading' ? 'Checking' : 'Check connection'}
            </button>
            <button type="button" className="mew-mini-action" onClick={checkSendGridActivity} disabled={sendGridBridge.activityStatus === 'loading'}>
              {sendGridBridge.activityStatus === 'loading' ? 'Checking' : 'Activity access'}
            </button>
          </div>
          <div className="mew-sendgrid-facts" aria-label="SendGrid gateway facts">
            <span><small>Provider</small><strong>{sendGridBridge.connectionStatus === 'idle' ? 'Not checked' : sendGridBridge.connected ? 'OK' : 'Check'}</strong></span>
            <span><small>Mail send</small><strong>{sendGridBridge.hasMailSend == null ? '-' : sendGridBridge.hasMailSend ? 'Yes' : 'No'}</strong></span>
            <span><small>Activity</small><strong>{sendGridBridge.activityStatus === 'idle' ? '-' : sendGridBridge.activityAvailable ? 'Available' : 'Unavailable'}</strong></span>
            <span><small>Sample</small><strong>{sendGridBridge.sampleSize == null ? '-' : formatNumber(sendGridBridge.sampleSize)}</strong></span>
            <span><small>Last event</small><strong>{sendGridBridge.lastActivityAt ? formatStamp(sendGridBridge.lastActivityAt) : '-'}</strong></span>
          </div>
        </div>
      </section>
      )}

      <section className="mew-panel mew-history" data-helix-region="marketing/email-operations/history">
        <div className="mew-panel-head">
          <span className="mew-eyebrow">Campaign history</span>
          <strong>{campaigns.length > 0 ? `${formatNumber(campaigns.length)} recent` : 'No campaigns yet'}</strong>
        </div>
        <div className="mew-table-wrap">
          <table className="mew-table">
            <thead>
              <tr>
                {['Campaign', 'Stream', 'Status', 'Selected', 'Held', 'Locked'].map((heading) => <th key={heading}>{heading}</th>)}
              </tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 24).map((campaign) => (
                <tr key={campaign.campaignId}>
                  <td>
                    <div className="mew-id">
                      <strong>{campaign.campaignName}</strong>
                      <small>{campaign.subject || 'No subject'}</small>
                    </div>
                  </td>
                  <td>{campaign.streamKey}</td>
                  <td><span className="mew-pill" style={{ color: campaign.status === 'sent' ? colours.green : campaign.status === 'locked' ? colours.highlight : muted }}>{campaign.status}</span></td>
                  <td>{campaign.selectedCount == null ? '—' : formatNumber(campaign.selectedCount)}</td>
                  <td>{campaign.blockedCount == null ? '—' : formatNumber(campaign.blockedCount)}</td>
                  <td>{formatStamp(campaign.lockedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {campaigns.length === 0 && <div className="mew-empty">Locked campaigns will appear here with their sendable and held counts.</div>}
        </div>
      </section>
    </section>
  );
};

const mewStyles = `
.mew-root { display: grid; gap: 12px; min-width: 0; font-family: 'Raleway', sans-serif; color: var(--mew-text); }
.mew-root * { box-sizing: border-box; }
.mew-eyebrow { font-size: 9px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mew-muted); }
.mew-eyebrow--ink { color: rgba(255,255,255,0.78); }

.mew-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--mew-edge); background: transparent; }
.mew-header-lead { display: grid; gap: 2px; min-width: 0; }
.mew-header-lead strong { color: var(--mew-text); font-size: 16px; font-weight: 900; line-height: 1.05; }
.mew-header-lead small { color: var(--mew-body); font-size: 10px; font-weight: 700; line-height: 1.4; }
.mew-header-side { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.mew-header-status { display: flex; align-items: center; gap: 5px; }
.mew-status-chip { min-height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
.mew-status-chip--ok { border-color: rgba(32,178,108,0.28); color: var(--mew-green); }
.mew-status-chip--warn { border-color: rgba(255,140,0,0.32); color: var(--mew-orange); }
.mew-status-chip--guard { border-color: rgba(214,85,65,0.3); color: var(--mew-red); }
.mew-btn--refresh { min-height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); border-radius: 3px; font-size: 9px; line-height: 1; cursor: pointer; text-transform: uppercase; letter-spacing: 0.03em; transition: background 160ms ease, border-color 160ms ease, transform 140ms ease; }
.mew-btn--refresh:hover:not(:disabled) { background: var(--mew-hover); border-color: var(--mew-tone); transform: translateY(-1px); }
.mew-btn--refresh:disabled { opacity: 0.5; cursor: default; }
.mew-btn--refresh .is-spinning { animation: mewSpin 900ms linear infinite; }
.mew-synced { color: var(--mew-muted); font-size: 9px; font-weight: 800; white-space: nowrap; }
@keyframes mewSpin { to { transform: rotate(360deg); } }

.mew-banner { padding: 8px 12px; font-size: 11px; font-weight: 800; border: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-banner--error { border-color: rgba(214,85,65,0.45); color: var(--mew-red); background: rgba(214,85,65,0.08); }
.mew-banner--ok { border-color: rgba(32,178,108,0.4); color: var(--mew-green); background: rgba(32,178,108,0.08); }

.mew-streams-wrap { overflow: hidden; transition: max-height 380ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 260ms ease; }
.mew-streams-wrap.is-open { max-height: 900px; opacity: 1; }
.mew-streams-wrap.is-closed { max-height: 0; opacity: 0; pointer-events: none; }
.mew-streams { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.mew-stream { position: relative; display: flex; align-items: center; gap: 14px; padding: 16px 14px; text-align: left; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); cursor: pointer; overflow: hidden; font-family: inherit; transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-stream::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--stream-accent, var(--mew-tone)); transform: scaleY(0); transform-origin: top; transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1); pointer-events: none; }
.mew-stream:hover { background: var(--mew-hover); transform: translateY(-1px); box-shadow: var(--mew-shadow); }
.mew-stream:hover::before, .mew-stream.is-selected::before { transform: scaleY(1); }
.mew-stream.is-selected { border-color: var(--stream-accent, var(--mew-tone)); background: var(--mew-selected); box-shadow: var(--mew-shadow); }
.mew-stream:active { transform: translateY(0) scale(0.995) !important; }
.mew-stream.is-inspect { opacity: 0.85; }
.mew-stream-glyph { display: inline-flex; flex-shrink: 0; }
.mew-stream-info { flex: 1 1 auto; display: grid; gap: 3px; min-width: 0; }
.mew-stream-info strong { font-size: 14px; font-weight: 900; }
.mew-stream-info small { font-size: 10px; font-weight: 700; color: var(--mew-muted); }
.mew-stream-tally { display: grid; gap: 2px; text-align: right; flex-shrink: 0; min-width: 52px; }
.mew-stream-tally strong { font-size: 22px; font-weight: 900; line-height: 1; }
.mew-stream-tally small { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mew-muted); }
.mew-stream-arrow { font-size: 20px; color: var(--mew-muted); flex-shrink: 0; line-height: 1; transition: transform 160ms ease, color 160ms ease; }
.mew-stream:hover .mew-stream-arrow, .mew-stream.is-selected .mew-stream-arrow { color: var(--stream-accent, var(--mew-tone)); transform: translateX(4px); }
.mew-stream-crumb { display: flex; align-items: center; gap: 10px; padding: 10px 13px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); border-left: 3px solid var(--mew-tone); }
.mew-stream-crumb-glyph { display: inline-flex; flex-shrink: 0; }
.mew-stream-crumb-label { font-size: 13px; font-weight: 900; }
.mew-stream-crumb-stat { font-size: 10px; font-weight: 700; color: var(--mew-muted); flex: 1; }
.mew-stream-crumb-change { margin-left: auto; min-height: 26px; padding: 0 10px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-tone); font-family: 'Raleway', sans-serif; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: background 160ms ease; }
.mew-stream-crumb-change:hover { background: var(--mew-hover); }

.mew-proof-empty { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 18px 14px; border-top: 1px solid var(--mew-edge); }
.mew-proof-empty strong { font-size: 12px; font-weight: 900; color: var(--mew-text); width: 100%; }
.mew-proof-empty span { font-size: 11px; font-weight: 700; color: var(--mew-body); flex: 1 1 240px; min-width: 0; }
.mew-proof-empty em { font-style: normal; font-weight: 900; color: var(--mew-tone); }
.mew-console-context { margin-left: auto; font-size: 10px; font-weight: 800; color: var(--mew-muted); }
.mew-setup-bar { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 11px 13px; border-bottom: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-setup-field { display: grid; gap: 4px; min-width: 122px; flex: 0 0 auto; }
.mew-setup-field > span { color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; }
.mew-setup-field select { width: 100%; min-height: 32px; padding: 0 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 11px; font-weight: 700; }
.mew-setup-switch { margin-left: auto; align-self: center; }
.mew-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 10px; font-weight: 800; color: var(--mew-body); user-select: none; line-height: 1; }
.mew-switch input { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
.mew-switch-track { position: relative; display: inline-block; flex-shrink: 0; width: 32px; height: 18px; border-radius: 9px; background: var(--mew-edge); border: 1px solid transparent; transition: background 160ms ease, border-color 160ms ease; }
.mew-switch-track::after { content: ''; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: var(--mew-surface); border: 1px solid rgba(0,0,0,0.14); transition: transform 160ms ease; }
.mew-switch input:checked + .mew-switch-track { background: var(--mew-tone); border-color: var(--mew-tone); }
.mew-switch input:checked + .mew-switch-track::after { transform: translateX(14px); }
.mew-rank-chip { display: inline-flex; align-items: center; gap: 5px; align-self: flex-end; min-height: 32px; padding: 0 10px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-family: 'Raleway', sans-serif; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: color 160ms ease, border-color 160ms ease, background 160ms ease; }
.mew-rank-chip:hover { color: var(--mew-tone); border-color: var(--mew-tone); }
.mew-rank-chip--active { color: var(--mew-tone); border-color: var(--mew-tone); background: var(--mew-hover); }
.mew-rank-chip-chevron { font-size: 8px; }
.mew-setup-actions { display: flex; align-items: center; gap: 6px; align-self: flex-end; flex-shrink: 0; }
.mew-compose { --compose-left: 68%; display: grid; grid-template-columns: minmax(360px, var(--compose-left)) 10px minmax(240px, 1fr); gap: 10px; padding: 13px; align-items: stretch; overflow-x: auto; }
.mew-compose.is-resizing { user-select: none; cursor: col-resize; }
.mew-compose-fields { display: grid; gap: 10px; min-width: 0; align-content: start; }
.mew-compose-resizer { align-self: stretch; width: 10px; min-height: 100%; border: 1px solid var(--mew-edge); border-top: 0; border-bottom: 0; background: linear-gradient(90deg, transparent, var(--mew-edge), transparent); cursor: col-resize; padding: 0; touch-action: none; opacity: 0.72; transition: opacity 160ms ease, background 160ms ease; }
.mew-compose-resizer:hover, .mew-compose.is-resizing .mew-compose-resizer { opacity: 1; background: linear-gradient(90deg, transparent, var(--mew-tone), transparent); }
.mew-compose-side { display: grid; min-width: 0; align-content: stretch; }
.mew-birdseye { display: grid; gap: 12px; align-content: start; min-height: 100%; padding: 13px; border: 1px solid var(--mew-edge); border-left: 3px solid var(--mew-tone); background: var(--mew-surface); box-shadow: var(--mew-shadow); }
.mew-birdseye-head { display: grid; gap: 3px; min-width: 0; }
.mew-birdseye-head strong { color: var(--mew-text); font-size: 15px; font-weight: 900; line-height: 1.15; overflow-wrap: anywhere; }
.mew-birdseye-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
.mew-birdseye-counts span { display: grid; gap: 3px; min-width: 0; padding: 9px 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-birdseye-counts small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; }
.mew-birdseye-counts strong { color: var(--mew-text); font-size: 15px; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
.mew-birdseye-details { display: grid; gap: 0; margin: 0; border-top: 1px solid var(--mew-edge); }
.mew-birdseye-details div { display: grid; grid-template-columns: minmax(72px, 0.42fr) minmax(0, 1fr); gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--mew-edge); align-items: start; }
.mew-birdseye-details dt { color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; }
.mew-birdseye-details dd { margin: 0; color: var(--mew-body); font-size: 11px; font-weight: 800; line-height: 1.35; overflow-wrap: anywhere; }
.mew-birdseye-flow { display: grid; gap: 6px; }
.mew-birdseye-flow span { min-height: 24px; display: flex; align-items: center; padding: 0 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; }
.mew-birdseye-flow span.is-ready { border-color: rgba(32,178,108,0.34); background: rgba(32,178,108,0.08); color: var(--mew-green); }
.mew-email-preview { border: 1px solid var(--mew-edge); border-left: 3px solid var(--mew-tone); background: var(--mew-elevated); overflow: hidden; }
.mew-email-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 11px; border-bottom: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-email-bar strong { color: var(--mew-text); font-size: 11px; font-weight: 900; }
.mew-email-bar small { font-size: 9px; font-weight: 800; color: var(--mew-muted); }
.mew-device-previews { display: grid; gap: 16px; padding: 16px; }
.mew-device-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 0.6fr); gap: 16px; align-items: start; }
.mew-device { min-width: 0; border: 1px solid var(--mew-edge); background: var(--mew-surface); box-shadow: var(--mew-shadow); overflow: hidden; }
.mew-device--desktop { max-width: none; }
.mew-device--ipad { max-width: 620px; }
.mew-device--mobile { width: min(100%, 360px); max-width: 360px; justify-self: end; }
.mew-device-chrome { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; padding: 0 10px; background: var(--mew-blue); color: var(--mew-ink); }
.mew-device-chrome span, .mew-device-chrome em { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-device-inbox-row { display: grid; grid-template-columns: minmax(64px, 0.42fr) minmax(0, 1fr) minmax(80px, 0.7fr); gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--mew-edge); background: var(--mew-control); align-items: center; }
.mew-device-inbox-row strong, .mew-device-inbox-row span, .mew-device-inbox-row small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-device-inbox-row strong { color: var(--mew-text); font-size: 10px; font-weight: 900; }
.mew-device-inbox-row span { color: var(--mew-body); font-size: 10px; font-weight: 800; }
.mew-device-inbox-row small { color: var(--mew-muted); font-size: 9px; font-weight: 700; }
.mew-rendered-shell { padding: 16px; background: color-mix(in srgb, var(--mew-control) 62%, #ffffff); }
.mew-rendered-frame { display: block; width: 100%; border: 1px solid rgba(17,24,39,0.08); background: #ffffff; overflow: hidden; scrollbar-width: none; }
.mew-rendered-frame::-webkit-scrollbar { display: none; }
.mew-device--ipad .mew-device-inbox-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
.mew-device--mobile .mew-device-inbox-row { grid-template-columns: minmax(0, 1fr); gap: 2px; }
.mew-device--ipad .mew-rendered-shell { padding: 12px; }
.mew-device--mobile .mew-rendered-shell { padding: 10px; }
.mew-processing-window { min-height: 132px; }
.mew-processing-head { background: var(--mew-elevated); }
.mew-processing-empty { min-height: 84px; display: grid; place-items: center; background: linear-gradient(90deg, transparent, var(--mew-control), transparent); }
.mew-processing-pulse { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--mew-tone); background: var(--mew-control); box-shadow: 0 0 0 0 color-mix(in srgb, var(--mew-tone) 25%, transparent); animation: mewProcessingPulse 1800ms ease-in-out infinite; opacity: 0.72; }
.mew-processing-feed { display: grid; gap: 0; max-height: 220px; overflow-y: auto; }
.mew-processing-event { --event-tone: var(--mew-tone); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 12px; border-top: 1px solid var(--mew-edge); background: var(--mew-surface); }
.mew-processing-event:first-child { border-top: 0; }
.mew-processing-event-dot { width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; background: var(--event-tone); box-shadow: 0 0 0 3px color-mix(in srgb, var(--event-tone) 14%, transparent); }
.mew-processing-event-copy { display: grid; gap: 2px; min-width: 0; }
.mew-processing-event-copy strong { color: var(--mew-text); font-size: 11px; font-weight: 900; }
.mew-processing-event-copy small { color: var(--mew-muted); font-size: 10px; font-weight: 700; line-height: 1.4; }
.mew-processing-event time { color: var(--mew-muted); font-size: 9px; font-weight: 800; white-space: nowrap; }
@keyframes mewProcessingPulse { 0%, 100% { transform: scale(0.92); box-shadow: 0 0 0 0 color-mix(in srgb, var(--mew-tone) 24%, transparent); } 50% { transform: scale(1); box-shadow: 0 0 0 8px color-mix(in srgb, var(--mew-tone) 0%, transparent); } }
.mew-sendgrid-bridge { border-left: 3px solid var(--mew-blue); }
.mew-sendgrid-head { background: var(--mew-elevated); }
.mew-sendgrid-message { margin-left: auto; color: var(--mew-muted); font-size: 10px; font-weight: 800; line-height: 1.35; }
.mew-sendgrid-body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 11px 12px; }
.mew-sendgrid-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.mew-sendgrid-facts { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 7px; }
.mew-sendgrid-facts span { display: grid; gap: 2px; padding: 7px 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); min-width: 0; }
.mew-sendgrid-facts small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; }
.mew-sendgrid-facts strong { color: var(--mew-text); font-size: 10px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-panel { border: 1px solid var(--mew-edge); background: var(--mew-surface); box-shadow: var(--mew-shadow); min-width: 0; }
.mew-panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 13px; border-bottom: 1px solid var(--mew-edge); transition: background 200ms ease, border-color 200ms ease; }
.mew-panel-head strong { font-size: 14px; font-weight: 900; }
.mew-panel-actions { display: inline-flex; align-items: center; gap: 9px; margin-left: auto; flex-wrap: wrap; }

.mew-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 800; color: var(--mew-body); cursor: pointer; }
.mew-search { min-height: 28px; min-width: 160px; padding: 0 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-size: 11px; font-weight: 700; }

.mew-proof { max-height: 68px; display: flex; flex-direction: column; overflow: hidden; transition: max-height 320ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 200ms ease; margin-top: -10px; z-index: 1; position: relative; border-top: 1px solid transparent; }
.mew-proof.is-expanded { max-height: 480px; }
.mew-proof-head { flex-shrink: 0; justify-content: space-between; background: var(--mew-elevated); border-bottom: 1px solid var(--mew-edge); }
.mew-proof-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mew-proof-title strong { font-size: 12px; color: var(--mew-muted); }
.mew-proof .mew-proof-actions { flex-shrink: 0; }
.mew-proof .mew-table-wrap--compact, .mew-proof .mew-proof-empty { flex: 1; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.mew-proof .mew-table-wrap--compact::-webkit-scrollbar, .mew-proof .mew-proof-empty::-webkit-scrollbar { display: none; }
.mew-proof .mew-table--compact { font-size: 10px; }
.mew-proof .mew-table--compact th, .mew-proof .mew-table--compact td { padding: 4px 8px; }
.mew-proof .mew-table--compact tbody tr:hover { background: var(--mew-hover); }
.mew-proof-toggle { min-height: 28px; display: inline-flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); cursor: pointer; font-family: 'Raleway', sans-serif; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; transition: border-color 160ms ease, background 160ms ease; }
.mew-proof-toggle:hover { border-color: var(--mew-tone); background: var(--mew-hover); }
.mew-proof-toggle-mark { position: relative; width: 14px; height: 14px; border: 1px solid var(--mew-edge); border-radius: 50%; transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 160ms ease; }
.mew-proof-toggle-mark::before, .mew-proof-toggle-mark::after { content: ''; position: absolute; left: 3px; right: 3px; top: 6px; height: 1px; background: var(--mew-tone); transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 160ms ease; }
.mew-proof-toggle-mark::after { transform: rotate(90deg); }
.mew-proof-toggle[aria-expanded="true"] .mew-proof-toggle-mark { transform: rotate(180deg); border-color: var(--mew-tone); }
.mew-proof-toggle[aria-expanded="true"] .mew-proof-toggle-mark::after { opacity: 0; transform: rotate(0); }
.mew-mini-action { min-height: 28px; padding: 0 9px; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
.mew-mini-action:hover:not(:disabled) { background: var(--mew-hover); border-color: var(--mew-tone); }
.mew-mini-action:disabled { cursor: default; opacity: 0.58; }
.mew-ledger-input, .mew-ledger-select { width: 100%; min-height: 22px; border: 1px solid transparent; background: transparent; color: var(--mew-body); font-family: 'Raleway', sans-serif; font-size: 10px; font-weight: 700; padding: 0 4px; }
.mew-ledger-input:focus, .mew-ledger-select:focus { outline: none; border-color: var(--mew-tone); background: var(--mew-control); }
.mew-ledger-input--strong { color: var(--mew-text); font-weight: 900; }
.mew-ledger-select--rank { max-width: 54px; }
.mew-ledger-check { display: inline-flex; align-items: center; gap: 5px; font-size: 8px; font-weight: 900; color: var(--mew-muted); text-transform: uppercase; }
.mew-ledger-check input { accent-color: var(--mew-tone); }
.mew-table { width: 100%; border-collapse: collapse; min-width: 540px; }
.mew-table th { position: sticky; top: 0; text-align: left; padding: 8px 11px; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; color: var(--mew-ink); background: var(--mew-blue); }
.mew-table td { padding: 9px 11px; font-size: 11px; border-bottom: 1px solid var(--mew-edge); color: var(--mew-body); vertical-align: top; }
.mew-table tbody tr:hover { background: var(--mew-hover); }
.mew-id { display: grid; gap: 2px; min-width: 0; }
.mew-id strong { font-size: 12px; font-weight: 900; color: var(--mew-text); }
.mew-id small { font-size: 9px; color: var(--mew-muted); }

.mew-pill { display: inline-flex; align-items: center; min-height: 18px; padding: 1px 7px; font-size: 10px; font-weight: 900; border: 1px solid var(--mew-edge); color: var(--mew-text); }
.mew-pill--warn { border-color: rgba(255,140,0,0.5); color: var(--mew-orange); }
.mew-pill--client { border-color: rgba(255,140,0,0.5); color: var(--mew-orange); }
.mew-tags { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.mew-tag { font-size: 9px; font-weight: 800; padding: 1px 6px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-body); }
.mew-status { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }
.mew-status .mew-dot { width: 7px; height: 7px; }

.mew-console { display: grid; gap: 0; }
.mew-field { display: grid; gap: 5px; min-width: 0; }
.mew-field > span { color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; }
.mew-field input, .mew-field select, .mew-field textarea { width: 100%; min-height: 32px; padding: 0 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 11px; font-weight: 700; }
.mew-field textarea { min-height: 220px; padding: 10px; resize: vertical; line-height: 1.6; font-weight: 600; }
.mew-field--body textarea { min-height: 300px; }

.mew-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.mew-btn { min-height: 32px; padding: 0 12px; font-family: 'Raleway', sans-serif; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); cursor: pointer; transition: background 160ms ease, box-shadow 160ms ease, transform 140ms ease; }
.mew-btn:hover:not(:disabled) { box-shadow: var(--mew-shadow); transform: translateY(-1px); }
.mew-btn:disabled { cursor: default; opacity: 0.62; }
.mew-btn--primary { background: var(--mew-tone); border-color: var(--mew-tone); color: #ffffff; }
.mew-btn--ghost { background: var(--mew-hover); border-color: var(--mew-tone); color: var(--mew-tone); }
.mew-btn--locked { background: repeating-linear-gradient(135deg, var(--mew-control), var(--mew-control) 6px, transparent 6px, transparent 12px); color: var(--mew-muted); }

.mew-empty { padding: 13px 14px; font-size: 11px; font-weight: 700; color: var(--mew-muted); }
.mew-more { display: block; padding: 8px 12px; font-size: 10px; font-weight: 800; color: var(--mew-muted); }

@media (max-width: 1080px) {
  .mew-streams { grid-template-columns: 1fr; }
  .mew-header { flex-direction: column; align-items: flex-start; }
  .mew-header-side { width: 100%; justify-content: flex-start; }
}
@media (max-width: 920px) {
  .mew-compose { grid-template-columns: minmax(280px, var(--compose-left)) 8px minmax(280px, 1fr); }
  .mew-sendgrid-body { grid-template-columns: 1fr; }
  .mew-sendgrid-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .mew-compose { grid-template-columns: minmax(240px, var(--compose-left)) 8px minmax(240px, 1fr); }
  .mew-device-pair { grid-template-columns: minmax(0, 1fr) minmax(130px, 0.68fr); }
  .mew-sendgrid-facts { grid-template-columns: 1fr; }
  .mew-setup-switch { margin-left: 0; }
  .mew-setup-field { min-width: 100%; }
}
`;

export default MarketingEmailWorkbench;
