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

type MonthAuditEntry = {
  key: string;
  label: string;
  lastSync: { ts: string; status: string; insertedRows?: number; deletedRows?: number; durationMs?: number; invokedBy?: string; message?: string } | null;
  lastValidate: { ts: string; status: string; message?: string; invokedBy?: string } | null;
  syncCount: number;
  validateCount: number;
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
  lastRun: { ts: number; status: string; message?: string } | null;
  schedule: string;
};

type SchedulerStatus = {
  enabled: boolean;
  tiers: {
    collected: { hot: SchedulerTierInfo; warm: SchedulerTierInfo; cold: SchedulerTierInfo };
    wip: { hot: SchedulerTierInfo; warm: SchedulerTierInfo; cold: SchedulerTierInfo };
  };
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
  /** Current user's full name for audit trail */
  userName?: string;
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
  userName,
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
  const [logsExpanded, setLogsExpanded] = React.useState(true);

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
  const [confirmingCollected, setConfirmingCollected] = React.useState(false);
  const [confirmingWip, setConfirmingWip] = React.useState(false);
  const [collectedConfirmChecked, setCollectedConfirmChecked] = React.useState(false);
  const [wipConfirmChecked, setWipConfirmChecked] = React.useState(false);
  const [opsLog, setOpsLog] = React.useState<OperationLogEntry[]>([]);
  const [opsLogLoading, setOpsLogLoading] = React.useState(false);
  const [opsCollapsed, setOpsCollapsed] = React.useState(() => {
    const saved = localStorage.getItem('dataOpsCollapsed');
    return saved === 'true';
  });
  const [opsChevronHovered, setOpsChevronHovered] = React.useState(false);
  const [activeOp, setActiveOp] = React.useState<'collected' | 'wip' | null>(null);

  /* Month coverage side panel state */
const [monthAuditOp, setMonthAuditOp] = React.useState<'collectedTime' | 'wip' | null>('collectedTime');
  const [monthAuditData, setMonthAuditData] = React.useState<MonthAuditEntry[]>([]);
  const [monthAuditLoading, setMonthAuditLoading] = React.useState(false);
  const [coverageOpen, setCoverageOpen] = React.useState(true);
  const [backfillLog, setBackfillLog] = React.useState<Array<{ key: string; ts: string; status: string; rows?: number }>>([]);

  /* ─── Data Hub lazy-load state ─── */
  const [dataHubLoaded, setDataHubLoaded] = React.useState(false);
  const [dataHubLoading, setDataHubLoading] = React.useState(false);
  const opsLogIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleCoverage = React.useCallback(async (op: 'collectedTime' | 'wip') => {
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

  const syncMonthKey = React.useCallback(async (monthKey: string, op: 'collectedTime' | 'wip') => {
    const start = `${monthKey}-01`;
    const [y, mon] = monthKey.split('-').map(Number);
    const lastDay = new Date(y, mon, 0).getDate();
    const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
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
  const [monthlyExpanded, setMonthlyExpanded] = React.useState<'collected' | 'wip' | null>('collected');

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
  }, [fetchSchedulerStatus]);

  // Auto-expand logs when a sync is in progress so user sees activity
  React.useEffect(() => {
    if (syncingCollected || syncingWip) setLogsExpanded(true);
  }, [syncingCollected, syncingWip]);

  // Auto-fetch coverage + monthly totals when an operation card is opened
  React.useEffect(() => {
    if (!activeOp || !coverageOpen) return;
    const opKey = activeOp === 'collected' ? 'collectedTime' as const : 'wip' as const;
    // Fetch month audit if not already loaded
    if (monthAuditData.length === 0 && !monthAuditLoading) {
      setMonthAuditOp(opKey);
      setMonthAuditLoading(true);
      fetch(`/api/data-operations/month-audit?operation=${opKey}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data) setMonthAuditData(data.months || []); })
        .catch(e => console.warn('Coverage auto-fetch failed:', e))
        .finally(() => setMonthAuditLoading(false));
    }
    // Fetch monthly totals if expanded but empty
    const totalsKey = activeOp;
    const totals = activeOp === 'collected' ? monthlyCollected : monthlyWip;
    if (monthlyExpanded === totalsKey && totals.length === 0) {
      fetchMonthlyTotals(totalsKey);
    }
  }, [activeOp, coverageOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /* Ops status is fetched on-demand via loadDataHub — no auto-fetch on mount */

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

  /* Ops log + polling is started on-demand via loadDataHub — no auto-fetch on mount */
  React.useEffect(() => {
    return () => {
      if (opsLogIntervalRef.current) clearInterval(opsLogIntervalRef.current);
    };
  }, []);

  /* ─── Load Data Hub (user-invoked) ─── */
  const loadDataHub = React.useCallback(async () => {
    setDataHubLoading(true);
    try {
      await Promise.all([
        fetchOpsStatus(),
        fetchOpsLog(),
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
  }, [fetchOpsStatus, fetchOpsLog, coverageOpen, monthAuditOp, monthlyExpanded, monthlyCollected.length, monthlyWip.length, fetchMonthlyTotals]);

  /* ─── Sync handlers for each operation ─── */
  
  const handleCollectedSync = React.useCallback(async () => {
    if (!collectedRange.startDate || !collectedRange.endDate) return;
    // Auto-activate data hub if not yet loaded
    if (!dataHubLoaded) {
      setDataHubLoaded(true);
      if (!opsLogIntervalRef.current) opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
    }
    setSyncingCollected(true);
    setSyncResultCollected(null);

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
    // Auto-activate data hub if not yet loaded
    if (!dataHubLoaded) {
      setDataHubLoaded(true);
      if (!opsLogIntervalRef.current) opsLogIntervalRef.current = setInterval(fetchOpsLog, 8000);
    }
    setSyncingWip(true);
    setSyncResultWip(null);

    const payload = {
      startDate: wipRange.startDate.toISOString(),
      endDate: wipRange.endDate.toISOString(),
      ...(userName && { invokedBy: userName }),
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

  /* Staleness badges for selector buttons */
  const getStaleness = React.useCallback((ts: number | string | null | undefined): { label: string; colour: string } | null => {
    if (!ts) return null;
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const ago = Date.now() - ms;
    const mins = Math.floor(ago / 60_000);
    const hrs = Math.floor(ago / 3_600_000);
    const days = Math.floor(ago / 86_400_000);
    const label = days > 0 ? `${days}d ago` : hrs > 0 ? `${hrs}h ago` : `${mins}m ago`;
    const colour = hrs >= 6 ? '#ef4444' : hrs >= 2 ? '#f59e0b' : '#22c55e';
    return { label, colour };
  }, []);

  const collectedStaleness = React.useMemo(() => {
    const daily = opsStatus?.collectedTime?.lastDailySync;
    const rolling = opsStatus?.collectedTime?.lastRollingSync;
    const latest = daily && rolling ? (daily.ts > rolling.ts ? daily : rolling) : (daily || rolling);
    return getStaleness(latest?.ts ?? null);
  }, [opsStatus, getStaleness]);

  const wipStaleness = React.useMemo(() => getStaleness(opsStatus?.wip?.lastSync?.ts ?? null), [opsStatus, getStaleness]);

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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderRadius: 6,
        background: bannerVariant === 'healthy'
          ? 'transparent'
          : bannerStyle(bannerVariant, isDarkMode).background,
        border: bannerVariant === 'healthy'
          ? 'none'
          : `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: bannerVariant === 'healthy' ? '#22c55e' : bannerVariant === 'loading' ? '#3b82f6' : '#ef4444',
          boxShadow: `0 0 4px ${bannerVariant === 'healthy' ? 'rgba(34,197,94,0.4)' : bannerVariant === 'loading' ? 'rgba(59,130,246,0.4)' : 'rgba(239,68,68,0.4)'}`,
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#94a3b8' : '#64748b' }}>{bannerMessage}</span>
        {lastUpdatedLabel && !isRefreshing && (
          <span style={{ fontSize: 10, color: isDarkMode ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.5)', marginLeft: 'auto' }}>{lastUpdatedLabel}</span>
        )}
        {/* Token indicator — inline */}
        {!tokenChecking && tokenCheck && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            marginLeft: lastUpdatedLabel ? 0 : 'auto',
            fontSize: 9, fontWeight: 600,
            color: tokenCheck.success ? (isDarkMode ? '#4ade80' : '#16a34a') : (isDarkMode ? '#f87171' : '#dc2626'),
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: tokenCheck.success ? '#22c55e' : '#ef4444',
            }} />
            {tokenCheck.success ? 'Clio' : 'Token error'}
          </span>
        )}
      </div>

      {/* Load Data Hub prompt — shown until user invokes */}
      {!dataHubLoaded && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 6,
          background: isDarkMode ? 'rgba(59, 130, 246, 0.08)' : 'rgba(219, 234, 254, 0.7)',
          border: `1px dashed ${isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.2)'}`,
        }}>
          <FontIcon iconName="Database" style={{ fontSize: 14, color: isDarkMode ? '#60a5fa' : '#2563eb' }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? '#94a3b8' : '#64748b', flex: 1 }}>
            {dataHubLoading ? 'Loading operations data…' : 'Operations data not loaded. Load to see sync status, coverage, and activity.'}
          </span>
          <button
            className="ops-btn"
            onClick={loadDataHub}
            disabled={dataHubLoading}
            style={{
              padding: '4px 14px',
              borderRadius: 4,
              border: 'none',
              background: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : '#2563eb',
              color: isDarkMode ? '#93c5fd' : '#ffffff',
              fontSize: 11,
              fontWeight: 700,
              cursor: dataHubLoading ? 'not-allowed' : 'pointer',
              opacity: dataHubLoading ? 0.6 : 1,
            }}
          >
            {dataHubLoading ? 'Loading…' : 'Load'}
          </button>
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
        {/* ─── Scheduler Dashboard Strip ─── */}
        {schedulerStatus && activeOp === null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', fontSize: 9,
            background: isDarkMode ? 'rgba(15,23,42,0.4)' : 'rgba(248,250,252,0.8)',
            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
            borderRadius: 2,
            color: isDarkMode ? '#64748b' : '#94a3b8',
          }}>
            <FontIcon iconName="Clock" style={{ fontSize: 10, color: schedulerStatus.enabled ? '#22c55e' : '#ef4444' }} />
            <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Scheduler {schedulerStatus.enabled ? 'ON' : 'OFF'}
            </span>
            {schedulerStatus.enabled && schedulerStatus.tiers && (
              <>
                <span style={{ color: isDarkMode ? '#334155' : '#e2e8f0' }}>|</span>
                {(['hot', 'warm', 'cold'] as const).map((tier) => {
                  const ct = schedulerStatus.tiers.collected?.[tier];
                  const hasRun = !!ct?.lastRun;
                  const isErr = ct?.lastRun?.status === 'error';
                  return (
                    <span key={tier} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: isErr ? '#ef4444' : hasRun ? '#22c55e' : (isDarkMode ? '#334155' : '#d1d5db'),
                      }} />
                      <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{tier}</span>
                      {hasRun && (
                        <span style={{ color: isDarkMode ? '#475569' : '#cbd5e1' }}>
                          {new Date(ct!.lastRun!.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </span>
                  );
                })}
              </>
            )}
            <button
              onClick={fetchSchedulerStatus}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 9, padding: '0 2px' }}
            >
              <FontIcon iconName="Refresh" style={{ fontSize: 9 }} />
            </button>
          </div>
        )}

        {/* ─── Operation Selector ─── */}
        {activeOp === null ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Collected button */}
            <button
              onClick={() => setActiveOp('collected')}
              style={{
                padding: '28px 24px',
                background: isDarkMode ? '#1e293b' : '#fff',
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(59,130,246,0.4)' : 'rgba(59,130,246,0.3)';
                e.currentTarget.style.background = isDarkMode ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#fff';
              }}
            >
              <FontIcon iconName="Money" style={{ fontSize: 24, color: '#3b82f6' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>Collected</span>
              <span style={{ fontSize: 10, color: isDarkMode ? '#6b7280' : '#9ca3af' }}>
                {opsStatus?.collectedTime?.rowCount?.toLocaleString() ?? '—'} rows
              </span>
              {collectedStaleness && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: collectedStaleness.colour }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: collectedStaleness.colour, display: 'inline-block' }} />
                  {collectedStaleness.label}
                </span>
              )}
            </button>

            {/* Recorded (WIP) button */}
            <button
              onClick={() => setActiveOp('wip')}
              style={{
                padding: '28px 24px',
                background: isDarkMode ? '#1e293b' : '#fff',
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(20,184,166,0.4)' : 'rgba(20,184,166,0.3)';
                e.currentTarget.style.background = isDarkMode ? 'rgba(20,184,166,0.06)' : 'rgba(20,184,166,0.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
                e.currentTarget.style.background = isDarkMode ? '#1e293b' : '#fff';
              }}
            >
              <FontIcon iconName="Clock" style={{ fontSize: 24, color: '#14b8a6' }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>Recorded</span>
              <span style={{ fontSize: 10, color: isDarkMode ? '#6b7280' : '#9ca3af' }}>
                {opsStatus?.wip?.rowCount?.toLocaleString() ?? '—'} rows
              </span>
              {wipStaleness && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: wipStaleness.colour }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: wipStaleness.colour, display: 'inline-block' }} />
                  {wipStaleness.label}
                </span>
              )}
            </button>
          </div>
        ) : (
          <>
          {/* Back to selector */}
          <button
            onClick={() => setActiveOp(null)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 600, color: isDarkMode ? '#64748b' : '#94a3b8',
              padding: 0, marginBottom: -4,
            }}
          >
            <FontIcon iconName="ChevronLeft" style={{ fontSize: 8 }} />
            Back
          </button>

          {/* Flex row: card + side panel */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>

          {/* Left column: card + validator */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ─── Collected Time Card ─── */}
          {activeOp === 'collected' && (
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
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#d1d5db' : '#374151' }}>{opsStatus?.collectedTime?.latestDate ? new Date(opsStatus.collectedTime.latestDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
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
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'ytd', 'thisYear', 'lastYear', 'custom'] as RangePreset[]).map((preset) => (
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

            {/* Confirmation / Action */}
            {confirmingCollected && !syncingCollected ? (
              <div style={{
                padding: '10px 12px',
                background: isDarkMode ? 'rgba(59, 130, 246, 0.06)' : 'rgba(59, 130, 246, 0.03)',
                border: `1px solid ${isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.12)'}`,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#93c5fd' : '#1d4ed8' }}>
                  Confirm Sync — Collected Time
                </div>
                <div style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#475569', lineHeight: 1.5 }}>
                  This will <strong>delete</strong> existing rows for the selected period and <strong>re-insert</strong> from Clio.
                </div>
                <div style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 10px',
                  background: isDarkMode ? 'rgba(15,23,42,0.4)' : 'rgba(248,250,252,0.9)',
                  borderRadius: 2,
                  fontSize: 10,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                }}>
                  <div>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Period</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>
                      {collectedRange.startDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} → {collectedRange.endDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mode</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>{planModeLabel}</div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preset</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>{PRESET_LABELS[collectedRange.preset]}</div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: isDarkMode ? '#e2e8f0' : '#374151' }}>
                  <input
                    type="checkbox"
                    checked={collectedConfirmChecked}
                    onChange={(e) => setCollectedConfirmChecked(e.currentTarget.checked)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#3b82f6' }}
                  />
                  I understand this will replace data for the selected period
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="ops-btn"
                    onClick={() => { setConfirmingCollected(false); setCollectedConfirmChecked(false); handleCollectedSync(); }}
                    disabled={!collectedConfirmChecked}
                    style={{
                      flex: 1,
                      height: 30,
                      border: 'none',
                      borderRadius: 0,
                      background: !collectedConfirmChecked
                        ? (isDarkMode ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)')
                        : (isDarkMode ? '#3b82f6' : '#2563eb'),
                      color: !collectedConfirmChecked
                        ? (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)')
                        : '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      cursor: !collectedConfirmChecked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Confirm & Sync
                  </button>
                  <button
                    onClick={() => { setConfirmingCollected(false); setCollectedConfirmChecked(false); }}
                    style={{
                      height: 30,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'}`,
                      borderRadius: 0,
                      background: 'none',
                      color: isDarkMode ? '#6b7280' : '#9ca3af',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '0 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="ops-btn"
                onClick={() => { setConfirmingCollected(true); setCollectedConfirmChecked(false); }}
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
            )}

            {/* Month Coverage toggle */}
            <button
              onClick={() => toggleCoverage('collectedTime')}
              style={{
                width: '100%',
                height: 26,
                border: `1px solid ${coverageOpen && monthAuditOp === 'collectedTime' ? 'rgba(59,130,246,0.25)' : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`,
                borderRadius: 0,
                background: coverageOpen && monthAuditOp === 'collectedTime' ? (isDarkMode ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)') : 'none',
                color: coverageOpen && monthAuditOp === 'collectedTime' ? '#3b82f6' : (isDarkMode ? '#475569' : '#94a3b8'),
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <FontIcon iconName={coverageOpen && monthAuditOp === 'collectedTime' ? 'ChevronRight' : 'CalendarWeek'} style={{ fontSize: 10 }} />
              {coverageOpen && monthAuditOp === 'collectedTime' ? 'Close Coverage' : 'Month Coverage'}
            </button>
          </div>
          )}

          {/* ─── WIP Card ─── */}
          {activeOp === 'wip' && (
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
                <span style={{ fontSize: 12, fontWeight: 600, color: isDarkMode ? '#d1d5db' : '#374151' }}>{opsStatus?.wip?.latestDate ? new Date(opsStatus.wip.latestDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
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
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'ytd', 'thisYear', 'lastYear', 'custom'] as RangePreset[]).map((preset) => (
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

            {/* Confirmation / Action */}
            {confirmingWip && !syncingWip ? (
              <div style={{
                padding: '10px 12px',
                background: isDarkMode ? 'rgba(20, 184, 166, 0.06)' : 'rgba(20, 184, 166, 0.03)',
                border: `1px solid ${isDarkMode ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.12)'}`,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#5eead4' : '#0d9488' }}>
                  Confirm Sync — Recorded Time (WIP)
                </div>
                <div style={{ fontSize: 10, color: isDarkMode ? '#cbd5e1' : '#475569', lineHeight: 1.5 }}>
                  This will <strong>delete</strong> existing WIP rows for the selected period and <strong>re-insert</strong> from Clio.
                </div>
                <div style={{
                  display: 'flex',
                  gap: 12,
                  padding: '6px 10px',
                  background: isDarkMode ? 'rgba(15,23,42,0.4)' : 'rgba(248,250,252,0.9)',
                  borderRadius: 2,
                  fontSize: 10,
                  border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                }}>
                  <div>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Period</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>
                      {wipRange.startDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} → {wipRange.endDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preset</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>{PRESET_LABELS[wipRange.preset]}</div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: isDarkMode ? '#e2e8f0' : '#374151' }}>
                  <input
                    type="checkbox"
                    checked={wipConfirmChecked}
                    onChange={(e) => setWipConfirmChecked(e.currentTarget.checked)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#14b8a6' }}
                  />
                  I understand this will replace data for the selected period
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="ops-btn"
                    onClick={() => { setConfirmingWip(false); setWipConfirmChecked(false); handleWipSync(); }}
                    disabled={!wipConfirmChecked}
                    style={{
                      flex: 1,
                      height: 30,
                      border: 'none',
                      borderRadius: 0,
                      background: !wipConfirmChecked
                        ? (isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(20, 184, 166, 0.15)')
                        : (isDarkMode ? '#14b8a6' : '#0d9488'),
                      color: !wipConfirmChecked
                        ? (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)')
                        : '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      cursor: !wipConfirmChecked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Confirm & Sync
                  </button>
                  <button
                    onClick={() => { setConfirmingWip(false); setWipConfirmChecked(false); }}
                    style={{
                      height: 30,
                      border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'}`,
                      borderRadius: 0,
                      background: 'none',
                      color: isDarkMode ? '#6b7280' : '#9ca3af',
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '0 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="ops-btn"
                onClick={() => { setConfirmingWip(true); setWipConfirmChecked(false); }}
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
            )}

            {/* Month Coverage toggle */}
            <button
              onClick={() => toggleCoverage('wip')}
              style={{
                width: '100%',
                height: 26,
                border: `1px solid ${coverageOpen && monthAuditOp === 'wip' ? 'rgba(20,184,166,0.25)' : (isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)')}`,
                borderRadius: 0,
                background: coverageOpen && monthAuditOp === 'wip' ? (isDarkMode ? 'rgba(20,184,166,0.08)' : 'rgba(20,184,166,0.04)') : 'none',
                color: coverageOpen && monthAuditOp === 'wip' ? '#14b8a6' : (isDarkMode ? '#475569' : '#94a3b8'),
                fontSize: 9,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5,
              }}
            >
              <FontIcon iconName={coverageOpen && monthAuditOp === 'wip' ? 'ChevronRight' : 'CalendarWeek'} style={{ fontSize: 10 }} />
              {coverageOpen && monthAuditOp === 'wip' ? 'Close Coverage' : 'Month Coverage'}
            </button>
          </div>
          )}

          {/* ─── Integrity Validator (only for active operation) ─── */}
          {activeOp === 'collected' && (
            <OperationValidator
              operation={collectedValidatorOp}
              startDate={collectedRange.startDate?.toISOString()}
              endDate={collectedRange.endDate?.toISOString()}
              label="Collected Integrity"
              accentColor="#3b82f6"
              userName={userName}
              liveLog={opsLog}
              isSyncing={syncingCollected}
            />
          )}
          {activeOp === 'wip' && (
            <OperationValidator
              operation={wipValidatorOp}
              startDate={wipRange.startDate?.toISOString()}
              endDate={wipRange.endDate?.toISOString()}
              label="WIP Integrity"
              accentColor="#14b8a6"
              userName={userName}
              liveLog={opsLog}
              isSyncing={syncingWip}
            />
          )}

          </div>{/* end left column */}

          {/* ─── Coverage Side Panel ─── */}
          {coverageOpen && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 14px',
              background: isDarkMode ? '#0f172a' : '#fff',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 2,
              maxHeight: 'calc(100vh - 200px)',
              overflowY: 'auto',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FontIcon iconName="CalendarWeek" style={{ fontSize: 12, color: monthAuditOp === 'collectedTime' ? '#3b82f6' : '#14b8a6' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? '#f1f5f9' : '#0f172a' }}>
                  {monthAuditOp === 'collectedTime' ? 'Collected' : 'Recorded'} Coverage
                </span>
              </div>
              <button
                onClick={() => setCoverageOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDarkMode ? '#64748b' : '#94a3b8', fontSize: 12, padding: '2px 4px' }}
              >✕</button>
            </div>

            {/* Toolbar: Team + 12m */}
            {(() => {
              const isCollected = monthAuditOp === 'collectedTime';
              const opKey = isCollected ? 'collected' as const : 'wip' as const;
              const accent = isCollected ? '#3b82f6' : '#14b8a6';
              const monthlyData = isCollected ? monthlyCollected : monthlyWip;
              const isMonthlyOpen = monthlyExpanded === opKey;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button
                      onClick={() => fetchTeamBreakdown(opKey)}
                      disabled={teamLoading}
                      style={{
                        flex: 1, height: 22, border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        borderRadius: 0, background: teamOp === opKey && teamData.length > 0 ? (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)') : 'none',
                        fontSize: 8, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        color: teamOp === opKey && teamData.length > 0 ? accent : (isDarkMode ? '#475569' : '#94a3b8'),
                      }}
                    >
                      {teamLoading ? <Spinner size={SpinnerSize.xSmall} /> : <FontIcon iconName="People" style={{ fontSize: 9 }} />}
                      Team
                    </button>
                    <button
                      onClick={() => { setMonthlyExpanded(isMonthlyOpen ? null : opKey); if (monthlyData.length === 0) fetchMonthlyTotals(opKey); }}
                      style={{
                        flex: 1, height: 22, border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                        borderRadius: 0, background: isMonthlyOpen ? (isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)') : 'none',
                        fontSize: 8, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        color: isMonthlyOpen ? accent : (isDarkMode ? '#475569' : '#94a3b8'),
                      }}
                    >
                      <FontIcon iconName="BarChartVertical" style={{ fontSize: 9 }} />
                      12m
                    </button>
                  </div>

                  {/* Team breakdown inline */}
                  {teamOp === opKey && teamData.length > 0 && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 1,
                      maxHeight: 120, overflowY: 'auto',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 8px', fontSize: 8, fontWeight: 700, color: isDarkMode ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span>{isCollected ? 'Fee Earner' : 'User'}</span>
                        <span>{isCollected ? 'Collected' : 'Value'}</span>
                      </div>
                      {teamData.map((member, i) => {
                        const maxTotal = teamData[0]?.total || 1;
                        const barWidth = Math.max(4, (member.total / maxTotal) * 100);
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', fontSize: 9, position: 'relative' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, background: isDarkMode ? `${accent}11` : `${accent}0a`, zIndex: 0 }} />
                            <span style={{ flex: 1, fontWeight: 500, color: isDarkMode ? '#e2e8f0' : '#1e293b', position: 'relative', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</span>
                            <span style={{ fontWeight: 700, color: accent, fontSize: 9, position: 'relative', zIndex: 1 }}>£{member.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Monthly totals inline */}
                  {isMonthlyOpen && monthlyData.length > 0 && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 1,
                      maxHeight: 160, overflowY: 'auto',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                    }}>
                      {monthlyData.map((mt) => {
                        const maxTotal = Math.max(...monthlyData.map((x) => x.total), 1);
                        const barWidth = Math.max(4, (mt.total / maxTotal) * 100);
                        return (
                          <div key={mt.month} style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', fontSize: 9, position: 'relative' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barWidth}%`, background: isDarkMode ? `${accent}11` : `${accent}0a`, zIndex: 0 }} />
                              <span style={{ fontWeight: 700, minWidth: 44, color: isDarkMode ? '#e2e8f0' : '#1e293b', position: 'relative', zIndex: 1 }}>{mt.month}</span>
                              <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', position: 'relative', zIndex: 1 }}>{mt.rows.toLocaleString()}r</span>
                              {mt.hours != null && mt.hours > 0 && (
                                <span style={{ color: isDarkMode ? '#6b7280' : '#9ca3af', position: 'relative', zIndex: 1 }}>{mt.hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h</span>
                              )}
                              <span style={{ marginLeft: 'auto', fontWeight: 700, color: accent, position: 'relative', zIndex: 1 }}>£{mt.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                            </div>
                            {mt.breakdown && mt.breakdown.length > 1 && (
                              <div style={{ display: 'flex', gap: 8, padding: '0 8px 2px 52px', position: 'relative', zIndex: 1 }}>
                                {mt.breakdown.map(b => (
                                  <span key={b.kind} style={{ fontSize: 7, color: isDarkMode ? '#475569' : '#cbd5e1' }}>
                                    {b.kind} £{b.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Loading */}
            {monthAuditLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8 }}>
                <Spinner size={SpinnerSize.xSmall} />
                <span style={{ fontSize: 9, color: isDarkMode ? '#64748b' : '#94a3b8' }}>Loading coverage…</span>
              </div>
            )}

            {/* Month grid */}
            {!monthAuditLoading && monthAuditData.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {monthAuditData.map((m, idx) => {
                  const hasSynced = !!m.lastSync;
                  const isError = m.lastSync?.status === 'error';
                  const isStartedOnly = m.lastSync?.status === 'started';
                  const accent = monthAuditOp === 'collectedTime' ? '#3b82f6' : '#14b8a6';
                  const isBackfilling = backfillRunning && backfillCurrent === m.key;
                  const hasFailed = backfillErrors.includes(m.key);
                  const stripe = idx % 2 === 0;

                  return (
                    <div
                      key={m.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 6px',
                        background: isBackfilling
                          ? (isDarkMode ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.05)')
                          : stripe
                            ? (isDarkMode ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.5)')
                            : 'transparent',
                        fontSize: 9,
                      }}
                    >
                      {/* Sync dot — only visual indicator */}
                      <span style={{
                        width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                        background: isError ? '#ef4444' : isStartedOnly ? '#fbbf24' : hasSynced ? '#22c55e' : (isDarkMode ? '#272f3d' : '#e8ecf0'),
                      }} />

                      {/* Month label */}
                      <span style={{ fontWeight: 600, fontSize: 9, minWidth: 44, color: isDarkMode ? '#cbd5e1' : '#374151' }}>
                        {m.label}
                      </span>

                      {/* Sync info */}
                      <span style={{ flex: 1, color: isDarkMode ? '#64748b' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {hasSynced
                          ? isStartedOnly
                            ? `${new Date(m.lastSync!.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · started`
                            : `${new Date(m.lastSync!.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}${m.lastSync!.insertedRows != null ? ` · ${m.lastSync!.insertedRows?.toLocaleString()}r` : ''}`
                          : '—'}
                      </span>

                      {/* Per-row sync */}
                      {isBackfilling ? (
                        <Spinner size={SpinnerSize.xSmall} />
                      ) : hasFailed ? (
                        <span style={{ fontSize: 8, color: '#ef4444' }}>✗</span>
                      ) : (
                        <button
                          onClick={() => backfillSingleMonth(m.key)}
                          disabled={backfillRunning}
                          title={hasSynced ? `Re-sync ${m.label}` : `Sync ${m.label}`}
                          style={{
                            background: 'none', border: 'none', cursor: backfillRunning ? 'not-allowed' : 'pointer',
                            padding: '1px 2px', display: 'flex', alignItems: 'center',
                            color: hasSynced ? (isDarkMode ? '#334155' : '#e2e8f0') : accent,
                            opacity: backfillRunning ? 0.3 : 1,
                          }}
                        >
                          <FontIcon iconName="Sync" style={{ fontSize: 8 }} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!monthAuditLoading && monthAuditData.length === 0 && (
              <div style={{ padding: 10, textAlign: 'center', fontSize: 9, color: isDarkMode ? '#475569' : '#94a3b8' }}>
                No coverage data.
              </div>
            )}

            {/* Backfill controls */}
            {!monthAuditLoading && monthAuditData.some((m) => !m.lastSync) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, paddingTop: 8 }}>
                {backfillRunning ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Spinner size={SpinnerSize.xSmall} />
                    <span style={{ fontSize: 9, color: isDarkMode ? '#94a3b8' : '#64748b' }}>
                      {backfillCurrent ?? '…'} — {backfillDone.length}/{monthAuditData.filter((m) => !m.lastSync || backfillDone.includes(m.key)).length}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={backfillUncovered}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '5px 8px',
                      background: isDarkMode
                        ? `${monthAuditOp === 'collectedTime' ? 'rgba(59,130,246,0.08)' : 'rgba(20,184,166,0.08)'}`
                        : `${monthAuditOp === 'collectedTime' ? 'rgba(59,130,246,0.05)' : 'rgba(20,184,166,0.05)'}`,
                      border: `1px solid ${isDarkMode
                        ? `${monthAuditOp === 'collectedTime' ? 'rgba(59,130,246,0.2)' : 'rgba(20,184,166,0.2)'}`
                        : `${monthAuditOp === 'collectedTime' ? 'rgba(59,130,246,0.15)' : 'rgba(20,184,166,0.15)'}`}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      fontSize: 9,
                      fontWeight: 600,
                      color: monthAuditOp === 'collectedTime' ? '#3b82f6' : '#14b8a6',
                      width: '100%',
                    }}
                  >
                    <FontIcon iconName="Sync" style={{ fontSize: 9 }} />
                    Backfill {monthAuditData.filter((m) => !m.lastSync).length} uncovered
                  </button>
                )}
                {!backfillRunning && backfillDone.length > 0 && backfillErrors.length === 0 && (
                  <span style={{ fontSize: 8, color: '#22c55e', textAlign: 'center' }}>
                    ✓ {backfillDone.length} months done
                  </span>
                )}
              </div>
            )}

            {/* Activity — DB ops + server logs side by side */}
            {(backfillLog.length > 0 || opsLog.length > 0) && (
              <div style={{ borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: isDarkMode ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Activity
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* DB operations column */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: isDarkMode ? '#475569' : '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>DB Sync</span>
                    <div style={{ maxHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {backfillLog.length > 0 ? backfillLog.slice(-6).map((entry, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', fontSize: 8,
                          background: i % 2 === 0 ? (isDarkMode ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.5)') : 'transparent',
                        }}>
                          <span style={{ fontSize: 7, fontWeight: 700, color: entry.status === 'completed' ? '#22c55e' : '#ef4444', flexShrink: 0, width: 8, textAlign: 'center' }}>
                            {entry.status === 'completed' ? '✓' : '✗'}
                          </span>
                          <span style={{ color: isDarkMode ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.key}</span>
                          {entry.rows != null && <span style={{ color: isDarkMode ? '#475569' : '#cbd5e1', flexShrink: 0 }}>{entry.rows}r</span>}
                        </div>
                      )) : (
                        <span style={{ fontSize: 8, color: isDarkMode ? '#334155' : '#d1d5db', padding: '2px 4px' }}>—</span>
                      )}
                    </div>
                  </div>
                  {/* Server log column */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <span style={{ fontSize: 7, fontWeight: 700, color: isDarkMode ? '#475569' : '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Server</span>
                    <div style={{ maxHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>
                      {opsLog.length > 0 ? opsLog.slice(0, 4).map((op) => (
                        <div key={op.id} style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 4px', fontSize: 8,
                        }}>
                          <span style={{ fontSize: 7, fontWeight: 700, flexShrink: 0, width: 8, textAlign: 'center', color: op.status === 'completed' ? '#22c55e' : op.status === 'error' ? '#ef4444' : (isDarkMode ? '#64748b' : '#94a3b8') }}>
                            {op.status === 'completed' ? '✓' : op.status === 'error' ? '✗' : '·'}
                          </span>
                          <span style={{ color: isDarkMode ? '#94a3b8' : '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {op.operation?.replace('sync-', '').replace('collectedTime', 'collected')}
                          </span>
                          <span style={{ color: isDarkMode ? '#475569' : '#cbd5e1', marginLeft: 'auto', flexShrink: 0 }}>
                            {new Date(op.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      )) : (
                        <span style={{ fontSize: 8, color: isDarkMode ? '#334155' : '#d1d5db', padding: '2px 4px' }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          </div>{/* end flex row */}
          </>
        )}

        {/* Compact log summary — shown only when no operation card is active */}
        {!activeOp && opsLog.length > 0 && (
          <div style={{
            padding: '6px 12px',
            background: isDarkMode ? 'rgba(15, 23, 42, 0.25)' : 'rgba(248, 250, 252, 0.6)',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 10,
          }}>
            <FontIcon iconName="History" style={{ fontSize: 10, color: isDarkMode ? '#475569' : '#94a3b8' }} />
            <span style={{ color: isDarkMode ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
              Last: {opsLog[0]?.operation?.replace('sync-', '').replace('collectedTime', 'collected')}
            </span>
            <span style={{
              color: opsLog[0]?.status === 'completed' ? '#22c55e' : opsLog[0]?.status === 'error' ? '#ef4444' : (isDarkMode ? '#64748b' : '#94a3b8'),
            }}>
              {opsLog[0]?.status === 'completed' ? '✓' : opsLog[0]?.status === 'error' ? '✗' : '·'} {opsLog[0]?.message || opsLog[0]?.status}
            </span>
            <span style={{ marginLeft: 'auto', color: isDarkMode ? '#334155' : '#d1d5db' }}>
              {opsLog[0]?.ts ? new Date(opsLog[0].ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          </div>
        )}
        </>
        )}
      </section>

      {/* Feed groups — collapsed, planned for future operations */}
      <div style={{
        padding: '14px 18px',
        background: isDarkMode ? 'rgba(30,41,59,0.4)' : 'rgba(248,250,252,0.6)',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FontIcon iconName="Database" style={{ fontSize: 14, color: isDarkMode ? '#475569' : '#94a3b8' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? '#64748b' : '#94a3b8' }}>Feeds</span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            color: isDarkMode ? '#475569' : '#cbd5e1',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '2px 6px',
            background: isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            borderRadius: 2,
          }}>Planned</span>
        </div>
        <span style={{ fontSize: 9, color: isDarkMode ? '#475569' : '#cbd5e1' }}>
          {feedGroups.reduce((n, g) => n + g.feeds.length, 0)} feeds across {feedGroups.length} groups — available in Reports
        </span>
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
