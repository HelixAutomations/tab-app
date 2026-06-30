import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiChevronRight, FiLock, FiMail, FiPauseCircle, FiRefreshCw, FiSlash, FiTarget } from 'react-icons/fi';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelBorder,
  reportingPanelShadow,
} from '../../Reporting/styles/reportingFoundation';
import { getApiUrl } from '../../../utils/getApiUrl';
import { getAreaGlyphMeta, renderAreaOfWorkGlyph } from '../../../components/filter/areaGlyphs';
import { isDevOwner } from '../../../app/admin';
import { useToast } from '../../../components/feedback/ToastProvider';
import { useTheme } from '../../../app/functionality/ThemeContext';
import lightAvatarMark from '../../../assets/dark blue mark.svg';
import darkAvatarMark from '../../../assets/markwhite.svg';

type StreamKey = 'commercial' | 'construction' | 'property' | 'employment' | 'other';

type AudienceStream = {
  streamKey: StreamKey;
  label: string;
  isSendable: boolean;
  sortOrder: number;
  status: string;
  total: number;
  listSize?: number;
  sourceListSize?: number;
  legacyCount?: number;
  newSpaceCount?: number;
  sourceWithEmail?: number;
  membershipCount?: number;
  migrationBacklog?: number;
  migrationCoverage?: number;
  lastSourceSeenAt?: string | null;
  listCountBasis?: string;
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
  contactName: string | null;
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
  createdAt: string | null;
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

type CampaignBatchStatusCounts = {
  selectedCount: number;
  notSentCount: number;
  sendingCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
};

type CampaignBatchPreview = {
  batchLimit: number;
  batchRecipientCount: number;
  skippedCount: number;
  bodyHashMatches: boolean;
  statusCounts: CampaignBatchStatusCounts;
};

type MemberCampaignHistoryItem = {
  recipientId: string;
  campaignId: string;
  campaignKey: string;
  streamKey: StreamKey;
  campaignName: string;
  subject: string;
  senderEmail: string;
  campaignStatus: string;
  selectionStatus: string;
  selectionReason: string;
  sendStatus: string;
  providerStatus: string;
  sendgridMessageId: string;
  snapshotAt: string | null;
  createdAt: string | null;
  lockedAt: string | null;
  sentAt: string | null;
  campaignSentAt: string | null;
  sentBy: string;
};

type MemberCampaignHistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: MemberCampaignHistoryItem[];
  message?: string;
  generatedAt?: string;
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
  { value: 'careers@helix-law.com', label: 'Careers' },
  { value: 'support@helix-law.com', label: 'Support' },
  { value: 'operations@helix-law.com', label: 'Operations' },
  { value: 'lz@helix-law.com', label: 'LZ' },
];

const SIGNATURES = [
  { value: 'data-hub-v2', label: 'Helix email v2' },
];

type CampaignStep = 'audience' | 'copy' | 'review';
const WIZARD_STEPS: Array<{ key: CampaignStep; label: string; hint: string }> = [
  { key: 'audience', label: 'Audience', hint: 'Sender, exclusions and batches' },
  { key: 'copy', label: 'Copy', hint: 'Subject, preheader and body' },
  { key: 'review', label: 'Proof', hint: 'Test, lock and release batches' },
];

const RANK_OPTIONS = ['0', '1', '2', '3', '4'];
type MemberSortKey = 'identity' | 'touchpoint' | 'subscription' | 'rank' | 'relationship' | 'outcome' | 'status' | 'tags' | 'matter';
type MemberSortDirection = 'asc' | 'desc';
type MemberColumnFilters = Record<MemberSortKey, string>;
type MemberFilterOperator = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'starts_with' | 'ends_with';
type MemberColumnFilterOperators = Record<MemberSortKey, MemberFilterOperator>;

const MEMBER_TABLE_COLUMNS: Array<{ key: MemberSortKey; label: string; filter: 'text' | 'select'; options?: Array<{ value: string; label: string }> }> = [
  { key: 'identity', label: 'Identity', filter: 'text' },
  { key: 'touchpoint', label: 'Touchpoint', filter: 'text' },
  { key: 'subscription', label: 'Subscription', filter: 'text' },
  { key: 'rank', label: 'Rank', filter: 'select', options: [{ value: '', label: 'All' }, ...RANK_OPTIONS.map((option) => ({ value: option, label: option }))] },
  { key: 'relationship', label: 'Relationship', filter: 'select', options: [{ value: '', label: 'All' }, { value: 'client', label: 'Client' }, { value: 'prospect', label: 'Prospect' }] },
  { key: 'outcome', label: 'Outcome', filter: 'select', options: [{ value: '', label: 'All' }, { value: 'qualified', label: 'Qualified' }, { value: 'inspect', label: 'Inspect' }, { value: 'blocked', label: 'Blocked' }, { value: 'suppressed', label: 'Suppressed' }, { value: 'missing_acid', label: 'Missing ACID' }, { value: 'missing_email', label: 'Missing email' }] },
  { key: 'status', label: 'Status', filter: 'text' },
  { key: 'tags', label: 'Tags', filter: 'text' },
  { key: 'matter', label: 'Matter', filter: 'text' },
];

const emptyMemberColumnFilters = (): MemberColumnFilters => ({ identity: '', touchpoint: '', subscription: '', rank: '', relationship: '', outcome: '', status: '', tags: '', matter: '' });
const defaultMemberFilterOperators = (): MemberColumnFilterOperators => ({ identity: 'contains', touchpoint: 'contains', subscription: 'contains', rank: 'contains', relationship: 'contains', outcome: 'contains', status: 'contains', tags: 'contains', matter: 'contains' });
const MEMBER_FILTER_OPERATORS: Array<{ value: MemberFilterOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Not contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not equal to' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
];
const EMAIL_DEMO_ENQUIRY_ID = 'DEMO-ENQ-0003';
const MEMBER_RENDER_LIMIT = 140;
const RECOMMENDED_DRIP_SIZE = 200;
const PREVIEW_FRAME_MIN_HEIGHT: Record<PreviewDevice, number> = { desktop: 640, ipad: 660, mobile: 700 };
const PREVIEW_EMAIL_CSS = `<style data-helix-preview-css>
html,body{margin:0!important;width:100%!important;overflow:hidden!important;background:#fff!important;box-sizing:border-box!important;}
*,*:before,*:after{box-sizing:inherit!important;}
body{font-family:Raleway,Arial,Helvetica,sans-serif!important;font-size:10pt!important;line-height:1.4!important;color:rgb(0,0,0)!important;overflow-wrap:anywhere!important;}
table{border-collapse:collapse;max-width:100%!important;}
td,th{max-width:100%!important;overflow-wrap:anywhere!important;}
img{max-width:100%;height:auto;}
a{overflow-wrap:anywhere;}
</style>`;

const formatNumber = (value: number): string => Number(value || 0).toLocaleString('en-GB');
const normaliseCount = (value: number | undefined): number => Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
const listSizeForStream = (stream: AudienceStream): number => Math.max(normaliseCount(stream.listSize), normaliseCount(stream.total));
const membershipCountForStream = (stream: AudienceStream): number => normaliseCount(stream.membershipCount ?? stream.total);

const formatStamp = (value: string | null): string => {
  if (!value) return 'Not synced';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return 'Not synced';
  return new Date(parsed).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const formatCompactDateTime = (value: string | null): string => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '—';
  return new Date(parsed).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const formatHistoryToken = (value: string): string => value
  .split(/[_\s-]+/)
  .filter(Boolean)
  .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
  .join(' ');

const campaignHistoryEventAt = (item: MemberCampaignHistoryItem): string | null => item.sentAt || item.campaignSentAt || item.lockedAt || item.snapshotAt || item.createdAt;

const campaignHistoryStatusMeta = (item: MemberCampaignHistoryItem): { label: string; tone: 'sent' | 'pending' | 'failed' | 'held' } => {
  const sendStatus = item.sendStatus.toLowerCase();
  const selectionStatus = item.selectionStatus.toLowerCase();
  if (sendStatus === 'sent' || item.sentAt) return { label: 'Emailed', tone: 'sent' };
  if (sendStatus === 'failed') return { label: 'Failed', tone: 'failed' };
  if (sendStatus === 'skipped') return { label: 'Skipped', tone: 'held' };
  if (sendStatus === 'sending' || sendStatus === 'queued') return { label: formatHistoryToken(sendStatus), tone: 'pending' };
  if (selectionStatus === 'blocked') return { label: 'Held', tone: 'held' };
  if (sendStatus === 'not_sent') return { label: 'Selected', tone: 'pending' };
  return { label: formatHistoryToken(sendStatus || item.campaignStatus || 'Recorded'), tone: 'pending' };
};

const displayContactName = (member: AudienceMember): string => {
  const contactName = member.contactName?.trim();
  if (contactName) return contactName;
  return 'Name unavailable';
};

const displayContactId = (member: AudienceMember): string => member.acid?.trim() || member.sourceEnquiryId?.trim() || 'No ID';
const isClientRank = (rank: number | null): boolean => rank != null && rank < 4;
const relationshipLabel = (member: AudienceMember): string => isClientRank(member.rank) || member.client ? 'Client' : 'Prospect';
const relationshipReason = (member: AudienceMember): string => isClientRank(member.rank) ? 'Rank below 4' : member.clientStatus || 'Prospect';

const buildPreviewDocument = (html: string): string => {
  const source = html.trim() || '<!DOCTYPE html><html><head></head><body>Preview loading...</body></html>';
  if (source.includes('data-helix-preview-css')) return source;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${PREVIEW_EMAIL_CSS}</head>`);
  if (/<body\b[^>]*>/i.test(source)) return source.replace(/<body\b([^>]*)>/i, `<body$1>${PREVIEW_EMAIL_CSS}`);
  return `${PREVIEW_EMAIL_CSS}${source}`;
};

const getFinancialYearStartIso = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const fyYear = month >= 3 ? year : year - 1;
  return `${fyYear}-04-01`;
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
  const { showToast, updateToast } = useToast();
  const { isDarkMode: themeIsDarkMode } = useTheme();
  const logoIcon = themeIsDarkMode ? darkAvatarMark : lightAvatarMark;
  const [streams, setStreams] = useState<AudienceStream[]>([]);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [growthRows, setGrowthRows] = useState<Array<{ day: string; count: number; sendable: number; suppressed: number; held: number }>>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [selectedHistoryCampaignId, setSelectedHistoryCampaignId] = useState<string | null>(null);
  const [selectedStreamKey, setSelectedStreamKey] = useState<StreamKey | null>(null);
  const [streamsLoading, setStreamsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [composeSender, setComposeSender] = useState(SENDERS[0].value);
  const [composeSignature, setComposeSignature] = useState(SIGNATURES[0].value);
  const [composeSubject, setComposeSubject] = useState('');
  const [composePreheader, setComposePreheader] = useState('');
  const [composeBody, setComposeBody] = useState('Hello,\n\nWe are preparing a short update for this audience.\n\nKind regards,\nHelix Law');
  const [excludeClients, setExcludeClients] = useState(true);
  const [proofIncludeClients, setProofIncludeClients] = useState(false);
  const [showSendableCounts, setShowSendableCounts] = useState(true);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSort, setMemberSort] = useState<{ key: MemberSortKey; direction: MemberSortDirection }>({ key: 'touchpoint', direction: 'desc' });
  const [memberColumnFilters, setMemberColumnFilters] = useState<MemberColumnFilters>(() => emptyMemberColumnFilters());
  const [memberColumnFilterOperators, setMemberColumnFilterOperators] = useState<MemberColumnFilterOperators>(() => defaultMemberFilterOperators());
  const [proofExpanded, setProofExpanded] = useState(false);
  const [composerSplitPct, setComposerSplitPct] = useState(68);
  const [composerResizing, setComposerResizing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFrameHeights, setPreviewFrameHeights] = useState<Record<PreviewDevice, number>>(PREVIEW_FRAME_MIN_HEIGHT);
  const [copyPreviewDevice, setCopyPreviewDevice] = useState<Extract<PreviewDevice, 'desktop' | 'mobile'>>('desktop');
  const [campaignPromptHovered, setCampaignPromptHovered] = useState(false);
  const [recentlyChangedSetting, setRecentlyChangedSetting] = useState<string | null>(null);

  const [locking, setLocking] = useState(false);
  const [lockedCampaign, setLockedCampaign] = useState<EmailCampaign | null>(null);
  const [campaignComposerOpen, setCampaignComposerOpen] = useState(false);
  const [campaignStep, setCampaignStep] = useState<CampaignStep>('audience');
  const [testSending, setTestSending] = useState(false);
  const [batchWorking, setBatchWorking] = useState<'preview' | 'send' | null>(null);
  const [batchPreview, setBatchPreview] = useState<CampaignBatchPreview | null>(null);
  const [sendResult, setSendResult] = useState<SendResult>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [memberCampaignHistory, setMemberCampaignHistory] = useState<Record<string, MemberCampaignHistoryState>>({});
  const [qualityRunning, setQualityRunning] = useState(false);
  const [processingEvents, setProcessingEvents] = useState<ProcessingEvent[]>([]);
  const [sendGridBridge, setSendGridBridge] = useState<SendGridBridgeState>({ connectionStatus: 'idle', activityStatus: 'idle', message: 'SendGrid checks have not run in this session.' });
  const [growthAnimationTick, setGrowthAnimationTick] = useState(0);
  const lastGrowthSignatureRef = useRef('');
  const settingPulseTimerRef = useRef<number | null>(null);
  const sendResultTimerRef = useRef<number | null>(null);
  const memberHistoryAbortRef = useRef<Record<string, AbortController>>({});

  const text = isDarkMode ? colours.dark.text : colours.darkBlue;
  const muted = isDarkMode ? colours.subtleGrey : colours.greyText;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const edge = reportingPanelBorder(isDarkMode);
  const tone = colours.highlight;
  const surface = isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.9) : colours.light.cardBackground;
  const elevated = isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.98) : withAlpha(colours.sectionBackground, 0.92);
  const control = isDarkMode ? withAlpha(colours.dark.sectionBackground, 0.78) : withAlpha(colours.helixBlue, 0.05);
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

  const recordCampaignSettingChange = useCallback((settingKey: string, label: string, detail: string) => {
    setLockedCampaign(null);
    setBatchPreview(null);
    setSendResult({ status: 'saved', message: `${label} updated` });
    setRecentlyChangedSetting(settingKey);
    if (settingPulseTimerRef.current != null) window.clearTimeout(settingPulseTimerRef.current);
    if (sendResultTimerRef.current != null) window.clearTimeout(sendResultTimerRef.current);
    settingPulseTimerRef.current = window.setTimeout(() => setRecentlyChangedSetting(null), 900);
    sendResultTimerRef.current = window.setTimeout(() => setSendResult(null), 2400);
    showToast({
      id: `marketing-email-setting-${settingKey}`,
      type: 'success',
      title: 'Campaign setting updated',
      message: detail,
      duration: 2200,
    });
  }, [showToast]);

  useEffect(() => () => {
    if (settingPulseTimerRef.current != null) window.clearTimeout(settingPulseTimerRef.current);
    if (sendResultTimerRef.current != null) window.clearTimeout(sendResultTimerRef.current);
    Object.values(memberHistoryAbortRef.current).forEach((controller) => controller.abort());
    memberHistoryAbortRef.current = {};
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

  const loadMemberCampaignHistory = useCallback(async (member: AudienceMember, force = false) => {
    const existing = memberCampaignHistory[member.memberId];
    if (!force && (existing?.status === 'loading' || existing?.status === 'ready')) return;
    memberHistoryAbortRef.current[member.memberId]?.abort();
    const controller = new AbortController();
    memberHistoryAbortRef.current[member.memberId] = controller;
    setMemberCampaignHistory((current) => ({
      ...current,
      [member.memberId]: { status: 'loading', items: current[member.memberId]?.items || [] },
    }));
    try {
      const response = await fetch(apiPath(`/streams/${encodeURIComponent(member.streamKey)}/members/${encodeURIComponent(member.memberId)}/campaign-history`), { method: 'GET', credentials: 'include', signal: controller.signal });
      const payload = await response.json() as { ok?: boolean; error?: string; history?: MemberCampaignHistoryItem[]; generatedAt?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Campaign history failed (${response.status})`);
      setMemberCampaignHistory((current) => ({
        ...current,
        [member.memberId]: { status: 'ready', items: Array.isArray(payload.history) ? payload.history : [], generatedAt: payload.generatedAt },
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setMemberCampaignHistory((current) => ({
        ...current,
        [member.memberId]: { status: 'error', items: current[member.memberId]?.items || [], message: err instanceof Error ? err.message : 'Campaign history failed' },
      }));
    } finally {
      if (memberHistoryAbortRef.current[member.memberId] === controller) delete memberHistoryAbortRef.current[member.memberId];
    }
  }, [apiPath, memberCampaignHistory]);

  const toggleMemberCampaignTray = useCallback((member: AudienceMember) => {
    const shouldOpen = expandedMemberId !== member.memberId;
    setExpandedMemberId(shouldOpen ? member.memberId : null);
    if (shouldOpen) void loadMemberCampaignHistory(member);
  }, [expandedMemberId, loadMemberCampaignHistory]);

  useEffect(() => {
    setExpandedMemberId(null);
  }, [selectedStreamKey]);

  const loadGrowth = useCallback(async (streamKey: StreamKey, signal?: AbortSignal) => {
    setGrowthLoading(true);
    try {
      const response = await fetch(apiPath(`/streams/${encodeURIComponent(streamKey)}/growth`), { method: 'GET', credentials: 'include', signal });
      const payload = await response.json() as { ok?: boolean; growth?: Array<{ day: string; count: number; sendable?: number; suppressed?: number; held?: number }> };
      if (!response.ok || payload.ok === false) { setGrowthRows([]); return; }
      setGrowthRows(Array.isArray(payload.growth)
        ? payload.growth.map((row) => ({
          day: row.day,
          count: normaliseCount(row.count),
          sendable: normaliseCount(row.sendable),
          suppressed: normaliseCount(row.suppressed),
          held: normaliseCount(row.held),
        }))
        : []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setGrowthRows([]);
    } finally {
      if (!signal?.aborted) setGrowthLoading(false);
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
    void loadGrowth(selectedStreamKey, controller.signal);
    return () => controller.abort();
  }, [loadMembers, loadGrowth, selectedStreamKey]);

  useEffect(() => {
    if (!campaignComposerOpen) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setCampaignComposerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [campaignComposerOpen]);

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
      if (selectedStreamKey) { await loadMembers(selectedStreamKey); void loadGrowth(selectedStreamKey); }
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
  }, [addProcessingEvent, apiPath, demoModeEnabled, loadMembers, loadGrowth, selectedStreamKey]);

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
      await Promise.all([loadMembers(selectedStreamKey), loadStreams(), loadGrowth(selectedStreamKey)]);
      addProcessingEvent({ label: 'Validation completed', detail: `${formatNumber(payload.checkedCount ?? 0)} recipients checked`, status: 'complete' });
      setSendResult({ status: 'saved', message: `Quality checked ${formatNumber(payload.checkedCount ?? 0)} spine members` });
    } catch (err) {
      addProcessingEvent({ label: 'Validation failed', detail: err instanceof Error ? err.message : 'Quality check failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'Quality check failed' });
    } finally {
      setQualityRunning(false);
    }
  }, [addProcessingEvent, apiPath, demoModeEnabled, loadMembers, loadStreams, loadGrowth, selectedStreamKey]);

  const selectStream = useCallback((streamKey: StreamKey) => {
    setCampaignComposerOpen(false);
    setSelectedStreamKey(streamKey);
    setProofExpanded(true);
    setLockedCampaign(null);
    setBatchPreview(null);
    setSendResult(null);
    setComposeSubject((current) => current);
  }, []);

  const clearSelectedStream = useCallback(() => {
    setCampaignComposerOpen(false);
    setSelectedStreamKey(null);
    setProofExpanded(false);
    setMembers([]);
    setGrowthRows([]);
    setGrowthLoading(false);
    setLockedCampaign(null);
    setBatchPreview(null);
    setSendResult(null);
  }, []);

  const toggleSendableCounts = useCallback(() => {
    if (showSendableCounts) clearSelectedStream();
    setShowSendableCounts((current) => !current);
  }, [clearSelectedStream, showSendableCounts]);

  const openCampaignComposer = useCallback(() => {
    setLockedCampaign(null);
    setBatchPreview(null);
    setSendResult(null);
    setSelectedHistoryCampaignId(null);
    setCampaignStep('audience');
    setCampaignComposerOpen(true);
  }, []);

  const closeCampaignComposer = useCallback(() => {
    setCampaignComposerOpen(false);
  }, []);

  const goWizardBack = useCallback(() => {
    setCampaignStep((current) => {
      if (current === 'review') return 'copy';
      if (current === 'copy') return 'audience';
      setCampaignComposerOpen(false);
      return 'audience';
    });
  }, []);

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
      const payload = await response.json() as { ok?: boolean; error?: string; configured?: boolean; providerOk?: boolean; statusCode?: number | null; activityAvailable?: boolean; reason?: string; summary?: { sampleSize?: number; lastActivityAt?: string | null } };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `SendGrid activity check failed (${response.status})`);
      const available = Boolean(payload.configured && payload.providerOk && payload.activityAvailable);
      const sampleSize = payload.summary?.sampleSize ?? 0;
      const reasonMessage = payload.reason === 'activity_addon_required'
        ? 'SendGrid Email Activity is not enabled on this account (403). It needs the Email Activity Feed add-on plus an API key with the messages.read scope.'
        : payload.reason === 'unauthorised'
          ? 'SendGrid rejected the API key (401). Check the configured key.'
          : payload.reason === 'not_configured'
            ? 'No SendGrid API key is configured for activity reads.'
            : 'SendGrid activity summary is not available from this key or account.';
      setSendGridBridge((current) => ({
        ...current,
        activityStatus: available ? 'ready' : 'error',
        activityAvailable: available,
        statusCode: payload.statusCode ?? current.statusCode ?? null,
        sampleSize,
        lastActivityAt: payload.summary?.lastActivityAt ?? null,
        message: available ? 'SendGrid activity summary is available.' : reasonMessage,
      }));
      addProcessingEvent({ label: available ? 'SendGrid activity available' : 'SendGrid activity unavailable', detail: available ? `${formatNumber(sampleSize)} recent provider rows sampled` : reasonMessage, status: available ? 'complete' : 'error' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'SendGrid activity check failed';
      setSendGridBridge((current) => ({ ...current, activityStatus: 'error', message }));
      addProcessingEvent({ label: 'SendGrid activity failed', detail: message, status: 'error' });
    }
  }, [addProcessingEvent]);

  const selectedStream = useMemo(() => streams.find((stream) => stream.streamKey === selectedStreamKey) || null, [streams, selectedStreamKey]);
  const isLiveStream = selectedStream?.isSendable ?? true;
  const campaignPromptDimOpacity = campaignPromptHovered ? 0.92 : 0.48;

  const rankMinValue = excludeClients ? 4 : 0;
  const rankMaxValue = 4;

  const segmentMembers = useMemo(() => members.filter((member) => {
    if (!member.sendable) return false;
    if (excludeClients && member.client) return false;
    if (rankMinValue != null && (member.rank == null || member.rank < rankMinValue)) return false;
    if (rankMaxValue != null && (member.rank == null || member.rank > rankMaxValue)) return false;
    return true;
  }), [members, excludeClients, rankMinValue, rankMaxValue]);

  const updateMemberColumnFilter = useCallback((key: MemberSortKey, value: string) => {
    setMemberColumnFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const updateMemberColumnFilterOperator = useCallback((key: MemberSortKey, value: MemberFilterOperator) => {
    setMemberColumnFilterOperators((current) => ({ ...current, [key]: value }));
  }, []);

  const clearMemberColumnFilters = useCallback(() => {
    setMemberColumnFilters(emptyMemberColumnFilters());
    setMemberColumnFilterOperators(defaultMemberFilterOperators());
  }, []);

  const toggleMemberSort = useCallback((key: MemberSortKey) => {
    setMemberSort((current) => current.key === key
      ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: key === 'touchpoint' || key === 'subscription' ? 'desc' : 'asc' });
  }, []);

  const memberSortValue = useCallback((member: AudienceMember, key: MemberSortKey): string | number => {
    switch (key) {
      case 'identity': return displayContactName(member).toLowerCase();
      case 'touchpoint': return Date.parse(member.lastSeenAt || '') || 0;
      case 'subscription': return Date.parse(member.createdAt || '') || 0;
      case 'rank': return member.rank == null ? 99 : member.rank;
      case 'relationship': return relationshipLabel(member).toLowerCase();
      case 'outcome': return member.qualificationStatus || '';
      case 'status': return member.clientStatus || '';
      case 'tags': return member.tags.join(' ').toLowerCase();
      case 'matter': return member.matterId || '';
      default: return '';
    }
  }, []);

  const matchesMemberTextFilter = useCallback((source: string, filter: string, operator: MemberFilterOperator): boolean => {
    const value = source.toLowerCase();
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    if (operator === 'not_contains') return !value.includes(needle);
    if (operator === 'equals') return value === needle;
    if (operator === 'not_equals') return value !== needle;
    if (operator === 'starts_with') return value.startsWith(needle);
    if (operator === 'ends_with') return value.endsWith(needle);
    return value.includes(needle);
  }, []);

  const visibleMembers = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    const filtered = members
      .filter((member) => member.sendable)
      .filter((member) => proofIncludeClients || !isClientRank(member.rank) && !member.client)
      .filter((member) => {
        if (!query) return true;
        return [displayContactName(member), displayContactId(member), member.areaOfWork, member.qualificationStatus, member.clientStatus, member.tags.join(' '), member.matterId]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .filter((member) => {
        const filters = memberColumnFilters;
        const operators = memberColumnFilterOperators;
        if (!matchesMemberTextFilter(`${displayContactName(member)} ${displayContactId(member)}`, filters.identity, operators.identity)) return false;
        if (!matchesMemberTextFilter(formatCompactDateTime(member.lastSeenAt), filters.touchpoint, operators.touchpoint)) return false;
        if (!matchesMemberTextFilter(formatCompactDateTime(member.createdAt), filters.subscription, operators.subscription)) return false;
        if (filters.rank) {
          if (filters.rank === 'any' && member.rank != null) return false;
          if (filters.rank !== 'any' && String(member.rank ?? '') !== filters.rank) return false;
        }
        if (filters.relationship && relationshipLabel(member).toLowerCase() !== filters.relationship) return false;
        if (filters.outcome && member.qualificationStatus !== filters.outcome) return false;
        if (!matchesMemberTextFilter(String(member.clientStatus || ''), filters.status, operators.status)) return false;
        if (!matchesMemberTextFilter(member.tags.join(' '), filters.tags, operators.tags)) return false;
        if (!matchesMemberTextFilter(String(member.matterId || ''), filters.matter, operators.matter)) return false;
        return true;
      });

    return [...filtered].sort((left, right) => {
      const leftValue = memberSortValue(left, memberSort.key);
      const rightValue = memberSortValue(right, memberSort.key);
      const direction = memberSort.direction === 'asc' ? 1 : -1;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * direction;
      return String(leftValue).localeCompare(String(rightValue), 'en-GB', { numeric: true, sensitivity: 'base' }) * direction;
    });
  }, [matchesMemberTextFilter, memberColumnFilterOperators, memberColumnFilters, memberQuery, memberSort, memberSortValue, members, proofIncludeClients]);

  const memberColumnFiltersActive = useMemo(() => Object.values(memberColumnFilters).some((value) => value.trim()), [memberColumnFilters]);

  const weeklyGrowthBuckets = useMemo(() => {
    const byDay = new Map<string, { total: number; sendable: number; suppressed: number; held: number }>();
    growthRows.forEach((row) => {
      if (!row?.day || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) return;
      const existing = byDay.get(row.day) || { total: 0, sendable: 0, suppressed: 0, held: 0 };
      byDay.set(row.day, {
        total: existing.total + normaliseCount(row.count),
        sendable: existing.sendable + normaliseCount(row.sendable),
        suppressed: existing.suppressed + normaliseCount(row.suppressed),
        held: existing.held + normaliseCount(row.held),
      });
    });
    const startOfIsoWeek = (day: string): string => {
      const date = new Date(`${day}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return day;
      const weekday = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() - weekday + 1);
      return date.toISOString().slice(0, 10);
    };

    const byWeek = new Map<string, { total: number; sendable: number; suppressed: number; held: number }>();
    Array.from(byDay.entries()).forEach(([day, counts]) => {
      const weekStart = startOfIsoWeek(day);
      const existing = byWeek.get(weekStart) || { total: 0, sendable: 0, suppressed: 0, held: 0 };
      byWeek.set(weekStart, {
        total: existing.total + counts.total,
        sendable: existing.sendable + counts.sendable,
        suppressed: existing.suppressed + counts.suppressed,
        held: existing.held + counts.held,
      });
    });

    return Array.from(byWeek.entries())
      .map(([weekStart, counts]) => ({
        key: weekStart,
        count: counts.total,
        sendable: counts.sendable,
        suppressed: counts.suppressed,
        held: counts.held,
        label: new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        shortLabel: new Date(`${weekStart}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      }))
      .sort((left, right) => (left.key < right.key ? -1 : 1));
  }, [growthRows]);

  const financialYearStartIso = getFinancialYearStartIso();
  const todayIso = new Date().toISOString().slice(0, 10);
  const growthFytdBuckets = weeklyGrowthBuckets.filter((bucket) => bucket.key >= financialYearStartIso && bucket.key <= todayIso);
  const growthFirstLabel = growthFytdBuckets[0]?.label ?? null;
  const growthLatestLabel = growthFytdBuckets[growthFytdBuckets.length - 1]?.label ?? null;
  const growthFytdRangeLabel = `${new Date(`${financialYearStartIso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - ${new Date(`${todayIso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
  const growthVisible = growthFytdBuckets.slice(-16);
  const growthBarChart = useMemo(() => {
    const maxCount = growthVisible.reduce((peak, bucket) => Math.max(peak, bucket.count), 0) || 1;
    return growthVisible.map((bucket) => ({
      ...bucket,
      pct: Math.max(10, Math.round((bucket.count / maxCount) * 100)),
      sendableShare: bucket.count > 0 ? (bucket.sendable / bucket.count) * 100 : 0,
      suppressedShare: bucket.count > 0 ? (bucket.suppressed / bucket.count) * 100 : 0,
      heldShare: bucket.count > 0 ? (bucket.held / bucket.count) * 100 : 0,
    }));
  }, [growthVisible]);
  const growthDataSignature = useMemo(
    () => growthBarChart.map((bucket) => `${bucket.key}:${bucket.count}:${bucket.sendable}:${bucket.suppressed}:${bucket.held}`).join('|'),
    [growthBarChart],
  );

  const canTest = Boolean(operatorEmail.trim() && composeSubject.trim() && composeBody.trim());
  const canLock = Boolean(isLiveStream && composeSender && composeSignature && segmentMembers.length > 0 && !locking);
  const selectedSenderLabel = SENDERS.find((sender) => sender.value === composeSender)?.label || composeSender;
  const selectedSignatureLabel = SIGNATURES.find((signature) => signature.value === composeSignature)?.label || composeSignature;
  const campaignDraftReady = Boolean(composeSubject.trim() && composeBody.trim());
  const campaignProofState = canTest ? 'Ready' : operatorEmail.trim() ? 'Needs subject/body' : 'No user email';
  const campaignLockState = lockedCampaign ? 'Locked' : canLock ? 'Ready to lock' : 'Needs list';
  const composeSubjectLength = composeSubject.trim().length;
  const composePreheaderLength = composePreheader.trim().length;
  const composeBodyText = composeBody.trim();
  const composeBodyWordCount = composeBodyText ? composeBodyText.split(/\s+/).filter(Boolean).length : 0;
  const canManageSourceCounts = isDevOwner({ Initials: operatorInitials, Email: operatorEmail });
  const canPreviewBatch = Boolean(lockedCampaign?.campaignId && lockedCampaign.status === 'locked' && composeBody.trim() && composeSubject.trim());
  const canSendBatch = Boolean(canPreviewBatch && batchPreview?.bodyHashMatches && batchPreview.batchRecipientCount > 0 && !demoModeEnabled);
  const wizardStepIndex = WIZARD_STEPS.findIndex((step) => step.key === campaignStep);
  const totalListSize = streams.reduce((sum, stream) => sum + listSizeForStream(stream), 0);
  const totalLegacyCount = streams.reduce((sum, stream) => sum + normaliseCount(stream.legacyCount), 0);
  const totalNewSpaceCount = streams.reduce((sum, stream) => sum + normaliseCount(stream.newSpaceCount), 0);
  const totalMembershipCount = streams.reduce((sum, stream) => sum + membershipCountForStream(stream), 0);
  const totalSendableMembers = streams.reduce((sum, stream) => sum + normaliseCount(stream.sendable), 0);
  const dashboardBootLoading = streamsLoading && streams.length === 0;
  const selectedMembershipCount = selectedStream ? membershipCountForStream(selectedStream) : 0;
  const selectedSendableCount = normaliseCount(selectedStream?.sendable);
  const selectedSuppressedCount = normaliseCount(selectedStream?.blocked);
  const selectedHeldCount = Math.max(0, selectedMembershipCount - selectedSendableCount - selectedSuppressedCount);
  const selectedDripCount = Math.max(1, Math.ceil(segmentMembers.length / RECOMMENDED_DRIP_SIZE));
  const reviewRecipientCount = lockedCampaign?.selectedCount ?? segmentMembers.length;
  const reviewHeldCount = lockedCampaign?.blockedCount ?? selectedSuppressedCount + selectedHeldCount;
  const nextBatchCount = batchPreview?.batchRecipientCount ?? Math.min(RECOMMENDED_DRIP_SIZE, Math.max(0, batchPreview?.statusCounts.notSentCount ?? reviewRecipientCount));
  const campaignBatches = useMemo(() => {
    if (segmentMembers.length === 0) return [];
    return Array.from({ length: selectedDripCount }, (_, index) => {
      const start = (index * RECOMMENDED_DRIP_SIZE) + 1;
      const end = Math.min(segmentMembers.length, (index + 1) * RECOMMENDED_DRIP_SIZE);
      return { batch: index + 1, start, end, count: end - start + 1 };
    });
  }, [segmentMembers.length, selectedDripCount]);
  const historyCampaigns = useMemo(() => (
    selectedStreamKey ? campaigns.filter((campaign) => campaign.streamKey === selectedStreamKey) : campaigns
  ), [campaigns, selectedStreamKey]);
  const selectedHistoryCampaign = useMemo(() => {
    if (!selectedHistoryCampaignId) return null;
    return historyCampaigns.find((campaign) => campaign.campaignId === selectedHistoryCampaignId) || null;
  }, [historyCampaigns, selectedHistoryCampaignId]);
  const operationalProcessingEvents = useMemo(() => processingEvents.filter((event) => event.status !== 'selected'), [processingEvents]);
  const sendGridBridgeActive = sendGridBridge.connectionStatus !== 'idle' || sendGridBridge.activityStatus !== 'idle' || Boolean(lockedCampaign);
  const showOperationsStatus = Boolean(selectedStreamKey && (operationalProcessingEvents.length > 0 || sendGridBridgeActive));
  const previewSubject = composeSubject.trim() || 'Subject pending';
  const previewPreheader = composePreheader.trim() || 'Preheader preview';
  const renderedPreviewHtml = buildPreviewDocument(previewHtml);
  const isCampaignCreateMode = Boolean(campaignComposerOpen && selectedStream);

  useEffect(() => {
    if (!selectedStreamKey || !growthDataSignature) {
      lastGrowthSignatureRef.current = '';
      return;
    }
    if (lastGrowthSignatureRef.current !== growthDataSignature) {
      setGrowthAnimationTick((tick) => tick + 1);
      lastGrowthSignatureRef.current = growthDataSignature;
    }
  }, [selectedStreamKey, growthDataSignature]);

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
        <span>{device === 'ipad' ? 'iPad preview' : `${device} preview`}</span>
        <em>{selectedSignatureLabel}</em>
      </div>
      <div className="mew-device-message-head">
        <span className="mew-device-avatar" aria-hidden="true"><img src={logoIcon} alt="" /></span>
        <div className="mew-device-message-copy">
          <small>From {selectedSenderLabel}</small>
          <strong>{previewSubject}</strong>
          <span>{previewPreheader}</span>
        </div>
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
    addProcessingEvent({ label: 'Campaign lock started', detail: `${selectedStream?.label || selectedStreamKey} list snapshot is being created`, status: 'running' });
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
      setBatchPreview(null);
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

  const runSendGridBatch = useCallback(async (mode: 'preview' | 'send') => {
    if (!lockedCampaign?.campaignId) return;
    if (mode === 'send' && !canSendBatch) return;
    const expectedCount = batchPreview?.batchRecipientCount ?? 0;
    const toastId = showToast({
      id: 'marketing-email-sendgrid-batch',
      type: 'loading',
      title: mode === 'preview' ? 'Previewing SendGrid batch' : 'Sending SendGrid batch',
      message: mode === 'preview'
        ? `Resolving the next ${formatNumber(RECOMMENDED_DRIP_SIZE)} recipients from the locked snapshot.`
        : `Submitting one SendGrid API request for ${formatNumber(expectedCount)} recipients.`,
      persist: true,
    });

    setBatchWorking(mode);
    setSendResult(null);
    addProcessingEvent({
      label: mode === 'preview' ? 'SendGrid batch preview' : 'SendGrid batch send',
      detail: mode === 'preview' ? 'Resolving the next capped batch from the locked snapshot' : `Sending ${formatNumber(batchPreview?.batchRecipientCount ?? 0)} recipients through SendGrid`,
      status: 'running',
    });
    try {
      const response = await fetch(apiPath(`/campaigns/${encodeURIComponent(lockedCampaign.campaignId)}/sendgrid-batch`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: mode === 'preview',
          confirmSend: mode === 'send',
          expectedRecipientCount: mode === 'send' ? expectedCount : undefined,
          operatorConsent: mode === 'send' ? 'marketing-email-bulk-send' : undefined,
          limit: RECOMMENDED_DRIP_SIZE,
          body: composeBody,
          subject: composeSubject.trim(),
          signatureInitials: operatorInitials || '',
          signatureMode: composeSignature,
          operatorName: operatorName || operatorInitials || '',
          operatorEmail: operatorEmail.trim(),
          demoMode: demoModeEnabled,
        }),
      });
      const payload = await response.json() as {
        ok?: boolean;
        error?: string;
        campaign?: EmailCampaign;
        batchLimit?: number;
        batchRecipientCount?: number;
        skippedCount?: number;
        bodyHashMatches?: boolean;
        statusCounts?: CampaignBatchStatusCounts;
        sendGridMessageId?: string;
      };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `SendGrid batch failed (${response.status})`);
      if (payload.campaign) setLockedCampaign(payload.campaign);
      if (mode === 'preview') {
        const preview: CampaignBatchPreview = {
          batchLimit: payload.batchLimit ?? RECOMMENDED_DRIP_SIZE,
          batchRecipientCount: payload.batchRecipientCount ?? 0,
          skippedCount: payload.skippedCount ?? 0,
          bodyHashMatches: Boolean(payload.bodyHashMatches),
          statusCounts: payload.statusCounts ?? { selectedCount: 0, notSentCount: 0, sendingCount: 0, sentCount: 0, skippedCount: 0, failedCount: 0 },
        };
        setBatchPreview(preview);
        const remainingAfterBatch = Math.max(0, preview.statusCounts.notSentCount - preview.batchRecipientCount);
        addProcessingEvent({
          label: 'SendGrid batch preview ready',
          detail: `${formatNumber(preview.batchRecipientCount)} ready for one SendGrid request, ${formatNumber(remainingAfterBatch)} left after this batch`,
          status: preview.batchRecipientCount > 0 && preview.bodyHashMatches ? 'complete' : 'error',
        });
        updateToast(toastId, {
          type: preview.batchRecipientCount > 0 && preview.bodyHashMatches ? 'success' : 'warning',
          title: preview.bodyHashMatches ? 'Batch preview ready' : 'Campaign copy changed',
          message: preview.bodyHashMatches
            ? `${formatNumber(preview.batchRecipientCount)} recipients will be sent in one SendGrid API request. Hash checks stayed inside Hub.`
            : 'The current copy no longer matches the locked snapshot. Lock a fresh campaign before sending.',
          persist: false,
          duration: 6500,
        });
        setSendResult({ status: preview.batchRecipientCount > 0 && preview.bodyHashMatches ? 'ready' : 'error', message: preview.bodyHashMatches ? `Next batch has ${formatNumber(preview.batchRecipientCount)} recipients ready` : 'Campaign copy no longer matches the locked snapshot. Lock it again before sending.' });
      } else {
        setBatchPreview(null);
        addProcessingEvent({
          label: 'SendGrid batch accepted',
          detail: `${formatNumber(payload.batchRecipientCount ?? 0)} recipients accepted by SendGrid${payload.sendGridMessageId ? ` · ${payload.sendGridMessageId}` : ''}`,
          status: 'complete',
        });
        updateToast(toastId, {
          type: 'success',
          title: 'SendGrid accepted the batch',
          message: `${formatNumber(payload.batchRecipientCount ?? 0)} recipients submitted in one provider request. Preview the next batch when ready.`,
          persist: false,
          duration: 6500,
        });
        setSendResult({ status: 'ready', message: `SendGrid accepted ${formatNumber(payload.batchRecipientCount ?? 0)} recipients. Run preview again for the next batch.` });
        void loadCampaigns();
      }
    } catch (err) {
      updateToast(toastId, {
        type: 'error',
        title: mode === 'preview' ? 'Batch preview failed' : 'Batch send failed',
        message: err instanceof Error ? err.message : 'SendGrid batch failed',
        persist: false,
        duration: 7000,
      });
      addProcessingEvent({ label: mode === 'preview' ? 'Batch preview failed' : 'Batch send failed', detail: err instanceof Error ? err.message : 'SendGrid batch failed', status: 'error' });
      setSendResult({ status: 'error', message: err instanceof Error ? err.message : 'SendGrid batch failed' });
    } finally {
      setBatchWorking(null);
    }
  }, [addProcessingEvent, apiPath, batchPreview, canSendBatch, composeBody, composeSignature, composeSubject, demoModeEnabled, loadCampaigns, lockedCampaign, operatorEmail, operatorInitials, operatorName, showToast, updateToast]);

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

  const qualState = (member: AudienceMember): { label: string; tone: string } => {
    if (member.sendable) return { label: 'Sendable', tone: colours.green };
    const key = member.qualificationStatus.toLowerCase();
    if (key === 'inspect') return { label: 'Inspect', tone: colours.highlight };
    if (key.includes('email')) return { label: 'No email', tone: colours.orange };
    if (key.includes('missing')) return { label: 'No ACID', tone: colours.orange };
    return { label: 'Held', tone: colours.red };
  };

  const processingTone = (status: ProcessingEvent['status']): string => {
    if (status === 'complete') return colours.green;
    if (status === 'error') return colours.red;
    if (status === 'selected') return colours.accent;
    if (status === 'running') return colours.highlight;
    return muted;
  };
  return (
    <section className={`mew-root${selectedStreamKey ? ' mew-root--selected' : ''}`} data-helix-region="marketing/email-operations" style={rootVars}>
      <style>{mewStyles}</style>

      <section className="mew-hero" data-helix-region="marketing/email-operations/governor">
        <header className="mew-header">
          <div className="mew-header-lead">
            <strong>Email workbench</strong>
            {demoModeEnabled && <small>Demo lane</small>}
          </div>
          {canManageSourceCounts && (
            <div className="mew-header-side">
              <button type="button" className="mew-btn mew-btn--refresh" onClick={() => refreshAudience(false)} disabled={refreshing || streamsLoading} title={refreshing ? 'Checking source impact' : 'Check source impact'}>
                <FiRefreshCw className={refreshing ? 'is-spinning' : ''} size={12} aria-hidden="true" />
                <span>{refreshing ? 'Checking' : 'Check source'}</span>
              </button>
            </div>
          )}
        </header>

        <section className="mew-readiness" data-helix-region="marketing/email-operations/readiness" aria-label="Email list summary">
          {dashboardBootLoading ? (
            <>
              <article className="mew-total-card mew-total-card--loading" aria-hidden="true">
                <span className="mew-skeleton-line mew-skeleton-line--label" />
                <span className="mew-skeleton-line mew-skeleton-line--hero" />
                <div className="mew-total-children mew-total-children--loading">
                  <span><i className="mew-skeleton-line mew-skeleton-line--label" /><i className="mew-skeleton-line mew-skeleton-line--chip" /></span>
                  <span><i className="mew-skeleton-line mew-skeleton-line--label" /><i className="mew-skeleton-line mew-skeleton-line--chip" /></span>
                </div>
              </article>
              <span className="mew-readiness-card mew-readiness-card--loading" aria-hidden="true">
                <span className="mew-skeleton-line mew-skeleton-line--label" />
                <span className="mew-skeleton-line mew-skeleton-line--hero" />
              </span>
              <span className="mew-readiness-card mew-readiness-card--loading" aria-hidden="true">
                <span className="mew-skeleton-line mew-skeleton-line--label" />
                <span className="mew-skeleton-line mew-skeleton-line--hero" />
                <span className="mew-skeleton-line mew-skeleton-line--pill" />
              </span>
            </>
          ) : (
            <>
              <article className="mew-total-card" aria-label="Total number of contacts">
                <small>Total Number of Contacts</small>
                <strong>{formatNumber(totalListSize)}</strong>
                <div className="mew-total-children">
                  <span><em>Legacy</em><b>{formatNumber(totalLegacyCount)}</b></span>
                  <span><em>New</em><b>{formatNumber(totalNewSpaceCount)}</b></span>
                </div>
              </article>
              <span className="mew-readiness-card">
                <small>Memberships</small>
                <strong>{formatNumber(totalMembershipCount)}</strong>
              </span>
              <button
                type="button"
                className={`mew-readiness-card mew-readiness-card--button${showSendableCounts ? ' is-active' : ''}`}
                aria-pressed={showSendableCounts}
                aria-label={showSendableCounts ? 'Sendable filter on' : 'Sendable filter off'}
                title={showSendableCounts ? 'Area cards are showing sendable counts' : 'Area cards are showing full list sizes'}
                onClick={toggleSendableCounts}
              >
                <small>Sendable</small>
                <strong>{formatNumber(totalSendableMembers)}</strong>
                <em>{showSendableCounts ? 'On' : 'Off'}</em>
                {showSendableCounts && (
                  <span className="mew-sendable-note">
                    Initial test cap: new-space contacts from 1 Apr onwards, filtered by tags and memberships.
                  </span>
                )}
              </button>
            </>
          )}
        </section>

        <div className={`mew-streams-wrap${selectedStream ? ' is-closed' : ' is-open'}`} aria-hidden={Boolean(selectedStream)}>
          <div className="mew-streams" data-helix-region="marketing/email-operations/streams" role="tablist" aria-label="Audience lists">
            {dashboardBootLoading ? Array.from({ length: 5 }).map((_, index) => (
              <div key={`stream-skeleton-${index}`} className="mew-stream mew-stream--skeleton" style={{ '--stream-index': index } as React.CSSProperties} aria-hidden="true">
                <span className="mew-stream-glyph"><i className="mew-stream-skeleton-glyph" /></span>
                <span className="mew-stream-info">
                  <i className="mew-skeleton-line mew-skeleton-line--stream-title" />
                  <i className="mew-skeleton-line mew-skeleton-line--stream-sub" />
                </span>
                <span className="mew-stream-tally">
                  <i className="mew-skeleton-line mew-skeleton-line--stream-count" />
                  <i className="mew-skeleton-line mew-skeleton-line--stream-sub" />
                </span>
              </div>
            )) : streams.map((stream, index) => {
              const meta = getAreaGlyphMeta(STREAM_GLYPHS[stream.streamKey]);
              const isSelected = stream.streamKey === selectedStreamKey;
              const streamListSize = listSizeForStream(stream);
              const streamSendableCount = normaliseCount(stream.sendable);
              const streamDisplayCount = showSendableCounts ? streamSendableCount : streamListSize;
              const selectionLocked = !showSendableCounts;
              return (
                <button
                  key={stream.streamKey}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-disabled={selectionLocked}
                  disabled={selectionLocked}
                  title={selectionLocked ? 'Switch Sendable on to select this list for email planning' : `Select ${stream.label} for campaign planning`}
                  style={{ '--stream-accent': meta.color, '--stream-index': index } as React.CSSProperties}
                  className={`mew-stream${isSelected ? ' is-selected' : ''}${stream.isSendable ? '' : ' is-inspect'}${selectionLocked ? ' is-locked' : ''}`}
                  onClick={() => selectStream(stream.streamKey)}
                >
                  <span className="mew-stream-glyph">{renderAreaOfWorkGlyph(STREAM_GLYPHS[stream.streamKey], meta.color, 'glyph', 22)}</span>
                  <span className="mew-stream-info">
                    <strong>{stream.label}</strong>
                    <small>{selectionLocked ? 'Comparison only' : 'Select for campaign'}</small>
                  </span>
                  <span className="mew-stream-tally">
                    <strong style={{ color: showSendableCounts && stream.isSendable ? 'var(--stream-accent)' : 'var(--mew-muted)' }}>
                      {formatNumber(streamDisplayCount)}
                    </strong>
                    <small>{showSendableCounts ? 'sendable' : 'full list'}</small>
                  </span>
                  {selectionLocked ? (
                    <span className="mew-stream-lock" aria-hidden="true"><FiLock size={10} /> Locked</span>
                  ) : (
                    <span className="mew-stream-arrow" aria-hidden="true">&#8250;</span>
                  )}
                </button>
              );
            })}
            {!dashboardBootLoading && streams.length === 0 && (
              <div className="mew-empty">{streamsLoading ? 'Loading lists...' : 'No lists found.'}</div>
            )}
          </div>
        </div>

        {selectedStream && (() => {
          const meta = getAreaGlyphMeta(STREAM_GLYPHS[selectedStream.streamKey]);
          return (
            <section className="mew-area-focus" data-helix-region="marketing/email-operations/selected-area" style={{ '--stream-accent': meta.color } as React.CSSProperties} aria-label={`${selectedStream.label} list breakdown`}>
              <div className="mew-area-focus-head">
                <span className="mew-area-focus-glyph">{renderAreaOfWorkGlyph(STREAM_GLYPHS[selectedStream.streamKey], meta.color, 'glyph', 28)}</span>
                <div className="mew-area-focus-title">
                  <strong>{selectedStream.label}</strong>
                </div>
                {selectedStream.streamKey !== 'commercial' && (
                  <div className="mew-area-focus-actions">
                    <button type="button" className={`mew-mini-action${proofExpanded ? ' is-active' : ''}`} onClick={() => setProofExpanded((prev) => !prev)} aria-expanded={proofExpanded} aria-pressed={proofExpanded}>
                      {proofExpanded ? 'Hide records' : 'Show records'}
                    </button>
                    <button type="button" className="mew-mini-action" onClick={clearSelectedStream}>Change area</button>
                  </div>
                )}
              </div>
              <div className="mew-area-focus-body mew-area-focus-body--sendable">
                <article className="mew-area-focus-total">
                  <div className="mew-area-focus-total-head">
                    <small>Sendable</small>
                    {!growthLoading && <span className="mew-area-focus-range">Trend window {growthFytdRangeLabel}</span>}
                  </div>
                  <div className="mew-area-focus-total-primary">
                    <strong>{formatNumber(selectedSendableCount)}</strong>
                  </div>
                  {!growthLoading && growthBarChart.length > 0 && (
                    <div className="mew-area-focus-mix" aria-label="Current selected audience status split">
                      <span aria-label={`Sendable ${formatNumber(selectedSendableCount)}`} title="Current sendable recipients in this selected area">
                        <FiCheckCircle size={13} aria-hidden="true" />
                        <b>{formatNumber(selectedSendableCount)}</b>
                      </span>
                      <span aria-label={`Suppressed ${formatNumber(selectedSuppressedCount)}`} title="Current suppressed or blocked recipients in this selected area">
                        <FiSlash size={13} aria-hidden="true" />
                        <b>{formatNumber(selectedSuppressedCount)}</b>
                      </span>
                      <span aria-label={`Held ${formatNumber(selectedHeldCount)}`} title="Current held recipients in this selected area">
                        <FiPauseCircle size={13} aria-hidden="true" />
                        <b>{formatNumber(selectedHeldCount)}</b>
                      </span>
                    </div>
                  )}
                  {growthLoading ? (
                    <div className="mew-area-focus-total-loading" aria-hidden="true">
                      <span className="mew-skeleton-line mew-skeleton-line--body" />
                      <span className="mew-skeleton-line mew-skeleton-line--meta" />
                      <span className="mew-skeleton-line mew-skeleton-line--meta" />
                    </div>
                  ) : growthBarChart.length === 0 ? (
                    <em>Trend metrics appear once weekly enquiry data lands.</em>
                  ) : null}
                </article>
                <div className="mew-area-growth" data-helix-region="marketing/email-operations/selected-area-growth" aria-label="Selected area enquiry weekly trend">
                  {growthLoading ? (
                    <div className="mew-growth-skeleton" aria-hidden="true">
                      {Array.from({ length: 10 }).map((_, index) => (
                        <span key={`growth-skeleton-${index}`} className="mew-growth-skeleton-col" style={{ '--skel-index': index, '--skel-height': `${28 + ((index * 11) % 52)}%` } as React.CSSProperties}>
                          <b className="mew-skeleton-line mew-skeleton-line--count" />
                          <i className="mew-skeleton-block" />
                          <em className="mew-skeleton-line mew-skeleton-line--date" />
                        </span>
                      ))}
                    </div>
                  ) : growthBarChart.length > 0 ? (
                    <div key={`${selectedStream.streamKey}-${growthAnimationTick}`} className="mew-growth-bars" role="img" aria-label={`Enquiries per week from ${growthFirstLabel} to ${growthLatestLabel}`}>
                      {growthBarChart.map((bucket, index) => (
                        <span key={bucket.key} className="mew-growth-bar" style={{ '--bar-index': index } as React.CSSProperties} title={`${bucket.label}: +${formatNumber(bucket.count)} enquiries (${formatNumber(bucket.sendable)} sendable, ${formatNumber(bucket.suppressed)} suppressed, ${formatNumber(bucket.held)} held)`}>
                          <b>+{formatNumber(bucket.count)}</b>
                          <span className="mew-growth-stack" style={{ height: `${bucket.pct}%` }}>
                            <i className="mew-growth-segment mew-growth-segment--sendable" style={{ height: `${bucket.sendableShare}%` }} />
                            <i className="mew-growth-segment mew-growth-segment--held" style={{ height: `${bucket.heldShare}%` }} />
                            <i className="mew-growth-segment mew-growth-segment--suppressed" style={{ height: `${bucket.suppressedShare}%` }} />
                          </span>
                          <em>{bucket.shortLabel}</em>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mew-proof-growth-empty">Weekly enquiry counts appear here once source enquiry dates are available.</div>
                  )}
                </div>
              </div>
            </section>
          );
        })()}
      </section>

      {error && <div className="mew-banner mew-banner--error" role="alert">{error}</div>}
      {sendResult && <div className={`mew-banner mew-banner--${sendResult.status === 'error' ? 'error' : 'ok'}`} role="status">{sendResult.message}</div>}

      {selectedStreamKey && proofExpanded && (
      <section className="mew-cockpit" data-helix-region="marketing/email-operations/cockpit">
        <main className="mew-cockpit-main">

      {selectedStreamKey && proofExpanded && (
      <section className={`mew-panel mew-proof${proofExpanded ? ' is-expanded' : ''}`} data-helix-region="marketing/email-operations/proof">
          <>
            {selectedMembershipCount === 0 && !streamsLoading ? (
              <div className="mew-proof-empty" role="status" data-helix-region="marketing/email-operations/empty">
                <strong>Audience spine is empty.</strong>
                <span>{canManageSourceCounts ? <>Run <em>Check source</em> first, then materialise new-space rows into the membership spine when the list is ready for proofing.</> : 'Membership rows have not been materialised for this list yet.'}</span>
                {canManageSourceCounts && (
                  <button type="button" className="mew-btn mew-btn--primary" onClick={() => refreshAudience(false)} disabled={refreshing}>
                    {refreshing ? 'Checking' : 'Check source'}
                  </button>
                )}
              </div>
            ) : (
            <div className="mew-table-wrap mew-table-wrap--compact">
              <table className="mew-table mew-table--compact">
                <thead>
                  <tr>
                    {MEMBER_TABLE_COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className={memberSort.key === column.key ? `is-sorted is-sorted-${memberSort.direction}` : ''}
                        style={{ paddingTop: 7, paddingBottom: 7 }}
                        aria-sort={memberSort.key === column.key ? (memberSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleMemberSort(column.key)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            toggleMemberSort(column.key);
                          }
                        }}
                      >
                        <span className="mew-table-sort">
                          <span>{column.label}</span>
                        </span>
                      </th>
                    ))}
                  </tr>
                  <tr className="mew-table-filter-row">
                    {MEMBER_TABLE_COLUMNS.map((column) => (
                      <th key={`${column.key}-filter`} style={{ paddingTop: 3, paddingBottom: 4 }}>
                        {column.filter === 'select' ? (
                          <select className="mew-table-filter" value={memberColumnFilters[column.key]} onChange={(event) => updateMemberColumnFilter(column.key, event.currentTarget.value)} aria-label={`Filter ${column.label}`}>
                            {(column.options || []).map((option) => <option key={`${column.key}-${option.value}`} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : (
                          <span className="mew-table-filter-combo">
                            <select className="mew-table-filter mew-table-filter--operator" value={memberColumnFilterOperators[column.key]} onChange={(event) => updateMemberColumnFilterOperator(column.key, event.currentTarget.value as MemberFilterOperator)} aria-label={`${column.label} filter operator`}>
                              {MEMBER_FILTER_OPERATORS.map((option) => <option key={`${column.key}-${option.value}`} value={option.value}>{option.label}</option>)}
                            </select>
                            <input className="mew-table-filter" value={memberColumnFilters[column.key]} onChange={(event) => updateMemberColumnFilter(column.key, event.currentTarget.value)} placeholder="Value" aria-label={`Filter ${column.label}`} />
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.slice(0, 60).map((member) => {
                    const qual = qualState(member);
                    const areaColor = resolveStreamAccentColor(member.streamKey);
                    const isHistoryExpanded = expandedMemberId === member.memberId;
                    const historyState = memberCampaignHistory[member.memberId] || { status: 'idle', items: [] };
                    const historyItems = historyState.items;
                    const emailedHistoryCount = historyItems.filter((item) => campaignHistoryStatusMeta(item).tone === 'sent').length;
                    const historyPanelId = `mew-member-history-${member.memberId}`;
                    return (
                    <React.Fragment key={member.memberId}>
                    <tr className={`mew-ledger-row${isHistoryExpanded ? ' is-expanded' : ''}`}>
                      <td className="mew-ledger-accent" style={{ paddingTop: 4, paddingBottom: 4, fontSize: 10, boxShadow: `inset 3px 0 0 ${areaColor}` }}>
                        <div className="mew-ledger-identity">
                          <button
                            type="button"
                            className={`mew-ledger-expand${isHistoryExpanded ? ' is-open' : ''}`}
                            onClick={() => toggleMemberCampaignTray(member)}
                            aria-expanded={isHistoryExpanded}
                            aria-controls={historyPanelId}
                            title={isHistoryExpanded ? 'Collapse campaign history' : 'Expand campaign history'}
                          >
                            <FiChevronRight size={12} aria-hidden="true" />
                          </button>
                          <div className="mew-id" style={{ gap: 1 }}>
                            <span className="mew-ledger-name">{displayContactName(member)}</span>
                            <small>{displayContactId(member)}</small>
                          </div>
                        </div>
                      </td>
                      <td className="mew-ledger-touchpoint-cell" style={{ paddingTop: 4, paddingBottom: 4, fontSize: 9 }}>
                        <div className="mew-ledger-touchpoint" title={member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleString('en-GB') : 'No recent touchpoint'}>
                          <span className="mew-ledger-touchpoint-line">
                            <strong>Enquiry</strong>
                            <span>{formatCompactDateTime(member.lastSeenAt)}</span>
                          </span>
                        </div>
                      </td>
                      <td className="mew-ledger-subscription-cell" style={{ paddingTop: 4, paddingBottom: 4, fontSize: 9 }}>
                        <span className="mew-ledger-subscription-date" title={member.createdAt ? new Date(member.createdAt).toLocaleString('en-GB') : 'No subscription date'}>
                          {formatCompactDateTime(member.createdAt)}
                        </span>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 10 }}>
                        <select className="mew-ledger-select mew-ledger-select--rank" value={member.rank == null ? '' : String(member.rank)} disabled={savingMemberId === member.memberId} onChange={(event) => void patchMember(member, { rank: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })}>
                          <option value="">none</option>
                          {RANK_OPTIONS.filter((option) => option !== 'any').map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 10 }}>
                        <span className={`mew-state-chip ${isClientRank(member.rank) || member.client ? 'is-client' : 'is-prospect'}`} title={relationshipReason(member)}>
                          {relationshipLabel(member)}
                        </span>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 10 }}>
                        <span className="mew-state-chip mew-state-chip--outcome" title={member.qualificationReason || qual.label} style={{ '--chip-tone': qual.tone } as React.CSSProperties}>
                          {qual.label}
                        </span>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 9 }}>
                        <span className="mew-ledger-status" title={member.clientStatus || member.qualificationStatus || '—'}>
                          {member.clientStatus || member.qualificationStatus || '—'}
                        </span>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 9 }}>
                        <div className="mew-tags">
                          {member.tags?.length ? member.tags.slice(0, 3).map((tag) => <span key={`${member.memberId}-${tag}`} className="mew-tag">{tag}</span>) : <span className="mew-tag mew-tag--muted">—</span>}
                        </div>
                      </td>
                      <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 9 }}>
                        <span className="mew-ledger-matter" title={member.matterId || 'No matter'}>
                          {member.matterId ? member.matterId : '—'}
                        </span>
                      </td>
                    </tr>
                    {isHistoryExpanded && (
                      <tr className="mew-ledger-tray-row">
                        <td colSpan={MEMBER_TABLE_COLUMNS.length}>
                          <div id={historyPanelId} className="mew-ledger-history-tray" data-helix-region={`marketing/email-operations/proof/member-history/${member.memberId}`}>
                            <div className="mew-ledger-history-head">
                              <div>
                                <span>Past communications</span>
                                <strong>{historyState.status === 'ready' ? `${formatNumber(emailedHistoryCount)} emailed / ${formatNumber(historyItems.length)} records` : displayContactId(member)}</strong>
                              </div>
                              <button type="button" className="mew-ledger-history-refresh" onClick={() => void loadMemberCampaignHistory(member, true)} disabled={historyState.status === 'loading'}>
                                <FiRefreshCw size={11} aria-hidden="true" />
                                Refresh
                              </button>
                            </div>
                            <div className="mew-ledger-history-body" aria-live="polite">
                              {historyState.status === 'loading' ? (
                                <div className="mew-ledger-history-loading">
                                  <span />
                                  <span />
                                  <span />
                                </div>
                              ) : historyState.status === 'error' ? (
                                <div className="mew-ledger-history-empty is-error">
                                  <strong>History unavailable</strong>
                                  <span>{historyState.message || 'Campaign history could not be loaded.'}</span>
                                </div>
                              ) : historyItems.length === 0 ? (
                                <div className="mew-ledger-history-empty">
                                  <strong>No campaign emails recorded yet</strong>
                                  <span>This recipient has not appeared in a locked campaign snapshot.</span>
                                </div>
                              ) : (
                                <div className="mew-ledger-history-list">
                                  {historyItems.map((item) => {
                                    const statusMeta = campaignHistoryStatusMeta(item);
                                    const eventAt = campaignHistoryEventAt(item);
                                    const providerLabel = item.providerStatus ? formatHistoryToken(item.providerStatus) : statusMeta.label;
                                    return (
                                      <article key={item.recipientId} className={`mew-ledger-history-item is-${statusMeta.tone}`}>
                                        <span className="mew-ledger-history-dot" aria-hidden="true" />
                                        <div className="mew-ledger-history-card">
                                          <header>
                                            <span><FiMail size={11} aria-hidden="true" /> Campaign email</span>
                                            {eventAt && <time dateTime={eventAt}>{formatStamp(eventAt)}</time>}
                                          </header>
                                          <strong title={item.campaignName || item.campaignKey}>{item.campaignName || item.campaignKey || 'Untitled campaign'}</strong>
                                          <p title={item.subject || 'No subject'}>{item.subject || 'No subject'}</p>
                                          <footer>
                                            <span className={`mew-ledger-history-state is-${statusMeta.tone}`}>{statusMeta.label}</span>
                                            <span>{providerLabel}</span>
                                            {item.senderEmail && <span>{item.senderEmail}</span>}
                                          </footer>
                                        </div>
                                      </article>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                    );
                  })}
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
      </section>
      )}

        </main>
      </section>
      )}

      {!isCampaignCreateMode && (
      <section className="mew-panel mew-history" data-helix-region="marketing/email-operations/history">
        <div className="mew-panel-head mew-history-head">
          <div className="mew-history-head-main">
            <span className="mew-eyebrow">Marketing results</span>
            <strong>{historyCampaigns.length > 0 ? `${formatNumber(historyCampaigns.length)} ${selectedStream ? `${selectedStream.label} campaign${historyCampaigns.length === 1 ? '' : 's'}` : 'recent'}` : selectedStream ? `No ${selectedStream.label} campaigns yet` : 'No campaigns yet'}</strong>
          </div>
          <div className="mew-history-head-detail">
            <span className="mew-eyebrow">Campaign recap</span>
          </div>
        </div>
        <div className={`mew-history-grid${isCampaignCreateMode ? ' is-composing' : ''}`}>
          {!isCampaignCreateMode && (
          <div className="mew-campaign-stack mew-history-lane mew-history-lane--stack" role="list" aria-label="Recent campaigns">
            {historyCampaigns.length === 0 && (
              <div className="mew-campaign-stack-empty">
                <span>{selectedStream ? `No ${selectedStream.label} campaign records yet.` : 'No campaign records yet.'}</span>
              </div>
            )}
            {historyCampaigns.length > 0 && (
              <div className="mew-campaign-ledger-head" aria-hidden="true">
                <span>Campaign</span>
                <span>Selected</span>
                <span>Sent</span>
                <span>Status</span>
              </div>
            )}
            {historyCampaigns.slice(0, 12).map((campaign) => {
              const isActive = campaign.campaignId === selectedHistoryCampaign?.campaignId;
              const streamLabel = STREAM_OPTIONS.find((stream) => stream.streamKey === campaign.streamKey)?.label || campaign.streamKey;
              const campaignTone = campaign.status === 'sent' ? colours.green : campaign.status === 'locked' ? colours.helixBlue : muted;
              const streamAccent = resolveStreamAccentColor(campaign.streamKey);
              return (
                <button
                  key={campaign.campaignId}
                  type="button"
                  className={`mew-campaign-card${isActive ? ' is-active' : ''}`}
                  onClick={() => {
                    setSelectedHistoryCampaignId((current) => (
                      current === campaign.campaignId ? null : campaign.campaignId
                    ));
                  }}
                  aria-pressed={isActive}
                  style={{ '--campaign-accent': streamAccent } as React.CSSProperties}
                >
                  <span className="mew-campaign-ledger-glyph" aria-hidden="true">
                    <span className="mew-campaign-ledger-glyph-icon">
                      {renderAreaOfWorkGlyph(STREAM_GLYPHS[campaign.streamKey], streamAccent, 'glyph', 14)}
                    </span>
                  </span>
                  <span className="mew-campaign-card-main">
                    <span className="mew-campaign-card-context">
                      <em>{streamLabel}</em>
                    </span>
                    <strong>{campaign.campaignName}</strong>
                  </span>
                  <span className="mew-campaign-ledger-metric"><strong>{campaign.selectedCount == null ? '-' : formatNumber(campaign.selectedCount)}</strong></span>
                  <span className="mew-campaign-ledger-metric"><strong>{campaign.sentCount == null ? '-' : formatNumber(campaign.sentCount)}</strong></span>
                  <span className="mew-campaign-card-meta"><em style={{ color: campaignTone }}>{campaign.status}</em></span>
                </button>
              );
            })}
          </div>
          )}
          {isCampaignCreateMode && (
            <div className="mew-campaign-create-stage" role="status" aria-live="polite">
              <span className="mew-eyebrow">Create mode</span>
              <strong>{selectedStream?.label} composer active</strong>
              <small>The campaign stack is hidden while you draft and review this campaign.</small>
              <button type="button" className="mew-mini-action" onClick={closeCampaignComposer}>Back to campaigns</button>
            </div>
          )}
          <aside className={`mew-campaign-detail mew-history-lane mew-history-lane--detail${selectedHistoryCampaign ? '' : ' mew-campaign-detail--empty'}`} aria-label={selectedHistoryCampaign ? 'Selected campaign details' : 'New campaign slot details'}>
            {selectedHistoryCampaign && !isCampaignCreateMode ? (() => {
              const streamAccent = resolveStreamAccentColor(selectedHistoryCampaign.streamKey);
              const statusTone = selectedHistoryCampaign.status === 'sent' ? colours.green : selectedHistoryCampaign.status === 'locked' ? colours.helixBlue : muted;
              const lifecycleSteps = [
                {
                  key: 'created',
                  label: 'Created',
                  value: formatStamp(selectedHistoryCampaign.createdAt),
                  meta: selectedHistoryCampaign.createdBy || 'Unknown',
                  icon: FiCheckCircle,
                  complete: true,
                },
                {
                  key: 'locked',
                  label: 'Locked',
                  value: formatStamp(selectedHistoryCampaign.lockedAt),
                  meta: selectedHistoryCampaign.lockedBy || 'Not locked',
                  icon: selectedHistoryCampaign.lockedAt ? FiLock : FiPauseCircle,
                  complete: Boolean(selectedHistoryCampaign.lockedAt),
                },
                {
                  key: 'sent',
                  label: 'Sent',
                  value: formatStamp(selectedHistoryCampaign.sentAt),
                  meta: selectedHistoryCampaign.sentBy || 'Not sent',
                  icon: selectedHistoryCampaign.sentAt ? FiCheckCircle : FiPauseCircle,
                  complete: Boolean(selectedHistoryCampaign.sentAt),
                },
              ];
              return (
                <div className="mew-campaign-recap">
                  <div className="mew-recap-hero" style={{ '--campaign-accent': streamAccent } as React.CSSProperties}>
                    <span className="mew-recap-glyph" aria-label="Area of work">
                      <span className="mew-recap-glyph-icon">
                        {renderAreaOfWorkGlyph(STREAM_GLYPHS[selectedHistoryCampaign.streamKey], streamAccent, 'glyph', 16)}
                      </span>
                    </span>
                    <div className="mew-recap-title">
                      <small>Campaign Title</small>
                      <strong>{selectedHistoryCampaign.campaignName}</strong>
                    </div>
                  </div>
                  <div className="mew-recap-sender" aria-label="Campaign sender mailbox">
                    <span className="mew-recap-sender-avatar" aria-hidden="true">
                      <span className="mew-recap-sender-logo">
                        <img src={logoIcon} alt="Helix logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </span>
                    </span>
                    <div className="mew-recap-sender-body">
                      <small>From Sender</small>
                      <strong>{selectedHistoryCampaign.senderEmail || '-'}</strong>
                    </div>
                  </div>
                  <div className="mew-recap-counts">
                    <span><strong>{selectedHistoryCampaign.selectedCount == null ? '-' : formatNumber(selectedHistoryCampaign.selectedCount)}</strong><small>Selected</small></span>
                    <span><strong>{selectedHistoryCampaign.blockedCount == null ? '-' : formatNumber(selectedHistoryCampaign.blockedCount)}</strong><small>Held</small></span>
                    <span><strong>{selectedHistoryCampaign.sentCount == null ? '-' : formatNumber(selectedHistoryCampaign.sentCount)}</strong><small>Sent</small></span>
                  </div>
                  <div className="mew-recap-timeline" aria-label="Campaign lifecycle">
                    {lifecycleSteps.map((step, index) => {
                      const Icon = step.icon;
                      const isCurrent = !step.complete && index === 1 && !selectedHistoryCampaign.lockedAt && !selectedHistoryCampaign.sentAt;
                      return (
                        <div key={step.key} className={`mew-recap-timeline-step${step.complete ? ' is-complete' : ''}${isCurrent ? ' is-current' : ''}`}>
                          <span className="mew-recap-timeline-icon" aria-hidden="true">
                            <Icon size={10} />
                          </span>
                          <span className="mew-recap-timeline-copy">
                            <small>{step.label}</small>
                            <strong>{step.value}</strong>
                            <em>{step.meta}</em>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mew-recap-footer" aria-label="Campaign status">
                    <span className="mew-recap-status" style={{ '--status-tone': statusTone } as React.CSSProperties}>
                      <FiLock size={10} aria-hidden="true" />
                      <strong>{selectedHistoryCampaign.status}</strong>
                    </span>
                    <span className="mew-recap-key">{selectedHistoryCampaign.campaignKey}</span>
                  </div>
                </div>
              );
            })() : (
              <>
                <div
                  className="mew-campaign-detail-head mew-campaign-detail-head--quiet"
                  style={{ alignItems: 'center', justifyItems: 'center', textAlign: 'center', padding: '14px 12px 0', maxWidth: 420, margin: '0 auto' }}
                  onMouseEnter={() => setCampaignPromptHovered(true)}
                  onMouseLeave={() => setCampaignPromptHovered(false)}
                  onFocus={() => setCampaignPromptHovered(true)}
                  onBlur={(event) => {
                    const nextTarget = event.relatedTarget;
                    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setCampaignPromptHovered(false);
                  }}
                  tabIndex={0}
                >
                  <span style={{ color: campaignPromptHovered ? colours.accent : muted, opacity: campaignPromptHovered ? 0.92 : 0.42, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'color 180ms ease, opacity 180ms ease, transform 180ms ease', transform: campaignPromptHovered ? 'translateY(-1px)' : 'translateY(0)' }} aria-hidden="true">
                    <FiTarget size={22} />
                  </span>
                  <strong style={{ fontSize: 15, fontWeight: 800, color: campaignPromptHovered ? text : muted, opacity: campaignPromptDimOpacity, letterSpacing: '0.01em', transition: 'color 180ms ease, opacity 180ms ease' }}>
                    Open a past campaign to recap
                  </strong>
                </div>
                <div className="mew-campaign-empty-divider">
                  <span />
                  <strong>or</strong>
                  <span />
                </div>
                <div className="mew-campaign-workspace-tools">
                  <button
                    type="button"
                    className="mew-create-cta"
                    onClick={openCampaignComposer}
                    disabled={!selectedStream || !isLiveStream}
                    style={{ '--create-accent': selectedStream ? resolveStreamAccentColor(selectedStream.streamKey) : muted } as React.CSSProperties}
                  >
                    <span className="mew-create-plus" aria-hidden="true">+</span>
                    <span className="mew-create-copy">
                      <strong>{selectedStream ? `Create a new ${selectedStream.label} Campaign` : 'Create a new campaign'}</strong>
                      <small>{selectedStream ? `${formatNumber(segmentMembers.length)} sendable - ${formatNumber(selectedDripCount)} drips at max ${formatNumber(RECOMMENDED_DRIP_SIZE)}` : 'Select an area first'}</small>
                    </span>
                    <span className="mew-create-arrow" aria-hidden="true">&#8250;</span>
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
      )}

      {showOperationsStatus && !isCampaignCreateMode && (
      <section className="mew-panel mew-operations-status" data-helix-region="marketing/email-operations/status" aria-live="polite">
        <div className="mew-panel-head">
          <span className="mew-eyebrow">Processing and provider checks</span>
          <strong>{operationalProcessingEvents.length > 0 ? `${formatNumber(operationalProcessingEvents.length)} recent` : sendGridBridge.connected ? 'SendGrid connected' : 'Gateway status'}</strong>
        </div>
        <div className="mew-operations-grid">
          <div className="mew-processing-window">
            <div className="mew-panel-head mew-processing-head">
              <span className="mew-eyebrow">Processing</span>
              <strong>{operationalProcessingEvents.length > 0 ? `${formatNumber(operationalProcessingEvents.length)} recent` : 'No active work'}</strong>
            </div>
            {operationalProcessingEvents.length > 0 ? (
              <div className="mew-processing-feed" role="list">
                {operationalProcessingEvents.map((event) => (
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
            ) : (
              <div className="mew-operations-empty">Processing events will appear here after a source check, quality check, lock, preview, send or provider check.</div>
            )}
          </div>
          <div className="mew-sendgrid-bridge">
            <div className="mew-panel-head mew-sendgrid-head">
              <span className="mew-eyebrow">SendGrid results bridge</span>
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
          </div>
        </div>
      </section>
      )}

      {campaignComposerOpen && selectedStream && (
      <section className="mew-panel mew-history" data-helix-region="marketing/email-operations/history">
        <div className="mew-panel-head mew-panel-head--composer">
          <span className="mew-eyebrow">Campaign composer</span>
          <strong>{selectedStream.label}</strong>
          <button type="button" className="mew-wizard-close" onClick={closeCampaignComposer} aria-label="Close composer">&#215;</button>
        </div>
      <div className="mew-history-grid is-composing">
      <div className="mew-history-lane mew-history-lane--composer">
      <div className="mew-wizard-overlay mew-wizard-overlay--inline" role="dialog" aria-modal="false" aria-label="Campaign composer" data-helix-region="marketing/email-operations/campaign-composer">
        <div className="mew-wizard" style={{ '--wizard-accent': resolveStreamAccentColor(selectedStream.streamKey) } as React.CSSProperties}>
          <header className="mew-wizard-head">
            <div className="mew-wizard-tabs" role="tablist" aria-label="Composer steps">
              {WIZARD_STEPS.map((step, index) => (
                <button
                  key={step.key}
                  type="button"
                  role="tab"
                  aria-selected={campaignStep === step.key}
                  className={`mew-wizard-tab${campaignStep === step.key ? ' is-active' : ''}${wizardStepIndex > index ? ' is-done' : ''}`}
                  onClick={() => setCampaignStep(step.key)}
                >
                  <span className="mew-wizard-tab-index">{index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.hint}</small>
                </button>
              ))}
            </div>
          </header>

          {sendResult && <div className={`mew-banner mew-banner--${sendResult.status === 'error' ? 'error' : 'ok'}`} role="status">{sendResult.message}</div>}

          <div className="mew-wizard-body">
            {campaignStep === 'audience' && (
              <section className="mew-wizard-pane mew-wizard-audience">
                <div className="mew-wizard-audience-board">
                  <div className="mew-wizard-audience-hero" style={{ '--stream-accent': resolveStreamAccentColor(selectedStream.streamKey) } as React.CSSProperties}>
                    <span className="mew-wizard-audience-glyph" aria-hidden="true">
                      {renderAreaOfWorkGlyph(STREAM_GLYPHS[selectedStream.streamKey], resolveStreamAccentColor(selectedStream.streamKey), 'glyph', 30)}
                    </span>
                    <div className="mew-wizard-audience-title">
                      <small>Campaign audience</small>
                      <strong>{selectedStream.label}</strong>
                      <em>{showSendableCounts ? 'Sendable planning mode' : 'Full list comparison mode'}</em>
                    </div>
                    <div className="mew-wizard-audience-count">
                      <strong>{formatNumber(segmentMembers.length)}</strong>
                      <small>sendable</small>
                    </div>
                  </div>
                  <div className="mew-wizard-audience-metrics" aria-label="Campaign audience counts">
                    <span><small>Full list</small><strong>{formatNumber(selectedMembershipCount)}</strong></span>
                    <span><small>Held</small><strong>{formatNumber(selectedSuppressedCount + selectedHeldCount)}</strong></span>
                    <span><small>Clients</small><strong>{formatNumber(selectedStream.clients ?? 0)}</strong></span>
                    <span><small>Drips</small><strong>{formatNumber(selectedDripCount)}</strong></span>
                  </div>
                  <div className="mew-wizard-audience-batches" aria-label="Campaign batches">
                    <div className="mew-wizard-section-head">
                      <span className="mew-eyebrow">Batch plan</span>
                      <strong>Max {formatNumber(RECOMMENDED_DRIP_SIZE)} recipients per SendGrid request</strong>
                    </div>
                    <div className="mew-wizard-batch-grid">
                      {campaignBatches.length === 0 ? (
                        <span className="mew-wizard-batch is-empty">No batches</span>
                      ) : campaignBatches.slice(0, 8).map((batch) => (
                        <span key={batch.batch} className="mew-wizard-batch">
                          <small>Batch {batch.batch}</small>
                          <strong>{formatNumber(batch.count)}</strong>
                          <em>{formatNumber(batch.start)}-{formatNumber(batch.end)}</em>
                        </span>
                      ))}
                      {campaignBatches.length > 8 && (
                        <span className="mew-wizard-batch is-empty">+{formatNumber(campaignBatches.length - 8)} more</span>
                      )}
                    </div>
                  </div>
                </div>
                <section className="mew-compose-sender" aria-label="Campaign sender">
                  <div className="mew-compose-sender-copy">
                    <div className="mew-compose-sender-primary">
                      <small>From Sender</small>
                      <label className="mew-compose-sender-select-wrap">
                        <select value={composeSender} onChange={(event) => {
                          const nextSender = event.currentTarget.value;
                          setComposeSender(nextSender);
                          setComposeSignature('data-hub-v2');
                          const nextSenderLabel = SENDERS.find((sender) => sender.value === nextSender)?.label || nextSender;
                          recordCampaignSettingChange('sender', 'Sender', `${nextSenderLabel} will send this campaign with the v2 signature.`);
                        }} aria-label="From sender">
                          {SENDERS.map((sender) => <option key={sender.value} value={sender.value}>{sender.value}</option>)}
                        </select>
                        <span aria-hidden="true">&#8964;</span>
                      </label>
                      <em>{selectedSenderLabel}</em>
                    </div>
                    <div className="mew-compose-sender-settings" aria-label="Campaign settings">
                      <div className={`mew-compose-setting mew-compose-setting--static${recentlyChangedSetting === 'signature' ? ' is-updated' : ''}`}>
                        <span>Signature</span>
                        <strong>{selectedSignatureLabel}</strong>
                      </div>
                      <div className="mew-compose-setting mew-compose-setting--static">
                        <span>Rank scope</span>
                        <strong>{excludeClients ? '4 only' : '0-4'}</strong>
                      </div>
                      <label className={`mew-compose-setting mew-compose-setting--check${recentlyChangedSetting === 'clients' ? ' is-updated' : ''}`}>
                        <span>Clients</span>
                        <span className="mew-compose-setting-check-row">
                          <input type="checkbox" checked={excludeClients} onChange={(event) => {
                            const nextExcludeClients = event.currentTarget.checked;
                            setExcludeClients(nextExcludeClients);
                            recordCampaignSettingChange('clients', 'Client filter', `Clients are now ${nextExcludeClients ? 'excluded' : 'included'}.`);
                          }} />
                          <strong>Exclude ({formatNumber(selectedStream.clients ?? 0)})</strong>
                        </span>
                      </label>
                    </div>
                  </div>
                </section>
              </section>
            )}

            {campaignStep === 'copy' && (
              <section className="mew-wizard-pane mew-wizard-copy">
                <div
                  ref={composeLayoutRef}
                  className={`mew-wizard-copy-split${composerResizing ? ' is-resizing' : ''}`}
                  style={{ '--compose-left': `${composerSplitPct}%` } as React.CSSProperties}
                >
                  <div className="mew-wizard-copy-fields">
                    <label className={`mew-wizard-field${composeSubjectLength ? ' is-filled' : ''}`}>
                      <span>Subject line <em>{composeSubjectLength}/240</em></span>
                      <input className="mew-wizard-input mew-wizard-input--subject" value={composeSubject} onChange={(event) => { setComposeSubject(event.currentTarget.value); setLockedCampaign(null); }} placeholder="Write the subject line recipients will see" maxLength={240} />
                    </label>
                    <label className={`mew-wizard-field${composePreheaderLength ? ' is-filled' : ''}`}>
                      <span>Preview text <em>{composePreheaderLength}/240</em></span>
                      <input className="mew-wizard-input" value={composePreheader} onChange={(event) => { setComposePreheader(event.currentTarget.value); setLockedCampaign(null); }} placeholder="Add optional preview text shown after the subject" maxLength={240} />
                    </label>
                    <label className={`mew-wizard-field mew-wizard-field--body${composeBodyWordCount ? ' is-filled' : ''}`}>
                      <span>Body text <em>{formatNumber(composeBodyWordCount)} words</em></span>
                      <textarea className="mew-wizard-input mew-wizard-textarea" value={composeBody} onChange={(event) => { setComposeBody(event.currentTarget.value); setLockedCampaign(null); }} rows={16} placeholder="Write the body text. The Helix v2 signature is added automatically." />
                    </label>
                  </div>

                  <button
                    type="button"
                    className="mew-wizard-copy-resizer"
                    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setComposerResizing(true); }}
                    onDoubleClick={() => setComposerSplitPct(60)}
                    aria-label="Resize composer and preview"
                    title="Drag to resize composer and preview"
                  />

                  <aside className="mew-wizard-preview">
                    <div className="mew-wizard-preview-bar">
                      <span className="mew-eyebrow">Rendered email</span>
                      <div className="mew-preview-toggle" role="group" aria-label="Preview device">
                        {(['desktop', 'mobile'] as Array<Extract<PreviewDevice, 'desktop' | 'mobile'>>).map((device) => (
                          <button
                            key={device}
                            type="button"
                            className={copyPreviewDevice === device ? 'is-active' : ''}
                            onClick={() => setCopyPreviewDevice(device)}
                            aria-pressed={copyPreviewDevice === device}
                          >
                            {device === 'desktop' ? 'Desktop' : 'Mobile'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="mew-wizard-preview-stage">
                      {renderDevicePreview(copyPreviewDevice)}
                    </div>
                  </aside>
                </div>
              </section>
            )}

            {campaignStep === 'review' && (
              <section className="mew-wizard-pane mew-wizard-review">
                {lockedCampaign ? (
                  <div className="mew-wizard-success" role="status">
                    <div className="mew-wizard-lock-summary">
                      <span className="mew-wizard-success-mark" aria-hidden="true"><FiLock size={20} /></span>
                      <div>
                        <small>Locked snapshot</small>
                        <strong>{formatNumber(reviewRecipientCount)} recipients ready</strong>
                        <p>{formatNumber(reviewHeldCount)} held outside the send set. Preview the next capped batch, then confirm the exact recipient count.</p>
                      </div>
                    </div>
                    <div className="mew-batch-panel" data-helix-region="marketing/email-operations/sendgrid-batch">
                      <div className="mew-batch-stats" aria-label="SendGrid batch status">
                        <span><small>Batch cap</small><strong>{formatNumber(batchPreview?.batchLimit ?? RECOMMENDED_DRIP_SIZE)}</strong></span>
                        <span><small>Ready now</small><strong>{formatNumber(nextBatchCount)}</strong></span>
                        <span><small>Unsent</small><strong>{formatNumber(batchPreview?.statusCounts.notSentCount ?? lockedCampaign.selectedCount ?? 0)}</strong></span>
                        <span><small>Sent</small><strong>{formatNumber(batchPreview?.statusCounts.sentCount ?? lockedCampaign.sentCount ?? 0)}</strong></span>
                      </div>
                      <div className="mew-batch-route" aria-label="SendGrid provider route">
                        <span><small>Hub request</small><strong>Preview, then confirm</strong></span>
                        <span><small>Provider request</small><strong>One SendGrid call per batch</strong></span>
                        <span><small>Guardrail</small><strong>Hashes stay inside Hub</strong></span>
                      </div>
                      {batchPreview && !batchPreview.bodyHashMatches && <div className="mew-batch-warning">Copy changed after lock. Lock a fresh snapshot before sending.</div>}
                      <div className="mew-batch-actions">
                        <button type="button" className="mew-btn mew-btn--ghost" onClick={() => runSendGridBatch('preview')} disabled={!canPreviewBatch || batchWorking !== null}>
                          {batchWorking === 'preview' ? 'Previewing' : 'Preview next batch'}
                        </button>
                        <button type="button" className="mew-btn mew-btn--primary" onClick={() => runSendGridBatch('send')} disabled={!canSendBatch || batchWorking !== null}>
                          {batchWorking === 'send' ? 'Sending' : `Send ${formatNumber(batchPreview?.batchRecipientCount ?? 0)} in one call`}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mew-wizard-lead">
                      <h3>Proof, then lock</h3>
                      <p>Confirm the inbox line, send yourself a proof, then lock the audience snapshot for batch release.</p>
                    </div>
                    <div className="mew-wizard-review-layout">
                      <div className="mew-wizard-review-main">
                        <div className="mew-wizard-review-grid">
                          <article className="mew-wizard-stat"><small>List</small><strong>{selectedStream.label}</strong></article>
                          <article className="mew-wizard-stat"><small>Sendable</small><strong>{formatNumber(segmentMembers.length)}</strong></article>
                          <article className="mew-wizard-stat"><small>Drips</small><strong>{formatNumber(selectedDripCount)} @ {formatNumber(RECOMMENDED_DRIP_SIZE)}</strong></article>
                          <article className="mew-wizard-stat"><small>From</small><strong>{selectedSenderLabel}</strong></article>
                          <article className="mew-wizard-stat"><small>Signature</small><strong>{selectedSignatureLabel}</strong></article>
                          <article className="mew-wizard-stat"><small>Proof</small><strong>{campaignProofState}</strong></article>
                        </div>
                        <div className="mew-wizard-review-inbox" aria-label="Inbox line preview">
                          <small>Inbox proof</small>
                          <strong>{previewSubject}</strong>
                          <span>{previewPreheader}</span>
                          <em>{campaignLockState}</em>
                        </div>
                        <div className="mew-wizard-send-row">
                          <button type="button" className="mew-btn mew-btn--ghost" onClick={sendTest} disabled={!canTest || testSending}>
                            {testSending ? 'Sending' : 'Send test to me'}
                          </button>
                          <span className="mew-wizard-send-note">Lock becomes available once the audience, sender, signature, subject and body are ready.</span>
                        </div>
                      </div>
                      <aside className="mew-wizard-review-preview" aria-label="Final rendered preview">
                        <div className="mew-wizard-preview-bar">
                          <span className="mew-eyebrow">Final preview</span>
                          <small>{selectedSignatureLabel}</small>
                        </div>
                        {renderDevicePreview('desktop')}
                      </aside>
                    </div>
                  </>
                )}
              </section>
            )}
          </div>

          <footer className="mew-wizard-foot">
            <button type="button" className="mew-btn mew-btn--ghost" onClick={goWizardBack}>
              {campaignStep === 'audience' ? 'Cancel' : 'Back'}
            </button>
            <div className="mew-wizard-foot-right">
              {campaignStep === 'audience' && (
                <button type="button" className="mew-btn mew-btn--primary" onClick={() => setCampaignStep('copy')} disabled={!isLiveStream}>
                  Continue to copy
                </button>
              )}
              {campaignStep === 'copy' && (
                <button type="button" className="mew-btn mew-btn--primary" onClick={() => setCampaignStep('review')} disabled={!campaignDraftReady}>
                  Continue to preview
                </button>
              )}
              {campaignStep === 'review' && !lockedCampaign && (
                <button type="button" className="mew-btn mew-btn--primary" onClick={lockCampaign} disabled={!canLock}>
                  {locking ? 'Locking' : 'Lock campaign'}
                </button>
              )}
              {campaignStep === 'review' && lockedCampaign && (
                <button type="button" className="mew-btn mew-btn--primary" onClick={closeCampaignComposer}>
                  Done
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
      </div>
      </div>
      </section>
      )}
    </section>
  );
};

const mewStyles = `
.mew-root { display: grid; gap: 12px; min-width: 0; padding: 12px; border-radius: 0; font-family: 'Raleway', sans-serif; color: var(--mew-text); }
.mew-root * { box-sizing: border-box; }
.mew-eyebrow { font-size: 9px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mew-muted); }
.mew-eyebrow--ink { color: rgba(255,255,255,0.78); }

.mew-hero { display: grid; gap: 12px; min-width: 0; padding: 0; border: 0; background: transparent; box-shadow: none; }
.mew-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0; border-bottom: 0; background: transparent; }
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

.mew-readiness { display: grid; grid-template-columns: minmax(240px, 1.35fr) repeat(2, minmax(120px, 0.75fr)); gap: 10px; padding: 0; }
.mew-total-card, .mew-readiness-card { display: grid; gap: 5px; min-width: 0; padding: 10px 11px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); align-content: start; }
.mew-readiness-card--button { width: 100%; text-align: left; color: inherit; font: inherit; cursor: pointer; transition: background 160ms ease, border-color 160ms ease, transform 140ms ease; }
.mew-readiness-card--button:hover { background: var(--mew-hover); transform: translateY(-1px); }
.mew-readiness-card--button.is-active { border-color: rgba(32,178,108,0.4); background: rgba(32,178,108,0.08); }
.mew-total-card > small, .mew-readiness-card small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-total-card > strong { color: var(--mew-text); font-size: 28px; font-weight: 900; line-height: 0.95; overflow-wrap: anywhere; }
.mew-readiness-card { align-content: center; }
.mew-readiness-card strong { color: var(--mew-text); font-size: 20px; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
.mew-readiness-card--button { align-content: start; }
.mew-readiness-card em { justify-self: start; min-height: 17px; display: inline-flex; align-items: center; padding: 0 7px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-size: 8px; font-style: normal; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-readiness-card--button.is-active em { border-color: rgba(32,178,108,0.34); color: var(--mew-green); background: rgba(32,178,108,0.1); }
.mew-total-children { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 4px; }
.mew-total-children span { display: grid; gap: 2px; min-width: 0; padding: 7px 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-total-children em { color: var(--mew-muted); font-size: 8px; font-style: normal; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-total-children b { color: var(--mew-text); font-size: 14px; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
.mew-sendable-note { margin-top: -2px; color: var(--mew-muted); font-size: 9px; font-weight: 700; line-height: 1.35; }
.mew-total-card--loading, .mew-readiness-card--loading { pointer-events: none; }
.mew-total-children--loading span { gap: 6px; }
.mew-total-children--loading i { display: block; }

.mew-streams-wrap { overflow: hidden; transition: max-height 320ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 220ms ease, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-streams-wrap.is-open { max-height: 900px; opacity: 1; }
.mew-streams-wrap.is-closed { max-height: 0; opacity: 0; transform: translateY(-8px); pointer-events: none; }
.mew-streams { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.mew-stream { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; gap: 8px 9px; align-items: start; min-height: 116px; padding: 12px 12px; text-align: left; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); cursor: pointer; overflow: hidden; font-family: inherit; animation: mewStreamCascade 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both; animation-delay: calc(var(--stream-index, 0) * 34ms); transition: background 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 140ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-stream::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--stream-accent, var(--mew-tone)); transform: scaleY(0); transform-origin: top; transition: transform 200ms cubic-bezier(0.22, 0.61, 0.36, 1); pointer-events: none; }
.mew-stream:hover { background: var(--mew-hover); transform: translateY(-1px); box-shadow: var(--mew-shadow); }
.mew-stream:hover::before, .mew-stream.is-selected::before { transform: scaleY(1); }
.mew-stream.is-selected { border-color: var(--stream-accent, var(--mew-tone)); background: var(--mew-selected); box-shadow: var(--mew-shadow); }
.mew-stream:active { transform: translateY(0) scale(0.995) !important; }
.mew-stream.is-inspect { opacity: 0.85; }
.mew-stream.is-locked { cursor: not-allowed; border-style: dashed; background: color-mix(in srgb, var(--mew-elevated) 62%, var(--mew-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mew-blue) 5%, transparent); }
.mew-stream.is-locked:hover { background: color-mix(in srgb, var(--mew-elevated) 62%, var(--mew-surface)); transform: none; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mew-blue) 5%, transparent); }
.mew-stream.is-locked::before { transform: scaleY(1); opacity: 0.18; }
.mew-stream.is-locked:active { transform: none !important; }
.mew-stream-glyph { display: inline-flex; grid-row: span 2; flex-shrink: 0; }
.mew-stream-info { flex: 1 1 auto; display: grid; gap: 4px; min-width: 0; }
.mew-stream.is-locked .mew-stream-info { padding-right: 64px; }
.mew-stream-info strong { font-size: 12px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-stream-info small { font-size: 8px; font-weight: 900; color: var(--mew-muted); text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-stream-tally { grid-column: 1 / -1; display: grid; gap: 4px; text-align: left; flex-shrink: 0; min-width: 0; align-self: end; padding-top: 2px; }
.mew-stream-tally strong { font-size: 28px; font-weight: 900; line-height: 0.95; }
.mew-stream-tally small { font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mew-muted); }
.mew-stream-arrow { display: none; }
.mew-stream:hover .mew-stream-arrow, .mew-stream.is-selected .mew-stream-arrow { color: var(--stream-accent, var(--mew-tone)); transform: translateX(4px); }
.mew-stream-lock { position: absolute; top: 10px; right: 10px; display: inline-flex; align-items: center; gap: 4px; min-height: 19px; padding: 0 7px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-stream-lock svg { flex-shrink: 0; }
.mew-stream--skeleton { cursor: default; pointer-events: none; }
.mew-stream--skeleton::before { transform: scaleY(1); opacity: 0.24; }
.mew-stream-skeleton-glyph { width: 22px; height: 22px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--mew-edge) 78%, transparent); background: color-mix(in srgb, var(--mew-muted) 20%, var(--mew-control)); animation: mewSkeletonPulse 1400ms ease-in-out infinite; }
.mew-area-focus { display: grid; gap: 12px; min-width: 0; padding: 0; border: 0; background: transparent; box-shadow: none; animation: mewAreaFocusIn 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both; }
.mew-area-focus-head { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mew-area-focus-glyph { display: inline-flex; flex-shrink: 0; }
.mew-area-focus-title { display: grid; gap: 2px; min-width: 0; flex: 1; }
.mew-area-focus-title strong { color: var(--mew-text); font-size: 19px; font-weight: 900; line-height: 1.05; }
.mew-area-focus-title small { color: var(--mew-muted); font-size: 10px; font-weight: 700; line-height: 1.4; }
.mew-area-focus-actions { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mew-area-focus-body { display: grid; grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.6fr); gap: 10px; align-items: stretch; }
.mew-area-focus-body--sendable { grid-template-columns: minmax(220px, 0.42fr) minmax(0, 1fr); }
.mew-area-focus-total { display: grid; gap: 4px; min-width: 0; padding: 13px; border: 1px solid var(--mew-edge); border-left: 3px solid var(--stream-accent, var(--mew-tone)); background: var(--mew-elevated); }
.mew-area-focus-total small, .mew-area-focus-breakdown small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-area-focus-total-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
.mew-area-focus-total-primary { display: grid; grid-template-columns: 1fr; gap: 0; align-items: end; min-width: 0; margin-top: -2px; }
.mew-area-focus-total strong { color: var(--mew-text); font-size: 42px; font-weight: 900; line-height: 0.92; overflow-wrap: anywhere; }
.mew-area-focus-mix { display: inline-flex; align-items: center; gap: 14px; margin-top: auto; padding-top: 8px; color: var(--mew-muted); }
.mew-area-focus-mix span { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.mew-area-focus-mix b { color: color-mix(in srgb, var(--mew-text) 76%, var(--mew-muted)); font-size: 12px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
.mew-area-focus-mix svg { color: color-mix(in srgb, var(--mew-muted) 86%, transparent); flex-shrink: 0; }
.mew-area-focus-range { color: color-mix(in srgb, var(--mew-text) 70%, var(--mew-muted)); font-size: 10px; font-style: normal; font-weight: 800; line-height: 1; white-space: nowrap; }
.mew-area-focus-total em { color: var(--mew-muted); font-size: 10px; font-style: normal; font-weight: 800; line-height: 1.35; }
.mew-area-focus-total-loading { display: grid; gap: 6px; }
.mew-area-growth { display: grid; min-width: 0; padding: 12px 13px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-growth-bars { position: relative; min-height: 148px; display: grid; grid-template-columns: repeat(auto-fit, minmax(30px, 1fr)); gap: 7px; align-items: end; }
.mew-growth-bar { min-width: 0; height: 148px; display: grid; grid-template-rows: auto 1fr auto; gap: 6px; align-items: end; justify-items: center; color: var(--mew-muted); }
.mew-growth-bar b { color: var(--mew-text); font-size: 10px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; opacity: 0; transform: translateY(6px); animation: mewGrowthCountIn 280ms cubic-bezier(0.22, 0.61, 0.36, 1) both; animation-delay: calc(var(--bar-index, 0) * 32ms + 80ms); }
.mew-growth-stack { width: 100%; min-height: 10px; display: flex; flex-direction: column-reverse; justify-content: flex-start; align-self: end; border: 1px solid color-mix(in srgb, var(--stream-accent, var(--mew-tone)) 35%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-control) 90%, var(--stream-accent, var(--mew-tone))); box-shadow: inset 0 1px 0 rgba(255,255,255,0.08); transform-origin: bottom center; overflow: hidden; animation: mewGrowthBarIn 360ms cubic-bezier(0.22, 0.61, 0.36, 1) both; animation-delay: calc(var(--bar-index, 0) * 32ms); }
.mew-growth-segment { display: block; width: 100%; min-height: 0; }
.mew-growth-segment--sendable { background: linear-gradient(180deg, color-mix(in srgb, var(--stream-accent, var(--mew-tone)) 42%, transparent), color-mix(in srgb, var(--stream-accent, var(--mew-tone)) 20%, var(--mew-control))); }
.mew-growth-segment--suppressed { background: linear-gradient(180deg, color-mix(in srgb, var(--mew-red) 78%, #ffffff 2%), color-mix(in srgb, var(--mew-red) 66%, var(--mew-control))); }
.mew-growth-segment--held { background: color-mix(in srgb, #d1d5db 56%, var(--mew-control)); }
.mew-growth-bar em { width: 100%; padding-top: 4px; border-top: 1px solid color-mix(in srgb, var(--mew-edge) 88%, transparent); color: color-mix(in srgb, var(--mew-text) 68%, var(--mew-muted)); font-size: 8px; font-style: normal; font-weight: 900; line-height: 1; white-space: nowrap; text-align: center; transform: translateY(5px); transform-origin: center; opacity: 0; animation: mewGrowthLabelIn 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both; animation-delay: calc(var(--bar-index, 0) * 32ms + 140ms); }
.mew-growth-skeleton { min-height: 148px; display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 7px; align-items: end; }
.mew-growth-skeleton-col { height: 148px; display: grid; grid-template-rows: auto 1fr auto; gap: 6px; align-items: end; justify-items: center; }
.mew-skeleton-line { display: block; width: 100%; height: 8px; background: color-mix(in srgb, var(--mew-muted) 18%, var(--mew-control)); animation: mewSkeletonPulse 1400ms ease-in-out infinite; animation-delay: calc(var(--skel-index, 0) * 40ms); }
.mew-skeleton-line--body { width: 88%; height: 10px; }
.mew-skeleton-line--meta { width: 74%; height: 8px; }
.mew-skeleton-line--count { width: 70%; height: 8px; }
.mew-skeleton-line--date { width: 84%; height: 7px; }
.mew-skeleton-line--label { width: 58%; height: 7px; }
.mew-skeleton-line--hero { width: 72%; height: 22px; }
.mew-skeleton-line--chip { width: 68%; height: 14px; }
.mew-skeleton-line--pill { width: 34%; height: 16px; }
.mew-skeleton-line--stream-title { width: 72%; height: 11px; }
.mew-skeleton-line--stream-sub { width: 58%; height: 8px; }
.mew-skeleton-line--stream-count { width: 54%; height: 24px; }
.mew-skeleton-block { width: 100%; height: var(--skel-height, 42%); border: 1px solid color-mix(in srgb, var(--mew-edge) 82%, transparent); background: color-mix(in srgb, var(--mew-muted) 20%, var(--mew-control)); animation: mewSkeletonPulse 1400ms ease-in-out infinite; animation-delay: calc(var(--skel-index, 0) * 40ms + 80ms); }
.mew-area-focus-breakdown { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.mew-area-focus-breakdown span { display: grid; gap: 3px; min-width: 0; padding: 10px 11px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-area-focus-breakdown strong { color: var(--mew-text); font-size: 18px; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
@keyframes mewStreamCascade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mewAreaFocusIn { from { opacity: 0; transform: translateY(8px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes mewGrowthBarIn { from { opacity: 0; transform: scaleY(0.15); } to { opacity: 1; transform: scaleY(1); } }
@keyframes mewGrowthCountIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mewGrowthLabelIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mewSkeletonPulse { 0%, 100% { opacity: 0.38; } 50% { opacity: 0.72; } }
@media (prefers-reduced-motion: reduce) {
  .mew-growth-bar b,
  .mew-growth-stack,
  .mew-growth-bar em,
  .mew-skeleton-line,
  .mew-skeleton-block {
    animation: none !important;
    opacity: 1;
    transform: none;
  }
}
.mew-cockpit { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; align-items: start; }
.mew-cockpit-main { display: grid; gap: 12px; min-width: 0; }
.mew-create-cta { --create-accent: var(--mew-tone); display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 13px; border: 1px solid color-mix(in srgb, var(--mew-edge) 88%, transparent); border-radius: 3px; background: color-mix(in srgb, var(--mew-control) 44%, transparent); color: var(--mew-text); cursor: pointer; text-align: left; font-family: inherit; opacity: 0.78; transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 160ms ease, opacity 180ms ease; }
.mew-create-cta:hover:not(:disabled), .mew-create-cta:focus-visible:not(:disabled) { background: color-mix(in srgb, var(--create-accent) 8%, var(--mew-control)); border-color: color-mix(in srgb, var(--create-accent) 44%, var(--mew-edge)); box-shadow: 0 6px 16px rgba(0,0,0,0.08); transform: translateY(-1px); opacity: 1; outline: none; }
.mew-create-cta:disabled { opacity: 0.42; cursor: default; }
.mew-create-plus { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; border: 1px solid color-mix(in srgb, var(--create-accent) 22%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-control) 72%, transparent); color: color-mix(in srgb, var(--create-accent) 54%, var(--mew-muted)); font-size: 19px; font-weight: 400; line-height: 1; transition: background 180ms ease, border-color 180ms ease, color 180ms ease, transform 160ms ease; }
.mew-create-cta:hover:not(:disabled) .mew-create-plus, .mew-create-cta:focus-visible:not(:disabled) .mew-create-plus { border-color: color-mix(in srgb, var(--create-accent) 58%, var(--mew-edge)); background: color-mix(in srgb, var(--create-accent) 12%, var(--mew-control)); color: var(--create-accent); transform: scale(1.04); }
.mew-create-copy { display: grid; gap: 3px; min-width: 0; flex: 1; }
.mew-create-copy strong { font-size: 14px; font-weight: 800; color: var(--mew-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 180ms ease; }
.mew-create-copy small { font-size: 10px; font-weight: 700; color: var(--mew-muted); }
.mew-create-cta:hover:not(:disabled) .mew-create-copy strong, .mew-create-cta:focus-visible:not(:disabled) .mew-create-copy strong { color: color-mix(in srgb, var(--create-accent) 72%, var(--mew-text)); }
.mew-create-arrow { font-size: 20px; color: color-mix(in srgb, var(--create-accent) 46%, var(--mew-muted)); flex-shrink: 0; transition: color 180ms ease, transform 160ms ease; }
.mew-create-cta:hover:not(:disabled) .mew-create-arrow, .mew-create-cta:focus-visible:not(:disabled) .mew-create-arrow { color: var(--create-accent); transform: translateX(4px); }
.mew-launch-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.mew-fact { position: relative; display: grid; gap: 2px; min-width: 0; padding: 7px 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); transition: border-color 160ms ease, background 160ms ease; }
.mew-fact:not(.mew-fact--static):hover { border-color: var(--mew-tone); background: var(--mew-hover); }
.mew-fact dt { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-fact dd { margin: 0; color: var(--mew-text); font-size: 12px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-fact--static { cursor: default; }
.mew-fact-select { width: 100%; border: none; background: transparent; color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 12px; font-weight: 900; cursor: pointer; padding: 0 14px 0 0; margin: 0; appearance: none; -webkit-appearance: none; text-overflow: ellipsis; }
.mew-fact-select:focus { outline: none; }
.mew-fact:not(.mew-fact--static)::after { content: '▾'; position: absolute; right: 8px; bottom: 8px; font-size: 8px; color: var(--mew-muted); pointer-events: none; opacity: 0.5; transition: opacity 160ms ease, color 160ms ease; }
.mew-fact:not(.mew-fact--static):hover::after { opacity: 1; color: var(--mew-tone); }

.mew-wizard-overlay { position: fixed; inset: 0; z-index: 1200; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, var(--mew-deep) 72%, rgba(7,12,20,0.55)); backdrop-filter: blur(3px); animation: mewWizardFade 180ms ease; }
.mew-wizard-overlay--inline { position: static; inset: auto; z-index: auto; place-items: stretch; padding: 0; background: transparent; backdrop-filter: none; animation: none; }
.mew-wizard-overlay--inline .mew-wizard { width: 100%; height: auto; min-height: auto; max-height: none; border: 0; border-top: 0; background: transparent; box-shadow: none; animation: mewAreaFocusIn 220ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-wizard { display: grid; grid-template-rows: auto 1fr auto; width: min(1180px, 100%); height: min(860px, 94vh); border: 1px solid var(--mew-edge); border-top: 3px solid var(--wizard-accent, var(--mew-tone)); background: var(--mew-surface); box-shadow: 0 30px 80px rgba(0,0,0,0.45); overflow: hidden; animation: mewWizardRise 220ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-wizard-head { display: block; padding: 0; border-bottom: 1px solid var(--mew-edge); background: transparent; }
.mew-wizard-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); width: 100%; }
.mew-wizard-tab { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; row-gap: 2px; align-content: center; justify-items: start; min-height: 74px; border: 0; border-right: 1px solid var(--mew-edge); background: transparent; color: var(--mew-muted); padding: 10px 12px 12px; cursor: pointer; text-align: left; transition: background 160ms ease, color 160ms ease; }
.mew-wizard-tab:last-child { border-right: 0; }
.mew-wizard-tab::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; background: var(--mew-edge); transition: background 160ms ease, height 160ms ease; }
.mew-wizard-tab-index { grid-column: 1; grid-row: 1 / span 2; align-self: center; font-size: 18px; font-weight: 900; color: inherit; opacity: 0.9; line-height: 1; min-width: 16px; }
.mew-wizard-tab strong { grid-column: 2; grid-row: 1; font-size: 14px; font-weight: 900; color: inherit; line-height: 1.15; }
.mew-wizard-tab small { grid-column: 2; grid-row: 2; font-size: 10px; font-weight: 700; color: inherit; line-height: 1.25; opacity: 0.92; }
.mew-wizard-tab:hover { background: var(--mew-hover); color: var(--mew-text); }
.mew-wizard-tab.is-done { color: var(--mew-body); }
.mew-wizard-tab.is-done::after { background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 54%, var(--mew-edge)); }
.mew-wizard-tab.is-active { background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 12%, transparent); color: var(--mew-text); }
.mew-wizard-tab.is-active::after { background: var(--wizard-accent, var(--mew-tone)); height: 3px; }
.mew-wizard-close { flex-shrink: 0; width: 30px; height: 30px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-size: 18px; line-height: 1; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
.mew-wizard-close:hover { background: var(--mew-hover); border-color: var(--mew-tone); }
.mew-wizard-body { min-height: 0; overflow-y: auto; padding: 14px 0; }
.mew-wizard-pane { display: grid; gap: 14px; min-height: 100%; }
.mew-wizard-lead h3 { margin: 0 0 2px; font-size: 16px; font-weight: 900; color: var(--mew-text); }
.mew-wizard-lead p { margin: 0; font-size: 12px; font-weight: 700; color: var(--mew-muted); }
.mew-wizard-audience-board { display: grid; grid-template-columns: minmax(300px, 0.9fr) minmax(260px, 0.72fr) minmax(0, 1.28fr); gap: 10px; align-items: stretch; min-width: 0; }
.mew-wizard-audience-hero { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; min-width: 0; padding: 13px; border: 1px solid color-mix(in srgb, var(--stream-accent, var(--wizard-accent)) 34%, var(--mew-edge)); border-left: 3px solid var(--stream-accent, var(--wizard-accent)); background: color-mix(in srgb, var(--stream-accent, var(--wizard-accent)) 8%, var(--mew-elevated)); }
.mew-wizard-audience-glyph { display: inline-flex; flex-shrink: 0; }
.mew-wizard-audience-title { display: grid; gap: 3px; min-width: 0; }
.mew-wizard-audience-title small, .mew-wizard-section-head span { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-audience-title strong { color: var(--mew-text); font-size: 18px; font-weight: 900; line-height: 1.05; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-wizard-audience-title em { color: var(--mew-muted); font-size: 10px; font-style: normal; font-weight: 800; }
.mew-wizard-audience-count { display: grid; gap: 2px; justify-items: end; min-width: 76px; }
.mew-wizard-audience-count strong { color: var(--mew-text); font-size: 30px; font-weight: 900; line-height: 0.95; font-variant-numeric: tabular-nums; }
.mew-wizard-audience-count small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-audience-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; min-width: 0; }
.mew-wizard-audience-metrics span { display: grid; gap: 3px; min-width: 0; padding: 9px 10px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-wizard-audience-metrics small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-wizard-audience-metrics strong { color: var(--mew-text); font-size: 17px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.mew-wizard-audience-batches { display: grid; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-wizard-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
.mew-wizard-section-head strong { color: var(--mew-muted); font-size: 10px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-wizard-batch-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 7px; align-items: stretch; }
.mew-wizard-batch { display: grid; gap: 3px; min-width: 0; padding: 8px 9px; border: 1px solid color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 24%, var(--mew-edge)); background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 7%, transparent); }
.mew-wizard-batch small { color: var(--wizard-accent, var(--mew-tone)); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-wizard-batch strong { color: var(--mew-text); font-size: 17px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.mew-wizard-batch em { color: var(--mew-muted); font-size: 9px; font-style: normal; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-wizard-batch.is-empty { align-content: center; min-height: 52px; color: var(--mew-muted); font-size: 11px; font-weight: 800; }
.mew-compose-sender { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; align-items: stretch; padding: 11px; border: 1px solid color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 22%, var(--mew-edge)); background: linear-gradient(180deg, color-mix(in srgb, var(--mew-elevated) 88%, transparent), color-mix(in srgb, var(--mew-surface) 96%, transparent)); overflow: hidden; box-shadow: inset 0 1px 0 color-mix(in srgb, #ffffff 6%, transparent); }
.mew-compose-sender::before { content: ''; position: absolute; inset: 0 0 auto; height: 2px; background: linear-gradient(90deg, var(--wizard-accent, var(--mew-tone)), color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 18%, transparent)); opacity: 0.9; }
.mew-compose-sender-copy { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(250px, 0.94fr) minmax(0, 1.06fr); gap: 11px; align-items: stretch; min-width: 0; }
.mew-compose-sender-primary { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-content: center; min-width: 0; padding: 9px 0 9px 2px; border: 0; background: transparent; }
.mew-compose-sender-primary small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
.mew-compose-sender-primary em { color: color-mix(in srgb, var(--mew-muted) 82%, var(--mew-text)); font-size: 9px; font-style: normal; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-compose-sender-settings { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(92px, 0.66fr) minmax(130px, 0.86fr); gap: 8px; align-items: stretch; }
.mew-compose-setting { position: relative; display: grid; grid-template-rows: auto 1fr; gap: 5px; align-content: center; min-width: 0; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--mew-edge) 70%, transparent); background: linear-gradient(180deg, color-mix(in srgb, var(--mew-surface) 76%, transparent), color-mix(in srgb, var(--mew-control) 26%, transparent)); transition: border-color 180ms ease, background 180ms ease, transform 180ms ease, box-shadow 180ms ease; }
.mew-compose-setting::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 2px; background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 52%, transparent); opacity: 0; transition: opacity 180ms ease; }
.mew-compose-setting:hover, .mew-compose-setting:focus-within { border-color: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 46%, var(--mew-edge)); background: linear-gradient(180deg, color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 6%, var(--mew-surface)), color-mix(in srgb, var(--mew-control) 34%, transparent)); transform: translateY(-1px); box-shadow: 0 10px 24px color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 10%, rgba(0,0,0,0.12)); }
.mew-compose-setting:hover::before, .mew-compose-setting:focus-within::before, .mew-compose-setting.is-updated::before { opacity: 1; }
.mew-compose-setting.is-updated { animation: mewSettingPulse 820ms ease; border-color: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 62%, var(--mew-edge)); }
.mew-compose-setting > span { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
.mew-compose-setting select { width: 100%; min-height: 24px; border: 0; background: transparent; color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 11px; font-weight: 900; padding: 0 14px 0 0; appearance: none; cursor: pointer; }
.mew-compose-setting select:focus { outline: none; color: var(--wizard-accent, var(--mew-tone)); }
.mew-compose-setting--static strong { color: var(--mew-text); font-size: 11px; font-weight: 900; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; align-self: end; }
.mew-compose-setting--check { align-content: center; }
.mew-compose-setting-check-row { display: inline-grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 7px; min-width: 0; align-self: end; }
.mew-compose-setting-check-row input { width: 16px; height: 16px; margin: 0; accent-color: var(--wizard-accent, var(--mew-tone)); }
.mew-compose-setting-check-row strong { color: var(--mew-text); font-size: 11px; font-weight: 800; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-compose-sender-select-wrap { position: relative; display: inline-flex; align-items: center; width: 100%; max-width: 100%; min-width: 0; min-height: 34px; border: 1px solid color-mix(in srgb, var(--mew-edge) 78%, transparent); background: transparent; transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.mew-compose-sender-select-wrap:hover, .mew-compose-sender-select-wrap:focus-within { border-color: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 46%, var(--mew-edge)); background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 5%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 16%, transparent); }
.mew-compose-sender-select-wrap select { width: 100%; max-width: 100%; min-height: 32px; padding: 0 28px 0 10px; border: 0; background: transparent; appearance: none; color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 14px; font-weight: 900; line-height: 1.2; cursor: pointer; text-overflow: ellipsis; }
.mew-compose-sender-select-wrap select:hover { color: var(--mew-text); }
.mew-compose-sender-select-wrap select:focus { outline: none; color: var(--wizard-accent, var(--mew-tone)); }
.mew-compose-sender-select-wrap select option { background: var(--mew-surface); color: var(--mew-text); font-weight: 800; }
.mew-compose-sender-select-wrap span { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: var(--mew-muted); font-size: 12px; pointer-events: none; line-height: 1; transition: color 160ms ease, transform 160ms ease; }
.mew-compose-sender-select-wrap:hover span, .mew-compose-sender-select-wrap:focus-within span { color: var(--wizard-accent, var(--mew-tone)); transform: translateY(-50%) rotate(180deg); }
.mew-wizard-stat { display: grid; gap: 3px; min-width: 0; padding: 9px 10px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-wizard-stat small { color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-stat strong { color: var(--mew-text); font-size: 14px; font-weight: 900; line-height: 1.05; overflow-wrap: anywhere; }
.mew-wizard-stat--hero { grid-column: span 2; border-left: 3px solid var(--wizard-accent, var(--mew-tone)); }
.mew-wizard-stat--hero strong { font-size: 28px; line-height: 0.95; }
.mew-wizard-stat--hero em { color: var(--mew-muted); font-size: 10px; font-style: normal; font-weight: 800; }
.mew-wizard-copy { display: block; }
.mew-wizard-copy-split { --compose-left: 56%; display: grid; grid-template-columns: minmax(340px, var(--compose-left)) 8px minmax(320px, 1fr); gap: 12px; align-items: start; animation: mewComposerIn 220ms ease-out both; }
.mew-wizard-copy-split.is-resizing { user-select: none; cursor: col-resize; }
.mew-wizard-copy-resizer { align-self: stretch; width: 8px; min-height: 100%; border: 1px solid var(--mew-edge); border-top: 0; border-bottom: 0; background: linear-gradient(90deg, transparent, var(--mew-edge), transparent); cursor: col-resize; padding: 0; touch-action: none; opacity: 0.72; transition: opacity 160ms ease, background 160ms ease; }
.mew-wizard-copy-resizer:hover, .mew-wizard-copy-split.is-resizing .mew-wizard-copy-resizer { opacity: 1; background: linear-gradient(90deg, transparent, var(--mew-tone), transparent); }
.mew-wizard-copy-fields { display: grid; gap: 12px; align-content: start; min-width: 0; padding: 12px; border: 1px solid var(--mew-edge); background: linear-gradient(180deg, color-mix(in srgb, var(--mew-elevated) 92%, transparent), var(--mew-surface)); box-shadow: none; }
.mew-wizard-field { position: relative; display: grid; gap: 6px; min-width: 0; padding: 10px; border: 1px solid color-mix(in srgb, var(--mew-edge) 80%, transparent); background: color-mix(in srgb, var(--mew-control) 72%, transparent); transition: border-color 160ms ease, background 160ms ease, transform 160ms ease, box-shadow 160ms ease; }
.mew-wizard-field:hover, .mew-wizard-field:focus-within { border-color: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 48%, var(--mew-edge)); background: color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 6%, var(--mew-control)); transform: translateY(-1px); box-shadow: 0 10px 20px rgba(0,0,0,0.07); }
.mew-wizard-field.is-filled { border-left: 3px solid color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 74%, var(--mew-edge)); }
.mew-wizard-field > span { display: flex; align-items: center; justify-content: space-between; color: var(--mew-muted); font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-field > span em { font-style: normal; font-weight: 800; color: var(--mew-muted); }
.mew-wizard-input { width: 100%; min-height: 34px; padding: 0; border: 0; background: transparent; color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 12px; font-weight: 700; }
.mew-wizard-input::placeholder { color: color-mix(in srgb, var(--mew-muted) 72%, transparent); font-weight: 700; }
.mew-wizard-input:focus { outline: none; }
.mew-wizard-input--subject { min-height: 38px; font-size: 16px; font-weight: 900; letter-spacing: 0; }
.mew-wizard-textarea { min-height: 270px; padding: 0; line-height: 1.58; font-weight: 650; resize: vertical; }
.mew-wizard-field--body { align-content: start; }
.mew-wizard-preview { position: sticky; top: 0; display: grid; gap: 0; align-content: start; border: 1px solid var(--mew-edge); background: linear-gradient(180deg, var(--mew-elevated), color-mix(in srgb, var(--mew-control) 54%, transparent)); min-width: 0; overflow: hidden; }
.mew-wizard-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 9px 11px; border-bottom: 1px solid var(--mew-edge); background: color-mix(in srgb, var(--mew-control) 82%, transparent); }
.mew-wizard-preview-bar small, .mew-wizard-preview-bar .mew-eyebrow { min-width: 0; font-size: 9px; font-weight: 800; color: var(--mew-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-preview-toggle { display: inline-grid; grid-template-columns: repeat(2, minmax(54px, 1fr)); align-items: center; gap: 2px; flex: 0 0 auto; max-width: 100%; padding: 2px; border: 1px solid var(--mew-edge); background: var(--mew-surface); }
.mew-preview-toggle button { min-width: 0; min-height: 24px; padding: 0 8px; border: 0; background: transparent; color: var(--mew-muted); font-family: 'Raleway', sans-serif; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; transition: background 140ms ease, color 140ms ease, transform 140ms ease; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-preview-toggle button:hover { color: var(--mew-text); background: var(--mew-hover); }
.mew-preview-toggle button.is-active { color: var(--mew-ink); background: var(--mew-blue); transform: translateY(-1px); }
.mew-wizard-preview-stage { min-width: 0; padding: 12px; background: color-mix(in srgb, var(--mew-control) 72%, var(--mew-surface)); }
.mew-wizard-review { max-width: none; }
.mew-wizard-review-layout { display: grid; grid-template-columns: minmax(360px, 0.9fr) minmax(300px, 1.1fr); gap: 12px; align-items: start; }
.mew-wizard-review-main { display: grid; gap: 10px; min-width: 0; }
.mew-wizard-review-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
.mew-wizard-review-inbox { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--mew-edge); border-left: 3px solid var(--wizard-accent, var(--mew-tone)); background: var(--mew-elevated); }
.mew-wizard-review-inbox > small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-review-inbox strong { font-size: 14px; font-weight: 900; color: var(--mew-text); }
.mew-wizard-review-inbox span { font-size: 11px; font-weight: 700; color: var(--mew-muted); }
.mew-wizard-review-inbox em { font-size: 9px; font-style: normal; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: var(--wizard-accent, var(--mew-tone)); }
.mew-wizard-review-preview { display: grid; min-width: 0; border: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-wizard-review-preview .mew-device { border: 0; box-shadow: none; }
.mew-wizard-send-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mew-wizard-send-note { font-size: 10px; font-weight: 800; color: var(--mew-muted); flex: 1; min-width: 200px; }
.mew-wizard-success { display: grid; gap: 12px; align-items: start; }
.mew-wizard-lock-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: center; padding: 14px; border: 1px solid rgba(32,178,108,0.28); background: rgba(32,178,108,0.07); }
.mew-wizard-success-mark { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 4px; background: var(--mew-green); color: #ffffff; font-size: 22px; font-weight: 900; }
.mew-wizard-lock-summary small { color: var(--mew-green); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-wizard-success strong { display: block; margin-top: 2px; font-size: 18px; font-weight: 900; color: var(--mew-text); }
.mew-wizard-success p { margin: 4px 0 0; max-width: 720px; font-size: 12px; font-weight: 700; color: var(--mew-muted); line-height: 1.5; }
.mew-batch-panel { display: grid; gap: 10px; width: 100%; margin-top: 0; padding: 13px; border: 1px solid var(--mew-edge); background: var(--mew-elevated); text-align: left; }
.mew-batch-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.mew-batch-stats span { display: grid; gap: 2px; min-width: 0; padding: 8px 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-batch-stats small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-batch-stats strong { color: var(--mew-text); font-size: 16px; font-weight: 900; line-height: 1; overflow-wrap: anywhere; }
.mew-batch-route { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.mew-batch-route span { display: grid; gap: 3px; min-width: 0; padding: 8px 9px; border: 1px solid rgba(32,178,108,0.28); background: rgba(32,178,108,0.07); }
.mew-batch-route small { color: var(--mew-green); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-batch-route strong { color: var(--mew-text); font-size: 10px; font-weight: 900; line-height: 1.3; overflow-wrap: anywhere; }
.mew-batch-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
.mew-batch-warning { padding: 8px 10px; border: 1px solid rgba(214,85,65,0.38); background: rgba(214,85,65,0.08); color: var(--mew-red); font-size: 10px; font-weight: 900; }
.mew-wizard-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--mew-edge); background: var(--mew-elevated); }
.mew-wizard-foot-right { display: flex; align-items: center; gap: 8px; }
.mew-history-lane--composer { padding: 0; border: 0; }
.mew-panel-head--composer { justify-content: space-between; align-items: center; }
.mew-panel-head--composer .mew-eyebrow { margin-right: 6px; }
.mew-panel-head--composer .mew-wizard-close { margin-left: auto; }
@keyframes mewWizardFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mewWizardRise { from { opacity: 0; transform: translateY(14px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes mewComposerIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mewPreviewRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes mewSettingPulse { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 32%, transparent); } 45% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--wizard-accent, var(--mew-tone)) 13%, transparent); } 100% { box-shadow: 0 0 0 0 transparent; } }


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
.mew-device { min-width: 0; border: 1px solid color-mix(in srgb, var(--mew-edge) 82%, transparent); background: color-mix(in srgb, var(--mew-surface) 84%, var(--mew-control)); box-shadow: var(--mew-shadow); overflow: hidden; animation: mewPreviewRise 260ms ease-out both; }
.mew-device--desktop { max-width: none; }
.mew-device--ipad { max-width: 620px; }
.mew-device--mobile { width: min(100%, 340px); max-width: 340px; justify-self: end; animation-delay: 50ms; }
.mew-device-chrome { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; min-height: 30px; padding: 0 10px; background: var(--mew-blue); color: var(--mew-ink); }
.mew-device-chrome span, .mew-device-chrome em { min-width: 0; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; font-style: normal; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-device-chrome span { flex: 0 1 auto; }
.mew-device-chrome em { flex: 1 1 auto; text-align: right; }
.mew-device-message-head { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; padding: 12px; border-bottom: 1px solid var(--mew-edge); background: linear-gradient(180deg, var(--mew-surface), color-mix(in srgb, var(--mew-control) 76%, transparent)); align-items: start; }
.mew-device-avatar { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; min-width: 34px; border: 1px solid color-mix(in srgb, var(--mew-blue) 36%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-blue) 8%, var(--mew-surface)); overflow: hidden; }
.mew-device-avatar img { display: block; width: 20px; height: 20px; object-fit: contain; flex: 0 0 auto; }
.mew-device-message-copy { display: grid; gap: 3px; min-width: 0; }
.mew-device-message-copy small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-device-message-copy strong { color: var(--mew-text); font-size: 15px; font-weight: 900; line-height: 1.18; overflow-wrap: anywhere; }
.mew-device-message-copy span { color: var(--mew-muted); font-size: 10px; font-weight: 750; line-height: 1.35; overflow-wrap: anywhere; }
.mew-rendered-shell { min-width: 0; padding: 16px; background: linear-gradient(180deg, color-mix(in srgb, var(--mew-control) 86%, var(--mew-surface)), color-mix(in srgb, var(--mew-surface) 72%, #ffffff 6%)); }
.mew-rendered-frame { display: block; width: 100%; max-width: 760px; margin: 0 auto; border: 1px solid color-mix(in srgb, var(--mew-edge) 78%, rgba(17,24,39,0.16)); background: #ffffff; box-shadow: 0 14px 34px rgba(0,0,0,0.12); overflow: hidden; scrollbar-width: none; transition: height 180ms ease; }
.mew-rendered-frame::-webkit-scrollbar { display: none; }
.mew-device--mobile .mew-device-chrome em { display: none; }
.mew-device--mobile .mew-device-message-head { grid-template-columns: 28px minmax(0, 1fr); gap: 8px; padding: 10px; }
.mew-device--mobile .mew-device-avatar { width: 28px; height: 28px; min-width: 28px; }
.mew-device--mobile .mew-device-avatar img { width: 17px; height: 17px; }
.mew-device--mobile .mew-device-message-copy strong { font-size: 13px; }
.mew-device--mobile .mew-device-message-copy span { font-size: 9px; }
.mew-device--ipad .mew-rendered-shell { padding: 12px; }
.mew-device--mobile .mew-rendered-shell { padding: 8px; }
.mew-processing-window { min-height: 132px; }
.mew-processing-head { background: var(--mew-elevated); }
.mew-processing-empty { min-height: 84px; display: grid; place-items: center; background: linear-gradient(90deg, transparent, var(--mew-control), transparent); }
.mew-processing-pulse { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--mew-tone); background: var(--mew-control); box-shadow: 0 0 0 0 color-mix(in srgb, var(--mew-tone) 25%, transparent); animation: mewProcessingPulse 1800ms ease-in-out infinite; opacity: 0.72; }
.mew-processing-feed { display: grid; gap: 0; max-height: 220px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.mew-processing-feed::-webkit-scrollbar { display: none; }
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
.mew-panel-head.mew-history-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: center; padding-left: 13px; padding-right: 13px; }
.mew-history-head-main { display: flex; align-items: center; gap: 10px; min-width: 0; padding-right: 12px; }
.mew-history-head-detail { display: flex; align-items: center; min-width: 0; padding-left: 12px; }
.mew-history-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; padding: 12px 13px 13px; align-items: stretch; }
.mew-history-grid.is-composing { grid-template-columns: minmax(0, 1fr); }
.mew-history-lane { min-width: 0; }
.mew-history-lane--stack { padding-right: 12px; border-right: 1px solid color-mix(in srgb, var(--mew-edge) 82%, transparent); overflow: hidden; }
.mew-history-lane--detail { padding-left: 12px; }
.mew-campaign-stack { display: grid; gap: 8px; align-content: start; min-width: 0; }
.mew-campaign-ledger-head { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(64px, 0.44fr) minmax(64px, 0.44fr) minmax(86px, 0.56fr); gap: 8px; align-items: center; padding: 0 10px 6px 11px; border-bottom: 1px solid color-mix(in srgb, var(--mew-edge) 85%, transparent); color: var(--mew-muted); font-size: 8px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; }
.mew-campaign-create-stage { display: grid; gap: 6px; align-content: start; padding: 12px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-campaign-create-stage strong { color: var(--mew-text); font-size: 14px; font-weight: 900; }
.mew-campaign-create-stage small { color: var(--mew-muted); font-size: 10px; font-weight: 700; line-height: 1.45; }
.mew-campaign-card { --campaign-accent: var(--mew-blue); position: relative; display: grid; grid-template-columns: auto minmax(0, 1.9fr) minmax(64px, 0.44fr) minmax(64px, 0.44fr) minmax(86px, 0.56fr); gap: 8px; align-items: stretch; width: 100%; min-width: 0; padding: 9px 10px 9px 11px; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--mew-edge) 82%, transparent); background: transparent; color: var(--mew-text); text-align: left; font-family: inherit; cursor: pointer; overflow: hidden; transition: background 140ms ease; }
.mew-campaign-card::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 2px; background: var(--campaign-accent); opacity: 0.72; }
.mew-campaign-card:hover { background: color-mix(in srgb, var(--mew-hover) 45%, transparent); }
.mew-campaign-card.is-active { background: color-mix(in srgb, var(--campaign-accent) 10%, var(--mew-surface)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--campaign-accent) 28%, transparent); }
.mew-campaign-ledger-glyph { display: flex; align-items: stretch; justify-content: center; flex-shrink: 0; align-self: stretch; }
.mew-campaign-ledger-glyph-icon { display: flex; align-items: center; justify-content: center; width: 18px; height: 100%; }
.mew-campaign-ledger-glyph-icon svg { width: 100%; height: 100%; max-width: 18px; max-height: 100%; }
.mew-campaign-card-main { display: grid; gap: 2px; min-width: 0; }
.mew-campaign-card-context { display: inline; min-width: 0; }
.mew-campaign-card-context em { color: var(--mew-muted); font-size: 8px; font-style: normal; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-campaign-card-main strong { color: var(--mew-text); font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-campaign-ledger-metric { display: inline-flex; align-items: center; justify-content: flex-start; min-width: 0; }
.mew-campaign-ledger-metric strong { color: var(--mew-text); font-size: 12px; font-weight: 900; line-height: 1; white-space: nowrap; }
.mew-campaign-card-meta { display: inline-flex; align-items: center; justify-content: flex-start; min-width: 0; }
.mew-campaign-card-meta em { font-size: 9px; font-style: normal; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
.mew-campaign-stack-empty { min-height: 116px; display: grid; place-items: center; padding: 12px; border: 1px dashed var(--mew-edge); background: color-mix(in srgb, var(--mew-elevated) 60%, var(--mew-surface)); color: var(--mew-muted); font-size: 10px; font-weight: 800; text-align: center; }
/* ─── Campaign recap pane ─── */
.mew-campaign-detail { min-width: 0; padding: 2px 0 0; border: 0; background: transparent; }
.mew-campaign-detail--empty { padding: 0; border: 0; background: transparent; box-shadow: none; }
.mew-campaign-detail.mew-history-lane--detail { box-shadow: none; }
.mew-campaign-workspace-tools { width: min(100%, 520px); max-width: calc(100% - 24px); padding: 0; margin: 0 auto; }
.mew-campaign-detail-head { display: grid; gap: 5px; min-width: 0; padding: 0; }
.mew-campaign-detail-head--quiet { box-shadow: none; border-bottom: 0; padding: 0; }
.mew-campaign-empty-divider { position: relative; z-index: 1; width: 100%; max-width: 360px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 14px; color: var(--mew-muted); opacity: 0.72; margin: 18px auto 20px; }
.mew-campaign-empty-divider span { height: 1px; background: color-mix(in srgb, var(--mew-edge) 72%, transparent); }
.mew-campaign-empty-divider strong { font-size: 9px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }
.mew-campaign-recap { display: grid; gap: 14px; min-width: 0; }

/* Hero row: glyph + name + subject */
.mew-recap-hero { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-items: stretch; gap: 9px; padding-bottom: 12px; border-bottom: 1px solid color-mix(in srgb, var(--mew-edge) 60%, transparent); }
.mew-recap-glyph { display: flex; align-items: stretch; justify-content: center; width: 26px; align-self: stretch; color: var(--campaign-accent, var(--mew-blue)); flex-shrink: 0; }
.mew-recap-glyph-icon { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 100%; }
.mew-recap-glyph-icon svg { width: 100%; height: 100%; max-width: 20px; max-height: 100%; }
.mew-recap-title { display: grid; gap: 3px; min-width: 0; }
.mew-recap-title strong { color: var(--mew-text); font-size: 15px; font-weight: 900; line-height: 1.1; overflow-wrap: break-word; hyphens: auto; }
.mew-recap-title small { color: var(--mew-muted); font-size: 10px; font-weight: 700; line-height: 1.4; overflow-wrap: break-word; }

/* Sender identity */
.mew-recap-sender { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 9px; align-items: center; min-width: 0; }
.mew-recap-sender-avatar { width: 26px; height: 26px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--mew-blue) 28%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-blue) 8%, var(--mew-elevated)); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.mew-recap-sender-logo { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 6px; background: transparent; overflow: hidden; padding: 2px; }
.mew-recap-sender-body { display: grid; gap: 2px; min-width: 0; }
.mew-recap-sender-body small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }

/* KPI counts */
.mew-recap-counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0; padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--mew-edge) 60%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--mew-edge) 60%, transparent); }
.mew-recap-counts span { display: grid; gap: 3px; min-width: 0; padding: 0 0 0 12px; border-left: 1px solid color-mix(in srgb, var(--mew-edge) 60%, transparent); }
.mew-recap-counts span:first-child { padding-left: 0; border-left: 0; }
.mew-recap-counts strong { color: var(--mew-text); font-size: 20px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.mew-recap-counts small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; }

/* Lifecycle timeline */
.mew-recap-timeline { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
.mew-recap-timeline-step { display: grid; gap: 4px; min-width: 0; padding: 0; }
.mew-recap-timeline-step.is-complete .mew-recap-timeline-icon { color: var(--mew-blue); }
.mew-recap-timeline-step.is-current .mew-recap-timeline-icon { color: var(--mew-text); }
.mew-recap-timeline-icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; color: var(--mew-muted); }
.mew-recap-timeline-copy { display: grid; gap: 2px; min-width: 0; }
.mew-recap-timeline small { color: var(--mew-muted); font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
.mew-recap-timeline strong { color: var(--mew-text); font-size: 10px; font-weight: 800; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-recap-timeline em { color: var(--mew-muted); font-size: 9px; font-style: normal; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Status footer */
.mew-recap-footer { display: flex; align-items: center; gap: 10px; min-width: 0; padding-top: 2px; }
.mew-recap-status { display: inline-flex; align-items: center; gap: 5px; color: var(--status-tone, var(--mew-muted)); flex-shrink: 0; }
.mew-recap-status strong { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: inherit; }
.mew-recap-key { margin-left: auto; color: var(--mew-muted); font-size: 8px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.62; }
.mew-campaign-create-cue { gap: 7px; }
.mew-campaign-create-cue .mew-mini-action { justify-self: start; }
.mew-campaign-empty { min-height: 100%; display: grid; align-content: center; justify-items: center; gap: 10px; padding: 12px; text-align: center; }
.mew-campaign-empty-head { display: grid; gap: 5px; max-width: 360px; }
.mew-campaign-empty-head strong { color: var(--mew-text); font-size: 15px; font-weight: 800; letter-spacing: 0.01em; }
.mew-campaign-empty-head small { color: var(--mew-muted); font-size: 11px; font-weight: 700; line-height: 1.45; }
.mew-campaign-empty-divider { width: 100%; max-width: 360px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 9px; color: var(--mew-muted); opacity: 0.72; }
.mew-campaign-empty-divider span { height: 1px; background: color-mix(in srgb, var(--mew-muted) 35%, transparent); }
.mew-campaign-empty-divider em { font-style: normal; font-size: 9px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
.mew-campaign-empty-action { width: 100%; max-width: 360px; min-height: 44px; display: grid; gap: 3px; justify-items: start; padding: 9px 11px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-family: 'Raleway', sans-serif; text-align: left; cursor: pointer; transition: border-color 160ms ease, background 160ms ease, transform 140ms ease; }
.mew-campaign-empty-action:hover:not(:disabled) { border-color: var(--mew-tone); background: var(--mew-hover); transform: translateY(-1px); }
.mew-campaign-empty-action:disabled { opacity: 0.72; cursor: default; }
.mew-campaign-empty-label { font-size: 12px; font-weight: 800; color: var(--mew-text); }
.mew-campaign-empty-hint { font-size: 10px; font-weight: 700; color: var(--mew-muted); line-height: 1.4; }
.mew-campaign-empty-choices { width: 100%; max-width: 360px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.mew-campaign-empty-choice { min-height: 52px; display: grid; gap: 3px; align-content: center; justify-items: start; text-align: left; padding: 8px 10px; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); font-family: 'Raleway', sans-serif; cursor: pointer; transition: border-color 160ms ease, background 160ms ease, transform 140ms ease; }
.mew-campaign-empty-choice:hover:not(:disabled) { border-color: var(--mew-tone); background: var(--mew-hover); transform: translateY(-1px); }
.mew-campaign-empty-choice:disabled { cursor: default; opacity: 0.72; }
.mew-campaign-empty-choice span { font-size: 12px; font-weight: 800; color: var(--mew-text); }
.mew-campaign-empty-choice small { font-size: 10px; font-weight: 700; color: var(--mew-muted); line-height: 1.35; }
.mew-campaign-quiet-rows { display: grid; gap: 7px; align-content: start; }
.mew-campaign-quiet-rows span { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 10px; align-items: center; min-width: 0; padding: 8px 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-campaign-quiet-rows small { color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; }
.mew-campaign-quiet-rows strong { color: var(--mew-text); font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-panel { border: 1px solid var(--mew-edge); background: var(--mew-surface); box-shadow: var(--mew-shadow); min-width: 0; }
.mew-panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 11px 13px; border-bottom: 1px solid var(--mew-edge); transition: background 200ms ease, border-color 200ms ease; }
.mew-panel-head strong { font-size: 14px; font-weight: 900; }
.mew-panel-actions { display: inline-flex; align-items: center; gap: 9px; margin-left: auto; flex-wrap: wrap; }

.mew-search-shell { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; min-width: 180px; padding: 0 9px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease; }
.mew-search-shell:focus-within { border-color: var(--mew-tone); background: color-mix(in srgb, var(--mew-control) 88%, var(--mew-tone)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--mew-tone) 38%, transparent); color: var(--mew-tone); }
.mew-search { flex: 1 1 auto; min-width: 0; min-height: 28px; padding: 0; border: 0; background: transparent; color: var(--mew-text); font-size: 11px; font-weight: 800; letter-spacing: 0.01em; }
.mew-search::placeholder { color: var(--mew-muted); font-weight: 700; opacity: 0.9; }
.mew-search:focus { outline: none; }

.mew-proof { display: flex; flex-direction: column; position: relative; z-index: 1; border-top: 1px solid transparent; }
.mew-proof .mew-table-wrap--compact, .mew-proof .mew-proof-empty { max-height: calc(13 * 24px); overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.mew-proof-growth { display: grid; grid-template-columns: minmax(150px, 0.85fr) minmax(0, 2fr) minmax(150px, 0.85fr); gap: 14px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--mew-edge); background: var(--mew-surface); }
.mew-proof-growth-lead { display: grid; gap: 2px; min-width: 0; }
.mew-proof-growth-lead strong { font-size: 20px; font-weight: 900; color: var(--mew-text); line-height: 1; }
.mew-proof-growth-lead small { font-size: 10px; font-weight: 700; color: var(--mew-muted); }
.mew-proof-growth-bars { display: flex; align-items: flex-end; gap: 4px; height: 64px; min-width: 0; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.mew-proof-growth-bars::-webkit-scrollbar { display: none; }
.mew-proof-growth .mew-growth-bar { display: grid; grid-template-rows: auto 1fr auto; align-items: end; justify-items: center; gap: 2px; min-width: 24px; flex: 1 1 0; height: 100%; }
.mew-proof-growth .mew-growth-bar b { font-size: 8px; font-weight: 900; color: var(--mew-muted); }
.mew-proof-growth .mew-growth-bar i { display: block; width: 100%; max-width: 22px; min-height: 3px; background: linear-gradient(180deg, var(--mew-tone), color-mix(in srgb, var(--mew-tone) 55%, transparent)); border-radius: 2px 2px 0 0; transition: height 240ms cubic-bezier(0.22, 0.61, 0.36, 1); }
.mew-proof-growth .mew-growth-bar em { font-size: 7px; font-style: normal; font-weight: 800; color: var(--mew-muted); white-space: nowrap; border-top: 0; padding-top: 0; }
.mew-proof-growth-empty { font-size: 10px; font-weight: 700; color: var(--mew-muted); align-self: center; }
.mew-proof-growth-meta { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.mew-proof-growth-meta span { display: grid; gap: 1px; padding: 6px 8px; border: 1px solid var(--mew-edge); background: var(--mew-control); }
.mew-proof-growth-meta small { font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mew-muted); }
.mew-proof-growth-meta strong { font-size: 12px; font-weight: 900; color: var(--mew-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mew-ledger-date { font-size: 9px; font-weight: 800; color: var(--mew-muted); white-space: nowrap; }
.mew-ledger-touchpoint-cell { padding-left: 3px; padding-right: 3px; }
.mew-ledger-identity { display: flex; align-items: center; gap: 5px; min-width: 0; }
.mew-ledger-expand { width: 18px; height: 18px; flex: 0 0 18px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); padding: 0; cursor: pointer; transition: background 140ms ease, border-color 140ms ease, color 140ms ease; }
.mew-ledger-expand:hover { background: var(--mew-hover); border-color: var(--mew-tone); color: var(--mew-text); }
.mew-ledger-expand svg { transition: transform 140ms ease; }
.mew-ledger-expand.is-open svg { transform: rotate(90deg); }
.mew-ledger-row.is-expanded { background: color-mix(in srgb, var(--mew-hover) 42%, transparent); }
.mew-ledger-touchpoint { display: grid; gap: 2px; font-size: 8px; font-weight: 800; color: var(--mew-muted); letter-spacing: 0.01em; white-space: nowrap; }
.mew-ledger-touchpoint-line { display: flex; align-items: center; gap: 4px; }
.mew-ledger-touchpoint-line strong { font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: var(--mew-text); }
.mew-ledger-subscription-cell { white-space: nowrap; }
.mew-ledger-subscription-date { font-size: 8px; font-weight: 850; color: var(--mew-muted); letter-spacing: 0.01em; }
.mew-ledger-status { font-size: 8px; font-weight: 800; color: var(--mew-muted); text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
.mew-ledger-tray-row td { padding: 0 !important; background: color-mix(in srgb, var(--mew-surface) 88%, var(--mew-control)); border-top: 1px solid color-mix(in srgb, var(--mew-tone) 32%, var(--mew-edge)); }
.mew-ledger-history-tray { display: grid; gap: 9px; padding: 10px 12px 12px 30px; border-left: 3px solid color-mix(in srgb, var(--mew-tone) 58%, var(--mew-edge)); }
.mew-ledger-history-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mew-ledger-history-head div { min-width: 0; display: grid; gap: 2px; }
.mew-ledger-history-head span { color: var(--mew-muted); font-size: 8px; font-weight: 900; letter-spacing: 0.09em; text-transform: uppercase; }
.mew-ledger-history-head strong { color: var(--mew-text); font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-ledger-history-refresh { min-height: 24px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); padding: 0 8px; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; cursor: pointer; }
.mew-ledger-history-refresh:hover:not(:disabled) { background: var(--mew-hover); border-color: var(--mew-tone); }
.mew-ledger-history-refresh:disabled { opacity: 0.58; cursor: default; }
.mew-ledger-history-body { min-height: 44px; }
.mew-ledger-history-loading { display: grid; gap: 6px; }
.mew-ledger-history-loading span { height: 22px; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--mew-tone) 16%, transparent), transparent); border: 1px solid var(--mew-edge); animation: mewSkeletonPulse 1100ms ease-in-out infinite; }
.mew-ledger-history-empty { min-height: 52px; display: grid; align-content: center; gap: 4px; padding: 9px 10px; border: 1px dashed var(--mew-edge); color: var(--mew-muted); }
.mew-ledger-history-empty strong { color: var(--mew-text); font-size: 10px; font-weight: 900; }
.mew-ledger-history-empty span { font-size: 9px; font-weight: 700; }
.mew-ledger-history-empty.is-error { border-color: color-mix(in srgb, var(--mew-danger, #b42318) 46%, var(--mew-edge)); }
.mew-ledger-history-list { position: relative; display: grid; gap: 0; padding-left: 18px; }
.mew-ledger-history-list::before { content: ''; position: absolute; left: 6px; top: 12px; bottom: 12px; width: 1px; background: color-mix(in srgb, var(--mew-edge) 72%, transparent); }
.mew-ledger-history-item { position: relative; padding: 0 0 7px 0; }
.mew-ledger-history-dot { position: absolute; left: -16px; top: 13px; width: 9px; height: 9px; border: 2px solid var(--mew-surface); background: var(--mew-tone); box-shadow: 0 0 0 1px color-mix(in srgb, var(--mew-tone) 40%, transparent); }
.mew-ledger-history-item.is-pending .mew-ledger-history-dot { background: color-mix(in srgb, var(--mew-muted) 78%, var(--mew-tone)); }
.mew-ledger-history-item.is-held .mew-ledger-history-dot { background: color-mix(in srgb, var(--mew-yellow, #f59e0b) 72%, var(--mew-muted)); }
.mew-ledger-history-item.is-failed .mew-ledger-history-dot { background: var(--mew-danger, #b42318); }
.mew-ledger-history-card { display: grid; gap: 4px; padding: 8px 9px; border: 1px solid var(--mew-edge); background: color-mix(in srgb, var(--mew-control) 62%, transparent); }
.mew-ledger-history-card header, .mew-ledger-history-card footer { display: flex; align-items: center; gap: 7px; min-width: 0; }
.mew-ledger-history-card header { justify-content: space-between; }
.mew-ledger-history-card header span { display: inline-flex; align-items: center; gap: 5px; color: var(--mew-muted); font-size: 8px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
.mew-ledger-history-card time { color: var(--mew-muted); font-size: 8px; font-weight: 850; white-space: nowrap; }
.mew-ledger-history-card strong { color: var(--mew-text); font-size: 11px; font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-ledger-history-card p { margin: 0; color: var(--mew-body); font-size: 10px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mew-ledger-history-card footer { flex-wrap: wrap; color: var(--mew-muted); font-size: 8px; font-weight: 800; }
.mew-ledger-history-state { display: inline-flex; align-items: center; min-height: 16px; padding: 0 6px; border: 1px solid var(--mew-edge); color: var(--mew-text); text-transform: uppercase; letter-spacing: 0.03em; }
.mew-ledger-history-state.is-sent { border-color: color-mix(in srgb, var(--mew-tone) 52%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-tone) 11%, transparent); }
.mew-ledger-history-state.is-pending { background: color-mix(in srgb, var(--mew-muted) 9%, transparent); }
.mew-ledger-history-state.is-held { border-color: color-mix(in srgb, var(--mew-yellow, #f59e0b) 44%, var(--mew-edge)); }
.mew-ledger-history-state.is-failed { border-color: color-mix(in srgb, var(--mew-danger, #b42318) 52%, var(--mew-edge)); color: color-mix(in srgb, var(--mew-danger, #b42318) 82%, var(--mew-text)); }
.mew-ledger-matter { font-size: 8px; font-weight: 800; color: var(--mew-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: inline-block; max-width: 100%; }
.mew-qual-pill { display: inline-flex; align-items: center; gap: 5px; min-height: 16px; padding: 1px 7px; border: 1px solid; border-radius: 999px; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
.mew-state-chip { display: inline-flex; align-items: center; min-height: 17px; padding: 1px 7px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-muted); font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap; }
.mew-state-chip.is-client { border-color: color-mix(in srgb, var(--mew-tone) 48%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-tone) 10%, var(--mew-control)); color: var(--mew-text); }
.mew-state-chip.is-prospect { background: transparent; }
.mew-state-chip--outcome { border-color: color-mix(in srgb, var(--chip-tone) 45%, var(--mew-edge)); background: color-mix(in srgb, var(--chip-tone) 10%, transparent); color: color-mix(in srgb, var(--chip-tone) 78%, var(--mew-text)); }
.mew-tag { font-size: 8px; font-weight: 800; padding: 1px 5px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-body); }
.mew-tag--muted { color: var(--mew-muted); background: transparent; }
.mew-qual-pill .mew-dot { border-radius: 50%; }
.mew-area-cell { display: inline-flex; align-items: center; gap: 6px; min-width: 0; width: 100%; }
.mew-area-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; }
html[data-show-scrollbars="1"] .mew-proof .mew-table-wrap--compact,
html[data-show-scrollbars="1"] .mew-proof-growth-bars,
html[data-show-scrollbars="1"] .mew-processing-feed { scrollbar-width: thin; scrollbar-color: var(--mew-tone) transparent; -ms-overflow-style: auto; }
html[data-show-scrollbars="1"] .mew-proof .mew-table-wrap--compact::-webkit-scrollbar,
html[data-show-scrollbars="1"] .mew-proof-growth-bars::-webkit-scrollbar,
html[data-show-scrollbars="1"] .mew-processing-feed::-webkit-scrollbar { display: block; width: 9px; height: 9px; }
html[data-show-scrollbars="1"] .mew-proof .mew-table-wrap--compact::-webkit-scrollbar-thumb,
html[data-show-scrollbars="1"] .mew-proof-growth-bars::-webkit-scrollbar-thumb,
html[data-show-scrollbars="1"] .mew-processing-feed::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--mew-tone) 70%, transparent); border-radius: 5px; }
.mew-proof .mew-table-wrap--compact::-webkit-scrollbar, .mew-proof .mew-proof-empty::-webkit-scrollbar { display: none; }
.mew-proof .mew-table--compact { font-size: 10px; table-layout: auto; border-collapse: separate; border-spacing: 0; }
.mew-proof .mew-table--compact th, .mew-proof .mew-table--compact td { padding: 3px 6px; line-height: 14px; }
.mew-proof .mew-table--compact thead th { position: sticky; z-index: 3; background-clip: padding-box; }
.mew-proof .mew-table--compact thead tr:first-child th { top: 0; z-index: 4; font-size: 9px; border-bottom: 1px solid color-mix(in srgb, var(--mew-blue) 72%, var(--mew-edge)); box-shadow: 0 1px 0 color-mix(in srgb, var(--mew-edge) 80%, transparent); }
.mew-proof .mew-table--compact thead tr:first-child th.is-sorted { background: color-mix(in srgb, var(--mew-blue) 88%, var(--mew-tone)); }
.mew-proof .mew-table--compact thead tr.mew-table-filter-row th { top: 28px; background: var(--mew-surface); border-bottom: 1px solid var(--mew-edge); color: var(--mew-muted); box-shadow: 0 1px 0 var(--mew-edge); }
.mew-table-sort { position: relative; display: inline-flex; width: 100%; align-items: center; gap: 5px; padding: 0 12px 0 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; text-align: left; }
.mew-table-sort::after { content: ''; position: absolute; right: 0; top: 50%; width: 0; height: 0; opacity: 0.45; transform: translateY(-50%); border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 5px solid currentColor; }
.mew-proof .mew-table--compact th.is-sorted-asc .mew-table-sort::after { transform: translateY(-50%) rotate(180deg); opacity: 0.95; }
.mew-proof .mew-table--compact th.is-sorted-desc .mew-table-sort::after { opacity: 0.95; }
.mew-table-filter-combo { display: grid; grid-template-columns: minmax(74px, 0.88fr) minmax(58px, 1fr); gap: 3px; align-items: center; }
.mew-table-filter { width: 100%; min-width: 48px; height: 20px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 8px; font-weight: 800; padding: 0 4px; }
.mew-table-filter--operator { color: var(--mew-muted); }
.mew-table-filter:focus { outline: none; border-color: var(--mew-tone); background: var(--mew-surface); }
.mew-proof .mew-table--compact tbody tr:hover { background: var(--mew-hover); }
.mew-operations-status { display: grid; gap: 0; }
.mew-operations-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; padding: 12px 13px 13px; align-items: stretch; }
.mew-operations-grid > .mew-processing-window, .mew-operations-grid > .mew-sendgrid-bridge { border: 1px solid var(--mew-edge); background: var(--mew-elevated); min-width: 0; }
.mew-operations-empty { min-height: 84px; display: grid; place-items: center; padding: 12px; color: var(--mew-muted); font-size: 10px; font-weight: 800; text-align: center; background: var(--mew-control); }
.mew-proof-toggle { min-height: 28px; display: inline-flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid var(--mew-edge); background: var(--mew-control); color: var(--mew-text); cursor: pointer; font-family: 'Raleway', sans-serif; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; transition: border-color 160ms ease, background 160ms ease; }
.mew-proof-toggle:hover { border-color: var(--mew-tone); background: var(--mew-hover); }
.mew-proof-toggle-mark { position: relative; width: 14px; height: 14px; border: 1px solid var(--mew-edge); border-radius: 50%; transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), border-color 160ms ease; }
.mew-proof-toggle-mark::before, .mew-proof-toggle-mark::after { content: ''; position: absolute; left: 3px; right: 3px; top: 6px; height: 1px; background: var(--mew-tone); transition: transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 160ms ease; }
.mew-proof-toggle-mark::after { transform: rotate(90deg); }
.mew-proof-toggle[aria-expanded="true"] .mew-proof-toggle-mark { transform: rotate(180deg); border-color: var(--mew-tone); }
.mew-proof-toggle[aria-expanded="true"] .mew-proof-toggle-mark::after { opacity: 0; transform: rotate(0); }
.mew-mini-action { min-height: 28px; padding: 0 9px; border: 1px solid var(--mew-edge); background: var(--mew-surface); color: var(--mew-text); font-family: 'Raleway', sans-serif; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
.mew-mini-action:hover:not(:disabled) { background: var(--mew-hover); border-color: var(--mew-tone); }
.mew-mini-action.is-active { border-color: color-mix(in srgb, var(--mew-tone) 52%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-hover) 52%, transparent); color: color-mix(in srgb, var(--mew-tone) 72%, var(--mew-text)); }
.mew-mini-action.is-danger-active { border-color: color-mix(in srgb, var(--mew-danger, #b42318) 62%, var(--mew-edge)); background: color-mix(in srgb, var(--mew-danger, #b42318) 13%, var(--mew-surface)); color: color-mix(in srgb, var(--mew-danger, #b42318) 82%, var(--mew-text)); }
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
.mew-ledger-name { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 900; color: var(--mew-text); }
.mew-id strong { font-size: 12px; font-weight: 900; color: var(--mew-text); }
.mew-id small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8px; font-weight: 750; color: var(--mew-muted); }

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
  .mew-streams { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mew-cockpit { grid-template-columns: 1fr; }
  .mew-header { flex-direction: column; align-items: flex-start; }
  .mew-header-side { width: 100%; justify-content: flex-start; }
}
@media (max-width: 920px) {
  .mew-compose { grid-template-columns: minmax(280px, var(--compose-left)) 8px minmax(280px, 1fr); }
  .mew-readiness { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mew-total-card { grid-column: 1 / -1; }
  .mew-area-focus-body { grid-template-columns: 1fr; }
  .mew-area-focus-breakdown { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-sendgrid-body { grid-template-columns: 1fr; }
  .mew-sendgrid-facts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-panel-head.mew-history-head { grid-template-columns: 1fr; gap: 6px; }
  .mew-history-head-main, .mew-history-head-detail { padding-left: 0; padding-right: 0; }
  .mew-history-grid { grid-template-columns: 1fr; }
  .mew-history-lane--stack { padding-right: 0; border-right: 0; }
  .mew-history-lane--detail { padding-left: 0; }
  .mew-campaign-detail.mew-history-lane--detail { box-shadow: none; }
  .mew-campaign-ledger-head { display: none; }
  .mew-campaign-card { grid-template-columns: auto minmax(0, 1.6fr) repeat(3, minmax(62px, 0.48fr)); }
  .mew-recap-sender { grid-template-columns: auto minmax(0, 1fr); }
  .mew-recap-counts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-recap-timeline { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-wizard-copy-split { grid-template-columns: 1fr; }
  .mew-wizard-copy-resizer { display: none; }
  .mew-wizard-preview { position: static; }
  .mew-wizard-steps { display: none; }
  .mew-wizard-audience-board { grid-template-columns: 1fr; gap: 10px; }
  .mew-wizard-batch-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-wizard-review-layout { grid-template-columns: 1fr; }
  .mew-compose-sender-copy { grid-template-columns: 1fr; gap: 10px; }
  .mew-compose-sender-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .mew-compose { grid-template-columns: minmax(240px, var(--compose-left)) 8px minmax(240px, 1fr); }
  .mew-readiness { grid-template-columns: 1fr; }
  .mew-streams { grid-template-columns: 1fr; }
  .mew-total-children { grid-template-columns: 1fr; }
  .mew-area-focus-mix { flex-wrap: wrap; gap: 10px; }
  .mew-area-focus-head { align-items: flex-start; flex-wrap: wrap; }
  .mew-area-focus-head .mew-mini-action { width: 100%; }
  .mew-area-focus-breakdown { grid-template-columns: 1fr 1fr; }
  .mew-campaign-card { grid-template-columns: auto 1fr; gap: 6px; padding: 10px 10px 10px 11px; }
  .mew-campaign-ledger-area, .mew-campaign-ledger-metric, .mew-campaign-card-meta { justify-content: flex-start; }
  .mew-recap-sender { grid-template-columns: 1fr; gap: 6px; }
  .mew-recap-counts { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mew-recap-timeline { grid-template-columns: 1fr; gap: 8px; }
  .mew-recap-timeline span { padding-left: 0; border-left: 0; }
  .mew-device-pair { grid-template-columns: minmax(0, 1fr) minmax(130px, 0.68fr); }
  .mew-wizard-copy-split { grid-template-columns: minmax(0, 1fr); }
  .mew-wizard-copy-resizer { display: none; }
  .mew-wizard-preview { position: relative; top: auto; }
  .mew-device--mobile { justify-self: stretch; width: 100%; max-width: none; }
  .mew-sendgrid-facts { grid-template-columns: 1fr; }
  .mew-setup-switch { margin-left: 0; }
  .mew-setup-field { min-width: 100%; }
  .mew-wizard-audience-hero { grid-template-columns: auto minmax(0, 1fr); }
  .mew-wizard-audience-count { grid-column: 1 / -1; justify-items: start; }
  .mew-wizard-audience-metrics, .mew-batch-stats, .mew-batch-route { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mew-wizard-batch-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mew-compose-sender { grid-template-columns: 1fr; align-items: start; gap: 8px; }
  .mew-compose-sender-settings { grid-template-columns: 1fr; }
}
`;

export default MarketingEmailWorkbench;
