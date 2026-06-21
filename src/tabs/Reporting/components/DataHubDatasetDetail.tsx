import React from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import getApiUrl from '../../../utils/getApiUrl';
import { getAreaGlyphMeta, renderAreaOfWorkGlyph } from '../../../components/filter/areaGlyphs';
import { DEV_PREVIEW_TEST_ENQUIRY } from '../../enquiries/utils/enquiryHelpers';
import type {
  ReportingDatasetRegistryEntry,
  ReportingDatasetStatus,
  ReportingLiveDatasetSummary,
  ReportingDatasetProviderMeta,
} from '../reportingDatasets';
import MatterReplayWorkbench from './MatterReplayWorkbench';
import './DataHubDatasetDetail.css';

type ContextDataset = {
  key: string;
  name: string;
  status: ReportingDatasetStatus;
  count: number | null;
};

type ProviderProbeMetric = {
  label: string;
  value: string;
  detail?: string;
};

type GoogleAdsProbeTotals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
};

type GoogleAnalyticsProbeTotals = {
  sessions: number;
  users: number;
  views: number;
  keyEvents: number;
};

type ProviderProbeState = {
  status: ReportingDatasetStatus;
  phase: 'idle' | 'preparing' | 'fetching' | 'processing' | 'complete' | 'error';
  checkedAt: number | null;
  rowCount: number | null;
  startDate: string | null;
  endDate: string | null;
  source: string | null;
  apiVersion: string | null;
  latestDate: string | null;
  metrics: ProviderProbeMetric[];
  error: string | null;
};

type ProviderProbePayload = {
  success?: boolean;
  data?: unknown[];
  dateRange?: {
    start?: string;
    end?: string;
  };
  source?: string;
  apiVersion?: string;
  error?: string;
};

type EmailListStreamRow = {
  enquiryId: string;
  receivedAt: string | null;
  email: string;
  areaOfWork: string;
  methodOfContact: string;
  activeCampaignId?: string;
  tags: string[];
};

type EmailListAreaBreakdownItem = {
  areaOfWork?: string;
  area?: string;
  count?: number;
};

type EmailListAreaFilterKey = 'all' | 'commercial' | 'construction' | 'property' | 'employment' | 'other';
type EmailListConcreteAreaFilterKey = Exclude<EmailListAreaFilterKey, 'all'>;

type EmailListStreamPayload = {
  source?: string;
  generatedAt?: string;
  count?: number;
  totalMatching?: number;
  limit?: number;
  areaFilter?: EmailListAreaFilterKey | string;
  areaFilters?: EmailListConcreteAreaFilterKey[];
  dateRange?: {
    startDate?: string | null;
    endDate?: string | null;
    applied?: boolean;
    field?: string | null;
  };
  areaBreakdown?: EmailListAreaBreakdownItem[];
  rows?: EmailListStreamRow[];
  columns?: Record<string, boolean>;
  signals?: {
    tagSignal?: 'explicit-tags' | 'missing' | string;
    tagField?: string | null;
  };
  error?: string;
};

type ActiveCampaignContactDetail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

type ActiveCampaignLookupPayload = {
  source?: string;
  generatedAt?: string;
  lookupSource?: string;
  contact?: ActiveCampaignContactDetail;
  error?: string;
};

type ActiveCampaignLookupState = {
  rowKey: string | null;
  loading: boolean;
  error: string | null;
  contact: ActiveCampaignContactDetail | null;
  lookupSource: string | null;
  checkedAt: number | null;
};

type EmailListDemoSendResult = {
  status: 'ready' | 'error';
  message: string;
  checkedAt: number;
  requestId?: string | null;
  sendGridMessageId?: string | null;
};

const EMAIL_OUTREACH_MODEL_TABLES = [
  {
    name: 'EmailOutreachPeople',
    role: 'One current-state row per ProspectId bridge. No duplicate contact rows.',
    key: 'prospectId',
    fields: [
      ['prospectId', 'nvarchar(100) not null', 'Authoritative bridge: Deals.ProspectId = enquiries.acid = legacy enquiries.ID'],
      ['normalisedEmail', 'nvarchar(320) not null', 'Lowercase lookup email, not the identity key'],
      ['currentEmail', 'nvarchar(320) not null', 'Current send address shown in the ledger'],
      ['sourceSpace', "varchar(20) not null", 'legacy, new-space, or merged'],
      ['sourceEnquiryId', 'nvarchar(100) null', 'Display provenance only, never the durable person key'],
      ['areaOfWork', 'nvarchar(120) null', 'Feeds the Area of work and audience state'],
      ['primaryAudience', 'nvarchar(80) null', 'Commercial, Property, Construction, Employment, or Other'],
      ['audiencesJson', 'nvarchar(max) null', 'Current list memberships for the ledger'],
      ['tagsJson', 'nvarchar(max) null', 'Internal tags, independent of SendGrid'],
      ['status', 'varchar(30) not null', 'eligible, paused, unsubscribed, bounced, complained, suppressed'],
      ['statusReason', 'nvarchar(240) null', 'Manual reason or webhook reason'],
      ['unsubscribedAt', 'datetime2 null', 'SendGrid group/global unsubscribe mirror'],
      ['suppressedAt', 'datetime2 null', 'Bounce, complaint, or manual suppression'],
      ['lastSeenAt', 'datetime2 not null', 'Latest source enquiry sighting'],
      ['lastSendAt', 'datetime2 null', 'Fast ledger display without scanning history'],
      ['lastCampaignId', 'nvarchar(80) null', 'Last campaign shown in the ledger'],
      ['createdAt', 'datetime2 not null', 'Insert timestamp'],
      ['updatedAt', 'datetime2 not null', 'State update timestamp'],
    ],
    indexes: [
      'PK_EmailOutreachPeople (prospectId)',
      'IX_EmailOutreachPeople_Eligibility (status, primaryAudience, lastSeenAt DESC) INCLUDE (currentEmail, areaOfWork, tagsJson)',
      'IX_EmailOutreachPeople_Email (normalisedEmail) INCLUDE (prospectId, status)',
      'IX_EmailOutreachPeople_LastSend (lastCampaignId, lastSendAt DESC) WHERE lastCampaignId IS NOT NULL',
    ],
  },
  {
    name: 'EmailOutreachCampaigns',
    role: 'One campaign definition row. Recipient people are not stored as a JSON list here.',
    key: 'campaignId',
    fields: [
      ['campaignId', 'nvarchar(80) not null', 'Stable internal campaign id'],
      ['campaignKey', 'nvarchar(120) not null', 'Human-safe unique key'],
      ['name', 'nvarchar(180) not null', 'Campaign display name'],
      ['primaryAudience', 'nvarchar(80) not null', 'Default audience bucket'],
      ['subject', 'nvarchar(240) not null', 'Subject used at send time'],
      ['preheader', 'nvarchar(240) null', 'Preview line used at send time'],
      ['sendGridAsmGroupId', 'int null', 'SendGrid unsubscribe group for this audience'],
      ['status', 'varchar(30) not null', 'draft, scheduled, sending, sent, cancelled'],
      ['createdBy', 'nvarchar(160) not null', 'Operator'],
      ['createdAt', 'datetime2 not null', 'Creation timestamp'],
      ['scheduledAt', 'datetime2 null', 'Planned send time'],
      ['sentAt', 'datetime2 null', 'Completed send time'],
      ['metadataJson', 'nvarchar(max) null', 'Template, signature, and filter snapshot'],
    ],
    indexes: [
      'PK_EmailOutreachCampaigns (campaignId)',
      'UX_EmailOutreachCampaigns_Key (campaignKey)',
      'IX_EmailOutreachCampaigns_StatusSchedule (status, scheduledAt)',
      'IX_EmailOutreachCampaigns_Audience (primaryAudience, status) INCLUDE (name, sentAt)',
    ],
  },
  {
    name: 'EmailOutreachSends',
    role: 'One row per campaign and ProspectId. This is the durable send history.',
    key: 'campaignId + prospectId',
    fields: [
      ['sendId', 'bigint identity not null', 'Narrow clustered row id'],
      ['campaignId', 'nvarchar(80) not null', 'Links to EmailOutreachCampaigns'],
      ['prospectId', 'nvarchar(100) not null', 'Links to EmailOutreachPeople'],
      ['recipientEmailSnapshot', 'nvarchar(320) not null', 'Email used for this send'],
      ['sendGridMessageId', 'nvarchar(160) null', 'Provider message id'],
      ['sendStatus', 'varchar(30) not null', 'queued, sent, delivered, opened, clicked, bounced, unsubscribed, failed'],
      ['queuedAt', 'datetime2 not null', 'Queue timestamp'],
      ['sentAt', 'datetime2 null', 'Accepted by SendGrid'],
      ['lastEventAt', 'datetime2 null', 'Latest webhook event timestamp'],
      ['deliveredAt', 'datetime2 null', 'Latest delivered timestamp'],
      ['openedAt', 'datetime2 null', 'Latest open timestamp'],
      ['clickedAt', 'datetime2 null', 'Latest click timestamp'],
      ['bouncedAt', 'datetime2 null', 'Bounce timestamp'],
      ['unsubscribedAt', 'datetime2 null', 'Unsubscribe timestamp'],
      ['failureReason', 'nvarchar(360) null', 'Provider or validation failure'],
      ['createdAt', 'datetime2 not null', 'Insert timestamp'],
      ['updatedAt', 'datetime2 not null', 'Latest update timestamp'],
    ],
    indexes: [
      'PK_EmailOutreachSends (sendId)',
      'UX_EmailOutreachSends_CampaignPerson (campaignId, prospectId)',
      'IX_EmailOutreachSends_PersonHistory (prospectId, sentAt DESC) INCLUDE (campaignId, sendStatus, lastEventAt)',
      'IX_EmailOutreachSends_CampaignRecipients (campaignId, sendStatus) INCLUDE (prospectId, recipientEmailSnapshot)',
      'IX_EmailOutreachSends_SendGridMessage (sendGridMessageId) WHERE sendGridMessageId IS NOT NULL',
    ],
  },
] as const;

const EMAIL_OUTREACH_LEDGER_FIELD_SOURCES = [
  { field: 'Contact', source: 'People.currentEmail + prospectId', note: 'One row per bridge id, not per enquiry row' },
  { field: 'Area of work', source: 'People.areaOfWork', note: 'Refreshed from source sightings' },
  { field: 'List subscription', source: 'People.audiencesJson + primaryAudience', note: 'Current audience state' },
  { field: 'Tags', source: 'People.tagsJson', note: 'Internal tags, no dynamic enrichment required' },
  { field: 'Status', source: 'People.status + Sends.sendStatus', note: 'Suppression and latest send proof' },
  { field: 'Bridge', source: 'People.prospectId', note: 'Former AC id kept as Helix bridge id' },
] as const;

const EMAIL_OUTREACH_MODEL_HISTORY = [
  { campaign: 'property-update-june', subject: 'Property market update', sentAt: '12 Jun', status: 'delivered' },
  { campaign: 'employment-follow-up', subject: 'Employment guide follow-up', sentAt: '29 May', status: 'opened' },
] as const;

const EMAIL_LIST_AREA_FILTERS: Array<{ key: EmailListAreaFilterKey; label: string; glyph: string }> = [
  { key: 'all', label: 'All', glyph: 'Other/Unsure' },
  { key: 'commercial', label: 'Commercial', glyph: 'Commercial' },
  { key: 'construction', label: 'Construction', glyph: 'Construction' },
  { key: 'property', label: 'Property', glyph: 'Property' },
  { key: 'employment', label: 'Employment', glyph: 'Employment' },
  { key: 'other', label: 'Unsure / Other', glyph: 'Other/Unsure' },
];

type EmailListDateRange = {
  startDate: string;
  endDate: string;
};

const EMAIL_LIST_RANGE_SPAN_DAYS = 180;
const EMAIL_LIST_DEFAULT_WINDOW_DAYS = 30;

const EMAIL_LIST_LEDGER_COLUMNS = [
  { key: 'areaOfWork', label: 'Area of work', grid: 'minmax(0, 1.22fr)', minWidth: 0, defaultVisible: true },
  { key: 'listSubscription', label: 'List subscription', grid: 'minmax(0, 1.05fr)', minWidth: 0, defaultVisible: true },
  { key: 'tags', label: 'Tags', grid: 'minmax(0, 1fr)', minWidth: 0, defaultVisible: true },
  { key: 'relationship', label: 'Relationship', grid: 'minmax(0, 0.82fr)', minWidth: 0, defaultVisible: true },
  { key: 'status', label: 'Status', grid: 'minmax(0, 0.7fr)', minWidth: 0, defaultVisible: true },
  { key: 'contact', label: 'Contact', grid: 'minmax(0, 1.04fr)', minWidth: 0, defaultVisible: true },
  { key: 'activeCampaign', label: 'Bridge', grid: 'minmax(0, 0.42fr)', minWidth: 0, defaultVisible: true },
] as const;

const EMAIL_LIST_DEMO_SENDERS = [
  { value: 'automations@helix-law.com', label: 'Automations' },
  { value: 'team@helix-law.com', label: 'Team inbox' },
  { value: 'lz@helix-law.com', label: 'LZ' },
] as const;

const EMAIL_LIST_DEMO_ENQUIRY_ID = 'DEMO-ENQ-0003';

type EmailListLedgerColumnKey = typeof EMAIL_LIST_LEDGER_COLUMNS[number]['key'];
type EmailListDemoSender = typeof EMAIL_LIST_DEMO_SENDERS[number]['value'];

type EmailListSortDirection = 'asc' | 'desc';

const DEFAULT_EMAIL_LIST_LEDGER_COLUMNS = EMAIL_LIST_LEDGER_COLUMNS
  .filter((column) => column.defaultVisible)
  .map((column) => column.key);

const normaliseEmailListAreaFilterKey = (value: unknown): EmailListConcreteAreaFilterKey => {
  const trimmed = String(value || '').trim();
  const area = trimmed.toLowerCase();
  if (!area || area === 'general' || area === 'unknown' || area === 'uncategorised' || area === 'uncategorized' || area === 'unsure' || area === 'other') return 'other';
  if (area.includes('commercial') || area.includes('business')) return 'commercial';
  if (area.includes('construction') || area.includes('building')) return 'construction';
  if (area.includes('property') || area.includes('real estate') || area.includes('conveyancing') || area.includes('landlord') || area.includes('tenant')) return 'property';
  if (area.includes('employment') || area.includes('hr') || area.includes('workplace')) return 'employment';
  return 'other';
};

const getEmailListDefaultWindow = (): EmailListDateRange => {
  const now = new Date();
  return {
    startDate: formatDateInputValue(addDays(now, -(EMAIL_LIST_DEFAULT_WINDOW_DAYS - 1))),
    endDate: formatDateInputValue(now),
  };
};

const parseDateValueAtNoon = (value: string): Date => new Date(`${value}T12:00:00.000`);

const getEmailListWindowOffset = (minDate: string, value: string): number => {
  const minMs = parseDateValueAtNoon(minDate).getTime();
  const valueMs = parseDateValueAtNoon(value).getTime();
  if (Number.isNaN(minMs) || Number.isNaN(valueMs)) return 0;
  return Math.max(0, Math.min(EMAIL_LIST_RANGE_SPAN_DAYS - 1, Math.round((valueMs - minMs) / 86400000)));
};

const getEmailListDateAtOffset = (minDate: string, offset: number): string => {
  const base = parseDateValueAtNoon(minDate);
  if (Number.isNaN(base.getTime())) return minDate;
  return formatDateInputValue(addDays(base, Math.max(0, Math.min(EMAIL_LIST_RANGE_SPAN_DAYS - 1, offset))));
};

const formatEmailListCompactDate = (value: string): string => {
  const date = new Date(`${value}T12:00:00.000`);
  if (!value || Number.isNaN(date.getTime())) return 'Set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const formatEmailListWindowLabel = (range: EmailListDateRange): string => {
  return `${formatEmailListCompactDate(range.startDate)} - ${formatEmailListCompactDate(range.endDate)}`;
};

const getEmailListSortValue = (row: EmailListStreamRow, columnKey: EmailListLedgerColumnKey): string | number => {
  if (columnKey === 'areaOfWork') return row.areaOfWork || '';
  if (columnKey === 'listSubscription') return row.areaOfWork || '';
  if (columnKey === 'tags') return row.tags.join(', ');
  if (columnKey === 'relationship') return row.methodOfContact || '';
  if (columnKey === 'status') return row.activeCampaignId ? 1 : 0;
  if (columnKey === 'contact') return row.email || '';
  if (columnKey === 'activeCampaign') return row.activeCampaignId || '';
  return row.enquiryId || '';
};

const getEmailListReceivedTime = (row: EmailListStreamRow): number => {
  const parsed = Date.parse(row.receivedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEmailListRowKey = (row: EmailListStreamRow): string => row.enquiryId || row.email;

const isEmailListDemoRow = (row: EmailListStreamRow): boolean => String(row.enquiryId || '').toUpperCase().startsWith('DEMO-ENQ-');

type DataHubDatasetDetailProps = {
  isDarkMode: boolean;
  definition: ReportingDatasetRegistryEntry;
  liveDataset: ReportingLiveDatasetSummary | null;
  contextDatasets: ContextDataset[];
  previewTable: string | null;
  operationalViewLabel: string;
  isProductionInactive: boolean;
  operatorName?: string;
  operatorInitials?: string | null;
  operatorEmail?: string | null;
  demoModeEnabled?: boolean;
  schedulerStatus?: MattersSchedulerStatus | null;
  opsLog?: MattersOperationLogEntry[];
  matterOpeningEvents?: MatterOpeningActivityEvent[];
  mattersLedgerOpen?: boolean;
  onOpenMattersLedger?: () => void;
  onPreviewRows: () => void;
  onOpenOperationalView: () => void;
};

type MattersSchemaColumn = {
  name: string;
  dataType: string;
  maxLength: number | null;
  nullable: boolean;
  ordinal: number;
};

type MattersMigrationPlanPayload = {
  startDate: string;
  endDate: string;
  sourceQuery?: {
    endpoint?: string;
    params?: Record<string, unknown>;
  };
  clioCount: number;
  existingInWindow: number;
  existingLegacyImports: number;
  existingClioReconciliations?: number;
  skippedExisting: number;
  skippedDuplicateInPayload: number;
  rowsToInsert: number;
  tag: string;
  importTags?: {
    legacyMigration?: string;
    clioReconciliation?: string;
    legacyCutoffDate?: string;
  };
  shape?: {
    rowCount: number;
    fieldCoverage?: Record<string, number>;
    sampleShape?: {
      topLevelKeys?: string[];
      customFieldCount?: number;
      hasClient?: boolean;
      hasResponsibleAttorney?: boolean;
      hasOriginatingAttorney?: boolean;
      hasPracticeArea?: boolean;
    } | null;
  };
  pipeline?: string[];
};

type MattersSchemaPayload = {
  table: string;
  migrationTag: string;
  reconciliationTag?: string;
  legacyCutoffDate?: string;
  schemaSource?: 'database' | 'fallback';
  warning?: string;
  columns: MattersSchemaColumn[];
};

type MattersMigrationRunPayload = {
  success?: boolean;
  insertedRows?: number;
  failedRows?: number;
  skippedExisting?: number;
  durationMs?: number;
  plan?: MattersMigrationPlanPayload;
  error?: string;
};

type MattersSchedulerTierInfo = {
  lastRun: { ts: number; status: string; message?: string | null; triggeredBy?: string | null } | null;
  schedule: string;
};

type MattersSchedulerRun = {
  id: string;
  ts: number;
  entity: string;
  operation?: string;
  status: string;
  triggeredBy?: string | null;
  modeLabel?: string;
  invokedBy?: string | null;
  windowLabel?: string;
  resultLabel?: string | null;
  durationMs?: number | null;
  insertedRows?: number | null;
  deletedRows?: number | null;
  message?: string | null;
};

type MattersSchedulerStatus = {
  tiers?: {
    collected?: Record<string, MattersSchedulerTierInfo>;
    wip?: Record<string, MattersSchedulerTierInfo>;
    matters?: {
      migrationCurrentMonth?: MattersSchedulerTierInfo;
      previousSeal?: MattersSchedulerTierInfo;
    };
  };
  recentRuns?: MattersSchedulerRun[];
  automation?: {
    matters?: {
      enabled?: boolean;
      target?: string;
      environment?: string;
      modeLabel?: string;
      reason?: string;
      currentSchedule?: string;
      sealSchedule?: string;
    };
  };
};

type MattersOperationLogEntry = {
  id: string;
  ts: number;
  operation: string;
  status: string;
  triggeredBy?: string;
  invokedBy?: string;
  insertedRows?: number;
  deletedRows?: number;
  changedRows?: number;
  durationMs?: number;
  message?: string;
};

type MatterOpeningActivityEvent = {
  id: string;
  ts: number;
  status: string;
};

const statusColour = (status: ReportingDatasetStatus) => {
  if (status === 'ready') return colours.green;
  if (status === 'loading') return colours.blue;
  if (status === 'error') return colours.cta;
  return colours.subtleGrey;
};

const statusLabel = (status: ReportingDatasetStatus) => {
  if (status === 'ready') return 'Ready';
  if (status === 'loading') return 'Loading';
  if (status === 'error') return 'Error';
  return 'Idle';
};

const emptyProviderProbe = (): ProviderProbeState => ({
  status: 'idle',
  phase: 'idle',
  checkedAt: null,
  rowCount: null,
  startDate: null,
  endDate: null,
  source: null,
  apiVersion: null,
  latestDate: null,
  metrics: [],
  error: null,
});

const extractProviderRows = (payload: ProviderProbePayload | unknown[]): unknown[] => {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  if (!record) return [];
  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.rows)) return record.rows;
  if (Array.isArray(record.matters)) return record.matters;
  const legacyAll = Array.isArray(record.legacyAll) ? record.legacyAll : [];
  const vnetAll = Array.isArray(record.vnetAll) ? record.vnetAll : [];
  if (legacyAll.length > 0 || vnetAll.length > 0) {
    return [...legacyAll, ...vnetAll];
  }
  return [];
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
};

const toNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumber = (value: number, maximumFractionDigits = 0): string => {
  return new Intl.NumberFormat('en-GB', { maximumFractionDigits }).format(value);
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);
};

const normaliseDate = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return null;
};

const buildGoogleAdsProbeMetrics = (rows: unknown[]): ProviderProbeMetric[] => {
  if (rows.length === 0) return [];
  const totals = rows.reduce<GoogleAdsProbeTotals>((acc, row) => {
    const record = asRecord(row);
    const metrics = asRecord(record?.googleAds) ?? record;
    if (!metrics) return acc;
    acc.impressions += toNumber(metrics.impressions);
    acc.clicks += toNumber(metrics.clicks);
    acc.cost += toNumber(metrics.cost ?? metrics.costMicros) / (metrics.costMicros && !metrics.cost ? 1000000 : 1);
    acc.conversions += toNumber(metrics.conversions);
    return acc;
  }, { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpa = totals.conversions > 0 ? totals.cost / totals.conversions : 0;
  return [
    { label: 'Spend', value: formatCurrency(totals.cost), detail: `${formatNumber(rows.length)} daily rows` },
    { label: 'Clicks', value: formatNumber(totals.clicks), detail: `${formatNumber(ctr, 2)}% CTR` },
    { label: 'Conversions', value: formatNumber(totals.conversions, 1), detail: 'Google Ads conversion count' },
    { label: 'Cost per conversion', value: formatCurrency(cpa), detail: 'Platform reported conversions' },
  ];
};

const buildGoogleAnalyticsProbeMetrics = (rows: unknown[]): ProviderProbeMetric[] => {
  if (rows.length === 0) return [];
  const totals = rows.reduce<GoogleAnalyticsProbeTotals>((acc, row) => {
    const record = asRecord(row);
    const metrics = asRecord(record?.googleAnalytics) ?? record;
    if (!metrics) return acc;
    acc.sessions += toNumber(metrics.sessions);
    acc.users += toNumber(metrics.activeUsers ?? metrics.users);
    acc.views += toNumber(metrics.screenPageViews ?? metrics.pageViews);
    acc.keyEvents += toNumber(metrics.conversions ?? metrics.keyEvents);
    return acc;
  }, { sessions: 0, users: 0, views: 0, keyEvents: 0 });
  return [
    { label: 'Sessions', value: formatNumber(totals.sessions), detail: `${formatNumber(rows.length)} daily rows` },
    { label: 'Users', value: formatNumber(totals.users), detail: 'GA4 active users' },
    { label: 'Views', value: formatNumber(totals.views), detail: 'Screen and page views' },
    { label: 'Key events', value: formatNumber(totals.keyEvents), detail: 'GA4 reported key events' },
  ];
};

const buildProviderProbeMetrics = (datasetKey: string, rows: unknown[]): ProviderProbeMetric[] => {
  if (datasetKey === 'googleAds') return buildGoogleAdsProbeMetrics(rows);
  if (datasetKey === 'googleAnalytics') return buildGoogleAnalyticsProbeMetrics(rows);
  return [];
};

const latestDateFromRows = (rows: unknown[]): string | null => {
  const dates = rows
    .map((row) => {
      const record = asRecord(row);
      const metrics = asRecord(record?.googleAds) ?? asRecord(record?.googleAnalytics) ?? record;
      return normaliseDate(
        metrics?.date
        ?? record?.date
        ?? record?.OpenDate
        ?? record?.openDate
        ?? record?.datetime
        ?? record?.mod_stamp,
      );
    })
    .filter((date): date is string => Boolean(date))
    .sort((left, right) => left.localeCompare(right));
  return dates[dates.length - 1] ?? null;
};

const formatUpdatedAt = (updatedAt: number | null | undefined) => {
  if (!updatedAt) return 'Not yet loaded';
  return new Date(updatedAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateInputValue = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCurrentMonthWindow = () => {
  const now = new Date();
  return {
    startDate: formatDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: formatDateInputValue(now),
  };
};

type MattersRangePresetKey = 'month' | 'last7' | 'cutover' | 'legacy' | 'custom';

const MATTERS_RANGE_PRESETS: Array<{ key: Exclude<MattersRangePresetKey, 'custom'>; label: string }> = [
  { key: 'month', label: 'Month to date' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'cutover', label: 'Since 9 Jun' },
  { key: 'legacy', label: 'Legacy window' },
];

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getMattersRangePresetWindow = (key: Exclude<MattersRangePresetKey, 'custom'>) => {
  const now = new Date();
  const today = formatDateInputValue(now);
  if (key === 'last7') {
    return { startDate: formatDateInputValue(addDays(now, -6)), endDate: today };
  }
  if (key === 'cutover') {
    return { startDate: '2026-06-09', endDate: today };
  }
  if (key === 'legacy') {
    return { startDate: '2026-06-01', endDate: '2026-06-08' };
  }
  return getCurrentMonthWindow();
};

const getInclusiveRangeDays = (startDate: string, endDate: string): number => {
  const startMs = new Date(`${startDate}T00:00:00.000`).getTime();
  const endMs = new Date(`${endDate}T00:00:00.000`).getTime();
  if (!startDate || !endDate || Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 0;
  return Math.round((endMs - startMs) / 86400000) + 1;
};

const formatMattersRangeDate = (value: string): string => {
  const date = new Date(`${value}T12:00:00.000`);
  if (!value || Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatOpsAgo = (ts?: number | null): string => {
  if (!ts) return 'No run yet';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

const schedulerTone = (status?: string | null): string => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'validated' || normalized === 'ok') return colours.green;
  if (normalized === 'started' || normalized === 'running' || normalized === 'queued' || normalized === 'progress') return colours.orange;
  if (normalized === 'warn' || normalized === 'no-data' || normalized === 'skipped' || normalized === 'timeout') return colours.orange;
  if (normalized === 'error' || normalized === 'failed') return colours.cta;
  return colours.subtleGrey;
};

const formatOpsDuration = (durationMs?: number | null): string => {
  if (durationMs == null) return 'Duration unknown';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1000)}s`;
};

const isMatterOpeningText = (value?: string | null): boolean => {
  const text = String(value || '').toLowerCase();
  return text.includes('activity.matter-opening')
    || text.includes('matter-opening')
    || text.includes('matteropening')
    || text.includes('matter.opened')
    || text.includes('openanother')
    || (text.includes('matter') && (text.includes('opening') || text.includes('opened')));
};

const isMatterOperationText = (value?: string | null): boolean => {
  const text = String(value || '').toLowerCase();
  if (!text) return false;
  if (text.includes('syncwip') || text.includes('synccollected') || text.includes('collectedtime')) return false;
  return text.includes('matter');
};

const matterLaneLabel = (operation?: string | null, message?: string | null): string => {
  const text = `${operation || ''} ${message || ''}`.toLowerCase();
  if (isMatterOpeningText(text)) return 'Openings';
  if (text.includes('previousseal')) return 'Previous seal';
  if (text.includes('currenthourly')) return 'Current pull';
  if (text.includes('plan') || text.includes('dryrun')) return 'Planning';
  return 'Matters';
};

const formatOpsRows = (insertedRows?: number | null, deletedRows?: number | null): string => {
  const parts: string[] = [];
  if (insertedRows != null) parts.push(`${insertedRows.toLocaleString('en-GB')} inserted`);
  if (deletedRows != null) parts.push(`${deletedRows.toLocaleString('en-GB')} replaced`);
  return parts.join(' · ');
};

const formatOpsActor = (triggeredBy?: string | null, invokedBy?: string | null): string => {
  const raw = String(invokedBy || triggeredBy || '').trim();
  const normalized = raw.toLowerCase();
  if (!raw || normalized === 'system' || normalized === 'scheduler' || normalized === 'timer' || normalized === 'auto') return 'System';
  return raw;
};

const mattersRunTitle = (run: MattersSchedulerRun): string => {
  const operation = String(run.operation || '').toLowerCase();
  if (isMatterOpeningText(`${run.operation || ''} ${run.message || ''}`)) return 'Matter opening';
  if (operation.includes('previousseal')) return 'Matters previous month seal';
  if (operation.includes('currenthourly')) return 'Matters current month pull';
  return 'Matters reconciliation';
};

const mattersRunDetail = (run: MattersSchedulerRun): string => {
  const rows = formatOpsRows(run.insertedRows, run.deletedRows);
  const duration = run.durationMs != null ? formatOpsDuration(run.durationMs) : '';
  return [rows, run.resultLabel, run.message, duration]
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ') || run.status;
};

const operationLogTitle = (entry: MattersOperationLogEntry): string => {
  const operation = String(entry.operation || '').toLowerCase();
  if (isMatterOpeningText(`${entry.operation || ''} ${entry.message || ''}`)) return 'Matter opening';
  if (operation.includes('syncmatters')) return 'Matters reconciliation log';
  if (operation.includes('matter')) return 'Matters operation';
  return entry.operation || 'Data operation';
};

type MattersProcessEvent = {
  id: string;
  ts: number;
  lane: string;
  title: string;
  detail: string;
  status: string;
  actor: string;
  tone: string;
};

const FieldCard: React.FC<{
  isDarkMode: boolean;
  label: string;
  value: React.ReactNode;
}> = ({ isDarkMode, label, value }) => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 12px',
    border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
    background: reportingPanelBackground(isDarkMode, 'elevated'),
  }}>
    <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#d1d5db' : colours.subtleGrey, textTransform: 'uppercase', letterSpacing: 0 }}>
      {label}
    </span>
    <span style={{ fontSize: 12, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, lineHeight: 1.4 }}>
      {value}
    </span>
  </div>
);

const DataHubDatasetDetail: React.FC<DataHubDatasetDetailProps> = ({
  isDarkMode,
  definition,
  liveDataset,
  contextDatasets,
  previewTable,
  operationalViewLabel,
  isProductionInactive,
  operatorName,
  operatorInitials,
  operatorEmail,
  demoModeEnabled = false,
  schedulerStatus,
  opsLog = [],
  matterOpeningEvents = [],
  mattersLedgerOpen = false,
  onOpenMattersLedger,
  onPreviewRows,
  onOpenOperationalView,
}) => {
  const [providerProbe, setProviderProbe] = React.useState<ProviderProbeState>(() => emptyProviderProbe());
  const defaultMatterWindow = React.useMemo(() => getCurrentMonthWindow(), []);
  const [mattersStartDate, setMattersStartDate] = React.useState(defaultMatterWindow.startDate);
  const [mattersEndDate, setMattersEndDate] = React.useState(defaultMatterWindow.endDate);
  const [activeMatterRangePreset, setActiveMatterRangePreset] = React.useState<MattersRangePresetKey>('month');
  const [mattersSchema, setMattersSchema] = React.useState<MattersSchemaPayload | null>(null);
  const [mattersPlan, setMattersPlan] = React.useState<MattersMigrationPlanPayload | null>(null);
  const [mattersRun, setMattersRun] = React.useState<MattersMigrationRunPayload | null>(null);
  const [mattersMigrationLoading, setMattersMigrationLoading] = React.useState<'schema' | 'plan' | 'sync' | null>(null);
  const [mattersMigrationError, setMattersMigrationError] = React.useState<string | null>(null);
  const [matterReplayOpen, setMatterReplayOpen] = React.useState(false);
  const [emailListStream, setEmailListStream] = React.useState<EmailListStreamPayload | null>(null);
  const [emailListsLoading, setEmailListsLoading] = React.useState(false);
  const [emailListsError, setEmailListsError] = React.useState<string | null>(null);
  const [activeCampaignLookup, setActiveCampaignLookup] = React.useState<ActiveCampaignLookupState>({
    rowKey: null,
    loading: false,
    error: null,
    contact: null,
    lookupSource: null,
    checkedAt: null,
  });
  const [emailListModelOpen, setEmailListModelOpen] = React.useState(false);
  const [visibleEmailListColumns, setVisibleEmailListColumns] = React.useState<EmailListLedgerColumnKey[]>([...DEFAULT_EMAIL_LIST_LEDGER_COLUMNS]);
  const [emailListSortColumn, setEmailListSortColumn] = React.useState<EmailListLedgerColumnKey>('areaOfWork');
  const [emailListSortDirection, setEmailListSortDirection] = React.useState<EmailListSortDirection>('asc');
  const [emailListCopyToast, setEmailListCopyToast] = React.useState<string | null>(null);
  const emailListCopyToastTimerRef = React.useRef<number | null>(null);
  const [emailListCampaignName, setEmailListCampaignName] = React.useState('Demo outreach draft');
  const [emailListDemoSender, setEmailListDemoSender] = React.useState<EmailListDemoSender>(EMAIL_LIST_DEMO_SENDERS[0].value);
  const [emailListDemoSubject, setEmailListDemoSubject] = React.useState('');
  const [emailListDemoPreview, setEmailListDemoPreview] = React.useState('');
  const [emailListDemoBody, setEmailListDemoBody] = React.useState('');
  const [emailListDemoSending, setEmailListDemoSending] = React.useState(false);
  const [emailListDemoResult, setEmailListDemoResult] = React.useState<EmailListDemoSendResult | null>(null);
  const emailListDemoTimerRef = React.useRef<number | null>(null);
  const [activeEmailListAreaFilters, setActiveEmailListAreaFilters] = React.useState<EmailListConcreteAreaFilterKey[]>([]);
  const [draftEmailListDateRange, setDraftEmailListDateRange] = React.useState<EmailListDateRange>(() => getEmailListDefaultWindow());
  const [committedEmailListDateRange, setCommittedEmailListDateRange] = React.useState<EmailListDateRange>(() => getEmailListDefaultWindow());
  const provider = definition.provider as ReportingDatasetProviderMeta;
  const status = liveDataset?.status ?? 'idle';
  const routeLabel = provider.sourceRoute ?? 'Internal stream';
  const reportUsage = provider.reportUsage.length > 0 ? provider.reportUsage : ['Not currently mapped to production reports'];
  const canProbeProvider = Boolean(provider.providerCheck);
  const isBuildFocus = Boolean(provider.buildFocus);
  const displayStatus = providerProbe.status !== 'idle' ? providerProbe.status : status;
  const rowCount = providerProbe.rowCount != null
    ? providerProbe.rowCount.toLocaleString('en-GB')
    : liveDataset?.count != null
      ? liveDataset.count.toLocaleString('en-GB')
      : 'No';
  const displayUpdatedAt = providerProbe.checkedAt ?? liveDataset?.updatedAt;
  const tone = isBuildFocus ? (isDarkMode ? colours.accent : colours.highlight) : isProductionInactive ? colours.subtleGrey : statusColour(displayStatus);
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? '#d1d5db' : colours.subtleGrey;
  const edge = reportingPanelBorder(isDarkMode, 'base');
  const surface = reportingPanelBackground(isDarkMode, 'base');
  const elevatedSurface = reportingPanelBackground(isDarkMode, 'elevated');
  const dataHubBrandAccent = isDarkMode ? colours.accent : colours.highlight;
  const dataHubHomeSurface = isDarkMode ? colours.dark.sectionBackground : withAlpha(colours.grey, 0.98);
  const dataHubHomeCardSurface = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.98);
  const dataHubHomeFooterSurface = isDarkMode ? colours.websiteBlue : colours.grey;
  const dataHubHomeControlSurface = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.42) : withAlpha(colours.light.cardBackground, 0.82);
  const dataHubHomeHoverSurface = isDarkMode ? colours.dark.cardHover : colours.light.cardHover;
  const dataHubHomeSelectedSurface = withAlpha(dataHubBrandAccent, isDarkMode ? 0.16 : 0.09);
  const isMattersDataset = definition.key === 'allMatters';
  const isEmailListsDataset = definition.key === 'emailLists';
  const todayDateValue = React.useMemo(() => formatDateInputValue(new Date()), []);
  const emailListWindowMinDate = React.useMemo(() => formatDateInputValue(addDays(parseDateValueAtNoon(todayDateValue), -(EMAIL_LIST_RANGE_SPAN_DAYS - 1))), [todayDateValue]);
  const emailListDraftStartOffset = getEmailListWindowOffset(emailListWindowMinDate, draftEmailListDateRange.startDate);
  const emailListDraftEndOffset = getEmailListWindowOffset(emailListWindowMinDate, draftEmailListDateRange.endDate);
  const emailListDraftStartPercent = (emailListDraftStartOffset / (EMAIL_LIST_RANGE_SPAN_DAYS - 1)) * 100;
  const emailListDraftEndPercent = (emailListDraftEndOffset / (EMAIL_LIST_RANGE_SPAN_DAYS - 1)) * 100;
  const emailListDraftRangeDays = getInclusiveRangeDays(draftEmailListDateRange.startDate, draftEmailListDateRange.endDate);
  const emailListDraftChanged = draftEmailListDateRange.startDate !== committedEmailListDateRange.startDate || draftEmailListDateRange.endDate !== committedEmailListDateRange.endDate;
  const emailListWindowIsValid = emailListDraftRangeDays > 0;
  const mattersRangeDays = getInclusiveRangeDays(mattersStartDate, mattersEndDate);
  const mattersRangeIsValid = mattersRangeDays > 0;
  const mattersCurrentTier = schedulerStatus?.tiers?.matters?.migrationCurrentMonth ?? null;
  const mattersSealTier = schedulerStatus?.tiers?.matters?.previousSeal ?? null;
  const mattersAutomation = schedulerStatus?.automation?.matters;
  const mattersAutomationEnabled = mattersAutomation?.enabled === true;
  const mattersSchedulerLabel = mattersAutomation?.modeLabel ?? (mattersAutomationEnabled ? 'Staging scheduler' : 'Staging only');
  const mattersRecentRuns = React.useMemo(() => (
    (schedulerStatus?.recentRuns ?? [])
      .filter((run) => run.entity === 'matters')
      .sort((a, b) => b.ts - a.ts)
  ), [schedulerStatus?.recentRuns]);
  const latestMattersRun = mattersRecentRuns[0] ?? null;
  const latestMatterOpeningActivity = matterOpeningEvents[0] ?? null;
  const latestMatterOpeningLog = React.useMemo(() => (
    opsLog.find((entry) => isMatterOpeningText(`${entry.operation || ''} ${entry.message || ''}`)) ?? null
  ), [opsLog]);
  const latestMattersError = React.useMemo(() => (
    [...mattersRecentRuns]
      .find((run) => ['error', 'failed', 'timeout'].includes(String(run.status || '').toLowerCase()))
      ?? opsLog.find((entry) => (entry.operation || '').toLowerCase().includes('syncmattersmigration') && ['error', 'failed', 'timeout'].includes(String(entry.status || '').toLowerCase()))
      ?? null
  ), [mattersRecentRuns, opsLog]);
  const mattersCoverageLanes = React.useMemo(() => {
    return [
      {
        key: 'matters-current',
        label: 'Current month pull',
        system: 'Clio matters',
        schedule: mattersAutomation?.currentSchedule ?? mattersCurrentTier?.schedule ?? ':35 current month',
        tier: mattersCurrentTier,
      },
      {
        key: 'matter-openings',
        label: 'Matter openings',
        system: 'Matter opening pipeline',
        schedule: 'live opening events',
        tier: latestMatterOpeningActivity ? {
          schedule: 'live opening events',
          lastRun: {
            ts: latestMatterOpeningActivity.ts,
            status: latestMatterOpeningActivity.status,
            message: 'Matter opening activity recorded',
            triggeredBy: 'pipeline',
          },
        } : latestMatterOpeningLog ? {
          schedule: 'live opening events',
          lastRun: {
            ts: latestMatterOpeningLog.ts,
            status: latestMatterOpeningLog.status,
            message: latestMatterOpeningLog.message ?? null,
            triggeredBy: latestMatterOpeningLog.triggeredBy ?? null,
          },
        } : null,
      },
      {
        key: 'matters-seal',
        label: 'Previous month seal',
        system: 'Clio matters',
        schedule: mattersAutomation?.sealSchedule ?? mattersSealTier?.schedule ?? ':58 previous month',
        tier: mattersSealTier,
      },
    ];
  }, [latestMatterOpeningActivity, latestMatterOpeningLog, mattersAutomation?.currentSchedule, mattersAutomation?.sealSchedule, mattersCurrentTier, mattersSealTier]);
  const mattersProcessEvents = React.useMemo<MattersProcessEvent[]>(() => {
    const schedulerRows = (schedulerStatus?.recentRuns ?? [])
      .filter((run) => run.entity === 'matters')
      .map((run) => ({
        id: `scheduler-${run.id}`,
        ts: run.ts,
        lane: matterLaneLabel(run.operation, run.message),
        title: mattersRunTitle(run),
        detail: mattersRunDetail(run),
        status: run.status,
        actor: formatOpsActor(run.triggeredBy, run.invokedBy),
        tone: schedulerTone(run.status),
      }));
    const operationRows = opsLog
      .filter((entry) => {
        return isMatterOperationText(`${entry.operation || ''} ${entry.message || ''}`);
      })
      .map((entry) => {
        const rows = formatOpsRows(entry.insertedRows, entry.deletedRows);
        const detail = [rows, entry.message, entry.durationMs != null ? formatOpsDuration(entry.durationMs) : '']
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ') || entry.status;
        return {
          id: `ops-${entry.id}`,
          ts: entry.ts,
          lane: matterLaneLabel(entry.operation, entry.message),
          title: operationLogTitle(entry),
          detail,
          status: entry.status,
          actor: formatOpsActor(entry.triggeredBy, entry.invokedBy),
          tone: schedulerTone(entry.status),
        };
      });
    const openingRows = matterOpeningEvents.map((entry) => ({
      id: `opening-${entry.id}`,
      ts: entry.ts,
      lane: 'Openings',
      title: 'Matter opening',
      detail: 'Matter opening activity recorded',
      status: entry.status,
      actor: 'Pipeline',
      tone: schedulerTone(entry.status),
    }));
    return [...schedulerRows, ...operationRows, ...openingRows]
      .sort((left, right) => right.ts - left.ts)
      .slice(0, 16);
  }, [matterOpeningEvents, opsLog, schedulerStatus?.recentRuns]);
  const latestAutomaticMattersPull = mattersProcessEvents.find((event) => event.lane === 'Matters' && event.actor === 'System') ?? null;
  const mattersSchedulerDetail = mattersAutomationEnabled
    ? (latestAutomaticMattersPull ? formatOpsAgo(latestAutomaticMattersPull.ts) : 'waiting for first run')
    : mattersAutomation?.reason === 'disabled-by-env'
      ? 'paused by setting'
      : 'not running here';
  const emailListDemoRecipientEmail = React.useMemo(() => String(operatorEmail || '').trim(), [operatorEmail]);
  const emailListDemoRow = React.useMemo<EmailListStreamRow | null>(() => {
    if (!demoModeEnabled) return null;
    const receivedDate = DEV_PREVIEW_TEST_ENQUIRY.Touchpoint_Date || DEV_PREVIEW_TEST_ENQUIRY.Date_Created || '';
    const receivedAt = receivedDate ? new Date(`${receivedDate}T12:00:00.000Z`).toISOString() : null;
    return {
      enquiryId: EMAIL_LIST_DEMO_ENQUIRY_ID,
      receivedAt,
      email: emailListDemoRecipientEmail,
      areaOfWork: 'Employment',
      methodOfContact: 'Email',
      activeCampaignId: '',
      tags: ['demo', 'test-send'],
    };
  }, [demoModeEnabled, emailListDemoRecipientEmail]);
  const emailListRowsRaw = React.useMemo(() => {
    if (demoModeEnabled) return emailListDemoRow ? [emailListDemoRow] : [];
    const rows = emailListStream?.rows ?? [];
    return rows;
  }, [demoModeEnabled, emailListDemoRow, emailListStream?.rows]);
  const activeEmailListAreaFilterSet = React.useMemo(() => new Set(activeEmailListAreaFilters), [activeEmailListAreaFilters]);
  const emailListRowsForActiveAreas = React.useMemo(() => {
    if (activeEmailListAreaFilters.length === 0) return emailListRowsRaw;
    return emailListRowsRaw.filter((row) => activeEmailListAreaFilterSet.has(normaliseEmailListAreaFilterKey(row.areaOfWork)));
  }, [activeEmailListAreaFilterSet, activeEmailListAreaFilters.length, emailListRowsRaw]);
  const emailListRows = React.useMemo(() => {
    const directionMultiplier = emailListSortDirection === 'asc' ? 1 : -1;
    return [...emailListRowsForActiveAreas].sort((left, right) => {
      const leftValue = getEmailListSortValue(left, emailListSortColumn);
      const rightValue = getEmailListSortValue(right, emailListSortColumn);
      if (typeof leftValue === 'number' || typeof rightValue === 'number') {
        const numericCompare = ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * directionMultiplier;
        if (numericCompare !== 0) return numericCompare;
      } else {
        const textCompare = String(leftValue).localeCompare(String(rightValue), 'en-GB', { sensitivity: 'base' }) * directionMultiplier;
        if (textCompare !== 0) return textCompare;
      }

      if (emailListSortColumn !== 'areaOfWork') {
        const areaCompare = String(left.areaOfWork || '').localeCompare(String(right.areaOfWork || ''), 'en-GB', { sensitivity: 'base' });
        if (areaCompare !== 0) return areaCompare;
      }

      const dateCompare = getEmailListReceivedTime(right) - getEmailListReceivedTime(left);
      if (dateCompare !== 0) return dateCompare;

      return getEmailListRowKey(left).localeCompare(getEmailListRowKey(right), 'en-GB', { sensitivity: 'base' });
    });
  }, [emailListRowsForActiveAreas, emailListSortColumn, emailListSortDirection]);
  const emailListDemoTarget = emailListDemoRow;
  const emailOutreachProofRow = emailListRows[0] ?? emailListDemoTarget ?? null;
  const emailOutreachProofProspectId = String(emailOutreachProofRow?.activeCampaignId || '').trim() || 'ProspectId pending';
  const emailOutreachProofEmail = emailOutreachProofRow?.email || 'current row email';
  const emailOutreachProofArea = emailOutreachProofRow?.areaOfWork || 'Audience pending';
  const emailOutreachProofSource = emailOutreachProofRow?.enquiryId ? `source enquiry ${emailOutreachProofRow.enquiryId}` : 'source pending';
  const emailOutreachProofHistory = React.useMemo(() => {
    const campaignKey = (emailListCampaignName.trim() || 'campaign-draft')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'campaign-draft';
    return [
      {
        campaign: campaignKey,
        subject: emailListDemoSubject.trim() || 'Current campaign draft',
        sentAt: 'Draft',
        status: 'draft',
      },
      ...EMAIL_OUTREACH_MODEL_HISTORY,
    ];
  }, [emailListCampaignName, emailListDemoSubject]);
  const emailListsAreaSummary = React.useMemo(() => {
    const streamAreaBreakdown = emailListStream?.areaBreakdown;
    const counts = new Map<EmailListConcreteAreaFilterKey, number>([
      ['commercial', 0],
      ['construction', 0],
      ['property', 0],
      ['employment', 0],
      ['other', 0],
    ]);
    const aggregateRows = !demoModeEnabled && Array.isArray(streamAreaBreakdown) ? streamAreaBreakdown : [];
    if (aggregateRows.length > 0) {
      aggregateRows.forEach((row) => {
        const area = normaliseEmailListAreaFilterKey(row.areaOfWork || row.area);
        const count = Number(row.count || 0);
        if (count > 0) counts.set(area, (counts.get(area) ?? 0) + count);
      });
    } else {
      emailListRowsRaw.forEach((row) => {
        const area = normaliseEmailListAreaFilterKey(row.areaOfWork);
        counts.set(area, (counts.get(area) ?? 0) + 1);
      });
    }
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    return {
      total,
      items: EMAIL_LIST_AREA_FILTERS
        .filter((item) => item.key !== 'all')
        .map((item) => ({ ...item, count: counts.get(item.key as EmailListConcreteAreaFilterKey) ?? 0 })),
    };
  }, [demoModeEnabled, emailListRowsRaw, emailListStream?.areaBreakdown]);
  const emailListsAreaBreakdown = emailListsAreaSummary.items;
  const emailListsAreaTotal = emailListsAreaSummary.total;
  const visibleEmailListColumnSet = React.useMemo(() => new Set(visibleEmailListColumns), [visibleEmailListColumns]);
  const visibleEmailListLedgerColumns = React.useMemo(() => (
    EMAIL_LIST_LEDGER_COLUMNS.filter((column) => visibleEmailListColumnSet.has(column.key))
  ), [visibleEmailListColumnSet]);
  const hiddenEmailListLedgerColumns = React.useMemo(() => (
    EMAIL_LIST_LEDGER_COLUMNS.filter((column) => !visibleEmailListColumnSet.has(column.key))
  ), [visibleEmailListColumnSet]);
  const emailListLedgerGridTemplate = React.useMemo(() => (
    visibleEmailListLedgerColumns.map((column) => column.grid).join(' ')
  ), [visibleEmailListLedgerColumns]);
  const emailListLedgerMinWidth = '100%';
  const toggleEmailListColumn = React.useCallback((columnKey: EmailListLedgerColumnKey) => {
    setVisibleEmailListColumns((current) => {
      const currentSet = new Set(current);
      if (currentSet.has(columnKey)) {
        if (currentSet.size <= 1) return current;
        currentSet.delete(columnKey);
      } else {
        currentSet.add(columnKey);
      }
      return EMAIL_LIST_LEDGER_COLUMNS
        .filter((column) => currentSet.has(column.key))
        .map((column) => column.key);
    });
  }, []);

  const toggleEmailListSort = React.useCallback((columnKey: EmailListLedgerColumnKey) => {
    setEmailListSortColumn((currentColumn) => {
      if (currentColumn === columnKey) {
        setEmailListSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc');
        return currentColumn;
      }
      setEmailListSortDirection('asc');
      return columnKey;
    });
  }, []);

  const copyEmailListEmail = React.useCallback(async (email: string) => {
    const value = String(email || '').trim();
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      setEmailListCopyToast('Email copied');
    } catch {
      setEmailListCopyToast('Copy unavailable');
    }
    if (emailListCopyToastTimerRef.current != null) window.clearTimeout(emailListCopyToastTimerRef.current);
    emailListCopyToastTimerRef.current = window.setTimeout(() => setEmailListCopyToast(null), 1600);
  }, []);

  const sendEmailListDemoTest = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!demoModeEnabled) return;
    if (!emailListDemoTarget?.email) {
      setEmailListDemoResult({ status: 'error', message: 'Current user email unavailable', checkedAt: Date.now() });
      return;
    }
    if (!emailListDemoSubject.trim() || !emailListDemoBody.trim()) {
      setEmailListDemoResult({ status: 'error', message: 'Add subject and body', checkedAt: Date.now() });
      return;
    }

    setEmailListDemoSending(true);
    setEmailListDemoResult(null);
    try {
      const operatorActor = String(operatorInitials || operatorName || 'operator').trim();
      const response = await fetch(getApiUrl('/api/enquiries-unified/email-lists/test-send'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demoMode: true,
          enquiryId: emailListDemoTarget.enquiryId,
          recipientEmail: emailListDemoTarget.email,
          sender: emailListDemoSender,
          campaignName: emailListCampaignName.trim(),
          subject: emailListDemoSubject.trim(),
          preheader: emailListDemoPreview.trim(),
          body: emailListDemoBody.trim(),
          signatureInitials: operatorInitials || '',
          signatureMode: 'data-hub-v2',
          operatorName: operatorName || operatorInitials || '',
          operatorEmail: operatorEmail || emailListDemoTarget.email,
          operatorConsent: 'email-lists-limited-stream',
          operatorActor,
        }),
      });
      const payload = await response.json() as { error?: string; requestId?: string; sendGridMessageId?: string };
      if (!response.ok) throw new Error(payload.error || `SendGrid test failed (${response.status})`);
      setEmailListDemoSending(false);
      setEmailListDemoResult({
        status: 'ready',
        message: 'Test email sent with v2 signature',
        checkedAt: Date.now(),
        requestId: payload.requestId || null,
        sendGridMessageId: payload.sendGridMessageId || null,
      });
    } catch (error) {
      setEmailListDemoSending(false);
      setEmailListDemoResult({ status: 'error', message: error instanceof Error ? error.message : 'SendGrid test failed', checkedAt: Date.now() });
    }
  }, [demoModeEnabled, emailListCampaignName, emailListDemoBody, emailListDemoPreview, emailListDemoSender, emailListDemoSubject, emailListDemoTarget, operatorEmail, operatorInitials, operatorName]);

  const setMattersRange = React.useCallback((startDate: string, endDate: string, preset: MattersRangePresetKey) => {
    setMattersStartDate(startDate);
    setMattersEndDate(endDate);
    setActiveMatterRangePreset(preset);
    setMattersPlan(null);
    setMattersRun(null);
    setMattersMigrationError(null);
  }, []);

  const applyMattersPreset = React.useCallback((preset: Exclude<MattersRangePresetKey, 'custom'>) => {
    const next = getMattersRangePresetWindow(preset);
    setMattersRange(next.startDate, next.endDate, preset);
  }, [setMattersRange]);

  const loadMattersSchema = React.useCallback(async () => {
    setMattersMigrationLoading('schema');
    setMattersMigrationError(null);
    try {
      const response = await fetch('/api/data-operations/matters-migration/schema', {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Schema check failed (${response.status})`);
      setMattersSchema(payload as MattersSchemaPayload);
    } catch (error) {
      setMattersMigrationError(error instanceof Error ? error.message : 'Schema check failed');
    } finally {
      setMattersMigrationLoading(null);
    }
  }, []);

  const planMattersMigration = React.useCallback(async () => {
    setMattersMigrationLoading('plan');
    setMattersMigrationError(null);
    setMattersRun(null);
    try {
      const response = await fetch('/api/data-operations/matters-migration/plan', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: mattersStartDate, endDate: mattersEndDate, invokedBy: operatorName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Migration plan failed (${response.status})`);
      setMattersPlan((payload as MattersMigrationRunPayload).plan ?? null);
    } catch (error) {
      setMattersMigrationError(error instanceof Error ? error.message : 'Migration plan failed');
    } finally {
      setMattersMigrationLoading(null);
    }
  }, [mattersEndDate, mattersStartDate, operatorName]);

  const runMattersMigration = React.useCallback(async () => {
    setMattersMigrationLoading('sync');
    setMattersMigrationError(null);
    try {
      const response = await fetch('/api/data-operations/sync-matters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: mattersStartDate, endDate: mattersEndDate, invokedBy: operatorName }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || `Migration sync failed (${response.status})`);
      setMattersRun(payload as MattersMigrationRunPayload);
      setMattersPlan((payload as MattersMigrationRunPayload).plan ?? mattersPlan);
    } catch (error) {
      setMattersMigrationError(error instanceof Error ? error.message : 'Migration sync failed');
    } finally {
      setMattersMigrationLoading(null);
    }
  }, [mattersEndDate, mattersPlan, mattersStartDate, operatorName]);

  const runProviderProbe = React.useCallback(async () => {
    const check = provider.providerCheck;
    if (!check) return;
    setProviderProbe({
      ...emptyProviderProbe(),
      status: 'loading',
      phase: 'preparing',
      checkedAt: Date.now(),
    });
    try {
      await Promise.resolve();
      setProviderProbe((prev) => ({ ...prev, phase: 'fetching' }));

      const params = new URLSearchParams({ daysBack: String(check.defaultDaysBack) });
      const response = await fetch(`${check.route}?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });
      const payloadRaw = await response.json() as ProviderProbePayload | unknown[];
      const payload = Array.isArray(payloadRaw) ? { data: payloadRaw } as ProviderProbePayload : payloadRaw as ProviderProbePayload;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `${definition.name} provider check failed (${response.status})`);
      }

      setProviderProbe((prev) => ({ ...prev, phase: 'processing' }));
      const rows = extractProviderRows(payloadRaw);
      setProviderProbe({
        status: 'ready',
        phase: 'complete',
        checkedAt: Date.now(),
        rowCount: rows.length,
        startDate: payload.dateRange?.start ?? null,
        endDate: payload.dateRange?.end ?? null,
        source: payload.source ?? provider.sourceLabel,
        apiVersion: payload.apiVersion ?? null,
        latestDate: latestDateFromRows(rows),
        metrics: buildProviderProbeMetrics(definition.key, rows),
        error: null,
      });
    } catch (error) {
      setProviderProbe({
        ...emptyProviderProbe(),
        status: 'error',
        phase: 'error',
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Provider check failed',
      });
    }
  }, [definition.key, definition.name, provider.providerCheck, provider.sourceLabel]);

  const loadEmailListStream = React.useCallback(async (signal?: AbortSignal) => {
    if (demoModeEnabled) {
      setEmailListsLoading(false);
      setEmailListsError(null);
      return;
    }
    setEmailListsLoading(true);
    setEmailListsError(null);
    try {
      const params = new URLSearchParams({
        limit: '120',
        operatorConsent: 'email-lists-limited-stream',
        dateFrom: committedEmailListDateRange.startDate,
        dateTo: committedEmailListDateRange.endDate,
      });
      if (activeEmailListAreaFilters.length > 0) params.set('area', activeEmailListAreaFilters.join(','));
      const operatorActor = String(operatorInitials || operatorName || 'operator').trim();
      if (operatorActor) params.set('operatorActor', operatorActor);
      const response = await fetch(getApiUrl(`/api/enquiries-unified/email-lists/stream?${params.toString()}`), {
        method: 'GET',
        credentials: 'include',
        signal,
      });
      const payload = await response.json() as EmailListStreamPayload;
      if (!response.ok) throw new Error(payload.error || `Email list stream failed (${response.status})`);
      setEmailListStream(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setEmailListsError(error instanceof Error ? error.message : 'Email list stream failed');
    } finally {
      if (!signal?.aborted) setEmailListsLoading(false);
    }
  }, [activeEmailListAreaFilters, committedEmailListDateRange.endDate, committedEmailListDateRange.startDate, demoModeEnabled, operatorInitials, operatorName]);

  const clearEmailListAreaFilters = React.useCallback(() => {
    if (demoModeEnabled) {
      setEmailListsLoading(false);
      setEmailListsError(null);
      setActiveEmailListAreaFilters([]);
      return;
    }
    setEmailListsLoading(true);
    setEmailListsError(null);
    setActiveEmailListAreaFilters([]);
  }, [demoModeEnabled]);

  const toggleEmailListAreaFilter = React.useCallback((area: EmailListConcreteAreaFilterKey) => {
    if (demoModeEnabled) {
      setEmailListsLoading(false);
      setEmailListsError(null);
      setActiveEmailListAreaFilters([]);
      return;
    }
    setEmailListsLoading(true);
    setEmailListsError(null);
    setActiveEmailListAreaFilters((current) => (
      current.includes(area)
        ? current.filter((item) => item !== area)
        : [...current, area]
    ));
  }, [demoModeEnabled]);

  const setDraftEmailListStartOffset = React.useCallback((offset: number) => {
    setDraftEmailListDateRange((current) => {
      const endOffset = getEmailListWindowOffset(emailListWindowMinDate, current.endDate);
      const nextOffset = Math.min(Math.max(0, offset), endOffset);
      return { ...current, startDate: getEmailListDateAtOffset(emailListWindowMinDate, nextOffset) };
    });
  }, [emailListWindowMinDate]);

  const setDraftEmailListEndOffset = React.useCallback((offset: number) => {
    setDraftEmailListDateRange((current) => {
      const startOffset = getEmailListWindowOffset(emailListWindowMinDate, current.startDate);
      const nextOffset = Math.max(Math.min(EMAIL_LIST_RANGE_SPAN_DAYS - 1, offset), startOffset);
      return { ...current, endDate: getEmailListDateAtOffset(emailListWindowMinDate, nextOffset) };
    });
  }, [emailListWindowMinDate]);

  const commitEmailListDateRange = React.useCallback(() => {
    if (!emailListWindowIsValid) return;
    setCommittedEmailListDateRange(draftEmailListDateRange);
  }, [draftEmailListDateRange, emailListWindowIsValid]);

  const lookupActiveCampaignContact = React.useCallback(async (row: EmailListStreamRow) => {
    const rowKey = row.enquiryId || row.email;
    const operatorActor = String(operatorInitials || operatorName || 'operator').trim();
    setActiveCampaignLookup({
      rowKey,
      loading: true,
      error: null,
      contact: null,
      lookupSource: null,
      checkedAt: Date.now(),
    });
    try {
      const response = await fetch(getApiUrl('/api/enquiries-unified/email-lists/activecampaign-contact'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeCampaignId: row.activeCampaignId || '',
          email: row.email,
          operatorConsent: 'email-lists-limited-stream',
          operatorActor,
        }),
      });
      const payload = await response.json() as ActiveCampaignLookupPayload;
      if (!response.ok) throw new Error(payload.error || `Bridge source lookup failed (${response.status})`);
      setActiveCampaignLookup({
        rowKey,
        loading: false,
        error: null,
        contact: payload.contact ?? null,
        lookupSource: payload.lookupSource ?? null,
        checkedAt: Date.now(),
      });
    } catch (error) {
      setActiveCampaignLookup({
        rowKey,
        loading: false,
        error: error instanceof Error ? error.message : 'Bridge source lookup failed',
        contact: null,
        lookupSource: null,
        checkedAt: Date.now(),
      });
    }
  }, [operatorInitials, operatorName]);

  React.useEffect(() => {
    setProviderProbe(emptyProviderProbe());
    if (canProbeProvider) {
      void runProviderProbe();
    }
  }, [canProbeProvider, definition.key, runProviderProbe]);

  React.useEffect(() => {
    if (!isEmailListsDataset) return;
    if (demoModeEnabled) {
      setEmailListStream(null);
      setEmailListsLoading(false);
      setEmailListsError(null);
      setActiveEmailListAreaFilters([]);
      return;
    }
    const controller = new AbortController();
    void loadEmailListStream(controller.signal);
    return () => controller.abort();
  }, [demoModeEnabled, isEmailListsDataset, loadEmailListStream]);

  React.useEffect(() => {
    return () => {
      if (emailListCopyToastTimerRef.current != null) window.clearTimeout(emailListCopyToastTimerRef.current);
      if (emailListDemoTimerRef.current != null) window.clearTimeout(emailListDemoTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!isEmailListsDataset || demoModeEnabled || typeof window === 'undefined') return undefined;
    let refreshTimer: number | null = null;

    const handleEnquiriesChanged = () => {
      setEmailListsLoading(true);
      setEmailListsError(null);
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadEmailListStream();
      }, 220);
    };

    window.addEventListener('helix:enquiriesChanged', handleEnquiriesChanged);
    return () => {
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
      window.removeEventListener('helix:enquiriesChanged', handleEnquiriesChanged);
    };
  }, [demoModeEnabled, isEmailListsDataset, loadEmailListStream]);

  const scrollToMattersLedger = React.useCallback(() => {
    const target = document.querySelector('[data-helix-region="reports/data-hub/matters-ledger"]');
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);
  const handleMattersLedgerAction = React.useCallback(() => {
    if (mattersLedgerOpen) {
      scrollToMattersLedger();
      return;
    }
    if (onOpenMattersLedger) {
      onOpenMattersLedger();
      return;
    }
    scrollToMattersLedger();
  }, [mattersLedgerOpen, onOpenMattersLedger, scrollToMattersLedger]);

  return (
    <section
      data-helix-region={`reports/data-hub/dataset/${definition.key}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {!isMattersDataset && !isEmailListsDataset && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '18px 18px 16px',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: `${edge} ${edge} ${edge} ${tone}`,
          background: surface,
          boxShadow: reportingPanelShadow(isDarkMode),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 760 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0 }}>
                {definition.provider.category.replace(/-/g, ' ')}
              </span>
              <span style={{ fontSize: 22, fontWeight: 700, color: text }}>
                {definition.name}
              </span>
              <span style={{ fontSize: 12, lineHeight: 1.55, color: body }}>
                {definition.provider.purpose}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0 }}>
                {isBuildFocus ? 'Active focus' : isProductionInactive ? 'Not in production' : statusLabel(displayStatus)}
              </span>
              <span style={{ fontSize: 28, fontWeight: 700, color: text }}>
                {rowCount}
              </span>
              <span style={{ fontSize: 10, color: muted }}>
                rows
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <FieldCard isDarkMode={isDarkMode} label="Provider" value={definition.provider.providerLabel} />
            <FieldCard isDarkMode={isDarkMode} label="Source" value={provider.sourceLabel} />
            <FieldCard isDarkMode={isDarkMode} label="Refresh" value={provider.refreshMode.replace(/-/g, ' ')} />
            <FieldCard isDarkMode={isDarkMode} label="Last checked" value={formatUpdatedAt(displayUpdatedAt)} />
          </div>
        </div>
      )}

      {isEmailListsDataset && (
        <div
          data-helix-region="reports/data-hub/email-lists/stream"
          className="email-lists-workbench"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '14px 15px',
            border: `1px solid ${edge}`,
            background: dataHubHomeSurface,
            boxShadow: reportingPanelShadow(isDarkMode),
            '--email-list-edge': edge,
            '--email-list-surface': dataHubHomeSurface,
            '--email-list-elevated': dataHubHomeCardSurface,
            '--email-list-footer': dataHubHomeFooterSurface,
            '--email-list-control': dataHubHomeControlSurface,
            '--email-list-hover': dataHubHomeHoverSurface,
            '--email-list-selected': dataHubHomeSelectedSurface,
            '--email-list-text': text,
            '--email-list-body': body,
            '--email-list-muted': muted,
            '--email-list-tone': tone,
            '--email-list-soft': withAlpha(tone, isDarkMode ? 0.13 : 0.08),
            '--email-list-accent-soft': withAlpha(tone, isDarkMode ? 0.13 : 0.08),
            '--email-list-warning': colours.orange,
            '--email-list-warning-soft': withAlpha(colours.orange, isDarkMode ? 0.14 : 0.09),
          } as React.CSSProperties}
        >
          {emailListsError && (
            <span style={{ fontSize: 11, color: colours.cta }}>{emailListsError}</span>
          )}
          <div className="email-lists-window-control" data-helix-region="reports/data-hub/email-lists/date-window">
            <div className="email-lists-window-summary">
              <span className="email-lists-eyebrow">Window</span>
              <strong>{emailListDraftRangeDays > 0 ? `${emailListDraftRangeDays}d` : 'Set'}</strong>
              <small>{formatEmailListWindowLabel(draftEmailListDateRange)}</small>
            </div>
            <div className="email-lists-window-slider" style={{ '--email-list-range-start': `${emailListDraftStartPercent}%`, '--email-list-range-end': `${emailListDraftEndPercent}%` } as React.CSSProperties}>
              <span className="email-lists-window-track" aria-hidden="true" />
              <input
                type="range"
                min={0}
                max={EMAIL_LIST_RANGE_SPAN_DAYS - 1}
                value={emailListDraftStartOffset}
                aria-label="Email Outreach window start"
                onChange={(event) => setDraftEmailListStartOffset(Number(event.currentTarget.value))}
              />
              <input
                type="range"
                min={0}
                max={EMAIL_LIST_RANGE_SPAN_DAYS - 1}
                value={emailListDraftEndOffset}
                aria-label="Email Outreach window end"
                onChange={(event) => setDraftEmailListEndOffset(Number(event.currentTarget.value))}
              />
            </div>
            <div className="email-lists-window-actions">
              <DefaultButton
                text={emailListsLoading && emailListDraftChanged ? 'Applying' : emailListDraftChanged ? 'Apply' : 'Applied'}
                onClick={commitEmailListDateRange}
                disabled={!emailListWindowIsValid || !emailListDraftChanged || emailListsLoading}
                styles={{
                  root: {
                    borderRadius: 0,
                    height: 32,
                    minWidth: 118,
                    padding: '0 10px',
                    fontWeight: 800,
                    fontSize: 10,
                    border: `1px solid ${edge}`,
                    background: emailListDraftChanged ? tone : dataHubHomeControlSurface,
                    color: emailListDraftChanged ? colours.light.cardBackground : text,
                  },
                }}
              />
            </div>
          </div>
          <div className="email-lists-area-strip" data-helix-region="reports/data-hub/email-lists/area-strip">
            <button
              type="button"
              className={`email-lists-area-total${activeEmailListAreaFilters.length === 0 ? ' email-lists-area-card--selected' : ''}`}
              aria-pressed={activeEmailListAreaFilters.length === 0}
              onClick={clearEmailListAreaFilters}
            >
              <span className="email-lists-eyebrow">All new-space enquiries</span>
              <strong>{formatNumber(emailListsAreaTotal)}</strong>
            </button>
            <div className="email-lists-area-list" aria-label="Email list counts by area of work">
              {emailListsLoading && !emailListStream && [0, 1, 2, 3, 4].map((item) => (
                <span key={item} className="email-lists-area-card email-lists-area-card--loading">
                  <span />
                  <strong />
                </span>
              ))}
              {(!emailListsLoading || emailListStream) && emailListsAreaBreakdown.map((item, index) => {
                const meta = getAreaGlyphMeta(item.glyph);
                const itemKey = item.key as EmailListConcreteAreaFilterKey;
                const selected = activeEmailListAreaFilterSet.has(itemKey);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`email-lists-area-card${selected ? ' email-lists-area-card--selected' : ''}`}
                    style={{ animationDelay: `${index * 30}ms` } as React.CSSProperties}
                    title={`${item.label}: ${formatNumber(item.count)}`}
                    aria-pressed={selected}
                    onClick={() => toggleEmailListAreaFilter(itemKey)}
                  >
                    <span className="email-lists-area-icon">{renderAreaOfWorkGlyph(item.glyph, meta.color, 'glyph', 15)}</span>
                    <span className="email-lists-area-label">{item.label}</span>
                    <strong>{formatNumber(item.count)}</strong>
                  </button>
                );
              })}
            </div>
            {emailListsLoading && emailListStream && (
              <span className="email-lists-processing-pill" role="status" aria-live="polite">
                <span aria-hidden="true" />
                Processing stream
              </span>
            )}
          </div>
          <section
            className={`email-lists-model-proof${emailListModelOpen ? ' email-lists-model-proof--open' : ''}`}
            data-helix-region="reports/data-hub/email-lists/outreach-model"
          >
            <button
              type="button"
              className="email-lists-model-proof__toggle"
              aria-expanded={emailListModelOpen}
              onClick={() => setEmailListModelOpen((current) => !current)}
            >
              <span className="email-lists-model-proof__toggle-copy">
                <span className="email-lists-eyebrow">Outreach model</span>
                <strong>ProspectId links contacts to campaigns and send history</strong>
              </span>
              <span className="email-lists-model-proof__toggle-meta">
                <span>{EMAIL_OUTREACH_MODEL_TABLES.length} tables</span>
                <span>{emailListModelOpen ? 'Collapse' : 'Open proof'}</span>
              </span>
            </button>
            {emailListModelOpen && (
              <div className="email-lists-model-proof__body">
                <div className="email-lists-model-proof__flow" aria-label="Email Outreach contact to campaign history proof">
                  <div className="email-lists-model-proof__node">
                    <span className="email-lists-eyebrow">People</span>
                    <strong>{emailOutreachProofProspectId}</strong>
                    <small>{emailOutreachProofEmail}</small>
                    <small>{emailOutreachProofArea} audience</small>
                    <small>{emailOutreachProofSource}</small>
                  </div>
                  <div className="email-lists-model-proof__connector">
                    <span>prospectId</span>
                  </div>
                  <div className="email-lists-model-proof__node email-lists-model-proof__node--history">
                    <span className="email-lists-eyebrow">Sends</span>
                    <strong>campaignId + prospectId</strong>
                    {emailOutreachProofHistory.map((item) => (
                      <span key={`${item.campaign}-${item.status}`} className="email-lists-model-proof__history-row">
                        <span>{item.campaign}</span>
                        <small>{item.status} / {item.sentAt}</small>
                      </span>
                    ))}
                  </div>
                  <div className="email-lists-model-proof__connector">
                    <span>campaignId</span>
                  </div>
                  <div className="email-lists-model-proof__node">
                    <span className="email-lists-eyebrow">Campaigns</span>
                    <strong>{emailOutreachProofHistory[0]?.campaign || 'campaign-draft'}</strong>
                    <small>{emailOutreachProofHistory[0]?.subject || 'Subject pending'}</small>
                    <small>SendGrid unsubscribe group stored here</small>
                  </div>
                </div>
                <div className="email-lists-model-proof__ledger-map" aria-label="Ledger fields sourced from Email Outreach model">
                  {EMAIL_OUTREACH_LEDGER_FIELD_SOURCES.map((item) => (
                    <span key={item.field}>
                      <strong>{item.field}</strong>
                      <small>{item.source}</small>
                      <em>{item.note}</em>
                    </span>
                  ))}
                </div>
                <div className="email-lists-model-proof__tables" aria-label="Email Outreach proposed tables and indexes">
                  {EMAIL_OUTREACH_MODEL_TABLES.map((table) => (
                    <article key={table.name} className="email-lists-model-proof__table">
                      <header>
                        <span className="email-lists-eyebrow">{table.key}</span>
                        <strong>{table.name}</strong>
                        <small>{table.role}</small>
                      </header>
                      <div className="email-lists-model-proof__fields">
                        {table.fields.map(([name, type, note]) => (
                          <span key={name} title={note}>
                            <strong>{name}</strong>
                            <small>{type}</small>
                            <em>{note}</em>
                          </span>
                        ))}
                      </div>
                      <div className="email-lists-model-proof__indexes">
                        {table.indexes.map((indexName) => (
                          <span key={indexName}>{indexName}</span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
          {demoModeEnabled && (
            <form className="email-lists-demo-send email-lists-composer" data-helix-region="reports/data-hub/email-lists/composer" onSubmit={sendEmailListDemoTest}>
              <div className="email-lists-composer__header">
                <div className="email-lists-composer__title">
                  <span className="email-lists-demo-send__label">Composer</span>
                  <strong>Demo test send</strong>
                </div>
                <span className="email-lists-demo-send__target" title={emailListDemoTarget?.email || ''}>
                  <span>{EMAIL_LIST_DEMO_ENQUIRY_ID}</span>
                  <small>{emailListDemoTarget?.email ? 'Recipient: you' : 'Recipient unavailable'}</small>
                </span>
              </div>
              <div className="email-lists-composer__grid">
                <label>
                  <span>Campaign</span>
                  <input
                    aria-label="Campaign name"
                    value={emailListCampaignName}
                    onChange={(event) => setEmailListCampaignName(event.currentTarget.value)}
                    placeholder="Campaign"
                    disabled={emailListDemoSending}
                  />
                </label>
                <label>
                  <span>Sender</span>
                  <select
                    aria-label="Demo send sender"
                    value={emailListDemoSender}
                    onChange={(event) => {
                      const nextSender = EMAIL_LIST_DEMO_SENDERS.find((sender) => sender.value === event.currentTarget.value)?.value;
                      if (nextSender) setEmailListDemoSender(nextSender);
                    }}
                    disabled={emailListDemoSending}
                  >
                    {EMAIL_LIST_DEMO_SENDERS.map((sender) => (
                      <option key={sender.value} value={sender.value}>{sender.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Signature</span>
                  <span className="email-lists-composer__signature">{operatorInitials || operatorName || 'You'} v2</span>
                </label>
                <label className="email-lists-composer__wide">
                  <span>Subject</span>
                  <input
                    aria-label="Demo send subject"
                    value={emailListDemoSubject}
                    onChange={(event) => setEmailListDemoSubject(event.currentTarget.value)}
                    placeholder="Subject"
                    disabled={emailListDemoSending}
                  />
                </label>
                <label className="email-lists-composer__wide">
                  <span>Preview</span>
                  <input
                    aria-label="Demo send preview line"
                    value={emailListDemoPreview}
                    onChange={(event) => setEmailListDemoPreview(event.currentTarget.value)}
                    placeholder="Preview line"
                    disabled={emailListDemoSending}
                  />
                </label>
                <label className="email-lists-composer__full">
                  <span>Body</span>
                  <textarea
                    aria-label="Demo send body"
                    value={emailListDemoBody}
                    onChange={(event) => setEmailListDemoBody(event.currentTarget.value)}
                    placeholder="Body"
                    disabled={emailListDemoSending}
                    rows={5}
                  />
                </label>
              </div>
              <div className="email-lists-composer__footer">
                {emailListDemoResult ? (
                  <span className={`email-lists-demo-send__result email-lists-demo-send__result--${emailListDemoResult.status}`}>
                    {emailListDemoResult.message}
                  </span>
                ) : <span />}
                <button type="submit" disabled={emailListDemoSending || !emailListDemoTarget?.email}>
                  {emailListDemoSending ? 'Sending' : 'Send test'}
                </button>
              </div>
            </form>
          )}
          {(activeCampaignLookup.loading || activeCampaignLookup.error || activeCampaignLookup.contact) && (
            <div
              data-helix-region="reports/data-hub/email-lists/activecampaign-record"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: `1px solid ${edge}`, background: elevatedSurface }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: text }}>Bridge source record</span>
                <span style={{ fontSize: 10, color: muted }}>
                  {activeCampaignLookup.loading
                    ? 'Looking up...'
                    : activeCampaignLookup.checkedAt
                      ? `Checked ${formatUpdatedAt(activeCampaignLookup.checkedAt)}`
                      : 'Not checked'}
                </span>
              </div>
              {activeCampaignLookup.error && (
                <span style={{ fontSize: 11, color: colours.cta }}>{activeCampaignLookup.error}</span>
              )}
              {activeCampaignLookup.contact && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                  <FieldCard isDarkMode={isDarkMode} label="Bridge ID" value={activeCampaignLookup.contact.id || 'Not returned'} />
                  <FieldCard isDarkMode={isDarkMode} label="Email" value={activeCampaignLookup.contact.email || 'Not returned'} />
                  <FieldCard isDarkMode={isDarkMode} label="Name" value={[activeCampaignLookup.contact.firstName, activeCampaignLookup.contact.lastName].filter(Boolean).join(' ') || 'Not returned'} />
                  <FieldCard isDarkMode={isDarkMode} label="Phone" value={activeCampaignLookup.contact.phone || 'Not returned'} />
                  <FieldCard isDarkMode={isDarkMode} label="Status" value={activeCampaignLookup.contact.status || 'Not returned'} />
                  <FieldCard isDarkMode={isDarkMode} label="Lookup" value={activeCampaignLookup.lookupSource || 'Not reported'} />
                </div>
              )}
            </div>
          )}
          <div className="email-lists-table-shell" data-helix-region="reports/data-hub/email-lists/enquiry-stream">
            <div className="email-lists-table-grid" style={{ minWidth: emailListLedgerMinWidth }}>
              {emailListCopyToast && (
                <div className="email-lists-copy-toast" role="status" aria-live="polite">
                  {emailListCopyToast}
                </div>
              )}
              <div className="email-lists-table-head" data-helix-region="reports/data-hub/email-lists/ledger-filters" style={{ gridTemplateColumns: emailListLedgerGridTemplate }}>
                {visibleEmailListLedgerColumns.map((column) => (
                  <div key={column.key} className="email-lists-table-heading">
                    <button
                      type="button"
                      className={`email-lists-table-filter${emailListSortColumn === column.key ? ` email-lists-table-filter--active email-lists-table-filter--${emailListSortDirection}` : ''}`}
                      aria-label={`Sort by ${column.label}`}
                      aria-pressed={emailListSortColumn === column.key}
                      onClick={() => toggleEmailListSort(column.key)}
                    >
                      <span>{column.label}</span>
                    </button>
                    <button
                      key={column.key}
                      type="button"
                      className="email-lists-column-eye"
                      aria-label={`Hide ${column.label} column`}
                      title={`Hide ${column.label}`}
                      onClick={() => toggleEmailListColumn(column.key)}
                    >
                      <span className="email-lists-eye-icon" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              {hiddenEmailListLedgerColumns.length > 0 && (
                <div className="email-lists-hidden-columns" data-helix-region="reports/data-hub/email-lists/hidden-columns">
                  <span>Hidden</span>
                  {hiddenEmailListLedgerColumns.map((column) => (
                    <button key={column.key} type="button" onClick={() => toggleEmailListColumn(column.key)}>
                      {column.label}
                    </button>
                  ))}
                </div>
              )}
              {emailListsLoading && emailListRows.length === 0 && (
                <div className="email-lists-skeleton-stack" aria-label="Loading email list stream">
                  {[0, 1, 2, 3].map((item) => (
                    <span key={item} className="email-lists-skeleton-row" style={{ gridTemplateColumns: emailListLedgerGridTemplate }}>
                      {visibleEmailListLedgerColumns.map((column) => <span key={column.key} />)}
                    </span>
                  ))}
                </div>
              )}
              {!emailListsLoading && emailListRows.length === 0 && (
                <div className="email-lists-empty-row">No email-ready enquiries returned for the selected areas.</div>
              )}
              {emailListRows.map((row) => {
                const rowKey = row.enquiryId || row.email;
                const isDemoRow = isEmailListDemoRow(row);
                const areaMeta = getAreaGlyphMeta(row.areaOfWork || 'Other/Unsure');
                const areaLabel = row.areaOfWork || 'Uncategorised';
                const hasTags = row.tags.length > 0;
                const hasActiveCampaignBridge = Boolean(String(row.activeCampaignId || '').trim());
                const subscriptionLabel = isDemoRow ? 'Demo audience' : `${areaLabel} audience`;
                const statusLabelText = isDemoRow ? 'Demo send' : hasActiveCampaignBridge ? 'Bridge linked' : 'Bridge pending';
                const relationshipLabel = row.methodOfContact || 'Method not set';
                const contactLabel = isDemoRow
                  ? `Demo enquiry ${row.enquiryId}`
                  : hasActiveCampaignBridge
                    ? `Bridge ${row.activeCampaignId}`
                    : row.enquiryId
                      ? `Bridge pending - source ${row.enquiryId}`
                      : 'Bridge pending';
                return (
                  <div
                    key={rowKey}
                    className="email-lists-table-row"
                    style={{ gridTemplateColumns: emailListLedgerGridTemplate }}
                  >
                    {visibleEmailListColumnSet.has('areaOfWork') && (
                      <div className="email-lists-cell email-lists-area-work-cell" title={areaLabel}>
                        <span className="email-lists-row-area-icon">{renderAreaOfWorkGlyph(row.areaOfWork || 'Other/Unsure', areaMeta.color, 'glyph', 16)}</span>
                        <span className="email-lists-row-primary">{areaLabel}</span>
                        <small>{row.receivedAt ? formatUpdatedAt(Date.parse(row.receivedAt)) : 'No date'}</small>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('listSubscription') && (
                      <div className="email-lists-cell email-lists-subscription-cell">
                        <span className="email-lists-cell-value">{subscriptionLabel}</span>
                        <small>People.audiencesJson</small>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('tags') && (
                      <div className="email-lists-cell email-lists-tags-cell">
                        <span className="email-lists-cell-value" title={row.tags.join(', ')}>
                          {hasTags ? row.tags.join(', ') : 'No sidecar tags'}
                        </span>
                        <small>People.tagsJson</small>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('relationship') && (
                      <div className="email-lists-cell email-lists-relationship-cell">
                        <span className="email-lists-icon-value">
                          <span className="email-lists-method-icon" aria-hidden="true" />
                          <span>{relationshipLabel}</span>
                        </span>
                        <small>{isDemoRow ? 'Demo mode' : hasActiveCampaignBridge ? `People.prospectId ${row.activeCampaignId}` : 'Source trace only'}</small>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('status') && (
                      <div className="email-lists-cell email-lists-status-cell">
                        <span className="email-lists-icon-value">
                          <span className={`email-lists-status-icon${hasActiveCampaignBridge ? ' email-lists-status-icon--ready' : ''}`} aria-hidden="true" />
                          <span>{statusLabelText}</span>
                        </span>
                        <small>{hasTags ? 'People.status eligible' : 'Rules pending'}</small>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('contact') && (
                      <div className="email-lists-cell email-lists-contact-cell">
                        <span className="email-lists-contact-primary" title={contactLabel}>{contactLabel}</span>
                        <span className="email-lists-contact-secondary">
                          <span className="email-lists-truncate" title={row.email}>{row.email || 'No email'}</span>
                          {row.email && (
                            <button
                              type="button"
                              className="email-lists-copy-email"
                              aria-label="Copy email address"
                              title="Copy email"
                              onClick={(event) => {
                                event.stopPropagation();
                                void copyEmailListEmail(row.email);
                              }}
                            >
                              <span aria-hidden="true" />
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                    {visibleEmailListColumnSet.has('activeCampaign') && (
                      <div className="email-lists-cell email-lists-action-cell">
                        <button
                          type="button"
                          className="email-lists-ac-action"
                          title={isDemoRow ? 'Demo enquiry' : hasActiveCampaignBridge ? `Bridge ${row.activeCampaignId}` : 'Inspect bridge source'}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isDemoRow) return;
                            void lookupActiveCampaignContact(row);
                          }}
                          disabled={isDemoRow || activeCampaignLookup.loading}
                        >
                          {isDemoRow ? 'Demo' : activeCampaignLookup.loading && activeCampaignLookup.rowKey === rowKey ? '...' : hasActiveCampaignBridge ? row.activeCampaignId : 'Check'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {canProbeProvider && !isMattersDataset && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '14px 15px',
          border: `1px solid ${edge}`,
          background: surface,
          boxShadow: reportingPanelShadow(isDarkMode),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
                Provider check
              </span>
              <span style={{ fontSize: 11, color: muted }}>
                {providerProbe.status === 'ready'
                  ? `${providerProbe.source ?? provider.sourceLabel}${providerProbe.apiVersion ? ` on ${providerProbe.apiVersion}` : ''}`
                  : provider.providerCheck?.label ?? 'Test provider'}
              </span>
            </div>
            <DefaultButton
              text={providerProbe.status === 'loading' ? 'Checking' : provider.providerCheck?.label ?? 'Test provider'}
              onClick={() => { void runProviderProbe(); }}
              disabled={providerProbe.status === 'loading'}
              iconProps={{ iconName: providerProbe.status === 'ready' ? 'CompletedSolid' : 'Refresh' }}
              styles={{
                root: {
                  borderRadius: 0,
                  height: 30,
                  padding: '0 10px',
                  fontWeight: 700,
                  fontSize: 10,
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
                  background: isDarkMode ? colours.dark.cardHover : colours.light.cardBackground,
                  color: text,
                },
              }}
            />
          </div>
          {providerProbe.status === 'loading' && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ height: 6, border: `1px solid ${edge}`, background: elevatedSurface }}>
                <div
                  style={{
                    height: '100%',
                    width: providerProbe.phase === 'preparing' ? '24%' : providerProbe.phase === 'fetching' ? '62%' : '88%',
                    background: isDarkMode ? colours.accent : colours.highlight,
                    transition: 'width 180ms ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 11, color: muted }}>
                {providerProbe.phase === 'preparing'
                  ? 'Preparing matters check...'
                  : providerProbe.phase === 'fetching'
                    ? 'Pulling matters feed rows...'
                    : 'Processing results...'}
              </span>
            </div>
          )}
          {providerProbe.error && (
            <span style={{ fontSize: 11, color: colours.cta }}>{providerProbe.error}</span>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            <FieldCard isDarkMode={isDarkMode} label="Status" value={statusLabel(providerProbe.status)} />
            <FieldCard isDarkMode={isDarkMode} label="API version" value={providerProbe.apiVersion ?? 'Not reported'} />
            <FieldCard isDarkMode={isDarkMode} label="Rows" value={providerProbe.rowCount == null ? 'Not checked' : providerProbe.rowCount.toLocaleString('en-GB')} />
            <FieldCard isDarkMode={isDarkMode} label="Latest day" value={providerProbe.latestDate ?? 'Not checked'} />
          </div>
          {providerProbe.metrics.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {providerProbe.metrics.map((metric) => (
                <FieldCard
                  key={metric.label}
                  isDarkMode={isDarkMode}
                  label={metric.label}
                  value={metric.detail ? `${metric.value} (${metric.detail})` : metric.value}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {isMattersDataset && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          padding: '16px 17px',
          border: `1px solid ${edge}`,
          background: dataHubHomeSurface,
          boxShadow: reportingPanelShadow(isDarkMode),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 760 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: text }}>
                Matters data room
              </span>
              <span style={{ fontSize: 11, color: muted, lineHeight: 1.5 }}>
                Clio matters to dbo.Matters · add missing rows only · MatterID and DisplayNumber duplicate checks.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '5px 8px', border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: mattersAutomationEnabled ? colours.green : colours.orange, boxShadow: `inset 3px 0 0 ${mattersAutomationEnabled ? colours.green : colours.orange}`, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0 }}>
                {mattersSchedulerLabel} · {mattersSchedulerDetail}
              </span>
              <DefaultButton
                text={mattersLedgerOpen ? 'Jump to ledger' : 'Load ledger'}
                onClick={handleMattersLedgerAction}
                styles={{ root: { borderRadius: 0, height: 30, fontSize: 10, fontWeight: 800, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text } }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.35fr) minmax(280px, 0.9fr)', gap: 10, alignItems: 'stretch' }}>
            <div data-helix-region="reports/data-hub/matters/process-stream" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, border: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 10px', borderBottom: `1px solid ${edge}`, background: dataHubHomeFooterSurface }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                  Matter operations
                </span>
                <span style={{ fontSize: 9, fontWeight: 800, color: mattersProcessEvents.length > 0 ? colours.green : muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                  {mattersProcessEvents.length > 0 ? `${mattersProcessEvents.length} events` : 'waiting'}
                </span>
              </div>
              {mattersProcessEvents.length > 0 ? (
                <div className="data-hub-stream-scroll" style={{ display: 'flex', flexDirection: 'column', maxHeight: 390, overflowY: 'auto' }}>
                  {mattersProcessEvents.map((event) => (
                    <div key={event.id} title={event.detail} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 9, alignItems: 'center', padding: '9px 10px', borderBottom: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: event.tone, boxShadow: `0 0 0 4px ${withAlpha(event.tone, 0.12)}` }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, color: event.tone, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{event.lane}</span>
                          <span style={{ fontSize: 11, fontWeight: 850, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
                        </span>
                        <span style={{ fontSize: 10, color: body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.detail}</span>
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', minWidth: 84 }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: event.actor === 'System' || event.actor === 'Pipeline' ? muted : colours.cta, whiteSpace: 'nowrap' }}>{event.actor}</span>
                        <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>{formatOpsAgo(event.ts)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '12px 10px', color: muted, fontSize: 11, lineHeight: 1.45 }}>
                  No persisted Matters operation events are visible yet.
                </div>
              )}
            </div>

            <div data-helix-region="reports/data-hub/matters/coverage-lanes" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, border: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
              <div style={{ padding: '9px 10px', borderBottom: `1px solid ${edge}`, background: dataHubHomeFooterSurface }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                  Matter lanes
                </span>
              </div>
              {mattersCoverageLanes.map((lane) => {
                const statusText = lane.tier?.lastRun?.status ?? 'waiting';
                const toneForLane = schedulerTone(statusText);
                return (
                  <div key={lane.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '9px 10px', borderBottom: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: toneForLane, boxShadow: `0 0 0 4px ${withAlpha(toneForLane, 0.1)}` }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 850, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.label}</span>
                      <span style={{ fontSize: 10, color: body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.system} · {lane.schedule}</span>
                      {lane.tier?.lastRun?.message && (
                        <span style={{ fontSize: 9, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lane.tier.lastRun.message}</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', minWidth: 74 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: toneForLane, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{statusText}</span>
                      <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>{lane.tier?.lastRun ? formatOpsAgo(lane.tier.lastRun.ts) : 'no run'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {latestMattersError && (
            <span style={{ fontSize: 11, color: colours.cta }}>
              Latest Matters warning: {latestMattersError.message || latestMattersError.status}
            </span>
          )}

          <div data-helix-region="reports/data-hub/matters/replay-workbench" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 13px', border: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>Replay console</span>
                <span style={{ fontSize: 12, fontWeight: 900, color: text }}>Matter opening repair lane</span>
              </span>
              <DefaultButton
                text={matterReplayOpen ? 'Hide replay console' : 'Open replay console'}
                onClick={() => setMatterReplayOpen((open) => !open)}
                styles={{ root: { borderRadius: 0, height: 30, fontSize: 10, fontWeight: 800, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text } }}
              />
            </div>
            {!matterReplayOpen && (
              <span style={{ fontSize: 10, color: body, lineHeight: 1.45 }}>
                Replay requests stay folded until needed so the Matters dataset can load without running inspection calls.
              </span>
            )}
            {matterReplayOpen && (
              <MatterReplayWorkbench
                viewerInitials={operatorInitials ?? null}
                isDarkMode={isDarkMode}
              />
            )}
          </div>

          <div data-helix-region="reports/data-hub/matters/gap-fill" style={{ display: 'grid', gap: 10, padding: 12, border: `1px solid ${edge}`, background: dataHubHomeCardSurface }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
                <div role="group" aria-label="Opening date presets" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {MATTERS_RANGE_PRESETS.map((preset) => {
                    const active = activeMatterRangePreset === preset.key;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyMattersPreset(preset.key)}
                        style={{ height: 26, padding: '0 8px', border: `1px solid ${active ? dataHubBrandAccent : edge}`, background: active ? dataHubHomeSelectedSurface : dataHubHomeControlSurface, color: active ? dataHubBrandAccent : text, fontSize: 10, fontWeight: 850, cursor: 'pointer' }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) minmax(110px, 1fr)', gap: 7 }}>
                  <label style={{ display: 'grid', gap: 4, fontSize: 9, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                    From
                    <input type="date" value={mattersStartDate} max={todayDateValue} onChange={(event) => setMattersRange(event.target.value, mattersEndDate, 'custom')} style={{ height: 30, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text, padding: '0 8px', fontSize: 11, fontWeight: 800 }} />
                  </label>
                  <label style={{ display: 'grid', gap: 4, fontSize: 9, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                    To
                    <input type="date" value={mattersEndDate} max={todayDateValue} onChange={(event) => setMattersRange(mattersStartDate, event.target.value, 'custom')} style={{ height: 30, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text, padding: '0 8px', fontSize: 11, fontWeight: 800 }} />
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <DefaultButton text={mattersMigrationLoading === 'schema' ? 'Checking' : 'Check table'} onClick={() => { void loadMattersSchema(); }} disabled={Boolean(mattersMigrationLoading)} styles={{ root: { borderRadius: 0, height: 30, fontSize: 10, fontWeight: 800, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text } }} />
                <DefaultButton text={mattersMigrationLoading === 'plan' ? 'Previewing' : 'Preview gap'} onClick={() => { void planMattersMigration(); }} disabled={Boolean(mattersMigrationLoading) || !mattersRangeIsValid} styles={{ root: { borderRadius: 0, height: 30, fontSize: 10, fontWeight: 800, border: `1px solid ${edge}`, background: dataHubHomeControlSurface, color: text } }} />
                <PrimaryButton text={mattersMigrationLoading === 'sync' ? 'Writing' : 'Fill missing'} onClick={() => { void runMattersMigration(); }} disabled={Boolean(mattersMigrationLoading) || !mattersRangeIsValid} styles={{ root: { borderRadius: 0, height: 30, background: colours.cta, border: 'none', color: colours.light.cardBackground, fontSize: 10, fontWeight: 800 } }} />
              </div>
            </div>
            {mattersMigrationError && (
              <span style={{ fontSize: 11, color: colours.cta }}>{mattersMigrationError}</span>
            )}
          </div>
        </div>
      )}

      {!isMattersDataset && !isEmailListsDataset && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 15px',
            border: `1px solid ${edge}`,
            background: surface,
            boxShadow: reportingPanelShadow(isDarkMode),
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
              Dataset criteria
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11, lineHeight: 1.5, color: muted }}>
              <span>Route: {routeLabel}</span>
              <span>{provider.freshnessExpectation}</span>
              <span>Cached: {liveDataset?.cached ? 'Yes' : 'No'}</span>
            </div>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 15px',
            border: `1px solid ${edge}`,
            background: surface,
            boxShadow: reportingPanelShadow(isDarkMode),
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: text }}>
              Used by reports
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reportUsage.map((label) => (
                <span key={label} style={{
                  padding: '4px 7px',
                  border: `1px solid ${edge}`,
                  background: elevatedSurface,
                  color: text,
                  fontSize: 10,
                  fontWeight: 700,
                }}>
                  {label}
                </span>
              ))}
            </div>
            {contextDatasets.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
                  Context datasets
                </span>
                {contextDatasets.map((dataset) => (
                  <span key={dataset.key} style={{ fontSize: 10, color: muted }}>
                    {dataset.name}: {statusLabel(dataset.status)} ({dataset.count == null ? 'No' : dataset.count.toLocaleString('en-GB')} rows)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!isMattersDataset && !isEmailListsDataset && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {previewTable && (
            <PrimaryButton
              text="Preview rows"
              onClick={onPreviewRows}
              styles={{
                root: {
                  borderRadius: 0,
                  height: 30,
                  background: isDarkMode ? colours.accent : colours.highlight,
                  border: 'none',
                  color: colours.light.sectionBackground,
                  fontSize: 10,
                  fontWeight: 700,
                },
              }}
            />
          )}
          <DefaultButton
            text={`Open ${operationalViewLabel}`}
            onClick={onOpenOperationalView}
            styles={{
              root: {
                borderRadius: 0,
                height: 30,
                padding: '0 10px',
                fontWeight: 700,
                fontSize: 10,
                border: `1px solid ${isDarkMode ? 'rgba(135,243,243,0.35)' : 'rgba(54,144,206,0.25)'}`,
                background: 'transparent',
                color: isDarkMode ? colours.accent : colours.highlight,
              },
            }}
          />
        </div>
      )}
    </section>
  );
};

export default DataHubDatasetDetail;