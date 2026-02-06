import React from 'react';
import type { CSSProperties } from 'react';
import { DefaultButton, FontIcon, Spinner, SpinnerSize, Modal, DatePicker, Dialog, DialogType, DialogFooter, PrimaryButton, ChoiceGroup } from '@fluentui/react';
import { OperationValidator } from './components/OperationValidator';
import { colours } from '../../app/styles/colours';
import { useTheme } from '../../app/functionality/ThemeContext';

type PlanData = {
  startDate: string;
  endDate: string;
  rowsToDelete: number;
  rowsToInsert: number;
  message: string;
};

type DatasetSummary = {
  definition: {
    key: string;
    name: string;
  };
  status: 'idle' | 'loading' | 'ready' | 'error';
  updatedAt: number | null | undefined;
  count: number;
  cached: boolean;
};

type OperationLogEntry = {
  id: string;
  ts: number;
  operation: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  daysBack?: number;
  deletedRows?: number;
  insertedRows?: number;
  durationMs?: number;
  message?: string;
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

type TablePreview = {
  table: string;
  rowCount: number;
  columns: string[];
  rows: Record<string, unknown>[];
};

interface DataCentreProps {
  onBack: () => void;
  onRefreshAll: () => void;
  onRefreshCollected: () => void;
  isRefreshing: boolean;
  progressPercent: number;
  phaseLabel: string | null;
  elapsedLabel: string;
  datasets: DatasetSummary[];
}

type RangePreset = 'custom' | 'today' | 'yesterday' | 'lastWeek' | 'rolling7d' | 'rolling14d' | 'thisMonth' | 'lastMonth';

const PRESET_LABELS: Record<RangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  lastWeek: 'Last Wk',
  rolling7d: '7d',
  rolling14d: '14d',
  thisMonth: 'This Mo',
  lastMonth: 'Last Mo',
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
  background: isDarkMode
    ? 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)'
    : 'linear-gradient(160deg, #f8fafc 0%, #e2e8f0 100%)',
  color: isDarkMode ? colours.dark.text : colours.light.text,
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});

const headerStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 16,
});

const titleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const kickerStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1,
  fontWeight: 700,
  color: isDarkMode ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)',
});

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  fontFamily: 'Raleway, sans-serif',
};

const bannerStyle = (
  variant: 'healthy' | 'loading' | 'error',
  isDarkMode: boolean
): CSSProperties => {
  const tokens = {
    healthy: {
      bg: isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.08)',
      border: isDarkMode ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
      icon: '#22c55e',
    },
    loading: {
      bg: isDarkMode ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.08)',
      border: isDarkMode ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)',
      icon: '#3b82f6',
    },
    error: {
      bg: isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
      border: isDarkMode ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
      icon: '#ef4444',
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
  color: variant === 'healthy' ? '#22c55e' : variant === 'loading' ? '#3b82f6' : '#ef4444',
});

const bannerTextStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 13,
  fontWeight: 600,
  color: isDarkMode ? '#e2e8f0' : '#1e293b',
});

const bannerMetaStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(30, 41, 59, 0.6)',
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
  background: isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.25)',
  overflow: 'hidden',
});

const progressFillStyle = (isDarkMode: boolean, value: number): CSSProperties => ({
  height: '100%',
  width: `${Math.max(0, Math.min(100, value))}%`,
  background: isDarkMode ? '#3b82f6' : '#2563eb',
  transition: 'width 0.25s ease',
});

const progressLabelStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 11,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(30, 41, 59, 0.55)',
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
        border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.25)' : 'rgba(203, 213, 225, 0.8)'}`,
        borderRadius: 8,
        background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        selectors: {
          ':after': { border: 'none' },
          ':hover': {
            borderColor: isDarkMode ? '#64748b' : '#94a3b8',
            background: isDarkMode ? 'rgba(30, 41, 59, 0.8)' : '#f8fafc'
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
        color: isDarkMode ? '#f1f5f9' : '#0f172a'
      },
      icon: {
        fontSize: 16,
        top: 10,
        right: 12,
        color: isDarkMode ? '#64748b' : '#94a3b8'
      },
    }
  }
});

const cardStyle = (isDarkMode: boolean): CSSProperties => ({
  borderRadius: 14,
  padding: '18px 20px',
  background: isDarkMode ? 'rgba(15, 23, 42, 0.7)' : 'rgba(255, 255, 255, 0.95)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.06)'}`,
  boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.25)' : '0 4px 16px rgba(15, 23, 42, 0.06)',
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
  background: health === 'ok' ? '#22c55e' : health === 'loading' ? '#3b82f6' : '#ef4444',
  boxShadow:
    health === 'ok'
      ? '0 0 6px rgba(34, 197, 94, 0.5)'
      : health === 'loading'
        ? '0 0 6px rgba(59, 130, 246, 0.5)'
        : '0 0 6px rgba(239, 68, 68, 0.5)',
});

const feedRowStyle = (isDarkMode: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px',
  borderRadius: 8,
  background: isDarkMode ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.9)',
  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.04)'}`,
});

const feedNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
};

const feedMetaStyle = (isDarkMode: boolean): CSSProperties => ({
  fontSize: 11,
  color: isDarkMode ? 'rgba(226, 232, 240, 0.55)' : 'rgba(30, 41, 59, 0.5)',
});

const statusDotStyle = (status: DatasetSummary['status']): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background:
    status === 'ready'
      ? '#22c55e'
      : status === 'loading'
        ? '#3b82f6'
        : status === 'error'
          ? '#ef4444'
          : '#94a3b8',
});

/* ─────────────────────────────────────────────────────────────
   Component
   ───────────────────────────────────────────────────────────── */

const DataCentre: React.FC<DataCentreProps> = ({
  onBack,
  onRefreshAll,
  onRefreshCollected,
  isRefreshing,
  progressPercent,
  phaseLabel,
  elapsedLabel,
  datasets,
}) => {
  const { isDarkMode } = useTheme();

  /* ─── Per-operation independent range state ─── */
  const getDefaultRangeState = (): OperationRangeState => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { preset: 'rolling7d', startDate: start, endDate: now };
  };

  const [collectedRange, setCollectedRange] = React.useState<OperationRangeState>(getDefaultRangeState);
  const [wipRange, setWipRange] = React.useState<OperationRangeState>(getDefaultRangeState);
  const [logsExpanded, setLogsExpanded] = React.useState(false);

  /* ─── Token Check State ─── */
  const [tokenCheck, setTokenCheck] = React.useState<TokenCheckResult | null>(null);
  const [tokenChecking, setTokenChecking] = React.useState(false);

  /* ─── Data Preview State ─── */
  const [previewTable, setPreviewTable] = React.useState<string | null>(null);
  const [previewData, setPreviewData] = React.useState<TablePreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  
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
  const [syncResultCollected, setSyncResultCollected] = React.useState<{ success: boolean; message: string } | null>(null);
  const [syncResultWip, setSyncResultWip] = React.useState<{ success: boolean; message: string } | null>(null);
  const [opsLog, setOpsLog] = React.useState<OperationLogEntry[]>([]);
  const [opsLogLoading, setOpsLogLoading] = React.useState(false);
  const [opsCollapsed, setOpsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('dataOpsCollapsed');
    return saved === 'true';
  });
  const [opsChevronHovered, setOpsChevronHovered] = React.useState(false);

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
      default:
        start = new Date(now);
        start.setDate(start.getDate() - 7);
    }

    const newState: OperationRangeState = { preset, startDate: start, endDate: end };
    if (operation === 'collected') {
      setCollectedRange(newState);
    } else {
      setWipRange(newState);
    }
  }, []);

  const setCustomDates = React.useCallback((operation: 'collected' | 'wip', startDate: Date | null | undefined, endDate: Date | null | undefined) => {
    if (operation === 'collected') {
      setCollectedRange(prev => ({ ...prev, preset: 'custom', startDate, endDate }));
    } else {
      setWipRange(prev => ({ ...prev, preset: 'custom', startDate, endDate }));
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
  const fetchPreview = React.useCallback(async (table: string) => {
    setPreviewTable(table);
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

  React.useEffect(() => {
    fetchOpsStatus();
  }, [fetchOpsStatus]);

  /* Fetch operation log (live) */
  const fetchOpsLog = React.useCallback(async () => {
    setOpsLogLoading(true);
    try {
      const res = await fetch('/api/data-operations/log');
      if (res.ok) {
        const data = await res.json();
        setOpsLog(Array.isArray(data.operations) ? data.operations : []);
      }
    } catch (e) {
      console.warn('Failed to fetch data operations log:', e);
    } finally {
      setOpsLogLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchOpsLog();
    const interval = setInterval(fetchOpsLog, 8000);
    return () => clearInterval(interval);
  }, [fetchOpsLog]);

  /* ─── Sync handlers for each operation ─── */
  
  const handleCollectedSync = React.useCallback(async () => {
    if (!collectedRange.startDate || !collectedRange.endDate) return;
    setSyncingCollected(true);
    setSyncResultCollected(null);

    const payload = {
      daysBack: -1,
      startDate: collectedRange.startDate.toISOString(),
      endDate: collectedRange.endDate.toISOString(),
      dryRun: false,
      mode: planMode,
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

    try {
      const res = await fetch('/api/data-operations/sync-collected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncResultCollected({
          success: true,
          message: `+${data.insertedRows?.toLocaleString() ?? 0} rows in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`,
        });
        fetchOpsStatus();
        onRefreshCollected();
      } else {
        setSyncResultCollected({ success: false, message: data.error || 'Sync failed' });
      }
    } catch (e) {
      setSyncResultCollected({ success: false, message: String(e) });
    } finally {
      setSyncingCollected(false);
    }
  }, [collectedRange, planMode, fetchOpsStatus, onRefreshCollected]);

  const handleWipSync = React.useCallback(async () => {
    if (!wipRange.startDate || !wipRange.endDate) return;
    setSyncingWip(true);
    setSyncResultWip(null);

    const payload = {
      startDate: wipRange.startDate.toISOString(),
      endDate: wipRange.endDate.toISOString(),
    };

    try {
      const res = await fetch('/api/data-operations/sync-wip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResultWip({
          success: true,
          message: `−${data.deletedRows?.toLocaleString() ?? 0} / +${data.insertedRows?.toLocaleString() ?? 0} rows in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`,
        });
        fetchOpsStatus();
        onRefreshAll();
      } else {
        setSyncResultWip({ success: false, message: data.error || 'Sync failed' });
      }
    } catch (e) {
      setSyncResultWip({ success: false, message: String(e) });
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
      alert('Failed to abort: ' + e);
    }
  }, []);

  const toggleOpsCollapse = React.useCallback(() => {
    setOpsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('dataOpsCollapsed', String(next));
      return next;
    });
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

  const bannerIcon =
    bannerVariant === 'healthy'
      ? 'CompletedSolid'
      : bannerVariant === 'loading'
        ? 'Sync'
        : 'ErrorBadge';

  /* Last sync info per operation */
  const collectedLastSync = React.useMemo(() => {
    const daily = opsStatus?.collectedTime?.lastDailySync ?? null;
    const rolling = opsStatus?.collectedTime?.lastRollingSync ?? null;
    if (collectedRange.preset === 'today') return daily;
    if (collectedRange.preset === 'rolling7d') return rolling;
    if (daily && rolling) return daily.ts > rolling.ts ? daily : rolling;
    return daily || rolling || null;
  }, [opsStatus, collectedRange.preset]);

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
        feeds: ['userData', 'teamData', 'enquiries', 'deals', 'instructions'],
      },
      {
        key: 'finance',
        title: 'Matters & billing',
        feeds: ['allMatters', 'wip', 'recoveredFees'],
      },
      {
        key: 'compliance',
        title: 'Compliance & leave',
        feeds: ['poidData', 'annualLeave'],
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
  const planModeLabel = planMode === 'replace' ? 'Delete & insert' : planMode === 'delete' ? 'Delete only' : 'Insert only';

  const getPreviewTableForDataset = React.useCallback((key: string): string | null => {
    const map: Record<string, string> = {
      collectedTime: 'collectedTime',
      wip: 'wip',
      recoveredFees: 'collectedTime',
      enquiries: 'enquiries',
      allMatters: 'matters',
      teamData: 'team',
      userData: 'team',
      poidData: 'poid',
      annualLeave: 'annualLeave',
      deals: 'deals',
      instructions: 'instructions',
    };
    return map[key] ?? null;
  }, []);

  return (
    <div style={pageStyle(isDarkMode)}>
      {/* Header */}
      <div style={headerStyle(isDarkMode)}>
        <div style={titleBlockStyle}>
          <span style={kickerStyle(isDarkMode)}>System</span>
          <h1 style={titleStyle}>Data Hub</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <DefaultButton
            text={isRefreshing ? 'Refreshing…' : 'Refresh all'}
            onClick={onRefreshAll}
            disabled={isRefreshing}
            styles={{
              root: {
                borderRadius: 6,
                height: 34,
                padding: '0 14px',
                fontWeight: 700,
                fontSize: 12,
                border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)'}`,
                background: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(219, 234, 254, 0.9)',
                color: isDarkMode ? '#bfdbfe' : '#1d4ed8',
              },
            }}
          />
          <DefaultButton
            text="← Back"
            onClick={onBack}
            styles={{
              root: {
                borderRadius: 6,
                height: 34,
                padding: '0 12px',
                fontWeight: 600,
                fontSize: 12,
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                background: 'transparent',
                color: isDarkMode ? '#94a3b8' : '#64748b',
              },
            }}
          />
        </div>
      </div>

      {/* Status banner */}
      <div style={bannerStyle(bannerVariant, isDarkMode)}>
        <FontIcon iconName={bannerIcon} style={bannerIconStyle(bannerVariant)} />
        <span style={bannerTextStyle(isDarkMode)}>{bannerMessage}</span>
        {lastUpdatedLabel && !isRefreshing && (
          <span style={bannerMetaStyle(isDarkMode)}>Last refresh: {lastUpdatedLabel}</span>
        )}
      </div>

      {/* Token status indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderRadius: 10,
          background: tokenChecking
            ? isDarkMode
              ? 'rgba(59, 130, 246, 0.1)'
              : 'rgba(59, 130, 246, 0.06)'
            : tokenCheck?.success
              ? isDarkMode
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(34, 197, 94, 0.06)'
              : isDarkMode
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(239, 68, 68, 0.06)',
          border: `1px solid ${
            tokenChecking
              ? isDarkMode
                ? 'rgba(59, 130, 246, 0.25)'
                : 'rgba(59, 130, 246, 0.15)'
              : tokenCheck?.success
                ? isDarkMode
                  ? 'rgba(34, 197, 94, 0.25)'
                  : 'rgba(34, 197, 94, 0.15)'
                : isDarkMode
                  ? 'rgba(239, 68, 68, 0.25)'
                  : 'rgba(239, 68, 68, 0.15)'
          }`,
        }}
      >
        {tokenChecking ? (
          <>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Checking Clio token…</span>
          </>
        ) : tokenCheck?.success ? (
          <>
            <FontIcon iconName="CompletedSolid" style={{ color: '#22c55e', fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Clio token ready</span>
            <span style={feedMetaStyle(isDarkMode)}>
              {tokenCheck.tokenPreview} • {tokenCheck.durationMs}ms
            </span>
          </>
        ) : (
          <>
            <FontIcon iconName="ErrorBadge" style={{ color: '#ef4444', fontSize: 14 }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Token error</span>
            <span style={{ ...feedMetaStyle(isDarkMode), color: '#ef4444' }}>
              {tokenCheck?.message}
            </span>
          </>
        )}
      </div>

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

      {/* ─── Data Operations ─── */}
      <style>{`
        @keyframes ops-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .ops-btn { transition: all 0.12s ease; }
        .ops-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
        .ops-btn:active:not(:disabled) { transform: translateY(0); opacity: 1; }
        .ops-card { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .ops-card:hover { box-shadow: ${isDarkMode ? '0 4px 16px rgba(0,0,0,0.35)' : '0 4px 16px rgba(15,23,42,0.1)'}; }
        .ops-preset { transition: all 0.12s ease; cursor: pointer; }
        .ops-preset:hover { opacity: 0.8; }
        @keyframes ops-slideDown { from { opacity: 0; max-height: 0; transform: translateY(-4px); } to { opacity: 1; max-height: 60px; transform: translateY(0); } }
      `}</style>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Section Header — ImmediateActionsBar pattern */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: isDarkMode ? '#94a3b8' : '#64748b',
        }}>
          <button
            onClick={toggleOpsCollapse}
            onMouseEnter={() => setOpsChevronHovered(true)}
            onMouseLeave={() => setOpsChevronHovered(false)}
            aria-label={opsCollapsed ? 'Expand operations' : 'Collapse operations'}
            aria-expanded={!opsCollapsed}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              padding: 0,
              border: 'none',
              borderRadius: 3,
              background: opsChevronHovered
                ? (isDarkMode ? 'rgba(54, 144, 206, 0.15)' : 'rgba(54, 144, 206, 0.1)')
                : 'transparent',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <FontIcon
              iconName={opsCollapsed ? 'ChevronRight' : 'ChevronDown'}
              style={{
                fontSize: 10,
                color: opsChevronHovered
                  ? (isDarkMode ? '#7dd3fc' : '#3690ce')
                  : (isDarkMode ? '#94a3b8' : '#64748b'),
                transition: 'color 0.15s ease',
              }}
            />
          </button>
          <FontIcon iconName="Database" style={{ fontSize: 13, color: isDarkMode ? '#60a5fa' : '#2563eb' }} />
          Data Operations
          {isSyncBusy && (
            <span style={{
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              background: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
              color: isDarkMode ? '#93c5fd' : '#3b82f6',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 2,
            }}>
              syncing
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>Clio → SQL</span>
        </div>

        {!opsCollapsed && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
          {/* ─── Collected Time Card ─── */}
          <div
            className="ops-card"
            style={{
              padding: '16px 18px',
              background: isDarkMode ? '#1e293b' : '#fff',
              border: `1px solid ${syncingCollected
                ? (isDarkMode ? 'rgba(59, 130, 246, 0.4)' : 'rgba(59, 130, 246, 0.3)')
                : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: syncingCollected ? '#3b82f6' : (opsStatus?.collectedTime?.rowCount ? '#22c55e' : '#94a3b8'),
                  animation: syncingCollected ? 'ops-pulse 1.5s infinite' : undefined,
                  boxShadow: syncingCollected ? '0 0 6px rgba(59,130,246,0.5)' : (opsStatus?.collectedTime?.rowCount ? '0 0 4px rgba(34,197,94,0.4)' : 'none'),
                }} />
                <span style={{ fontWeight: 700, fontSize: 12 }}>Collected Time</span>
              </div>
              <span style={{ fontSize: 10, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>collectedTime</span>
            </div>

            {/* Stats Row */}
            <div style={{
              display: 'flex',
              gap: 20,
              padding: '8px 12px',
              background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
              borderRadius: 2,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#f9fafb' : '#111827' }}>{opsStatus?.collectedTime?.rowCount?.toLocaleString() ?? '—'}</span>
                <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>rows</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#d1d5db' : '#374151' }}>{opsStatus?.collectedTime?.latestDate ?? '—'}</span>
                <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>latest</span>
              </div>
              {collectedLastSync && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 'auto', textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? '#d1d5db' : '#374151' }}>{new Date(collectedLastSync.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>last sync</span>
                </div>
              )}
            </div>

            {/* Range Selector — segmented group */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: isDarkMode ? 'rgba(55, 65, 81, 0.6)' : '#f5f5f5', padding: 2, borderRadius: 2 }}>
              {(['today', 'yesterday', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'custom'] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  className="ops-preset"
                  onClick={() => applyPreset('collected', preset)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    border: 'none',
                    letterSpacing: '0.02em',
                    background: collectedRange.preset === preset
                      ? (isDarkMode ? '#4b5563' : '#fff')
                      : 'transparent',
                    color: collectedRange.preset === preset
                      ? (isDarkMode ? '#93c5fd' : '#2563eb')
                      : (isDarkMode ? '#6b7280' : '#9ca3af'),
                    boxShadow: collectedRange.preset === preset ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>

            {/* Date Pickers — only for custom */}
            {collectedRange.preset === 'custom' && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                animation: 'ops-slideDown 0.15s ease',
              }}>
                <DatePicker
                  placeholder="Start"
                  value={collectedRange.startDate || undefined}
                  onSelectDate={(date) => setCustomDates('collected', date, collectedRange.endDate)}
                  {...getDatePickerProps(isDarkMode)}
                />
                <FontIcon iconName="Forward" style={{ fontSize: 10, color: isDarkMode ? '#475569' : '#cbd5e1' }} />
                <DatePicker
                  placeholder="End"
                  value={collectedRange.endDate || undefined}
                  onSelectDate={(date) => setCustomDates('collected', collectedRange.startDate, date)}
                  {...getDatePickerProps(isDarkMode)}
                />
              </div>
            )}

            {/* Result Banner */}
            {syncResultCollected && (
              <div style={{
                padding: '6px 10px',
                borderRadius: 0,
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: syncResultCollected.success
                  ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.06)')
                  : (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.06)'),
                border: `1px solid ${syncResultCollected.success
                  ? (isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)')
                  : (isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)')}`,
                color: syncResultCollected.success ? '#22c55e' : '#ef4444',
              }}>
                <FontIcon iconName={syncResultCollected.success ? 'CheckMark' : 'ErrorBadge'} style={{ fontSize: 11 }} />
                {syncResultCollected.message}
                <button onClick={() => setSyncResultCollected(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 9, padding: '0 2px' }}>✕</button>
              </div>
            )}

            {/* Action Button */}
            <button
              className="ops-btn"
              onClick={handleCollectedSync}
              disabled={!collectedRange.startDate || !collectedRange.endDate || isSyncBusy}
              style={{
                width: '100%',
                height: 34,
                border: 'none',
                borderRadius: 0,
                background: (!collectedRange.startDate || !collectedRange.endDate || isSyncBusy)
                  ? (isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)')
                  : (isDarkMode ? '#3b82f6' : '#2563eb'),
                color: (!collectedRange.startDate || !collectedRange.endDate || isSyncBusy)
                  ? (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)')
                  : '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                cursor: (!collectedRange.startDate || !collectedRange.endDate || isSyncBusy) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {syncingCollected && <Spinner size={SpinnerSize.xSmall} />}
              {syncingCollected ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>

          {/* ─── WIP Card ─── */}
          <div
            className="ops-card"
            style={{
              padding: '16px 18px',
              background: isDarkMode ? '#1e293b' : '#fff',
              border: `1px solid ${syncingWip
                ? (isDarkMode ? 'rgba(20, 184, 166, 0.4)' : 'rgba(20, 184, 166, 0.3)')
                : (isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: syncingWip ? '#14b8a6' : (opsStatus?.wip?.rowCount ? '#22c55e' : '#94a3b8'),
                  animation: syncingWip ? 'ops-pulse 1.5s infinite' : undefined,
                  boxShadow: syncingWip ? '0 0 6px rgba(20,184,166,0.5)' : (opsStatus?.wip?.rowCount ? '0 0 4px rgba(34,197,94,0.4)' : 'none'),
                }} />
                <span style={{ fontWeight: 700, fontSize: 12 }}>Recorded Time (WIP)</span>
              </div>
              <span style={{ fontSize: 10, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>wip</span>
            </div>

            {/* Stats Row */}
            <div style={{
              display: 'flex',
              gap: 20,
              padding: '8px 12px',
              background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
              borderRadius: 2,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: isDarkMode ? '#f9fafb' : '#111827' }}>{opsStatus?.wip?.rowCount?.toLocaleString() ?? '—'}</span>
                <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>rows</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#d1d5db' : '#374151' }}>{opsStatus?.wip?.latestDate ?? '—'}</span>
                <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>latest</span>
              </div>
              {opsStatus?.wip?.lastSync && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginLeft: 'auto', textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? '#d1d5db' : '#374151' }}>{new Date(opsStatus.wip.lastSync.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontSize: 9, color: isDarkMode ? '#6b7280' : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>last sync</span>
                </div>
              )}
            </div>

            {/* Range Selector — segmented group */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: isDarkMode ? 'rgba(55, 65, 81, 0.6)' : '#f5f5f5', padding: 2, borderRadius: 2 }}>
              {(['today', 'yesterday', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'custom'] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  className="ops-preset"
                  onClick={() => applyPreset('wip', preset)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 10,
                    fontWeight: 600,
                    border: 'none',
                    letterSpacing: '0.02em',
                    background: wipRange.preset === preset
                      ? (isDarkMode ? '#4b5563' : '#fff')
                      : 'transparent',
                    color: wipRange.preset === preset
                      ? (isDarkMode ? '#5eead4' : '#0d9488')
                      : (isDarkMode ? '#6b7280' : '#9ca3af'),
                    boxShadow: wipRange.preset === preset ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {PRESET_LABELS[preset]}
                </button>
              ))}
            </div>

            {/* Date Pickers — only for custom */}
            {wipRange.preset === 'custom' && (
              <div style={{
                display: 'flex', gap: 8, alignItems: 'center',
                animation: 'ops-slideDown 0.15s ease',
              }}>
                <DatePicker
                  placeholder="Start"
                  value={wipRange.startDate || undefined}
                  onSelectDate={(date) => setCustomDates('wip', date, wipRange.endDate)}
                  {...getDatePickerProps(isDarkMode)}
                />
                <FontIcon iconName="Forward" style={{ fontSize: 10, color: isDarkMode ? '#475569' : '#cbd5e1' }} />
                <DatePicker
                  placeholder="End"
                  value={wipRange.endDate || undefined}
                  onSelectDate={(date) => setCustomDates('wip', wipRange.startDate, date)}
                  {...getDatePickerProps(isDarkMode)}
                />
              </div>
            )}

            {/* Result Banner */}
            {syncResultWip && (
              <div style={{
                padding: '6px 10px',
                borderRadius: 0,
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: syncResultWip.success
                  ? (isDarkMode ? 'rgba(34, 197, 94, 0.12)' : 'rgba(34, 197, 94, 0.06)')
                  : (isDarkMode ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.06)'),
                border: `1px solid ${syncResultWip.success
                  ? (isDarkMode ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.2)')
                  : (isDarkMode ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.2)')}`,
                color: syncResultWip.success ? '#22c55e' : '#ef4444',
              }}>
                <FontIcon iconName={syncResultWip.success ? 'CheckMark' : 'ErrorBadge'} style={{ fontSize: 11 }} />
                {syncResultWip.message}
                <button onClick={() => setSyncResultWip(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 9, padding: '0 2px' }}>✕</button>
              </div>
            )}

            {/* Action Button */}
            <button
              className="ops-btn"
              onClick={handleWipSync}
              disabled={!wipRange.startDate || !wipRange.endDate || isSyncBusy}
              style={{
                width: '100%',
                height: 34,
                border: 'none',
                borderRadius: 0,
                background: (!wipRange.startDate || !wipRange.endDate || isSyncBusy)
                  ? (isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(20, 184, 166, 0.15)')
                  : (isDarkMode ? '#14b8a6' : '#0d9488'),
                color: (!wipRange.startDate || !wipRange.endDate || isSyncBusy)
                  ? (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)')
                  : '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                cursor: (!wipRange.startDate || !wipRange.endDate || isSyncBusy) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {syncingWip && <Spinner size={SpinnerSize.xSmall} />}
              {syncingWip ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        </div>

        {/* ─── Data Integrity Section ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
          <OperationValidator
            operation={collectedValidatorOp}
            startDate={collectedRange.startDate?.toISOString()}
            endDate={collectedRange.endDate?.toISOString()}
            label="Collected Integrity"
            accentColor="#3b82f6"
          />
          <OperationValidator
            operation={wipValidatorOp}
            startDate={wipRange.startDate?.toISOString()}
            endDate={wipRange.endDate?.toISOString()}
            label="WIP Integrity"
            accentColor="#14b8a6"
          />
        </div>

        {/* Collapsible Logs Section */}
        {(opsLog.length > 0 || (opsStatus?.recentOperations && opsStatus.recentOperations.length > 0)) && (
          <div style={{
            padding: '10px 14px',
            background: isDarkMode ? 'rgba(15, 23, 42, 0.4)' : 'rgba(248, 250, 252, 0.9)',
            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
            borderRadius: 2,
          }}>
            <button
              onClick={() => setLogsExpanded(!logsExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isDarkMode ? '#94a3b8' : '#64748b',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              <FontIcon iconName={logsExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 9 }} />
              Logs
              {opsLogLoading && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>refreshing…</span>}
              <span style={{ marginLeft: 'auto', fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 10 }}>{opsLog.length + (opsStatus?.recentOperations?.length ?? 0)}</span>
            </button>

            {logsExpanded && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {opsLog.slice(0, 8).map((op) => (
                  <div
                    key={op.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 0,
                      background: isDarkMode ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
                      fontSize: 10,
                    }}
                  >
                    <span style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: op.status === 'completed' ? '#22c55e' : op.status === 'error' ? '#ef4444' : '#3b82f6',
                    }} />
                    <span style={{ fontWeight: 600, minWidth: 110, color: isDarkMode ? '#d1d5db' : '#374151' }}>{op.operation}</span>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af' }}>{op.message || op.status}</span>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', marginLeft: 'auto', fontSize: 9, flexShrink: 0 }}>
                      {new Date(op.ts).toLocaleTimeString('en-GB')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </>
        )}
      </section>

      {/* Feed groups */}
      <div style={gridStyle}>
        {feedGroups.map((group) => {
          const health = groupHealth(group.feeds);
          return (
            <section key={group.key} style={cardStyle(isDarkMode)}>
              <div style={cardHeaderStyle(isDarkMode)}>
                <h2 style={cardTitleStyle}>
                  <span style={healthDotStyle(health)} />
                  {group.title}
                </h2>
                <span style={feedMetaStyle(isDarkMode)}>{group.feeds.length} feeds</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.feeds.map((key) => {
                  const d = getDataset(key);
                  const previewTable = getPreviewTableForDataset(key);
                  if (!d) return null;
                  return (
                    <div key={key} style={feedRowStyle(isDarkMode)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={statusDotStyle(d.status)} />
                        <span style={feedNameStyle}>{d.definition.name}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={feedMetaStyle(isDarkMode)}>{formatCount(d.count)} rows</span>
                        {previewTable && (
                          <DefaultButton
                            text="View"
                            onClick={() => fetchPreview(previewTable)}
                            disabled={previewLoading}
                            styles={{
                              root: {
                                borderRadius: 6,
                                height: 26,
                                minWidth: 48,
                                padding: '0 8px',
                                fontWeight: 600,
                                fontSize: 10,
                                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                                background: 'transparent',
                                color: isDarkMode ? '#94a3b8' : '#64748b',
                              },
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Data Preview Modal */}
      <Modal
        isOpen={previewTable !== null}
        onDismiss={() => {
          setPreviewTable(null);
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
            background: isDarkMode ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.15)' : 'rgba(15, 23, 42, 0.08)'}`,
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
                  color: isDarkMode ? '#e2e8f0' : '#1e293b',
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
                setPreviewData(null);
              }}
              styles={{
                root: {
                  borderRadius: 6,
                  height: 32,
                  padding: '0 14px',
                  fontWeight: 600,
                  fontSize: 11,
                  border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.15)'}`,
                  background: 'transparent',
                  color: isDarkMode ? '#94a3b8' : '#64748b',
                },
              }}
            />
          </div>

          {/* Loading state */}
          {previewLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 20 }}>
              <Spinner size={SpinnerSize.medium} />
              <span style={{ color: isDarkMode ? '#94a3b8' : '#64748b' }}>Loading data…</span>
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
                border: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
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
                          color: isDarkMode ? '#94a3b8' : '#64748b',
                          borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)'}`,
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
                              borderBottom: `1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.05)' : 'rgba(15, 23, 42, 0.03)'}`,
                              color: isDarkMode ? '#e2e8f0' : '#1e293b',
                              maxWidth: 250,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={String(row[col] ?? '')}
                          >
                            {row[col] == null ? (
                              <span style={{ color: isDarkMode ? '#475569' : '#cbd5e1' }}>null</span>
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
                color: isDarkMode ? '#64748b' : '#94a3b8',
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
          title: 'Confirm Custom Sync',
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
               <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 11, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
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

export default DataCentre;
