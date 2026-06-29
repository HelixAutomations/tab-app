import React from 'react';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  type ReportingLiveDatasetSummary,
} from '../reportingDatasets';
import './DataHubStreamsPanel.css';

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
  deletedRows?: number;
  insertedRows?: number;
  changedRows?: number;
  durationMs?: number;
  message?: string;
  dataset?: string;
  datasetLabel?: string;
  datasetSummary?: string;
  datasets?: string[];
  datasetLabels?: string[];
  datasetCount?: number;
  target?: string;
};

type SchedulerRecentRun = {
  id: string;
  ts: number;
  entity: 'wip' | 'collected' | 'matters' | string;
  operation?: string;
  status: string;
  triggeredBy?: string | null;
  modeLabel?: string;
  invokedBy?: string | null;
  windowLabel?: string;
  resultLabel?: string | null;
  durationMs?: number | null;
  deletedRows?: number | null;
  insertedRows?: number | null;
  message?: string | null;
};

type SchedulerTierInfo = {
  lastRun: { ts: number; status: string; message?: string | null } | null;
  schedule: string;
};

type SchedulerStatus = {
  tiers?: {
    collected?: {
      currentHourly?: SchedulerTierInfo;
      previousSeal?: SchedulerTierInfo;
    };
    wip?: {
      currentHourly?: SchedulerTierInfo;
      previousSeal?: SchedulerTierInfo;
    };
    matters?: {
      migrationCurrentMonth?: SchedulerTierInfo;
      previousSeal?: SchedulerTierInfo;
    };
  };
  recentRuns: SchedulerRecentRun[];
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

type DataHubStreamsPanelProps = {
  isDarkMode: boolean;
  datasets: ReportingLiveDatasetSummary[];
  schedulerStatus: SchedulerStatus | null;
  opsLog: OperationLogEntry[];
  opsLogLoading: boolean;
};

function humaniseMessage(raw?: string | null): string {
  if (!raw) return '';
  const message = raw.toLowerCase();
  if (message.includes('429')) return 'Temporarily rate-limited by Clio';
  if (message.includes('401') || message.includes('invalid_token') || message.includes('expired')) return 'Clio access token expired';
  if (message.includes('timed out') || message.includes('timeout')) return 'Request timed out';
  if (message.includes('sanity guard') || message.includes('rolled back')) return 'Safety check failed, existing data preserved';
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function isMatterOpeningText(value?: string | null): boolean {
  const text = String(value || '').toLowerCase();
  return text.includes('activity.matter-opening')
    || text.includes('matter-opening')
    || text.includes('matteropening')
    || text.includes('matter.opened')
    || text.includes('openanother')
    || (text.includes('matter') && (text.includes('opening') || text.includes('opened')));
}

function formatSchedulerAgo(ts?: number | null): string {
  if (!ts) return 'No run yet';
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
  if (durationMs == null) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1000)}s`;
}

function formatSyncDateToken(token?: string | null): string {
  if (!token) return '';
  const parsed = new Date(`${token}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return token;
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(parsed);
}

function formatOperationDate(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(parsed);
}

function operationWindowLabel(entry: OperationLogEntry): string | null {
  if (entry.startDate && entry.endDate) return `${formatOperationDate(entry.startDate)} to ${formatOperationDate(entry.endDate)}`;
  if (entry.startDate) return `from ${formatOperationDate(entry.startDate)}`;
  return null;
}

function syncStatusLabel(status?: string | null): string {
  switch (status) {
    case 'validated':
      return 'Validated';
    case 'ok':
    case 'completed':
      return 'Completed';
    case 'error':
      return 'Failed';
    case 'started':
    case 'progress':
      return 'Running';
    case 'warn':
      return 'Completed with warnings';
    default:
      return status ? status.replace(/[-_]/g, ' ') : 'Recorded';
  }
}

type DataHubOperationScope = 'WIP' | 'Collected' | 'Matters' | 'Data';

function syncActionLabel(scope: DataHubOperationScope, operation?: string | null, modeLabel?: string | null, windowLabel?: string | null): string {
  const rawOperation = operation || '';
  const operationKey = rawOperation.toLowerCase();
  if (isMatterOpeningText(`${rawOperation} ${windowLabel || ''}`)) return 'Recorded matter opening';
  const dateToken = rawOperation.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || (windowLabel?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? '');
  const windowText = operationKey.includes('currenthourly')
    ? 'current hourly window'
    : dateToken
      ? `window starting ${formatSyncDateToken(dateToken)}`
      : windowLabel
        ? windowLabel
        : modeLabel
          ? `${modeLabel.toLowerCase()} window`
          : 'reporting window';
  if (scope === 'Matters') return `Synced Clio Matters ${windowText}`;
  if (scope === 'Data') return `Recorded Data Hub ${windowText}`;
  return `Refreshed ${scope} ${windowText}`;
}

function operationScopeFromText(value?: string | null): DataHubOperationScope {
  const text = String(value || '').toLowerCase();
  if (text.includes('wip')) return 'WIP';
  if (text.includes('collected') || text.includes('recovered')) return 'Collected';
  if (text.includes('matter')) return 'Matters';
  return 'Data';
}

function schedulerScopeFromEntity(entity?: string | null): DataHubOperationScope {
  const text = String(entity || '').toLowerCase();
  if (text.includes('wip')) return 'WIP';
  if (text.includes('collected') || text.includes('recovered')) return 'Collected';
  if (text.includes('matter')) return 'Matters';
  return 'Data';
}

function isDataOperationEntry(entry: OperationLogEntry): boolean {
  const text = `${entry.entity || ''} ${entry.operation || ''} ${entry.message || ''}`.toLowerCase();
  return text.includes('sync')
    || text.includes('wip')
    || text.includes('collected')
    || text.includes('matter')
    || text.includes('datahub')
    || text.includes('dataops')
    || text.includes('data operations');
}

function compactDataHubDatasetLabel(entry: OperationLogEntry): string {
  if (entry.datasetSummary) return entry.datasetSummary;
  if (entry.datasetCount && entry.datasetCount > 1) return `${entry.datasetCount.toLocaleString('en-GB')} datasets`;
  return entry.datasetLabel || entry.datasetLabels?.[0] || entry.dataset || entry.datasets?.[0] || 'Datasets';
}

function syncOutcomeLabel(run: Pick<SchedulerRecentRun, 'deletedRows' | 'insertedRows' | 'durationMs' | 'message' | 'resultLabel' | 'status'>): string {
  if (run.status === 'error') return humaniseMessage(run.message) || run.resultLabel || 'Sync failed, check the run details';
  const duration = formatSchedulerDuration(run.durationMs);
  if (run.deletedRows != null && run.insertedRows != null) {
    return `Replaced ${run.deletedRows.toLocaleString('en-GB')} rows and inserted ${run.insertedRows.toLocaleString('en-GB')}${duration ? ` in ${duration}` : ''}`;
  }
  if (run.insertedRows != null) return `Inserted ${run.insertedRows.toLocaleString('en-GB')} rows${duration ? ` in ${duration}` : ''}`;
  if (run.deletedRows != null) return `Deleted ${run.deletedRows.toLocaleString('en-GB')} old rows${duration ? ` in ${duration}` : ''}`;
  return run.resultLabel || humaniseMessage(run.message) || (duration ? `${syncStatusLabel(run.status)} in ${duration}` : `${syncStatusLabel(run.status)} successfully`);
}

function compactSyncOutcomeLabel(run: Pick<SchedulerRecentRun, 'deletedRows' | 'insertedRows' | 'durationMs' | 'message' | 'resultLabel' | 'status'>): string {
  if (run.status === 'error' || run.status === 'failed') return humaniseMessage(run.message) || run.resultLabel || 'needs attention';
  if (run.status === 'started' || run.status === 'progress') return 'running';
  const duration = formatSchedulerDuration(run.durationMs);
  if (run.insertedRows != null && run.deletedRows != null) return `${run.insertedRows.toLocaleString('en-GB')} rows replaced${duration ? ` in ${duration}` : ''}`;
  if (run.insertedRows != null) return `${run.insertedRows.toLocaleString('en-GB')} rows${duration ? ` in ${duration}` : ''}`;
  if (run.deletedRows != null) return `${run.deletedRows.toLocaleString('en-GB')} rows cleared${duration ? ` in ${duration}` : ''}`;
  return duration ? `completed in ${duration}` : 'completed';
}

function compactSyncWindowLabel(operation?: string | null, modeLabel?: string | null, windowLabel?: string | null): string {
  const rawOperation = operation || '';
  const operationKey = rawOperation.toLowerCase();
  if (operationKey.includes('currenthourly')) return 'current month';
  if (operationKey.includes('previousseal')) return 'previous seal';
  const dateToken = rawOperation.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || (windowLabel?.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? '');
  if (dateToken) return `from ${formatSyncDateToken(dateToken)}`;
  if (windowLabel) return windowLabel.replace(/^window\s+/i, '').replace(/^starting\s+/i, 'from ');
  if (modeLabel) return modeLabel.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return 'sync window';
}

function compactSyncSummary(scope: DataHubOperationScope, status?: string | null): string {
  if (status === 'error' || status === 'failed') return `${scope} needs attention`;
  if (status === 'started' || status === 'progress') return `${scope} refreshing`;
  if (scope === 'Matters') return 'Matters synced';
  if (scope === 'Data') return 'Data Hub updated';
  return `${scope} updated`;
}

function schedulerStatusColour(status?: string | null): string {
  switch (status) {
    case 'validated':
    case 'ok':
    case 'completed':
      return colours.green;
    case 'started':
    case 'progress':
      return colours.orange;
    case 'warn':
    case 'no-data':
    case 'skipped':
      return colours.orange;
    case 'error':
      return colours.cta;
    default:
      return colours.subtleGrey;
  }
}

function datasetStatusColour(status?: string | null): string {
  if (status === 'ready') return colours.green;
  if (status === 'loading') return colours.blue;
  if (status === 'error') return colours.cta;
  return colours.subtleGrey;
}

function datasetMonitorLabel(key: string, fallback: string): string {
  switch (key) {
    case 'recoveredFees':
      return 'Collected';
    case 'allMatters':
      return 'Matters';
    case 'emailLists':
      return 'Email Lists';
    default:
      return fallback;
  }
}

function datasetMonitorOrder(key: string): number {
  const order = ['wip', 'recoveredFees', 'allMatters', 'enquiries', 'deals', 'instructions', 'emailLists'];
  const index = order.indexOf(key);
  return index === -1 ? order.length : index;
}

function datasetNextLabel(key: string, nextMattersSchedule: string): string {
  switch (key) {
    case 'recoveredFees':
      return 'next :05';
    case 'wip':
      return 'next :20';
    case 'allMatters':
      return `next ${nextMattersSchedule}`;
    case 'googleAnalytics':
    case 'googleAds':
    case 'metaMetrics':
    case 'dubberCalls':
    case 'emailLists':
      return 'manual';
    default:
      return 'cached';
  }
}

function datasetFreshnessLabel(status: string, count: number, updatedAt: number | null | undefined, latestStreamTs?: number | null): string {
  if (status === 'loading') return 'refreshing';
  if (status === 'error') return 'attention';
  const latestTs = latestStreamTs || updatedAt || null;
  if (latestTs) return formatSchedulerAgo(latestTs);
  if (status === 'ready' || count > 0) return 'cached';
  return 'quiet';
}

function isSystemSchedulerRun(run: SchedulerRecentRun): boolean {
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
}

type DataHubStreamRow = {
  id: string;
  ts: number;
  scope: DataHubOperationScope;
  status: string;
  actor: string;
  detail: string;
  result: string;
  summary: string;
  window: string;
  outcome: string;
  tone: string;
  dedupeKey: string;
};

function dedupeStreamRows(rows: DataHubStreamRow[]): DataHubStreamRow[] {
  const seen = new Set<string>();
  const deduped: DataHubStreamRow[] = [];
  for (const row of rows) {
    if (seen.has(row.dedupeKey)) continue;
    seen.add(row.dedupeKey);
    deduped.push(row);
  }
  return deduped;
}

type DataHubNeutralSurfaceLevel = 'base' | 'raised' | 'inset';

const dataHubNeutralSurface = (isDarkMode: boolean, level: DataHubNeutralSurfaceLevel = 'base'): string => {
  if (isDarkMode) {
    if (level === 'raised') return colours.dark.cardBackground;
    if (level === 'inset') return colours.dark.background;
    return colours.dark.sectionBackground;
  }
  if (level === 'raised') return withAlpha(colours.light.cardBackground, 0.98);
  if (level === 'inset') return withAlpha(colours.light.cardBackground, 0.98);
  return withAlpha(colours.grey, 0.98);
};

const dataHubNeutralBorder = (isDarkMode: boolean, strong = false): string => (
  isDarkMode
    ? withAlpha(colours.dark.borderColor, strong ? 0.55 : 0.38)
    : withAlpha(colours.greyText, strong ? 0.2 : 0.14)
);

const DataHubStreamsPanel: React.FC<DataHubStreamsPanelProps> = ({
  isDarkMode,
  datasets,
  schedulerStatus,
  opsLog,
  opsLogLoading,
}) => {
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? '#d1d5db' : colours.subtleGrey;
  const quietText = isDarkMode ? '#cbd5e1' : colours.subtleGrey;
  const neutralSurfaceBase = dataHubNeutralSurface(isDarkMode, 'base');
  const neutralSurfaceRaised = dataHubNeutralSurface(isDarkMode, 'raised');
  const neutralInset = dataHubNeutralSurface(isDarkMode, 'inset');
  const neutralEdge = dataHubNeutralBorder(isDarkMode);
  const mattersCurrentLane = schedulerStatus?.tiers?.matters?.migrationCurrentMonth ?? null;
  const mattersAutomation = schedulerStatus?.automation?.matters;
  const nextMattersSchedule = mattersAutomation?.currentSchedule ?? mattersCurrentLane?.schedule ?? ':35 current month';
  const statusFillFor = React.useCallback((tone: string, active = true): string => (
    active ? withAlpha(tone, isDarkMode ? 0.1 : 0.065) : neutralSurfaceRaised
  ), [isDarkMode, neutralSurfaceRaised]);
  const streamRows = React.useMemo(() => {
    const schedulerRows = (schedulerStatus?.recentRuns ?? [])
      .filter((run) => run.status !== 'progress')
      .slice(0, 8)
      .map((run) => {
        const scope = schedulerScopeFromEntity(run.entity);
        return {
          id: `scheduler-${run.id}`,
          ts: run.ts,
          scope,
          status: run.status,
          actor: isSystemSchedulerRun(run) ? 'System' : (run.invokedBy || run.triggeredBy || 'User'),
          detail: syncActionLabel(scope, run.operation, run.modeLabel, run.windowLabel),
          result: syncOutcomeLabel(run),
          summary: compactSyncSummary(scope, run.status),
          window: compactSyncWindowLabel(run.operation, run.modeLabel, run.windowLabel),
          outcome: compactSyncOutcomeLabel(run),
          tone: schedulerStatusColour(run.status),
          dedupeKey: `scheduler|${run.id}`,
        };
      });
    const operationRows = opsLog
      .filter(isDataOperationEntry)
      .slice(0, 12)
      .map((entry) => {
        const operation = (entry.operation || '').toLowerCase();
        const source = (entry.triggeredBy || entry.invokedBy || '').toLowerCase();
        const systemRun = source === 'system' || source === 'scheduler' || source === 'timer' || source === 'auto' || operation.includes('scheduler');
        const scope = operationScopeFromText(`${entry.entity || ''} ${entry.operation || ''} ${entry.message || ''}`);
        const tone = schedulerStatusColour(entry.status) || muted;
        if (entry.sourceSystem === 'DataHub' || operation.startsWith('datahub')) {
          const actor = entry.invokedBy || entry.triggeredBy || 'User';
          const datasetLabel = compactDataHubDatasetLabel(entry);
          const isRefresh = operation === 'datahubrefreshqueued';
          const isDatasetOpen = operation === 'datahubdatasetentered';
          return {
            id: `ops-${entry.id}`,
            ts: entry.ts,
            scope: 'Data' as const,
            status: entry.status,
            actor,
            detail: entry.message || 'Data Hub activity',
            result: isRefresh ? 'Refresh queued' : 'Data space opened',
            summary: isRefresh ? `${actor} queued refresh` : isDatasetOpen ? `${actor} opened dataset` : `${actor} opened Data Hub`,
            window: datasetLabel,
            outcome: isRefresh ? 'queued' : (entry.target || 'viewed'),
            tone,
            dedupeKey: `datahub|${entry.id}`,
          };
        }
        return {
          id: `ops-${entry.id}`,
          ts: entry.ts,
          scope,
          status: entry.status,
          actor: systemRun ? 'System' : (entry.invokedBy || entry.triggeredBy || 'User'),
          detail: syncActionLabel(scope, entry.operation, null, operationWindowLabel(entry)),
          result: syncOutcomeLabel({ ...entry, resultLabel: null }),
          summary: compactSyncSummary(scope, entry.status),
          window: compactSyncWindowLabel(entry.operation, null, operationWindowLabel(entry)),
          outcome: compactSyncOutcomeLabel({ ...entry, resultLabel: null }),
          tone,
          dedupeKey: `ops|${entry.id}`,
        };
      });
    return dedupeStreamRows([...schedulerRows, ...operationRows]
      .sort((a, b) => b.ts - a.ts)
    ).slice(0, 16);
  }, [muted, opsLog, schedulerStatus]);
  const activeStreamCount = datasets.filter((dataset) => dataset.status === 'ready' || dataset.status === 'loading' || dataset.count > 0).length;
  const loadingDatasetCount = datasets.filter((dataset) => dataset.status === 'loading').length;
  const errorDatasetCount = datasets.filter((dataset) => dataset.status === 'error').length;
  const freshDatasetCount = datasets.filter((dataset) => dataset.status === 'ready' && dataset.updatedAt && Date.now() - dataset.updatedAt < 30 * 60 * 1000).length;
  const stripTone = errorDatasetCount > 0
    ? colours.cta
    : loadingDatasetCount > 0
      ? colours.blue
      : colours.green;
  const stripSummary = errorDatasetCount > 0
    ? `${errorDatasetCount.toLocaleString('en-GB')} attention`
    : loadingDatasetCount > 0
      ? `${loadingDatasetCount.toLocaleString('en-GB')} refreshing`
      : freshDatasetCount > 0
        ? `${freshDatasetCount.toLocaleString('en-GB')} recent`
        : activeStreamCount > 0
          ? `${activeStreamCount.toLocaleString('en-GB')} cached`
          : streamRows.length > 0
            ? 'Recent syncs'
            : 'Quiet sync pulse';
  const latestStreamTsByDataset = React.useMemo(() => {
    const map = new Map<string, number>();
    streamRows.forEach((row) => {
      const datasetKey = row.scope === 'WIP'
        ? 'wip'
        : row.scope === 'Collected'
          ? 'recoveredFees'
          : row.scope === 'Matters'
            ? 'allMatters'
            : null;
      if (!datasetKey) return;
      const current = map.get(datasetKey) || 0;
      if (row.ts > current) map.set(datasetKey, row.ts);
    });
    return map;
  }, [streamRows]);
  const datasetIndicators = React.useMemo(() => (
    [...datasets]
      .sort((left, right) => datasetMonitorOrder(left.definition.key) - datasetMonitorOrder(right.definition.key) || left.definition.name.localeCompare(right.definition.name))
      .map((dataset) => ({
        key: dataset.definition.key,
        label: datasetMonitorLabel(dataset.definition.key, dataset.definition.name),
        tone: datasetStatusColour(dataset.status),
        freshness: datasetFreshnessLabel(dataset.status, dataset.count, dataset.updatedAt, latestStreamTsByDataset.get(dataset.definition.key)),
        next: datasetNextLabel(dataset.definition.key, nextMattersSchedule),
        status: dataset.status,
      }))
  ), [datasets, latestStreamTsByDataset, nextMattersSchedule]);

  return (
    <section
      data-helix-region="data-hub/streams"
      className="data-hub-monitor-shell"
      style={{
        padding: 0,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        borderRadius: 0,
      }}
    >
      <div className="data-hub-monitor-strip" style={{ border: `1px solid ${neutralEdge}`, background: neutralSurfaceRaised }}>
        <div className="data-hub-monitor-left">
          <div className="data-hub-monitor-title-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: stripTone, boxShadow: `0 0 0 4px ${withAlpha(stripTone, 0.12)}`, flex: '0 0 auto' }} />
              <span style={{ color: text, fontSize: 12, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                Sources
              </span>
            </span>
            <span style={{ color: muted, fontSize: 10, fontWeight: 850, whiteSpace: 'nowrap' }}>
              {stripSummary}
            </span>
          </div>

          <div className="data-hub-monitor-source-grid" aria-label="Data Hub dataset freshness">
            {datasetIndicators.map((dataset) => (
              <div
                key={dataset.key}
                className="data-hub-source-chip"
                title={`${dataset.label}: ${dataset.freshness}, ${dataset.next}`}
                style={{
                  border: 'none',
                  borderLeft: `2px solid ${dataset.tone}`,
                  background: dataset.status === 'loading' ? statusFillFor(dataset.tone, true) : neutralSurfaceBase,
                }}
              >
                <span className="data-hub-source-chip__name">
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: dataset.tone, boxShadow: dataset.status === 'loading' ? `0 0 0 4px ${withAlpha(dataset.tone, 0.12)}` : 'none', flex: '0 0 auto' }} />
                  <span style={{ color: text, fontSize: 10, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dataset.label}
                  </span>
                </span>
                <span className="data-hub-source-chip__metric">
                  <strong style={{ color: text }}>{dataset.freshness}</strong>
                </span>
                <span className="data-hub-source-chip__metric">
                  <strong style={{ color: quietText }}>{dataset.next}</strong>
                  </span>
              </div>
            ))}
          </div>
        </div>

        <aside className="data-hub-mini-ledger" style={{ borderLeft: `1px solid ${neutralEdge}`, background: neutralInset }}>
          <div className="data-hub-mini-ledger__header">
            <span style={{ color: muted, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0 }}>
              Stream ledger
            </span>
            <span style={{ color: muted, fontSize: 9, fontWeight: 750 }}>
              {opsLogLoading ? 'Updating' : `${streamRows.length.toLocaleString('en-GB')} item${streamRows.length === 1 ? '' : 's'}`}
            </span>
          </div>
          {streamRows.length > 0 ? (
            <div className="data-hub-stream-scroll data-hub-mini-ledger__rows">
              {streamRows.map((row) => (
                <div key={row.id} className="data-hub-mini-ledger__row" title={`${row.detail}: ${row.result}`}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.tone, boxShadow: `0 0 0 3px ${withAlpha(row.tone, 0.1)}`, flex: '0 0 auto' }} />
                  <span style={{ color: body, fontSize: 10, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {row.summary} · {row.window} · {row.outcome}
                  </span>
                  <span style={{ color: muted, fontSize: 9, fontWeight: 750, whiteSpace: 'nowrap' }}>{formatSchedulerAgo(row.ts)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="data-hub-mini-ledger__empty" style={{ color: muted, background: neutralSurfaceRaised }}>
              {opsLogLoading ? 'Loading activity.' : 'No recent operations.'}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default DataHubStreamsPanel;