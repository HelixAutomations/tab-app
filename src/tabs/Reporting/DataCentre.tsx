import React from 'react';
import type { CSSProperties } from 'react';
import { DefaultButton, PrimaryButton } from '@fluentui/react/lib/Button';
import { FontIcon } from '@fluentui/react/lib/Icon';
import { DatePicker } from '@fluentui/react/lib/DatePicker';
import { Spinner, SpinnerSize } from '@fluentui/react/lib/Spinner';
import { Modal } from '@fluentui/react/lib/Modal';
import { Dialog, DialogType, DialogFooter } from '@fluentui/react/lib/Dialog';
import { ChoiceGroup } from '@fluentui/react/lib/ChoiceGroup';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
  reportingShellBackground,
} from './styles/reportingFoundation';
import { colours, withAlpha } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';
import { useToast } from '../../components/feedback/ToastProvider';
import { useNavigatorActions } from '../../app/functionality/NavigatorContext';
import NavigatorDetailBar from '../../components/NavigatorDetailBar';
import OutstandingMatterExplorer from './components/OutstandingMatterExplorer';
import ManagementDashboardTrustRail from './ManagementDashboardTrustRail';
import DataHubDatasetDetail from './components/DataHubDatasetDetail';
import DataHubDatasetPicker from './components/DataHubDatasetPicker';
import DataHubAttributionWorkbench from './components/DataHubAttributionWorkbench';
import AccessMatrixConnector from './components/AccessMatrixConnector';
import DataHubStreamsPanel from './components/DataHubStreamsPanel';
import GoogleAnalyticsProviderPanel from './components/GoogleAnalyticsProviderPanel';
import EnquirySourceLedger from './components/EnquirySourceLedger';
import MattersSourceLedger from './components/MattersSourceLedger';
import {
  REPORTING_DATASET_BY_KEY,
  type Ga4ProviderCheckState,
  type Ga4ProviderPayload,
  type ReportingDatasetKey,
  type ReportingLiveDatasetSummary,
} from './reportingDatasets';

/* Local helper: subtle border stroke used across reporting UI */
const subtleStroke = (isDarkMode: boolean): string => (
  isDarkMode ? 'rgba(75, 85, 99, 0.28)' : 'rgba(6, 23, 51, 0.06)'
);

type PlanData = {
  startDate: string;
  endDate: string;
  rowsToDelete: number;
  rowsToInsert: number;
  message: string;
};

type DatasetSummary = ReportingLiveDatasetSummary;

type OperationLogEntry = {
  id: string;
  ts: number;
  jobId?: string | null;
  operation: string;
  entity?: string | null;
  sourceSystem?: string | null;
  direction?: string | null;
  status: 'started' | 'progress' | 'completed' | 'error' | string;
  startDate?: string;
  endDate?: string;
  triggeredBy?: string;
  invokedBy?: string;
  daysBack?: number;
  deletedRows?: number;
  insertedRows?: number;
  changedRows?: number;
  durationMs?: number;
  message?: string;
};

function normaliseOperationLogEntry(entry: Partial<OperationLogEntry> & Record<string, unknown>, index: number): OperationLogEntry | null {
  const operation = String(entry.operation || '').trim();
  if (!operation) return null;
  const rawTs = (entry as Record<string, unknown>).ts;
  const ts = typeof rawTs === 'number'
    ? rawTs
    : rawTs instanceof Date
      ? rawTs.getTime()
      : Date.parse(String(rawTs || ''));
  const safeTs = Number.isFinite(ts) ? ts : Date.now();
  const id = String(entry.id || entry.jobId || `${operation}-${safeTs}-${index}`);
  return {
    id,
    ts: safeTs,
    jobId: typeof entry.jobId === 'string' ? entry.jobId : null,
    operation,
    entity: typeof entry.entity === 'string' ? entry.entity : null,
    sourceSystem: typeof entry.sourceSystem === 'string' ? entry.sourceSystem : null,
    direction: typeof entry.direction === 'string' ? entry.direction : null,
    status: String(entry.status || 'recorded'),
    startDate: typeof entry.startDate === 'string' ? entry.startDate : undefined,
    endDate: typeof entry.endDate === 'string' ? entry.endDate : undefined,
    triggeredBy: typeof entry.triggeredBy === 'string' ? entry.triggeredBy : undefined,
    invokedBy: typeof entry.invokedBy === 'string' ? entry.invokedBy : undefined,
    daysBack: typeof entry.daysBack === 'number' ? entry.daysBack : undefined,
    deletedRows: typeof entry.deletedRows === 'number' ? entry.deletedRows : undefined,
    insertedRows: typeof entry.insertedRows === 'number' ? entry.insertedRows : undefined,
    changedRows: typeof entry.changedRows === 'number' ? entry.changedRows : undefined,
    durationMs: typeof entry.durationMs === 'number' ? entry.durationMs : undefined,
    message: typeof entry.message === 'string' ? entry.message : undefined,
  };
}

type MatterOpeningActivityEntry = {
  id: string;
  ts: number;
  status: string;
};

type ActivityFeedItem = {
  id?: unknown;
  source?: unknown;
  status?: unknown;
  timestamp?: unknown;
};

function mapMatterOpeningActivityItems(items: unknown): MatterOpeningActivityEntry[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is ActivityFeedItem => String((item as ActivityFeedItem)?.source || '') === 'activity.matter-opening')
    .map((item, index) => {
      const parsedTs = Date.parse(String(item.timestamp || ''));
      const rawStatus = String(item.status || '').toLowerCase();
      const status = rawStatus === 'error' || rawStatus === 'failed'
        ? 'error'
        : rawStatus === 'warn' || rawStatus === 'warning'
          ? 'warn'
          : 'completed';
      return {
        id: String(item.id || `matter-opening-${index}`),
        ts: Number.isNaN(parsedTs) ? Date.now() : parsedTs,
        status,
      };
    })
    .sort((left, right) => right.ts - left.ts)
    .slice(0, 20);
}

/**
 * Translate raw server/Clio error messages into plain-English summaries.
 * The raw message is still available via tooltip for debugging.
 */
function humaniseMessage(raw?: string): string {
  if (!raw) return '';
  const m = raw.toLowerCase();
  if (m.includes('429')) return 'Temporarily rate-limited by Clio — will retry automatically';
  if (m.includes('401') || m.includes('invalid_token') || m.includes('expired')) return 'Clio access token expired — refreshing automatically';
  if (m.includes('clio returned 0 activities') || m.includes('clio returned no data') || m.includes('clio report empty'))
    return 'No new data from Clio for this period';
  if (m.includes('econnrefused') || m.includes('enotfound') || m.includes('network'))
    return 'Network error reaching Clio — will retry on next cycle';
  if (m.includes('timed out') || m.includes('timeout'))
    return 'Request timed out — will retry on next cycle';
  if (m.includes('cancelled by user')) return 'Cancelled by user';
  if (m.includes('sanity guard') || m.includes('rolled back'))
    return 'Safety check failed — existing data preserved (no data lost)';
  if (m.includes('sql') && m.includes('connection'))
    return 'Database connection issue — will retry on next cycle';
  // Shorten date-range messages: "Syncing 2026-03-01 → 2026-03-02 (replace)" → keep as-is
  if (m.includes('syncing ') && m.includes('→')) return raw;
  if (m.includes('requesting report')) return raw;
  // For anything else unknown, return the original but cap length
  return raw.length > 120 ? raw.slice(0, 117) + '…' : raw;
}

function formatSchedulerAgo(ts?: number | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatSchedulerDuration(durationMs?: number | null): string {
  if (durationMs == null) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1000)}s`;
}

function schedulerStatusColour(status?: string | null): string {
  switch (status) {
    case 'validated':
    case 'ok':
    case 'completed':
      return colours.green;
    case 'running':
    case 'started':
    case 'queued':
      return colours.blue;
    case 'warn':
    case 'no-data':
      return colours.orange;
    case 'error':
    case 'timeout':
      return colours.cta;
    case 'skipped':
      return colours.orange;
    default:
      return colours.subtleGrey;
  }
}

type MonthAuditEntry = {
  key: string;
  label: string;
  lastSync: { ts: string; status: string; insertedRows?: number; deletedRows?: number; durationMs?: number; invokedBy?: string; message?: string } | null;
  lastValidate: { ts: string; status: string; message?: string; invokedBy?: string } | null;
  syncCount: number;
  validateCount: number;
  /** SQL row counts for this month (WIP only) */
  stats?: { totalRows: number; billableRows: number; nonBillableRows: number; totalValue: number; billableValue: number; nonBillableValue: number } | null;
  /** True if this month includes current-week dates that were excluded from sync */
  currentWeekExcluded?: boolean;
};

type DriftResult = {
  operation: string;
  sqlCount: number;
  clioCount: number;
  drift: number;
  status: 'match' | 'missing' | 'extra';
  message: string;
};

type TeamMember = {
  name: string;
  rows: number;
  total: number;
  hours?: number;
  userId?: number;
};

type MonthlyTotal = {
  month: string;
  rows: number;
  total: number;
  hours?: number;
  breakdown?: { kind: string; rows: number; total: number; hours?: number }[];
};

type SchedulerTierInfo = {
  lastRun: { ts: number; status: string; message?: string | null; triggeredBy?: string | null } | null;
  schedule: string;
};

type DataOpsSchedulerEntity = ReportingAuditScope | 'matters';

type SchedulerRecentRun = {
  id: string;
  ts: number;
  entity: DataOpsSchedulerEntity;
  operation: string;
  status: string;
  triggeredBy: string;
  modeLabel: string;
  invokedBy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  windowLabel: string;
  resultLabel?: string | null;
  durationMs?: number | null;
  deletedRows?: number | null;
  insertedRows?: number | null;
  message?: string | null;
};

type SchedulerStatus = {
  enabled: boolean;
  tiers: {
    collected: Record<string, SchedulerTierInfo>;
    wip: Record<string, SchedulerTierInfo>;
    matters?: Record<string, SchedulerTierInfo>;
  };
  recentRuns: SchedulerRecentRun[];
  automation?: {
    matters?: {
      enabled?: boolean;
      currentSchedule?: string;
      sealSchedule?: string;
    };
  };
  serverTime?: number;
};

type DataOperationStatus = {
  collectedTime: {
    rowCount: number | null;
    latestDate: string | null;
    lastDailySync: OperationLogEntry | null;
    lastRollingSync: OperationLogEntry | null;
  };
  wip: {
    rowCount: number | null;
    latestDate: string | null;
    lastSync: OperationLogEntry | null;
  };
  recentOperations: OperationLogEntry[];
};

type TokenCheckResult = {
  success: boolean;
  message: string;
  tokenPreview?: string | null;
  durationMs: number;
};

type ReportingAuditScope = 'collected' | 'wip';

type ReportingAuditCheck = {
  key: string;
  scope: ReportingAuditScope;
  label: string;
  status: 'ok' | 'monitor' | 'warn' | 'error';
  count?: number;
  value?: string;
  description: string;
};

type ReportingAuditSnapshot = {
  generatedAt: number;
  scope: ReportingAuditScope;
  scopeLabel: string;
  summary: {
    warnCount: number;
    monitorCount: number;
    errorCount: number;
    okCount: number;
    issueCount: number;
    checkCount: number;
    status: 'ok' | 'monitor' | 'warn' | 'error';
  };
  findings: ReportingAuditCheck[];
};

type TablePreview = {
  table: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
};

type OutstandingBalancesReconcileSummary = {
  checkedAt?: string;
  status: string;
  tableCount: number;
  liveCount: number;
  tableTotal: number;
  liveTotal: number;
  totalDrift: number;
  missingCount: number;
  extraCount: number;
  changedCount: number;
  samples?: {
    missingIds?: number[];
    extraIds?: number[];
    changed?: Array<{ id: number; tableTotal: number; liveTotal: number }>;
  };
};

type OutstandingBalancesStatus = {
  datasetKey: string;
  rowCount: number;
  totalBalance: number;
  latestSourceSyncedAt: string | null;
  freshnessMinutes: number | null;
  isStale: boolean;
  lastSync: {
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    rowCount: number | null;
    totalBalance: number | null;
    durationMs: number | null;
    error: string | null;
    sourceHash: string | null;
  } | null;
  lastReconcile: {
    checkedAt: string | null;
    status: string | null;
    summary: OutstandingBalancesReconcileSummary | null;
  } | null;
};

interface DataCentreProps {
  onBack: () => void;
  onRefreshAll: () => void;
  onRefreshDatasets: (keys: ReportingDatasetKey[]) => void | Promise<unknown>;
  onRefreshCollected: () => void;
  isRefreshing: boolean;
  progressPercent: number;
  phaseLabel: string | null;
  elapsedLabel: string;
  datasets: DatasetSummary[];
  /** Current user's full name for audit trail */
  userName?: string;
  /** Current user's initials for dev-preview gates */
  userInitials?: string;
  /** Current user's email for demo-mode self-send simulations */
  userEmail?: string;
  /** Mark this surface as the restricted production audience view */
  showProdAudienceBadge?: boolean;
  /** True when Data Hub is mounted as its own top-level tab */
  isDedicatedPage?: boolean;
  /** Enables demo-only controls for walkthroughs and simulations */
  demoModeEnabled?: boolean;
}

type RangePreset = 'custom' | 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'rolling7d' | 'rolling14d' | 'thisMonth' | 'lastMonth' | 'ytd' | 'thisYear' | 'lastYear';

const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Wk',
  lastWeek: 'Last Wk',
  rolling7d: '7d',
  rolling14d: '14d',
  thisMonth: 'This Mo',
  lastMonth: 'Last Mo',
  ytd: 'YTD',
  thisYear: 'This Yr',
  lastYear: 'Last Yr',
  custom: 'Custom',
};

/* Per-operation range state */
type OperationRangeState = {
  preset: RangePreset;
  startDate: Date | null | undefined;
  endDate: Date | null | undefined;
};

/* ─────────────────────────────────────────────────────────────
   Styles
   ───────────────────────────────────────────────────────────── */

const pageStyle = (isDarkMode: boolean): CSSProperties => ({
  minHeight: '100vh',
  padding: '32px 36px',
  background: reportingShellBackground(isDarkMode),
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});

const bannerStyle = (
  variant: 'healthy' | 'loading' | 'error',
  isDarkMode: boolean
): CSSProperties => {
  const tokens = {
    healthy: {
      bg: isDarkMode ? 'rgba(32, 178, 108, 0.12)' : 'rgba(32, 178, 108, 0.08)',
      border: isDarkMode ? 'rgba(32, 178, 108, 0.3)' : 'rgba(32, 178, 108, 0.2)',
      icon: colours.green,
    },
    loading: {
      bg: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
      border: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)',
      icon: colours.blue,
    },
    error: {
      bg: isDarkMode ? 'rgba(214, 85, 65, 0.12)' : 'rgba(214, 85, 65, 0.08)',
      border: isDarkMode ? 'rgba(214, 85, 65, 0.3)' : 'rgba(214, 85, 65, 0.2)',
      icon: colours.cta,
    },
  };
  const t = tokens[variant];
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 20px',
    borderRadius: 12,
    background: t.bg,
    border: `1px solid ${t.border}`,
  };
};

const bannerIconStyle = (variant: 'healthy' | 'loading' | 'error'): CSSProperties => ({
  fontSize: 18,
  color: variant === 'healthy' ? colours.green : variant === 'loading' ? colours.blue : colours.cta,
});

const bannerTextStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: 600,
  color: isDarkMode ? colours.dark.text : colours.light.text,
});

const bannerMetaStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}99`,
  marginLeft: 'auto',
});

const progressWrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const progressTrackStyle = (isDarkMode: boolean): CSSProperties => ({
  height: 6,
  borderRadius: 999,
  background: isDarkMode ? `${colours.dark.border}26` : `${colours.highlightNeutral}`,
  overflow: 'hidden',
});

const progressFillStyle = (isDarkMode: boolean, value: number): CSSProperties => ({
  height: '100%',
  width: `${Math.max(0, Math.min(100, value))}%`,
  background: colours.blue,
  transition: 'width 0.25s ease',
});

const progressLabelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 11,
  color: isDarkMode ? `${colours.subtleGrey}99` : `${colours.greyText}8C`,
});

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
  gap: 20,
};

const getDatePickerProps = (isDarkMode: boolean) => ({
  styles: { root: { width: 140 } },
  textField: {
    styles: {
      fieldGroup: {
        height: 36,
        border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
        borderRadius: 8,
        background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        selectors: {
          ':after': { border: 'none' },
          ':hover': {
            borderColor: isDarkMode ? colours.dark.borderColor : colours.subtleGrey,
            background: isDarkMode ? colours.dark.cardHover : colours.grey
          },
          ':focus-within': {
            borderColor: '#3690CE',
            boxShadow: '0 0 0 2px rgba(54, 144, 206, 0.2)'
          }
        },
      },
      field: {
        fontSize: 13,
        fontWeight: '600',
        padding: '0 12px',
        color: isDarkMode ? colours.dark.text : colours.light.text
      },
      icon: {
        fontSize: 16,
        top: 10,
        right: 12,
        color: isDarkMode ? colours.greyText : colours.subtleGrey
      },
    }
  }
});

const cardStyle = (isDarkMode: boolean): CSSProperties => ({
  borderRadius: 14,
  padding: '18px 20px',
  background: reportingPanelBackground(isDarkMode, 'base'),
  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
  boxShadow: reportingPanelShadow(isDarkMode),
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
});

const cardHeaderStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
});

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const healthDotStyle = (health: 'ok' | 'loading' | 'error'): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background: health === 'ok' ? colours.green : health === 'loading' ? colours.blue : colours.cta,
  boxShadow:
    health === 'ok'
      ? `0 0 6px ${colours.green}80`
      : health === 'loading'
        ? '0 0 6px rgba(54, 144, 206, 0.5)'
        : `0 0 6px ${colours.cta}80`,
});

const feedRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  borderRadius: 8,
  background: reportingPanelBackground(isDarkMode, 'base'),
  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
});

const feedNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
};

const feedMetaStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  color: isDarkMode ? `${colours.subtleGrey}8C` : `${colours.greyText}80`,
});

const statusDotStyle = (status: DatasetSummary['status']): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background:
    status === 'ready'
      ? colours.green
      : status === 'loading'
        ? colours.blue
        : status === 'error'
          ? colours.cta
          : colours.subtleGrey,
});

const formatShortDateLabel = (value?: string | number | null): string => {
  if (!value) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const formatShortDateTimeLabel = (value?: string | number | null): string => {
  if (!value) return 'Unknown';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const formatRangeWindowLabel = (range: OperationRangeState): string => {
  if (!range.startDate || !range.endDate) return 'Pick dates first';
  return `${range.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} to ${range.endDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
};

const formatTierName = (tierKey: string): string => {
  const words = tierKey.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return words.replace(/\b\w/g, (char) => char.toUpperCase());
};

const isSystemSchedulerRun = (run: SchedulerRecentRun): boolean => {
  const source = String(run.triggeredBy || '').toLowerCase();
  const actor = String(run.invokedBy || '').toLowerCase();
  return source === 'system'
    || source === 'scheduler'
    || source === 'timer'
    || source === 'auto'
    || actor === 'system'
    || actor === 'scheduler'
    || actor === 'timer'
    || actor === 'auto';
};

const isSuccessfulSchedulerRun = (run: SchedulerRecentRun): boolean => (
  run.status === 'completed' || run.status === 'validated' || run.status === 'ok'
);

const schedulerRunKind = (run: SchedulerRecentRun): 'check' | 'sync' => {
  const operation = (run.operation || '').toLowerCase();
  const status = (run.status || '').toLowerCase();
  const result = (run.resultLabel || run.message || '').toLowerCase();
  return operation.includes('validate') || status === 'validated' || result.includes('validated') ? 'check' : 'sync';
};

const formatRunDelta = (run: SchedulerRecentRun): string => {
  const parts: string[] = [];
  if (run.deletedRows != null) parts.push(`Deleted ${run.deletedRows.toLocaleString('en-GB')}`);
  if (run.insertedRows != null) parts.push(`inserted ${run.insertedRows.toLocaleString('en-GB')}`);
  if (run.durationMs != null) parts.push(formatSchedulerDuration(run.durationMs));
  return parts.join(', ');
};

type DataHubReconciliationPanelProps = {
  isDarkMode: boolean;
  scope: ReportingAuditScope;
  opsStatus: DataOperationStatus | null;
  schedulerStatus: SchedulerStatus | null;
  auditSnapshot: ReportingAuditSnapshot | null;
  reportingAuditRunning: boolean;
  range: OperationRangeState;
  onRunAudit: (scope: ReportingAuditScope) => void;
};

const DataHubReconciliationPanel: React.FC<DataHubReconciliationPanelProps> = ({
  isDarkMode,
  scope,
  opsStatus,
  schedulerStatus,
  auditSnapshot,
  reportingAuditRunning,
  range,
  onRunAudit,
}) => {
  const isCollectedLane = scope === 'collected';
  const laneAccent = isCollectedLane ? colours.blue : colours.accent;
  const laneStatus = isCollectedLane ? opsStatus?.collectedTime : opsStatus?.wip;
  const sourceLabel = isCollectedLane ? 'Clio payments' : 'Clio activities plus live week';
  const reportingLabel = isCollectedLane ? 'Reporting collected totals' : 'Reporting WIP';
  const databaseLabel = isCollectedLane ? 'collectedTime' : 'wip';
  const windowLabel = formatRangeWindowLabel(range);
  const latestDatabasePoint = formatShortDateLabel(laneStatus?.latestDate ?? null);
  const databaseRows = laneStatus?.rowCount != null ? laneStatus.rowCount.toLocaleString('en-GB') : '-';
  const topFindings = auditSnapshot?.findings.slice(0, 3) ?? [];
  const schedulerTierEntries = schedulerStatus
    ? Object.entries(schedulerStatus.tiers[scope]) as Array<[string, SchedulerTierInfo]>
    : [];
  const recentSchedulerRuns = (schedulerStatus?.recentRuns ?? [])
    .filter((run) => run.entity === scope)
    .slice(0, 8);
  const successfulRuns = recentSchedulerRuns.filter(isSuccessfulSchedulerRun);
  const systemRuns = recentSchedulerRuns.filter(isSystemSchedulerRun);
  const userRuns = recentSchedulerRuns.filter((run) => !isSystemSchedulerRun(run));
  const latestSystemRun = systemRuns[0] ?? null;
  const latestUserRun = userRuns[0] ?? null;
  const totalInserted = recentSchedulerRuns.reduce((sum, run) => sum + (run.insertedRows ?? 0), 0);
  const totalDeleted = recentSchedulerRuns.reduce((sum, run) => sum + (run.deletedRows ?? 0), 0);
  const statusText = reportingAuditRunning
    ? 'Checking now'
    : !auditSnapshot
      ? 'Not checked yet'
      : auditSnapshot.summary.issueCount > 0
        ? `${auditSnapshot.summary.issueCount} problem${auditSnapshot.summary.issueCount === 1 ? '' : 's'} found`
        : 'All good';
  const statusTone = reportingAuditRunning
    ? colours.blue
    : !auditSnapshot
      ? colours.greyText
      : auditSnapshot.summary.status === 'error' || auditSnapshot.summary.status === 'warn'
        ? colours.cta
        : auditSnapshot.summary.status === 'monitor'
          ? colours.orange
          : colours.green;
  const checkedAt = auditSnapshot ? formatShortDateTimeLabel(auditSnapshot.generatedAt) : null;
  const shellBorder = reportingPanelBorder(isDarkMode, 'strong');
  const shellBackground = reportingPanelBackground(isDarkMode, 'base');
  const elevatedBackground = reportingPanelBackground(isDarkMode, 'elevated');
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const muted = isDarkMode ? colours.greyText : colours.subtleGrey;
  const bodyText = isDarkMode ? '#d1d5db' : '#374151';

  const proofCards = [
    { label: 'Source', value: sourceLabel, detail: windowLabel, tone: laneAccent },
    { label: 'Report check', value: statusText, detail: checkedAt ? `Checked ${checkedAt}` : 'Awaiting a manual check', tone: statusTone },
    { label: 'Saved table', value: `${databaseRows} rows`, detail: `Latest saved date: ${latestDatabasePoint}`, tone: laneAccent },
  ];

  const syncSummaryCards = [
    {
      label: 'Recent successes',
      value: recentSchedulerRuns.length > 0 ? `${successfulRuns.length}/${recentSchedulerRuns.length}` : '0',
      detail: 'Completed or validated persisted runs',
      tone: successfulRuns.length > 0 ? colours.green : muted,
    },
    {
      label: 'System lane',
      value: latestSystemRun ? formatSchedulerAgo(latestSystemRun.ts) : 'None yet',
      detail: latestSystemRun ? latestSystemRun.modeLabel : 'No scheduler run in recent history',
      tone: latestSystemRun ? schedulerStatusColour(latestSystemRun.status) : muted,
    },
    {
      label: 'User lane',
      value: latestUserRun ? formatSchedulerAgo(latestUserRun.ts) : 'None yet',
      detail: latestUserRun?.invokedBy || latestUserRun?.triggeredBy || 'No manual run in recent history',
      tone: latestUserRun ? schedulerStatusColour(latestUserRun.status) : muted,
    },
    {
      label: 'Row movement',
      value: `${totalDeleted.toLocaleString('en-GB')} out / ${totalInserted.toLocaleString('en-GB')} in`,
      detail: 'Across the visible persisted stream',
      tone: totalInserted > 0 || totalDeleted > 0 ? laneAccent : muted,
    },
  ];

  return (
    <section
      data-helix-region={`data-hub/${scope}/reconciliation`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderStyle: 'solid',
        borderWidth: '1px 1px 1px 3px',
        borderColor: `${shellBorder} ${shellBorder} ${shellBorder} ${laneAccent}`,
        background: shellBackground,
        boxShadow: reportingPanelShadow(isDarkMode),
        borderRadius: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span style={{ width: 4, alignSelf: 'stretch', minHeight: 54, background: laneAccent, flexShrink: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0, color: muted }}>
              Reconciliation
            </span>
            <span style={{ fontSize: 18, lineHeight: 1.15, fontWeight: 900, color: text }}>
              {isCollectedLane ? 'Collected evidence chain' : 'WIP evidence chain'}
            </span>
            <span style={{ fontSize: 11, lineHeight: 1.45, color: bodyText, fontWeight: 600 }}>
              Shows what is being checked: source data, reporting totals, saved table rows, and persisted sync history split between system and user activity.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '10px 12px', border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: elevatedBackground }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusTone, boxShadow: `0 0 0 4px ${withAlpha(statusTone, 0.12)}` }} />
            <span style={{ fontSize: 11, fontWeight: 900, color: statusTone, textTransform: 'uppercase', letterSpacing: 0 }}>
              {statusText}
            </span>
          </div>
          <span style={{ fontSize: 10, color: muted }}>
            {checkedAt ? `Last reconciliation check: ${checkedAt}` : 'Run a check to compare source, report, and saved table.'}
          </span>
        </div>

        <PrimaryButton
          text={reportingAuditRunning ? 'Checking...' : 'Check now'}
          onClick={() => onRunAudit(scope)}
          disabled={reportingAuditRunning}
          styles={{
            root: {
              borderRadius: 0,
              height: 44,
              background: laneAccent,
              border: 'none',
              color: colours.light.sectionBackground,
              fontSize: 10,
              fontWeight: 800,
            },
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
        {proofCards.map((card) => (
          <div
            key={card.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 0,
              padding: '10px 12px',
              border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
              borderTop: `3px solid ${card.tone}`,
              background: elevatedBackground,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
              {card.label}
            </span>
            <span style={{ fontSize: 14, fontWeight: 900, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.value}
            </span>
            <span style={{ fontSize: 10, color: bodyText, fontWeight: 600 }}>
              {card.detail}
            </span>
          </div>
        ))}
      </div>

      {schedulerStatus && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: text, textTransform: 'uppercase', letterSpacing: 0 }}>
                Recent sync activity
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 7px', border: `1px solid ${withAlpha(laneAccent, 0.26)}`, background: withAlpha(laneAccent, isDarkMode ? 0.12 : 0.08), color: laneAccent, fontSize: 9, fontWeight: 800, textTransform: 'uppercase' }}>
                Persisted across restarts
              </span>
            </div>
            <span style={{ fontSize: 9, color: muted }}>
              {recentSchedulerRuns.length > 0 ? `${recentSchedulerRuns.length} latest events` : 'No persisted stream yet'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
            {syncSummaryCards.map((card) => (
              <div
                key={card.label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '9px 10px',
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                  borderLeft: `2px solid ${card.tone}`,
                  background: elevatedBackground,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 900, color: muted, textTransform: 'uppercase' }}>{card.label}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: card.tone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.value}</span>
                <span style={{ fontSize: 9, color: bodyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.detail}</span>
              </div>
            ))}
          </div>

          {schedulerTierEntries.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
              {schedulerTierEntries.map(([tierKey, tierInfo]) => {
                const lastRun = tierInfo.lastRun;
                const tone = schedulerStatusColour(lastRun?.status ?? null);
                return (
                  <div
                    key={tierKey}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                      padding: '9px 10px',
                      border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                      background: isDarkMode ? 'rgba(2,6,23,0.42)' : 'rgba(255,255,255,0.92)',
                      borderTop: `2px solid ${tone}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone, boxShadow: `0 0 0 4px ${withAlpha(tone, 0.11)}` }} />
                      <span style={{ fontSize: 11, fontWeight: 900, color: text }}>{formatTierName(tierKey)}</span>
                    </div>
                    <span style={{ fontSize: 9, color: muted }}>{tierInfo.schedule}</span>
                    <span style={{ fontSize: 9, color: tone, fontWeight: 800, textTransform: 'uppercase' }}>
                      {lastRun ? `${lastRun.status} - ${formatSchedulerAgo(lastRun.ts)}` : 'No persisted run yet'}
                    </span>
                    {lastRun?.message && (
                      <span style={{ fontSize: 9, color: bodyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lastRun.message || ''}>
                        {humaniseMessage(lastRun.message)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {recentSchedulerRuns.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
              {recentSchedulerRuns.map((run) => {
                const tone = schedulerStatusColour(run.status);
                const isSystem = isSystemSchedulerRun(run);
                const kind = schedulerRunKind(run);
                const detailText = run.resultLabel || humaniseMessage(run.message || '') || 'Result pending';
                const rowDelta = formatRunDelta(run);
                const actorLabel = isSystem ? 'System' : (run.invokedBy || run.triggeredBy || 'User');
                return (
                  <div
                    key={run.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      gap: 9,
                      padding: '9px 10px',
                      border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                      background: isDarkMode ? 'rgba(2,6,23,0.42)' : 'rgba(255,255,255,0.92)',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, boxShadow: `0 0 0 4px ${withAlpha(tone, 0.12)}`, marginTop: 4 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 9, fontWeight: 900, color: tone, textTransform: 'uppercase' }}>{run.status}</span>
                        <span style={{ fontSize: 9, fontWeight: 900, color: kind === 'check' ? colours.green : laneAccent, textTransform: 'uppercase' }}>{kind}</span>
                        <span style={{ fontSize: 9, fontWeight: 900, color: isSystem ? laneAccent : colours.cta, textTransform: 'uppercase' }}>{actorLabel}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 9, color: muted }}>{formatSchedulerAgo(run.ts)}</span>
                      </div>
                      <span style={{ fontSize: 11, color: text, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detailText}>
                        {run.modeLabel} - {run.windowLabel}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, color: bodyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }} title={detailText}>
                          {detailText}
                        </span>
                        {rowDelta && <span style={{ fontSize: 9, color: muted }}>{rowDelta}</span>}
                        <span style={{ fontSize: 9, color: muted }}>{formatShortDateTimeLabel(run.ts)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '10px 12px', border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: elevatedBackground, fontSize: 10, color: muted }}>
              No persisted sync activity for this lane yet.
            </div>
          )}
        </div>
      )}

      {auditSnapshot ? (
        topFindings.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topFindings.map((check) => {
              const tone = check.status === 'error' || check.status === 'warn'
                ? colours.cta
                : check.status === 'monitor'
                  ? colours.orange
                  : colours.green;
              return (
                <div key={check.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '9px 10px', borderLeft: `3px solid ${tone}`, background: elevatedBackground }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: text }}>
                    {check.label}{check.value ? `: ${check.value}` : ''}
                  </span>
                  <span style={{ fontSize: 10, color: bodyText }}>
                    {check.description}
                  </span>
                </div>
              );
            })}
            {auditSnapshot.findings.length > topFindings.length && (
              <div style={{ fontSize: 9, color: muted }}>
                Plus {auditSnapshot.findings.length - topFindings.length} more.
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: '9px 10px', border: `1px solid ${withAlpha(colours.green, 0.22)}`, background: withAlpha(colours.green, isDarkMode ? 0.1 : 0.06), color: colours.green, fontSize: 10, fontWeight: 800 }}>
            No problems found across source, report, and saved table.
          </div>
        )
      ) : (
        <div style={{ padding: '9px 10px', border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`, background: elevatedBackground, color: muted, fontSize: 10 }}>
          Run a check to see if these numbers match.
        </div>
      )}
    </section>
  );
};

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */

const DataCentre: React.FC<DataCentreProps> = ({
  onBack,
  onRefreshAll,
  onRefreshDatasets,
  onRefreshCollected,
  isRefreshing,
  progressPercent,
  phaseLabel,
  elapsedLabel,
  datasets,
  userName,
  userInitials,
  userEmail,
  showProdAudienceBadge = false,
  isDedicatedPage = false,
  demoModeEnabled = false,
}) => {
  const { isDarkMode } = useTheme();
  const { showToast, updateToast } = useToast();
  const { setContent } = useNavigatorActions();
  const dataHubBrandAccent = isDarkMode ? colours.accent : colours.highlight;
  const dataHubHomeSurface = isDarkMode ? colours.dark.sectionBackground : withAlpha(colours.grey, 0.98);
  const dataHubHomeCardSurface = isDarkMode ? colours.dark.cardBackground : withAlpha(colours.light.cardBackground, 0.98);
  const dataHubHomeFooterSurface = isDarkMode ? colours.websiteBlue : colours.grey;
  const dataHubHomeControlSurface = isDarkMode ? withAlpha(colours.dark.cardBackground, 0.42) : withAlpha(colours.light.cardBackground, 0.82);
  const dataHubHomeHoverSurface = isDarkMode ? colours.dark.cardHover : colours.light.cardHover;
  const dataHubHomeSelectedSurface = withAlpha(dataHubBrandAccent, isDarkMode ? 0.16 : 0.09);
  const dataHubHomeBorder = isDarkMode ? withAlpha(colours.dark.borderColor, 0.38) : withAlpha(colours.greyText, 0.14);
  const dataHubHomeBodyText = isDarkMode ? '#d1d5db' : '#374151';
  const dataHubRootRef = React.useRef<HTMLDivElement | null>(null);
  type ActiveTab = 'datasets' | 'datasetDetail' | 'collected' | 'wip' | 'agedDebt' | 'people' | 'finance' | 'compliance' | 'ads';
  const datasetTargetTabs = React.useMemo<Record<ReportingDatasetKey, ActiveTab>>(() => ({
    userData: 'people',
    teamData: 'people',
    enquiries: 'people',
    allMatters: 'finance',
    wip: 'wip',
    recoveredFees: 'collected',
    annualLeave: 'compliance',
    metaMetrics: 'ads',
    googleAnalytics: 'ads',
    googleAds: 'ads',
    deals: 'people',
    instructions: 'people',
    emailLists: 'datasetDetail',
    dubberCalls: 'people',
  }), []);
  const datasetTargetLabels = React.useMemo<Record<ActiveTab, string>>(() => ({
    datasets: 'Datasets',
    datasetDetail: 'Dataset detail',
    collected: 'Collected ledger',
    wip: 'WIP ledger',
    agedDebt: 'Aged Debt',
    people: 'People',
    finance: 'Finance',
    compliance: 'Compliance',
    ads: 'Ads',
  }), []);
  const [activeOp, setActiveOp] = React.useState<ActiveTab>('datasets');
  const [selectedDatasetKey, setSelectedDatasetKey] = React.useState<ReportingDatasetKey | null>(null);
  const [mattersLedgerOpen, setMattersLedgerOpen] = React.useState(false);
  const scrollDataHubToTop = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const root = dataHubRootRef.current
        ?? document.querySelector('[data-helix-region="reports/data-hub"]')
        ?? document.querySelector('[data-helix-region="reports/data-hub/enquiries-ledger"]');
      const scrollRegion = root instanceof HTMLElement
        ? root.closest('.app-scroll-region')
        : document.querySelector('.app-scroll-region');
      if (scrollRegion instanceof HTMLElement) {
        scrollRegion.scrollTo({ top: 0, behavior: 'auto' });
        return;
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }, []);
  const handleDatasetSelect = React.useCallback((key: ReportingDatasetKey) => {
    setSelectedDatasetKey(key);
    setMattersLedgerOpen(false);
    const target = datasetTargetTabs[key] ?? 'datasetDetail';
    setActiveOp(key === 'wip' || key === 'recoveredFees' ? target : 'datasetDetail');
  }, [datasetTargetTabs]);
  const handleBackToDatasets = React.useCallback(() => {
    setActiveOp('datasets');
    setSelectedDatasetKey(null);
    setMattersLedgerOpen(false);
  }, []);
  const handleNavigatorBack = React.useCallback(() => {
    if (activeOp !== 'datasets') {
      handleBackToDatasets();
      return;
    }
    onBack();
  }, [activeOp, handleBackToDatasets, onBack]);
  const handleOpenSelectedOperationalView = React.useCallback(() => {
    if (!selectedDatasetKey) return;
    setMattersLedgerOpen(false);
    setActiveOp(datasetTargetTabs[selectedDatasetKey] ?? 'datasets');
  }, [datasetTargetTabs, selectedDatasetKey]);
  const getDatasetTargetLabel = React.useCallback((key: ReportingDatasetKey) => {
    const target = datasetTargetTabs[key] ?? 'datasetDetail';
    return key === 'wip' || key === 'recoveredFees' ? datasetTargetLabels[target] : 'Dataset detail';
  }, [datasetTargetLabels, datasetTargetTabs]);

  React.useEffect(() => {
    if (!mattersLedgerOpen) return;
    window.requestAnimationFrame(() => {
      const target = document.querySelector('[data-helix-region="reports/data-hub/matters-ledger"]');
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [mattersLedgerOpen]);

  /* ─── Navigator bar — managed by DataCentre itself ─── */
  React.useEffect(() => {
    setContent(
      <NavigatorDetailBar
        onBack={handleNavigatorBack}
        showBackButton={!isDedicatedPage || activeOp !== 'datasets'}
        backLabel={activeOp === 'datasets' ? 'Reports' : 'Data Hub'}
        staticLabel={
          activeOp === 'datasets'
            ? `Data Hub${showProdAudienceBadge ? ' · LZ/AC prod' : ''}`
            : activeOp === 'datasetDetail'
              ? `Data Hub${showProdAudienceBadge ? ' · LZ/AC prod' : ''}: ${selectedDatasetKey ? REPORTING_DATASET_BY_KEY[selectedDatasetKey]?.name ?? 'Dataset' : 'Dataset'}`
              : `Data Hub${showProdAudienceBadge ? ' · LZ/AC prod' : ''}: ${datasetTargetLabels[activeOp]}`
        }
      />,
    );
    return () => { setContent(null); };
  }, [activeOp, datasetTargetLabels, handleNavigatorBack, isDedicatedPage, selectedDatasetKey, setContent]);  // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Per-operation independent range state ─── */
  const getDefaultRangeState = (): OperationRangeState => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { preset: 'rolling7d', startDate: start, endDate: now };
  };

  const [collectedRange, setCollectedRange] = React.useState<OperationRangeState>(getDefaultRangeState);
  const [wipRange, setWipRange] = React.useState<OperationRangeState>(getDefaultRangeState);
  const [logsExpanded, setLogsExpanded] = React.useState(true);

  /* ─── Token Check State ─── */
  const [tokenCheck, setTokenCheck] = React.useState<TokenCheckResult | null>(null);
  const [tokenChecking, setTokenChecking] = React.useState(false);

  /* ─── Data Preview State ─── */
  const [previewTable, setPreviewTable] = React.useState<string | null>(null);
  const [previewContextLabel, setPreviewContextLabel] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<TablePreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [outstandingBalancesStatus, setOutstandingBalancesStatus] = React.useState<OutstandingBalancesStatus | null>(null);
  const [outstandingBalancesStatusLoading, setOutstandingBalancesStatusLoading] = React.useState(false);
  const [outstandingBalancesSyncing, setOutstandingBalancesSyncing] = React.useState(false);
  const [outstandingBalancesReconciling, setOutstandingBalancesReconciling] = React.useState(false);
  const [outstandingBalancesReconcile, setOutstandingBalancesReconcile] = React.useState<OutstandingBalancesReconcileSummary | null>(null);
  const [ga4ProviderCheck, setGa4ProviderCheck] = React.useState<Ga4ProviderCheckState>({
    status: 'idle',
    checkedAt: null,
    rowCount: null,
    startDate: null,
    endDate: null,
    source: null,
    error: null,
  });
  
  const [planData, setPlanData] = React.useState<PlanData | null>(null);
  const [isPlanning, setIsPlanning] = React.useState(false);
  const [showPlanDialog, setShowPlanDialog] = React.useState(false);
  const [planMode, setPlanMode] = React.useState<'replace' | 'delete' | 'insert'>('replace');
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  /* ─── Data Operations State ─── */
  const [opsStatus, setOpsStatus] = React.useState<DataOperationStatus | null>(null);
  const [opsLoading, setOpsLoading] = React.useState(false);
  const [syncingCollected, setSyncingCollected] = React.useState(false);
  const [syncingWip, setSyncingWip] = React.useState(false);

  const [confirmingCollected, setConfirmingCollected] = React.useState(false);
  const [confirmingWip, setConfirmingWip] = React.useState(false);
  const [collectedConfirmChecked, setCollectedConfirmChecked] = React.useState(false);
  const [wipConfirmChecked, setWipConfirmChecked] = React.useState(false);
  const [opsLog, setOpsLog] = React.useState<OperationLogEntry[]>([]);
  const [matterOpeningEvents, setMatterOpeningEvents] = React.useState<MatterOpeningActivityEntry[]>([]);
  const [opsLogLoading, setOpsLogLoading] = React.useState(false);
  const [wipWeekExclusionChecked, setWipWeekExclusionChecked] = React.useState(false);
  /* Month coverage side panel state */
const [monthAuditOp, setMonthAuditOp] = React.useState<'collectedTime' | 'wip' | 'agedDebt' | null>(null);
  const [monthAuditData, setMonthAuditData] = React.useState<MonthAuditEntry[]>([]);
  const [monthAuditLoading, setMonthAuditLoading] = React.useState(false);
  const [coverageOpen, setCoverageOpen] = React.useState(true);
  const [backfillLog, setBackfillLog] = React.useState<Array<{ key: string; ts: string; status: string; rows?: number }>>([]);
  const [selectedCoverageMonthKey, setSelectedCoverageMonthKey] = React.useState<string | null>(null);
  const [coverageVisibleCount, setCoverageVisibleCount] = React.useState(6);
  const [windowPreviewOpen, setWindowPreviewOpen] = React.useState<Record<string, boolean>>({});
  const [windowPreviewData, setWindowPreviewData] = React.useState<Record<string, TablePreview | null>>({});
  const [windowPreviewLoadingKey, setWindowPreviewLoadingKey] = React.useState<string | null>(null);

  /* ─── Data Hub lazy-load state ─── */
  const [dataHubLoaded, setDataHubLoaded] = React.useState(true);
  const readyCount = React.useMemo(() => (Array.isArray(datasets) ? datasets.filter(d => d.status === 'ready').length : 0), [datasets]);
  const totalFeeds = React.useMemo(() => (Array.isArray(datasets) ? datasets.length : 0), [datasets]);
  const isProdAudience = React.useMemo(() => {
    const initials = String(userInitials || '').trim().toUpperCase();
    return initials === 'LZ' || initials === 'AC';
  }, [userInitials]);
  const [audienceHintVisible, setAudienceHintVisible] = React.useState(false);
  const [dataHubLoading, setDataHubLoading] = React.useState(false);
  const opsLogIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const schedulerStatusIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleCoverage = React.useCallback(async (op: 'collectedTime' | 'wip' | 'agedDebt') => {
    if (coverageOpen && monthAuditOp === op) {
      // collapse
      setCoverageOpen(false);
      return;
    }
    setCoverageOpen(true);
    setMonthAuditOp(op);
    setMonthAuditLoading(true);
    setMonthAuditData([]);
    setBackfillLog([]);
    try {
      const res = await fetch(`/api/data-operations/month-audit?operation=${op}`);
      if (res.ok) {
        const data = await res.json();
        setMonthAuditData(data.months || []);
      }
    } catch (e) {
      console.warn('Month audit fetch failed:', e);
    } finally {
      setMonthAuditLoading(false);
    }
  }, [coverageOpen, monthAuditOp]);

  /* Month audit is fetched on-demand via loadDataHub — no auto-fetch on mount */

  /* Bulk backfill queue */
  const [backfillRunning, setBackfillRunning] = React.useState(false);
  const [backfillCurrent, setBackfillCurrent] = React.useState<string | null>(null);
  const [backfillDone, setBackfillDone] = React.useState<string[]>([]);
  const [backfillErrors, setBackfillErrors] = React.useState<string[]>([]);

  const syncMonthKey = React.useCallback(async (monthKey: string, op: 'collectedTime' | 'wip' | 'agedDebt') => {
    // Aged debt doesn't have a sync operation — it's natively created in the hub
    if (op === 'agedDebt') return { insertedRows: 0, skipped: true, message: 'Aged debt is hub-native — no sync needed.' };

    const start = `${monthKey}-01`;
    const [y, mon] = monthKey.split('-').map(Number);
    const lastDay = new Date(y, mon, 0).getDate();
    let end = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

    // For WIP: cap the current month at last Sunday to avoid current-week overlap
    // (Management Dashboard sources current week live from Clio API)
    if (op === 'wip') {
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (monthKey === currentMonthKey) {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
        const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - daysSinceMonday - 1);
        // Only cap if last Sunday is within this month
        if (lastSunday.getMonth() === now.getMonth()) {
          end = lastSunday.toISOString().slice(0, 10);
        } else {
          // Current week started in a new month — skip this sync entirely
          return { insertedRows: 0, skipped: true, message: 'Current week started at beginning of month — nothing to sync yet.' };
        }
      }
    }

    const endpoint = op === 'collectedTime' ? '/api/data-operations/sync-collected' : '/api/data-operations/sync-wip';

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: start, endDate: end, invokedBy: userName ?? 'backfill' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  }, [userName]);

  const backfillUncovered = React.useCallback(async () => {
    if (!monthAuditOp || backfillRunning) return;
    const uncovered = monthAuditData.filter((m) => !m.lastSync);
    if (uncovered.length === 0) return;

    setBackfillRunning(true);
    setBackfillDone([]);
    setBackfillErrors([]);
    setBackfillLog([]);

    for (const month of uncovered) {
      setBackfillCurrent(month.key);
      try {
        const result = await syncMonthKey(month.key, monthAuditOp);
        const rows = result.insertedRows ?? result.totalInserted ?? 0;
        setBackfillDone((prev) => [...prev, month.key]);
        setBackfillLog((prev) => [...prev, { key: month.key, ts: new Date().toISOString(), status: 'completed', rows }]);
        setMonthAuditData((prev) =>
          prev.map((m) =>
            m.key === month.key
              ? {
                  ...m,
                  lastSync: { ts: new Date().toISOString(), status: 'completed', insertedRows: rows },
                  syncCount: m.syncCount + 1,
                }
              : m
          )
        );
      } catch {
        setBackfillErrors((prev) => [...prev, month.key]);
        setBackfillLog((prev) => [...prev, { key: month.key, ts: new Date().toISOString(), status: 'error' }]);
      }
    }
    setBackfillCurrent(null);
    setBackfillRunning(false);
  }, [monthAuditOp, monthAuditData, backfillRunning, syncMonthKey]);

  /* Single-month backfill (one-click per row) */
  const backfillSingleMonth = React.useCallback(async (monthKey: string) => {
    if (!monthAuditOp || backfillRunning) return;
    setBackfillRunning(true);
    setBackfillCurrent(monthKey);
    setBackfillDone((prev) => prev.filter((k) => k !== monthKey));
    setBackfillErrors((prev) => prev.filter((k) => k !== monthKey));
    try {
      const result = await syncMonthKey(monthKey, monthAuditOp);
      const rows = result.insertedRows ?? result.totalInserted ?? 0;
      setBackfillDone((prev) => [...prev, monthKey]);
      setBackfillLog((prev) => [...prev, { key: monthKey, ts: new Date().toISOString(), status: 'completed', rows }]);
      setMonthAuditData((prev) =>
        prev.map((m) =>
          m.key === monthKey
            ? {
                ...m,
                lastSync: { ts: new Date().toISOString(), status: 'completed', insertedRows: rows },
                syncCount: m.syncCount + 1,
              }
            : m
        )
      );
    } catch {
      setBackfillErrors((prev) => [...prev, monthKey]);
      setBackfillLog((prev) => [...prev, { key: monthKey, ts: new Date().toISOString(), status: 'error' }]);
    }
    setBackfillCurrent(null);
    setBackfillRunning(false);
  }, [monthAuditOp, backfillRunning, syncMonthKey]);

  /* ─── Drift detector state ─── */
  const [driftCollected, setDriftCollected] = React.useState<DriftResult | null>(null);
  const [driftWip, setDriftWip] = React.useState<DriftResult | null>(null);
  const [driftLoading, setDriftLoading] = React.useState<'collected' | 'wip' | null>(null);

  const checkDrift = React.useCallback(async (op: 'collected' | 'wip') => {
    const range = op === 'collected' ? collectedRange : wipRange;
    if (!range.startDate || !range.endDate) return;
    const operation = op === 'collected' ? 'collectedTime' : 'wip';
    const start = range.startDate.toISOString().slice(0, 10);
    const end = range.endDate.toISOString().slice(0, 10);
    const setter = op === 'collected' ? setDriftCollected : setDriftWip;

    setDriftLoading(op);
    try {
      const res = await fetch(`/api/data-operations/drift?operation=${operation}&startDate=${start}&endDate=${end}`);
      if (res.ok) setter(await res.json());
    } catch (e) {
      console.warn('Drift check failed:', e);
    } finally {
      setDriftLoading(null);
    }
  }, [collectedRange, wipRange]);

  /* ─── Team breakdown state ─── */
  const [teamData, setTeamData] = React.useState<TeamMember[]>([]);
  const [teamOp, setTeamOp] = React.useState<'collected' | 'wip' | null>(null);
  const [teamLoading, setTeamLoading] = React.useState(false);

  const fetchTeamBreakdown = React.useCallback(async (op: 'collected' | 'wip') => {
    const range = op === 'collected' ? collectedRange : wipRange;
    if (!range.startDate || !range.endDate) return;
    const operation = op === 'collected' ? 'collectedTime' : 'wip';
    const start = range.startDate.toISOString().slice(0, 10);
    const end = range.endDate.toISOString().slice(0, 10);

    setTeamOp(op);
    setTeamLoading(true);
    try {
      const res = await fetch(`/api/data-operations/team-breakdown?operation=${operation}&startDate=${start}&endDate=${end}`);
      if (res.ok) {
        const data = await res.json();
        setTeamData(data.members || []);
      }
    } catch (e) {
      console.warn('Team breakdown fetch failed:', e);
    } finally {
      setTeamLoading(false);
    }
  }, [collectedRange, wipRange]);

  /* ─── Monthly totals state ─── */
  const [monthlyCollected, setMonthlyCollected] = React.useState<MonthlyTotal[]>([]);
  const [monthlyWip, setMonthlyWip] = React.useState<MonthlyTotal[]>([]);
  const [monthlyExpanded, setMonthlyExpanded] = React.useState<'collected' | 'wip' | null>(null);

  const fetchMonthlyTotals = React.useCallback(async (op: 'collected' | 'wip') => {
    const operation = op === 'collected' ? 'collectedTime' : 'wip';
    const setter = op === 'collected' ? setMonthlyCollected : setMonthlyWip;
    try {
      const res = await fetch(`/api/data-operations/monthly-totals?operation=${operation}`);
      if (res.ok) {
        const data = await res.json();
        setter(data.months || []);
      }
    } catch (e) {
      console.warn('Monthly totals fetch failed:', e);
    }
  }, []);

  /* ─── Scheduler status state ─── */
  const [schedulerStatus, setSchedulerStatus] = React.useState<SchedulerStatus | null>(null);
  const [reportingAuditRunning, setReportingAuditRunning] = React.useState(false);
  const [reportingAuditSnapshots, setReportingAuditSnapshots] = React.useState<Partial<Record<ReportingAuditScope, ReportingAuditSnapshot>>>({});

  const fetchSchedulerStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/data-operations/scheduler-status');
      if (res.ok) setSchedulerStatus(await res.json());
    } catch (e) {
      console.warn('Scheduler status fetch failed:', e);
    }
  }, []);

  // Fetch scheduler status on mount
  React.useEffect(() => {
    fetchSchedulerStatus();
    schedulerStatusIntervalRef.current = setInterval(fetchSchedulerStatus, 30_000);
    return () => {
      if (schedulerStatusIntervalRef.current) clearInterval(schedulerStatusIntervalRef.current);
    };
  }, [fetchSchedulerStatus]);

  // Auto-expand logs when a sync is in progress so user sees activity
  React.useEffect(() => {
    if (syncingCollected || syncingWip) setLogsExpanded(true);
  }, [syncingCollected, syncingWip]);

  // Auto-open coverage panel and sync to active operation card
  React.useEffect(() => {
    if (activeOp !== 'collected' && activeOp !== 'wip' && activeOp !== 'agedDebt') return;
    const opKey = activeOp === 'collected' ? 'collectedTime' as const
      : activeOp === 'agedDebt' ? 'agedDebt' as const
      : 'wip' as const;
    // Always open coverage and switch to the correct operation
    setCoverageOpen(true);
    setMonthAuditOp(opKey);
    // Fetch fresh month audit for the selected operation
    setMonthAuditLoading(true);
    setMonthAuditData([]);
    setBackfillLog([]);
    fetch(`/api/data-operations/month-audit?operation=${opKey}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setMonthAuditData(data.months || []); })
      .catch(e => console.warn('Coverage auto-fetch failed:', e))
      .finally(() => setMonthAuditLoading(false));
    // Fetch monthly totals if expanded but empty (not applicable to aged debt)
    if (activeOp !== 'agedDebt') {
      const totalsKey = activeOp;
      const totals = activeOp === 'collected' ? monthlyCollected : monthlyWip;
      if (monthlyExpanded === totalsKey && totals.length === 0) {
        fetchMonthlyTotals(totalsKey);
      }
    }
  }, [activeOp]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (activeOp !== 'collected' && activeOp !== 'wip') return;
    if (monthAuditData.length === 0) {
      setSelectedCoverageMonthKey(null);
      return;
    }

    const sortedKeys = [...monthAuditData]
      .sort((a, b) => a.key < b.key ? 1 : -1)
      .map((month) => month.key);

    setSelectedCoverageMonthKey((current) => (current && sortedKeys.includes(current) ? current : sortedKeys[0]));
  }, [activeOp, monthAuditData]);

  React.useEffect(() => {
    if ((activeOp !== 'collected' && activeOp !== 'wip') || !selectedCoverageMonthKey) return;

    const match = selectedCoverageMonthKey.match(/^(\d{4})-(\d{2})$/);
    if (!match) return;

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    const applyRange = activeOp === 'collected' ? setCollectedRange : setWipRange;
    applyRange((previous) => {
      const sameStart = previous.startDate?.getTime() === startDate.getTime();
      const sameEnd = previous.endDate?.getTime() === endDate.getTime();
      if (sameStart && sameEnd && previous.preset === 'custom') {
        return previous;
      }

      return {
        ...previous,
        preset: 'custom',
        startDate,
        endDate,
      };
    });
  }, [activeOp, selectedCoverageMonthKey]);

  /* Helpers for per-operation range */
  const applyPreset = React.useCallback((operation: 'collected' | 'wip', preset: RangePreset) => {
    if (preset === 'custom') {
      const setter = operation === 'collected' ? setCollectedRange : setWipRange;
      setter(prev => ({ ...prev, preset: 'custom' }));
      return;
    }

    const now = new Date();
    let start: Date;
    let end: Date = new Date(now);

    switch (preset) {
      case 'today':
        start = new Date(now);
        break;
      case 'yesterday': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        start = y;
        end = new Date(y);
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'rolling7d':
        start = new Date(now);
        start.setDate(start.getDate() - 7);
        break;
      case 'rolling14d':
        start = new Date(now);
        start.setDate(start.getDate() - 14);
        break;
      case 'lastWeek': {
        const dow = now.getDay() || 7; // Mon=1
        start = new Date(now);
        start.setDate(start.getDate() - dow - 6); // prev Monday
        end = new Date(start);
        end.setDate(end.getDate() + 6); // prev Sunday
        end.setHours(23, 59, 59, 999);
        break;
      }
      case 'thisMonth':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
        end.setHours(23, 59, 59, 999);
        break;
      case 'thisWeek': {
        const dow2 = now.getDay() || 7; // Mon=1
        start = new Date(now);
        start.setDate(start.getDate() - (dow2 - 1)); // this Monday
        break;
      }
      case 'ytd': {
        // UK fiscal year: Apr 1 → Mar 31
        const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        start = new Date(fy, 3, 1); // Apr 1
        break;
      }
      case 'thisYear':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'lastYear':
        start = new Date(now.getFullYear() - 1, 0, 1);
        end = new Date(now.getFullYear() - 1, 11, 31);
        end.setHours(23, 59, 59, 999);
        break;
      default:
        start = new Date(now);
        start.setDate(start.getDate() - 7);
    }

    const newState: OperationRangeState = { preset, startDate: start, endDate: end };
    if (operation === 'collected') {
      setCollectedRange(newState);
      setConfirmingCollected(false);
      setCollectedConfirmChecked(false);
    } else {
      setWipRange(newState);
      setConfirmingWip(false);
      setWipConfirmChecked(false);
    }
  }, []);

  const setCustomDates = React.useCallback((operation: 'collected' | 'wip', startDate: Date | null | undefined, endDate: Date | null | undefined) => {
    if (operation === 'collected') {
      setCollectedRange(prev => ({ ...prev, preset: 'custom', startDate, endDate }));
      setConfirmingCollected(false);
      setCollectedConfirmChecked(false);
    } else {
      setWipRange(prev => ({ ...prev, preset: 'custom', startDate, endDate }));
      setConfirmingWip(false);
      setWipConfirmChecked(false);
    }
  }, []);

  /* Check token on mount */
  React.useEffect(() => {
    const checkToken = async () => {
      setTokenChecking(true);
      try {
        const res = await fetch('/api/data-operations/check-token');
        const data = await res.json();
        setTokenCheck(data);
      } catch (e) {
        setTokenCheck({ success: false, message: String(e), durationMs: 0 });
      } finally {
        setTokenChecking(false);
      }
    };
    checkToken();
  }, []);

  /* Fetch preview data */
  const fetchPreview = React.useCallback(async (table: string, contextLabel?: string) => {
    setPreviewTable(table);
    setPreviewContextLabel(contextLabel || null);
    setPreviewLoading(true);
    setPreviewData(null);
    setSortConfig(null);
    try {
      const res = await fetch(`/api/data-operations/preview/${table}?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch (e) {
      console.warn('Failed to fetch preview:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const fetchOutstandingBalancesStatus = React.useCallback(async () => {
    setOutstandingBalancesStatusLoading(true);
    try {
      const res = await fetch('/api/outstanding-balances/status');
      if (res.ok) {
        const data = await res.json();
        setOutstandingBalancesStatus(data);
        setOutstandingBalancesReconcile(data?.lastReconcile?.summary || null);
      }
    } catch (e) {
      console.warn('Failed to fetch outstanding balances status:', e);
    } finally {
      setOutstandingBalancesStatusLoading(false);
    }
  }, []);

  const fetchWindowPreview = React.useCallback(async (monthKey: string, table: string) => {
    setWindowPreviewLoadingKey(monthKey);
    try {
      const res = await fetch(`/api/data-operations/preview/${table}?limit=20`);
      if (res.ok) {
        const data = await res.json();
        setWindowPreviewData((prev) => ({ ...prev, [monthKey]: data }));
      } else {
        setWindowPreviewData((prev) => ({ ...prev, [monthKey]: null }));
      }
    } catch (e) {
      console.warn('Failed to fetch inline window preview:', e);
      setWindowPreviewData((prev) => ({ ...prev, [monthKey]: null }));
    } finally {
      setWindowPreviewLoadingKey((current) => (current === monthKey ? null : current));
    }
  }, []);

  /* Fetch operation status on mount and after sync */
  const fetchOpsStatus = React.useCallback(async () => {
    setOpsLoading(true);
    try {
      const res = await fetch('/api/data-operations/status');
      if (res.ok) {
        const data = await res.json();
        setOpsStatus(data);
      }
    } catch (e) {
      console.warn('Failed to fetch data operations status:', e);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  /* Ops status is fetched on-demand via loadDataHub — no auto-fetch on mount */

  /* Fetch operation log (live) */
  const fetchOpsLog = React.useCallback(async () => {
    setOpsLogLoading(true);
    try {
      const [opsLogResult, persistedOpsLogResult, activityResult] = await Promise.allSettled([
        fetch('/api/data-operations/log'),
        fetch('/api/data-operations/ops-log?limit=80'),
        fetch('/api/activity-feed?limit=60'),
      ]);
      const mergedEntries: OperationLogEntry[] = [];
      if (opsLogResult.status === 'fulfilled' && opsLogResult.value.ok) {
        const data = await opsLogResult.value.json();
        if (Array.isArray(data.operations)) {
          data.operations.forEach((entry: Record<string, unknown>, index: number) => {
            const normalised = normaliseOperationLogEntry(entry, index);
            if (normalised) mergedEntries.push(normalised);
          });
        }
      }
      if (persistedOpsLogResult.status === 'fulfilled' && persistedOpsLogResult.value.ok) {
        const data = await persistedOpsLogResult.value.json();
        if (Array.isArray(data.entries)) {
          data.entries.forEach((entry: Record<string, unknown>, index: number) => {
            const normalised = normaliseOperationLogEntry(entry, index + mergedEntries.length);
            if (normalised) mergedEntries.push(normalised);
          });
        }
      }
      if (mergedEntries.length > 0 || opsLogResult.status === 'fulfilled' || persistedOpsLogResult.status === 'fulfilled') {
        const seen = new Set<string>();
        const merged = mergedEntries
          .sort((left, right) => right.ts - left.ts)
          .filter((entry) => {
            const key = `${entry.jobId || ''}:${entry.operation}:${entry.status}:${entry.ts}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 80);
        setOpsLog(merged);
      }
      if (activityResult.status === 'fulfilled' && activityResult.value.ok) {
        const data = await activityResult.value.json();
        setMatterOpeningEvents(mapMatterOpeningActivityItems(data.items));
      }
    } catch (e) {
      console.warn('Failed to fetch data operations log:', e);
    } finally {
      setOpsLogLoading(false);
    }
  }, []);

  /* Auto-load ops data on mount */
  React.useEffect(() => {
    fetchOpsStatus();
    fetchOpsLog();
    opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
    return () => {
      if (opsLogIntervalRef.current) clearInterval(opsLogIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (activeOp !== 'finance') return;
    if (outstandingBalancesStatus || outstandingBalancesStatusLoading) return;
    fetchOutstandingBalancesStatus();
  }, [activeOp, outstandingBalancesStatus, outstandingBalancesStatusLoading, fetchOutstandingBalancesStatus]);

  /* ─── Load Data Hub (user-invoked) ─── */
  const loadDataHub = React.useCallback(async () => {
    setDataHubLoading(true);
    try {
      await Promise.all([
        fetchOpsStatus(),
        fetchOpsLog(),
        fetchOutstandingBalancesStatus(),
        ...(coverageOpen && monthAuditOp
          ? [fetch(`/api/data-operations/month-audit?operation=${monthAuditOp}`)
              .then(res => res.ok ? res.json() : null)
              .then(data => { if (data) setMonthAuditData(data.months || []); })
              .catch(e => console.warn('Month audit fetch failed:', e))]
          : []),
      ]);
      // Start live polling for ops log
      if (opsLogIntervalRef.current) clearInterval(opsLogIntervalRef.current);
      opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
      setDataHubLoaded(true);
      // Auto-fetch monthly totals for the default-expanded section
      if (monthlyExpanded && monthlyCollected.length === 0 && monthlyWip.length === 0) {
        fetchMonthlyTotals(monthlyExpanded);
      }
    } finally {
      setDataHubLoading(false);
    }
  }, [fetchOpsStatus, fetchOpsLog, fetchOutstandingBalancesStatus, coverageOpen, monthAuditOp, monthlyExpanded, monthlyCollected.length, monthlyWip.length, fetchMonthlyTotals]);

  const handleOutstandingBalancesSync = React.useCallback(async () => {
    setOutstandingBalancesSyncing(true);
    const toastId = showToast({
      type: 'loading',
      title: 'Syncing Outstanding Balances',
      message: 'Refreshing the table-backed Clio snapshot.',
      persist: true,
    });

    try {
      const res = await fetch('/api/outstanding-balances/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invokedBy: userName ?? 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Sync failed');
      await fetchOutstandingBalancesStatus();
      updateToast(toastId, {
        type: 'success',
        title: 'Outstanding Balances Synced',
        message: `${(data?.rowCount || 0).toLocaleString('en-GB')} rows refreshed from Clio.`,
        persist: false,
        duration: 5000,
      });
    } catch (e) {
      updateToast(toastId, {
        type: 'error',
        title: 'Outstanding Balance Sync Failed',
        message: String(e),
        persist: false,
        duration: 6000,
      });
    } finally {
      setOutstandingBalancesSyncing(false);
    }
  }, [fetchOutstandingBalancesStatus, showToast, updateToast, userName]);

  const handleOutstandingBalancesReconcile = React.useCallback(async () => {
    setOutstandingBalancesReconciling(true);
    const toastId = showToast({
      type: 'loading',
      title: 'Reconciling Outstanding Balances',
      message: 'Comparing the saved table against live Clio balances.',
      persist: true,
    });

    try {
      const res = await fetch('/api/outstanding-balances/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invokedBy: userName ?? 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reconcile failed');
      setOutstandingBalancesReconcile(data);
      await fetchOutstandingBalancesStatus();
      updateToast(toastId, {
        type: data.status === 'match' ? 'success' : 'info',
        title: data.status === 'match' ? 'Outstanding Balances Match' : 'Outstanding Balances Drift Found',
        message: data.status === 'match'
          ? 'Saved table matches live Clio.'
          : `${data.missingCount + data.extraCount + data.changedCount} drift signals found.`,
        persist: false,
        duration: 6000,
      });
    } catch (e) {
      updateToast(toastId, {
        type: 'error',
        title: 'Outstanding Balance Reconcile Failed',
        message: String(e),
        persist: false,
        duration: 6000,
      });
    } finally {
      setOutstandingBalancesReconciling(false);
    }
  }, [fetchOutstandingBalancesStatus, showToast, updateToast, userName]);

  const runReportingAudit = React.useCallback(async (scope: ReportingAuditScope) => {
    setReportingAuditRunning(true);
    const toastId = showToast({
      type: 'loading',
      title: 'Running Reporting Audit',
      message: `Checking ${scope === 'collected' ? 'collected' : 'WIP'} data only.`,
      persist: true,
    });

    try {
      const res = await fetch('/api/data-operations/reconciliation-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, invokedBy: userName ?? 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Audit failed');

      setReportingAuditSnapshots((prev) => ({ ...prev, [scope]: data }));
      updateToast(toastId, {
        type: 'success',
        title: 'Reporting Audit Ready',
        message: data.summary.issueCount > 0
          ? `${data.scopeLabel}: ${data.summary.issueCount} issues found`
          : `${data.scopeLabel}: no issues found`,
        persist: false,
        duration: 5000,
      });
    } catch (e) {
      updateToast(toastId, {
        type: 'error',
        title: 'Reporting Audit Failed',
        message: String(e),
        persist: false,
        duration: 6000,
      });
    } finally {
      setReportingAuditRunning(false);
    }
  }, [showToast, updateToast, userName]);

  /* ─── Sync handlers for each operation ─── */
  
  const handleCollectedSync = React.useCallback(async () => {
    if (!collectedRange.startDate || !collectedRange.endDate) return;
    // Auto-activate data hub if not yet loaded
    if (!dataHubLoaded) {
      setDataHubLoaded(true);
      if (!opsLogIntervalRef.current) opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
    }
    setSyncingCollected(true);

    const payload = {
      daysBack: -1,
      startDate: collectedRange.startDate.toISOString(),
      endDate: collectedRange.endDate.toISOString(),
      dryRun: false,
      mode: planMode,
      ...(userName && { invokedBy: userName }),
    };

    const opKey = collectedRange.preset === 'today' 
      ? 'syncCollectedTimeDaily' 
      : collectedRange.preset === 'yesterday'
        ? 'syncCollectedTimeYesterday'
        : collectedRange.preset === 'lastWeek'
          ? 'syncCollectedTimeLastWeek'
          : collectedRange.preset === 'rolling7d' 
            ? 'syncCollectedTimeRolling7d'
            : collectedRange.preset === 'rolling14d'
              ? 'syncCollectedTimeRolling14d'
              : collectedRange.preset === 'thisMonth'
                ? 'syncCollectedTimeThisMonth'
                : collectedRange.preset === 'lastMonth'
                  ? 'syncCollectedTimeLastMonth'
                  : `syncCollectedTimeCustom_${collectedRange.startDate.toISOString().slice(0, 10)}`;

    // Optimistic log entry
    setOpsLog(prev => [{
      id: String(Date.now()),
      ts: Date.now(),
      operation: opKey,
      status: 'started',
      message: 'Sync initiated...'
    }, ...prev]);

    const toastId = showToast({
      type: 'loading',
      title: 'Syncing Collected Time',
      message: `Fetching payments from Clio (${PRESET_LABELS[collectedRange.preset]})…`,
      persist: true,
    });

    try {
      const res = await fetch('/api/data-operations/sync-collected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        updateToast(toastId, {
          type: 'success',
          title: 'Collected Time Synced',
          message: `+${data.insertedRows?.toLocaleString() ?? 0} rows in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`,
          persist: false,
          duration: 4000,
        });
        fetchOpsStatus();
        onRefreshCollected();
      } else {
        updateToast(toastId, {
          type: 'error',
          title: 'Collected Time Sync Failed',
          message: data.error || 'Sync failed',
          persist: false,
          duration: 6000,
        });
      }
    } catch (e) {
      updateToast(toastId, {
        type: 'error',
        title: 'Collected Time Sync Failed',
        message: String(e),
        persist: false,
        duration: 6000,
      });
    } finally {
      setSyncingCollected(false);
    }
  }, [collectedRange, planMode, fetchOpsStatus, onRefreshCollected, showToast, updateToast]);

  const handleWipSync = React.useCallback(async () => {
    if (!wipRange.startDate || !wipRange.endDate) return;
    // Auto-activate data hub if not yet loaded
    if (!dataHubLoaded) {
      setDataHubLoaded(true);
      if (!opsLogIntervalRef.current) opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
    }
    setSyncingWip(true);

    const payload = {
      startDate: wipRange.startDate.toISOString(),
      endDate: wipRange.endDate.toISOString(),
      ...(userName && { invokedBy: userName }),
    };

    const toastId = showToast({
      type: 'loading',
      title: 'Syncing Recorded Time (WIP)',
      message: `Fetching activities from Clio (${PRESET_LABELS[wipRange.preset]})…`,
      persist: true,
    });

    try {
      const res = await fetch('/api/data-operations/sync-wip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const syncMessage = data?.message
          ? String(data.message)
          : `−${data.deletedRows?.toLocaleString() ?? 0} / +${data.insertedRows?.toLocaleString() ?? 0} rows in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`;
        updateToast(toastId, {
          type: 'success',
          title: 'WIP Synced',
          message: syncMessage,
          persist: false,
          duration: 4000,
        });
        fetchOpsStatus();
        onRefreshAll();
      } else {
        updateToast(toastId, {
          type: 'error',
          title: 'WIP Sync Failed',
          message: data.error || 'Sync failed',
          persist: false,
          duration: 6000,
        });
      }
    } catch (e) {
      updateToast(toastId, {
        type: 'error',
        title: 'WIP Sync Failed',
        message: String(e),
        persist: false,
        duration: 6000,
      });
    } finally {
      setSyncingWip(false);
    }
  }, [wipRange, fetchOpsStatus, onRefreshAll]);

  const handleAbort = React.useCallback(async () => {
    try {
      await fetch('/api/data-operations/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationKey: null }),
      });
      setOpsLog(prev => [{
        id: String(Date.now()),
        ts: Date.now(),
        operation: 'abort',
        status: 'completed',
        message: 'Abort signal sent.'
      }, ...prev]);
    } catch (e) {
      showToast({ type: 'error', title: 'Abort Failed', message: String(e), duration: 5000 });
    }
  }, []);

  const isSyncBusy = syncingCollected || syncingWip || isPlanning;

  /* Helpers */
  const datasetByKey = React.useMemo(() => {
    const map = new Map<string, DatasetSummary>();
    datasets.forEach((d) => map.set(d.definition.key, d));
    return map;
  }, [datasets]);

  const getDataset = React.useCallback(
    (key: string) => datasetByKey.get(key) ?? null,
    [datasetByKey]
  );

  const runGa4ProviderCheck = React.useCallback(async () => {
    const definition = REPORTING_DATASET_BY_KEY.googleAnalytics;
    const providerCheck = definition.provider.providerCheck;
    const daysBack = providerCheck?.defaultDaysBack ?? 7;
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - daysBack);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    const params = new URLSearchParams({ startDate, endDate });

    setGa4ProviderCheck({
      status: 'loading',
      checkedAt: Date.now(),
      rowCount: null,
      startDate,
      endDate,
      source: definition.provider.sourceLabel,
      error: null,
    });

    try {
      const response = await fetch(`${providerCheck?.route ?? '/api/marketing-metrics/ga4'}?${params}`, {
        method: 'GET',
        credentials: 'include',
      });
      const payload = await response.json() as Ga4ProviderPayload;
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || `GA4 provider check failed (${response.status})`);
      }
      const rowCount = Array.isArray(payload.data) ? payload.data.length : 0;
      setGa4ProviderCheck({
        status: 'ready',
        checkedAt: Date.now(),
        rowCount,
        startDate: payload.dateRange?.start ?? startDate,
        endDate: payload.dateRange?.end ?? endDate,
        source: payload.source ?? definition.provider.sourceLabel,
        error: null,
      });
      showToast({
        type: 'success',
        title: 'GA4 provider checked',
        message: `${rowCount.toLocaleString('en-GB')} aggregate rows returned for ${daysBack} days.`,
        duration: 4500,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected GA4 provider error';
      setGa4ProviderCheck({
        status: 'error',
        checkedAt: Date.now(),
        rowCount: null,
        startDate,
        endDate,
        source: definition.provider.sourceLabel,
        error: message,
      });
      showToast({
        type: 'error',
        title: 'GA4 provider check failed',
        message,
        duration: 6500,
      });
    }
  }, [showToast]);

  const statusCount = React.useMemo(() => {
    return datasets.reduce(
      (acc, d) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<DatasetSummary['status'], number>
    );
  }, [datasets]);

  const lastUpdatedLabel = React.useMemo(() => {
    const latest = [...datasets]
      .filter((d) => d.updatedAt)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0];
    return latest?.updatedAt ? new Date(latest.updatedAt).toLocaleString('en-GB') : null;
  }, [datasets]);

  /* Status banner logic */
  const bannerVariant: 'healthy' | 'loading' | 'error' = isRefreshing
    ? 'loading'
    : (statusCount.error ?? 0) > 0
      ? 'error'
      : 'healthy';

  const bannerMessage = isRefreshing
    ? `Refreshing ${statusCount.loading ?? 0} of ${datasets.length} feeds…`
    : (statusCount.error ?? 0) > 0
      ? `${statusCount.error} feed${(statusCount.error ?? 0) > 1 ? 's' : ''} failed`
      : `All ${datasets.length} feeds healthy`;

  /* Last sync info per operation */
  const collectedLastSync = React.useMemo(() => {
    const daily = opsStatus?.collectedTime?.lastDailySync ?? null;
    const rolling = opsStatus?.collectedTime?.lastRollingSync ?? null;
    if (collectedRange.preset === 'today') return daily;
    if (collectedRange.preset === 'rolling7d') return rolling;
    if (daily && rolling) return daily.ts > rolling.ts ? daily : rolling;
    return daily || rolling || null;
  }, [opsStatus, collectedRange.preset]);

  /* Staleness badges for selector buttons */
  const getStaleness = React.useCallback((ts: number | string | null | undefined): { label: string; colour: string } | null => {
    if (!ts) return null;
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const ago = Date.now() - ms;
    const mins = Math.floor(ago / 60_000);
    const hrs = Math.floor(ago / 3_600_000);
    const days = Math.floor(ago / 86_400_000);
    const label = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : `${mins}m ago`;
    const colour = hrs >= 6 ? colours.cta : hrs >= 2 ? colours.orange : colours.green;
    return { label, colour };
  }, []);

  const collectedStaleness = React.useMemo(() => {
    const daily = opsStatus?.collectedTime?.lastDailySync;
    const rolling = opsStatus?.collectedTime?.lastRollingSync;
    const latest = daily && rolling ? (daily.ts > rolling.ts ? daily : rolling) : (daily || rolling);
    return getStaleness(latest?.ts ?? null);
  }, [opsStatus, getStaleness]);

  const wipStaleness = React.useMemo(() => getStaleness(opsStatus?.wip?.lastSync?.ts ?? null), [opsStatus, getStaleness]);

  const getMonthAge = React.useCallback((monthKey: string): number => {
    const [yearStr, monthStr] = monthKey.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return 0;
    const now = new Date();
    return Math.max(0, (now.getFullYear() - year) * 12 + ((now.getMonth() + 1) - month));
  }, []);

  const getFreshnessCue = React.useCallback((monthKey: string, lastSyncTs?: number | string) => {
    const monthAge = getMonthAge(monthKey);
    const expectedDays = monthAge <= 2 ? 7 : monthAge <= 5 ? 30 : 120;
    const isRecentWindow = monthAge <= 2;
    const isMidWindow = monthAge > 2 && monthAge <= 5;

    if (!lastSyncTs) {
      if (isRecentWindow) return { label: 'Needs sync', color: colours.cta, tint: `${colours.cta}1F` };
      if (isMidWindow) return { label: 'Check cadence', color: colours.orange, tint: `${colours.orange}1A` };
      return { label: 'Monitor', color: colours.greyText, tint: `${colours.greyText}1A` };
    }

    const syncMs = typeof lastSyncTs === 'string' ? new Date(lastSyncTs).getTime() : lastSyncTs;
    const daysSince = Math.floor((Date.now() - syncMs) / 86400000);
    if (daysSince <= Math.floor(expectedDays * 0.7)) {
      return { label: 'Fresh', color: colours.green, tint: `${colours.green}1F` };
    }
    if (daysSince <= expectedDays) {
      return { label: 'Monitor', color: colours.orange, tint: `${colours.orange}1A` };
    }
    if (isRecentWindow) {
      return { label: 'Overdue', color: colours.cta, tint: `${colours.cta}1F` };
    }
    if (isMidWindow) {
      return { label: 'Stale', color: colours.orange, tint: `${colours.orange}1A` };
    }
    return { label: 'Monitor', color: colours.greyText, tint: `${colours.greyText}1A` };
  }, [getMonthAge]);

  // Manual-only month sync: do not auto-backfill on entry.

  const coverageMonthAuditLogMap = React.useMemo(() => {
    const opToken = activeOp === 'wip' ? 'wip' : 'collected';
    const parseDateRange = (entry: OperationLogEntry): { start: string; end: string } | null => {
      if (entry.startDate && entry.endDate) {
        const start = entry.startDate.slice(0, 10);
        const end = entry.endDate.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
          return { start, end };
        }
      }

      const message = entry.message;
      if (!message) return null;
      const match = message.match(/(\d{4}-\d{2}-\d{2})\s*(?:→|->|to)\s*(\d{4}-\d{2}-\d{2})/i) || message.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
      if (!match) return null;
      return { start: match[1], end: match[2] };
    };
    const toMonthKey = (isoDate?: string | null) => {
      if (!isoDate) return null;
      const parsed = new Date(isoDate);
      if (Number.isNaN(parsed.getTime())) return null;
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
    };

    const isAutoEntry = (entry: OperationLogEntry) => {
      const operationLower = (entry.operation || '').toLowerCase();
      const messageLower = (entry.message || '').toLowerCase();
      const sourceLower = (entry.triggeredBy || entry.invokedBy || '').toLowerCase();
      return sourceLower === 'system'
        || sourceLower === 'scheduler'
        || sourceLower === 'timer'
        || sourceLower === 'auto'
        || operationLower.includes('scheduler')
        || operationLower.includes('auto')
        || messageLower.includes('auto-sync')
        || messageLower.includes('scheduler')
        || messageLower.includes('system');
    };

    const filtered = opsLog
      .filter((entry) => (entry.operation || '').toLowerCase().includes(opToken))
      .filter((entry) => {
        const operationLower = (entry.operation || '').toLowerCase();
        const sourceLower = (entry.triggeredBy || entry.invokedBy || '').toLowerCase();
        if (activeOp === 'collected') {
          return operationLower.includes('collected') || operationLower.includes('synccollectedtime') || sourceLower.includes('collected');
        }
        return operationLower.includes('wip') || operationLower.includes('syncwip') || sourceLower.includes('wip');
      });

    const monthMap = new Map<string, OperationLogEntry[]>();
    filtered.forEach((entry) => {
      let monthKey: string | null = null;
      const range = parseDateRange(entry);
      if (range) {
        const startKey = toMonthKey(range.start);
        const endKey = toMonthKey(range.end);
        monthKey = startKey && endKey && startKey === endKey ? startKey : null;
      }

      if (!monthKey) {
        const opMatch = (entry.operation || '').match(/(\d{4}-\d{2}-\d{2})/);
        monthKey = opMatch ? toMonthKey(opMatch[1]) : null;
      }

      if (!monthKey) return;

      const existing = monthMap.get(monthKey) || [];
      monthMap.set(monthKey, [...existing, entry].sort((a, b) => (b.ts || 0) - (a.ts || 0)));
    });

    return monthMap;
  }, [activeOp, opsLog]);

  const wipWillExcludeCurrentWeek = React.useMemo(() => {
    if (!wipRange.startDate || !wipRange.endDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - daysSinceMonday);
    return wipRange.endDate >= currentWeekStart;
  }, [wipRange.startDate, wipRange.endDate]);

  /* Validator operation keys */
  const collectedValidatorOp = React.useMemo(() => {
    if (collectedRange.preset === 'today') return 'syncCollectedTimeDaily';
    if (collectedRange.preset === 'yesterday') return 'syncCollectedTimeYesterday';
    if (collectedRange.preset === 'lastWeek') return 'syncCollectedTimeLastWeek';
    if (collectedRange.preset === 'rolling7d') return 'syncCollectedTimeRolling7d';
    if (collectedRange.preset === 'rolling14d') return 'syncCollectedTimeRolling14d';
    if (collectedRange.preset === 'thisMonth') return 'syncCollectedTimeThisMonth';
    if (collectedRange.preset === 'lastMonth') return 'syncCollectedTimeLastMonth';
    if (collectedRange.startDate) return `syncCollectedTimeCustom_${collectedRange.startDate.toISOString().slice(0, 10)}`;
    return 'syncCollectedTime';
  }, [collectedRange]);

  const wipValidatorOp = React.useMemo(() => {
    if (wipRange.preset === 'today') return 'syncWipDaily';
    if (wipRange.preset === 'yesterday') return 'syncWipYesterday';
    if (wipRange.preset === 'lastWeek') return 'syncWipLastWeek';
    if (wipRange.preset === 'rolling7d') return 'syncWipRolling7d';
    if (wipRange.preset === 'rolling14d') return 'syncWipRolling14d';
    if (wipRange.preset === 'thisMonth') return 'syncWipThisMonth';
    if (wipRange.preset === 'lastMonth') return 'syncWipLastMonth';
    if (wipRange.startDate) return `syncWipCustom_${wipRange.startDate.toISOString().slice(0, 10)}`;
    return 'syncWip';
  }, [wipRange]);

  /* Feed groups */
  const feedGroups = React.useMemo(
    () => [
      {
        key: 'people',
        title: 'People & enquiries',
        feeds: ['userData', 'teamData', 'enquiries', 'deals', 'instructions', 'dubberCalls'],
      },
      {
        key: 'finance',
        title: 'Matters & billing',
        feeds: ['allMatters', 'wip', 'recoveredFees'],
      },
      {
        key: 'compliance',
        title: 'Compliance & leave',
        feeds: ['annualLeave'],
      },
      {
        key: 'ads',
        title: 'Ads & traffic',
        feeds: ['metaMetrics', 'googleAnalytics', 'googleAds'],
      },
    ],
    []
  );

  const groupHealth = React.useCallback(
    (feeds: string[]): 'ok' | 'loading' | 'error' => {
      let hasError = false;
      let hasLoading = false;
      for (const key of feeds) {
        const d = getDataset(key);
        if (d?.status === 'error') hasError = true;
        if (d?.status === 'loading') hasLoading = true;
      }
      if (hasError) return 'error';
      if (hasLoading) return 'loading';
      return 'ok';
    },
    [getDataset]
  );

  const formatCount = (n: number) => n.toLocaleString('en-GB');
  const formatCurrency = (n: number) => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
  const planModeLabel = planMode === 'replace' ? 'Delete & insert' : planMode === 'delete' ? 'Delete only' : 'Insert only';
  const outstandingSyncStatus = outstandingBalancesStatus?.lastSync?.status || 'idle';
  const outstandingHealth = outstandingSyncStatus === 'error'
    ? 'error'
    : outstandingBalancesSyncing || outstandingBalancesReconciling || outstandingBalancesStatusLoading || outstandingSyncStatus === 'started'
      ? 'loading'
      : outstandingBalancesStatus
        ? 'ready'
        : 'idle';
  const outstandingFreshnessLabel = outstandingBalancesStatus?.freshnessMinutes == null
    ? 'Not yet synced'
    : outstandingBalancesStatus.freshnessMinutes === 0
      ? 'Fresh now'
      : `${outstandingBalancesStatus.freshnessMinutes} min old`;
  const outstandingLastSyncLabel = outstandingBalancesStatus?.lastSync?.completedAt
    ? new Date(outstandingBalancesStatus.lastSync.completedAt).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not yet synced';

  const getPreviewTableForDataset = React.useCallback((key: string): string | null => {
    const map: Record<string, string> = {
      collectedTime: 'collectedTime',
      wip: 'wip',
      recoveredFees: 'collectedTime',
      enquiries: 'enquiries',
      allMatters: 'matters',
      teamData: 'team',
      userData: 'team',
      annualLeave: 'annualLeave',
      deals: 'deals',
      instructions: 'instructions',
    };
    return map[key] ?? null;
  }, []);

  const selectedDatasetDefinition = selectedDatasetKey ? REPORTING_DATASET_BY_KEY[selectedDatasetKey] ?? null : null;
  const selectedDataset = selectedDatasetKey ? getDataset(selectedDatasetKey) : null;
  const selectedPreviewTable = selectedDatasetKey ? getPreviewTableForDataset(selectedDatasetKey) : null;
  const canAccessDataHubLedgers = React.useMemo(() => {
    const initials = String(userInitials || '').trim().toUpperCase();
    return initials === 'LZ' || initials === 'AC';
  }, [userInitials]);
  const selectedContextDatasets = React.useMemo(() => {
    if (!selectedDatasetDefinition?.provider.contextDatasets) return [];
    return selectedDatasetDefinition.provider.contextDatasets.map((key) => {
      const registryEntry = REPORTING_DATASET_BY_KEY[key as ReportingDatasetKey] ?? null;
      const liveDataset = getDataset(key);
      return {
        key,
        name: registryEntry?.name ?? key,
        status: liveDataset?.status ?? 'idle',
        count: liveDataset?.count ?? null,
      };
    });
  }, [getDataset, selectedDatasetDefinition]);

  const tableOnlyEnquiriesView = activeOp === 'datasetDetail'
    && selectedDatasetKey === 'enquiries'
    && canAccessDataHubLedgers;

  React.useEffect(() => {
    if (activeOp !== 'wip' && activeOp !== 'collected' && !tableOnlyEnquiriesView) return;
    scrollDataHubToTop();
  }, [activeOp, scrollDataHubToTop, tableOnlyEnquiriesView]);

  if (tableOnlyEnquiriesView) {
    return (
      <div
        ref={dataHubRootRef}
        data-helix-region="reports/data-hub/enquiries-ledger"
        style={{
          minHeight: '100vh',
          height: '100%',
          width: '100%',
          background: dataHubHomeSurface,
          color: isDarkMode ? colours.dark.text : colours.light.text,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: 0,
          margin: 0,
          gap: 0,
        }}
      >
        <EnquirySourceLedger isDarkMode={isDarkMode} presentation="fullPage" />
      </div>
    );
  }

  return (
    <div ref={dataHubRootRef} style={{ ...pageStyle(isDarkMode), position: 'relative' }}>

      {/* Status banner */}
      {bannerVariant !== 'healthy' && (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 4,
        background: bannerStyle(bannerVariant, isDarkMode).background,
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
        fontSize: 11,
        color: isDarkMode ? colours.subtleGrey : colours.greyText,
      }}>
        <span style={{ fontWeight: 600 }}>{bannerMessage}</span>
        {lastUpdatedLabel && !isRefreshing && (
          <span style={{ fontSize: 10, color: isDarkMode ? `${colours.subtleGrey}80` : `${colours.greyText}80`, marginLeft: 'auto' }}>{lastUpdatedLabel}</span>
        )}
        {!tokenChecking && tokenCheck && !tokenCheck.success && (
          <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? colours.cta : colours.cta, marginLeft: lastUpdatedLabel ? 0 : 'auto' }}>
            Token error
          </span>
        )}
      </div>
      )}

      {/* Progress bar (only during refresh) */}
      {isRefreshing && (
        <div style={progressWrapStyle}>
          <div style={progressTrackStyle(isDarkMode)}>
            <div style={progressFillStyle(isDarkMode, progressPercent)} />
          </div>
          <div style={progressLabelStyle(isDarkMode)}>
            <span>{phaseLabel ?? 'Starting…'}</span>
            <span>{elapsedLabel}</span>
          </div>
        </div>
      )}

      {activeOp === 'datasets' && (
        <div
          data-helix-region="reports/data-hub"
          style={{
            display: 'grid',
            gap: 20,
            width: '100%',
            maxWidth: 1480,
            margin: '0 auto',
          }}
        >
          <DataHubStreamsPanel
            isDarkMode={isDarkMode}
            datasets={datasets}
            schedulerStatus={schedulerStatus}
            opsLog={opsLog}
            opsLogLoading={opsLogLoading}
          />

          <DataHubAttributionWorkbench
            isDarkMode={isDarkMode}
            userInitials={userInitials}
          />

          <DataHubDatasetPicker
            isDarkMode={isDarkMode}
            datasets={datasets}
            isRefreshing={isRefreshing}
            onRefreshDatasets={onRefreshDatasets}
            onSelectDataset={handleDatasetSelect}
          />

          <AccessMatrixConnector isDarkMode={isDarkMode} surface="data-hub" compact />
        </div>
      )}

      {activeOp !== 'datasets' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleBackToDatasets}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              border: 'none',
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
              color: isDarkMode ? colours.greyText : colours.subtleGrey,
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0,
            }}
          >
            <span style={{ color: isDarkMode ? colours.accent : colours.highlight }}>Datasets</span>
            <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey }}>/</span>
            <span>{activeOp === 'datasetDetail' && selectedDatasetDefinition ? selectedDatasetDefinition.name : datasetTargetLabels[activeOp]}</span>
          </button>
        </div>
      )}

      {activeOp === 'datasetDetail' && selectedDatasetDefinition && (
        <>
          <DataHubDatasetDetail
            isDarkMode={isDarkMode}
            definition={selectedDatasetDefinition}
            liveDataset={selectedDataset}
            contextDatasets={selectedContextDatasets}
            previewTable={selectedPreviewTable}
            operationalViewLabel={selectedDatasetKey ? datasetTargetLabels[datasetTargetTabs[selectedDatasetKey]] : 'operational view'}
            isProductionInactive={Boolean(selectedDatasetDefinition.provider.devPreviewOnly) || selectedDatasetDefinition.provider.reportUsage.length === 0}
            operatorName={userName}
            operatorInitials={userInitials}
            operatorEmail={userEmail}
            demoModeEnabled={demoModeEnabled}
            schedulerStatus={schedulerStatus}
            opsLog={opsLog}
            matterOpeningEvents={matterOpeningEvents}
            mattersLedgerOpen={mattersLedgerOpen}
            onOpenMattersLedger={() => setMattersLedgerOpen(true)}
            onPreviewRows={() => {
              if (!selectedPreviewTable) return;
              fetchPreview(selectedPreviewTable, selectedDatasetDefinition.name);
            }}
            onOpenOperationalView={handleOpenSelectedOperationalView}
          />

          {selectedDatasetKey === 'enquiries' && canAccessDataHubLedgers && (
            <EnquirySourceLedger isDarkMode={isDarkMode} />
          )}

          {selectedDatasetKey === 'allMatters' && canAccessDataHubLedgers && (
            mattersLedgerOpen ? (
              <MattersSourceLedger isDarkMode={isDarkMode} />
            ) : (
              <section
                data-helix-region="reports/data-hub/matters-ledger-gate"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '12px 13px',
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                  background: reportingPanelBackground(isDarkMode, 'elevated'),
                }}
              >
                <span style={{ display: 'grid', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: isDarkMode ? '#d1d5db' : colours.subtleGrey, textTransform: 'uppercase', letterSpacing: 0 }}>
                    Matters ledger
                  </span>
                  <span style={{ fontSize: 11, color: isDarkMode ? '#d1d5db' : '#374151', lineHeight: 1.45 }}>
                    Folded on entry so the dataset page can load without fetching and painting the full matter table.
                  </span>
                </span>
                <DefaultButton
                  text="Open ledger"
                  onClick={() => setMattersLedgerOpen(true)}
                  styles={{ root: { borderRadius: 0, height: 30, fontSize: 10, fontWeight: 800 } }}
                />
              </section>
            )
          )}
        </>
      )}

      {/* ─── Data Operations (Collected / WIP) ─── */}
      {(activeOp === 'collected' || activeOp === 'wip') && (
      <section
        data-helix-region={`reports/data-hub/${activeOp}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 14,
          border: `1px solid ${dataHubHomeBorder}`,
          background: dataHubHomeSurface,
          boxShadow: reportingPanelShadow(isDarkMode),
        }}
      >
        <>
        {/* Collected fees parity check — pressure-tests SQL against Clio
            across the rolling 6-month window. Lives here (the realtime
            processing surface) above the manual sync rather than on the
            Management Dashboard, which is for management metrics only. */}
        {activeOp === 'collected' && (
          <ManagementDashboardTrustRail isDarkMode={isDarkMode} />
        )}
        {/* Scheduler status */}
        {schedulerStatus && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 9px',
            border: `1px solid ${dataHubHomeBorder}`,
            background: dataHubHomeCardSurface,
            fontSize: 9,
            fontWeight: 800,
            color: isDarkMode ? colours.greyText : colours.subtleGrey,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: schedulerStatus.enabled ? colours.green : colours.subtleGrey,
            }} />
            Scheduler {schedulerStatus.enabled ? 'active' : 'off'}
          </div>
        )}

        {/* ─── Main Layout: coverage tabs → selected month detail → reconciliation ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ─── Coverage: one-click gap fill ─── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderStyle: 'solid',
          borderWidth: '1px 1px 1px 3px',
          borderColor: `${dataHubHomeBorder} ${dataHubHomeBorder} ${dataHubHomeBorder} ${dataHubBrandAccent}`,
          background: dataHubHomeCardSurface,
          borderRadius: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: isDarkMode ? colours.dark.text : colours.light.text, textTransform: 'uppercase', letterSpacing: 0 }}>
            {activeOp === 'collected' ? 'Collected one-click fill' : 'WIP one-click fill'}
          </span>
          <span style={{ fontSize: 10, color: dataHubHomeBodyText, fontWeight: 600 }}>
            Pick a month, inspect stored rows, then write the missing window
          </span>
        </div>

        {/* ─── Coverage: month tabs + selected window detail ─── */}
        {/* Loading */}
        {monthAuditLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8 }}>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Loading coverage…</span>
          </div>
        )}

        {!monthAuditLoading && monthAuditData.length > 0 && (() => {
          const sortedMonths = [...monthAuditData].sort((a, b) => a.key < b.key ? 1 : -1);
          const visibleMonths = sortedMonths;
          const activeMonth = sortedMonths.find((month) => month.key === selectedCoverageMonthKey) ?? visibleMonths[0] ?? null;

          if (!activeMonth) return null;

          const accent = dataHubBrandAccent;
          const freshnessCue = getFreshnessCue(activeMonth.key, activeMonth.lastSync?.ts);
          const hasSynced = !!activeMonth.lastSync;
          const isError = activeMonth.lastSync?.status === 'error';
          const isStartedOnly = activeMonth.lastSync?.status === 'started';
          const isBackfilling = backfillRunning && backfillCurrent === activeMonth.key;
          const hasFailed = backfillErrors.includes(activeMonth.key);
          const syncWho = activeMonth.lastSync?.invokedBy || null;
          const syncDate = activeMonth.lastSync?.ts ? new Date(activeMonth.lastSync.ts) : null;
          const syncDateStr = syncDate
            ? syncDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : null;
          const syncRows = activeMonth.lastSync?.insertedRows;
          const tableName = monthAuditOp === 'collectedTime' ? 'collectedTime' : 'wip';
          const laneLabel = monthAuditOp === 'collectedTime' ? 'Collected' : 'WIP';
          const storedRowsLabel = activeMonth.stats
            ? `${activeMonth.stats.totalRows.toLocaleString()} stored`
            : 'No table sample yet';
          const valueLabel = activeMonth.stats && monthAuditOp === 'collectedTime'
            ? `£${activeMonth.stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            : activeMonth.stats && monthAuditOp === 'wip'
              ? `${activeMonth.stats.billableRows.toLocaleString()} billable / ${activeMonth.stats.nonBillableRows.toLocaleString()} non-billable`
              : 'Awaiting stats';
          const lastWriteLabel = syncRows != null
            ? `${syncRows.toLocaleString()} rows written`
            : hasSynced
              ? 'Write recorded'
              : 'Not written';
          const lastRunLabel = syncWho && syncDateStr ? `${syncWho} · ${syncDateStr}` : syncDateStr ? syncDateStr : 'No timestamp';
          const isPreviewOpen = windowPreviewOpen[activeMonth.key] ?? false;
          const previewForWindow = windowPreviewData[activeMonth.key] ?? null;
          const monthAuditEntries = coverageMonthAuditLogMap.get(activeMonth.key) || [];
          const fallbackAudit = monthAuditEntries.length === 0 && activeMonth.lastSync
            ? [{
                id: `${activeMonth.key}-fallback`,
                ts: new Date(activeMonth.lastSync.ts).getTime(),
                operation: monthAuditOp === 'collectedTime' ? 'syncCollectedTime' : 'syncWip',
                status: (activeMonth.lastSync.status as OperationLogEntry['status']) || 'completed',
                message: activeMonth.lastSync.message || `${activeMonth.label} coverage sync`,
              } as OperationLogEntry]
            : [];
          const visibleAuditEntries = monthAuditEntries.length > 0 ? monthAuditEntries : fallbackAudit;
          const validationEntry: OperationLogEntry | null = activeMonth.lastValidate ? {
            id: `${activeMonth.key}-validate-${activeMonth.lastValidate.ts}`,
            ts: new Date(activeMonth.lastValidate.ts).getTime(),
            operation: 'validate',
            status: (activeMonth.lastValidate.status || '').toLowerCase().includes('error') ? 'error' : 'completed',
            message: activeMonth.lastValidate.message || 'Validation completed',
            invokedBy: activeMonth.lastValidate.invokedBy,
          } : null;
          const syncSnapshotEntry: OperationLogEntry | null = activeMonth.lastSync ? {
            id: `${activeMonth.key}-sync-${activeMonth.lastSync.ts}`,
            ts: new Date(activeMonth.lastSync.ts).getTime(),
            operation: 'sync',
            status: ((activeMonth.lastSync.status as OperationLogEntry['status']) || 'completed'),
            message: activeMonth.lastSync.message || `${activeMonth.lastSync.insertedRows?.toLocaleString() ?? 0} rows synced`,
            invokedBy: activeMonth.lastSync.invokedBy,
          } : null;
          const mergedLedgerEntries = [
            ...visibleAuditEntries,
            ...(validationEntry ? [validationEntry] : []),
            ...(syncSnapshotEntry ? [syncSnapshotEntry] : []),
          ]
            .reduce((acc, entry) => {
              if (!acc.find((existing) => existing.id === entry.id)) acc.push(entry);
              return acc;
            }, [] as OperationLogEntry[])
            .sort((a, b) => (b.ts || 0) - (a.ts || 0));

          const maxVisibleTabs = sortedMonths.length > 5 ? 4 : 5;
          const leadingTabs = sortedMonths.slice(0, maxVisibleTabs);
          const activeAlreadyVisible = leadingTabs.some((month) => month.key === activeMonth.key);
          const visibleTabMonths = activeAlreadyVisible
            ? leadingTabs
            : [...sortedMonths.slice(0, Math.max(0, maxVisibleTabs - 1)), activeMonth]
                .filter((month, index, arr) => arr.findIndex((candidate) => candidate.key === month.key) === index);
          const visibleTabKeys = new Set(visibleTabMonths.map((month) => month.key));
          const overflowMonths = sortedMonths.filter((month) => !visibleTabKeys.has(month.key));
          const activeMonthInOverflow = overflowMonths.some((month) => month.key === activeMonth.key);
          const shellBorder = dataHubHomeBorder;
          const shellBackground = dataHubHomeCardSurface;
          const tabRailBackground = dataHubHomeFooterSurface;

          return (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
              border: `1px solid ${shellBorder}`,
              background: shellBackground,
              borderRadius: 0,
              boxShadow: reportingPanelShadow(isDarkMode),
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'stretch',
                width: '100%',
                background: tabRailBackground,
                borderBottom: `1px solid ${shellBorder}`,
              }}>
                {visibleTabMonths.map((month, idx) => {
                  const monthFreshness = getFreshnessCue(month.key, month.lastSync?.ts);
                  const monthSelected = month.key === activeMonth.key;
                  const monthHasStats = !!month.stats && month.stats.totalRows > 0;
                  const monthTone = dataHubBrandAccent;
                  const monthSummary = monthHasStats && monthAuditOp === 'collectedTime' && month.stats
                    ? `£${month.stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                    : monthHasStats && month.stats
                      ? `${month.stats.totalRows.toLocaleString()} rows`
                      : month.lastSync?.insertedRows != null
                        ? `${month.lastSync.insertedRows.toLocaleString()} rows`
                        : 'Not synced';

                  return (
                    <button
                      key={month.key}
                      type="button"
                      onClick={() => setSelectedCoverageMonthKey(month.key)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 4,
                        minWidth: 0,
                        flex: '1 1 0',
                        padding: monthSelected ? '9px 12px 10px' : '8px 10px 9px',
                        border: 'none',
                        borderTop: `3px solid ${monthSelected ? monthTone : withAlpha(dataHubBrandAccent, 0.24)}`,
                        borderRight: idx === visibleTabMonths.length - 1 && overflowMonths.length === 0 ? 'none' : `1px solid ${shellBorder}`,
                        borderBottom: monthSelected ? `1px solid ${shellBackground}` : `1px solid transparent`,
                        background: monthSelected
                          ? shellBackground
                          : 'transparent',
                        boxShadow: 'none',
                        transform: monthSelected ? 'translateY(1px)' : 'none',
                        cursor: 'pointer',
                        borderRadius: 0,
                        textAlign: 'left',
                        position: 'relative',
                        zIndex: monthSelected ? 2 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                        <span style={{ fontSize: monthSelected ? 11 : 10, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {month.label}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 8, color: monthFreshness.color, fontWeight: 700, textTransform: 'uppercase' }}>
                          {monthFreshness.label}
                        </span>
                      </div>
                      <div style={{ fontSize: monthSelected ? 10 : 9, color: dataHubHomeBodyText, fontWeight: 600 }}>
                        {monthSummary}
                      </div>
                    </button>
                  );
                })}

                {overflowMonths.length > 0 && (
                  <DefaultButton
                    text={activeMonthInOverflow ? activeMonth.label : 'More'}
                    menuProps={{
                      items: overflowMonths.map((month) => ({
                        key: month.key,
                        text: month.label,
                        onClick: () => setSelectedCoverageMonthKey(month.key),
                      })),
                    }}
                    styles={{
                      root: {
                        minWidth: 98,
                        height: 'auto',
                        alignSelf: 'stretch',
                        border: 'none',
                        borderTop: `3px solid ${activeMonthInOverflow ? accent : withAlpha(colours.greyText, 0.4)}`,
                        borderLeft: `1px solid ${shellBorder}`,
                        borderBottom: activeMonthInOverflow ? `1px solid ${shellBackground}` : '1px solid transparent',
                        borderRadius: 0,
                        background: activeMonthInOverflow ? shellBackground : 'transparent',
                        margin: 0,
                        padding: 0,
                        transform: activeMonthInOverflow ? 'translateY(1px)' : 'none',
                      },
                      rootHovered: {
                        background: activeMonthInOverflow ? shellBackground : dataHubHomeHoverSurface,
                      },
                      rootPressed: {
                        background: activeMonthInOverflow ? shellBackground : dataHubHomeSelectedSurface,
                      },
                      flexContainer: {
                        height: '100%',
                        padding: '8px 10px 9px',
                        alignItems: 'center',
                      },
                      label: {
                        fontSize: 10,
                        fontWeight: 700,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                      },
                      menuIcon: {
                        color: activeMonthInOverflow ? accent : (isDarkMode ? colours.greyText : colours.subtleGrey),
                        fontSize: 10,
                      },
                    }}
                  />
                )}
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '12px 14px',
                background: shellBackground,
                borderRadius: 0,
                position: 'relative',
                zIndex: 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                    {activeMonth.label}
                  </span>
                  <span style={{
                    fontSize: 8,
                    fontWeight: 700,
                    color: freshnessCue.color,
                    background: freshnessCue.tint,
                    border: `1px solid ${withAlpha(freshnessCue.color, 0.25)}`,
                    padding: '1px 6px',
                    textTransform: 'uppercase',
                  }}>
                    {freshnessCue.label}
                  </span>
                  {activeMonth.currentWeekExcluded && (
                    <span style={{ fontSize: 9, color: colours.orange }}>
                      Current week stays live
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                    {mergedLedgerEntries.length} event{mergedLedgerEntries.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 6 }}>
                  {[
                    { label: 'Lane', value: laneLabel, tone: accent },
                    { label: 'Stored rows', value: storedRowsLabel, tone: activeMonth.stats ? colours.green : (isDarkMode ? colours.greyText : colours.subtleGrey) },
                    { label: monthAuditOp === 'collectedTime' ? 'Value' : 'Split', value: valueLabel, tone: activeMonth.stats ? accent : (isDarkMode ? colours.greyText : colours.subtleGrey) },
                    { label: 'Last write', value: lastWriteLabel, tone: hasSynced ? colours.green : colours.orange },
                    { label: 'Run', value: lastRunLabel, tone: syncWho ? colours.cta : (isDarkMode ? colours.greyText : colours.subtleGrey) },
                  ].map((item) => (
                    <span
                      key={`${activeMonth.key}-${item.label}`}
                      style={{
                        display: 'grid',
                        gap: 2,
                        padding: '7px 9px',
                        borderStyle: 'solid',
                        borderWidth: '1px 1px 1px 2px',
                        borderColor: `${dataHubHomeBorder} ${dataHubHomeBorder} ${dataHubHomeBorder} ${item.tone}`,
                        background: dataHubHomeControlSurface,
                      }}
                    >
                      <span style={{ fontSize: 8, fontWeight: 900, color: isDarkMode ? colours.greyText : colours.subtleGrey, textTransform: 'uppercase' }}>{item.label}</span>
                      <span style={{ fontSize: 10, fontWeight: 850, color: item.tone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</span>
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      const nextOpen = !isPreviewOpen;
                      setWindowPreviewOpen((prev) => ({ ...prev, [activeMonth.key]: nextOpen }));
                      if (nextOpen && !previewForWindow && windowPreviewLoadingKey !== activeMonth.key) {
                        void fetchWindowPreview(activeMonth.key, tableName);
                      }
                    }}
                    style={{
                      border: `1px solid ${dataHubHomeBorder}`,
                      background: dataHubHomeControlSurface,
                      color: dataHubHomeBodyText,
                      fontSize: 9,
                      fontWeight: 800,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      borderRadius: 0,
                    }}
                  >
                    {isPreviewOpen ? 'Hide stored rows' : 'Preview stored rows'}
                  </button>
                  {isBackfilling ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                      <Spinner size={SpinnerSize.xSmall} />
                      Syncing {activeMonth.label}…
                    </div>
                  ) : hasFailed ? (
                    <span style={{ fontSize: 9, color: colours.cta }}>Last sync failed</span>
                  ) : (
                    <button
                      onClick={() => backfillSingleMonth(activeMonth.key)}
                      disabled={backfillRunning}
                      style={{
                        border: 'none',
                        background: accent,
                        color: colours.light.sectionBackground,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '6px 10px',
                        cursor: backfillRunning ? 'not-allowed' : 'pointer',
                        borderRadius: 0,
                        opacity: backfillRunning ? 0.4 : 1,
                      }}
                    >
                      {hasSynced ? 'Run month again' : 'Fill missing month'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {mergedLedgerEntries.length === 0 ? (
                    <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                      No ledger events for this month window.
                    </span>
                  ) : (
                    mergedLedgerEntries.map((entry) => {
                      const operationLower = (entry.operation || '').toLowerCase();
                      const messageLower = (entry.message || '').toLowerCase();
                      const sourceLower = (entry.triggeredBy || entry.invokedBy || '').toLowerCase();
                      const isAuto = sourceLower === 'system' || sourceLower === 'scheduler' || sourceLower === 'timer' || sourceLower === 'auto' || operationLower.includes('scheduler') || operationLower.includes('auto') || messageLower.includes('auto-sync') || messageLower.includes('scheduler') || messageLower.includes('system');
                      const statusColor = entry.status === 'completed'
                        ? colours.green
                        : entry.status === 'error'
                          ? colours.cta
                          : entry.status === 'started'
                            ? colours.orange
                            : (isDarkMode ? colours.subtleGrey : colours.greyText);
                      const statusLabel = entry.status === 'progress' ? 'started' : entry.status;
                      const eventType = operationLower.includes('validate') || messageLower.includes('validate')
                        ? 'CHECK'
                        : operationLower.includes('sync')
                          ? 'SYNC'
                          : 'AUDIT';

                      return (
                        <div key={entry.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 8,
                          padding: '6px 8px',
                          border: `1px solid ${dataHubHomeBorder}`,
                          background: dataHubHomeControlSurface,
                          borderRadius: 0,
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                          <span style={{ color: statusColor, fontWeight: 700, textTransform: 'uppercase', minWidth: 48 }}>
                            {statusLabel}
                          </span>
                          <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText, fontWeight: 700, textTransform: 'uppercase', minWidth: 44 }}>
                            {eventType}
                          </span>
                          <span style={{ color: isAuto ? dataHubBrandAccent : colours.cta, fontWeight: 700, textTransform: 'uppercase', minWidth: 48 }}>
                            {isAuto ? 'SYSTEM' : 'USER'}
                          </span>
                          <span
                            title={entry.message || entry.operation}
                            style={{ color: dataHubHomeBodyText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}
                          >
                            {humaniseMessage(entry.message) || entry.operation}
                          </span>
                          <span style={{ marginLeft: 'auto', color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                            {new Date(entry.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {isPreviewOpen && (
                  <div style={{
                    marginTop: 2,
                    border: `1px solid ${dataHubHomeBorder}`,
                    borderRadius: 0,
                    background: dataHubHomeControlSurface,
                    padding: '8px 10px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                        Table sample · {tableName}
                      </span>
                      <span style={{ fontSize: 8, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        first 20 rows
                      </span>
                    </div>

                    {windowPreviewLoadingKey === activeMonth.key ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        <Spinner size={SpinnerSize.xSmall} />
                        Loading table sample…
                      </div>
                    ) : previewForWindow && previewForWindow.rows.length > 0 ? (
                      <div style={{ overflowX: 'auto' as const }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
                          <thead>
                            <tr>
                              {previewForWindow.columns.slice(0, 6).map((col) => (
                                <th key={col} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${dataHubHomeBorder}`, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontWeight: 700 }}>
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewForWindow.rows.slice(0, 8).map((row, rowIdx) => (
                              <tr key={rowIdx}>
                                {previewForWindow.columns.slice(0, 6).map((col) => (
                                  <td key={col} style={{ padding: '4px 6px', borderBottom: `1px solid ${dataHubHomeBorder}`, color: dataHubHomeBodyText, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String((row as Record<string, unknown>)[col] ?? '—')}>
                                    {String((row as Record<string, unknown>)[col] ?? '—')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                        No sample rows available for this table.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Empty state */}
        {!monthAuditLoading && monthAuditData.length === 0 && (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            No coverage data.
          </div>
        )}

        {/* Backfill controls */}
        {!monthAuditLoading && monthAuditData.some((m) => !m.lastSync) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${dataHubHomeBorder}`, paddingTop: 8 }}>
            {backfillRunning ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Spinner size={SpinnerSize.xSmall} />
                <span style={{ fontSize: 9, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                  {backfillCurrent ?? '…'} — {backfillDone.length}/{monthAuditData.filter((m) => !m.lastSync || backfillDone.includes(m.key)).length}
                </span>
              </div>
            ) : (
              <button
                onClick={backfillUncovered}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  padding: '5px 8px',
                  background: dataHubHomeSelectedSurface,
                  border: `1px solid ${withAlpha(dataHubBrandAccent, isDarkMode ? 0.34 : 0.28)}`,
                  borderRadius: 0,
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 600,
                  color: dataHubBrandAccent,
                  width: '100%',
                }}
              >
                <FontIcon iconName="Sync" style={{ fontSize: 9 }} />
                Backfill {monthAuditData.filter((m) => !m.lastSync).length} uncovered
              </button>
            )}
            {!backfillRunning && backfillDone.length > 0 && backfillErrors.length === 0 && (
              <span style={{ fontSize: 8, color: colours.green, textAlign: 'center' }}>
                ✓ {backfillDone.length} months done
              </span>
            )}
          </div>
        )}

          </div>{/* end main layout */}

          {(() => {
            if (activeOp !== 'collected' && activeOp !== 'wip') return null;

            const reconciliationScope = activeOp as ReportingAuditScope;
            return (
              <DataHubReconciliationPanel
                isDarkMode={isDarkMode}
                scope={reconciliationScope}
                opsStatus={opsStatus}
                schedulerStatus={schedulerStatus}
                auditSnapshot={reportingAuditSnapshots[reconciliationScope] ?? null}
                reportingAuditRunning={reportingAuditRunning}
                range={reconciliationScope === 'collected' ? collectedRange : wipRange}
                onRunAudit={runReportingAudit}
              />
            );
          })()}
        </>
      </section>
      )}

      {/* ─── Feed Group Pages ─── */}

      {/* ─── Aged Debt Coverage ─── */}
      {activeOp === 'agedDebt' && (
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
          background: isDarkMode ? 'rgba(15,23,42,0.2)' : 'rgba(248,250,252,0.6)',
          borderRadius: 2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text }}>
            Aged Debt Ledger
          </span>
          <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            Transaction intake &amp; aged debt coverage by month
          </span>
        </div>

        {/* Loading */}
        {monthAuditLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8 }}>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Loading coverage…</span>
          </div>
        )}

        {/* Empty state */}
        {!monthAuditLoading && monthAuditData.length > 0 && monthAuditData.every(m => !m.stats) && (
          <div style={{
            padding: '16px 12px',
            textAlign: 'center',
            fontSize: 12,
            color: isDarkMode ? colours.greyText : colours.subtleGrey,
          }}>
            No transactions recorded yet. Use Transaction Intake to record inbound payments.
          </div>
        )}

        {/* Month grid */}
        {!monthAuditLoading && monthAuditData.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...monthAuditData]
              .sort((a, b) => a.key < b.key ? 1 : -1)
              .slice(0, coverageVisibleCount)
              .map((m, idx) => {
                const stats = m.stats as any;
                const hasData = !!stats && stats.totalRows > 0;
                const stripe = idx % 2 === 0;
                const accent = colours.orange;
                const freshnessCue = getFreshnessCue(m.key, m.lastSync?.ts);

                return (
                  <div
                    key={m.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      padding: '8px 10px',
                      background: stripe
                        ? (isDarkMode ? 'rgba(15,23,42,0.35)' : 'rgba(248,250,252,0.5)')
                        : 'transparent',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}`,
                      borderRadius: 2,
                    }}
                  >
                    {/* Row 1: Month label + freshness + total value */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: !hasData ? (isDarkMode ? colours.dark.border : '#d1d5db')
                          : freshnessCue.color,
                        flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 700, minWidth: 52,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                      }}>
                        {m.label}
                      </span>

                      {hasData && (
                        <>
                          <span style={{
                            fontSize: 10, fontWeight: 600,
                            color: accent,
                          }}>
                            £{stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span style={{
                            fontSize: 9,
                            color: isDarkMode ? colours.greyText : colours.subtleGrey,
                            marginLeft: 'auto',
                          }}>
                            {stats.totalRows} txn{stats.totalRows !== 1 ? 's' : ''}
                          </span>
                        </>
                      )}

                      {!hasData && (
                        <span style={{
                          fontSize: 9, fontStyle: 'italic',
                          color: isDarkMode ? `${colours.subtleGrey}88` : `${colours.greyText}88`,
                        }}>
                          No transactions
                        </span>
                      )}
                    </div>

                    {/* Row 2: Status breakdown chips */}
                    {hasData && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 12 }}>
                        {stats.pendingCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px',
                            background: isDarkMode ? 'rgba(255,140,0,0.15)' : 'rgba(255,140,0,0.1)',
                            color: colours.orange, borderRadius: 2,
                          }}>
                            {stats.pendingCount} pending
                          </span>
                        )}
                        {stats.approvedCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px',
                            background: isDarkMode ? 'rgba(32,178,108,0.15)' : 'rgba(32,178,108,0.1)',
                            color: colours.green, borderRadius: 2,
                          }}>
                            {stats.approvedCount} approved
                          </span>
                        )}
                        {stats.leftCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px',
                            background: isDarkMode ? 'rgba(160,160,160,0.15)' : 'rgba(160,160,160,0.1)',
                            color: colours.subtleGrey, borderRadius: 2,
                          }}>
                            {stats.leftCount} left in client
                          </span>
                        )}
                        {stats.rejectedCount > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 600, padding: '1px 6px',
                            background: isDarkMode ? 'rgba(214,85,65,0.15)' : 'rgba(214,85,65,0.1)',
                            color: colours.cta, borderRadius: 2,
                          }}>
                            {stats.rejectedCount} rejected
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Show more / less */}
            {monthAuditData.filter(m => !!m.stats).length > coverageVisibleCount && (
              <button
                onClick={() => setCoverageVisibleCount(prev => prev + 6)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 9, fontWeight: 600, padding: '4px 0',
                  color: isDarkMode ? colours.accent : colours.highlight,
                }}
              >
                Show more months…
              </button>
            )}
          </div>
        )}
      </section>
      )}

      {/* ─── Feed Group Pages (continued) ─── */}
      {(activeOp === 'people' || activeOp === 'finance' || activeOp === 'compliance' || activeOp === 'ads') && (() => {
        const group = feedGroups.find(g => g.key === activeOp);
        if (!group) return null;
        return (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Group header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 3,
                  height: 16,
                  borderRadius: 1,
                  background: isDarkMode ? colours.accent : colours.highlight,
                }} />
                <span style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                }}>
                  {group.title}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: groupHealth(group.feeds) === 'ok'
                    ? colours.green
                    : groupHealth(group.feeds) === 'loading'
                      ? colours.blue
                      : colours.cta,
                }} />
                <span style={{
                  fontSize: 10,
                  fontWeight: 500,
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                }}>
                  {groupHealth(group.feeds) === 'ok' ? 'Healthy' : groupHealth(group.feeds) === 'loading' ? 'Loading' : 'Error'}
                </span>
              </div>
            </div>

            {/* Feed cards grid */}
            {activeOp === 'ads' && (
              <GoogleAnalyticsProviderPanel
                isDarkMode={isDarkMode}
                googleAnalytics={getDataset('googleAnalytics')}
                ga4ProviderCheck={ga4ProviderCheck}
                onRunProviderCheck={runGa4ProviderCheck}
                getDataset={getDataset}
              />
            )}

            {activeOp === 'finance' && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 12,
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: '18px 18px 16px',
                  background: reportingPanelBackground(isDarkMode, 'base'),
                  border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                  borderRadius: 0,
                  boxShadow: reportingPanelShadow(isDarkMode),
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={statusDotStyle(outstandingHealth === 'error' ? 'error' : outstandingHealth === 'loading' ? 'loading' : outstandingHealth === 'ready' ? 'ready' : 'idle')} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                          Outstanding balances
                        </span>
                        <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                          Table-backed Clio snapshot for Home and matter reads
                        </span>
                      </div>
                    </div>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: outstandingBalancesStatus?.isStale ? colours.orange : (isDarkMode ? colours.greyText : colours.subtleGrey),
                    }}>
                      {outstandingBalancesStatus?.isStale ? 'Stale' : 'Current'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 26, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, letterSpacing: '-0.02em' }}>
                        {outstandingBalancesStatus ? formatCount(outstandingBalancesStatus.rowCount) : '—'}
                      </span>
                      <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        materialised rows
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: 22, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, letterSpacing: '-0.02em' }}>
                        {outstandingBalancesStatus ? formatCurrency(outstandingBalancesStatus.totalBalance) : '—'}
                      </span>
                      <span style={{ fontSize: 11, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        total outstanding
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 8,
                    fontSize: 10,
                    color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Last sync</div>
                      <div>{outstandingLastSyncLabel}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Freshness</div>
                      <div>{outstandingFreshnessLabel}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Sync state</div>
                      <div>{outstandingSyncStatus}</div>
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>Last reconcile</div>
                      <div>
                        {outstandingBalancesStatus?.lastReconcile?.checkedAt
                          ? new Date(outstandingBalancesStatus.lastReconcile.checkedAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Not yet run'}
                      </div>
                    </div>
                  </div>

                  {outstandingBalancesStatus?.lastSync?.error && (
                    <div style={{
                      padding: '8px 10px',
                      fontSize: 10,
                      lineHeight: 1.5,
                      color: colours.cta,
                      background: isDarkMode ? 'rgba(214,85,65,0.08)' : 'rgba(214,85,65,0.05)',
                      border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.18)' : 'rgba(214,85,65,0.12)'}`,
                    }}>
                      {humaniseMessage(outstandingBalancesStatus.lastSync.error)}
                    </div>
                  )}

                  {(outstandingBalancesReconcile || outstandingBalancesStatus?.lastReconcile?.summary) && (() => {
                    const reconcileSummary = outstandingBalancesReconcile || outstandingBalancesStatus?.lastReconcile?.summary;
                    if (!reconcileSummary) return null;
                    return (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '10px 12px',
                        background: isDarkMode ? 'rgba(54,144,206,0.08)' : 'rgba(54,144,206,0.05)',
                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.12)'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                            Reconcile snapshot
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: reconcileSummary.status === 'match' ? colours.green : colours.orange }}>
                            {reconcileSummary.status === 'match' ? 'Match' : 'Drift'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          <span>Missing {reconcileSummary.missingCount}</span>
                          <span>Extra {reconcileSummary.extraCount}</span>
                          <span>Changed {reconcileSummary.changedCount}</span>
                        </div>
                        <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                          Table {formatCurrency(reconcileSummary.tableTotal)} vs live {formatCurrency(reconcileSummary.liveTotal)}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={handleOutstandingBalancesSync}
                      disabled={outstandingBalancesSyncing}
                      style={{
                        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.45)' : 'rgba(54,144,206,0.35)'}`,
                        background: isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.08)',
                        color: isDarkMode ? colours.dark.text : colours.helixBlue,
                        padding: '6px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: outstandingBalancesSyncing ? 'default' : 'pointer',
                        opacity: outstandingBalancesSyncing ? 0.7 : 1,
                      }}
                    >
                      {outstandingBalancesSyncing ? 'Syncing…' : 'Sync now'}
                    </button>
                    <button
                      onClick={handleOutstandingBalancesReconcile}
                      disabled={outstandingBalancesReconciling}
                      style={{
                        border: `1px solid ${withAlpha(colours.highlight, isDarkMode ? 0.35 : 0.25)}`,
                        background: 'transparent',
                        color: isDarkMode ? colours.accent : colours.highlight,
                        padding: '6px 10px',
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: outstandingBalancesReconciling ? 'default' : 'pointer',
                        opacity: outstandingBalancesReconciling ? 0.7 : 1,
                      }}
                    >
                      {outstandingBalancesReconciling ? 'Reconciling…' : 'Reconcile'}
                    </button>
                    <button
                      onClick={() => fetchPreview('outstandingBalancesCurrent', 'Outstanding balances')}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: isDarkMode ? colours.accent : colours.highlight,
                        padding: 0,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Preview rows
                    </button>
                  </div>

                  <OutstandingMatterExplorer formatCurrency={formatCurrency} />
                </div>
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}>
              {group.feeds.map((feedKey) => {
                const ds = getDataset(feedKey);
                const previewTable = getPreviewTableForDataset(feedKey);
                return (
                  <div
                    key={feedKey}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '16px 18px',
                      background: reportingPanelBackground(isDarkMode, 'base'),
                      border: `1px solid ${reportingPanelBorder(isDarkMode, 'base')}`,
                      borderRadius: 0,
                      boxShadow: reportingPanelShadow(isDarkMode),
                    }}
                  >
                    {/* Card header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={statusDotStyle(ds?.status ?? 'idle')} />
                        <span style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isDarkMode ? colours.dark.text : colours.light.text,
                        }}>
                          {ds?.definition.name ?? feedKey}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 9,
                        fontWeight: 500,
                        color: isDarkMode ? colours.greyText : colours.subtleGrey,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}>
                        {ds?.status ?? 'idle'}
                      </span>
                    </div>

                    {/* Stats row */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                    }}>
                      <span style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: isDarkMode ? colours.dark.text : colours.light.text,
                        letterSpacing: '-0.02em',
                      }}>
                        {ds?.count != null ? ds.count.toLocaleString() : '—'}
                      </span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 400,
                        color: isDarkMode ? colours.greyText : colours.subtleGrey,
                      }}>
                        rows
                      </span>
                      {ds?.cached && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 500,
                          color: isDarkMode ? colours.greyText : colours.subtleGrey,
                          marginLeft: 'auto',
                          opacity: 0.7,
                        }}>
                          cached
                        </span>
                      )}
                    </div>

                    {/* Updated at */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: isDarkMode ? colours.subtleGrey : colours.greyText,
                    }}>
                      <span>
                        {ds?.updatedAt
                          ? new Date(ds.updatedAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Not yet loaded'}
                      </span>
                      {previewTable && (
                        <button
                          onClick={() => fetchPreview(previewTable, ds?.definition.name ?? feedKey)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 10,
                            fontWeight: 600,
                            color: isDarkMode ? colours.accent : colours.highlight,
                          }}
                        >
                          Preview
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Data Preview Modal */}
      <Modal
        isOpen={previewTable !== null}
        onDismiss={() => {
          setPreviewTable(null);
          setPreviewContextLabel(null);
          setPreviewData(null);
          setSortConfig(null);
        }}
        isBlocking={false}
        styles={{
          main: {
            borderRadius: 16,
            padding: 0,
            maxWidth: '90vw',
            maxHeight: '85vh',
            background: isDarkMode ? colours.dark.sectionBackground : colours.light.cardBackground,
            border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.15)' : 'rgba(6, 23, 51, 0.08)'}`,
            boxShadow: isDarkMode
              ? '0 25px 50px rgba(0, 0, 0, 0.5)'
              : '0 25px 50px rgba(15, 23, 42, 0.15)',
          },
        }}
      >
        <div style={{ padding: 24, minWidth: 600 }}>
          {/* Modal header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: isDarkMode ? colours.dark.text : colours.light.text,
                }}
              >
                {previewTable} preview
              </h3>
              <span style={feedMetaStyle(isDarkMode)}>
                {previewData?.rowCount != null
                  ? `${previewData.rowCount.toLocaleString()} total rows • showing first 50`
                  : 'Loading…'}
              </span>
            </div>
            <DefaultButton
              text="Close"
              onClick={() => {
                setPreviewTable(null);
                setPreviewContextLabel(null);
                setPreviewData(null);
              }}
              styles={{
                root: {
                  borderRadius: 6,
                  height: 32,
                  padding: '0 14px',
                  fontWeight: 600,
                  fontSize: 11,
                  border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(75, 85, 99, 0.15)'}`,
                  background: 'transparent',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                },
              }}
            />
          </div>

          {/* Loading state */}
          {previewLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20 }}>
              <Spinner size={SpinnerSize.medium} />
              <span style={{ color: isDarkMode ? colours.subtleGrey : colours.greyText }}>Loading data…</span>
            </div>
          )}

          {/* Data table */}
          {!previewLoading && previewData && previewData.rows.length > 0 && (
            <div
              style={{
                maxHeight: 'calc(85vh - 140px)',
                overflowX: 'auto',
                overflowY: 'auto',
                borderRadius: 8,
                border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 11,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.95)',
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    {previewData.columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => {
                          let direction: 'asc' | 'desc' = 'asc';
                          if (sortConfig && sortConfig.key === col && sortConfig.direction === 'asc') {
                            direction = 'desc';
                          }
                          setSortConfig({ key: col, direction });
                        }}
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          fontWeight: 700,
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {col}
                          {sortConfig?.key === col && (
                            <FontIcon
                              iconName={sortConfig.direction === 'asc' ? 'ChevronUp' : 'ChevronDown'}
                              style={{ fontSize: 10 }}
                            />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...previewData.rows]
                    .sort((a, b) => {
                      if (!sortConfig) return 0;
                      const valA = a[sortConfig.key];
                      const valB = b[sortConfig.key];
                      if (valA == null && valB == null) return 0;
                      if (valA == null) return 1;
                      if (valB == null) return -1;
                      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                      return 0;
                    })
                    .map((row, i) => (
                      <tr
                        key={i}
                        style={{
                          background:
                            i % 2 === 0
                              ? 'transparent'
                              : isDarkMode
                                ? 'rgba(30, 41, 59, 0.3)'
                                : 'rgba(248, 250, 252, 0.6)',
                        }}
                      >
                        {previewData.columns.map((col) => (
                          <td
                            key={col}
                            style={{
                              padding: '8px 12px',
                              borderBottom: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.05)' : 'rgba(15, 23, 42, 0.03)'}`,
                              color: isDarkMode ? colours.dark.text : colours.light.text,
                              maxWidth: 250,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={String(row[col] ?? '')}
                          >
                            {row[col] == null ? (
                              <span style={{ color: isDarkMode ? colours.greyText : colours.highlightNeutral }}>null</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!previewLoading && previewData && previewData.rows.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: isDarkMode ? colours.greyText : colours.subtleGrey,
              }}
            >
              No rows in this table
            </div>
          )}
        </div>
      </Modal>

      {/* Plan Dialog */}
      <Dialog
        hidden={!showPlanDialog}
        onDismiss={() => setShowPlanDialog(false)}
        dialogContentProps={{
          type: DialogType.normal,
          title: 'Confirm Sync Plan',
          subText: planData ? planData.message : 'Please confirm operation.',
        }}
        modalProps={{
          isBlocking: true,
          styles: { main: { maxWidth: 450 } },
        }}
      >
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Action</div>
          <ChoiceGroup
            selectedKey={planMode}
            onChange={(_, option) => option?.key && setPlanMode(option.key as 'replace' | 'delete' | 'insert')}
            options={[
              { key: 'replace', text: 'Delete & insert (replace)' },
              { key: 'delete', text: 'Delete only' },
              { key: 'insert', text: 'Insert only' },
            ]}
            styles={{
              flexContainer: { display: 'flex', gap: 12, flexWrap: 'wrap' },
              root: { marginBottom: 6 },
              label: { fontSize: 12 },
            }}
          />
        </div>
        <div style={{ margin: '10px 0', fontSize: 13, background: isDarkMode ? 'rgba(0,0,0,0.2)' : '#f3f4f6', padding: 10, borderRadius: 4 }}>
          {planData && (
             <>
               <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                 <span>Action:</span>
                 <strong>{planModeLabel}</strong>
               </div>
               {planMode !== 'delete' && (
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                   <span>Records in Clio (found):</span>
                   <strong>{planData.rowsToInsert.toLocaleString()}</strong>
                 </div>
               )}
               {planMode !== 'insert' && (
                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                   <span>Records in SQL to Replace:</span>
                   <strong>{planData.rowsToDelete.toLocaleString()}</strong>
                 </div>
               )}
               <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                 {planMode === 'delete'
                   ? `This will permanently delete all collected time records for ${planData.startDate} to ${planData.endDate}.`
                   : planMode === 'insert'
                     ? `This will insert new collected time records from Clio for ${planData.startDate} to ${planData.endDate}.`
                     : `This will permanently delete all collected time records for ${planData.startDate} to ${planData.endDate} and replace them with fresh data from Clio.`}
               </div>
             </>
          )}
        </div>
        <DialogFooter>
          <PrimaryButton onClick={() => { setShowPlanDialog(false); handleCollectedSync(); }} text="Confirm & Execute" />
          <DefaultButton onClick={() => setShowPlanDialog(false)} text="Cancel" />
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default React.memo(DataCentre);
