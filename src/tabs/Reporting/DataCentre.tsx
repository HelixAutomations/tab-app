import React from 'react';
import type { CSSProperties } from 'react';
import { DefaultButton, FontIcon, Spinner, SpinnerSize, Modal, DatePicker, Dialog, DialogType, DialogFooter, PrimaryButton, ChoiceGroup } from '@fluentui/react';
import { OperationValidator } from './components/OperationValidator';
import {
  reportingPanelBackground,
  reportingPanelBorder,
  reportingPanelShadow,
  reportingShellBackground,
} from './styles/reportingFoundation';
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
  startDate?: string;
  endDate?: string;
  triggeredBy?: string;
  invokedBy?: string;
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
    ? colours.dark.background
    : colours.light.background,
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
  color: isDarkMode ? colours.subtleGrey : colours.greyText,
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
      bg: isDarkMode ? 'rgba(54, 144, 206, 0.12)' : 'rgba(54, 144, 206, 0.08)',
      border: isDarkMode ? 'rgba(54, 144, 206, 0.3)' : 'rgba(54, 144, 206, 0.2)',
      icon: colours.blue,
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
  color: variant === 'healthy' ? '#22c55e' : variant === 'loading' ? colours.blue : '#ef4444',
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
  background: health === 'ok' ? '#22c55e' : health === 'loading' ? colours.blue : '#ef4444',
  boxShadow:
    health === 'ok'
      ? '0 0 6px rgba(34, 197, 94, 0.5)'
      : health === 'loading'
        ? '0 0 6px rgba(54, 144, 206, 0.5)'
        : '0 0 6px rgba(239, 68, 68, 0.5)',
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
      ? '#22c55e'
      : status === 'loading'
        ? colours.blue
        : status === 'error'
          ? '#ef4444'
          : colours.subtleGrey,
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
  const [previewContextLabel, setPreviewContextLabel] = React.useState<string | null>(null);
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
  const [activeOp, setActiveOp] = React.useState<'collected' | 'wip' | null>(null);
  const [syncExpanded, setSyncExpanded] = React.useState(false);
  const [wipWeekExclusionChecked, setWipWeekExclusionChecked] = React.useState(false);

  /* Month coverage side panel state */
const [monthAuditOp, setMonthAuditOp] = React.useState<'collectedTime' | 'wip' | null>(null);
  const [monthAuditData, setMonthAuditData] = React.useState<MonthAuditEntry[]>([]);
  const [monthAuditLoading, setMonthAuditLoading] = React.useState(false);
  const [coverageOpen, setCoverageOpen] = React.useState(true);
  const [backfillLog, setBackfillLog] = React.useState<Array<{ key: string; ts: string; status: string; rows?: number }>>([]);
  const [expandedCoverageWindows, setExpandedCoverageWindows] = React.useState<Record<string, boolean>>({});
  const [coverageVisibleCount, setCoverageVisibleCount] = React.useState(6);
  const [windowPreviewOpen, setWindowPreviewOpen] = React.useState<Record<string, boolean>>({});
  const [windowPreviewData, setWindowPreviewData] = React.useState<Record<string, TablePreview | null>>({});
  const [windowPreviewLoadingKey, setWindowPreviewLoadingKey] = React.useState<string | null>(null);

  /* ─── Data Hub lazy-load state ─── */
  const [dataHubLoaded, setDataHubLoaded] = React.useState(true);
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
  const autoSyncAttemptedRef = React.useRef<Set<string>>(new Set());

  const syncMonthKey = React.useCallback(async (monthKey: string, op: 'collectedTime' | 'wip') => {
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

  // Auto-open coverage panel and sync to active operation card
  React.useEffect(() => {
    if (!activeOp) return;
    const opKey = activeOp === 'collected' ? 'collectedTime' as const : 'wip' as const;
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
    // Fetch monthly totals if expanded but empty
    const totalsKey = activeOp;
    const totals = activeOp === 'collected' ? monthlyCollected : monthlyWip;
    if (monthlyExpanded === totalsKey && totals.length === 0) {
      fetchMonthlyTotals(totalsKey);
    }
  }, [activeOp]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const syncMessage = data?.message
          ? String(data.message)
          : `−${data.deletedRows?.toLocaleString() ?? 0} / +${data.insertedRows?.toLocaleString() ?? 0} rows in ${((data.durationMs ?? 0) / 1000).toFixed(1)}s`;
        setSyncResultWip({
          success: true,
          message: syncMessage,
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
      if (isRecentWindow) return { label: 'Needs sync', color: '#ef4444', tint: 'rgba(239,68,68,0.12)' };
      if (isMidWindow) return { label: 'Check cadence', color: '#f59e0b', tint: 'rgba(245,158,11,0.10)' };
      return { label: 'Monitor', color: colours.greyText, tint: `${colours.greyText}1A` };
    }

    const syncMs = typeof lastSyncTs === 'string' ? new Date(lastSyncTs).getTime() : lastSyncTs;
    const daysSince = Math.floor((Date.now() - syncMs) / 86400000);
    if (daysSince <= Math.floor(expectedDays * 0.7)) {
      return { label: 'Fresh', color: '#22c55e', tint: 'rgba(34,197,94,0.12)' };
    }
    if (daysSince <= expectedDays) {
      return { label: 'Monitor', color: '#f59e0b', tint: 'rgba(245,158,11,0.10)' };
    }
    if (isRecentWindow) {
      return { label: 'Overdue', color: '#ef4444', tint: 'rgba(239,68,68,0.12)' };
    }
    if (isMidWindow) {
      return { label: 'Stale', color: '#f59e0b', tint: 'rgba(245,158,11,0.10)' };
    }
    return { label: 'Monitor', color: colours.greyText, tint: `${colours.greyText}1A` };
  }, [getMonthAge]);

  const shouldAutoSyncMonth = React.useCallback((entry: MonthAuditEntry): boolean => {
    const monthAge = getMonthAge(entry.key);

    if (!entry.lastSync) {
      return true;
    }

    const syncMs = new Date(entry.lastSync.ts).getTime();
    if (!Number.isFinite(syncMs)) {
      return monthAge <= 2;
    }

    const daysSince = Math.floor((Date.now() - syncMs) / 86400000);
    if (monthAge <= 2) {
      return daysSince > 7;
    }

    if (monthAge <= 5) {
      return daysSince > 30;
    }

    return daysSince > 120;
  }, [getMonthAge]);

  React.useEffect(() => {
    if (!coverageOpen || !monthAuditOp || monthAuditLoading || backfillRunning || monthAuditData.length === 0) {
      return;
    }

    const sortedByRecency = [...monthAuditData].sort((a, b) => a.key < b.key ? 1 : -1);
    const unsyncedOrStale = sortedByRecency
      .filter(shouldAutoSyncMonth)
      .filter((entry) => !autoSyncAttemptedRef.current.has(`${monthAuditOp}:${entry.key}`));

    const activeWindow = unsyncedOrStale.filter((entry) => getMonthAge(entry.key) <= 5);
    const archiveWindow = unsyncedOrStale.filter((entry) => getMonthAge(entry.key) > 5);
    const candidates = [...activeWindow.slice(0, 2), ...archiveWindow.slice(0, 1)];

    if (candidates.length === 0) {
      return;
    }

    let cancelled = false;

    const runSmartAutoSync = async () => {
      for (const month of candidates) {
        if (cancelled) return;

        const dedupeKey = `${monthAuditOp}:${month.key}`;
        autoSyncAttemptedRef.current.add(dedupeKey);
        setBackfillCurrent(month.key);
        setBackfillRunning(true);
        setBackfillDone((prev) => prev.filter((k) => k !== month.key));
        setBackfillErrors((prev) => prev.filter((k) => k !== month.key));

        try {
          const result = await syncMonthKey(month.key, monthAuditOp);
          const rows = result.insertedRows ?? result.totalInserted ?? 0;
          if (cancelled) return;
          setBackfillDone((prev) => [...prev, month.key]);
          setBackfillLog((prev) => [...prev, { key: month.key, ts: new Date().toISOString(), status: 'completed', rows }]);
          setMonthAuditData((prev) => prev.map((m) => (
            m.key === month.key
              ? {
                  ...m,
                  lastSync: { ts: new Date().toISOString(), status: 'completed', insertedRows: rows, invokedBy: 'system' },
                  syncCount: m.syncCount + 1,
                }
              : m
          )));
        } catch {
          if (cancelled) return;
          setBackfillErrors((prev) => [...prev, month.key]);
          setBackfillLog((prev) => [...prev, { key: month.key, ts: new Date().toISOString(), status: 'error' }]);
        }
      }

      if (!cancelled) {
        setBackfillCurrent(null);
        setBackfillRunning(false);
      }
    };

    void runSmartAutoSync();

    return () => {
      cancelled = true;
    };
  }, [coverageOpen, monthAuditOp, monthAuditLoading, backfillRunning, monthAuditData, shouldAutoSyncMonth, syncMonthKey]);

  const recentServerEntries = React.useMemo(() => {
    const opToken = activeOp === 'wip' ? 'wip' : activeOp === 'collected' ? 'collected' : null;
    if (!opToken) return [];
    return opsLog
      .filter((entry) => (entry.operation || '').toLowerCase().includes(opToken))
      .slice(0, 6)
      .map((entry) => ({
        ...entry,
        message: entry.message
          ? entry.message
          : (entry.operation || '')
              .replace('sync', '')
              .replace('CollectedTime', 'Collected')
              .replace('Wip', 'WIP'),
      }));
  }, [opsLog, activeOp]);

  const coverageMonthAuditLogMap = React.useMemo(() => {
    if (!activeOp) return new Map<string, OperationLogEntry[]>();

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={titleStyle}>Data Hub</h1>
            {activeOp && (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 999,
                border: `1px solid ${activeOp === 'collected' ? colours.blue : '#14b8a6'}`,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                background: activeOp === 'collected'
                  ? (isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.12)')
                  : (isDarkMode ? 'rgba(20,184,166,0.2)' : 'rgba(20,184,166,0.12)'),
              }}>
                {activeOp === 'collected' ? 'Collected lane' : 'WIP lane'}
              </span>
            )}
          </div>
          <span style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
            {activeOp ? 'Coverage windows, audit trail, and sync actions' : 'Choose a lane to enter coverage windows'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <DefaultButton
            text={isRefreshing ? 'Refreshing…' : 'Refresh'}
            onClick={onRefreshAll}
            disabled={isRefreshing}
            styles={{
              root: {
                borderRadius: 4,
                height: 30,
                padding: '0 12px',
                fontWeight: 700,
                fontSize: 11,
                border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.55)' : 'rgba(54,144,206,0.45)'}`,
                background: isDarkMode ? 'rgba(54,144,206,0.18)' : 'rgba(54,144,206,0.1)',
                color: isDarkMode ? colours.dark.text : colours.helixBlue,
              },
            }}
          />
          <DefaultButton
            text="Exit Data Hub"
            onClick={onBack}
            styles={{
              root: {
                borderRadius: 4,
                height: 30,
                padding: '0 12px',
                fontWeight: 700,
                fontSize: 11,
                border: `1px solid ${isDarkMode ? 'rgba(214,85,65,0.6)' : 'rgba(214,85,65,0.4)'}`,
                background: isDarkMode ? 'rgba(214,85,65,0.14)' : 'rgba(214,85,65,0.08)',
                color: isDarkMode ? colours.dark.text : colours.cta,
              },
            }}
          />
        </div>
      </div>

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
          <span style={{ fontSize: 9, fontWeight: 600, color: isDarkMode ? '#f87171' : '#dc2626', marginLeft: lastUpdatedLabel ? 0 : 'auto' }}>
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

      {/* ─── Data Operations ─── */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Section Header */}
        {!activeOp && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {isSyncBusy && <Spinner size={SpinnerSize.xSmall} />}
          </div>
        )}

        {/* ─── Entry View — high-level position at a glance ─── */}
        {!activeOp && (
          <div style={{ display: 'flex', gap: 16 }}>
            {(['collected', 'wip'] as const).map((op) => {
              const label = op === 'collected' ? 'Collected Lane' : 'WIP Lane';
              const accent = op === 'collected' ? colours.blue : '#14b8a6';
              const rowCount = op === 'collected' ? opsStatus?.collectedTime?.rowCount : opsStatus?.wip?.rowCount;
              const latestDate = op === 'collected' ? opsStatus?.collectedTime?.latestDate : opsStatus?.wip?.latestDate;
              const staleness = op === 'collected' ? collectedStaleness : wipStaleness;
              const purpose = op === 'collected'
                ? 'Payments captured from Clio into SQL for reporting'
                : 'Recorded work synced with current-week protection';
              return (
                <button
                  key={op}
                  onClick={() => setActiveOp(op)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    padding: '20px 24px',
                    background: reportingPanelBackground(isDarkMode, 'elevated'),
                    border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
                    borderRadius: 6,
                    boxShadow: reportingPanelShadow(isDarkMode),
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 3, height: 14, borderRadius: 1, background: accent }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: isDarkMode ? colours.dark.text : colours.light.text, letterSpacing: '-0.02em' }}>
                    {rowCount?.toLocaleString() ?? '—'}
                    <span style={{ fontSize: 12, fontWeight: 400, color: isDarkMode ? colours.greyText : colours.subtleGrey, marginLeft: 4 }}>rows</span>
                  </div>
                  <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    {purpose}
                  </div>
                  {op === 'wip' && (
                    <div style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                      Current week excluded from SQL · stitched from Clio API in dashboards
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
                    <span>{latestDate ? new Date(latestDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                    {staleness && (
                      <span style={{ color: staleness.colour, fontWeight: 500 }}>
                        {staleness.label}
                      </span>
                    )}
                    <span style={{ marginLeft: 'auto', fontWeight: 600, color: accent }}>Open lane</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Drilled-in View ─── */}
        {activeOp && (
        <>
        {/* Hub lane controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 8px',
          border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
          background: isDarkMode ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.7)',
          borderRadius: 2,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: 3,
            border: `1px solid ${isDarkMode ? colours.dark.borderColor : colours.highlightNeutral}`,
            borderRadius: 2,
            background: isDarkMode ? colours.dark.sectionBackground : colours.light.sectionBackground,
            minWidth: 220,
          }}>
            {(['collected', 'wip'] as const).map((lane) => {
              const isActiveLane = activeOp === lane;
              const laneAccent = lane === 'collected' ? colours.blue : '#14b8a6';
              return (
                <button
                  key={lane}
                  onClick={() => setActiveOp(lane)}
                  style={{
                    border: 'none',
                    borderRadius: 2,
                    cursor: 'pointer',
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    flex: 1,
                    color: isActiveLane
                      ? (isDarkMode ? colours.dark.text : colours.light.text)
                      : (isDarkMode ? colours.subtleGrey : colours.greyText),
                    background: isActiveLane
                      ? (isDarkMode ? `${laneAccent}2E` : `${laneAccent}20`)
                      : 'transparent',
                    boxShadow: isActiveLane ? (isDarkMode ? `inset 0 0 0 1px ${laneAccent}55` : `inset 0 0 0 1px ${laneAccent}44`) : 'none',
                  }}
                >
                  {lane === 'collected' ? 'Collected' : 'WIP'}
                </button>
              );
            })}
          </div>
          {schedulerStatus && (
            <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 500, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
              Scheduler {schedulerStatus.enabled ? 'on' : 'off'}
            </span>
          )}
        </div>

        {/* ─── Main Layout: Integrity → Coverage → Custom Sync ─── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ─── Coverage: one-click compliance ─── */}
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
            Coverage Ledger
          </span>
          <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            Complete lane-scoped audit trail by month window
          </span>
        </div>

        {/* ─── Coverage: one-click compliance + attributed audit trail ─── */}
        {/* Loading */}
        {monthAuditLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8 }}>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Loading coverage…</span>
          </div>
        )}

        {/* Month grid */}
        {!monthAuditLoading && monthAuditData.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...monthAuditData]
              .sort((a, b) => a.key < b.key ? 1 : -1)
              .slice(0, coverageVisibleCount)
              .map((m, idx) => {
              const hasSynced = !!m.lastSync;
              const isError = m.lastSync?.status === 'error';
              const isStartedOnly = m.lastSync?.status === 'started';
              const accent = monthAuditOp === 'collectedTime' ? colours.blue : '#14b8a6';
              const isBackfilling = backfillRunning && backfillCurrent === m.key;
              const hasFailed = backfillErrors.includes(m.key);
              const stripe = idx % 2 === 0;
              const isExpanded = expandedCoverageWindows[m.key] ?? idx < 2;
              const freshnessCue = getFreshnessCue(m.key, m.lastSync?.ts);
              const monthAuditEntries = coverageMonthAuditLogMap.get(m.key) || [];
              const fallbackAudit = monthAuditEntries.length === 0 && m.lastSync
                ? [{
                    id: `${m.key}-fallback`,
                    ts: new Date(m.lastSync.ts).getTime(),
                    operation: monthAuditOp === 'collectedTime' ? 'syncCollectedTime' : 'syncWip',
                    status: (m.lastSync.status as OperationLogEntry['status']) || 'completed',
                    message: m.lastSync.message || `${m.label} coverage sync`,
                  } as OperationLogEntry]
                : [];
              const visibleAuditEntries = monthAuditEntries.length > 0 ? monthAuditEntries : fallbackAudit;

              /* Format the sync summary line */
              const syncWho = m.lastSync?.invokedBy || null;
              const syncDate = m.lastSync?.ts ? new Date(m.lastSync.ts) : null;
              const syncDateStr = syncDate
                ? syncDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : null;
              const syncRows = m.lastSync?.insertedRows;
              const hasStats = !!m.stats && m.stats.totalRows > 0;
              const tableName = monthAuditOp === 'collectedTime' ? 'collectedTime' : 'wip';
              const isPreviewOpen = windowPreviewOpen[m.key] ?? false;
              const previewForWindow = windowPreviewData[m.key] ?? null;

              const validationEntry: OperationLogEntry | null = m.lastValidate ? {
                id: `${m.key}-validate-${m.lastValidate.ts}`,
                ts: new Date(m.lastValidate.ts).getTime(),
                operation: 'validate',
                status: (m.lastValidate.status || '').toLowerCase().includes('error') ? 'error' : 'completed',
                message: m.lastValidate.message || 'Validation completed',
                invokedBy: m.lastValidate.invokedBy,
              } : null;

              const syncSnapshotEntry: OperationLogEntry | null = m.lastSync ? {
                id: `${m.key}-sync-${m.lastSync.ts}`,
                ts: new Date(m.lastSync.ts).getTime(),
                operation: 'sync',
                status: ((m.lastSync.status as OperationLogEntry['status']) || 'completed'),
                message: m.lastSync.message || `${m.lastSync.insertedRows?.toLocaleString() ?? 0} rows synced`,
                invokedBy: m.lastSync.invokedBy,
              } : null;

              const mergedLedgerEntries = [
                ...visibleAuditEntries,
                ...(validationEntry ? [validationEntry] : []),
                ...(syncSnapshotEntry ? [syncSnapshotEntry] : []),
              ]
                .reduce((acc, entry) => {
                  if (!acc.find((e) => e.id === entry.id)) acc.push(entry);
                  return acc;
                }, [] as OperationLogEntry[])
                .sort((a, b) => (b.ts || 0) - (a.ts || 0));

              return (
                <div
                  key={m.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '8px 10px',
                    background: isBackfilling
                      ? (isDarkMode ? 'rgba(54,144,206,0.1)' : 'rgba(54,144,206,0.05)')
                      : stripe
                        ? (isDarkMode ? 'rgba(15,23,42,0.3)' : 'rgba(248,250,252,0.5)')
                        : 'transparent',
                    fontSize: 9,
                    border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'}`,
                    borderLeft: `3px solid ${isError ? colours.cta : isStartedOnly ? colours.orange : freshnessCue.color}`,
                    borderRadius: 2,
                  }}
                >
                  {/* Window header: month + state + freshness + actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setExpandedCoverageWindows((prev) => ({ ...prev, [m.key]: !isExpanded }))}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isDarkMode ? colours.greyText : colours.subtleGrey }}
                      title={isExpanded ? 'Collapse window' : 'Expand window'}
                    >
                      <FontIcon iconName={isExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 9 }} />
                    </button>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 0,
                        border: `1px solid ${hasSynced && !isError ? `${colours.green}88` : isError ? `${colours.cta}88` : (isDarkMode ? colours.dark.borderColor : colours.highlightNeutral)}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 700,
                        color: hasSynced && !isError ? colours.green : isError ? colours.cta : (isDarkMode ? colours.greyText : colours.subtleGrey),
                        flexShrink: 0,
                      }}
                    >
                      {hasSynced && !isError ? '✓' : isError ? '!' : ''}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 10, minWidth: 60, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {m.label}
                      {m.currentWeekExcluded && (
                        <span title="Current week excluded — sourced live from Clio" style={{ marginLeft: 4, display: 'inline-flex', alignItems: 'center' }}>
                          <FontIcon iconName="Info" style={{ fontSize: 9, color: colours.blue }} />
                        </span>
                      )}
                    </span>

                    <span style={{
                      fontSize: 8,
                      fontWeight: 600,
                      color: freshnessCue.color,
                      background: isDarkMode ? freshnessCue.tint : freshnessCue.tint,
                      border: `1px solid ${freshnessCue.color}33`,
                      borderRadius: 999,
                      padding: '1px 6px',
                    }}>
                      {freshnessCue.label}
                    </span>

                    {isStartedOnly && (
                      <span style={{ fontSize: 9, fontWeight: 500, color: colours.orange }}>⏳ syncing</span>
                    )}
                    {isError && (
                      <span style={{ fontSize: 9, fontWeight: 500, color: colours.cta }}>error</span>
                    )}

                    {/* Inline sync info */}
                    {hasSynced && !isStartedOnly && (
                      <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        {syncDateStr}{syncRows != null ? ` · ${syncRows.toLocaleString()}r` : ''}
                      </span>
                    )}

                    {/* Inline stats */}
                    {hasStats && monthAuditOp === 'wip' && m.stats && (
                      <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        {m.stats.billableRows.toLocaleString()}b / {m.stats.nonBillableRows.toLocaleString()}nb
                        {m.stats.nonBillableRows === 0 && m.stats.totalRows > 0 && (
                          <span style={{ color: colours.cta, marginLeft: 3 }} title="Verify non-billable entries exist in Clio">⚠</span>
                        )}
                      </span>
                    )}
                    {hasStats && monthAuditOp === 'collectedTime' && m.stats && (
                      <span style={{ fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        {m.stats.totalRows.toLocaleString()}r · £{m.stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    )}

                    <span style={{ flex: 1 }} />

                    {/* Action cluster (separated from time metadata) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => {
                          const nextOpen = !isPreviewOpen;
                          setWindowPreviewOpen((prev) => ({ ...prev, [m.key]: nextOpen }));
                          if (nextOpen && !previewForWindow && windowPreviewLoadingKey !== m.key) {
                            void fetchWindowPreview(m.key, tableName);
                          }
                        }}
                        style={{
                          border: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.35)' : colours.highlightNeutral}`,
                          background: 'transparent',
                          color: isDarkMode ? colours.subtleGrey : colours.greyText,
                          fontSize: 8,
                          fontWeight: 600,
                          padding: '2px 6px',
                          cursor: 'pointer',
                          borderRadius: 2,
                        }}
                        title={`Preview ${tableName} table`}
                      >
                        {isPreviewOpen ? 'Hide table' : 'Show table'}
                      </button>

                    {isBackfilling ? (
                      <Spinner size={SpinnerSize.xSmall} />
                    ) : hasFailed ? (
                      <span style={{ fontSize: 9, color: colours.cta }}>✗</span>
                    ) : (
                      <button
                        onClick={() => backfillSingleMonth(m.key)}
                        disabled={backfillRunning}
                        title={hasSynced ? `Re-sync ${m.label}` : `Sync ${m.label}`}
                        style={{
                          background: 'none', border: 'none', cursor: backfillRunning ? 'not-allowed' : 'pointer',
                          padding: '1px 3px', display: 'flex', alignItems: 'center',
                          color: hasSynced ? (isDarkMode ? colours.greyText : colours.highlightNeutral) : accent,
                          opacity: backfillRunning ? 0.3 : 1,
                        }}
                      >
                        <FontIcon iconName="Sync" style={{ fontSize: 9 }} />
                      </button>
                    )}
                    </div>
                  </div>

                  {isExpanded && (
                  <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 9,
                    color: isDarkMode ? colours.greyText : colours.subtleGrey,
                    padding: '4px 0 2px 18px',
                  }}>
                    <span>{syncWho ? `by ${syncWho}` : 'not yet synced'}</span>
                    <span>{syncDateStr ? `at ${syncDateStr}` : 'no timestamp'}</span>
                    {syncRows != null && <span>{syncRows.toLocaleString()} rows</span>}
                    {hasStats && monthAuditOp === 'collectedTime' && m.stats && (
                      <span>{m.stats.totalRows.toLocaleString()}r</span>
                    )}
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 9,
                      fontWeight: 700,
                      color: isDarkMode ? colours.dark.text : colours.light.text,
                    }}>
                      {mergedLedgerEntries.length} ledger event{mergedLedgerEntries.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 18 }}>
                    {mergedLedgerEntries.length === 0 ? (
                      <span style={{ fontSize: 8, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
                        No ledger events for this month window
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
                          ? 'VALIDATION'
                          : operationLower.includes('sync')
                            ? 'SYNC'
                            : 'AUDIT';
                        return (
                          <div key={entry.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6, fontSize: 8,
                            padding: '5px 6px',
                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                            background: isDarkMode ? 'rgba(2,6,23,0.45)' : 'rgba(255,255,255,0.92)',
                            borderRadius: 2,
                          }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                            <span style={{ color: statusColor, fontWeight: 700, textTransform: 'uppercase', minWidth: 58 }}>
                              {statusLabel}
                            </span>
                            <span style={{
                              color: isDarkMode ? colours.subtleGrey : colours.greyText,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              minWidth: 70,
                            }}>
                              {eventType}
                            </span>
                            <span style={{
                              color: isAuto ? (isDarkMode ? colours.blue : colours.helixBlue) : (isDarkMode ? colours.cta : colours.cta),
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              minWidth: 48,
                            }}>
                              {isAuto ? 'SYSTEM' : 'USER'}
                            </span>
                            <span style={{ color: isDarkMode ? colours.dark.text : colours.light.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 9 }}>
                              {entry.message || entry.operation}
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
                      marginLeft: 18,
                      marginTop: 4,
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                      borderRadius: 2,
                      background: isDarkMode ? 'rgba(2,6,23,0.4)' : 'rgba(255,255,255,0.9)',
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

                      {windowPreviewLoadingKey === m.key ? (
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
                                  <th key={col} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, color: isDarkMode ? colours.subtleGrey : colours.greyText, fontWeight: 700 }}>
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewForWindow.rows.slice(0, 8).map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {previewForWindow.columns.slice(0, 6).map((col) => (
                                    <td key={col} style={{ padding: '4px 6px', borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`, color: isDarkMode ? colours.dark.text : colours.light.text, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={String((row as Record<string, unknown>)[col] ?? '—')}>
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
                  </>
                  )}
                </div>
              );
            })}

            {monthAuditData.length > coverageVisibleCount && (
              <button
                onClick={() => setCoverageVisibleCount((prev) => prev + 6)}
                style={{
                  border: `1px solid ${isDarkMode ? 'rgba(75,85,99,0.35)' : colours.highlightNeutral}`,
                  background: 'transparent',
                  color: isDarkMode ? colours.subtleGrey : colours.greyText,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '6px 10px',
                  borderRadius: 2,
                  cursor: 'pointer',
                  alignSelf: 'center',
                }}
              >
                Show more windows ({monthAuditData.length - coverageVisibleCount} remaining)
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!monthAuditLoading && monthAuditData.length === 0 && (
          <div style={{ padding: 10, textAlign: 'center', fontSize: 9, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
            No coverage data.
          </div>
        )}

        {/* Backfill controls */}
        {!monthAuditLoading && monthAuditData.some((m) => !m.lastSync) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, paddingTop: 8 }}>
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
                  background: isDarkMode
                    ? `${monthAuditOp === 'collectedTime' ? 'rgba(54,144,206,0.08)' : 'rgba(20,184,166,0.08)'}`
                    : `${monthAuditOp === 'collectedTime' ? 'rgba(54,144,206,0.05)' : 'rgba(20,184,166,0.05)'}`,
                  border: `1px solid ${isDarkMode
                    ? `${monthAuditOp === 'collectedTime' ? 'rgba(54,144,206,0.2)' : 'rgba(20,184,166,0.2)'}`
                    : `${monthAuditOp === 'collectedTime' ? 'rgba(54,144,206,0.15)' : 'rgba(20,184,166,0.15)'}`}`,
                  borderRadius: 2,
                  cursor: 'pointer',
                  fontSize: 9,
                  fontWeight: 600,
                  color: monthAuditOp === 'collectedTime' ? colours.blue : '#14b8a6',
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

        {/* ─── Custom Sync (debugging tool — collapsed by default) ─── */}
        <button
          onClick={() => setSyncExpanded(!syncExpanded)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            background: 'none',
            border: 'none',
            borderTop: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
            borderRadius: 0,
            cursor: 'pointer',
            fontSize: 10,
            fontWeight: 500,
            color: isDarkMode ? colours.greyText : colours.subtleGrey,
            marginTop: 4,
          }}
        >
          <FontIcon iconName={syncExpanded ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 7 }} />
          Custom Sync
          {isSyncBusy && <Spinner size={SpinnerSize.xSmall} style={{ marginLeft: 'auto' }} />}
        </button>

        {syncExpanded && (
        <>
        {/* ─── Integrity Validation (moved from top) ─── */}
        {activeOp === 'collected' && (
          <OperationValidator
            operation={collectedValidatorOp}
            startDate={collectedRange.startDate?.toISOString()}
            endDate={collectedRange.endDate?.toISOString()}
            label="Collected Integrity"
            accentColor={colours.blue}
            userName={userName}
            liveLog={recentServerEntries}
            isSyncing={syncingCollected}
            mode="full"
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
            liveLog={recentServerEntries}
            isSyncing={syncingWip}
            mode="full"
          />
        )}

        {/* ─── Collected Time Card ─── */}
          {activeOp === 'collected' && (
          <div
            style={{
              padding: '14px 16px',
              background: reportingPanelBackground(isDarkMode, 'elevated'),
              border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
              borderRadius: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>Custom Sync</span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.highlightNeutral }}>collectedTime</span>
            </div>

            {/* Stats — compact single row */}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              <span><strong style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{opsStatus?.collectedTime?.rowCount?.toLocaleString() ?? '—'}</strong> rows</span>
              <span>Latest: {opsStatus?.collectedTime?.latestDate ? new Date(opsStatus.collectedTime.latestDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
              {collectedLastSync && (
                <span style={{ marginLeft: 'auto' }}>Synced: {new Date(collectedLastSync.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>

            {/* Range Selector — segmented group */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: isDarkMode ? 'rgba(55, 65, 81, 0.6)' : '#f5f5f5', padding: 2, borderRadius: 2 }}>
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'ytd', 'thisYear', 'lastYear', 'custom'] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  
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
                      ? (isDarkMode ? colours.blue : colours.blue)
                      : (isDarkMode ? colours.greyText : colours.subtleGrey),
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
                
              }}>
                <DatePicker
                  placeholder="Start"
                  value={collectedRange.startDate || undefined}
                  onSelectDate={(date) => setCustomDates('collected', date, collectedRange.endDate)}
                  {...getDatePickerProps(isDarkMode)}
                />
                <FontIcon iconName="Forward" style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.highlightNeutral }} />
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
                background: isDarkMode ? 'rgba(54, 144, 206, 0.06)' : 'rgba(54, 144, 206, 0.03)',
                border: `1px solid ${isDarkMode ? 'rgba(54, 144, 206, 0.2)' : 'rgba(54, 144, 206, 0.12)'}`,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isDarkMode ? colours.blue : colours.missedBlue }}>
                  Confirm Sync — Collected Time
                </div>
                <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, lineHeight: 1.5 }}>
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
                    <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Period</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {collectedRange.startDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} → {collectedRange.endDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Mode</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{planModeLabel}</div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preset</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{PRESET_LABELS[collectedRange.preset]}</div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: isDarkMode ? colours.dark.text : colours.dark.border }}>
                  <input
                    type="checkbox"
                    checked={collectedConfirmChecked}
                    onChange={(e) => setCollectedConfirmChecked(e.currentTarget.checked)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: colours.blue }}
                  />
                  I understand this will replace data for the selected period
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    
                    onClick={() => { setConfirmingCollected(false); setCollectedConfirmChecked(false); handleCollectedSync(); }}
                    disabled={!collectedConfirmChecked}
                    style={{
                      flex: 1,
                      height: 30,
                      border: 'none',
                      borderRadius: 0,
                      background: !collectedConfirmChecked
                        ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)')
                        : (colours.blue),
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
                      border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.3)' : colours.highlightNeutral}`,
                      borderRadius: 0,
                      background: 'none',
                      color: isDarkMode ? colours.greyText : colours.subtleGrey,
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
                
                onClick={() => { setConfirmingCollected(true); setCollectedConfirmChecked(false); }}
                disabled={!collectedRange.startDate || !collectedRange.endDate || isSyncBusy}
                style={{
                  width: '100%',
                  height: 34,
                  border: 'none',
                  borderRadius: 0,
                  background: (!collectedRange.startDate || !collectedRange.endDate || isSyncBusy)
                    ? (isDarkMode ? 'rgba(54, 144, 206, 0.25)' : 'rgba(54, 144, 206, 0.15)')
                    : (colours.blue),
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

          </div>
          )}

          {/* ─── WIP Card ─── */}
          {activeOp === 'wip' && (
          <div
            style={{
              padding: '14px 16px',
              background: reportingPanelBackground(isDarkMode, 'elevated'),
              border: `1px solid ${reportingPanelBorder(isDarkMode, 'strong')}`,
              borderRadius: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Card Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 12, color: isDarkMode ? colours.dark.text : colours.light.text }}>Custom Sync</span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.highlightNeutral }}>wip</span>
            </div>

            {/* Stats — compact single row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11, color: isDarkMode ? colours.subtleGrey : colours.greyText }}>
              <span><strong style={{ color: isDarkMode ? colours.dark.text : colours.light.text }}>{opsStatus?.wip?.rowCount?.toLocaleString() ?? '—'}</strong> rows</span>
              <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>Current week excluded from SQL · stitched from Clio API in dashboards</span>
              <span>Latest: {opsStatus?.wip?.latestDate ? new Date(opsStatus.wip.latestDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}</span>
              {opsStatus?.wip?.lastSync && (
                <span style={{ marginLeft: 'auto' }}>Synced: {new Date(opsStatus.wip.lastSync.ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              )}
            </div>

            {/* Range Selector — segmented group */}
            <div style={{ display: 'flex', flexWrap: 'wrap', background: isDarkMode ? 'rgba(55, 65, 81, 0.6)' : '#f5f5f5', padding: 2, borderRadius: 2 }}>
              {(['today', 'yesterday', 'thisWeek', 'lastWeek', 'rolling7d', 'rolling14d', 'thisMonth', 'lastMonth', 'ytd', 'thisYear', 'lastYear', 'custom'] as RangePreset[]).map((preset) => (
                <button
                  key={preset}
                  
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
                      : (isDarkMode ? colours.greyText : colours.subtleGrey),
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
                
              }}>
                <DatePicker
                  placeholder="Start"
                  value={wipRange.startDate || undefined}
                  onSelectDate={(date) => setCustomDates('wip', date, wipRange.endDate)}
                  {...getDatePickerProps(isDarkMode)}
                />
                <FontIcon iconName="Forward" style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.highlightNeutral }} />
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
                <div style={{ fontSize: 10, color: isDarkMode ? colours.subtleGrey : colours.greyText, lineHeight: 1.5 }}>
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
                    <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Period</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>
                      {wipRange.startDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })} → {wipRange.endDate?.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: isDarkMode ? colours.greyText : colours.subtleGrey, fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preset</span>
                    <div style={{ fontWeight: 600, color: isDarkMode ? colours.dark.text : colours.light.text }}>{PRESET_LABELS[wipRange.preset]}</div>
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: isDarkMode ? colours.dark.text : colours.dark.border }}>
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
                    
                    onClick={() => { setConfirmingWip(false); setWipConfirmChecked(false); setWipWeekExclusionChecked(false); handleWipSync(); }}
                    disabled={!wipConfirmChecked || (wipWillExcludeCurrentWeek && !wipWeekExclusionChecked)}
                    style={{
                      flex: 1,
                      height: 30,
                      border: 'none',
                      borderRadius: 0,
                      background: (!wipConfirmChecked || (wipWillExcludeCurrentWeek && !wipWeekExclusionChecked))
                        ? (isDarkMode ? 'rgba(20, 184, 166, 0.25)' : 'rgba(20, 184, 166, 0.15)')
                        : (isDarkMode ? '#14b8a6' : '#0d9488'),
                      color: (!wipConfirmChecked || (wipWillExcludeCurrentWeek && !wipWeekExclusionChecked))
                        ? (isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.6)')
                        : '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      cursor: (!wipConfirmChecked || (wipWillExcludeCurrentWeek && !wipWeekExclusionChecked)) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Confirm & Sync
                  </button>
                  <button
                    onClick={() => { setConfirmingWip(false); setWipConfirmChecked(false); setWipWeekExclusionChecked(false); }}
                    style={{
                      height: 30,
                      border: `1px solid ${isDarkMode ? 'rgba(75, 85, 99, 0.3)' : colours.highlightNeutral}`,
                      borderRadius: 0,
                      background: 'none',
                      color: isDarkMode ? colours.greyText : colours.subtleGrey,
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '0 12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {wipWillExcludeCurrentWeek && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 10, color: '#f59e0b' }}>
                    <input
                      type="checkbox"
                      checked={wipWeekExclusionChecked}
                      onChange={(e) => setWipWeekExclusionChecked(e.currentTarget.checked)}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#f59e0b' }}
                    />
                    I understand current week (Mon→today) will not be written to SQL.
                  </label>
                )}
              </div>
            ) : (
              <button
                
                onClick={() => { setConfirmingWip(true); setWipConfirmChecked(false); setWipWeekExclusionChecked(false); }}
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

          </div>
          )}
          </>)}{/* end sync accordion */}

          </div>{/* end main layout */}
        </>
        )}
      </section>

      {/* Feed groups */}
      <div style={{
        padding: '10px 14px',
        background: isDarkMode ? 'rgba(30,41,59,0.3)' : 'rgba(248,250,252,0.5)',
        border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: isDarkMode ? colours.greyText : colours.subtleGrey }}>
          Feeds · {feedGroups.reduce((n, g) => n + g.feeds.length, 0)} across {feedGroups.length} groups
        </span>
        <span style={{ fontSize: 10, color: isDarkMode ? colours.greyText : colours.highlightNeutral }}>planned</span>
      </div>

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

export default DataCentre;
