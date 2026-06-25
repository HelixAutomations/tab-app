import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DefaultButton } from '@fluentui/react/lib/Button';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../../Reporting/styles/reportingFoundation';
import { getApiUrl } from '../../../utils/getApiUrl';
import { getAreaGlyphMeta, renderAreaOfWorkGlyph } from '../../../components/filter/areaGlyphs';
import { getNormalizedEnquiryMOC } from '../../../utils/enquirySource';
import MarketingTimelineWorkbench, { type MarketingTimelineDay, type MarketingTimelineMonth, type MarketingTimelineTotals, type MarketingTimelineWeek } from './MarketingTimelineWorkbench';
import MarketingEmailWorkbench from './MarketingEmailWorkbench';
import '../../Reporting/components/DataHubDatasetDetail.css';
import '../../Reporting/components/DataHubDatasetPicker.css';

type MarketingWorkspaceMatch = {
  sourceChannel?: 'seo' | 'ppc' | 'email' | 'other';
  sourceValue?: string;
  enquiryId?: string;
  acid?: string;
  pitchEnquiryId?: string;
  legacyEnquiryId?: string;
  processingEnquiryId?: string;
  dealId?: string;
  prospectId?: string;
  instructionRef?: string;
  matterRef?: string;
  matterId?: string;
  clientId?: string;
  email?: string;
  billId?: string;
};

export type MarketingWorkspaceRow = {
  id: string;
  sortTs: number;
  primary: string;
  secondary: string;
  status: string;
  owner: string;
  timestamp: string;
  value: string;
  detail: string;
  match?: MarketingWorkspaceMatch;
};

export type MarketingSearchAttributionValue = {
  searchEnquiries?: {
    organicSearch: number;
    paidSearch: number;
    totalSearch: number;
    byMethod?: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { calls: number; webforms: number; other: number; total: number }>;
  };
  searchMatters: { organicSearch: number; paidSearch: number; total: number };
  spendAssumption?: { ppcSpend: number; seoEstimate: number; totalEstimatedSearchSpend: number; seoBasis: string };
  collected: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { collected: number; payments: number; mattersWithCollected: number }>;
  upfrontPayments: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { amount: number; payments: number; mattersWithPayments: number }>;
  chargeableWip: Record<'organicSearch' | 'paidSearch' | 'totalSearch', { amount: number; rows: number; mattersWithWip: number }>;
  combinedCollectedAndUpfront: Record<'organicSearch' | 'paidSearch' | 'totalSearch', number>;
};

export type MarketingWorkspacePageKey = MarketingChannelKey | 'email';

type MarketingPerformanceWorkspaceProps = {
  isDarkMode: boolean;
  googleAnalyticsRows: unknown[];
  googleAdsRows: unknown[];
  ledgerRowsByTab: Partial<Record<string, MarketingWorkspaceRow[]>>;
  isBlueprintMode?: boolean;
  reportingWindowTitle?: string;
  reportingWindowModeLabel?: string;
  reportingWindowFeedLabel?: string;
  reportingWindowLockLabel?: string;
  reportingWindowStatusColour?: string;
  timelineRangeLabel?: string;
  timelineRangeStartTs: number;
  timelineRangeEndTs: number;
  timelineStatusLabel?: string;
  timelineIsProcessing?: boolean;
  searchAttributionValue?: MarketingSearchAttributionValue | null;
  searchAttributionStatus?: 'idle' | 'loading' | 'ready' | 'error';
  operatorName?: string;
  operatorInitials?: string;
  operatorEmail?: string;
  activePage?: MarketingWorkspacePageKey | null;
  onActivePageChange?: (page: MarketingWorkspacePageKey | null) => void;
  showDevDraftSurfaces?: boolean;
  demoModeEnabled?: boolean;
};

type ChannelMetric = {
  label: string;
  value: string;
  detail: string;
};

type SeoContentSnapshotStatus = {
  key: string;
  label: string;
  count: number;
  detail: string;
};

type SeoContentSnapshotList = {
  key: string;
  label: string;
  total: number;
  statuses: SeoContentSnapshotStatus[];
};

type SeoAnalyticsTrendRow = {
  key: string;
  label: string;
  sessions: number;
  enquiries: number;
  matters: number;
  value: number;
};

type PpcAnalyticsTrendRow = {
  key: string;
  label: string;
  spend: number;
  clicks: number;
  conversions: number;
  enquiries: number;
  matters: number;
  value: number;
  rows: number;
};

type MarketingValueSheetRow = {
  key: MarketingValueSheetRowKey;
  source: string;
  activityLabel: string;
  activityValue: string;
  enquiries: number;
  matters: number;
  spend: number;
  received: number;
  wip: number;
  totalValue: number;
  accent: string;
};

type MarketingValueSheetRowKey = 'organicSearch' | 'paidSearch' | 'emailMarketing' | 'totalSearch';
type MarketingValueSheetMetricKey = 'activity' | 'enquiries' | 'matters' | 'spend' | 'received' | 'wip' | 'totalValue';
type MarketingValueSheetCellKey = 'source' | MarketingValueSheetMetricKey;

type MarketingValueSheetTraySelection = {
  rowKey: MarketingValueSheetRowKey;
  metricKey: MarketingValueSheetCellKey;
};

type MarketingValueSheetHoverSelection = MarketingValueSheetTraySelection;

type MarketingValueSheetSupportItem = {
  key: string;
  primary: string;
  secondary: string;
  meta: string;
  value?: string;
  tone?: string;
};

type MarketingValueSheetCell = {
  key: MarketingValueSheetCellKey;
  label: string;
  value: string;
  align: 'left' | 'right';
  supportItems?: MarketingValueSheetSupportItem[];
  basis?: string;
};

type GoogleAnalyticsTotals = {
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
  rows: number;
};

type GoogleAdsTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  rows: number;
};

type MarketingChannelKey = 'seo' | 'ppc';

type MarketingChannelLaneKey = MarketingChannelKey | 'email';

type IntakeFilterKey = keyof IntakeBreakdown;

type IntakeFilterSelection = IntakeFilterKey | 'all';

type SourceAttributionCounts = Record<MarketingChannelKey | 'other', number>;

type JourneyMetric = {
  key: string;
  label: string;
  value: string;
  detail: string;
  basis: string;
};

type IntakeBreakdown = {
  calls: number;
  forms: number;
  email: number;
  other: number;
};

type DownstreamMatchSummary = {
  anchorCount: number;
  pitches: MarketingWorkspaceRow[];
  instructions: MarketingWorkspaceRow[];
  matters: MarketingWorkspaceRow[];
  collectedRows: MarketingWorkspaceRow[];
  collected: number;
};

type JourneyMatchSummary = {
  selectedIntakeLabel: string;
  sourceEnquiries: number;
  filteredEnquiries: number;
  anchorCount: number;
  instructionRefCount: number;
  matterRefCount: number;
  matterIdCount: number;
  matchedPitches: number;
  matchedInstructions: number;
  matchedMatters: number;
  matchedCollectedRows: number;
  chainNotes: string[];
};

type MarketingJourneyBanner = {
  key: MarketingChannelLaneKey;
  label: string;
  sourceLabel: string;
  headline: string;
  liveLabel: string;
  subline: string;
  attribution: string;
  evidence: string;
  status: 'live' | 'off';
  enabled: boolean;
  accent: string;
  enquiryCount: number;
  enquiryDetail: string;
  intake: IntakeBreakdown;
  stages: JourneyMetric[];
  matchSummary: JourneyMatchSummary;
};

type EmailCampaignAudienceKey = 'all' | 'commercial' | 'construction' | 'property' | 'employment' | 'other';

type EmailCampaignAudienceOption = {
  key: EmailCampaignAudienceKey;
  label: string;
  glyph: string;
};

type EmailCampaignDateRange = {
  startDate: string;
  endDate: string;
};

type EmailCampaignPlaceholder = {
  key: EmailCampaignAudienceKey;
  title: string;
  subject: string;
  status: string;
};

type EmailCampaignSenderOption = {
  value: string;
  label: string;
};

type EmailCampaignSignatureOption = {
  value: string;
  label: string;
};

type EmailCampaignSendResult = {
  status: 'ready' | 'error' | 'saved';
  message: string;
  requestId?: string | null;
  sendGridMessageId?: string | null;
};

type EmailCampaignRecipientListKey = Exclude<EmailCampaignAudienceKey, 'all'>;

type EmailCampaignRecipientPreview = {
  key: string;
  displayName: string;
  email: string;
  areaOfWork: string;
  method: string;
  dateLabel: string;
  listKey: EmailCampaignRecipientListKey;
  blockedReason?: string;
};

type EmailCampaignRecipientStats = {
  scanned: number;
  qualified: number;
  blocked: number;
};

type EmailCampaignListGrowthStats = {
  key: EmailCampaignAudienceKey;
  label: string;
  glyph: string;
  stats: EmailCampaignRecipientStats;
  monthStats: EmailCampaignRecipientStats;
  quarterStats: EmailCampaignRecipientStats;
  isSendable?: boolean;
  withAcid?: number;
  ranked?: number;
  clients?: number;
};

type MarketingEmailAudienceStream = {
  streamKey: EmailCampaignRecipientListKey;
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
  glyph?: string;
};

type MarketingEmailAudienceMember = {
  memberId: string;
  streamKey: EmailCampaignRecipientListKey;
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

type MarketingEmailCampaign = {
  campaignId: string;
  campaignKey: string;
  streamKey: EmailCampaignRecipientListKey;
  status: string;
  campaignName: string;
  selectedCount: number | null;
  blockedCount: number | null;
  lockedAt: string | null;
};

type MarketingReportDateRange = {
  startDate: string;
  endDate: string;
};

type MarketingReportDownloadState = {
  status: 'idle' | 'downloading' | 'ready' | 'error';
  message: string;
};

const SEO_MONTHLY_COST = 8400;
const SEO_MONTHS_INCLUDED = 3;
const SEO_SPEND_ESTIMATE = SEO_MONTHLY_COST * SEO_MONTHS_INCLUDED;
const SEARCH_MARKETING_REPORT_MIN_DATE = '2026-04-01';
const SEO_CONTENT_SNAPSHOT_CAPTURED_AT = '2026-06-24';
const SEO_CONTENT_SNAPSHOT_SOURCE = 'ClickUp All Tasks - #SwishDM';

const SEO_CONTENT_SNAPSHOT_LISTS: SeoContentSnapshotList[] = [
  {
    key: 'helix-content',
    label: 'Helix Content',
    total: 382,
    statuses: [
      { key: 'published-this-month', label: 'Published this month', count: 45, detail: 'Fresh content already shipped' },
      { key: 'scheduled', label: 'Scheduled', count: 3, detail: 'Queued for publication' },
      { key: 'approved-complete', label: 'Approved or complete', count: 6, detail: 'Ready or already cleared' },
      { key: 'waiting-approval', label: 'Waiting approval', count: 6, detail: 'Needs final review' },
      { key: 'update-editing-required', label: 'Update or editing required', count: 7, detail: 'Needs content work before release' },
      { key: 'in-progress', label: 'In progress', count: 9, detail: 'Currently being worked' },
      { key: 'planning', label: 'Planning', count: 10, detail: 'Being shaped before production' },
      { key: 'order-content', label: 'Order content', count: 3, detail: 'Ready to commission' },
      { key: 'pipeline', label: 'Pipeline', count: 293, detail: 'Content backlog and opportunity pool' },
    ],
  },
  {
    key: 'helix-tasks',
    label: 'Helix Tasks',
    total: 30,
    statuses: [
      { key: 'client-approval', label: 'Client approval', count: 1, detail: 'External approval needed' },
      { key: 'in-review', label: 'In review', count: 5, detail: 'Being checked' },
      { key: 'waiting', label: 'Waiting', count: 1, detail: 'Blocked or waiting' },
      { key: 'in-progress', label: 'In progress', count: 1, detail: 'Active SEO task' },
      { key: 'todo', label: 'To do', count: 16, detail: 'Task backlog' },
      { key: 'planning', label: 'Planning', count: 6, detail: 'Work being shaped' },
    ],
  },
  {
    key: 'helix-dev',
    label: 'Helix Dev',
    total: 1,
    statuses: [
      { key: 'in-review', label: 'In review', count: 1, detail: 'Technical support item' },
      { key: 'ideas', label: 'Ideas', count: 0, detail: 'No current idea backlog' },
    ],
  },
  {
    key: 'helix-reports',
    label: 'Helix Reports',
    total: 1,
    statuses: [
      { key: 'ideas', label: 'Ideas', count: 1, detail: 'Reporting idea linked to SEO' },
    ],
  },
  {
    key: 'dpr-coverage-tracker',
    label: 'DPR Coverage Tracker',
    total: 4,
    statuses: [
      { key: 'to-do', label: 'To do', count: 4, detail: 'Coverage actions to pick up' },
    ],
  },
];

const EMAIL_CAMPAIGN_DEMO_ENQUIRY_ID = 'DEMO-ENQ-0003';
const EMAIL_CAMPAIGN_RANGE_SPAN_DAYS = 180;
const EMAIL_CAMPAIGN_DEFAULT_WINDOW_DAYS = 30;
const EMAIL_CAMPAIGN_PREVIEW_LIMIT = 8;
const VALUE_SHEET_SUPPORT_LIMIT = 18;

const VALUE_SHEET_COLUMNS: Array<{ key: MarketingValueSheetCellKey; label: string; align: 'left' | 'right' }> = [
  { key: 'source', label: 'Source', align: 'left' },
  { key: 'activity', label: 'Activity', align: 'left' },
  { key: 'enquiries', label: 'Enq.', align: 'right' },
  { key: 'matters', label: 'Matters', align: 'right' },
  { key: 'spend', label: 'Spend', align: 'right' },
  { key: 'received', label: 'Received', align: 'right' },
  { key: 'wip', label: 'WIP', align: 'right' },
  { key: 'totalValue', label: 'Total', align: 'right' },
];

const EMAIL_CAMPAIGN_AUDIENCE_OPTIONS: EmailCampaignAudienceOption[] = [
  { key: 'commercial', label: 'Commercial', glyph: 'Commercial' },
  { key: 'construction', label: 'Construction', glyph: 'Construction' },
  { key: 'property', label: 'Property', glyph: 'Property' },
  { key: 'employment', label: 'Employment', glyph: 'Employment' },
  { key: 'other', label: 'Other', glyph: 'Other/Unsure' },
];

const EMAIL_CAMPAIGN_PLACEHOLDERS: EmailCampaignPlaceholder[] = [
  { key: 'commercial', title: 'Commercial update', subject: 'Commercial briefing', status: 'Draft' },
  { key: 'construction', title: 'Construction update', subject: 'Construction briefing', status: 'Draft' },
  { key: 'property', title: 'Property update', subject: 'Property briefing', status: 'Draft' },
  { key: 'employment', title: 'Employment update', subject: 'Employment briefing', status: 'Draft' },
  { key: 'other', title: 'Inspection draft', subject: 'Inspection draft', status: 'Inspect' },
];

const EMAIL_CAMPAIGN_SENDERS: EmailCampaignSenderOption[] = [
  { value: 'automations@helix-law.com', label: 'Automations' },
  { value: 'team@helix-law.com', label: 'Team inbox' },
  { value: 'lz@helix-law.com', label: 'LZ' },
];

const EMAIL_CAMPAIGN_SIGNATURES: EmailCampaignSignatureOption[] = [
  { value: 'data-hub-v2', label: 'Helix email v2' },
  { value: 'legacy', label: 'Legacy Helix' },
];

const EMAIL_CAMPAIGN_AREA_QUALIFIERS: Record<Exclude<EmailCampaignAudienceKey, 'all' | 'other'>, string[]> = {
  commercial: ['commercial', 'corporate', 'company'],
  construction: ['construction'],
  property: ['property', 'convey', 'real estate', 'lease', 'landlord'],
  employment: ['employment'],
};

const intakeFilterOrder: IntakeFilterKey[] = ['calls', 'forms', 'email', 'other'];

const intakeFilterMeta: Record<IntakeFilterKey, { label: string; iconName: string }> = {
  calls: { label: 'Call', iconName: 'Phone' },
  forms: { label: 'Form', iconName: 'FormLibrary' },
  email: { label: 'Email', iconName: 'Mail' },
  other: { label: 'Other', iconName: 'More' },
};

const journeyStageIconName: Record<string, string> = {
  pitches: 'PageList',
  instructions: 'TextDocument',
  matters: 'WorkItem',
  collected: 'Money',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function hasMetricValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function readMetricValue(record: Record<string, unknown> | null | undefined, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (hasMetricValue(value)) return value;
  }
  const entries = Object.entries(record);
  for (const key of keys) {
    const matched = entries.find(([entryKey, value]) => entryKey.toLowerCase() === key.toLowerCase() && hasMetricValue(value));
    if (matched) return matched[1];
  }
  return undefined;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function metricNumber(record: Record<string, unknown> | null | undefined, ...keys: string[]): number {
  return toNumber(readMetricValue(record, ...keys));
}

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
}

function compactLabel(value: unknown, fallback: string): string {
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

function formatSupportDate(value: unknown): string {
  const date = toDateOrNull(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function createWorkspaceSupportItem(row: MarketingWorkspaceRow, kind: string, index: number, tone?: string): MarketingValueSheetSupportItem {
  const dateLabel = formatSupportDate(row.sortTs) || compactLabel(row.timestamp, 'No date');
  const owner = compactLabel(row.owner, 'Unassigned');
  const status = compactLabel(row.status, 'No status');
  const value = compactLabel(row.value, '');
  return {
    key: `${kind}-${row.id || index}`,
    primary: dateLabel,
    secondary: compactLabel(row.secondary || row.detail, 'No supporting detail'),
    meta: [dateLabel, status, owner].filter(Boolean).join(' | '),
    value: value || undefined,
    tone,
  };
}

function createMetricSupportItem(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds', index: number, tone?: string): MarketingValueSheetSupportItem {
  const metrics = metricRecord(row, nestedKey);
  const dateLabel = formatSupportDate(getMetricDate(row, nestedKey)) || `Row ${index + 1}`;
  if (nestedKey === 'googleAnalytics') {
    return {
      key: `ga-${dateLabel}-${index}`,
      primary: dateLabel,
      secondary: `${formatNumber(metricNumber(metrics, 'sessions'))} sessions, ${formatNumber(metricNumber(metrics, 'activeUsers', 'users'))} active users`,
      meta: `${formatNumber(metricNumber(metrics, 'screenPageViews', 'pageViews', 'views'))} page views | ${formatNumber(metricNumber(metrics, 'conversions', 'keyEvents'))} key events`,
      value: 'GA4',
      tone,
    };
  }
  const cost = googleAdsCost(metrics);
  return {
    key: `ads-${dateLabel}-${index}`,
    primary: dateLabel,
    secondary: `${formatNumber(metricNumber(metrics, 'clicks'))} clicks, ${formatNumber(metricNumber(metrics, 'conversions'), 1)} conversions`,
    meta: `${formatNumber(metricNumber(metrics, 'impressions'))} impressions`,
    value: formatCurrency(cost),
    tone,
  };
}

function createBasisSupportItem(key: string, primary: string, secondary: string, meta: string, value?: string, tone?: string): MarketingValueSheetSupportItem {
  return { key, primary, secondary, meta, value, tone };
}

function createEmailRecipientSupportItem(row: EmailCampaignRecipientPreview, index: number, tone?: string): MarketingValueSheetSupportItem {
  return {
    key: `email-recipient-${row.key || index}`,
    primary: row.dateLabel || `Recipient ${index + 1}`,
    secondary: `${row.displayName} | ${row.areaOfWork || 'Uncategorised'}`,
    meta: row.blockedReason ? `Blocked: ${row.blockedReason}` : `${row.method || 'Unknown source'} | SendGrid ready`,
    value: row.blockedReason ? 'Blocked' : 'Ready',
    tone,
  };
}

function parseMoneyLabel(value: string): number {
  return toNumber(value);
}

function normaliseText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isUnclassifiedSource(row: MarketingWorkspaceRow): boolean {
  const source = normaliseText(row.status);
  return !source || source.includes('unknown') || source.includes('unassigned') || source.includes('not set');
}

function isFormEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  const haystack = normaliseText(`${row.secondary} ${row.detail}`);
  return method.includes('form') || method.includes('web') || method.includes('website') || haystack.includes('form submission');
}

function isCallEnquiry(row: MarketingWorkspaceRow): boolean {
  const method = normaliseText(readEnquiryMethod(row));
  return method.includes('call') || method.includes('phone') || method.includes('telephone');
}

function isPitchOutstanding(row: MarketingWorkspaceRow): boolean {
  const status = normaliseText(row.status);
  return !status.includes('closed') && !status.includes('won') && !status.includes('instructed') && !status.includes('lost');
}

function readAreaOfWork(row: MarketingWorkspaceRow): string {
  const fromSecondary = String(row.secondary || '').split('|')[0]?.trim() || '';
  if (fromSecondary && normaliseText(fromSecondary) !== 'unknown area') return fromSecondary;
  const fallback = normaliseText(`${row.secondary} ${row.detail}`);
  if (fallback.includes('employment')) return 'Employment';
  if (fallback.includes('family') || fallback.includes('divorce') || fallback.includes('children')) return 'Family';
  if (fallback.includes('property') || fallback.includes('convey') || fallback.includes('real estate')) return 'Property';
  if (fallback.includes('immigration')) return 'Immigration';
  if (fallback.includes('corporate') || fallback.includes('commercial') || fallback.includes('company')) return 'Corporate';
  if (fallback.includes('litigation') || fallback.includes('dispute') || fallback.includes('injury')) return 'Litigation';
  return 'General';
}

function readSecondarySegments(row: MarketingWorkspaceRow): string[] {
  return String(row.secondary || '')
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readEnquiryMethod(row: MarketingWorkspaceRow): string {
  return readSecondarySegments(row)[1] || 'Unknown contact';
}

function readNormalizedEnquiryMethod(row: MarketingWorkspaceRow) {
  return getNormalizedEnquiryMOC({
    Method_of_Contact: readEnquiryMethod(row),
    Ultimate_Source: row.status,
  });
}

function readIntakeFilterKey(row: MarketingWorkspaceRow): IntakeFilterKey {
  const normalized = readNormalizedEnquiryMethod(row).key;
  if (normalized === 'phone' || isCallEnquiry(row)) return 'calls';
  if (normalized === 'web_form' || isFormEnquiry(row)) return 'forms';
  if (normalized === 'email') return 'email';
  return 'other';
}

function filterEnquiriesByIntake(rows: MarketingWorkspaceRow[], intakeKey: IntakeFilterSelection): MarketingWorkspaceRow[] {
  if (intakeKey === 'all') return rows;
  return rows.filter((row) => readIntakeFilterKey(row) === intakeKey);
}

function readStraightSourceChannel(row: MarketingWorkspaceRow): MarketingChannelKey | 'other' {
  const source = normaliseText(row.status);
  if (source === 'organic search') return 'seo';
  if (source === 'paid search') return 'ppc';
  return 'other';
}

function buildAttributionCounts(rows: MarketingWorkspaceRow[]): SourceAttributionCounts {
  return rows.reduce<SourceAttributionCounts>((acc, row) => {
    acc[readStraightSourceChannel(row)] += 1;
    return acc;
  }, { seo: 0, ppc: 0, other: 0 });
}

function buildIntakeBreakdown(rows: MarketingWorkspaceRow[]): IntakeBreakdown {
  return rows.reduce<IntakeBreakdown>((acc, row) => {
    acc[readIntakeFilterKey(row)] += 1;
    return acc;
  }, { calls: 0, forms: 0, email: 0, other: 0 });
}

function buildValueSheetMethodCounts(rows: MarketingWorkspaceRow[], fallbackTotal?: number) {
  const breakdown = buildIntakeBreakdown(rows);
  const total = Number.isFinite(fallbackTotal) && typeof fallbackTotal === 'number'
    ? Math.max(rows.length, Math.trunc(fallbackTotal))
    : rows.length;
  const calls = Math.min(total, breakdown.calls);
  const webforms = Math.min(Math.max(0, total - calls), breakdown.forms);
  const other = Math.max(0, total - calls - webforms);
  return { calls, webforms, other, total };
}

function formatPercentage(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${formatNumber((part / whole) * 100, 1)}%`;
}

function formatConversion(current: number, previous: number): string {
  return previous > 0 ? `${formatPercentage(current, previous)} from previous stage` : 'No previous-stage base yet';
}

function formatRatio(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return '0.00x';
  return `${(numerator / denominator).toFixed(2)}x`;
}

function formatReturnMultiple(value: number, spend: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(spend) || spend <= 0) return '0.00x';
  return `${(value / spend).toFixed(2)}x`;
}

function normaliseMatchValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addMatchValue(values: Set<string>, value: unknown): void {
  const normalized = normaliseMatchValue(value);
  if (normalized.length < 4) return;
  if (['unknown', 'unknown area', 'unknown contact', 'unassigned', 'general', 'no ref', 'workflow'].includes(normalized)) return;
  values.add(normalized.replace(/^matter\s+/, ''));
}

function collectMatchValues(rows: MarketingWorkspaceRow[], fields: Array<keyof MarketingWorkspaceMatch>): Set<string> {
  const values = new Set<string>();
  rows.forEach((row) => {
    fields.forEach((field) => addMatchValue(values, row.match?.[field]));
  });
  return values;
}

function rowHasMatchValue(row: MarketingWorkspaceRow, fields: Array<keyof MarketingWorkspaceMatch>, values: Set<string>): boolean {
  if (values.size === 0) return false;
  return fields.some((field) => {
    const normalized = normaliseMatchValue(row.match?.[field]).replace(/^matter\s+/, '');
    return normalized.length >= 4 && values.has(normalized);
  });
}

function buildDownstreamMatchSummary(
  enquiryRows: MarketingWorkspaceRow[],
  pitches: MarketingWorkspaceRow[],
  instructions: MarketingWorkspaceRow[],
  matters: MarketingWorkspaceRow[],
  collectedRows: MarketingWorkspaceRow[],
): DownstreamMatchSummary {
  const enquiryAcids = collectMatchValues(enquiryRows, ['acid', 'pitchEnquiryId', 'legacyEnquiryId', 'processingEnquiryId', 'enquiryId']);
  const matchedPitches = pitches.filter((row) => rowHasMatchValue(row, ['prospectId', 'acid', 'pitchEnquiryId', 'enquiryId'], enquiryAcids));
  const instructionRefs = collectMatchValues(matchedPitches, ['instructionRef']);
  const matchedInstructions = instructions.filter((row) => rowHasMatchValue(row, ['instructionRef'], instructionRefs));
  const matterRefs = collectMatchValues(matchedInstructions, ['matterRef', 'matterId']);
  const matchedMatters = matters.filter((row) => rowHasMatchValue(row, ['matterRef', 'matterId'], matterRefs));
  const matterIds = collectMatchValues(matchedMatters, ['matterId', 'matterRef']);
  const matchedCollectedRows = collectedRows.filter((row) => rowHasMatchValue(row, ['matterId'], matterIds));
  return {
    anchorCount: enquiryAcids.size,
    pitches: matchedPitches,
    instructions: matchedInstructions,
    matters: matchedMatters,
    collectedRows: matchedCollectedRows,
    collected: matchedCollectedRows.reduce((sum, row) => sum + parseMoneyLabel(row.value), 0),
  };
}

function readMatterReference(row: MarketingWorkspaceRow): string {
  return String(row.primary || '').trim() || 'No ref';
}

function readOwnerInitials(row: MarketingWorkspaceRow): string {
  const raw = String(row.owner || '').trim();
  if (!raw || raw.toLowerCase() === 'unassigned') return '--';
  if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase();
  if (raw.includes('@')) {
    const local = raw.split('@')[0] || '';
    if (local && /^[A-Za-z]{2,3}$/.test(local)) return local.toUpperCase();
    if (local.includes('.')) {
      return local
        .split('.')
        .map((part) => part[0] || '')
        .join('')
        .slice(0, 3)
        .toUpperCase() || '--';
    }
    return local.slice(0, 2).toUpperCase() || '--';
  }
  const tokens = raw
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return '--';
  if (tokens.length === 1) {
    const compact = tokens[0].slice(0, 2).toUpperCase();
    return compact || '--';
  }
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase() || '--';
}

function readMatterResponsibleInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials(row);
}

function readMatterOriginatingInitials(row: MarketingWorkspaceRow): string {
  return readOwnerInitials({ ...row, owner: row.detail });
}

function areaAccentColour(areaOfWork: string, isDarkMode: boolean): string {
  const area = normaliseText(areaOfWork);
  if (area.includes('employment')) return isDarkMode ? colours.yellow : colours.yellow;
  if (area.includes('family') || area.includes('divorce') || area.includes('children')) return colours.orange;
  if (area.includes('property') || area.includes('convey') || area.includes('real estate')) return colours.green;
  if (area.includes('immigration')) return colours.blue;
  if (area.includes('corporate') || area.includes('commercial') || area.includes('company')) return colours.helixBlue;
  if (area.includes('litigation') || area.includes('dispute') || area.includes('injury')) return colours.cta;
  return isDarkMode ? colours.blue : colours.helixBlue;
}

function metricRecord(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds'): Record<string, unknown> | null {
  const record = asRecord(row);
  if (!record) return null;
  return asRecord(record[nestedKey]) ?? asRecord(record.metrics) ?? record;
}

function googleAdsCost(metrics: Record<string, unknown> | null): number {
  const costMicros = metricNumber(metrics, 'costMicros', 'cost_micros');
  const cost = readMetricValue(metrics, 'cost');
  return !hasMetricValue(cost) && costMicros > 0 ? costMicros / 1000000 : toNumber(cost);
}

function buildGoogleAnalyticsTotals(rows: unknown[]): GoogleAnalyticsTotals {
  return rows.reduce<GoogleAnalyticsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAnalytics');
    if (!metrics) return acc;
    acc.sessions += metricNumber(metrics, 'sessions');
    acc.users += metricNumber(metrics, 'activeUsers', 'users');
    acc.views += metricNumber(metrics, 'screenPageViews', 'pageViews', 'views');
    acc.keyEvents += metricNumber(metrics, 'conversions', 'keyEvents');
    acc.rows += 1;
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0, rows: 0 });
}

function buildGoogleAdsTotals(rows: unknown[]): GoogleAdsTotals {
  return rows.reduce<GoogleAdsTotals>((acc, row) => {
    const metrics = metricRecord(row, 'googleAds');
    if (!metrics) return acc;
    acc.impressions += metricNumber(metrics, 'impressions');
    acc.clicks += metricNumber(metrics, 'clicks');
    acc.cost += googleAdsCost(metrics);
    acc.conversions += metricNumber(metrics, 'conversions');
    acc.rows += 1;
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: 0 });
}

function buildSeoLedgerTotals(rows: MarketingWorkspaceRow[]): GoogleAnalyticsTotals {
  return rows.reduce<GoogleAnalyticsTotals>((acc, row) => {
    const segments = readSecondarySegments(row);
    acc.sessions += toNumber(segments[0]);
    acc.users += toNumber(segments[1]);
    acc.rows += 1;
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0, rows: 0 });
}

function buildPpcLedgerTotals(rows: MarketingWorkspaceRow[]): GoogleAdsTotals {
  return rows.reduce<GoogleAdsTotals>((acc, row) => {
    const segments = readSecondarySegments(row);
    acc.impressions += toNumber(segments[0]);
    acc.clicks += toNumber(segments[1]);
    acc.cost += parseMoneyLabel(row.value);
    acc.conversions += toNumber(row.detail);
    acc.rows += 1;
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0, rows: 0 });
}

function toDateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const compactDateMatch = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactDateMatch) {
    const [, year, month, day] = compactDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function toWeekStart(value: Date): Date {
  const weekStart = startOfDay(value);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);
  return weekStart;
}

function formatTimelineDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatTimelineMonth(value: Date): string {
  return value.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function dateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEmailCampaignCurrentMonthRange(now = new Date()): EmailCampaignDateRange {
  return {
    startDate: dateKey(startOfMonth(now)),
    endDate: dateKey(now),
  };
}

function getEmailCampaignCurrentQuarterRange(now = new Date()): EmailCampaignDateRange {
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return {
    startDate: dateKey(new Date(now.getFullYear(), quarterStartMonth, 1)),
    endDate: dateKey(now),
  };
}

function isDateKeyValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function readDownloadFilename(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded?.[1]) return decodeURIComponent(encoded[1].replace(/^"|"$/g, ''));
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = header.match(/filename=([^;]+)/i);
  return bare?.[1] ? bare[1].trim().replace(/^"|"$/g, '') : fallback;
}

function parseEmailCampaignDateValue(value: string): Date {
  return new Date(`${value}T12:00:00.000`);
}

function getEmailCampaignDefaultWindow(): EmailCampaignDateRange {
  const now = new Date();
  return {
    startDate: dateKey(addDays(now, -(EMAIL_CAMPAIGN_DEFAULT_WINDOW_DAYS - 1))),
    endDate: dateKey(now),
  };
}

function getEmailCampaignWindowOffset(minimumDate: string, value: string): number {
  const minimumTime = parseEmailCampaignDateValue(minimumDate).getTime();
  const valueTime = parseEmailCampaignDateValue(value).getTime();
  if (Number.isNaN(minimumTime) || Number.isNaN(valueTime)) return 0;
  return Math.max(0, Math.min(EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1, Math.round((valueTime - minimumTime) / 86400000)));
}

function getEmailCampaignDateAtOffset(minimumDate: string, offset: number): string {
  const baseDate = parseEmailCampaignDateValue(minimumDate);
  if (Number.isNaN(baseDate.getTime())) return minimumDate;
  return dateKey(addDays(baseDate, Math.max(0, Math.min(EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1, offset))));
}

function formatEmailCampaignCompactDate(value: string): string {
  const date = parseEmailCampaignDateValue(value);
  if (!value || Number.isNaN(date.getTime())) return 'Set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatEmailCampaignWindowLabel(range: EmailCampaignDateRange): string {
  return `${formatEmailCampaignCompactDate(range.startDate)} - ${formatEmailCampaignCompactDate(range.endDate)}`;
}

function getEmailCampaignRangeDays(range: EmailCampaignDateRange): number {
  const startTime = parseEmailCampaignDateValue(range.startDate).getTime();
  const endTime = parseEmailCampaignDateValue(range.endDate).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return 0;
  return Math.round((endTime - startTime) / 86400000) + 1;
}

function getEmailCampaignRecipientListKey(row: MarketingWorkspaceRow): EmailCampaignRecipientListKey {
  const area = normaliseText(readAreaOfWork(row));
  const matched = (Object.entries(EMAIL_CAMPAIGN_AREA_QUALIFIERS) as Array<[Exclude<EmailCampaignAudienceKey, 'all' | 'other'>, string[]]>).find(([, keywords]) => (
    keywords.some((keyword) => area.includes(keyword))
  ));
  return matched?.[0] ?? 'other';
}

function emailCampaignRecipientMatchesList(row: EmailCampaignRecipientPreview, listKey: EmailCampaignAudienceKey): boolean {
  return listKey === 'all' || row.listKey === listKey;
}

function isEmailCampaignRowInWindow(row: MarketingWorkspaceRow, range: EmailCampaignDateRange): boolean {
  const rowDate = toDateOrNull(row.sortTs);
  const start = parseEmailCampaignDateValue(range.startDate);
  const end = parseEmailCampaignDateValue(range.endDate);
  if (!rowDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  end.setHours(23, 59, 59, 999);
  return rowDate.getTime() >= start.getTime() && rowDate.getTime() <= end.getTime();
}

function isUsableEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function buildEmailCampaignRecipients(rows: MarketingWorkspaceRow[], range: EmailCampaignDateRange): EmailCampaignRecipientPreview[] {
  const seenEmails = new Set<string>();
  return rows
    .filter((row) => isEmailCampaignRowInWindow(row, range))
    .map((row, index) => {
      const email = String(row.match?.email || '').trim();
      const emailKey = email.toLowerCase();
      const blockedReason = !isUsableEmail(email)
        ? 'missing-email'
        : seenEmails.has(emailKey)
          ? 'duplicate-email'
          : undefined;
      if (!blockedReason) seenEmails.add(emailKey);
      return {
        key: `${emailKey || row.id || 'recipient'}-${index}`,
        displayName: compactLabel(row.primary, row.id || 'Unknown contact'),
        email,
        areaOfWork: readAreaOfWork(row),
        method: readEnquiryMethod(row),
        dateLabel: formatSupportDate(row.sortTs) || compactLabel(row.timestamp, 'No date'),
        listKey: getEmailCampaignRecipientListKey(row),
        blockedReason,
      };
    });
}

function buildEmailCampaignRecipientStats(rows: EmailCampaignRecipientPreview[]): Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats> {
  const stats = EMAIL_CAMPAIGN_AUDIENCE_OPTIONS.reduce<Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats>>((acc, option) => {
    acc[option.key] = { scanned: 0, qualified: 0, blocked: 0 };
    return acc;
  }, {} as Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats>);
  stats.all = { scanned: 0, qualified: 0, blocked: 0 };

  rows.forEach((row) => {
    const keys: EmailCampaignAudienceKey[] = ['all', row.listKey];
    keys.forEach((key) => {
      stats[key].scanned += 1;
      if (row.blockedReason) {
        stats[key].blocked += 1;
      } else {
        stats[key].qualified += 1;
      }
    });
  });

  return stats;
}

function buildEmailCampaignStatsFromStreams(streams: MarketingEmailAudienceStream[]): Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats> {
  const stats = EMAIL_CAMPAIGN_AUDIENCE_OPTIONS.reduce<Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats>>((acc, option) => {
    acc[option.key] = { scanned: 0, qualified: 0, blocked: 0 };
    return acc;
  }, {} as Record<EmailCampaignAudienceKey, EmailCampaignRecipientStats>);
  stats.all = { scanned: 0, qualified: 0, blocked: 0 };

  streams.forEach((stream) => {
    const next = {
      scanned: stream.total,
      qualified: stream.sendable,
      blocked: Math.max(0, stream.total - stream.sendable),
    };
    stats[stream.streamKey] = next;
    stats.all.scanned += next.scanned;
    stats.all.qualified += next.qualified;
    stats.all.blocked += next.blocked;
  });

  return stats;
}

function emailAudienceMemberToPreview(member: MarketingEmailAudienceMember, index: number): EmailCampaignRecipientPreview {
  const emailLabel = member.emailDomain
    ? `*@${member.emailDomain}`
    : member.emailHash
      ? `${member.emailHash.slice(0, 10)}...`
      : 'Email hash pending';
  const rankLabel = member.rank == null ? 'Rank missing' : `Rank ${member.rank}`;
  const clientLabel = member.client ? `Client${member.matterId ? ` | ${member.matterId}` : ''}` : 'Prospect';
  return {
    key: member.memberId || `${member.streamKey}-${member.acid || member.sourceEnquiryId || index}`,
    displayName: member.acid ? `ACID ${member.acid}` : member.sourceEnquiryId ? `Enquiry ${member.sourceEnquiryId}` : `Member ${index + 1}`,
    email: emailLabel,
    areaOfWork: member.areaOfWork || member.streamKey,
    method: `${rankLabel} | ${clientLabel}`,
    dateLabel: member.tags.length > 0 ? member.tags.slice(0, 3).join(', ') : member.qualificationStatus,
    listKey: member.streamKey,
    blockedReason: member.sendable ? undefined : member.qualificationReason || member.qualificationStatus,
  };
}

function monthKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function monthOffset(start: Date, value: Date): number {
  return ((value.getFullYear() - start.getFullYear()) * 12) + value.getMonth() - start.getMonth();
}

function createTimelineTotals(): MarketingTimelineTotals {
  return {
    seoSessions: 0,
    seoKeyEvents: 0,
    seoEnquiries: 0,
    seoSpend: 0,
    seoMatters: 0,
    seoCollected: 0,
    seoMatterValue: 0,
    seoRows: 0,
    ppcSpend: 0,
    ppcClicks: 0,
    ppcConversions: 0,
    ppcEnquiries: 0,
    ppcMatters: 0,
    ppcCollected: 0,
    ppcMatterValue: 0,
    ppcRows: 0,
  };
}

function addTimelineTotals(target: MarketingTimelineTotals, next: Partial<MarketingTimelineTotals>): void {
  target.seoSessions += next.seoSessions ?? 0;
  target.seoKeyEvents += next.seoKeyEvents ?? 0;
  target.seoEnquiries += next.seoEnquiries ?? 0;
  target.seoSpend += next.seoSpend ?? 0;
  target.seoMatters += next.seoMatters ?? 0;
  target.seoCollected += next.seoCollected ?? 0;
  target.seoMatterValue += next.seoMatterValue ?? 0;
  target.seoRows += next.seoRows ?? 0;
  target.ppcSpend += next.ppcSpend ?? 0;
  target.ppcClicks += next.ppcClicks ?? 0;
  target.ppcConversions += next.ppcConversions ?? 0;
  target.ppcEnquiries += next.ppcEnquiries ?? 0;
  target.ppcMatters += next.ppcMatters ?? 0;
  target.ppcCollected += next.ppcCollected ?? 0;
  target.ppcMatterValue += next.ppcMatterValue ?? 0;
  target.ppcRows += next.ppcRows ?? 0;
}

function formatTimelineDay(value: Date): string {
  return value.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' });
}

function createTimelineDay(value: Date, parentWeekKey: string): MarketingTimelineDay {
  const day = startOfDay(value);
  return {
    ...createTimelineTotals(),
    key: `${parentWeekKey}-day-${dateKey(day)}`,
    label: formatTimelineDay(day),
    rangeLabel: formatTimelineDate(day),
    startTs: day.getTime(),
    endTs: day.getTime(),
  };
}

function createTimelineWeek(start: Date, end: Date, index: number, parentMonthKey: string): MarketingTimelineWeek {
  const key = `${parentMonthKey}-week-${dateKey(start)}`;
  const days: MarketingTimelineDay[] = [];
  let cursor = startOfDay(start);
  const endDay = startOfDay(end);
  while (cursor.getTime() <= endDay.getTime()) {
    days.push(createTimelineDay(cursor, key));
    cursor = addDays(cursor, 1);
  }

  return {
    ...createTimelineTotals(),
    key,
    label: `Week ${index + 1}`,
    rangeLabel: `${formatTimelineDate(start)} to ${formatTimelineDate(end)}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    days,
  };
}

function createTimelineMonth(start: Date, end: Date): MarketingTimelineMonth {
  const key = monthKey(start);
  const weeks: MarketingTimelineWeek[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    const naturalWeekEnd = addDays(toWeekStart(cursor), 6);
    const weekEnd = minDate(naturalWeekEnd, end);
    weeks.push(createTimelineWeek(cursor, weekEnd, weeks.length, key));
    cursor = addDays(weekEnd, 1);
  }
  return {
    ...createTimelineTotals(),
    key,
    label: formatTimelineMonth(start),
    rangeLabel: `${formatTimelineDate(start)} to ${formatTimelineDate(end)}`,
    startTs: start.getTime(),
    endTs: end.getTime(),
    weeks,
  };
}

function getMetricDate(row: unknown, nestedKey: 'googleAnalytics' | 'googleAds'): Date | null {
  const record = asRecord(row);
  const metrics = metricRecord(row, nestedKey);
  const segments = asRecord(record?.segments);
  return toDateOrNull(
    readMetricValue(metrics, 'date', 'day')
      ?? readMetricValue(record, 'date', 'day')
      ?? readMetricValue(segments, 'date', 'day'),
  );
}

function addTimelineMetrics(monthsByKey: Map<string, MarketingTimelineMonth>, date: Date | null, totals: Partial<MarketingTimelineTotals>): void {
  if (!date) return;
  const dateTs = startOfDay(date).getTime();
  const month = monthsByKey.get(monthKey(date));
  const week = month?.weeks.find((item) => dateTs >= item.startTs && dateTs <= item.endTs);
  const day = week?.days.find((item) => dateTs >= item.startTs && dateTs <= item.endTs);
  if (!month || !week) return;
  addTimelineTotals(month, totals);
  addTimelineTotals(week, totals);
  if (day) addTimelineTotals(day, totals);
}

function addTimelineSeoSpendEstimate(months: MarketingTimelineMonth[], monthsByKey: Map<string, MarketingTimelineMonth>, rangeStart: Date): void {
  const firstRangeMonth = startOfMonth(rangeStart);
  months.forEach((month) => {
    const monthDate = new Date(month.startTs);
    const offset = monthOffset(firstRangeMonth, monthDate);
    if (offset < 0 || offset >= SEO_MONTHS_INCLUDED) return;

    const daysInNaturalMonth = endOfMonth(monthDate).getDate();
    const dailySpend = SEO_MONTHLY_COST / Math.max(daysInNaturalMonth, 1);
    month.weeks.forEach((week) => {
      week.days.forEach((day) => {
        addTimelineMetrics(monthsByKey, new Date(day.startTs), { seoSpend: dailySpend });
      });
    });
  });
}

function addTimelineMatchedValue(
  monthsByKey: Map<string, MarketingTimelineMonth>,
  channel: MarketingChannelKey,
  downstream: DownstreamMatchSummary,
  attributionValue?: MarketingSearchAttributionValue | null,
): void {
  const channelKey = channel === 'seo' ? 'organicSearch' : 'paidSearch';
  const channelAttributedValue = attributionValue
    ? (attributionValue.combinedCollectedAndUpfront[channelKey] ?? 0) + (attributionValue.chargeableWip[channelKey]?.amount ?? 0)
    : 0;
  const matterWeights = downstream.matters.map((row) => Math.max(1, parseMoneyLabel(row.value)));
  const totalMatterWeight = matterWeights.reduce((sum, value) => sum + value, 0);

  downstream.matters.forEach((row, index) => {
    const fallbackValue = parseMoneyLabel(row.value);
    const allocatedValue = channelAttributedValue > 0 && totalMatterWeight > 0
      ? channelAttributedValue * (matterWeights[index] / totalMatterWeight)
      : fallbackValue;
    addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), channel === 'seo'
      ? { seoMatters: 1, seoMatterValue: allocatedValue }
      : { ppcMatters: 1, ppcMatterValue: allocatedValue });
  });

  downstream.collectedRows.forEach((row) => {
    addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), channel === 'seo'
      ? { seoCollected: parseMoneyLabel(row.value) }
      : { ppcCollected: parseMoneyLabel(row.value) });
  });
}

function buildMarketingTimelineMonths(
  rangeStartTs: number,
  rangeEndTs: number,
  googleAnalyticsRows: unknown[],
  googleAdsRows: unknown[],
  ledgerRowsByTab: Partial<Record<string, MarketingWorkspaceRow[]>>,
  searchAttributionValue?: MarketingSearchAttributionValue | null,
): MarketingTimelineMonth[] {
  const rangeStartDate = toDateOrNull(rangeStartTs);
  const rangeEndDate = toDateOrNull(rangeEndTs);
  if (!rangeStartDate || !rangeEndDate) return [];
  const rangeStart = startOfDay(rangeStartDate);
  const rangeEnd = startOfDay(rangeEndDate);
  if (rangeStart.getTime() > rangeEnd.getTime()) return [];

  const months: MarketingTimelineMonth[] = [];
  let cursor = startOfMonth(rangeStart);
  while (cursor.getTime() <= rangeEnd.getTime()) {
    const monthStart = maxDate(cursor, rangeStart);
    const monthEnd = minDate(endOfMonth(cursor), rangeEnd);
    months.push(createTimelineMonth(monthStart, monthEnd));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  const monthsByKey = new Map(months.map((month) => [month.key, month]));

  addTimelineSeoSpendEstimate(months, monthsByKey, rangeStart);

  if (hasGoogleAnalyticsTotals(buildGoogleAnalyticsTotals(googleAnalyticsRows))) {
    googleAnalyticsRows.forEach((row) => {
      const metrics = metricRecord(row, 'googleAnalytics');
      if (!metrics) return;
      addTimelineMetrics(monthsByKey, getMetricDate(row, 'googleAnalytics'), {
        seoSessions: metricNumber(metrics, 'sessions'),
        seoKeyEvents: metricNumber(metrics, 'conversions', 'keyEvents'),
        seoRows: 1,
      });
    });
  } else {
    (ledgerRowsByTab.seo ?? []).forEach((row) => {
      const segments = readSecondarySegments(row);
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), {
        seoSessions: toNumber(segments[0]),
        seoKeyEvents: toNumber(row.value),
        seoRows: 1,
      });
    });
  }

  if (hasGoogleAdsTotals(buildGoogleAdsTotals(googleAdsRows))) {
    googleAdsRows.forEach((row) => {
      const metrics = metricRecord(row, 'googleAds');
      if (!metrics) return;
      addTimelineMetrics(monthsByKey, getMetricDate(row, 'googleAds'), {
        ppcClicks: metricNumber(metrics, 'clicks'),
        ppcSpend: googleAdsCost(metrics),
        ppcConversions: metricNumber(metrics, 'conversions'),
        ppcRows: 1,
      });
    });
  } else {
    (ledgerRowsByTab.ppc ?? []).forEach((row) => {
      const segments = readSecondarySegments(row);
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), {
        ppcClicks: toNumber(segments[1]),
        ppcSpend: parseMoneyLabel(row.value),
        ppcConversions: toNumber(row.detail),
        ppcRows: 1,
      });
    });
  }

  (ledgerRowsByTab.enquiries ?? []).forEach((row) => {
    const channel = readStraightSourceChannel(row);
    if (channel === 'seo') {
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), { seoEnquiries: 1 });
    } else if (channel === 'ppc') {
      addTimelineMetrics(monthsByKey, toDateOrNull(row.sortTs), { ppcEnquiries: 1 });
    }
  });

  const pitches = ledgerRowsByTab.pitches ?? [];
  const instructions = ledgerRowsByTab.instructions ?? [];
  const matters = ledgerRowsByTab.matters ?? [];
  const collectedRows = ledgerRowsByTab.collectedTime ?? [];
  const seoEnquiries = (ledgerRowsByTab.enquiries ?? []).filter((row) => readStraightSourceChannel(row) === 'seo');
  const ppcEnquiries = (ledgerRowsByTab.enquiries ?? []).filter((row) => readStraightSourceChannel(row) === 'ppc');

  addTimelineMatchedValue(monthsByKey, 'seo', buildDownstreamMatchSummary(seoEnquiries, pitches, instructions, matters, collectedRows), searchAttributionValue);
  addTimelineMatchedValue(monthsByKey, 'ppc', buildDownstreamMatchSummary(ppcEnquiries, pitches, instructions, matters, collectedRows), searchAttributionValue);

  return months;
}

function hasGoogleAnalyticsTotals(value: GoogleAnalyticsTotals): boolean {
  return value.sessions > 0 || value.users > 0 || value.views > 0 || value.keyEvents > 0;
}

function hasGoogleAdsTotals(value: GoogleAdsTotals): boolean {
  return value.impressions > 0 || value.clicks > 0 || value.cost > 0 || value.conversions > 0;
}

const panelStyle = (isDarkMode: boolean): React.CSSProperties => ({
  border: `1px solid ${reportingPanelBorder(isDarkMode)}`,
  background: reportingPanelBackground(isDarkMode, 'elevated'),
  padding: 12,
  display: 'grid',
  gap: 8,
  minWidth: 0,
});

const MarketingPerformanceWorkspace: React.FC<MarketingPerformanceWorkspaceProps> = ({
  isDarkMode,
  googleAnalyticsRows,
  googleAdsRows,
  ledgerRowsByTab,
  isBlueprintMode = false,
  reportingWindowTitle = 'Financial year to date',
  timelineRangeLabel = 'Financial year to date',
  timelineRangeStartTs,
  timelineRangeEndTs,
  timelineStatusLabel = 'timeline settled',
  timelineIsProcessing = false,
  searchAttributionValue = null,
  searchAttributionStatus = 'idle',
  operatorName = '',
  operatorInitials = '',
  operatorEmail = '',
  activePage,
  onActivePageChange,
  showDevDraftSurfaces = false,
  demoModeEnabled = false,
}) => {
  const metrics = useMemo(() => {
    const enquiries = ledgerRowsByTab.enquiries ?? [];
    const calls = ledgerRowsByTab.calls ?? [];
    const pitches = ledgerRowsByTab.pitches ?? [];
    const instructions = ledgerRowsByTab.instructions ?? [];
    const matters = ledgerRowsByTab.matters ?? [];
    const seoRows = ledgerRowsByTab.seo ?? [];
    const ppcRows = ledgerRowsByTab.ppc ?? [];
    const websiteFromFeed = buildGoogleAnalyticsTotals(googleAnalyticsRows);
    const website = hasGoogleAnalyticsTotals(websiteFromFeed)
      ? websiteFromFeed
      : buildSeoLedgerTotals(seoRows);
    const paidFromFeed = buildGoogleAdsTotals(googleAdsRows);
    const paid = hasGoogleAdsTotals(paidFromFeed)
      ? paidFromFeed
      : buildPpcLedgerTotals(ppcRows);
    const collectedRows = ledgerRowsByTab.collectedTime ?? [];
    const collected = collectedRows.reduce((sum, row) => sum + parseMoneyLabel(row.value), 0);
    const sourceAttribution = buildAttributionCounts(enquiries);
    const classifiedEnquiries = enquiries.filter((row) => !isUnclassifiedSource(row)).length;
    const unclassifiedEnquiries = Math.max(0, enquiries.length - classifiedEnquiries);
    const intakeBreakdown = buildIntakeBreakdown(enquiries);
    const outstandingPitches = pitches.filter(isPitchOutstanding).length;
    const closedPitches = Math.max(0, pitches.length - outstandingPitches);
    const matterRowsWithValue = matters.filter((row) => parseMoneyLabel(row.value) > 0).length;
    const enquiryRate = website.sessions > 0 ? (enquiries.length / website.sessions) * 100 : 0;
    const pitchRate = enquiries.length > 0 ? (pitches.length / enquiries.length) * 100 : 0;
    const instructionRate = pitches.length > 0 ? (instructions.length / pitches.length) * 100 : 0;
    return {
      website,
      paid,
      enquiries,
      calls,
      pitches,
      instructions,
      matters,
      collectedRows,
      collected,
      sourceAttribution,
      classifiedEnquiries,
      unclassifiedEnquiries,
      intakeBreakdown,
      outstandingPitches,
      closedPitches,
      matterRowsWithValue,
      enquiryRate,
      pitchRate,
      instructionRate,
    };
  }, [googleAdsRows, googleAnalyticsRows, ledgerRowsByTab]);

  const [selectedIntakeByChannel, setSelectedIntakeByChannel] = useState<Record<MarketingChannelKey, IntakeFilterSelection>>({
    seo: 'all',
    ppc: 'all',
  });
  const [hoveredIntakeFilter, setHoveredIntakeFilter] = useState<string | null>(null);
  const [selectedEmailCampaignKey, setSelectedEmailCampaignKey] = useState<EmailCampaignPlaceholder['key']>('commercial');
  const [selectedEmailCampaignSender, setSelectedEmailCampaignSender] = useState<string>(EMAIL_CAMPAIGN_SENDERS[0].value);
  const [selectedEmailCampaignSignature, setSelectedEmailCampaignSignature] = useState<string>(EMAIL_CAMPAIGN_SIGNATURES[0].value);
  const [selectedEmailCampaignAudience, setSelectedEmailCampaignAudience] = useState<EmailCampaignRecipientListKey>('commercial');
  const [emailCampaignDateRange, setEmailCampaignDateRange] = useState<EmailCampaignDateRange>(() => getEmailCampaignDefaultWindow());
  const [appliedEmailCampaignDateRange, setAppliedEmailCampaignDateRange] = useState<EmailCampaignDateRange>(() => getEmailCampaignDefaultWindow());
  const [emailCampaignDraftSubject, setEmailCampaignDraftSubject] = useState<string>(EMAIL_CAMPAIGN_PLACEHOLDERS[0].subject);
  const [emailCampaignDraftPreview, setEmailCampaignDraftPreview] = useState<string>('A short Helix update for this list.');
  const [emailCampaignDraftBody, setEmailCampaignDraftBody] = useState<string>('Hello,\n\nWe are preparing a short update for this audience.\n\nKind regards,\nHelix Law');
  const [emailCampaignTestSending, setEmailCampaignTestSending] = useState(false);
  const [emailCampaignLocking, setEmailCampaignLocking] = useState(false);
  const [emailCampaignSendResult, setEmailCampaignSendResult] = useState<EmailCampaignSendResult | null>(null);
  const [emailCampaignSetupLocked, setEmailCampaignSetupLocked] = useState(false);
  const [emailAudienceStreams, setEmailAudienceStreams] = useState<MarketingEmailAudienceStream[]>([]);
  const [emailAudienceMembers, setEmailAudienceMembers] = useState<MarketingEmailAudienceMember[]>([]);
  const [emailAudienceLoading, setEmailAudienceLoading] = useState(false);
  const [emailAudienceRefreshing, setEmailAudienceRefreshing] = useState(false);
  const [emailAudienceError, setEmailAudienceError] = useState<string | null>(null);
  const [emailAudienceGeneratedAt, setEmailAudienceGeneratedAt] = useState<string | null>(null);
  const [emailCampaignLockedRecord, setEmailCampaignLockedRecord] = useState<MarketingEmailCampaign | null>(null);
  const [activeValueSheetTray, setActiveValueSheetTray] = useState<MarketingValueSheetTraySelection | null>(null);
  const [hoveredValueSheetCell, setHoveredValueSheetCell] = useState<MarketingValueSheetHoverSelection | null>(null);
  const [hoveredValueSheetSupportItem, setHoveredValueSheetSupportItem] = useState<string | null>(null);
  const [marketingReportRange, setMarketingReportRange] = useState<MarketingReportDateRange>(() => ({
    startDate: SEARCH_MARKETING_REPORT_MIN_DATE,
    endDate: dateKey(new Date()),
  }));
  const [marketingReportDownloadState, setMarketingReportDownloadState] = useState<MarketingReportDownloadState>({
    status: 'idle',
    message: 'Choose a window and download the PDF.',
  });
  const effectiveWorkspacePage: MarketingWorkspacePageKey | null = activePage ?? null;
  const effectiveChannelPage: MarketingChannelKey = activePage === 'ppc' ? 'ppc' : 'seo';
  const setMarketingWorkspacePage = (page: MarketingWorkspacePageKey) => {
    onActivePageChange?.(page);
  };
  const returnToMarketingProof = (selection: MarketingValueSheetTraySelection) => {
    setActiveValueSheetTray(selection);
    onActivePageChange?.(null);
    window.setTimeout(() => document.querySelector<HTMLElement>('[data-helix-region="marketing/value-sheet"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
  };

  const loadMarketingEmailStreams = useCallback(async (signal?: AbortSignal) => {
    setEmailAudienceLoading(true);
    setEmailAudienceError(null);
    try {
      const response = await fetch(getApiUrl('/api/marketing-email/streams'), {
        method: 'GET',
        credentials: 'include',
        signal,
      });
      const payload = await response.json() as { ok?: boolean; error?: string; streams?: MarketingEmailAudienceStream[]; generatedAt?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Marketing Email streams failed (${response.status})`);
      setEmailAudienceStreams(Array.isArray(payload.streams) ? payload.streams : []);
      setEmailAudienceGeneratedAt(payload.generatedAt || null);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setEmailAudienceError(error instanceof Error ? error.message : 'Marketing Email streams failed');
    } finally {
      if (!signal?.aborted) setEmailAudienceLoading(false);
    }
  }, []);

  const loadMarketingEmailMembers = useCallback(async (streamKey: EmailCampaignRecipientListKey, signal?: AbortSignal) => {
    try {
      const response = await fetch(getApiUrl(`/api/marketing-email/streams/${encodeURIComponent(streamKey)}/members?limit=120`), {
        method: 'GET',
        credentials: 'include',
        signal,
      });
      const payload = await response.json() as { ok?: boolean; error?: string; members?: MarketingEmailAudienceMember[] };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Marketing Email members failed (${response.status})`);
      setEmailAudienceMembers(Array.isArray(payload.members) ? payload.members : []);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setEmailAudienceMembers([]);
      setEmailAudienceError(error instanceof Error ? error.message : 'Marketing Email members failed');
    }
  }, []);

  const refreshMarketingEmailStreams = useCallback(async () => {
    setEmailAudienceRefreshing(true);
    setEmailAudienceError(null);
    try {
      const response = await fetch(getApiUrl('/api/marketing-email/streams/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 2500 }),
      });
      const payload = await response.json() as { ok?: boolean; error?: string; streams?: MarketingEmailAudienceStream[]; generatedAt?: string; sourceCount?: number };
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `Marketing Email refresh failed (${response.status})`);
      setEmailAudienceStreams(Array.isArray(payload.streams) ? payload.streams : []);
      setEmailAudienceGeneratedAt(payload.generatedAt || null);
      await loadMarketingEmailMembers(selectedEmailCampaignAudience);
      setEmailCampaignSendResult({ status: 'saved', message: `Audience refreshed from ${(payload.sourceCount ?? 0).toLocaleString('en-GB')} source rows` });
    } catch (error) {
      setEmailAudienceError(error instanceof Error ? error.message : 'Marketing Email refresh failed');
    } finally {
      setEmailAudienceRefreshing(false);
    }
  }, [loadMarketingEmailMembers, selectedEmailCampaignAudience]);

  useEffect(() => {
    if (effectiveWorkspacePage !== 'email') return undefined;
    const controller = new AbortController();
    void loadMarketingEmailStreams(controller.signal);
    return () => controller.abort();
  }, [effectiveWorkspacePage, loadMarketingEmailStreams]);

  useEffect(() => {
    if (effectiveWorkspacePage !== 'email') return undefined;
    const controller = new AbortController();
    void loadMarketingEmailMembers(selectedEmailCampaignAudience, controller.signal);
    return () => controller.abort();
  }, [effectiveWorkspacePage, loadMarketingEmailMembers, selectedEmailCampaignAudience]);

  const selectedChannelLabel = effectiveChannelPage === 'seo' ? 'SEO' : 'PPC';
  const seoChannelEnquiries = useMemo(() => metrics.enquiries.filter((row) => readStraightSourceChannel(row) === 'seo'), [metrics.enquiries]);
  const ppcChannelEnquiries = useMemo(() => metrics.enquiries.filter((row) => readStraightSourceChannel(row) === 'ppc'), [metrics.enquiries]);
  const ppcLedgerRows = ledgerRowsByTab.ppc ?? [];
  const googleAdsFeedTotals = useMemo(() => buildGoogleAdsTotals(googleAdsRows), [googleAdsRows]);
  const hasGoogleAdsFeedTotals = hasGoogleAdsTotals(googleAdsFeedTotals);
  const selectedChannelIntake = selectedIntakeByChannel[effectiveChannelPage] ?? 'all';
  const selectedChannelBaseEnquiries = effectiveChannelPage === 'seo' ? seoChannelEnquiries : ppcChannelEnquiries;
  const selectedChannelEnquiries = filterEnquiriesByIntake(selectedChannelBaseEnquiries, selectedChannelIntake);

  const intakeSelectionLabel = (selection: IntakeFilterSelection): string => (
    selection === 'all' ? 'All contact methods' : intakeFilterMeta[selection].label
  );

  const buildJourneyForChannel = (
    channel: MarketingChannelKey,
    sourceValue: string,
    sourceEnquiries: MarketingWorkspaceRow[],
  ) => {
    const selectedIntake = selectedIntakeByChannel[channel] ?? 'all';
    const filteredEnquiries = filterEnquiriesByIntake(sourceEnquiries, selectedIntake);
    const downstream = buildDownstreamMatchSummary(
      filteredEnquiries,
      metrics.pitches,
      metrics.instructions,
      metrics.matters,
      metrics.collectedRows,
    );
    const anchorDetail = `${formatNumber(downstream.anchorCount)} main-value anchors`;
    const stages: JourneyMetric[] = [
      {
        key: 'pitches',
        label: 'Pitches',
        value: formatNumber(downstream.pitches.length),
        detail: `${formatNumber(metrics.pitches.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'instructions',
        label: 'Instructions',
        value: formatNumber(downstream.instructions.length),
        detail: `${formatNumber(metrics.instructions.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'matters',
        label: 'Matters',
        value: formatNumber(downstream.matters.length),
        detail: `${formatNumber(metrics.matters.length)} in window`,
        basis: anchorDetail,
      },
      {
        key: 'collected',
        label: 'Collected',
        value: formatCurrency(downstream.collected),
        detail: `${formatNumber(downstream.collectedRows.length)} fee rows`,
        basis: `Matched from ${sourceValue}`,
      },
    ];
    const matchSummary: JourneyMatchSummary = {
      selectedIntakeLabel: intakeSelectionLabel(selectedIntake),
      sourceEnquiries: sourceEnquiries.length,
      filteredEnquiries: filteredEnquiries.length,
      anchorCount: downstream.anchorCount,
      instructionRefCount: collectMatchValues(downstream.pitches, ['instructionRef']).size,
      matterRefCount: collectMatchValues(downstream.instructions, ['matterRef', 'matterId']).size,
      matterIdCount: collectMatchValues(downstream.matters, ['matterId', 'matterRef']).size,
      matchedPitches: downstream.pitches.length,
      matchedInstructions: downstream.instructions.length,
      matchedMatters: downstream.matters.length,
      matchedCollectedRows: downstream.collectedRows.length,
      chainNotes: [
        `Enquiry: Ultimate_Source = ${sourceValue}`,
        `Pitch: enquiry ACID/ID -> Deals ProspectId (${formatNumber(downstream.anchorCount)} anchors -> ${formatNumber(downstream.pitches.length)} pitches)`,
        `Instruction: Deal InstructionRef -> Instructions InstructionRef (${formatNumber(collectMatchValues(downstream.pitches, ['instructionRef']).size)} refs -> ${formatNumber(downstream.instructions.length)} instructions)`,
        `Matter: Instruction MatterId/MatterID -> matter id/display ref (${formatNumber(collectMatchValues(downstream.instructions, ['matterRef', 'matterId']).size)} refs -> ${formatNumber(downstream.matters.length)} matters)`,
        `Collected: matter id -> collectedTime.matter_id (${formatNumber(collectMatchValues(downstream.matters, ['matterId', 'matterRef']).size)} matter ids -> ${formatNumber(downstream.collectedRows.length)} rows)`,
      ],
    };
    return { selectedIntake, filteredEnquiries, downstream, stages, matchSummary };
  };

  const seoJourney = buildJourneyForChannel('seo', 'Organic search', seoChannelEnquiries);
  const ppcJourney = buildJourneyForChannel('ppc', 'Paid search', ppcChannelEnquiries);
  const selectedJourney = effectiveChannelPage === 'seo' ? seoJourney : ppcJourney;
  const attributionSpend = searchAttributionValue?.spendAssumption ?? {
    ppcSpend: metrics.paid.cost,
    seoEstimate: SEO_SPEND_ESTIMATE,
    totalEstimatedSearchSpend: metrics.paid.cost + SEO_SPEND_ESTIMATE,
    seoBasis: 'GBP 8,400 per month for April, May, and June',
  };
  const seoEnquiryCount = searchAttributionValue?.searchEnquiries?.organicSearch ?? seoChannelEnquiries.length;
  const ppcEnquiryCount = searchAttributionValue?.searchEnquiries?.paidSearch ?? ppcChannelEnquiries.length;
  const seoMethodCounts = buildValueSheetMethodCounts(seoChannelEnquiries, seoEnquiryCount);
  const ppcMethodCounts = buildValueSheetMethodCounts(ppcChannelEnquiries, ppcEnquiryCount);
  const seoReceived = searchAttributionValue?.combinedCollectedAndUpfront.organicSearch ?? seoJourney.downstream.collected;
  const ppcReceived = searchAttributionValue?.combinedCollectedAndUpfront.paidSearch ?? ppcJourney.downstream.collected;
  const seoWip = searchAttributionValue?.chargeableWip.organicSearch.amount ?? 0;
  const ppcWip = searchAttributionValue?.chargeableWip.paidSearch.amount ?? 0;
  const seoMatterCount = searchAttributionValue?.searchMatters.organicSearch ?? seoJourney.downstream.matters.length;
  const ppcMatterCount = searchAttributionValue?.searchMatters.paidSearch ?? ppcJourney.downstream.matters.length;
  const fallbackEmailCampaignRecipients = useMemo(() => buildEmailCampaignRecipients(metrics.enquiries, appliedEmailCampaignDateRange), [appliedEmailCampaignDateRange, metrics.enquiries]);
  const emailAudienceMemberPreviews = useMemo(() => emailAudienceMembers.map(emailAudienceMemberToPreview), [emailAudienceMembers]);
  const emailCampaignRecipients = emailAudienceStreams.length > 0 ? emailAudienceMemberPreviews : fallbackEmailCampaignRecipients;
  const fallbackEmailCampaignRecipientStats = useMemo(() => buildEmailCampaignRecipientStats(fallbackEmailCampaignRecipients), [fallbackEmailCampaignRecipients]);
  const emailAudienceRecipientStats = useMemo(() => buildEmailCampaignStatsFromStreams(emailAudienceStreams), [emailAudienceStreams]);
  const emailCampaignRecipientStats = emailAudienceStreams.length > 0 ? emailAudienceRecipientStats : fallbackEmailCampaignRecipientStats;
  const emailCampaignAllStats = emailCampaignRecipientStats.all ?? { scanned: 0, qualified: 0, blocked: 0 };
  const searchSheetAccent = colours.highlight;
  const valueSheetSpendAccent = colours.highlight;
  const valueSheetReturnAccent = colours.green;
  const valueSheetSourceAccent = isDarkMode ? colours.subtleGrey : colours.greyText;
  const valueSheetEmailAccent = isDarkMode ? colours.highlight : colours.green;
  const valueSheetRows: MarketingValueSheetRow[] = [
    {
      key: 'organicSearch',
      source: 'Organic search',
      activityLabel: 'Sessions',
      activityValue: formatNumber(metrics.website.sessions),
      enquiries: seoEnquiryCount,
      matters: seoMatterCount,
      spend: attributionSpend.seoEstimate,
      received: seoReceived,
      wip: seoWip,
      totalValue: seoReceived + seoWip,
      accent: valueSheetSourceAccent,
    },
    {
      key: 'paidSearch',
      source: 'Paid search',
      activityLabel: 'Clicks',
      activityValue: formatNumber(metrics.paid.clicks),
      enquiries: ppcEnquiryCount,
      matters: ppcMatterCount,
      spend: attributionSpend.ppcSpend,
      received: ppcReceived,
      wip: ppcWip,
      totalValue: ppcReceived + ppcWip,
      accent: valueSheetSourceAccent,
    },
    {
      key: 'emailMarketing',
      source: 'Email',
      activityLabel: 'Recipients',
      activityValue: formatNumber(emailCampaignAllStats.qualified),
      enquiries: emailCampaignAllStats.qualified,
      matters: 0,
      spend: 0,
      received: 0,
      wip: 0,
      totalValue: 0,
      accent: valueSheetEmailAccent,
    },
  ];
  const valueSheetTotals = valueSheetRows.reduce((acc, row) => ({
    enquiries: acc.enquiries + row.enquiries,
    matters: acc.matters + row.matters,
    spend: acc.spend + row.spend,
    received: acc.received + row.received,
    wip: acc.wip + row.wip,
    totalValue: acc.totalValue + row.totalValue,
  }), { enquiries: 0, matters: 0, spend: 0, received: 0, wip: 0, totalValue: 0 });
  const valueSheetTotalValue = valueSheetTotals.totalValue;
  const valueSheetReceivedValue = valueSheetTotals.received;
  const valueSheetSpendValue = valueSheetTotals.spend;
  const totalReturnMultiple = formatReturnMultiple(valueSheetTotalValue, valueSheetSpendValue);
  const receivedReturnMultiple = formatReturnMultiple(valueSheetReceivedValue, valueSheetSpendValue);
  const valueSheetDisplayRows: MarketingValueSheetRow[] = [
    ...valueSheetRows,
    {
      key: 'totalSearch',
      source: 'Total channels',
      activityLabel: 'Channels',
      activityValue: formatNumber(valueSheetRows.length),
      enquiries: valueSheetTotals.enquiries,
      matters: valueSheetTotals.matters,
      spend: valueSheetTotals.spend,
      received: valueSheetTotals.received,
      wip: valueSheetTotals.wip,
      totalValue: valueSheetTotalValue,
      accent: valueSheetSourceAccent,
    },
  ];

  const emailPlaceholderStages: JourneyMetric[] = [
    { key: 'pitches', label: 'Pitches', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'instructions', label: 'Instructions', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'matters', label: 'Matters', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
    { key: 'collected', label: 'Collected', value: '-', detail: 'Not active', basis: 'Source linkage not consumed yet' },
  ];

  const channelStatusStrip = [
    { key: 'seo', label: 'SEO', status: 'enabled' as const },
    { key: 'ppc', label: 'PPC', status: 'enabled' as const },
    { key: 'email', label: 'Email', status: 'off' as const },
  ];

  const channelJourneyBanners: MarketingJourneyBanner[] = [
    {
      key: 'seo',
      label: 'SEO',
      sourceLabel: 'Organic search',
      headline: formatNumber(metrics.website.sessions),
      liveLabel: 'SEO live view',
      subline: `${formatNumber(seoChannelEnquiries.length)} attributed enquiries`,
      attribution: 'Source field: Organic search',
      evidence: 'GA4 traffic + enquiry source value',
      status: 'live',
      enabled: true,
      accent: isDarkMode ? colours.highlight : colours.helixBlue,
      enquiryCount: seoJourney.filteredEnquiries.length,
      enquiryDetail: seoJourney.selectedIntake === 'all' ? 'Organic search enquiries' : `${intakeSelectionLabel(seoJourney.selectedIntake)} enquiries from Organic search`,
      intake: buildIntakeBreakdown(seoChannelEnquiries),
      stages: seoJourney.stages,
      matchSummary: seoJourney.matchSummary,
    },
    {
      key: 'ppc',
      label: 'PPC',
      sourceLabel: 'Paid search',
      headline: formatNumber(metrics.paid.conversions),
      liveLabel: 'PPC live view',
      subline: `${formatCurrency(metrics.paid.cost)} spend`,
      attribution: `${formatNumber(ppcChannelEnquiries.length)} attributed enquiries`,
      evidence: 'Google Ads telemetry + Paid search source value',
      status: 'live',
      enabled: true,
      accent: colours.green,
      enquiryCount: ppcJourney.filteredEnquiries.length,
      enquiryDetail: ppcJourney.selectedIntake === 'all' ? 'Paid search enquiries' : `${intakeSelectionLabel(ppcJourney.selectedIntake)} enquiries from Paid search`,
      intake: buildIntakeBreakdown(ppcChannelEnquiries),
      stages: ppcJourney.stages,
      matchSummary: ppcJourney.matchSummary,
    },
    {
      key: 'email',
      label: 'Email',
      sourceLabel: 'Email',
      headline: '-',
      liveLabel: 'Email channel',
      subline: 'Attribution lane not active',
      attribution: 'Email channel off',
      evidence: 'Reserved for email counts later',
      status: 'off',
      enabled: false,
      accent: withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.48 : 0.56),
      enquiryCount: 0,
      enquiryDetail: 'Email source not linked',
      intake: { calls: 0, forms: 0, email: 0, other: 0 },
      stages: emailPlaceholderStages,
      matchSummary: {
        selectedIntakeLabel: 'All contact methods',
        sourceEnquiries: 0,
        filteredEnquiries: 0,
        anchorCount: 0,
        instructionRefCount: 0,
        matterRefCount: 0,
        matterIdCount: 0,
        matchedPitches: 0,
        matchedInstructions: 0,
        matchedMatters: 0,
        matchedCollectedRows: 0,
        chainNotes: [
          'Enquiry: email source not linked yet',
          'Pitch: waiting for email attribution chain',
          'Instruction: waiting for pitch link',
          'Matter: waiting for instruction ref',
          'Collected: waiting for matter id',
        ],
      },
    },
  ];

  const toIntakeChips = (intake: IntakeBreakdown) => intakeFilterOrder.map((key) => ({
    key,
    label: intakeFilterMeta[key].label,
    iconName: intakeFilterMeta[key].iconName,
    value: intake[key],
  }));

  const selectedJourneyBanner = channelJourneyBanners.find((banner) => banner.key === effectiveChannelPage);

  const evidenceCards: ChannelMetric[] = [
    {
      label: 'Source confidence',
      value: formatNumber(metrics.classifiedEnquiries),
      detail: `${formatNumber(metrics.unclassifiedEnquiries)} unclassified in this window`,
    },
    {
      label: 'Teams-visible intake',
      value: formatNumber(metrics.intakeBreakdown.calls + metrics.intakeBreakdown.forms),
      detail: `${formatNumber(metrics.intakeBreakdown.calls)} calls, ${formatNumber(metrics.intakeBreakdown.forms)} forms`,
    },
    {
      label: 'Pitch follow-up',
      value: formatNumber(metrics.outstandingPitches),
      detail: `${formatNumber(metrics.closedPitches)} pitches closed or instructed`,
    },
  ];

  const textColour = isDarkMode ? colours.dark.text : colours.darkBlue;
  const mutedColour = isDarkMode ? 'var(--text-body)' : colours.greyText;
  const valueSheetAccent = searchSheetAccent;
  const selectedChannelAccent = effectiveChannelPage === 'ppc'
    ? colours.green
    : searchSheetAccent;
  const marketingReportToday = useMemo(() => dateKey(new Date()), []);
  const marketingReportRangeError = (() => {
    if (!isDateKeyValue(marketingReportRange.startDate) || !isDateKeyValue(marketingReportRange.endDate)) return 'Use valid dates.';
    if (marketingReportRange.startDate < SEARCH_MARKETING_REPORT_MIN_DATE) return `Start on or after ${SEARCH_MARKETING_REPORT_MIN_DATE}.`;
    if (marketingReportRange.endDate > marketingReportToday) return 'End on or before today.';
    if (marketingReportRange.startDate > marketingReportRange.endDate) return 'Start must be before end.';
    return '';
  })();
  const downloadMarketingReport = async () => {
    if (marketingReportRangeError) {
      setMarketingReportDownloadState({ status: 'error', message: marketingReportRangeError });
      return;
    }
    const params = new URLSearchParams({ from: marketingReportRange.startDate, to: marketingReportRange.endDate });
    const fallbackFileName = `search-marketing-value-${marketingReportRange.startDate}-to-${marketingReportRange.endDate}.pdf`;
    setMarketingReportDownloadState({ status: 'downloading', message: 'Preparing PDF...' });
    try {
      const response = await fetch(getApiUrl(`/api/search-attribution/value-report.pdf?${params.toString()}`), {
        method: 'GET',
        credentials: 'include',
      });
      if (!response.ok) {
        let message = `Report download failed (${response.status})`;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const payload = await response.json() as { message?: string; error?: string };
          message = payload.message || payload.error || message;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = readDownloadFilename(response.headers.get('content-disposition'), fallbackFileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(href), 0);
      setMarketingReportDownloadState({ status: 'ready', message: 'PDF download started.' });
    } catch (error) {
      setMarketingReportDownloadState({ status: 'error', message: error instanceof Error ? error.message : 'Report download failed.' });
    }
  };
  const [rightPanelMode, setRightPanelMode] = useState<'enquiries' | 'matters'>('enquiries');
  const rightPanelRows = rightPanelMode === 'matters' ? selectedJourney.downstream.matters.slice(0, 6) : selectedChannelEnquiries.slice(0, 6);
  const splitSharedBorder = reportingPanelBorder(isDarkMode);
  const splitLeftSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitLeftBorder = splitSharedBorder;
  const splitLeftAccent = isDarkMode ? colours.blue : colours.helixBlue;
  const splitLeftText = textColour;
  const splitLeftMuted = mutedColour;
  const splitLeftLabel = isDarkMode ? colours.subtleGrey : colours.helixBlue;
  const splitRightSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
  const splitRightBorder = splitSharedBorder;
  const splitRightAccent = isDarkMode ? colours.highlight : colours.blue;
  const splitRightText = textColour;
  const splitRightMuted = mutedColour;
  const splitRightLabel = isDarkMode ? colours.highlight : colours.helixBlue;
  const toggleContainerBackground = withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.02 : 0.04);
  const splitPanelHeight = 240;
  const leftToggleButtonStyle: React.CSSProperties = {
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    width: '100%',
    minHeight: 24,
    padding: '0 8px',
    cursor: 'pointer',
    textAlign: 'center',
    lineHeight: 1,
  };
  const rightToggleButtonStyle: React.CSSProperties = {
    ...leftToggleButtonStyle,
  };
  const channelEntryCardFill = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.98);
  const channelEntryFooterFill = isDarkMode ? colours.websiteBlue : colours.grey;
  const channelEntryBorder = isDarkMode ? withAlpha(colours.dark.borderColor, 0.38) : withAlpha(colours.greyText, 0.14);
  const renderMarketingChannelEntries = (blueprint = false) => (
    <section
      data-helix-region="marketing/channel-entry"
      style={{
        display: 'grid',
        gap: 8,
        minWidth: 0,
      }}
    >
      <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: mutedColour, textTransform: 'uppercase', letterSpacing: 0 }}>
          Marketing channel workbenches
        </span>
      </span>
      <div
        aria-label="Marketing channel workbench entry points"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, minWidth: 0 }}
      >
        {channelJourneyBanners.map((banner) => {
          const channelKey = banner.key === 'seo' || banner.key === 'ppc' ? banner.key : null;
          const opensEmailWorkspace = banner.key === 'email';
          const canOpen = channelKey !== null || opensEmailWorkspace;
          const dimmed = !canOpen;
          const statusValue = opensEmailWorkspace ? 'Email page' : 'Channel page';
          const statusDetail = opensEmailWorkspace ? 'List and draft workspace' : 'Report and campaign workspace';
          return (
            <button
              key={banner.key}
              type="button"
              aria-disabled={!canOpen}
              disabled={blueprint}
              onClick={() => {
                if (channelKey) {
                  setMarketingWorkspacePage(channelKey);
                  return;
                }
                if (opensEmailWorkspace) {
                  setMarketingWorkspacePage('email');
                  window.setTimeout(() => document.querySelector<HTMLElement>('[data-helix-region="marketing/channel-surface"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 0);
                }
              }}
              style={{
                display: 'grid',
                gridTemplateRows: '1fr auto',
                alignItems: 'stretch',
                minHeight: 104,
                width: '100%',
                padding: 0,
                textAlign: 'left',
                borderStyle: 'solid',
                borderWidth: 1,
                borderColor: channelEntryBorder,
                borderRadius: 0,
                background: dimmed ? (isDarkMode ? withAlpha(colours.dark.cardHover, 0.42) : channelEntryCardFill) : channelEntryCardFill,
                boxShadow: dimmed ? 'none' : reportingPanelShadow(isDarkMode),
                color: textColour,
                opacity: dimmed ? 0.64 : 1,
                overflow: 'hidden',
                cursor: canOpen && !blueprint ? 'pointer' : 'default',
                fontFamily: 'Raleway, sans-serif',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, padding: '12px 14px 11px' }}>
                <span style={{ fontSize: 14, lineHeight: 1.1, fontWeight: 900, color: textColour, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {banner.label}
                </span>
                <span style={{ fontSize: 10, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.3, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {banner.sourceLabel}
                </span>
              </span>
              <span style={{ display: 'block', width: '100%', padding: '9px 11px 10px 13px', background: channelEntryFooterFill, borderTop: `1px solid ${channelEntryBorder}` }}>
                <span style={{ display: 'grid', alignItems: 'center', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, minWidth: 0, width: '100%' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span aria-hidden="true" style={{ width: 3, height: 24, flex: '0 0 auto', background: banner.accent, opacity: dimmed ? 0.48 : 1 }} />
                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                      {blueprint ? (
                        <span className="marketing-skeleton-line" style={{ width: 90, height: 11 }} />
                      ) : (
                        <span style={{ color: textColour, fontSize: 11, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {statusValue}
                        </span>
                      )}
                      <span style={{ color: mutedColour, fontSize: 9, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {statusDetail}
                      </span>
                    </span>
                  </span>
                  <span
                    className="data-hub-dataset-open-cue"
                    style={{
                      ['--data-hub-dataset-open-tone' as string]: banner.accent,
                      border: `1px solid ${channelEntryBorder}`,
                      background: 'transparent',
                      color: textColour,
                      padding: '0 10px',
                      minHeight: 28,
                      fontSize: 9,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                    } as React.CSSProperties}
                  >
                    <span>{canOpen ? 'Enter' : 'Soon'}</span>
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
  const emailCampaignAccent = isDarkMode ? colours.highlight : colours.green;
  const emailCampaignPanelBorder = reportingPanelBorder(isDarkMode);
  const emailCampaignCardBackground = reportingPanelBackground(isDarkMode, 'elevated');
  const emailCampaignControlBackground = withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.64 : 0.84);
  const emailCampaignWindowMinDate = useMemo(() => dateKey(addDays(new Date(), -(EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1))), []);
  const emailCampaignWindowStartOffset = getEmailCampaignWindowOffset(emailCampaignWindowMinDate, emailCampaignDateRange.startDate);
  const emailCampaignWindowEndOffset = getEmailCampaignWindowOffset(emailCampaignWindowMinDate, emailCampaignDateRange.endDate);
  const emailCampaignWindowStartPercent = (emailCampaignWindowStartOffset / (EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1)) * 100;
  const emailCampaignWindowEndPercent = (emailCampaignWindowEndOffset / (EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1)) * 100;
  const emailCampaignRangeDays = getEmailCampaignRangeDays(emailCampaignDateRange);
  const emailCampaignWindowLabel = formatEmailCampaignWindowLabel(emailCampaignDateRange);
  const emailCampaignDraftChanged = emailCampaignDateRange.startDate !== appliedEmailCampaignDateRange.startDate || emailCampaignDateRange.endDate !== appliedEmailCampaignDateRange.endDate;
  const selectedEmailCampaignTemplate = EMAIL_CAMPAIGN_PLACEHOLDERS.find((campaign) => campaign.key === selectedEmailCampaignKey) ?? EMAIL_CAMPAIGN_PLACEHOLDERS[0];
  const selectedEmailCampaignListLabel = EMAIL_CAMPAIGN_AUDIENCE_OPTIONS.find((option) => option.key === selectedEmailCampaignAudience)?.label ?? 'All new-space enquiries';
  const operatorEmailForCampaign = String(operatorEmail || '').trim();
  const emailCampaignCanSendTest = Boolean(operatorEmailForCampaign && emailCampaignDraftSubject.trim() && emailCampaignDraftBody.trim());
  const selectedEmailCampaignRecipients = useMemo(() => emailCampaignRecipients.filter((row) => !row.blockedReason && emailCampaignRecipientMatchesList(row, selectedEmailCampaignAudience)), [emailCampaignRecipients, selectedEmailCampaignAudience]);
  const selectedEmailCampaignBlockedRecipients = useMemo(() => emailCampaignRecipients.filter((row) => row.blockedReason && emailCampaignRecipientMatchesList(row, selectedEmailCampaignAudience)), [emailCampaignRecipients, selectedEmailCampaignAudience]);
  const selectedEmailCampaignPreviewRows = selectedEmailCampaignRecipients.slice(0, EMAIL_CAMPAIGN_PREVIEW_LIMIT);
  const selectedEmailCampaignStats = emailCampaignRecipientStats[selectedEmailCampaignAudience] ?? { scanned: 0, qualified: 0, blocked: 0 };
  const selectedEmailAudienceStream = emailAudienceStreams.find((stream) => stream.streamKey === selectedEmailCampaignAudience) || null;
  const selectedEmailCampaignIsLiveStream = selectedEmailAudienceStream?.isSendable ?? selectedEmailCampaignAudience !== 'other';
  const emailCampaignMonthRecipients = useMemo(() => buildEmailCampaignRecipients(metrics.enquiries, getEmailCampaignCurrentMonthRange()), [metrics.enquiries]);
  const emailCampaignQuarterRecipients = useMemo(() => buildEmailCampaignRecipients(metrics.enquiries, getEmailCampaignCurrentQuarterRange()), [metrics.enquiries]);
  const emailCampaignMonthStats = useMemo(() => buildEmailCampaignRecipientStats(emailCampaignMonthRecipients), [emailCampaignMonthRecipients]);
  const emailCampaignQuarterStats = useMemo(() => buildEmailCampaignRecipientStats(emailCampaignQuarterRecipients), [emailCampaignQuarterRecipients]);
  const emailAudienceStreamByKey = useMemo(() => new Map(emailAudienceStreams.map((stream) => [stream.streamKey, stream])), [emailAudienceStreams]);
  const emailCampaignListGrowthStats: EmailCampaignListGrowthStats[] = EMAIL_CAMPAIGN_AUDIENCE_OPTIONS.map((option) => ({
    ...option,
    stats: emailCampaignRecipientStats[option.key] ?? { scanned: 0, qualified: 0, blocked: 0 },
    monthStats: emailCampaignMonthStats[option.key] ?? { scanned: 0, qualified: 0, blocked: 0 },
    quarterStats: emailCampaignQuarterStats[option.key] ?? { scanned: 0, qualified: 0, blocked: 0 },
    isSendable: emailAudienceStreamByKey.get(option.key as EmailCampaignRecipientListKey)?.isSendable ?? option.key !== 'other',
    withAcid: emailAudienceStreamByKey.get(option.key as EmailCampaignRecipientListKey)?.withAcid,
    ranked: emailAudienceStreamByKey.get(option.key as EmailCampaignRecipientListKey)?.ranked,
    clients: emailAudienceStreamByKey.get(option.key as EmailCampaignRecipientListKey)?.clients,
  }));
  const selectedEmailCampaignSenderLabel = EMAIL_CAMPAIGN_SENDERS.find((sender) => sender.value === selectedEmailCampaignSender)?.label ?? selectedEmailCampaignSender;
  const selectedEmailCampaignSignatureLabel = EMAIL_CAMPAIGN_SIGNATURES.find((signature) => signature.value === selectedEmailCampaignSignature)?.label ?? selectedEmailCampaignSignature;
  const emailCampaignSetupCanLock = Boolean(selectedEmailCampaignIsLiveStream && selectedEmailCampaignSender && selectedEmailCampaignSignature && selectedEmailCampaignStats.qualified > 0);
  const emailCampaignSelectStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 32,
    border: `1px solid ${emailCampaignPanelBorder}`,
    borderRadius: 0,
    background: emailCampaignControlBackground,
    color: textColour,
    fontFamily: 'Raleway, sans-serif',
    fontSize: 11,
    fontWeight: 800,
    padding: '0 8px',
  };
  const setEmailCampaignTemplate = (key: EmailCampaignPlaceholder['key']) => {
    const nextTemplate = EMAIL_CAMPAIGN_PLACEHOLDERS.find((campaign) => campaign.key === key) ?? EMAIL_CAMPAIGN_PLACEHOLDERS[0];
    const currentTemplateSubjects = new Set(EMAIL_CAMPAIGN_PLACEHOLDERS.map((campaign) => campaign.subject));
    setSelectedEmailCampaignKey(nextTemplate.key);
    setEmailCampaignDraftSubject((current) => (!current.trim() || currentTemplateSubjects.has(current) ? nextTemplate.subject : current));
    setEmailCampaignSendResult(null);
  };
  const setEmailCampaignList = (key: EmailCampaignAudienceKey) => {
    const nextKey = (key === 'all' ? 'commercial' : key) as EmailCampaignRecipientListKey;
    setSelectedEmailCampaignAudience(nextKey as EmailCampaignRecipientListKey);
    setEmailCampaignTemplate(nextKey);
    setEmailCampaignSetupLocked(false);
    setEmailCampaignLockedRecord(null);
  };
  const setEmailCampaignSender = (value: string) => {
    setSelectedEmailCampaignSender(value);
    setEmailCampaignSetupLocked(false);
    setEmailCampaignSendResult(null);
  };
  const setEmailCampaignSignature = (value: string) => {
    setSelectedEmailCampaignSignature(value);
    setEmailCampaignSetupLocked(false);
    setEmailCampaignSendResult(null);
  };
  const lockEmailCampaignSetup = async () => {
    if (!emailCampaignSetupCanLock) return;
    setEmailCampaignLocking(true);
    setEmailCampaignSendResult(null);
    try {
      const createResponse = await fetch(getApiUrl('/api/marketing-email/campaigns'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamKey: selectedEmailCampaignAudience,
          campaignName: selectedEmailCampaignTemplate.title,
          subject: emailCampaignDraftSubject.trim(),
          preheader: emailCampaignDraftPreview.trim(),
          body: emailCampaignDraftBody,
          senderEmail: selectedEmailCampaignSender,
          signatureMode: selectedEmailCampaignSignature,
          excludeClients: true,
        }),
      });
      const createPayload = await createResponse.json() as { ok?: boolean; error?: string; campaign?: MarketingEmailCampaign };
      if (!createResponse.ok || createPayload.ok === false || !createPayload.campaign?.campaignId) {
        throw new Error(createPayload.error || `Campaign create failed (${createResponse.status})`);
      }
      const lockResponse = await fetch(getApiUrl(`/api/marketing-email/campaigns/${encodeURIComponent(createPayload.campaign.campaignId)}/lock`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const lockPayload = await lockResponse.json() as { ok?: boolean; error?: string; campaign?: MarketingEmailCampaign };
      if (!lockResponse.ok || lockPayload.ok === false || !lockPayload.campaign) {
        throw new Error(lockPayload.error || `Campaign lock failed (${lockResponse.status})`);
      }
      setEmailCampaignLockedRecord(lockPayload.campaign);
      setEmailCampaignSetupLocked(true);
      setEmailCampaignSendResult({ status: 'saved', message: `Campaign locked for ${(lockPayload.campaign.selectedCount ?? selectedEmailCampaignStats.qualified).toLocaleString('en-GB')} sendable members` });
    } catch (error) {
      setEmailCampaignSendResult({ status: 'error', message: error instanceof Error ? error.message : 'Campaign lock failed' });
    } finally {
      setEmailCampaignLocking(false);
    }
  };
  const saveEmailCampaignDraft = () => {
    setEmailCampaignSendResult({ status: 'saved', message: 'Draft held in this workspace' });
  };
  const sendEmailCampaignTest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailCampaignCanSendTest) {
      setEmailCampaignSendResult({ status: 'error', message: operatorEmailForCampaign ? 'Add subject and body' : 'Current user email unavailable' });
      return;
    }
    setEmailCampaignTestSending(true);
    setEmailCampaignSendResult(null);
    try {
      const response = await fetch(getApiUrl('/api/enquiries-unified/email-lists/test-send'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demoMode: true,
          enquiryId: EMAIL_CAMPAIGN_DEMO_ENQUIRY_ID,
          recipientEmail: operatorEmailForCampaign,
          sender: selectedEmailCampaignSender,
          campaignName: selectedEmailCampaignTemplate.title,
          subject: emailCampaignDraftSubject.trim(),
          preheader: emailCampaignDraftPreview.trim(),
          body: emailCampaignDraftBody.trim(),
          signatureInitials: operatorInitials || '',
          signatureMode: selectedEmailCampaignSignature,
          operatorName: operatorName || operatorInitials || '',
          operatorEmail: operatorEmailForCampaign,
          operatorConsent: 'email-lists-limited-stream',
          operatorActor: operatorInitials || operatorName || 'operator',
        }),
      });
      const payload = await response.json() as { error?: string; requestId?: string; sendGridMessageId?: string };
      if (!response.ok) throw new Error(payload.error || `SendGrid test failed (${response.status})`);
      setEmailCampaignSendResult({
        status: 'ready',
        message: 'Test email sent to you',
        requestId: payload.requestId || null,
        sendGridMessageId: payload.sendGridMessageId || null,
      });
    } catch (error) {
      setEmailCampaignSendResult({ status: 'error', message: error instanceof Error ? error.message : 'SendGrid test failed' });
    } finally {
      setEmailCampaignTestSending(false);
    }
  };
  const setEmailCampaignWindowStartOffset = (nextOffset: number) => {
    setEmailCampaignDateRange((current) => {
      const currentEndOffset = getEmailCampaignWindowOffset(emailCampaignWindowMinDate, current.endDate);
      const clampedOffset = Math.min(Math.max(0, nextOffset), currentEndOffset);
      return { ...current, startDate: getEmailCampaignDateAtOffset(emailCampaignWindowMinDate, clampedOffset) };
    });
    setEmailCampaignSetupLocked(false);
    setEmailCampaignSendResult(null);
  };
  const setEmailCampaignWindowEndOffset = (nextOffset: number) => {
    setEmailCampaignDateRange((current) => {
      const currentStartOffset = getEmailCampaignWindowOffset(emailCampaignWindowMinDate, current.startDate);
      const clampedOffset = Math.max(currentStartOffset, Math.min(EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1, nextOffset));
      return { ...current, endDate: getEmailCampaignDateAtOffset(emailCampaignWindowMinDate, clampedOffset) };
    });
    setEmailCampaignSetupLocked(false);
    setEmailCampaignSendResult(null);
  };
  const applyEmailCampaignDateRange = () => {
    setAppliedEmailCampaignDateRange(emailCampaignDateRange);
    setEmailCampaignSetupLocked(false);
    setEmailCampaignSendResult(null);
  };
  const renderEmailCampaignWorkbench = (blueprint = false) => {
    const surfaceOpen = effectiveWorkspacePage === 'email' && !blueprint;
    return (
    <section data-helix-region="marketing/email-campaigns" style={{ display: 'grid', gap: surfaceOpen ? 0 : 8, minWidth: 0 }}>
      {!surfaceOpen ? (
        <button
          type="button"
          data-helix-region="marketing/email-campaigns/card"
          onClick={() => setMarketingWorkspacePage('email')}
          disabled={blueprint}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 14,
            minWidth: 0,
            padding: 0,
            overflow: 'hidden',
            textAlign: 'left',
            borderStyle: 'solid',
            borderWidth: '2px 1px 1px',
            borderColor: `${emailCampaignAccent} ${emailCampaignPanelBorder} ${emailCampaignPanelBorder}`,
            backgroundColor: emailCampaignCardBackground,
            color: textColour,
            cursor: blueprint ? 'default' : 'pointer',
            fontFamily: 'Raleway, sans-serif',
          }}
        >
          <span style={{ display: 'grid', gap: 10, minWidth: 0, padding: '16px 18px' }}>
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: emailCampaignAccent }}>
                Email lists
              </span>
              <strong style={{ fontSize: 19, lineHeight: 1.08, fontWeight: 900, color: textColour }}>
                New-space recipient lists
              </strong>
              <span style={{ fontSize: 12, lineHeight: 1.35, fontWeight: 700, color: mutedColour }}>
                Qualify recipients by area of work, preview included contacts, and prepare the email draft.
              </span>
            </span>
            <span style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 8, minWidth: 0 }}>
              {[
                { label: 'Qualified', value: formatNumber(emailCampaignRecipientStats.all.qualified), tone: textColour },
                { label: 'Held back', value: formatNumber(emailCampaignRecipientStats.all.blocked), tone: emailCampaignRecipientStats.all.blocked > 0 ? colours.orange : textColour },
                { label: 'Selected list', value: formatNumber(selectedEmailCampaignStats.qualified), tone: emailCampaignAccent },
              ].map((item) => (
                <span key={item.label} style={{ display: 'grid', gap: 2, minWidth: 0, padding: '8px 9px', border: `1px solid ${emailCampaignPanelBorder}`, background: emailCampaignControlBackground }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: mutedColour, textTransform: 'uppercase' }}>{item.label}</span>
                  <strong style={{ fontSize: 18, fontWeight: 900, color: item.tone }}>{blueprint ? '-' : item.value}</strong>
                </span>
              ))}
            </span>
          </span>
          <span style={{ alignSelf: 'stretch', display: 'grid', placeItems: 'center', minWidth: 138, padding: '16px 18px', borderLeft: `1px solid ${emailCampaignPanelBorder}`, background: withAlpha(emailCampaignAccent, isDarkMode ? 0.11 : 0.07) }}>
            <span className="data-hub-dataset-open-cue" style={{ ['--data-hub-dataset-open-tone' as string]: emailCampaignAccent } as React.CSSProperties}>
              <span>Open</span>
            </span>
          </span>
        </button>
      ) : (
      <section
        data-helix-region="marketing/email-campaigns/workbench"
        style={{
          display: 'grid',
          gap: 0,
          padding: 0,
          overflow: 'hidden',
          minWidth: 0,
          borderStyle: 'solid',
          borderWidth: '2px 1px 1px',
          borderColor: `${emailCampaignAccent} ${emailCampaignPanelBorder} ${emailCampaignPanelBorder}`,
          backgroundColor: emailCampaignCardBackground,
        }}
      >
        <div
          className="email-lists-workbench"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 14px 14px',
            minWidth: 0,
            '--email-list-edge': emailCampaignPanelBorder,
            '--email-list-surface': emailCampaignCardBackground,
            '--email-list-elevated': emailCampaignControlBackground,
            '--email-list-footer': withAlpha(isDarkMode ? colours.dark.sectionBackground : colours.grey, isDarkMode ? 0.34 : 0.5),
            '--email-list-control': withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.05 : 0.055),
            '--email-list-hover': withAlpha(emailCampaignAccent, isDarkMode ? 0.12 : 0.07),
            '--email-list-selected': withAlpha(emailCampaignAccent, isDarkMode ? 0.14 : 0.08),
            '--email-list-text': textColour,
            '--email-list-body': textColour,
            '--email-list-muted': mutedColour,
            '--email-list-tone': emailCampaignAccent,
            '--email-list-soft': withAlpha(emailCampaignAccent, isDarkMode ? 0.13 : 0.08),
            '--email-list-accent-soft': withAlpha(emailCampaignAccent, isDarkMode ? 0.13 : 0.08),
            '--email-list-warning': colours.orange,
            '--email-list-warning-soft': withAlpha(colours.orange, isDarkMode ? 0.14 : 0.09),
          } as React.CSSProperties}
        >
          <div
            className="email-lists-window-control"
            data-helix-region="marketing/email-campaigns/date-window"
          >
            <div className="email-lists-window-summary">
              <span className="email-lists-eyebrow">Window</span>
              {blueprint ? (
                <span className="marketing-skeleton-line" style={{ width: 48, height: 18 }} />
              ) : (
                <strong>{emailCampaignRangeDays > 0 ? `${emailCampaignRangeDays}d` : 'Set'}</strong>
              )}
              <small>{emailCampaignWindowLabel}</small>
            </div>
            <div className="email-lists-window-slider" style={{ '--email-list-range-start': `${emailCampaignWindowStartPercent}%`, '--email-list-range-end': `${emailCampaignWindowEndPercent}%` } as React.CSSProperties}>
              <span className="email-lists-window-track" aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1}
                value={emailCampaignWindowStartOffset}
                aria-label="Email campaign window start"
                onChange={(event) => setEmailCampaignWindowStartOffset(Number(event.currentTarget.value))}
                disabled={blueprint}
              />
              <input
                type="range"
                min={0}
                max={EMAIL_CAMPAIGN_RANGE_SPAN_DAYS - 1}
                value={emailCampaignWindowEndOffset}
                aria-label="Email campaign window end"
                onChange={(event) => setEmailCampaignWindowEndOffset(Number(event.currentTarget.value))}
                disabled={blueprint}
              />
            </div>
            <div className="email-lists-window-actions">
              <DefaultButton
                text={emailAudienceRefreshing ? 'Refreshing' : 'Refresh audience'}
                onClick={refreshMarketingEmailStreams}
                disabled={blueprint || emailAudienceRefreshing || emailAudienceLoading}
                styles={{
                  root: {
                    borderRadius: 0,
                    height: 32,
                    minWidth: 138,
                    padding: '0 10px',
                    fontWeight: 800,
                    fontSize: 10,
                    border: `1px solid ${emailCampaignPanelBorder}`,
                    background: withAlpha(emailCampaignAccent, isDarkMode ? 0.12 : 0.07),
                    color: emailCampaignAccent,
                  },
                }}
              />
              <DefaultButton
                text={emailCampaignDraftChanged ? 'Apply' : 'Applied'}
                onClick={applyEmailCampaignDateRange}
                disabled={blueprint || !emailCampaignDraftChanged}
                styles={{
                  root: {
                    borderRadius: 0,
                    height: 32,
                    minWidth: 118,
                    padding: '0 10px',
                    fontWeight: 800,
                    fontSize: 10,
                    border: `1px solid ${emailCampaignPanelBorder}`,
                    background: emailCampaignDraftChanged ? emailCampaignAccent : withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.05 : 0.055),
                    color: emailCampaignDraftChanged ? colours.light.cardBackground : textColour,
                  },
                }}
              />
            </div>
          </div>

          {(emailAudienceError || emailAudienceGeneratedAt) && (
            <span className={`email-lists-demo-send__result${emailAudienceError ? ' email-lists-demo-send__result--error' : ' email-lists-demo-send__result--ready'}`}>
              {emailAudienceError || `Audience spine loaded ${emailAudienceGeneratedAt ? formatSupportDate(Date.parse(emailAudienceGeneratedAt)) : ''}`}
            </span>
          )}

          <div
            className="marketing-email-campaign-list-strip"
            data-helix-region="marketing/email-campaigns/list-strip"
            aria-label="Email send lists"
          >
            {emailCampaignListGrowthStats.map((option) => {
              const meta = getAreaGlyphMeta(option.glyph);
              const selected = selectedEmailCampaignAudience === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={selected ? 'marketing-email-campaign-list-strip-option is-selected' : 'marketing-email-campaign-list-strip-option'}
                  aria-pressed={selected}
                  onClick={() => setEmailCampaignList(option.key)}
                  disabled={blueprint}
                  title={`${option.label}: ${formatNumber(option.stats.qualified)} sendable, ${formatNumber(option.withAcid ?? 0)} ACID, ${formatNumber(option.ranked ?? 0)} ranked, ${formatNumber(option.clients ?? 0)} clients`}
                >
                  <span className="email-lists-area-icon">{renderAreaOfWorkGlyph(option.glyph, meta.color, 'glyph', 15)}</span>
                  <span className="marketing-email-campaign-list-strip-label">
                    <strong>{option.label}</strong>
                    <small>{option.isSendable ? `${formatNumber(option.stats.qualified)} sendable` : `${formatNumber(option.stats.scanned)} inspect`}</small>
                  </span>
                  <span className="marketing-email-campaign-list-strip-growth">
                    <span>{formatNumber(option.withAcid ?? option.stats.qualified)} ACID / {formatNumber(option.ranked ?? 0)} rank</span>
                    <span>{formatNumber(option.clients ?? 0)} clients / {formatNumber(option.stats.blocked)} held</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="marketing-email-campaign-stage-layout"
            data-helix-region="marketing/email-campaigns/layout"
          >
            <section className="marketing-email-campaign-setup-stage" data-helix-region="marketing/email-campaigns/setup-stage" data-locked={emailCampaignSetupLocked ? 'true' : 'false'}>
              <div className="marketing-email-campaign-setup-controls" data-helix-region="marketing/email-campaigns/send-settings">
                <div className="marketing-email-campaign-stage-header">
                  <span className="email-lists-eyebrow">Setup</span>
                  <strong>{selectedEmailCampaignListLabel}</strong>
                  <small>{selectedEmailCampaignIsLiveStream ? `${formatNumber(selectedEmailCampaignStats.qualified)} sendable, ${formatNumber(selectedEmailCampaignStats.blocked)} held back` : 'Inspection stream only, not a live campaign key'}</small>
                </div>
                <label>
                  <span>From</span>
                  <select value={selectedEmailCampaignSender} onChange={(event) => setEmailCampaignSender(event.currentTarget.value)} disabled={blueprint || emailCampaignTestSending || emailCampaignLocking} style={emailCampaignSelectStyle}>
                    {EMAIL_CAMPAIGN_SENDERS.map((sender) => (
                      <option key={sender.value} value={sender.value}>{sender.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Signature</span>
                  <select value={selectedEmailCampaignSignature} onChange={(event) => setEmailCampaignSignature(event.currentTarget.value)} disabled={blueprint || emailCampaignTestSending || emailCampaignLocking} style={emailCampaignSelectStyle}>
                    {EMAIL_CAMPAIGN_SIGNATURES.map((signature) => (
                      <option key={signature.value} value={signature.value}>{signature.label}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="marketing-email-campaign-lock-button"
                  onClick={lockEmailCampaignSetup}
                  disabled={blueprint || !emailCampaignSetupCanLock || emailCampaignSetupLocked || emailCampaignLocking}
                  title={selectedEmailCampaignIsLiveStream ? 'Create and lock a campaign against this stream.' : 'Other is inspection-only and cannot be used as a live campaign key.'}
                >
                  {emailCampaignLocking ? 'Locking' : emailCampaignSetupLocked ? 'Setup locked' : 'Lock setup'}
                </button>
              </div>

              <aside className="marketing-email-campaign-setup-preview" data-helix-region="marketing/email-campaigns/setup-preview">
                <header>
                  <span className="email-lists-eyebrow">Preview</span>
                  <strong>{formatNumber(selectedEmailCampaignRecipients.length)}</strong>
                </header>
                <div className="marketing-email-campaign-preview-meta">
                  {[
                    { label: 'List', value: selectedEmailCampaignListLabel },
                    { label: 'From', value: selectedEmailCampaignSenderLabel },
                    { label: emailCampaignLockedRecord ? 'Campaign' : 'Signature', value: emailCampaignLockedRecord ? `${emailCampaignLockedRecord.status} / ${formatNumber(emailCampaignLockedRecord.selectedCount ?? selectedEmailCampaignStats.qualified)}` : selectedEmailCampaignSignatureLabel },
                  ].map((item) => (
                    <span key={item.label}>
                      <small>{item.label}</small>
                      <strong>{item.value}</strong>
                    </span>
                  ))}
                </div>
                <div className="marketing-email-campaign-preview" data-helix-region="marketing/email-campaigns/recipient-preview">
                  <header>
                    <span className="email-lists-eyebrow">Recipient preview</span>
                    <strong>{formatNumber(selectedEmailCampaignRecipients.length)}</strong>
                  </header>
                <div className="marketing-email-campaign-preview-list">
                  {selectedEmailCampaignPreviewRows.length === 0 ? (
                    <span className="marketing-email-campaign-preview-empty">No qualified recipients in this window.</span>
                  ) : selectedEmailCampaignPreviewRows.map((row) => (
                    <span key={row.key} className="marketing-email-campaign-preview-row">
                      <span>
                        <strong>{row.displayName}</strong>
                        <small>{row.email}</small>
                      </span>
                      <span>
                        <strong>{row.areaOfWork}</strong>
                        <small>{row.method} | {row.dateLabel}</small>
                      </span>
                    </span>
                  ))}
                </div>
                {selectedEmailCampaignRecipients.length > selectedEmailCampaignPreviewRows.length && (
                  <small className="marketing-email-campaign-preview-more">
                    {formatNumber(selectedEmailCampaignRecipients.length - selectedEmailCampaignPreviewRows.length)} more held in the list preview.
                  </small>
                )}
              </div>
              </aside>
            </section>

            {emailCampaignSetupLocked && (
            <section className="marketing-email-campaign-draft-stage" data-helix-region="marketing/email-campaigns/draft-stage">
              <form
              className="email-lists-demo-send email-lists-composer marketing-email-campaign-composer"
              data-helix-region="marketing/email-campaigns/composer"
              onSubmit={sendEmailCampaignTest}
            >
              <div className="email-lists-composer__header">
                <div className="email-lists-composer__title">
                  <span className="email-lists-demo-send__label">Draft</span>
                  <strong>{selectedEmailCampaignTemplate.title}</strong>
                </div>
                <span className="email-lists-demo-send__target" title={operatorEmailForCampaign || ''}>
                  <span>{selectedEmailCampaignListLabel}</span>
                  <small>{operatorEmailForCampaign ? 'Test recipient: you' : 'Test recipient unavailable'}</small>
                </span>
              </div>
              <div className="email-lists-composer__grid marketing-email-campaign-composer-grid">
                <label className="email-lists-composer__wide">
                  <span>Subject</span>
                  <input
                    aria-label="Marketing email subject"
                    value={emailCampaignDraftSubject}
                    onChange={(event) => {
                      setEmailCampaignDraftSubject(event.currentTarget.value);
                      setEmailCampaignSendResult(null);
                    }}
                    placeholder="Subject"
                    disabled={blueprint || emailCampaignTestSending}
                  />
                </label>
                <label className="email-lists-composer__wide">
                  <span>Preview</span>
                  <input
                    aria-label="Marketing email preview"
                    value={emailCampaignDraftPreview}
                    onChange={(event) => {
                      setEmailCampaignDraftPreview(event.currentTarget.value);
                      setEmailCampaignSendResult(null);
                    }}
                    placeholder="Preview line"
                    disabled={blueprint || emailCampaignTestSending}
                  />
                </label>
                <label className="email-lists-composer__full">
                  <span>Body</span>
                  <textarea
                    aria-label="Marketing email body"
                    value={emailCampaignDraftBody}
                    onChange={(event) => {
                      setEmailCampaignDraftBody(event.currentTarget.value);
                      setEmailCampaignSendResult(null);
                    }}
                    placeholder="Body"
                    disabled={blueprint || emailCampaignTestSending}
                    rows={6}
                  />
                </label>
              </div>
              <div className="email-lists-composer__footer">
                {emailCampaignSendResult && (
                  <span
                    className={`email-lists-demo-send__result${emailCampaignSendResult.status === 'ready' || emailCampaignSendResult.status === 'saved' ? ' email-lists-demo-send__result--ready' : ''}${emailCampaignSendResult.status === 'error' ? ' email-lists-demo-send__result--error' : ''}`}
                    role="status"
                    aria-live="polite"
                  >
                    {emailCampaignSendResult.message}
                  </span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={saveEmailCampaignDraft} disabled={blueprint || emailCampaignTestSending}>Save draft</button>
                  <button type="submit" disabled={blueprint || emailCampaignTestSending || !emailCampaignCanSendTest}>{emailCampaignTestSending ? 'Sending' : 'Send test to me'}</button>
                  <button type="button" disabled title="Mass sending is off until suppression, audit, telemetry, and approval controls are in place">Mass send off</button>
                </span>
              </div>
              </form>
            </section>
            )}
          </div>
          <div className="marketing-email-campaign-send-guard" data-helix-region="marketing/email-campaigns/send-guard">
            {[
              { label: 'Source', value: `${formatNumber(emailCampaignRecipients.length)} new-space enquiries scanned` },
              { label: 'Area qualification', value: `${formatNumber(selectedEmailCampaignRecipients.length)} in selected list` },
              { label: 'Held back', value: `${formatNumber(selectedEmailCampaignBlockedRecipients.length)} missing or duplicate email` },
              { label: 'Mass sending', value: 'Off until suppression, audit, telemetry, and approval controls are in place' },
            ].map((item) => (
              <span key={item.label}>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </span>
            ))}
          </div>
        </div>
      </section>
      )}
    </section>
    );
  };
  const seoStatRows: ChannelMetric[] = [
    {
      label: 'Sessions',
      value: formatNumber(metrics.website.sessions),
      detail: `${formatNumber(metrics.website.rows)} tracked days`,
    },
    {
      label: 'Active users',
      value: formatNumber(metrics.website.users),
      detail: 'Google Analytics active users',
    },
    {
      label: 'Page views',
      value: formatNumber(metrics.website.views),
      detail: 'Screen/page views from GA4',
    },
    {
      label: 'Key events',
      value: formatNumber(metrics.website.keyEvents),
      detail: 'Tracked conversion/key events',
    },
  ];
  const ppcStatRows: ChannelMetric[] = [
    {
      label: 'Clicks',
      value: formatNumber(metrics.paid.clicks),
      detail: `${formatNumber(metrics.paid.rows)} tracked rows`,
    },
    {
      label: 'Impressions',
      value: formatNumber(metrics.paid.impressions),
      detail: 'Google Ads impressions',
    },
    {
      label: 'Spend',
      value: formatCurrency(metrics.paid.cost),
      detail: 'Total paid spend in range',
    },
    {
      label: 'Conversions',
      value: formatNumber(metrics.paid.conversions),
      detail: 'Platform-reported conversions',
    },
  ];
  const leftPanelRows = effectiveChannelPage === 'ppc' ? ppcStatRows : seoStatRows;
  const timelineMonths = useMemo<MarketingTimelineMonth[]>(() => (
    buildMarketingTimelineMonths(timelineRangeStartTs, timelineRangeEndTs, googleAnalyticsRows, googleAdsRows, ledgerRowsByTab, searchAttributionValue)
  ), [googleAdsRows, googleAnalyticsRows, ledgerRowsByTab, searchAttributionValue, timelineRangeEndTs, timelineRangeStartTs]);
  const seoContentPrimaryList = SEO_CONTENT_SNAPSHOT_LISTS[0];
  const seoContentStatusRows = seoContentPrimaryList.statuses;
  const seoRelatedSnapshotLists = SEO_CONTENT_SNAPSHOT_LISTS.slice(1);
  const seoContentPublished = seoContentStatusRows.find((row) => row.key === 'published-this-month')?.count ?? 0;
  const seoContentPipeline = seoContentStatusRows.find((row) => row.key === 'pipeline')?.count ?? 0;
  const seoContentActive = seoContentStatusRows
    .filter((row) => !['published-this-month', 'pipeline'].includes(row.key))
    .reduce((sum, row) => sum + row.count, 0);
  const seoContentApprovalQueue = seoContentStatusRows
    .filter((row) => ['approved-complete', 'waiting-approval', 'update-editing-required'].includes(row.key))
    .reduce((sum, row) => sum + row.count, 0);
  const seoAnalyticsTrendRows: SeoAnalyticsTrendRow[] = timelineMonths
    .flatMap((month) => month.weeks)
    .sort((left, right) => left.startTs - right.startTs)
    .map((week) => ({
      key: week.key,
      label: formatTimelineDate(new Date(week.startTs)),
      sessions: Math.round(week.seoSessions),
      enquiries: week.seoEnquiries,
      matters: week.seoMatters,
      value: week.seoCollected + week.seoMatterValue,
    }))
    .filter((row) => row.sessions > 0 || row.enquiries > 0 || row.matters > 0 || row.value > 0);
  const seoAnalyticsValue = seoReceived + seoWip;
  const seoAnalyticsEnquiryRate = metrics.website.sessions > 0 ? (seoEnquiryCount / metrics.website.sessions) * 100 : 0;
  const ppcAnalyticsTrendRows: PpcAnalyticsTrendRow[] = timelineMonths
    .flatMap((month) => month.weeks)
    .sort((left, right) => left.startTs - right.startTs)
    .map((week) => ({
      key: week.key,
      label: formatTimelineDate(new Date(week.startTs)),
      spend: week.ppcSpend,
      clicks: Math.round(week.ppcClicks),
      conversions: week.ppcConversions,
      enquiries: week.ppcEnquiries,
      matters: week.ppcMatters,
      value: week.ppcCollected + week.ppcMatterValue,
      rows: week.ppcRows,
    }))
    .filter((row) => row.spend > 0 || row.clicks > 0 || row.conversions > 0 || row.enquiries > 0 || row.matters > 0 || row.value > 0 || row.rows > 0);
  const ppcAnalyticsValue = ppcReceived + ppcWip;
  const ppcReturnMultiple = formatReturnMultiple(ppcAnalyticsValue, attributionSpend.ppcSpend);
  const ppcConversionRate = metrics.paid.clicks > 0 ? (metrics.paid.conversions / metrics.paid.clicks) * 100 : 0;
  const ppcEnquiryRate = metrics.paid.clicks > 0 ? (ppcEnquiryCount / metrics.paid.clicks) * 100 : 0;
  const ppcDataSourceLabel = hasGoogleAdsFeedTotals
    ? 'Google Ads feed'
    : ppcLedgerRows.length > 0
      ? 'PPC ledger rows'
      : googleAdsRows.length > 0
        ? 'Google Ads rows with no activity'
        : 'No PPC telemetry';
  const ppcHasTelemetry = metrics.paid.rows > 0 || hasGoogleAdsFeedTotals || ppcLedgerRows.length > 0;
  const ppcAttributionIsLoading = searchAttributionStatus === 'loading' || searchAttributionStatus === 'idle';
  const seoDrilldownFigures: ChannelMetric[] = [
    {
      label: 'Organic sessions',
      value: formatNumber(metrics.website.sessions),
      detail: `${formatNumber(metrics.website.rows)} GA4 rows in the selected window`,
    },
    {
      label: 'Organic enquiries',
      value: formatNumber(seoEnquiryCount),
      detail: `${formatNumber(seoMethodCounts.calls)} calls, ${formatNumber(seoMethodCounts.webforms)} webforms, ${formatNumber(seoMethodCounts.other)} other`,
    },
    {
      label: 'Enquiry rate',
      value: `${formatNumber(seoAnalyticsEnquiryRate, 2)}%`,
      detail: 'organic enquiries divided by organic sessions',
    },
    {
      label: 'Attributed value',
      value: formatCurrency(seoAnalyticsValue),
      detail: `${formatCurrency(seoReceived)} received, ${formatCurrency(seoWip)} WIP`,
    },
    {
      label: 'Content pipeline',
      value: formatNumber(seoContentPipeline),
      detail: `${SEO_CONTENT_SNAPSHOT_SOURCE} backlog and opportunity pool`,
    },
  ];
  const ppcDrilldownFigures: ChannelMetric[] = [
    {
      label: 'Spend',
      value: formatCurrency(attributionSpend.ppcSpend),
      detail: `${ppcDataSourceLabel}; ${formatNumber(metrics.paid.rows)} rows in the selected window`,
    },
    {
      label: 'Clicks',
      value: formatNumber(metrics.paid.clicks),
      detail: `${formatNumber(metrics.paid.impressions)} impressions; ${formatNumber(ppcConversionRate, 2)}% platform conversion rate`,
    },
    {
      label: 'Conversions',
      value: formatNumber(metrics.paid.conversions),
      detail: 'Platform-reported Google Ads conversions',
    },
    {
      label: 'Recorded paid enquiries',
      value: ppcAttributionIsLoading ? 'Updating' : formatNumber(ppcEnquiryCount),
      detail: `${formatNumber(ppcMethodCounts.calls)} calls, ${formatNumber(ppcMethodCounts.webforms)} webforms, ${formatNumber(ppcMethodCounts.other)} other`,
    },
    {
      label: 'Attributed value',
      value: ppcAttributionIsLoading ? 'Updating' : formatCurrency(ppcAnalyticsValue),
      detail: `${formatCurrency(ppcReceived)} received, ${formatCurrency(ppcWip)} WIP; ${ppcReturnMultiple} return`,
    },
  ];
  const valueSheetBorder = reportingPanelBorder(isDarkMode);
  const valueSheetTableColumns = 'minmax(140px, 1.15fr) minmax(116px, 0.82fr) repeat(2, minmax(76px, 0.52fr)) repeat(4, minmax(88px, 0.72fr))';
  const valueSheetDeckSurface = isDarkMode ? colours.dark.sectionBackground : withAlpha(colours.sectionBackground, 0.54);
  const valueSheetHeaderBarStyle: React.CSSProperties = {
    gridColumn: '1 / -1',
    display: 'grid',
    gridTemplateColumns: valueSheetTableColumns,
    gap: 0,
    border: `1px solid ${withAlpha(colours.darkBlue, isDarkMode ? 0.72 : 0.88)}`,
    background: colours.helixBlue,
  };
  const valueSheetHeaderCellStyle: React.CSSProperties = {
    padding: '8px 9px',
    color: colours.dark.text,
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: 0,
    textTransform: 'uppercase',
  };
  const valueSheetTraySurface = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.94);
  const makeMetricItems = (rows: unknown[], nestedKey: 'googleAnalytics' | 'googleAds', tone: string) => (
    rows.map((row, index) => createMetricSupportItem(row, nestedKey, index, tone))
  );
  const makeWorkspaceItems = (rows: MarketingWorkspaceRow[], kind: string, tone: string) => (
    rows.map((row, index) => createWorkspaceSupportItem(row, kind, index, tone))
  );
  const seoSignalItems = googleAnalyticsRows.length > 0
    ? makeMetricItems(googleAnalyticsRows, 'googleAnalytics', valueSheetSourceAccent)
    : makeWorkspaceItems(ledgerRowsByTab.seo ?? [], 'seo-ledger', valueSheetSourceAccent);
  const ppcSignalItems = googleAdsRows.length > 0
    ? makeMetricItems(googleAdsRows, 'googleAds', valueSheetSourceAccent)
    : makeWorkspaceItems(ledgerRowsByTab.ppc ?? [], 'ppc-ledger', valueSheetSourceAccent);
  const ppcSpendItems = googleAdsRows.length > 0
    ? makeMetricItems(googleAdsRows, 'googleAds', valueSheetSpendAccent)
    : makeWorkspaceItems(ledgerRowsByTab.ppc ?? [], 'ppc-spend', valueSheetSpendAccent);
  const seoEnquiryItems = makeWorkspaceItems(seoChannelEnquiries, 'seo-enquiry', valueSheetSourceAccent);
  const ppcEnquiryItems = makeWorkspaceItems(ppcChannelEnquiries, 'ppc-enquiry', valueSheetSourceAccent);
  const seoMatterItems = makeWorkspaceItems(seoJourney.downstream.matters, 'seo-matter', valueSheetReturnAccent);
  const ppcMatterItems = makeWorkspaceItems(ppcJourney.downstream.matters, 'ppc-matter', valueSheetReturnAccent);
  const seoCollectedItems = makeWorkspaceItems(seoJourney.downstream.collectedRows, 'seo-collected', valueSheetReturnAccent);
  const ppcCollectedItems = makeWorkspaceItems(ppcJourney.downstream.collectedRows, 'ppc-collected', valueSheetReturnAccent);
  const emailRecipientItems = emailCampaignRecipients.map((row, index) => createEmailRecipientSupportItem(row, index, row.blockedReason ? valueSheetSpendAccent : valueSheetEmailAccent));
  const qualifiedEmailRecipientItems = emailCampaignRecipients
    .filter((row) => !row.blockedReason)
    .map((row, index) => createEmailRecipientSupportItem(row, index, valueSheetEmailAccent));
  const emailNotLinkedItems = [createBasisSupportItem(
    'email-attribution-not-linked',
    'Not linked yet',
    'Email send attribution is reserved for the channel, but no spend, matter, received or WIP chain is active yet.',
    'Email attribution',
    '-',
    valueSheetEmailAccent,
  )];
  const seoSpendItems = Array.from({ length: SEO_MONTHS_INCLUDED }).map((_, index) => createBasisSupportItem(
    `seo-spend-${index}`,
    `SEO estimate ${index + 1}`,
    attributionSpend.seoBasis,
    'Spend assumption',
    formatCurrency(SEO_MONTHLY_COST),
    valueSheetSpendAccent,
  ));
  const makeSourceBreakdownItems = (prefix: string, counts: { calls: number; webforms: number; other: number; total: number }) => [
    createBasisSupportItem(`${prefix}-calls`, 'Calls', 'Call enquiries attributed to this source', 'Source breakdown', formatNumber(counts.calls), valueSheetSourceAccent),
    createBasisSupportItem(`${prefix}-webforms`, 'Webforms', 'Form enquiries attributed to this source', 'Source breakdown', formatNumber(counts.webforms), valueSheetSourceAccent),
    createBasisSupportItem(`${prefix}-other`, 'Other', 'Other attributed enquiry routes', 'Source breakdown', formatNumber(counts.other), valueSheetSourceAccent),
  ];
  const seoSourceBreakdownItems = makeSourceBreakdownItems('seo-source-breakdown', seoMethodCounts);
  const ppcSourceBreakdownItems = makeSourceBreakdownItems('ppc-source-breakdown', ppcMethodCounts);
  const emailSourceBreakdownItems = [
    createBasisSupportItem('email-source-scanned', 'Scanned', 'New-space enquiries in the current Email campaign window', 'Recipient readiness', formatNumber(emailCampaignAllStats.scanned), valueSheetEmailAccent),
    createBasisSupportItem('email-source-qualified', 'Qualified', 'Unique usable email recipients ready for SendGrid', 'Recipient readiness', formatNumber(emailCampaignAllStats.qualified), valueSheetEmailAccent),
    createBasisSupportItem('email-source-blocked', 'Blocked', 'Missing or duplicate email addresses excluded from send lists', 'Recipient readiness', formatNumber(emailCampaignAllStats.blocked), valueSheetSpendAccent),
  ];
  const getValueSheetChannelItems = (rowKey: MarketingValueSheetRowKey) => {
    if (rowKey === 'organicSearch') {
      return {
        signal: seoSignalItems,
        enquiries: seoEnquiryItems,
        matters: seoMatterItems,
        spend: seoSpendItems,
        received: seoCollectedItems,
        wip: seoMatterItems,
        totalValue: [...seoCollectedItems, ...seoMatterItems],
      };
    }
    if (rowKey === 'paidSearch') {
      return {
        signal: ppcSignalItems,
        enquiries: ppcEnquiryItems,
        matters: ppcMatterItems,
        spend: ppcSpendItems,
        received: ppcCollectedItems,
        wip: ppcMatterItems,
        totalValue: [...ppcCollectedItems, ...ppcMatterItems],
      };
    }
    if (rowKey === 'emailMarketing') {
      return {
        signal: emailRecipientItems,
        enquiries: qualifiedEmailRecipientItems,
        matters: emailNotLinkedItems,
        spend: emailNotLinkedItems,
        received: emailNotLinkedItems,
        wip: emailNotLinkedItems,
        totalValue: emailNotLinkedItems,
      };
    }
    return {
      signal: [...seoSignalItems, ...ppcSignalItems, ...emailRecipientItems],
      enquiries: [...seoEnquiryItems, ...ppcEnquiryItems, ...qualifiedEmailRecipientItems],
      matters: [...seoMatterItems, ...ppcMatterItems],
      spend: [...seoSpendItems, ...ppcSpendItems],
      received: [...seoCollectedItems, ...ppcCollectedItems],
      wip: [...seoMatterItems, ...ppcMatterItems],
      totalValue: [...seoCollectedItems, ...ppcCollectedItems, ...seoMatterItems, ...ppcMatterItems],
    };
  };
  const getValueSheetCells = (row: MarketingValueSheetRow): MarketingValueSheetCell[] => {
    const channelItems = getValueSheetChannelItems(row.key);
    const isEmailRow = row.key === 'emailMarketing';
    return [
      { key: 'source', label: 'Source', value: row.source, align: 'left', supportItems: channelItems.signal, basis: 'Source-level signal rows' },
      { key: 'activity', label: row.activityLabel, value: `${row.activityValue} ${row.activityLabel}`, align: 'left', supportItems: channelItems.signal, basis: isEmailRow ? 'Qualified usable email recipients in the current campaign window' : 'Source activity signal' },
      { key: 'enquiries', label: 'Enquiries', value: formatNumber(row.enquiries), align: 'right', supportItems: channelItems.enquiries, basis: isEmailRow ? 'Qualified recipient enquiries available for SendGrid' : 'Enquiry rows with this source' },
      { key: 'matters', label: 'Matters', value: formatNumber(row.matters), align: 'right', supportItems: channelItems.matters, basis: isEmailRow ? 'Email matter attribution is not linked yet' : 'Matched matters opened from these enquiries' },
      { key: 'spend', label: 'Spend', value: formatCurrency(row.spend), align: 'right', supportItems: channelItems.spend, basis: row.key === 'organicSearch' ? attributionSpend.seoBasis : isEmailRow ? 'Email spend is not linked yet' : 'Spend signal rows' },
      { key: 'received', label: 'Received', value: formatCurrency(row.received), align: 'right', supportItems: channelItems.received, basis: isEmailRow ? 'Email received value is not linked yet' : 'Matched collected and upfront value' },
      { key: 'wip', label: 'WIP', value: formatCurrency(row.wip), align: 'right', supportItems: channelItems.wip, basis: isEmailRow ? 'Email WIP attribution is not linked yet' : 'Chargeable WIP from matched matters' },
      { key: 'totalValue', label: 'Total', value: formatCurrency(row.totalValue), align: 'right', supportItems: channelItems.totalValue, basis: isEmailRow ? 'Email total value is reserved until attribution is linked' : 'Received plus chargeable WIP' },
    ];
  };
  const getValueSheetCellTone = (cellKey: MarketingValueSheetCellKey) => {
    if (cellKey === 'spend') return valueSheetSpendAccent;
    if (cellKey === 'received' || cellKey === 'wip' || cellKey === 'totalValue') return valueSheetReturnAccent;
    return valueSheetSourceAccent;
  };
  const renderValueSheetTray = (row: MarketingValueSheetRow, cells: MarketingValueSheetCell[]) => {
    if (!activeValueSheetTray || activeValueSheetTray.rowKey !== row.key) return null;
    const activeCell = cells.find((cell) => cell.key === activeValueSheetTray.metricKey);
    if (!activeCell) return null;
    const activeCellTone = getValueSheetCellTone(activeCell.key);
    const supportItems = activeCell.supportItems ?? [];
    const visibleItems = supportItems.slice(0, VALUE_SHEET_SUPPORT_LIMIT);
    const sourceBreakdownItems = row.key === 'organicSearch'
      ? seoSourceBreakdownItems
      : row.key === 'paidSearch'
        ? ppcSourceBreakdownItems
        : row.key === 'emailMarketing'
          ? emailSourceBreakdownItems
          : [...seoSourceBreakdownItems, ...ppcSourceBreakdownItems, ...emailSourceBreakdownItems];
    return (
      <div
        data-helix-region={`marketing/value-sheet/tray/${row.key}`}
        style={{
          gridColumn: '1 / -1',
          display: 'grid',
          gap: 9,
          padding: 12,
          border: `1px solid ${withAlpha(activeCellTone, isDarkMode ? 0.30 : 0.22)}`,
          borderTop: `2px solid ${activeCellTone}`,
          background: valueSheetTraySurface,
          boxShadow: `inset 2px 0 0 ${activeCellTone}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <strong style={{ color: activeCellTone, fontSize: 13, fontWeight: 900 }}>{row.source} - {activeCell.label}</strong>
            <small style={{ color: mutedColour, fontSize: 10, fontWeight: 800 }}>{activeCell.basis || 'Underlying rows'}</small>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ color: activeCellTone, fontSize: 13, fontWeight: 900 }}>{activeCell.value}</strong>
            <button
              type="button"
              onClick={() => setActiveValueSheetTray(null)}
              style={{ minHeight: 24, padding: '0 8px', border: `1px solid ${valueSheetBorder}`, background: 'transparent', color: mutedColour, fontFamily: 'Raleway, sans-serif', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer' }}
            >
              Close
            </button>
          </span>
        </div>
        {sourceBreakdownItems.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 6 }} aria-label="Source breakdown">
            {sourceBreakdownItems.map((item) => {
              const supportKey = `${row.key}-${activeCell.key}-${item.key}`;
              const supportHovered = hoveredValueSheetSupportItem === supportKey;
              return (
              <span
                key={supportKey}
                title={`${item.primary}: ${item.value || '-'}\n${item.secondary || activeCell.basis || 'Source breakdown'}`}
                onMouseEnter={() => setHoveredValueSheetSupportItem(supportKey)}
                onMouseLeave={() => { if (hoveredValueSheetSupportItem === supportKey) setHoveredValueSheetSupportItem(null); }}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: '7px 8px',
                  border: `1px solid ${supportHovered ? withAlpha(activeCellTone, isDarkMode ? 0.42 : 0.26) : valueSheetBorder}`,
                  background: supportHovered
                    ? (isDarkMode ? colours.dark.cardBackground : withAlpha(activeCellTone, 0.06))
                    : (isDarkMode ? colours.dark.cardHover : withAlpha(colours.sectionBackground, 0.44)),
                  boxShadow: supportHovered ? `inset 0 -2px 0 ${activeCellTone}` : 'none',
                  transform: supportHovered ? 'translateY(-1px)' : 'translateY(0)',
                  transition: 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
                }}
              >
                <small style={{ color: mutedColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>{item.primary}</small>
                <strong style={{ color: textColour, fontSize: 12, fontWeight: 900 }}>{item.value || '-'}</strong>
              </span>
              );
            })}
          </div>
        )}
        <div className="marketing-scroll-chrome" style={{ display: 'grid', maxHeight: 260, overflowY: 'auto', border: `1px solid ${valueSheetBorder}` }}>
          {visibleItems.map((item, index) => {
            const supportKey = `${row.key}-${activeCell.key}-${item.key}`;
            const supportHovered = hoveredValueSheetSupportItem === supportKey;
            return (
            <div
              key={item.key}
              title={`${item.primary}\n${item.secondary}\n${item.meta}${item.value ? `\n${item.value}` : ''}`}
              onMouseEnter={() => setHoveredValueSheetSupportItem(supportKey)}
              onMouseLeave={() => { if (hoveredValueSheetSupportItem === supportKey) setHoveredValueSheetSupportItem(null); }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 10,
                alignItems: 'center',
                padding: '8px 10px',
                borderTop: index === 0 ? 'none' : `1px solid ${supportHovered ? withAlpha(activeCellTone, isDarkMode ? 0.32 : 0.22) : valueSheetBorder}`,
                background: supportHovered
                  ? (isDarkMode ? colours.dark.cardHover : withAlpha(activeCellTone, 0.055))
                  : (index % 2 === 0 ? 'transparent' : (isDarkMode ? colours.dark.cardHover : withAlpha(colours.sectionBackground, 0.34))),
                boxShadow: supportHovered ? `inset 2px 0 0 ${activeCellTone}` : 'none',
                transition: 'background 140ms ease, border-color 140ms ease, box-shadow 140ms ease',
              }}
            >
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <strong style={{ color: textColour, fontSize: 11, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.primary}</strong>
                <small style={{ color: mutedColour, fontSize: 9, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.secondary}</small>
                <small style={{ color: mutedColour, fontSize: 9, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.meta}</small>
              </span>
              {item.value && <strong style={{ color: item.tone || activeCellTone, fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }}>{item.value}</strong>}
            </div>
            );
          })}
          {visibleItems.length === 0 && (
            <span style={{ padding: '10px 12px', color: mutedColour, fontSize: 11, fontWeight: 800 }}>No supporting rows are available for this figure yet.</span>
          )}
        </div>
        {supportItems.length > VALUE_SHEET_SUPPORT_LIMIT && (
          <small style={{ color: mutedColour, fontSize: 9, fontWeight: 800 }}>
            Showing {formatNumber(VALUE_SHEET_SUPPORT_LIMIT)} of {formatNumber(supportItems.length)} rows.
          </small>
        )}
      </div>
    );
  };

  const renderSeoDrilldown = () => {
    const chartRows = seoAnalyticsTrendRows.slice(-12);
    const chartWidth = 720;
    const chartHeight = 190;
    const chartTop = 18;
    const chartBottom = 30;
    const chartLeft = 34;
    const chartRight = chartWidth - 54;
    const chartPlotLeft = chartLeft + 18;
    const chartPlotRight = chartRight - 18;
    const chartInnerHeight = chartHeight - chartTop - chartBottom;
    const maxSessions = Math.max(1, ...chartRows.map((row) => row.sessions));
    const maxEnquiries = Math.max(1, ...chartRows.map((row) => row.enquiries));
    const maxMatters = Math.max(1, ...chartRows.map((row) => row.matters));
    const maxCount = Math.max(maxEnquiries, maxMatters);
    const maxWeeklyCardSignal = Math.max(1, ...chartRows.map((row) => (row.value > 0 ? row.value : row.sessions)));
    const xFor = (index: number) => chartRows.length <= 1
      ? chartWidth / 2
      : chartPlotLeft + (index / (chartRows.length - 1)) * (chartPlotRight - chartPlotLeft);
    const yFor = (value: number) => chartTop + chartInnerHeight - (value / maxSessions) * chartInnerHeight;
    const yForCount = (value: number) => chartTop + chartInnerHeight - (value / maxCount) * chartInnerHeight;
    const sessionCoordinates = chartRows.map((row, index) => ({ x: xFor(index), y: yFor(row.sessions) }));
    const sessionLinePath = sessionCoordinates.length > 0
      ? `M ${sessionCoordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ')}`
      : '';
    const sessionAreaPath = sessionCoordinates.length > 1
      ? `${sessionLinePath} L ${sessionCoordinates[sessionCoordinates.length - 1].x.toFixed(1)},${(chartHeight - chartBottom).toFixed(1)} L ${sessionCoordinates[0].x.toFixed(1)},${(chartHeight - chartBottom).toFixed(1)} Z`
      : '';
    const chartTicks = [0, 0.5, 1].map((scale, index) => ({
      key: `tick-${index}`,
      value: Math.round(maxSessions * scale),
    }));
    const countTicks = Array.from(new Set([0, Math.ceil(maxCount / 2), maxCount])).map((value, index) => ({
      key: `count-tick-${index}`,
      value,
    }));
    const contentMax = Math.max(1, ...seoContentStatusRows.map((row) => row.count));
    const relatedMax = Math.max(1, ...seoRelatedSnapshotLists.map((list) => list.total));
    const seoContentHeadlineCards = [
      { label: 'Published', value: formatNumber(seoContentPublished), detail: 'Published this month', tone: colours.green },
      { label: 'Active shape', value: formatNumber(seoContentActive), detail: `${formatNumber(seoContentApprovalQueue)} in approval or edit`, tone: colours.highlight },
      { label: 'Content pipeline', value: formatNumber(seoContentPipeline), detail: 'Backlog and opportunity pool', tone: colours.orange },
      { label: 'Content items', value: formatNumber(seoContentPrimaryList.total), detail: 'Helix Content list total', tone: selectedChannelAccent },
    ];
    const chartPanelBackground = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
    const chartPanelInset = withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.035 : 0.035);
    const seoKpiRailSurface = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.34);
    const seoDetailTextColour = withAlpha(textColour, isDarkMode ? 0.74 : 0.68);
    const seoDetailLabelColour = withAlpha(textColour, isDarkMode ? 0.82 : 0.76);
    const seoKpiTone = (label: string) => {
      if (label === 'Content pipeline') return colours.orange;
      if (label === 'Attributed value') return colours.green;
      return textColour;
    };
    const seoWeeklyCardBackground = (row: SeoAnalyticsTrendRow) => {
      const signal = row.value > 0 ? row.value : row.sessions;
      const fill = Math.max(0, Math.min(100, (signal / maxWeeklyCardSignal) * 100));
      const tone = row.value > 0 ? colours.green : selectedChannelAccent;
      const base = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.014 : 0.24);
      return `linear-gradient(90deg, ${withAlpha(tone, isDarkMode ? 0.16 : 0.105)} 0%, ${withAlpha(tone, isDarkMode ? 0.08 : 0.06)} ${fill.toFixed(1)}%, ${base} ${fill.toFixed(1)}%, ${base} 100%)`;
    };

    return (
      <section
        data-helix-region="marketing/seo-drilldown"
        style={{
          display: 'grid',
          gap: 12,
          minWidth: 0,
          padding: 12,
          border: `1px solid ${valueSheetBorder}`,
          borderTop: `1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.34 : 0.22)}`,
          background: reportingPanelBackground(isDarkMode, 'elevated'),
          boxShadow: reportingPanelShadow(isDarkMode),
        }}
      >
        <div data-helix-region="marketing/seo-drilldown/header" style={{ display: 'grid', gap: 9, minWidth: 0, padding: '2px 0 4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(172px, auto)', gap: 12, alignItems: 'stretch', minWidth: 0 }}>
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: withAlpha(selectedChannelAccent, isDarkMode ? 0.88 : 0.78) }}>
                SEO performance snapshot
              </span>
              <strong style={{ fontSize: 20, lineHeight: 1.08, fontWeight: 900, color: textColour }}>
                Organic analytics and content effort
              </strong>
              <small style={{ maxWidth: 620, fontSize: 10.5, lineHeight: 1.32, fontWeight: 800, color: seoDetailTextColour }}>
                Weekly traffic, enquiries and value set against the ClickUp content pipeline.
              </small>
            </span>
            <span style={{ display: 'grid', alignContent: 'center', gap: 2, minWidth: 0, padding: '8px 10px', border: `1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.26 : 0.18)}`, borderLeft: `3px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.78 : 0.62)}`, background: withAlpha(selectedChannelAccent, isDarkMode ? 0.06 : 0.045) }}>
              <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: seoDetailLabelColour }}>Snapshot basis</small>
              <strong style={{ fontSize: 12, lineHeight: 1.15, fontWeight: 900, color: textColour }}>ClickUp content crawl</strong>
              <small style={{ fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: seoDetailTextColour }}>Captured {SEO_CONTENT_SNAPSHOT_CAPTURED_AT}</small>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))', gap: 0, minWidth: 0, borderTop: `1px solid ${valueSheetBorder}`, borderLeft: `1px solid ${valueSheetBorder}`, background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.30) }}>
            {[
              { label: 'Reporting window', value: timelineRangeLabel },
              { label: 'Content source', value: SEO_CONTENT_SNAPSHOT_SOURCE },
              { label: 'Snapshot date', value: SEO_CONTENT_SNAPSHOT_CAPTURED_AT },
            ].map((item) => (
              <span key={item.label} title={`${item.label}: ${item.value}`} style={{ display: 'grid', gap: 3, minWidth: 0, padding: '7px 9px', borderRight: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}` }}>
                <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: seoDetailLabelColour }}>{item.label}</small>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, lineHeight: 1.2, fontWeight: 900, color: withAlpha(textColour, isDarkMode ? 0.90 : 0.84) }}>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div data-helix-region="marketing/seo-drilldown/figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 0, padding: '7px 0', borderTop: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}`, background: seoKpiRailSurface }}>
          {seoDrilldownFigures.map((figure, index) => (
            <span
              key={figure.label}
              className="marketing-drilldown-kpi-card"
              data-detail={figure.detail}
              aria-label={`${figure.label}: ${figure.value}. ${figure.detail}`}
              tabIndex={0}
              style={{
                display: 'grid',
                gap: 4,
                minWidth: 0,
                position: 'relative',
                padding: '5px 10px 6px',
                borderLeft: index === 0 ? 'none' : `1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.08 : 0.10)}`,
                background: 'transparent',
                cursor: 'help',
                outline: 'none',
              }}
            >
              <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: seoDetailLabelColour }}>{figure.label}</small>
              <strong style={{ fontSize: 16, lineHeight: 1, fontWeight: 900, color: seoKpiTone(figure.label) }}>{figure.value}</strong>
            </span>
          ))}
        </div>
        <style>{`
          .marketing-drilldown-kpi-card {
            transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
          }

          .marketing-drilldown-kpi-card:hover,
          .marketing-drilldown-kpi-card:focus-visible {
            background-color: ${withAlpha(selectedChannelAccent, isDarkMode ? 0.055 : 0.04)} !important;
            box-shadow: inset 0 -2px 0 ${withAlpha(selectedChannelAccent, isDarkMode ? 0.46 : 0.32)};
            transform: translateY(-1px);
          }

          .marketing-drilldown-kpi-card::after {
            content: attr(data-detail);
            position: absolute;
            z-index: 20;
            left: 10px;
            right: 10px;
            top: calc(100% + 7px);
            padding: 7px 8px;
            border: 1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.28 : 0.18)};
            background: ${chartPanelBackground};
            color: ${seoDetailTextColour};
            box-shadow: ${isDarkMode ? `0 12px 24px ${withAlpha(colours.darkBlue, 0.38)}` : `0 12px 24px ${withAlpha(colours.darkBlue, 0.10)}`};
            font-size: 10px;
            font-weight: 800;
            line-height: 1.32;
            text-transform: none;
            letter-spacing: 0;
            white-space: normal;
            pointer-events: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 150ms ease, transform 150ms ease;
          }

          .marketing-drilldown-kpi-card:hover::after,
          .marketing-drilldown-kpi-card:focus-visible::after {
            opacity: 1;
            transform: translateY(0);
          }

          @media (prefers-reduced-motion: reduce) {
            .marketing-drilldown-kpi-card,
            .marketing-drilldown-kpi-card::after {
              transition: none;
            }
          }
        `}</style>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.95fr)', gap: 12, minWidth: 0 }}>
          <section
            data-helix-region="marketing/seo-drilldown/analytics-chart"
            style={{
              display: 'grid',
              gridTemplateRows: 'auto minmax(180px, auto) auto',
              gap: 10,
              minWidth: 0,
              padding: 12,
              border: `1px solid ${valueSheetBorder}`,
              background: chartPanelBackground,
            }}
          >
            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14, fontWeight: 900, color: textColour }}>Organic trend</strong>
                <small style={{ fontSize: 10, fontWeight: 800, color: mutedColour }}>Sessions use the left axis; enquiries and matters use the right count axis</small>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px 10px', flexWrap: 'wrap', minWidth: 0, fontSize: 10, fontWeight: 800, color: mutedColour }}>
                <span aria-label="Sessions line" title="Sessions line" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 18, height: 2, background: selectedChannelAccent, boxShadow: `7px 0 0 0 ${chartPanelBackground}, 7px 0 0 2px ${selectedChannelAccent}` }} /> Sessions</span>
                <span aria-label="Enquiries bar" title="Enquiries bar" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 12, background: colours.green }} /> Enquiries</span>
                <span aria-label="Matter ring" title="Matter ring" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 9, height: 9, border: `2px solid ${colours.orange}`, borderRadius: 999, background: chartPanelBackground }} /> Matter</span>
              </span>
            </div>
            {chartRows.length === 0 ? (
              <div style={{ display: 'grid', placeItems: 'center', minHeight: 178, border: `1px dashed ${valueSheetBorder}`, color: mutedColour, fontSize: 11, fontWeight: 800 }}>
                Organic timeline rows are not available for this window yet.
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="SEO organic sessions, enquiries and matters by week"
                style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${chartWidth} / ${chartHeight}`, overflow: 'visible', background: chartPanelInset }}
              >
                <defs>
                  <linearGradient id="marketing-seo-drilldown-sessions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={withAlpha(selectedChannelAccent, isDarkMode ? 0.42 : 0.24)} />
                    <stop offset="100%" stopColor={withAlpha(selectedChannelAccent, 0.03)} />
                  </linearGradient>
                </defs>
                {chartTicks.map((tick) => {
                  const y = yFor(tick.value);
                  return (
                    <g key={tick.key}>
                      <line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke={withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.08 : 0.08)} strokeWidth="1" />
                      <text x={chartLeft - 6} y={y + 4} textAnchor="end" fontSize="10" fill={mutedColour}>{formatNumber(tick.value)}</text>
                    </g>
                  );
                })}
                <text x={chartLeft - 6} y={chartTop - 7} textAnchor="end" fontSize="9" fontWeight="800" fill={mutedColour}>Sessions</text>
                <line x1={chartRight} x2={chartRight} y1={chartTop} y2={chartHeight - chartBottom} stroke={withAlpha(colours.orange, isDarkMode ? 0.26 : 0.20)} strokeWidth="1" />
                <text x={chartRight + 9} y={chartTop - 7} textAnchor="start" fontSize="9" fontWeight="800" fill={mutedColour}>Count</text>
                {countTicks.map((tick) => {
                  const y = yForCount(tick.value);
                  return (
                    <g key={tick.key}>
                      <line x1={chartRight} x2={chartRight + 5} y1={y} y2={y} stroke={withAlpha(colours.orange, isDarkMode ? 0.32 : 0.24)} strokeWidth="1" />
                      <text x={chartRight + 9} y={y + 4} textAnchor="start" fontSize="10" fill={mutedColour}>{formatNumber(tick.value)}</text>
                    </g>
                  );
                })}
                {sessionAreaPath && <path d={sessionAreaPath} fill="url(#marketing-seo-drilldown-sessions)" stroke="none" />}
                {sessionLinePath && <path d={sessionLinePath} fill="none" stroke={selectedChannelAccent} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {chartRows.map((row, index) => {
                  const x = xFor(index);
                  const barY = yForCount(row.enquiries);
                  const barHeight = row.enquiries > 0 ? Math.max(5, chartHeight - chartBottom - barY) : 0;
                  const matterY = yForCount(row.matters);
                  return (
                    <g key={row.key}>
                      <title>{`${row.label}: ${formatNumber(row.sessions)} sessions, ${formatNumber(row.enquiries)} enquiries, ${formatNumber(row.matters)} matters, ${formatCurrency(row.value)} value`}</title>
                      {barHeight > 0 && <rect x={x - 8} y={chartHeight - chartBottom - barHeight} width={16} height={barHeight} fill={withAlpha(colours.green, isDarkMode ? 0.72 : 0.64)} />}
                      {row.matters > 0 && <circle cx={x + 10} cy={matterY} r="4.5" fill={chartPanelBackground} stroke={colours.orange} strokeWidth="2" />}
                      <circle cx={x} cy={yFor(row.sessions)} r="4" fill={chartPanelBackground} stroke={selectedChannelAccent} strokeWidth="2" />
                      <text x={x} y={chartHeight - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill={mutedColour}>{row.label}</text>
                    </g>
                  );
                })}
              </svg>
            )}
            <div data-helix-region="marketing/seo-drilldown/weekly-detail" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(214px, 1fr))', gap: '8px 10px', paddingTop: 8, borderTop: `1px solid ${valueSheetBorder}` }}>
              {chartRows.map((row) => (
                <span key={`seo-trend-${row.key}`} title={`${row.label}: ${formatNumber(row.sessions)} sessions, ${formatNumber(row.enquiries)} enquiries, ${formatNumber(row.matters)} matters, ${formatCurrency(row.value)} value. Fill strength reflects ${row.value > 0 ? 'weekly attributed value' : 'weekly session capacity'}.`} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: 9, minWidth: 0, padding: '7px 8px', border: `1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.09 : 0.11)}`, background: seoWeeklyCardBackground(row) }}>
                  <small style={{ fontSize: 9, fontWeight: 900, color: seoDetailLabelColour, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{row.label}</small>
                  <span style={{ display: 'grid', gap: 2, minWidth: 0, color: seoDetailTextColour, fontSize: 10, lineHeight: 1.28 }}>
                    <strong style={{ fontSize: 11, fontWeight: 900, color: textColour, whiteSpace: 'nowrap' }}>{formatNumber(row.sessions)} sessions</strong>
                    <small style={{ minWidth: 0, color: seoDetailTextColour, fontSize: 10, lineHeight: 1.28, fontWeight: 800 }}>{formatNumber(row.enquiries)} enquiries / {formatNumber(row.matters)} matters / {formatCurrency(row.value)} value</small>
                  </span>
                </span>
              ))}
            </div>
          </section>

          <section
            data-helix-region="marketing/seo-drilldown/content-space"
            style={{
              display: 'grid',
              gap: 10,
              minWidth: 0,
              padding: 12,
              border: `1px solid ${valueSheetBorder}`,
              background: chartPanelBackground,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14, fontWeight: 900, color: textColour }}>Content space</strong>
                <small style={{ fontSize: 10, fontWeight: 800, color: mutedColour }}>ClickUp snapshot from {seoContentPrimaryList.label}</small>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, color: mutedColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
                Total <strong style={{ color: selectedChannelAccent, fontSize: 13, fontWeight: 900 }}>{formatNumber(seoContentPrimaryList.total)}</strong>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0, borderTop: `1px solid ${valueSheetBorder}`, borderLeft: `1px solid ${valueSheetBorder}`, background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.30) }}>
              {seoContentHeadlineCards.map((card) => (
                <span key={card.label} title={`${card.label}: ${card.value}. ${card.detail}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'baseline', gap: 8, minWidth: 0, padding: '8px 9px', borderRight: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}`, background: 'transparent' }}>
                  <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: seoDetailLabelColour }}>{card.label}</small>
                    <small style={{ fontSize: 10, lineHeight: 1.28, fontWeight: 800, color: seoDetailTextColour }}>{card.detail}</small>
                  </span>
                  <strong style={{ fontSize: 16, lineHeight: 1, fontWeight: 900, color: card.tone }}>{card.value}</strong>
                </span>
              ))}
            </div>
            <div data-helix-region="marketing/seo-drilldown/content-statuses" style={{ display: 'grid', gap: 7 }}>
              {seoContentStatusRows.map((row) => {
                const width = Math.max(2, (row.count / contentMax) * 100);
                const tone = row.key === 'pipeline'
                  ? colours.orange
                  : row.key === 'published-this-month'
                    ? colours.green
                    : selectedChannelAccent;
                return (
                  <div key={row.key} style={{ display: 'grid', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: textColour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                      <strong style={{ fontSize: 11, fontWeight: 900, color: tone }}>{formatNumber(row.count)}</strong>
                    </div>
                    <div title={row.detail} style={{ height: 8, background: withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.08 : 0.08), overflow: 'hidden' }}>
                      <span aria-hidden="true" style={{ display: 'block', width: `${width}%`, height: '100%', background: tone }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <section data-helix-region="marketing/seo-drilldown/related-efforts" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, fontWeight: 900, color: textColour }}>Related SEO efforts</strong>
            <small style={{ fontSize: 10, fontWeight: 800, color: mutedColour }}>Tasks, delivery support, reporting and DPR coverage from the same ClickUp space</small>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 8 }}>
            {seoRelatedSnapshotLists.map((list) => (
              <span key={list.key} style={{ display: 'grid', gap: 7, minWidth: 0, padding: '9px 10px', border: `1px solid ${valueSheetBorder}`, background: chartPanelBackground }}>
                <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <strong style={{ fontSize: 12, fontWeight: 900, color: textColour }}>{list.label}</strong>
                  <strong style={{ fontSize: 16, fontWeight: 900, color: selectedChannelAccent }}>{formatNumber(list.total)}</strong>
                </span>
                <span style={{ height: 7, background: withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.08 : 0.08), overflow: 'hidden' }}>
                  <span aria-hidden="true" style={{ display: 'block', height: '100%', width: `${Math.max(3, (list.total / relatedMax) * 100)}%`, background: selectedChannelAccent }} />
                </span>
                <small style={{ fontSize: 9, lineHeight: 1.35, color: mutedColour }}>
                  {list.statuses.map((status) => `${status.label} ${formatNumber(status.count)}`).join(' / ')}
                </small>
              </span>
            ))}
          </div>
        </section>
      </section>
    );
  };

  const renderPpcDrilldown = () => {
    const chartRows = ppcAnalyticsTrendRows.slice(-12);
    const chartWidth = 720;
    const chartHeight = 190;
    const chartTop = 18;
    const chartBottom = 30;
    const chartLeft = 34;
    const chartRight = chartWidth - 54;
    const chartPlotLeft = chartLeft + 18;
    const chartPlotRight = chartRight - 18;
    const chartInnerHeight = chartHeight - chartTop - chartBottom;
    const maxSpend = Math.max(1, ...chartRows.map((row) => row.spend));
    const maxEnquiries = Math.max(1, ...chartRows.map((row) => row.enquiries));
    const maxMatters = Math.max(1, ...chartRows.map((row) => row.matters));
    const maxCount = Math.max(maxEnquiries, maxMatters);
    const maxWeeklyCardSignal = Math.max(1, ...chartRows.map((row) => (row.value > 0 ? row.value : row.spend)));
    const xFor = (index: number) => chartRows.length <= 1
      ? chartWidth / 2
      : chartPlotLeft + (index / (chartRows.length - 1)) * (chartPlotRight - chartPlotLeft);
    const yForSpend = (value: number) => chartTop + chartInnerHeight - (value / maxSpend) * chartInnerHeight;
    const yForCount = (value: number) => chartTop + chartInnerHeight - (value / maxCount) * chartInnerHeight;
    const spendCoordinates = chartRows.map((row, index) => ({ x: xFor(index), y: yForSpend(row.spend) }));
    const spendLinePath = spendCoordinates.length > 0
      ? `M ${spendCoordinates.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ')}`
      : '';
    const spendAreaPath = spendCoordinates.length > 1
      ? `${spendLinePath} L ${spendCoordinates[spendCoordinates.length - 1].x.toFixed(1)},${(chartHeight - chartBottom).toFixed(1)} L ${spendCoordinates[0].x.toFixed(1)},${(chartHeight - chartBottom).toFixed(1)} Z`
      : '';
    const chartTicks = [0, 0.5, 1].map((scale, index) => ({
      key: `ppc-tick-${index}`,
      value: Math.round(maxSpend * scale),
    }));
    const countTicks = Array.from(new Set([0, Math.ceil(maxCount / 2), maxCount])).map((value, index) => ({
      key: `ppc-count-tick-${index}`,
      value,
    }));
    const chartPanelBackground = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
    const chartPanelInset = withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.035 : 0.035);
    const ppcKpiRailSurface = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.34);
    const ppcDetailTextColour = withAlpha(textColour, isDarkMode ? 0.74 : 0.68);
    const ppcDetailLabelColour = withAlpha(textColour, isDarkMode ? 0.82 : 0.76);
    const ppcKpiTone = (label: string) => {
      if (label === 'Spend') return colours.highlight;
      if (label === 'Attributed value') return colours.green;
      return textColour;
    };
    const ppcQualityCards = [
      { label: 'Enquiries', value: ppcAttributionIsLoading ? 'Updating' : formatNumber(ppcEnquiryCount), detail: `${formatNumber(ppcMethodCounts.calls)} calls, ${formatNumber(ppcMethodCounts.webforms)} webforms`, tone: selectedChannelAccent },
      { label: 'Matters', value: ppcAttributionIsLoading ? 'Updating' : formatNumber(ppcMatterCount), detail: `${formatNumber(ppcJourney.matchSummary.matchedMatters)} matched matter rows`, tone: colours.green },
      { label: 'Received', value: ppcAttributionIsLoading ? 'Updating' : formatCurrency(ppcReceived), detail: `${formatNumber(ppcJourney.matchSummary.matchedCollectedRows)} collected rows`, tone: colours.green },
      { label: 'WIP', value: ppcAttributionIsLoading ? 'Updating' : formatCurrency(ppcWip), detail: 'Chargeable WIP from paid-search matters', tone: colours.highlight },
    ];
    const ppcFunnelStageSignal = (stage: JourneyMetric) => {
      if (stage.key === 'pitches') return ppcJourney.matchSummary.matchedPitches;
      if (stage.key === 'instructions') return ppcJourney.matchSummary.matchedInstructions;
      if (stage.key === 'matters') return ppcJourney.matchSummary.matchedMatters;
      if (stage.key === 'collected') return ppcJourney.matchSummary.matchedCollectedRows;
      return 0;
    };
    const ppcFunnelMaxSignal = Math.max(1, ...ppcJourney.stages.map(ppcFunnelStageSignal));
    const ppcFunnelStages = ppcJourney.stages.map((stage, index) => {
      const signal = ppcFunnelStageSignal(stage);
      const fill = Math.max(8, Math.min(100, (signal / ppcFunnelMaxSignal) * 100));
      const width = `${Math.max(74, 100 - (index * 8))}%`;
      const tone = stage.key === 'collected' || stage.key === 'matters' ? colours.green : selectedChannelAccent;
      return { ...stage, fill, width, tone };
    });
    const ppcWeeklyCardBackground = (row: PpcAnalyticsTrendRow) => {
      const signal = row.value > 0 ? row.value : row.spend;
      const fill = Math.max(0, Math.min(100, (signal / maxWeeklyCardSignal) * 100));
      const tone = row.value > 0 ? colours.green : colours.highlight;
      const base = withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.014 : 0.24);
      return `linear-gradient(90deg, ${withAlpha(tone, isDarkMode ? 0.16 : 0.105)} 0%, ${withAlpha(tone, isDarkMode ? 0.08 : 0.06)} ${fill.toFixed(1)}%, ${base} ${fill.toFixed(1)}%, ${base} 100%)`;
    };
    const ppcSourceBadgeLabel = hasGoogleAdsFeedTotals
      ? 'Google Ads telemetry'
      : ppcLedgerRows.length > 0
        ? 'Ledger fallback'
        : 'Attribution only';
    const ppcHealthItems = [
      {
        label: 'Feed rows',
        value: formatNumber(metrics.paid.rows),
        detail: ppcHasTelemetry ? ppcDataSourceLabel : 'No Google Ads or PPC ledger rows in this window',
        tone: ppcHasTelemetry ? selectedChannelAccent : colours.cta,
      },
      {
        label: 'Attribution chain',
        value: ppcAttributionIsLoading ? 'Updating' : formatNumber(ppcMatterCount),
        detail: `${formatNumber(ppcJourney.matchSummary.anchorCount)} anchors; ${formatNumber(ppcJourney.matchSummary.matchedMatters)} matched matters`,
        tone: ppcJourney.matchSummary.matchedMatters > 0 ? colours.green : colours.highlight,
      },
      {
        label: 'Enquiry quality',
        value: `${formatNumber(ppcEnquiryRate, 2)}%`,
        detail: 'recorded paid enquiries divided by paid clicks',
        tone: ppcEnquiryCount > 0 ? selectedChannelAccent : colours.highlight,
      },
      {
        label: 'Return',
        value: ppcAttributionIsLoading ? 'Updating' : ppcReturnMultiple,
        detail: ppcAnalyticsValue > 0 ? `${formatCurrency(ppcAnalyticsValue)} received and WIP` : 'No attributed value in this window yet',
        tone: ppcAnalyticsValue > 0 ? colours.green : colours.highlight,
      },
    ];
    const ppcAttentionItems = [
      !ppcHasTelemetry
        ? 'Google Ads telemetry is not available for this window, so the page is relying on paid-search attribution where it exists.'
        : null,
      ppcChannelEnquiries.length === 0
        ? 'No enquiries are currently classified as Paid search in this reporting window.'
        : null,
      !ppcAttributionIsLoading && ppcAnalyticsValue === 0
        ? 'Spend is present, but no received or WIP value is attributed to paid search yet.'
        : null,
      ppcJourney.matchSummary.sourceEnquiries > 0 && ppcJourney.matchSummary.anchorCount === 0
        ? 'Paid-search enquiries exist, but the downstream pitch and matter chain has no usable anchors yet.'
        : null,
      ppcAttributionIsLoading
        ? 'Search attribution is still settling, so downstream value may update after the feed completes.'
        : null,
    ].filter((item): item is string => Boolean(item));
    const recentPpcEnquiries = [...ppcChannelEnquiries]
      .sort((left, right) => right.sortTs - left.sortTs)
      .slice(0, 5);
    const recentPpcMatters = [...ppcJourney.downstream.matters]
      .sort((left, right) => right.sortTs - left.sortTs)
      .slice(0, 5);
    const streamDateLabel = (row: MarketingWorkspaceRow) => formatSupportDate(row.sortTs) || compactLabel(row.timestamp, 'No date');

    return (
      <section
        data-helix-region="marketing/ppc-drilldown"
        style={{
          display: 'grid',
          gap: 12,
          minWidth: 0,
          padding: 12,
          border: `1px solid ${valueSheetBorder}`,
          borderTop: `1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.34 : 0.22)}`,
          background: reportingPanelBackground(isDarkMode, 'elevated'),
          boxShadow: reportingPanelShadow(isDarkMode),
        }}
      >
        <div data-helix-region="marketing/ppc-drilldown/header" style={{ display: 'grid', gap: 9, minWidth: 0, padding: '2px 0 4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(190px, auto)', gap: 12, alignItems: 'stretch', minWidth: 0 }}>
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: withAlpha(selectedChannelAccent, isDarkMode ? 0.88 : 0.78) }}>
                PPC performance snapshot
              </span>
              <strong style={{ fontSize: 20, lineHeight: 1.08, fontWeight: 900, color: textColour }}>
                Paid search spend, traffic and return
              </strong>
              <small style={{ maxWidth: 660, fontSize: 10.5, lineHeight: 1.32, fontWeight: 800, color: ppcDetailTextColour }}>
                Google Ads spend and conversion data set against enquiry attribution and downstream matter value.
              </small>
            </span>
            <span style={{ display: 'grid', alignContent: 'center', gap: 2, minWidth: 0, padding: '8px 10px', border: `1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.26 : 0.18)}`, borderLeft: `3px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.78 : 0.62)}`, background: withAlpha(selectedChannelAccent, isDarkMode ? 0.06 : 0.045) }}>
              <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: ppcDetailLabelColour }}>Snapshot basis</small>
              <strong style={{ fontSize: 12, lineHeight: 1.15, fontWeight: 900, color: textColour }}>{ppcSourceBadgeLabel}</strong>
              <small style={{ fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: ppcDetailTextColour }}>{ppcAttributionIsLoading ? 'Attribution updating' : 'Attribution settled'}</small>
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))', gap: 0, minWidth: 0, borderTop: `1px solid ${valueSheetBorder}`, borderLeft: `1px solid ${valueSheetBorder}`, background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.30) }}>
            {[
              { label: 'Reporting window', value: timelineRangeLabel },
              { label: 'Data source', value: ppcDataSourceLabel },
              { label: 'Rows synced', value: formatNumber(metrics.paid.rows) },
            ].map((item) => (
              <span key={item.label} title={`${item.label}: ${item.value}`} style={{ display: 'grid', gap: 3, minWidth: 0, padding: '7px 9px', borderRight: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}` }}>
                <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: ppcDetailLabelColour }}>{item.label}</small>
                <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, lineHeight: 1.2, fontWeight: 900, color: withAlpha(textColour, isDarkMode ? 0.90 : 0.84) }}>{item.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div data-helix-region="marketing/ppc-drilldown/figures" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 0, padding: '7px 0', borderTop: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}`, background: ppcKpiRailSurface }}>
          {ppcDrilldownFigures.map((figure, index) => (
            <span
              key={figure.label}
              className="marketing-drilldown-kpi-card"
              data-detail={figure.detail}
              aria-label={`${figure.label}: ${figure.value}. ${figure.detail}`}
              tabIndex={0}
              style={{
                display: 'grid',
                gap: 4,
                minWidth: 0,
                position: 'relative',
                padding: '5px 10px 6px',
                borderLeft: index === 0 ? 'none' : `1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.08 : 0.10)}`,
                background: 'transparent',
                cursor: 'help',
                outline: 'none',
              }}
            >
              <small style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0, textTransform: 'uppercase', color: ppcDetailLabelColour }}>{figure.label}</small>
              <strong style={{ fontSize: 16, lineHeight: 1, fontWeight: 900, color: ppcKpiTone(figure.label) }}>{figure.value}</strong>
            </span>
          ))}
        </div>
        <style>{`
          .marketing-drilldown-kpi-card {
            transition: background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
          }

          .marketing-drilldown-kpi-card:hover,
          .marketing-drilldown-kpi-card:focus-visible {
            background-color: ${withAlpha(selectedChannelAccent, isDarkMode ? 0.055 : 0.04)} !important;
            box-shadow: inset 0 -2px 0 ${withAlpha(selectedChannelAccent, isDarkMode ? 0.46 : 0.32)};
            transform: translateY(-1px);
          }

          .marketing-drilldown-kpi-card::after {
            content: attr(data-detail);
            position: absolute;
            z-index: 20;
            left: 10px;
            right: 10px;
            top: calc(100% + 7px);
            padding: 7px 8px;
            border: 1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.28 : 0.18)};
            background: ${chartPanelBackground};
            color: ${ppcDetailTextColour};
            box-shadow: ${isDarkMode ? `0 12px 24px ${withAlpha(colours.darkBlue, 0.38)}` : `0 12px 24px ${withAlpha(colours.darkBlue, 0.10)}`};
            font-size: 10px;
            font-weight: 800;
            line-height: 1.32;
            text-transform: none;
            letter-spacing: 0;
            white-space: normal;
            pointer-events: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 150ms ease, transform 150ms ease;
          }

          .marketing-drilldown-kpi-card:hover::after,
          .marketing-drilldown-kpi-card:focus-visible::after {
            opacity: 1;
            transform: translateY(0);
          }

          @media (prefers-reduced-motion: reduce) {
            .marketing-drilldown-kpi-card,
            .marketing-drilldown-kpi-card::after {
              transition: none;
            }
          }
        `}</style>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, 0.95fr)', gap: 12, minWidth: 0 }}>
          <section
            data-helix-region="marketing/ppc-drilldown/weekly-trend"
            style={{
              display: 'grid',
              gridTemplateRows: 'auto minmax(180px, auto) auto',
              gap: 10,
              minWidth: 0,
              padding: 12,
              border: `1px solid ${valueSheetBorder}`,
              background: chartPanelBackground,
            }}
          >
            <div style={{ display: 'grid', gap: 8, minWidth: 0 }}>
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14, fontWeight: 900, color: textColour }}>Weekly paid search trend</strong>
                <small style={{ fontSize: 10, fontWeight: 800, color: ppcDetailTextColour }}>Spend uses the left axis; enquiries and matters use the right count axis</small>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px 10px', flexWrap: 'wrap', minWidth: 0, fontSize: 10, fontWeight: 800, color: ppcDetailTextColour }}>
                <span aria-label="Spend line" title="Spend line" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 18, height: 2, background: colours.highlight, boxShadow: `7px 0 0 0 ${chartPanelBackground}, 7px 0 0 2px ${colours.highlight}` }} /> Spend</span>
                <span aria-label="Enquiries bar" title="Enquiries bar" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 8, height: 12, background: selectedChannelAccent }} /> Enquiries</span>
                <span aria-label="Matter ring" title="Matter ring" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span aria-hidden="true" style={{ width: 9, height: 9, border: `2px solid ${colours.orange}`, borderRadius: 999, background: chartPanelBackground }} /> Matter</span>
              </span>
            </div>
            {chartRows.length === 0 ? (
              <div style={{ display: 'grid', placeItems: 'center', minHeight: 178, border: `1px dashed ${valueSheetBorder}`, color: ppcDetailTextColour, fontSize: 11, fontWeight: 800, textAlign: 'center', padding: 12 }}>
                No Google Ads or PPC attribution rows are available for this reporting window yet.
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="PPC spend, enquiries and matters by week"
                style={{ display: 'block', width: '100%', height: 'auto', aspectRatio: `${chartWidth} / ${chartHeight}`, overflow: 'visible', background: chartPanelInset }}
              >
                <defs>
                  <linearGradient id="marketing-ppc-drilldown-spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={withAlpha(colours.highlight, isDarkMode ? 0.42 : 0.24)} />
                    <stop offset="100%" stopColor={withAlpha(colours.highlight, 0.03)} />
                  </linearGradient>
                </defs>
                {chartTicks.map((tick) => {
                  const y = yForSpend(tick.value);
                  return (
                    <g key={tick.key}>
                      <line x1={chartLeft} x2={chartRight} y1={y} y2={y} stroke={withAlpha(isDarkMode ? colours.dark.text : colours.helixBlue, isDarkMode ? 0.08 : 0.08)} strokeWidth="1" />
                      <text x={chartLeft - 6} y={y + 4} textAnchor="end" fontSize="10" fill={ppcDetailTextColour}>{formatCurrency(tick.value)}</text>
                    </g>
                  );
                })}
                <text x={chartLeft - 6} y={chartTop - 7} textAnchor="end" fontSize="9" fontWeight="800" fill={ppcDetailTextColour}>Spend</text>
                <line x1={chartRight} x2={chartRight} y1={chartTop} y2={chartHeight - chartBottom} stroke={withAlpha(colours.orange, isDarkMode ? 0.26 : 0.20)} strokeWidth="1" />
                <text x={chartRight + 9} y={chartTop - 7} textAnchor="start" fontSize="9" fontWeight="800" fill={ppcDetailTextColour}>Count</text>
                {countTicks.map((tick) => {
                  const y = yForCount(tick.value);
                  return (
                    <g key={tick.key}>
                      <line x1={chartRight} x2={chartRight + 5} y1={y} y2={y} stroke={withAlpha(colours.orange, isDarkMode ? 0.32 : 0.24)} strokeWidth="1" />
                      <text x={chartRight + 9} y={y + 4} textAnchor="start" fontSize="10" fill={ppcDetailTextColour}>{formatNumber(tick.value)}</text>
                    </g>
                  );
                })}
                {spendAreaPath && <path d={spendAreaPath} fill="url(#marketing-ppc-drilldown-spend)" stroke="none" />}
                {spendLinePath && <path d={spendLinePath} fill="none" stroke={colours.highlight} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {chartRows.map((row, index) => {
                  const x = xFor(index);
                  const barY = yForCount(row.enquiries);
                  const barHeight = row.enquiries > 0 ? Math.max(5, chartHeight - chartBottom - barY) : 0;
                  const matterY = yForCount(row.matters);
                  return (
                    <g key={row.key}>
                      <title>{`${row.label}: ${formatCurrency(row.spend)} spend, ${formatNumber(row.clicks)} clicks, ${formatNumber(row.enquiries)} enquiries, ${formatNumber(row.matters)} matters, ${formatCurrency(row.value)} value`}</title>
                      {barHeight > 0 && <rect x={x - 8} y={chartHeight - chartBottom - barHeight} width={16} height={barHeight} fill={withAlpha(selectedChannelAccent, isDarkMode ? 0.72 : 0.64)} />}
                      {row.matters > 0 && <circle cx={x + 10} cy={matterY} r="4.5" fill={chartPanelBackground} stroke={colours.orange} strokeWidth="2" />}
                      <circle cx={x} cy={yForSpend(row.spend)} r="4" fill={chartPanelBackground} stroke={colours.highlight} strokeWidth="2" />
                      <text x={x} y={chartHeight - 9} textAnchor="middle" fontSize="10" fontWeight="700" fill={ppcDetailTextColour}>{row.label}</text>
                    </g>
                  );
                })}
              </svg>
            )}
            <div data-helix-region="marketing/ppc-drilldown/weekly-detail" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(214px, 1fr))', gap: '8px 10px', paddingTop: 8, borderTop: `1px solid ${valueSheetBorder}` }}>
              {chartRows.map((row) => (
                <span key={`ppc-trend-${row.key}`} title={`${row.label}: ${formatCurrency(row.spend)} spend, ${formatNumber(row.clicks)} clicks, ${formatNumber(row.enquiries)} enquiries, ${formatNumber(row.matters)} matters, ${formatCurrency(row.value)} value. Fill strength reflects ${row.value > 0 ? 'weekly attributed value' : 'weekly spend capacity'}.`} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: 9, minWidth: 0, padding: '7px 8px', border: `1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.09 : 0.11)}`, background: ppcWeeklyCardBackground(row) }}>
                  <small style={{ fontSize: 9, fontWeight: 900, color: ppcDetailLabelColour, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{row.label}</small>
                  <span style={{ display: 'grid', gap: 2, minWidth: 0, color: ppcDetailTextColour, fontSize: 10, lineHeight: 1.28 }}>
                    <strong style={{ fontSize: 11, fontWeight: 900, color: textColour, whiteSpace: 'nowrap' }}>{formatCurrency(row.spend)} spend</strong>
                    <small style={{ minWidth: 0, color: ppcDetailTextColour, fontSize: 10, lineHeight: 1.28, fontWeight: 800 }}>{formatNumber(row.clicks)} clicks / {formatNumber(row.enquiries)} enquiries / {formatNumber(row.matters)} matters / {formatCurrency(row.value)} value</small>
                  </span>
                </span>
              ))}
            </div>
          </section>

          <section
            data-helix-region="marketing/ppc-drilldown/downstream-quality"
            style={{
              display: 'grid',
              gap: 10,
              minWidth: 0,
              padding: 12,
              border: `1px solid ${valueSheetBorder}`,
              background: chartPanelBackground,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14, fontWeight: 900, color: textColour }}>Downstream quality</strong>
                <small style={{ fontSize: 10, fontWeight: 800, color: ppcDetailTextColour }}>Paid-search enquiries matched into matters and value</small>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, color: ppcDetailTextColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
                Return <strong style={{ color: colours.green, fontSize: 13, fontWeight: 900 }}>{ppcAttributionIsLoading ? 'Updating' : ppcReturnMultiple}</strong>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0, borderTop: `1px solid ${valueSheetBorder}`, borderLeft: `1px solid ${valueSheetBorder}`, background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.018 : 0.30) }}>
              {ppcQualityCards.map((card) => (
                <span key={card.label} title={`${card.label}: ${card.value}. ${card.detail}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'baseline', gap: 8, minWidth: 0, padding: '8px 9px', borderRight: `1px solid ${valueSheetBorder}`, borderBottom: `1px solid ${valueSheetBorder}`, background: 'transparent' }}>
                  <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                    <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: ppcDetailLabelColour }}>{card.label}</small>
                    <small style={{ fontSize: 10, lineHeight: 1.28, fontWeight: 800, color: ppcDetailTextColour }}>{card.detail}</small>
                  </span>
                  <strong style={{ fontSize: 16, lineHeight: 1, fontWeight: 900, color: card.tone, whiteSpace: 'nowrap' }}>{card.value}</strong>
                </span>
              ))}
            </div>
            <div data-helix-region="marketing/ppc-drilldown/journey-stages" style={{ display: 'grid', gap: 8, padding: '10px 9px', border: `1px solid ${valueSheetBorder}`, background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.014 : 0.22) }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: ppcDetailLabelColour }}>Conversion path</small>
                <small style={{ fontSize: 9, fontWeight: 900, color: ppcDetailTextColour }}>{formatNumber(ppcJourney.matchSummary.filteredEnquiries)} selected enquiries</small>
              </span>
              {ppcFunnelStages.map((stage, index) => (
                <div key={stage.key} style={{ display: 'grid', justifyItems: 'center', minWidth: 0 }}>
                  <span
                    title={`${stage.label}: ${stage.value}. ${stage.detail}; ${stage.basis}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 8,
                      alignItems: 'center',
                      width: stage.width,
                      minWidth: 'min(100%, 218px)',
                      minHeight: 48,
                      padding: '8px 10px',
                      border: `1px solid ${withAlpha(stage.tone, isDarkMode ? 0.32 : 0.20)}`,
                      borderLeft: `3px solid ${stage.tone}`,
                      background: `linear-gradient(90deg, ${withAlpha(stage.tone, isDarkMode ? 0.14 : 0.09)} 0%, ${withAlpha(stage.tone, isDarkMode ? 0.07 : 0.045)} ${stage.fill.toFixed(1)}%, ${chartPanelBackground} ${stage.fill.toFixed(1)}%, ${chartPanelBackground} 100%)`,
                    }}
                  >
                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                        <small style={{ color: stage.tone, fontSize: 9, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{String(index + 1).padStart(2, '0')}</small>
                        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 900, color: textColour }}>{stage.label}</strong>
                      </span>
                      <small style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9.5, lineHeight: 1.28, fontWeight: 800, color: ppcDetailTextColour }}>{stage.detail}; {stage.basis}</small>
                    </span>
                    <strong style={{ fontSize: 12, fontWeight: 900, color: stage.tone, whiteSpace: 'nowrap' }}>{stage.value}</strong>
                  </span>
                </div>
              ))}
              {ppcJourney.filteredEnquiries.length === 0 && (
                <span style={{ padding: '8px 0 0', fontSize: 10, lineHeight: 1.35, fontWeight: 800, color: ppcDetailTextColour }}>
                  No paid-search enquiries are available for this reporting window yet.
                </span>
              )}
            </div>
          </section>
        </div>

        <section data-helix-region="marketing/ppc-drilldown/health" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, fontWeight: 900, color: textColour }}>Feed health and attention</strong>
            <small style={{ fontSize: 10, fontWeight: 800, color: ppcDetailTextColour }}>What needs checking before treating PPC performance as final</small>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 8 }}>
            {ppcHealthItems.map((item) => (
              <span key={item.label} style={{ display: 'grid', gap: 5, minWidth: 0, padding: '9px 10px', border: `1px solid ${valueSheetBorder}`, background: chartPanelBackground }}>
                <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: ppcDetailLabelColour }}>{item.label}</small>
                <strong style={{ fontSize: 15, lineHeight: 1, fontWeight: 900, color: item.tone }}>{item.value}</strong>
                <small style={{ fontSize: 10, lineHeight: 1.3, fontWeight: 800, color: ppcDetailTextColour }}>{item.detail}</small>
              </span>
            ))}
          </div>
          {ppcAttentionItems.length > 0 && (
            <div style={{ display: 'grid', gap: 5, padding: '9px 10px', border: `1px solid ${withAlpha(colours.highlight, isDarkMode ? 0.34 : 0.22)}`, background: withAlpha(colours.highlight, isDarkMode ? 0.08 : 0.055) }}>
              <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', color: ppcDetailLabelColour }}>Attention</small>
              {ppcAttentionItems.map((item) => (
                <span key={item} style={{ fontSize: 10, lineHeight: 1.35, fontWeight: 800, color: ppcDetailTextColour }}>{item}</span>
              ))}
            </div>
          )}
        </section>

        <section data-helix-region="marketing/ppc-drilldown/recent-streams" style={{ display: 'grid', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 13, fontWeight: 900, color: textColour }}>Recent paid-search streams</strong>
              <small style={{ fontSize: 10, lineHeight: 1.3, fontWeight: 800, color: ppcDetailTextColour }}>Latest enquiry and matter rows from the value-sheet proof chain</small>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: ppcDetailTextColour, fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
              <span aria-hidden="true" className="marketing-ppc-live-dot" style={{ width: 7, height: 7, background: selectedChannelAccent }} />
              Live rows
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, minWidth: 0, alignItems: 'start' }}>
            <section data-helix-region="marketing/ppc-drilldown/recent-enquiries" style={{ display: 'grid', gap: 0, minWidth: 0, border: `1px solid ${valueSheetBorder}`, background: chartPanelBackground }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, minWidth: 0, padding: '9px 10px', borderBottom: `1px solid ${valueSheetBorder}`, background: withAlpha(selectedChannelAccent, isDarkMode ? 0.055 : 0.04) }}>
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <strong style={{ fontSize: 12, fontWeight: 900, color: textColour }}>Recent enquiries</strong>
                  <small style={{ fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: ppcDetailTextColour }}>{formatNumber(recentPpcEnquiries.length)} shown from {formatNumber(ppcChannelEnquiries.length)} recorded</small>
                </span>
                <button type="button" onClick={() => returnToMarketingProof({ rowKey: 'paidSearch', metricKey: 'enquiries' })} style={{ minHeight: 26, border: `1px solid ${withAlpha(selectedChannelAccent, isDarkMode ? 0.34 : 0.24)}`, background: 'transparent', color: selectedChannelAccent, fontFamily: 'Raleway, sans-serif', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', padding: '0 8px', cursor: 'pointer' }}>
                  Open data
                </button>
              </div>
              <div style={{ display: 'grid', gap: 0, minWidth: 0, overflow: 'hidden' }}>
                {recentPpcEnquiries.map((row, index) => (
                  <button
                    key={`ppc-recent-enquiry-${row.id}-${index}`}
                    type="button"
                    className="marketing-ppc-stream-row"
                    onClick={() => returnToMarketingProof({ rowKey: 'paidSearch', metricKey: 'enquiries' })}
                    title={`Open paid-search enquiry proof data: ${row.primary}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                      minWidth: 0,
                      padding: '8px 10px',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : `1px solid ${valueSheetBorder}`,
                      background: index % 2 === 0 ? 'transparent' : withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.012 : 0.22),
                      color: textColour,
                      fontFamily: 'Raleway, sans-serif',
                      textAlign: 'left',
                      cursor: 'pointer',
                      animationDelay: `${index * 45}ms`,
                    }}
                  >
                    <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ width: 5, height: 5, flex: '0 0 auto', background: areaAccentColour(readAreaOfWork(row), isDarkMode) }} />
                        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 900, color: textColour }}>{row.primary}</strong>
                      </span>
                      <small style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: ppcDetailTextColour }}>{readAreaOfWork(row)} / {readEnquiryMethod(row)} / {row.status}</small>
                    </span>
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 2, color: ppcDetailTextColour }}>
                      <strong style={{ fontSize: 10, fontWeight: 900, color: selectedChannelAccent, whiteSpace: 'nowrap' }}>{streamDateLabel(row)}</strong>
                      <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{readOwnerInitials(row)}</small>
                    </span>
                  </button>
                ))}
                {recentPpcEnquiries.length === 0 && (
                  <span style={{ padding: '10px', fontSize: 10, lineHeight: 1.35, fontWeight: 800, color: ppcDetailTextColour }}>No recent paid-search enquiry rows are available yet.</span>
                )}
              </div>
            </section>

            <section data-helix-region="marketing/ppc-drilldown/recent-matters" style={{ display: 'grid', gap: 0, minWidth: 0, border: `1px solid ${valueSheetBorder}`, background: chartPanelBackground }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, minWidth: 0, padding: '9px 10px', borderBottom: `1px solid ${valueSheetBorder}`, background: withAlpha(colours.green, isDarkMode ? 0.055 : 0.04) }}>
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <strong style={{ fontSize: 12, fontWeight: 900, color: textColour }}>Recent matters</strong>
                  <small style={{ fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: ppcDetailTextColour }}>{formatNumber(recentPpcMatters.length)} shown from {formatNumber(ppcJourney.downstream.matters.length)} matched</small>
                </span>
                <button type="button" onClick={() => returnToMarketingProof({ rowKey: 'paidSearch', metricKey: 'matters' })} style={{ minHeight: 26, border: `1px solid ${withAlpha(colours.green, isDarkMode ? 0.34 : 0.24)}`, background: 'transparent', color: colours.green, fontFamily: 'Raleway, sans-serif', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', padding: '0 8px', cursor: 'pointer' }}>
                  Open data
                </button>
              </div>
              <div style={{ display: 'grid', gap: 0, minWidth: 0, overflow: 'hidden' }}>
                {recentPpcMatters.map((row, index) => (
                  <button
                    key={`ppc-recent-matter-${row.id}-${index}`}
                    type="button"
                    className="marketing-ppc-stream-row"
                    onClick={() => returnToMarketingProof({ rowKey: 'paidSearch', metricKey: 'matters' })}
                    title={`Open paid-search matter proof data: ${readMatterReference(row)}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                      minWidth: 0,
                      padding: '8px 10px',
                      border: 'none',
                      borderTop: index === 0 ? 'none' : `1px solid ${valueSheetBorder}`,
                      background: index % 2 === 0 ? 'transparent' : withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.012 : 0.22),
                      color: textColour,
                      fontFamily: 'Raleway, sans-serif',
                      textAlign: 'left',
                      cursor: 'pointer',
                      animationDelay: `${index * 45}ms`,
                    }}
                  >
                    <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ width: 5, height: 5, flex: '0 0 auto', background: colours.green }} />
                        <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 900, color: textColour }}>{readMatterReference(row)}</strong>
                      </span>
                      <small style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, lineHeight: 1.25, fontWeight: 800, color: ppcDetailTextColour }}>{row.secondary || row.detail || 'Matched paid-search matter'}</small>
                    </span>
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 2, color: ppcDetailTextColour }}>
                      <strong style={{ fontSize: 10, fontWeight: 900, color: colours.green, whiteSpace: 'nowrap' }}>{compactLabel(row.value, '-')}</strong>
                      <small style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{readMatterResponsibleInitials(row)}</small>
                    </span>
                  </button>
                ))}
                {recentPpcMatters.length === 0 && (
                  <span style={{ padding: '10px', fontSize: 10, lineHeight: 1.35, fontWeight: 800, color: ppcDetailTextColour }}>No matched paid-search matters are available yet.</span>
                )}
              </div>
            </section>
          </div>
          <style>{`
            .marketing-ppc-live-dot {
              animation: marketing-ppc-live-pulse 1450ms ease-in-out infinite;
            }

            .marketing-ppc-stream-row {
              animation: marketing-ppc-stream-enter 220ms ease-out both;
              transition: background-color 140ms ease, box-shadow 140ms ease, transform 140ms ease;
            }

            .marketing-ppc-stream-row:hover,
            .marketing-ppc-stream-row:focus-visible {
              transform: translateY(-1px);
              box-shadow: inset 2px 0 0 currentColor;
            }

            @keyframes marketing-ppc-live-pulse {
              0%, 100% { opacity: 0.48; transform: scale(0.86); }
              50% { opacity: 1; transform: scale(1); }
            }

            @keyframes marketing-ppc-stream-enter {
              from { opacity: 0; transform: translateY(4px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </section>
      </section>
    );
  };

  if (isBlueprintMode) {
    const blueprintSurface = isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground;
    const blueprintBorder = reportingPanelBorder(isDarkMode);
    const blueprintMutedSurface = withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.62 : 0.72);

    return (
      <section data-helix-region="marketing/performance-workspace" className="marketing-performance-workspace" style={{ display: 'grid', gap: 12 }}>
        <section
          data-helix-region="marketing/value-sheet"
          style={{
            display: 'grid',
            gap: 12,
            padding: 0,
            overflow: 'hidden',
            minWidth: 0,
            borderStyle: 'solid',
            borderWidth: '2px 1px 1px',
            borderColor: `${valueSheetAccent} ${blueprintBorder} ${blueprintBorder}`,
            backgroundColor: reportingPanelBackground(isDarkMode, 'elevated'),
          }}
        >
          <div
            data-helix-region="marketing/intent-strip"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              gap: 12,
              padding: '16px 14px 11px',
              borderBottom: `1px solid ${blueprintBorder}`,
              backgroundColor: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground, 0.76),
            }}
          >
            <span style={{ display: 'grid', minWidth: 0, flex: '1 1 auto' }}>
              <strong style={{ display: 'block', fontSize: 17, lineHeight: 1.08, fontWeight: 900, color: valueSheetAccent }}>
                Marketing Channels
              </strong>
            </span>
            <DefaultButton
              text="PDF"
              iconProps={{ iconName: 'Download' }}
              disabled
              styles={{
                root: {
                  borderRadius: 0,
                  height: 30,
                  minWidth: 74,
                  padding: '0 9px',
                  fontWeight: 900,
                  fontSize: 10,
                  border: `1px solid ${blueprintBorder}`,
                  background: 'transparent',
                  color: mutedColour,
                },
              }}
            />
          </div>

          <div style={{ padding: '12px 14px 14px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: valueSheetTableColumns,
                gap: 3,
                minWidth: 760,
                padding: 4,
                border: `1px solid ${withAlpha(valueSheetAccent, isDarkMode ? 0.20 : 0.14)}`,
                backgroundColor: valueSheetDeckSurface,
                overflowX: 'auto',
              }}
            >
              <div style={valueSheetHeaderBarStyle}>
                {VALUE_SHEET_COLUMNS.map(({ key, label, align }) => (
                  <span key={key} style={{ ...valueSheetHeaderCellStyle, textAlign: align }}>
                    {label}
                  </span>
                ))}
              </div>
              {Array.from({ length: 3 }).map((_, rowIndex) => (
                Array.from({ length: 10 }).map((__, cellIndex) => (
                  <span
                    key={`blueprint-value-row-${rowIndex}-${cellIndex}`}
                    style={{
                      padding: '8px 8px',
                      border: `1px solid ${withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.08 : 0.10)}`,
                      backgroundColor: rowIndex === 2
                        ? (isDarkMode ? colours.dark.cardHover : withAlpha(valueSheetAccent, 0.06))
                        : (isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.72)),
                    }}
                  >
                    <span className="marketing-skeleton-line" style={{ width: cellIndex <= 1 ? `${74 - rowIndex * 8}%` : `${52 + ((cellIndex + rowIndex) % 3) * 9}%`, height: 11, marginLeft: cellIndex <= 1 ? 0 : 'auto' }} />
                  </span>
                ))
              ))}
            </div>
          </div>

          <div style={{ padding: '0 14px 14px' }}>
            <MarketingTimelineWorkbench
              isDarkMode={isDarkMode}
              rangeLabel={timelineRangeLabel}
              statusLabel={timelineStatusLabel}
              isProcessing
              months={[]}
              summaryMode
            />
          </div>
        </section>

        {renderMarketingChannelEntries(true)}

        {showDevDraftSurfaces && (
          <section
            data-helix-region="marketing/draft-surfaces"
            style={{
              display: 'grid',
              gap: 12,
              padding: 10,
              border: `1px dotted ${withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.34 : 0.24)}`,
              background: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.20 : 0.42),
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              Dev draft surfaces
            </span>

          <section data-helix-region="marketing/evidence-quality" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            {evidenceCards.map((card) => (
              <div key={`blueprint-${card.label}`} style={{ ...panelStyle(isDarkMode), background: blueprintSurface, border: `1px solid ${blueprintBorder}`, borderTop: `2px solid ${isDarkMode ? colours.highlight : colours.helixBlue}` }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  {card.label}
                </span>
                <span className="marketing-skeleton-line" style={{ width: 68, height: 22 }} />
                <span className="marketing-skeleton-line" style={{ width: '78%', height: 11 }} />
              </div>
            ))}
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, width: '100%' }}>
            {['Selected channel metrics', 'Matched evidence rows'].map((panelLabel, panelIndex) => (
              <div
                key={panelLabel}
                style={{
                  display: 'grid',
                  gridTemplateRows: 'auto minmax(0, 1fr)',
                  gap: 0,
                  minWidth: 0,
                  width: '100%',
                  height: splitPanelHeight,
                  padding: '6px 8px',
                  border: `1px solid ${panelIndex === 0 ? splitLeftBorder : splitRightBorder}`,
                  background: panelIndex === 0 ? splitLeftSurface : splitRightSurface,
                  borderTop: `2px solid ${panelIndex === 0 ? splitLeftAccent : splitRightAccent}`,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '5px 7px',
                    marginBottom: 4,
                    border: `1px solid ${panelIndex === 0 ? splitLeftBorder : splitRightBorder}`,
                    background: toggleContainerBackground,
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: panelIndex === 0 ? splitLeftLabel : splitRightLabel }}>
                    {panelLabel}
                  </span>
                  <span className="marketing-skeleton-line" style={{ width: 86, height: 9 }} />
                </div>
                <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
                  {Array.from({ length: 4 }).map((_, rowIndex) => (
                    <div
                      key={`blueprint-lower-${panelIndex}-${rowIndex}`}
                      style={{
                        display: 'grid',
                        gap: 5,
                        padding: '6px 2px',
                        borderBottom: rowIndex === 3 ? 'none' : `1px solid ${panelIndex === 0 ? splitLeftBorder : splitRightBorder}`,
                      }}
                    >
                      <span className="marketing-skeleton-line" style={{ width: `${58 + rowIndex * 8}%`, height: 12 }} />
                      <span className="marketing-skeleton-line" style={{ width: `${80 - rowIndex * 7}%`, height: 9 }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          </section>
        )}
      </section>
    );
  }

  if (effectiveWorkspacePage === 'email') {
    return (
      <section
        data-helix-region="marketing/performance-workspace"
        className="marketing-performance-workspace"
        style={{
          display: 'grid',
          gap: 12,
        }}
      >
        <MarketingEmailWorkbench
          isDarkMode={isDarkMode}
          operatorName={operatorName}
          operatorInitials={operatorInitials}
          operatorEmail={operatorEmail}
          demoModeEnabled={demoModeEnabled}
        />
      </section>
    );
  }

  if (effectiveWorkspacePage === 'seo') {
    return (
      <section
        data-helix-region="marketing/performance-workspace"
        className="marketing-performance-workspace"
        style={{
          display: 'grid',
          gap: 12,
        }}
      >
        <section data-helix-region="marketing/seo-page" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          {renderSeoDrilldown()}
        </section>
      </section>
    );
  }

  if (effectiveWorkspacePage === 'ppc') {
    return (
      <section
        data-helix-region="marketing/performance-workspace"
        className="marketing-performance-workspace"
        style={{
          display: 'grid',
          gap: 12,
        }}
      >
        <section data-helix-region="marketing/ppc-page" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          {renderPpcDrilldown()}
        </section>
      </section>
    );
  }

  return (
    <section
      data-helix-region="marketing/performance-workspace"
      className="marketing-performance-workspace"
      style={{
        display: 'grid',
        gap: 12,
      }}
    >
      <section
        data-helix-region="marketing/value-sheet"
        style={{
          display: 'grid',
          gap: 12,
          padding: 0,
          overflow: 'hidden',
          minWidth: 0,
          borderStyle: 'solid',
          borderWidth: '2px 1px 1px',
          borderColor: `${valueSheetAccent} ${reportingPanelBorder(isDarkMode)} ${reportingPanelBorder(isDarkMode)}`,
          backgroundColor: reportingPanelBackground(isDarkMode, 'elevated'),
        }}
      >
        <div
          data-helix-region="marketing/intent-strip"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 12,
            padding: '16px 14px 11px',
            borderBottom: `1px solid ${valueSheetBorder}`,
            backgroundColor: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground, 0.76),
          }}
        >
          <span style={{ display: 'grid', minWidth: 0, flex: '1 1 auto' }}>
            <strong style={{ display: 'block', fontSize: 17, lineHeight: 1.08, fontWeight: 900, color: valueSheetAccent }}>
              Marketing Channels
            </strong>
          </span>
          <DefaultButton
            text={marketingReportDownloadState.status === 'downloading' ? 'Preparing' : 'PDF'}
            iconProps={{ iconName: 'Download' }}
            onClick={downloadMarketingReport}
            disabled={Boolean(marketingReportRangeError) || marketingReportDownloadState.status === 'downloading'}
            title="Download search value backing sheet"
            ariaLabel="Download search value backing sheet"
            styles={{
              root: {
                borderRadius: 0,
                height: 30,
                minWidth: 74,
                padding: '0 9px',
                fontWeight: 900,
                fontSize: 10,
                border: `1px solid ${withAlpha(valueSheetAccent, isDarkMode ? 0.48 : 0.34)}`,
                background: 'transparent',
                color: valueSheetAccent,
              },
              rootHovered: {
                border: `1px solid ${valueSheetAccent}`,
                background: withAlpha(valueSheetAccent, isDarkMode ? 0.14 : 0.08),
                color: valueSheetAccent,
              },
              rootDisabled: {
                border: `1px solid ${valueSheetBorder}`,
                background: 'transparent',
                color: mutedColour,
              },
            }}
          />
        </div>

        <div style={{ padding: '12px 14px 14px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: valueSheetTableColumns,
              gap: 3,
              minWidth: 760,
              padding: 4,
              border: `1px solid ${withAlpha(valueSheetAccent, isDarkMode ? 0.20 : 0.14)}`,
              backgroundColor: valueSheetDeckSurface,
              overflowX: 'auto',
            }}
          >
            <div style={valueSheetHeaderBarStyle}>
              {VALUE_SHEET_COLUMNS.map(({ key, label, align }) => (
                <span key={key} style={{ ...valueSheetHeaderCellStyle, textAlign: align }}>
                  {label}
                </span>
              ))}
            </div>
            {valueSheetDisplayRows.map((row) => {
              const totalRow = row.key === 'totalSearch';
              const cellBackground = totalRow
                ? (isDarkMode ? colours.dark.cardHover : withAlpha(valueSheetAccent, 0.07))
                : (isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.74));
              const cells = getValueSheetCells(row);
              return (
                <React.Fragment key={row.key}>
                  {cells.map((cell, index) => {
                    const activeCell = activeValueSheetTray?.rowKey === row.key && activeValueSheetTray.metricKey === cell.key;
                    const hoveredCell = hoveredValueSheetCell?.rowKey === row.key && hoveredValueSheetCell.metricKey === cell.key;
                    const cellTone = getValueSheetCellTone(cell.key);
                    const metricToneApplies = cell.key === 'spend' || cell.key === 'received' || cell.key === 'wip' || cell.key === 'totalValue';
                    const showRevealIndicator = index === 0;
                    const sourceInset = index === 0 ? `inset 2px 0 0 ${activeCell ? cellTone : valueSheetSourceAccent}` : '';
                    const hoverShadow = hoveredCell || activeCell ? `0 8px 18px ${withAlpha(colours.websiteBlue, isDarkMode ? 0.34 : 0.10)}` : '';
                    const cellBoxShadow = [sourceInset, hoverShadow].filter(Boolean).join(', ') || undefined;
                    const hoveredBackground = totalRow
                      ? (isDarkMode ? colours.dark.cardHover : withAlpha(valueSheetAccent, 0.10))
                      : (isDarkMode ? colours.dark.cardHover : withAlpha(cellTone, 0.055));
                    return (
                      <button
                        key={`${row.key}-${cell.key}`}
                        type="button"
                        aria-expanded={activeCell}
                        aria-label={`${row.source} ${cell.label}: ${cell.value}. ${cell.basis || 'Open supporting detail.'}`}
                        title={`${row.source} - ${cell.label}: ${cell.value}\n${cell.basis || 'Supporting detail'}\nClick to open the detail tray.`}
                        onClick={() => setActiveValueSheetTray(activeCell ? null : { rowKey: row.key, metricKey: cell.key })}
                        onMouseEnter={() => setHoveredValueSheetCell({ rowKey: row.key, metricKey: cell.key })}
                        onMouseLeave={() => { if (hoveredValueSheetCell?.rowKey === row.key && hoveredValueSheetCell.metricKey === cell.key) setHoveredValueSheetCell(null); }}
                        onFocus={() => setHoveredValueSheetCell({ rowKey: row.key, metricKey: cell.key })}
                        onBlur={() => { if (hoveredValueSheetCell?.rowKey === row.key && hoveredValueSheetCell.metricKey === cell.key) setHoveredValueSheetCell(null); }}
                        style={{
                          padding: '9px 9px',
                          border: `1px solid ${activeCell ? cellTone : hoveredCell ? withAlpha(cellTone, isDarkMode ? 0.52 : 0.30) : totalRow ? withAlpha(valueSheetAccent, isDarkMode ? 0.22 : 0.18) : withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.08 : 0.10)}`,
                          backgroundColor: activeCell ? withAlpha(cellTone, isDarkMode ? 0.15 : 0.08) : hoveredCell ? hoveredBackground : cellBackground,
                          color: metricToneApplies ? cellTone : totalRow ? textColour : index === 0 ? valueSheetSourceAccent : mutedColour,
                          fontFamily: 'Raleway, sans-serif',
                          fontSize: 11,
                          fontWeight: totalRow || index === 0 || index === 7 ? 900 : 700,
                          textAlign: cell.align,
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: cell.align === 'right' ? 'flex-end' : 'flex-start',
                          gap: 6,
                          position: 'relative',
                          boxShadow: cellBoxShadow,
                          transform: hoveredCell || activeCell ? 'translateY(-1px)' : 'translateY(0)',
                          transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, transform 140ms ease',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.value}</span>
                        {showRevealIndicator && (
                          <span aria-hidden="true" style={{ color: activeCell ? cellTone : hoveredCell ? cellTone : mutedColour, fontSize: 10, fontWeight: 900, opacity: activeCell ? 1 : hoveredCell ? 0.86 : 0.62, transition: 'color 140ms ease, opacity 140ms ease' }}>
                            {activeCell ? '-' : '+'}
                          </span>
                        )}
                        {!showRevealIndicator && (
                          <FontIcon aria-hidden="true" iconName="Info" style={{ width: 10, textAlign: 'center', color: cellTone, fontSize: 9, opacity: activeCell ? 0.92 : hoveredCell ? 0.78 : 0, transition: 'opacity 140ms ease' }} />
                        )}
                      </button>
                    );
                  })}
                  {renderValueSheetTray(row, cells)}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '0 14px 14px' }}>
          <MarketingTimelineWorkbench
            isDarkMode={isDarkMode}
            rangeLabel={timelineRangeLabel}
            statusLabel={timelineStatusLabel}
            isProcessing={timelineIsProcessing}
            months={timelineMonths}
            summaryMode
          />
        </div>
      </section>

      {renderMarketingChannelEntries(false)}

      {!effectiveWorkspacePage ? null : (

      <section data-helix-region="marketing/channel-surface" style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        <>

        {effectiveChannelPage === 'seo' && renderSeoDrilldown()}

        {showDevDraftSurfaces && (
        <section
          data-helix-region="marketing/draft-surfaces"
          style={{
            display: 'grid',
            gap: 12,
            padding: 10,
            border: `1px dotted ${withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.34 : 0.24)}`,
            background: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.20 : 0.42),
          }}
        >
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
          Dev draft surfaces
        </span>

      <section
        data-helix-region="marketing/channel-workbench"
        aria-hidden
        style={{
          ...panelStyle(isDarkMode),
          display: 'none',
          gap: 0,
          padding: 0,
          overflow: 'hidden',
          borderTop: `2px solid ${selectedChannelAccent}`,
        }}
      >
        <div
          data-helix-region="marketing/channel-workbench/governor"
          style={{
            display: 'grid',
            gap: 10,
            padding: '12px 12px 10px',
            background: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.62 : 0.72),
            borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: textColour }}>Marketing channel workbench</h2>
            <div
              data-helix-region="marketing/channel-status-strip"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flexWrap: 'wrap',
              }}
            >
              {channelStatusStrip.map((channel) => {
                const enabled = channel.status === 'enabled';
                return (
                  <span
                    key={channel.key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      minHeight: 20,
                      padding: '0 7px',
                      border: `1px solid ${enabled ? withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.32 : 0.16) : withAlpha(isDarkMode ? colours.subtleGrey : colours.greyText, isDarkMode ? 0.14 : 0.22)}`,
                      background: enabled ? withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.10 : 0.04) : 'transparent',
                      color: enabled ? textColour : withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.52 : 0.56),
                      fontSize: 9,
                      fontWeight: 900,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: enabled ? colours.green : withAlpha(isDarkMode ? colours.subtleGrey : colours.greyText, isDarkMode ? 0.32 : 0.34),
                      }}
                    />
                    {channel.label} {enabled ? 'Enabled' : 'Off'}
                  </span>
                );
              })}
            </div>
          </div>

        </div>

        <div
          id={`marketing-channel-panel-${effectiveChannelPage}`}
          role="tabpanel"
          aria-label="Marketing channel journey lanes"
          data-helix-region={`marketing/channel-workbench/${effectiveChannelPage}`}
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            background: reportingPanelBackground(isDarkMode),
          }}
        >
          <div role="tablist" aria-label="Marketing channel journey lanes" style={{ display: 'grid', gap: 8 }}>
            {channelJourneyBanners.map((banner) => {
              const selected = banner.key === effectiveChannelPage;
              const selectableChannel = banner.key === 'seo' || banner.key === 'ppc' ? banner.key : null;
              const canSelect = Boolean(selectableChannel);
              const activeIntakeKey = selectableChannel ? selectedIntakeByChannel[selectableChannel] ?? 'all' : 'all';
              const background = selected
                ? withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.14 : 0.06)
                : reportingPanelBackground(isDarkMode, 'elevated');
              const channelPrimaryLabel = banner.key === 'seo' ? 'Sessions' : (banner.key === 'ppc' ? 'Conversions' : 'Email');
              const channelSeparatorColour = withAlpha(isDarkMode ? colours.subtleGrey : colours.helixBlue, isDarkMode ? 0.20 : 0.13);
              const channelFilterMetrics = toIntakeChips(banner.intake);
              return (
                <div
                  id={`marketing-channel-tab-${banner.key}`}
                  key={banner.key}
                  role="tab"
                  aria-selected={selected}
                  aria-disabled={!banner.enabled}
                  tabIndex={canSelect ? 0 : -1}
                  onClick={() => {
                    if (selectableChannel) setMarketingWorkspacePage(selectableChannel);
                  }}
                  onKeyDown={(event) => {
                    if (!canSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    if (selectableChannel) setMarketingWorkspacePage(selectableChannel);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(118px, 0.17fr) minmax(0, 1fr)',
                    gap: 0,
                    width: '100%',
                    minHeight: 134,
                    padding: 0,
                    border: `1px solid ${selected ? banner.accent : reportingPanelBorder(isDarkMode)}`,
                    borderLeft: `4px solid ${banner.accent}`,
                    background,
                    color: banner.enabled ? textColour : withAlpha(isDarkMode ? colours.dark.text : colours.greyText, isDarkMode ? 0.52 : 0.62),
                    textAlign: 'left',
                    fontFamily: 'Raleway, sans-serif',
                    cursor: canSelect ? 'pointer' : 'not-allowed',
                    opacity: banner.enabled ? 1 : 0.76,
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      display: 'grid',
                      alignContent: 'center',
                      gap: 7,
                      minWidth: 0,
                      padding: '12px 13px',
                      borderRight: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                      background: selected
                        ? withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.48 : 0.54)
                        : withAlpha(isDarkMode ? colours.darkBlue : colours.grey, isDarkMode ? 0.26 : 0.44),
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: banner.accent }}>
                      {banner.label}
                    </span>
                    <strong style={{ fontSize: 18, lineHeight: 1, fontWeight: 900, color: banner.enabled ? textColour : 'inherit' }}>
                      {banner.sourceLabel}
                    </strong>
                    <span style={{ fontSize: 9, lineHeight: 1.25, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                      {banner.enabled ? 'Source field' : 'Reserved lane'}
                    </span>
                  </span>

                  <span style={{ display: 'grid', gridTemplateRows: 'auto auto', minWidth: 0 }}>
                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(148px, 0.72fr) 1px minmax(0, 1.85fr)',
                        minWidth: 0,
                        minHeight: 62,
                        borderBottom: `1px solid ${reportingPanelBorder(isDarkMode)}`,
                        background: withAlpha(isDarkMode ? colours.dark.text : colours.sectionBackground, isDarkMode ? 0.012 : 0.34),
                      }}
                    >
                      <span style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0, padding: '10px 15px' }}>
                        <strong style={{ fontSize: 25, lineHeight: 1, color: textColour }}>{banner.headline}</strong>
                        <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: banner.accent }}>
                          {channelPrimaryLabel}
                        </span>
                      </span>

                      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '12px 0', background: channelSeparatorColour }} />

                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', minWidth: 0, padding: '0 8px' }}>
                        {channelFilterMetrics.map((chip, index) => {
                          const chipHoverKey = `${banner.key}-${chip.key}`;
                          const isChipActive = activeIntakeKey === chip.key;
                          const isChipInteractive = canSelect && banner.enabled;
                          const isChipHovered = hoveredIntakeFilter === chipHoverKey && isChipInteractive;
                          return (
                            <button
                              key={`${banner.key}-filter-${chip.key}`}
                              type="button"
                              aria-pressed={isChipActive}
                              disabled={!canSelect}
                              title={`${isChipActive ? 'Clear' : 'Filter'} ${banner.label} by ${chip.label}`}
                              onMouseEnter={() => { if (isChipInteractive) setHoveredIntakeFilter(chipHoverKey); }}
                              onMouseLeave={() => { if (hoveredIntakeFilter === chipHoverKey) setHoveredIntakeFilter(null); }}
                              onFocus={() => { if (isChipInteractive) setHoveredIntakeFilter(chipHoverKey); }}
                              onBlur={() => { if (hoveredIntakeFilter === chipHoverKey) setHoveredIntakeFilter(null); }}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!selectableChannel) return;
                                setMarketingWorkspacePage(selectableChannel);
                                setSelectedIntakeByChannel((previous) => ({
                                  ...previous,
                                  [selectableChannel]: previous[selectableChannel] === chip.key ? 'all' : chip.key,
                                }));
                              }}
                              style={{
                                position: 'relative',
                                display: 'grid',
                                gridTemplateColumns: 'auto minmax(0, 1fr)',
                                alignItems: 'center',
                                justifyItems: 'start',
                                columnGap: 8,
                                minWidth: 0,
                                padding: '10px 10px',
                                border: 'none',
                                borderRadius: 0,
                                background: isChipActive
                                  ? withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.16 : 0.07)
                                  : (isChipHovered ? withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.10 : 0.05) : 'transparent'),
                                boxShadow: isChipHovered ? `inset 0 -2px 0 ${banner.accent}` : 'none',
                                color: banner.enabled ? textColour : 'inherit',
                                fontFamily: 'Raleway, sans-serif',
                                cursor: canSelect ? 'pointer' : 'not-allowed',
                                transition: 'background 120ms ease, box-shadow 120ms ease',
                              }}
                            >
                              {index > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 16, bottom: 16, width: 1, background: channelSeparatorColour }} />}
                              <FontIcon iconName={chip.iconName} style={{ fontSize: 13, lineHeight: 1, color: isChipActive || isChipHovered ? banner.accent : (isDarkMode ? colours.subtleGrey : colours.greyText) }} />
                              <span style={{ display: 'grid', justifyItems: 'start', gap: 5, minWidth: 0 }}>
                                <strong style={{ fontSize: 18, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{formatNumber(chip.value)}</strong>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: isChipHovered ? banner.accent : (isDarkMode ? colours.subtleGrey : colours.greyText) }}>
                                  {chip.label}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </span>
                    </span>

                    <span
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(148px, 0.72fr) 1px minmax(0, 1.85fr)',
                        gap: 0,
                        minWidth: 0,
                        minHeight: 72,
                      }}
                    >
                      <span style={{ display: 'grid', alignContent: 'center', gap: 6, minWidth: 0, padding: '10px 15px' }}>
                        <strong style={{ fontSize: 25, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{formatNumber(banner.enquiryCount)}</strong>
                        <span style={{ fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.07em', textTransform: 'uppercase', color: banner.accent }}>
                          Enquiries
                        </span>
                      </span>

                      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '12px 0', background: channelSeparatorColour }} />

                      <span style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(72px, 1fr))', minWidth: 0, padding: '0 8px' }}>
                        {banner.stages.map((stage, index) => {
                          const isCollected = stage.key === 'collected';
                          const stageAccent = banner.enabled ? (isCollected ? colours.green : banner.accent) : banner.accent;
                          const stageIconName = journeyStageIconName[stage.key] ?? 'PageList';
                          return (
                            <span
                              key={`${banner.key}-flow-${stage.key}`}
                              style={{
                                position: 'relative',
                                display: 'grid',
                                gridTemplateColumns: 'auto minmax(0, 1fr)',
                                alignItems: 'center',
                                justifyItems: 'start',
                                columnGap: 8,
                                minWidth: 0,
                                minHeight: 72,
                                padding: '9px 10px',
                              }}
                            >
                              {index > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 1, background: channelSeparatorColour }} />}
                              <FontIcon iconName={stageIconName} style={{ fontSize: 13, lineHeight: 1, color: stageAccent }} />
                              <span style={{ display: 'grid', justifyItems: 'start', gap: 5, minWidth: 0 }}>
                                <strong style={{ fontSize: isCollected ? 18 : 17, lineHeight: 1, color: banner.enabled ? textColour : 'inherit' }}>{stage.value}</strong>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: stageAccent }}>
                                  {stage.label}
                                </span>
                                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9, lineHeight: 1.2, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                                  {stage.detail}
                                </span>
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          {selectedJourneyBanner && (
            <div
              data-helix-region="marketing/channel-workbench/matching-dev"
              style={{
                display: 'grid',
                gap: 6,
                padding: '9px 10px',
                border: `1px dotted ${withAlpha(isDarkMode ? colours.highlight : colours.helixBlue, isDarkMode ? 0.42 : 0.28)}`,
                background: withAlpha(isDarkMode ? colours.dark.cardBackground : colours.sectionBackground, isDarkMode ? 0.30 : 0.58),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: selectedChannelAccent }}>
                  Dev matching view
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: mutedColour }}>
                  {selectedJourneyBanner.matchSummary.selectedIntakeLabel}
                </span>
              </div>
              <span style={{ fontSize: 10, lineHeight: 1.45, color: mutedColour }}>
                {selectedJourneyBanner.label}: source enquiries {formatNumber(selectedJourneyBanner.matchSummary.sourceEnquiries)}, filtered enquiries {formatNumber(selectedJourneyBanner.matchSummary.filteredEnquiries)}.
              </span>
              <span style={{ display: 'grid', gap: 3 }}>
                {selectedJourneyBanner.matchSummary.chainNotes.map((note) => (
                  <span key={note} style={{ fontSize: 10, lineHeight: 1.35, color: mutedColour }}>
                    {note}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </section>

      <section data-helix-region="marketing/evidence-quality" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {evidenceCards.map((card) => (
          <div key={card.label} style={{ ...panelStyle(isDarkMode), borderTop: `2px solid ${isDarkMode ? colours.highlight : colours.helixBlue}` }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              {card.label}
            </span>
            <strong style={{ fontSize: 22, lineHeight: 1, color: textColour }}>{card.value}</strong>
            <span style={{ fontSize: 11, fontWeight: 700, color: mutedColour }}>{card.detail}</span>
          </div>
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, width: '100%' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitLeftBorder}`,
            background: splitLeftSurface,
            borderTop: `2px solid ${splitLeftAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '5px 7px',
              marginBottom: 4,
              border: `1px solid ${splitLeftBorder}`,
              background: toggleContainerBackground,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase', color: splitLeftLabel }}>
              {selectedChannelLabel} platform metrics
            </span>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: splitLeftMuted }}>
              Selected channel
            </span>
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {leftPanelRows.map((row, index) => (
              <div
                key={row.label}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: '6px 2px',
                  borderBottom: index === leftPanelRows.length - 1 ? 'none' : `1px solid ${splitLeftBorder}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: splitLeftLabel }}>
                    {row.label}
                  </span>
                  <strong style={{ fontSize: 14, lineHeight: 1, color: splitLeftText, flex: '0 0 auto' }}>{row.value}</strong>
                </div>
                <span style={{ fontSize: 9, color: splitLeftMuted }}>{row.detail}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 0,
            minWidth: 0,
            width: '100%',
            flex: '1 1 100%',
            height: splitPanelHeight,
            padding: '6px 8px',
            border: `1px solid ${splitRightBorder}`,
            background: splitRightSurface,
            borderTop: `2px solid ${splitRightAccent}`,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0,
              padding: '1px',
              marginBottom: 4,
              border: `1px solid ${splitRightBorder}`,
              background: toggleContainerBackground,
            }}
          >
            {[
              { key: 'enquiries', label: `${selectedChannelLabel} ${selectedChannelIntake === 'all' ? '' : intakeSelectionLabel(selectedChannelIntake)} enquiries ${formatNumber(selectedChannelEnquiries.length)}`.replace(/\s+/g, ' ').trim() },
              { key: 'matters', label: `Matched matters ${formatNumber(selectedJourney.downstream.matters.length)}` },
            ].map((option) => {
              const isActive = rightPanelMode === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setRightPanelMode(option.key as 'enquiries' | 'matters')}
                  style={{
                    border: `1px solid ${isActive ? splitRightAccent : 'transparent'}`,
                    background: isActive
                      ? withAlpha(colours.highlight, isDarkMode ? 0.22 : 0.12)
                      : 'transparent',
                    color: isActive ? splitRightText : splitRightMuted,
                    ...rightToggleButtonStyle,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="marketing-scroll-chrome" style={{ display: 'grid', gap: 0, minHeight: 0, overflowY: 'auto' }}>
            {rightPanelRows.map((row, index) => (
              <div
                key={`${rightPanelMode}-${row.id}-${index}`}
                style={{
                  display: 'grid',
                  gap: 2,
                  padding: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters') ? '6px 6px' : '6px 2px',
                  borderLeft: (rightPanelMode === 'enquiries' || rightPanelMode === 'matters')
                    ? `3px solid ${areaAccentColour(readAreaOfWork(row), isDarkMode)}`
                    : 'none',
                  borderBottom: index === rightPanelRows.length - 1 ? 'none' : `1px solid ${splitRightBorder}`,
                }}
              >
                {rightPanelMode === 'enquiries' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.primary}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readOwnerInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readEnquiryMethod(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {row.status}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: splitRightText, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {readMatterReference(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterResponsibleInitials(row)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: splitRightLabel, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                      {readMatterOriginatingInitials(row)}
                    </span>
                  </div>
                )}
              </div>
            ))}
            {rightPanelRows.length === 0 && (
              <div style={{ padding: '8px 2px', fontSize: 10, color: splitRightMuted }}>
                {rightPanelMode === 'matters'
                  ? 'No matters in this reporting window yet.'
                  : 'No enquiries in this reporting window yet.'}
              </div>
            )}
          </div>
        </div>
      </div>

      </section>
        )}
        </>
      </section>

      )}

    </section>
  );
};

export default MarketingPerformanceWorkspace;