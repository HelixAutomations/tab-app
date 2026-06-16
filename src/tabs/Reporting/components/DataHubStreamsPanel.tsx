import React from 'react';
import { PrimaryButton } from '@fluentui/react/lib/Button';
import { colours, withAlpha } from '../../../app/styles/colours';
import {
  reportingPanelShadow,
} from '../styles/reportingFoundation';
import {
  REPORTING_DATASET_BY_KEY,
  type ReportingDatasetKey,
  type ReportingLiveDatasetSummary,
} from '../reportingDatasets';
import './DataHubStreamsPanel.css';

type OperationLogEntry = {
  id: string;
  ts: number;
  operation: string;
  status: 'started' | 'progress' | 'completed' | 'error' | string;
  triggeredBy?: string;
  invokedBy?: string;
  deletedRows?: number;
  insertedRows?: number;
  durationMs?: number;
  message?: string;
};

type SchedulerRecentRun = {
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
  deletedRows?: number | null;
  insertedRows?: number | null;
  message?: string | null;
};

type SchedulerStatus = {
  recentRuns: SchedulerRecentRun[];
};

type DataHubStreamsPanelProps = {
  isDarkMode: boolean;
  datasets: ReportingLiveDatasetSummary[];
  schedulerStatus: SchedulerStatus | null;
  opsLog: OperationLogEntry[];
  opsLogLoading: boolean;
  isRefreshing: boolean;
  onRefreshAll: () => void;
  onOpenDataset: (key: ReportingDatasetKey) => void;
  getTargetLabel: (key: ReportingDatasetKey) => string;
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
    default:
      return status ? status.replace(/[-_]/g, ' ') : 'Recorded';
  }
}

function syncActionLabel(scope: 'WIP' | 'Collected', operation?: string | null, modeLabel?: string | null, windowLabel?: string | null): string {
  const rawOperation = operation || '';
  const operationKey = rawOperation.toLowerCase();
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
  return `Refreshed ${scope} ${windowText}`;
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

function schedulerStatusColour(status?: string | null): string {
  switch (status) {
    case 'validated':
    case 'ok':
    case 'completed':
      return colours.green;
    case 'started':
    case 'progress':
      return colours.orange;
    case 'error':
      return colours.cta;
    default:
      return colours.subtleGrey;
  }
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

function datasetStreamColour(status: ReportingLiveDatasetSummary['status']) {
  if (status === 'ready') return colours.green;
  if (status === 'loading') return colours.orange;
  if (status === 'error') return colours.cta;
  return colours.subtleGrey;
}

function datasetStreamLabel(status: ReportingLiveDatasetSummary['status'], count: number) {
  if (status === 'ready') return 'Live';
  if (status === 'loading') return 'Pulling';
  if (status === 'error') return 'Check';
  return count > 0 ? 'Cached' : 'Not pulled';
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
  isRefreshing,
  onRefreshAll,
  onOpenDataset,
  getTargetLabel,
}) => {
  const text = isDarkMode ? colours.dark.text : colours.light.text;
  const body = isDarkMode ? '#d1d5db' : '#374151';
  const muted = isDarkMode ? '#d1d5db' : colours.subtleGrey;
  const quietText = isDarkMode ? '#cbd5e1' : colours.subtleGrey;
  const neutralSurfaceBase = dataHubNeutralSurface(isDarkMode, 'base');
  const neutralSurfaceRaised = dataHubNeutralSurface(isDarkMode, 'raised');
  const neutralInset = dataHubNeutralSurface(isDarkMode, 'inset');
  const neutralEdge = dataHubNeutralBorder(isDarkMode);
  const activityInset = neutralInset;
  const activityFooter = neutralSurfaceRaised;
  const statusFillFor = React.useCallback((tone: string, active = true): string => (
    active ? withAlpha(tone, isDarkMode ? 0.1 : 0.065) : neutralSurfaceRaised
  ), [isDarkMode, neutralSurfaceRaised]);
  const streamRows = React.useMemo(() => {
    const schedulerRows = (schedulerStatus?.recentRuns ?? [])
      .filter((run) => (run.entity === 'wip' || run.entity === 'collected') && run.status !== 'progress' && run.status !== 'started')
      .slice(0, 8)
      .map((run) => ({
        id: `scheduler-${run.id}`,
        ts: run.ts,
        scope: run.entity === 'wip' ? 'WIP' : 'Collected',
        status: run.status,
        actor: isSystemSchedulerRun(run) ? 'System' : (run.invokedBy || run.triggeredBy || 'User'),
        detail: syncActionLabel(run.entity === 'wip' ? 'WIP' : 'Collected', run.operation, run.modeLabel, run.windowLabel),
        result: syncOutcomeLabel(run),
        tone: schedulerStatusColour(run.status),
      }));
    const operationRows = opsLog
      .filter((entry) => {
        const operation = (entry.operation || '').toLowerCase();
        const reportSync = operation.includes('syncwip') || operation.includes('synccollectedtime') || operation.includes('wip') || operation.includes('collected');
        return reportSync && (entry.status === 'completed' || entry.status === 'error');
      })
      .slice(0, 6)
      .map((entry) => {
        const operation = (entry.operation || '').toLowerCase();
        const source = (entry.triggeredBy || entry.invokedBy || '').toLowerCase();
        const systemRun = source === 'system' || source === 'scheduler' || source === 'timer' || source === 'auto' || operation.includes('scheduler');
        const tone = entry.status === 'completed'
          ? colours.green
          : entry.status === 'error'
            ? colours.cta
            : entry.status === 'started' || entry.status === 'progress'
              ? colours.orange
              : muted;
        return {
          id: `ops-${entry.id}`,
          ts: entry.ts,
          scope: operation.includes('wip') ? 'WIP' : 'Collected',
          status: entry.status,
          actor: systemRun ? 'System' : (entry.invokedBy || entry.triggeredBy || 'User'),
          detail: syncActionLabel(operation.includes('wip') ? 'WIP' : 'Collected', entry.operation, null, null),
          result: syncOutcomeLabel({ ...entry, resultLabel: null }),
          tone,
        };
      });
    return [...schedulerRows, ...operationRows]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 12);
  }, [muted, opsLog, schedulerStatus]);
  const activeStreamCount = datasets.filter((dataset) => dataset.status === 'ready' || dataset.status === 'loading' || dataset.count > 0).length;
  const inactiveStreamCount = Math.max(0, datasets.length - activeStreamCount);
  const latestSchedulerRun = (schedulerStatus?.recentRuns ?? [])
    .filter((run) => run.entity === 'wip' || run.entity === 'collected')
    .sort((a, b) => b.ts - a.ts)[0] ?? null;
  const [monitorOpen, setMonitorOpen] = React.useState(false);
  const [activityExpanded, setActivityExpanded] = React.useState(false);
  const visibleActivityRows = activityExpanded ? streamRows : streamRows.slice(0, 3);
  const sessionSummary = activeStreamCount > 0
    ? `${activeStreamCount.toLocaleString('en-GB')} live or cached`
    : 'No session data loaded yet';
  const latestSyncScope = latestSchedulerRun?.entity === 'wip' ? 'WIP' : latestSchedulerRun?.entity === 'collected' ? 'Collected' : null;
  const latestSyncTone = latestSyncScope === 'Collected' ? colours.green : latestSyncScope === 'WIP' ? colours.orange : muted;

  return (
    <section
      data-helix-region="data-hub/streams"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 14,
        border: `1px solid ${dataHubNeutralBorder(isDarkMode, true)}`,
        background: neutralSurfaceBase,
        boxShadow: reportingPanelShadow(isDarkMode),
        borderRadius: 0,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) auto', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
            Data streams
          </span>
          <span style={{ fontSize: 18, lineHeight: 1.15, fontWeight: 900, color: text }}>
            Data Hub monitor
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 7px', border: `1px solid ${activeStreamCount > 0 ? withAlpha(colours.green, 0.3) : neutralEdge}`, background: statusFillFor(colours.green, activeStreamCount > 0), color: activeStreamCount > 0 ? colours.green : quietText, fontSize: 10, fontWeight: 800 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeStreamCount > 0 ? colours.green : muted }} />
              {sessionSummary}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 7px', border: `1px solid ${neutralEdge}`, background: neutralSurfaceRaised, color: muted, fontSize: 10, fontWeight: 800 }}>
              {inactiveStreamCount.toLocaleString('en-GB')} waiting
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 7px', border: `1px solid ${withAlpha(latestSyncTone, 0.28)}`, background: statusFillFor(latestSyncTone, Boolean(latestSyncScope)), color: latestSyncTone, fontSize: 10, fontWeight: 800 }}>
              {latestSyncScope ? `${latestSyncScope} sync ${formatSchedulerAgo(latestSchedulerRun?.ts)}` : 'No automated sync yet'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setMonitorOpen((current) => !current)}
            aria-expanded={monitorOpen}
            aria-controls="data-hub-monitor-panel"
            style={{
              minHeight: 34,
              padding: '0 11px',
              border: `1px solid ${monitorOpen ? withAlpha(colours.accent, 0.62) : neutralEdge}`,
              background: monitorOpen ? withAlpha(colours.accent, isDarkMode ? 0.16 : 0.1) : neutralSurfaceRaised,
              color: monitorOpen ? colours.accent : text,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 10,
              fontWeight: 900,
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {monitorOpen ? 'Fold monitor' : 'Reveal monitor'}
          </button>
          <PrimaryButton
            text={isRefreshing ? 'Refreshing...' : 'Refresh all'}
            onClick={onRefreshAll}
            disabled={isRefreshing}
            styles={{
              root: {
                height: 34,
                borderRadius: 0,
                background: isRefreshing ? colours.orange : colours.green,
                border: 'none',
                color: colours.light.sectionBackground,
                fontSize: 10,
                fontWeight: 800,
              },
            }}
          />
        </div>
      </div>

      {monitorOpen && (
      <div id="data-hub-monitor-panel" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${neutralEdge}`, background: neutralInset }}>
        {datasets.map((dataset) => {
          const key = dataset.definition.key as ReportingDatasetKey;
          const definition = REPORTING_DATASET_BY_KEY[key];
          const hasActivity = dataset.status === 'ready' || dataset.status === 'loading' || dataset.count > 0;
          const buildFocus = Boolean(definition?.provider.buildFocus);
          const parked = !hasActivity && (!buildFocus && (Boolean(definition?.provider.devPreviewOnly) || (definition?.provider.reportUsage.length ?? 0) === 0));
          const notPulled = dataset.status === 'idle' && dataset.count === 0;
          const disabledVisual = parked || notPulled;
          const tone = disabledVisual ? muted : datasetStreamColour(dataset.status);
          const actionFill = statusFillFor(tone, !disabledVisual);
          const actionText = disabledVisual ? quietText : tone;
          const label = datasetStreamLabel(dataset.status, dataset.count);
          const targetLabel = getTargetLabel(key);
          const opensControls = targetLabel.toLowerCase().includes('ledger');
          return (
            <div
              key={key}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) auto auto',
                gap: 10,
                alignItems: 'center',
                minWidth: 0,
                padding: '8px 10px',
                borderBottom: `1px solid ${neutralEdge}`,
                background: disabledVisual ? 'transparent' : withAlpha(tone, isDarkMode ? 0.025 : 0.018),
                opacity: disabledVisual ? (isDarkMode ? 0.92 : 0.66) : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, boxShadow: dataset.status === 'loading' ? `0 0 0 4px ${withAlpha(tone, 0.12)}` : 'none', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 900, color: disabledVisual ? quietText : text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dataset.definition.name}
                </span>
              </div>
              <span style={{ fontSize: 10, color: dataset.count > 0 ? text : muted, fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {label} {dataset.count > 0 ? `· ${dataset.count.toLocaleString('en-GB')}` : ''}
              </span>
              <button
                type="button"
                onClick={() => onOpenDataset(key)}
                style={{
                  border: `1px solid ${disabledVisual ? neutralEdge : withAlpha(tone, 0.28)}`,
                  background: actionFill,
                  color: actionText,
                  padding: '4px 7px',
                  fontSize: 9,
                  fontWeight: 800,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {opensControls ? 'Controls' : 'Open'}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 900, color: muted, textTransform: 'uppercase', letterSpacing: 0 }}>
            Recent syncs
          </span>
          <span style={{ fontSize: 9, color: muted }}>
            {opsLogLoading ? 'Refreshing...' : `${visibleActivityRows.length} of ${streamRows.length || 0}`}
          </span>
        </div>
        {streamRows.length > 0 ? (
          <div className={activityExpanded ? 'data-hub-stream-scroll' : undefined} style={{ display: 'flex', flexDirection: 'column', border: `1px solid ${neutralEdge}`, background: activityInset, maxHeight: activityExpanded ? 240 : 'none', overflowY: activityExpanded ? 'auto' : 'visible' }}>
            {visibleActivityRows.map((row) => (
              <div key={row.id} title={`${row.detail}: ${row.result}`} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 9, alignItems: 'center', padding: '8px 9px', borderBottom: `1px solid ${neutralEdge}`, background: isDarkMode ? `linear-gradient(90deg, ${withAlpha(row.tone, 0.08)}, transparent 34%), ${withAlpha(colours.dark.background, 0.62)}` : withAlpha(row.tone, 0.018) }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.tone, boxShadow: `0 0 0 4px ${withAlpha(row.tone, 0.12)}`, marginTop: 4 }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 9, fontWeight: 900, color: quietText, whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{row.scope}</span>
                    <span style={{ fontSize: 11, fontWeight: 850, color: text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.detail}</span>
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: body, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.result}</span>
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', minWidth: 82 }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: row.actor === 'System' ? muted : colours.cta, whiteSpace: 'nowrap' }}>{row.actor}</span>
                  <span style={{ fontSize: 9, color: muted, whiteSpace: 'nowrap' }}>{formatSchedulerAgo(row.ts)}</span>
                </span>
              </div>
            ))}
            {streamRows.length > 3 && (
              <button
                type="button"
                onClick={() => setActivityExpanded((current) => !current)}
                style={{
                  border: 'none',
                  borderTop: `1px solid ${neutralEdge}`,
                  background: activityFooter,
                  color: quietText,
                  padding: '7px 9px',
                  fontSize: 9,
                  fontWeight: 900,
                  cursor: 'pointer',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                }}
              >
                {activityExpanded ? 'Show less' : `Show ${streamRows.length - 3} more`}
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: '10px 12px', border: `1px solid ${neutralEdge}`, background: neutralSurfaceRaised, color: muted, fontSize: 10 }}>
            No recent WIP or Collected syncs in the monitor yet.
          </div>
        )}
      </div>
      </div>
      )}
    </section>
  );
};

export default DataHubStreamsPanel;