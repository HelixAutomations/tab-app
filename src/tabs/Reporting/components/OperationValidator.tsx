import React, { useEffect, useState, useCallback } from 'react';
import { Spinner, SpinnerSize, Icon } from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';

/* ═══════════════════════════════════════════════════════════
   OperationValidator — Data Integrity Panel
   
   Three layers:
   1. Confidence strip  — traffic-light answer: "Is this number right?"
   2. Activity timeline  — auto/manual ops log, open by default
   3. Explain + drill    — full breakdown with clickable sample modals
   ═══════════════════════════════════════════════════════════ */

// ── Types ──

interface LiveLogEntry {
  id: string;
  ts: number;
  operation: string;
  status: 'started' | 'progress' | 'completed' | 'error';
  daysBack?: number;
  deletedRows?: number;
  insertedRows?: number;
  durationMs?: number;
  message?: string;
}

interface Props {
  operation: string;
  startDate?: string;
  endDate?: string;
  label?: string;
  accentColor?: string;
  userName?: string;
  onValidationComplete?: (isValid: boolean) => void;
  /** In-memory processing log entries for side-by-side live view */
  liveLog?: LiveLogEntry[];
  /** Whether a sync is currently running */
  isSyncing?: boolean;
}

interface SpotCheck {
  name: string;
  userId: number;
  rows: number;
  total: number;
  clioRows?: number;
  clioTotal?: number;
}

interface KindBreakdown {
  kind: string;
  rows: number;
  payments: number;
  total: number;
  hours?: number;
}

interface ValidateData {
  lastRun: any;
  sqlCount: number;
  clioCount: number | null;
  totalRows: number;
  uniqueIds: number;
  sqlSum: number | null;
  clioSum: number | null;
  spotChecks: SpotCheck[];
  kindBreakdown?: KindBreakdown[];
  hours?: number;
  dataSource?: 'api' | 'reports';
  match: boolean;
  deep: boolean;
}

interface OpsLogEntry {
  id: number;
  ts: string;
  operation: string;
  entity: string;
  status: string;
  message: string;
  deletedRows: number | null;
  insertedRows: number | null;
  durationMs: number | null;
  startDate: string | null;
  endDate: string | null;
  triggeredBy?: string;
  invokedBy?: string;
}

interface ExplainData {
  operation: string;
  table: string;
  dateRange: { start: string; end: string; dateColumn: string };
  summary: {
    totalRows: number;
    uniqueIds: number;
    extraRows: number;
    totalSum: number;
    earliest: string;
    latest: string;
    uniqueUsers: number;
    uniqueMatters: number;
  };
  sumComparison: {
    sumAllRows: number;
    sumDistinctIds: number;
    difference: number;
    warning: string | null;
  };
  duplicateDistribution: { occurrences: number; distinctIds: number; totalRows: number }[];
  topMultiRowIds: { id: number; rowCount: number; totalAmount: number; userName: string; matterDesc: string }[];
  perUser: { name: string; userId: number; totalRows: number; uniqueIds: number; extraRows: number; sum: number }[];
  queries: { label: string; sql: string }[];
  pipeline: { step: number; label: string; detail: string }[];
}

interface SampleData {
  id: number;
  rowCount: number;
  totalAmount: number;
  distinctBills: number;
  explanation: string;
  rows: { billId: number; matterId: number; userName: string; amount: number; paymentDate: string; description: string; kind: string; type: string }[];
}

// ── Helpers ──

const fmtMoney = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  return `£${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (iso: string | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const fmtLogTime = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `${time} today`;
  if (isYesterday) return `${time} yesterday`;
  return `${time} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;
};


// ── Component ──

export const OperationValidator: React.FC<Props> = ({ operation, startDate, endDate, label, accentColor, userName, liveLog = [], isSyncing = false }) => {
  const { isDarkMode } = useTheme();

  // Data state
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [data, setData] = useState<ValidateData | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Checking...');

  // Log state — open by default
  const [logEntries, setLogEntries] = useState<OpsLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(true);

  // Explain state
  const [explainData, setExplainData] = useState<ExplainData | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);

  // Sample modal state
  const [sampleData, setSampleData] = useState<SampleData | null>(null);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleId, setSampleId] = useState<number | null>(null);

  // Explain sub-section toggles (all collapsed by default)
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [sumImpactOpen, setSumImpactOpen] = useState(false);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [splitsOpen, setSplitsOpen] = useState(false);
  const [perUserOpen, setPerUserOpen] = useState(false);
  const [queriesOpen, setQueriesOpen] = useState(false);

  const isCollected = operation?.includes('Collected');
  const accent = accentColor || (isCollected ? '#3b82f6' : '#14b8a6');

  // ── Colour palette ──

  const dim = isDarkMode ? '#94a3b8' : '#64748b';
  const bright = isDarkMode ? '#f1f5f9' : '#0f172a';
  const sub = isDarkMode ? '#cbd5e1' : '#475569';
  const cardBg = isDarkMode ? '#1e293b' : '#fff';
  const borderCol = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const sep = isDarkMode ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9';
  const recessBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)';
  const subtleBorder = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  // ── Data fetching ──

  const runValidation = useCallback(async (deep = false) => {
    if (!startDate || !endDate) { setData(null); return; }
    if (deep) {
      setDeepLoading(true);
      setLoadingMessage(isCollected ? 'Generating Clio report — 30-60s…' : 'Checking against Activities API…');
    } else {
      setLoadingMessage('Checking…');
    }
    setLoading(true);
    try {
      const s = typeof startDate === 'string' ? startDate : (startDate as any).toISOString();
      const e = typeof endDate === 'string' ? endDate : (endDate as any).toISOString();
      const deepParam = deep ? '&deep=true' : '';
      const invokerParam = deep && userName ? `&invokedBy=${encodeURIComponent(userName)}` : '';
      const res = await fetch(`/api/data-operations/validate?operation=${operation}&startDate=${s}&endDate=${e}${deepParam}${invokerParam}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setDeepLoading(false); }
  }, [operation, startDate, endDate, isCollected]);

  const fetchLog = useCallback(async () => {
    try {
      const opPrefix = operation?.includes('Collected') ? 'syncCollectedTime' :
                       operation?.includes('Wip') ? 'syncWip' : operation;
      const res = await fetch(`/api/data-operations/ops-log?operation=${opPrefix}&limit=20`);
      if (res.ok) {
        const json = await res.json();
        setLogEntries(json.entries || []);
      }
    } catch (e) { console.error(e); }
  }, [operation]);

  const fetchExplain = useCallback(async () => {
    if (!startDate || !endDate) return;
    setExplainLoading(true);
    try {
      const s = typeof startDate === 'string' ? startDate : (startDate as any).toISOString();
      const e = typeof endDate === 'string' ? endDate : (endDate as any).toISOString();
      const res = await fetch(`/api/data-operations/explain?operation=${operation}&startDate=${s}&endDate=${e}`);
      if (res.ok) setExplainData(await res.json());
    } catch (e) { console.error(e); }
    finally { setExplainLoading(false); }
  }, [operation, startDate, endDate]);

  const fetchSample = useCallback(async (id: number) => {
    if (!startDate || !endDate) return;
    setSampleId(id);
    setSampleLoading(true);
    setSampleData(null);
    try {
      const s = typeof startDate === 'string' ? startDate : (startDate as any).toISOString();
      const e = typeof endDate === 'string' ? endDate : (endDate as any).toISOString();
      const res = await fetch(`/api/data-operations/explain/sample?operation=${operation}&id=${id}&startDate=${s}&endDate=${e}`);
      if (res.ok) setSampleData(await res.json());
    } catch (e) { console.error(e); }
    finally { setSampleLoading(false); }
  }, [operation, startDate, endDate]);

  // ── Effects ──

  useEffect(() => {
    if (!startDate || !endDate) { setData(null); return; }
    const t = setTimeout(() => runValidation(false), 600);
    return () => clearTimeout(t);
  }, [operation, startDate, endDate, runValidation]);

  // Fetch log on mount (open by default) and when toggled
  useEffect(() => { if (logOpen) fetchLog(); }, [logOpen, fetchLog]);

  // Lazy load explain
  useEffect(() => { if (explainOpen && !explainData) fetchExplain(); }, [explainOpen, explainData, fetchExplain]);

  if (!startDate || !endDate) return null;

  // ── Derived state ──

  const splitCount = data ? data.totalRows - data.uniqueIds : 0;
  const hasSplits = splitCount > 0;
  // Compare totalRows (not uniqueIds) against Clio — splits are expected
  const rowCountMatch = data?.clioCount !== null && data?.clioCount !== undefined
    ? data?.totalRows === data?.clioCount : null;
  const sumMatch = data?.sqlSum !== null && data?.clioSum !== null && data?.sqlSum !== undefined && data?.clioSum !== undefined
    ? Math.abs((data.sqlSum || 0) - (data.clioSum || 0)) < 0.01 : null;
  // Healthy = counts match (totalRows = clioCount) and sums match. Splits are fine.
  const isHealthy = data?.match === true;
  const isVerified = isHealthy && sumMatch === true;
  const hasMismatch = rowCountMatch === false;
  const hasSumMismatch = sumMatch === false;

  // Traffic light
  const statusColor = loading ? '#94a3b8'
    : !data ? '#e2e8f0'
    : hasMismatch || hasSumMismatch ? '#ef4444'
    : isVerified ? '#22c55e'
    : isHealthy && hasSplits ? '#22c55e'
    : isHealthy ? '#22c55e'
    : data.clioCount === null ? '#3b82f6'
    : '#f59e0b';

  // Status message for confidence strip
  const getConfidenceMessage = () => {
    if (!data) return null;
    const total = fmtMoney(data.sqlSum);

    if (hasMismatch) {
      return { text: `Row mismatch: ${data.totalRows.toLocaleString()} vs ${data.clioCount!.toLocaleString()} expected`, tone: 'bad' as const };
    }
    if (hasSumMismatch) {
      return { text: `£${Math.abs((data.sqlSum || 0) - (data.clioSum || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} discrepancy — run deep validate`, tone: 'bad' as const };
    }
    if (isVerified) {
      const kindSummary = data.kindBreakdown && data.kindBreakdown.length > 0
        ? data.kindBreakdown.map(k => `${k.kind} ${fmtMoney(k.total)}`).join(' · ')
        : total;
      const source = data.dataSource === 'api' ? 'Activities API' : 'Clio';
      return { text: `${kindSummary} · verified against ${source}`, tone: 'good' as const };
    }
    const entityLabel = isCollected ? 'payments' : 'activities';
    const hoursTag = !isCollected && data.hours ? ` · ${data.hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h` : '';
    if (isHealthy) {
      return { text: `${total} · ${data.uniqueIds.toLocaleString()} ${entityLabel}${hoursTag}`, tone: 'good' as const };
    }
    if (data.clioCount === null) {
      return { text: `${data.uniqueIds.toLocaleString()} ${entityLabel}${hoursTag} · ${total}`, tone: 'neutral' as const };
    }
    return { text: `${data.uniqueIds.toLocaleString()} ${entityLabel}${hoursTag} · ${total}`, tone: 'neutral' as const };
  };

  const confidence = getConfidenceMessage();
  const period = `${fmtDate(startDate)} → ${fmtDate(endDate)}`;

  // Last check time
  const lastCheck = data?.lastRun?.ts ? timeAgo(data.lastRun.ts) : null;

  // ── Reusable pill ──

  const Pill: React.FC<{ bg: string; color: string; text: string; icon?: string; onClick?: () => void }> = ({ bg, color: c, text, icon, onClick }) => (
    <span
      onClick={onClick}
      style={{
        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 2,
        background: bg, color: c, whiteSpace: 'nowrap' as const,
        display: 'inline-flex', alignItems: 'center', gap: 3,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {icon && <Icon iconName={icon} style={{ fontSize: 8 }} />}
      {text}
    </span>
  );

  // ── Flat button ──

  const FlatButton: React.FC<{
    text: string; icon?: string; active?: boolean; onClick: () => void;
    activeColor?: string; disabled?: boolean;
  }> = ({ text, icon, active, onClick, activeColor, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? `${activeColor || accent}12` : 'none',
        border: `1px solid ${active ? `${activeColor || accent}40` : (isDarkMode ? 'rgba(148,163,184,0.25)' : '#e2e8f0')}`,
        borderRadius: 2, padding: '4px 8px', fontSize: 9, fontWeight: 700,
        color: active ? (activeColor || accent) : dim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 3,
        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
        transition: 'all 0.15s ease',
      }}
    >
      {icon && <Icon iconName={icon} style={{ fontSize: 9 }} />}
      {text}
    </button>
  );

  // ── Sample slide-down ──

  const renderSamplePanel = () => {
    if (sampleId === null) return null;

    return (
      <div style={{
        margin: '8px 0 4px',
        background: isDarkMode ? 'rgba(15,23,42,0.6)' : '#f8fafc',
        border: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.15)'}`,
        borderRadius: 2, overflow: 'hidden',
      }}>
        {/* Sample header */}
        <div style={{
          padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: `1px solid ${sep}`,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: bright }}>
            Clio ID {sampleId}
          </span>
          {sampleData && (
            <Pill
              bg={isDarkMode ? 'rgba(54,144,206,0.15)' : 'rgba(54,144,206,0.1)'}
              color={accent}
              text={`${sampleData.rowCount} rows · ${sampleData.distinctBills} bill${sampleData.distinctBills !== 1 ? 's' : ''}`}
            />
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setSampleId(null); setSampleData(null); }}
            style={{ background: 'none', border: 'none', fontSize: 12, color: dim, cursor: 'pointer', padding: '2px 4px' }}
          >
            ✕
          </button>
        </div>

        {sampleLoading ? (
          <div style={{ padding: '12px', display: 'flex', gap: 8, alignItems: 'center', color: dim }}>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 10 }}>Loading rows…</span>
          </div>
        ) : sampleData ? (
          <div style={{ padding: '8px 12px' }}>
            {/* Explanation */}
            <div style={{
              fontSize: 10, color: sub, padding: '6px 10px', marginBottom: 8,
              background: isDarkMode ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.04)',
              border: `1px solid ${isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)'}`,
              borderRadius: 2, lineHeight: 1.5,
            }}>
              <Icon iconName="Info" style={{ fontSize: 9, marginRight: 4, color: '#22c55e' }} />
              {sampleData.explanation}
            </div>

            {/* Rows table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 }}>
              <thead>
                <tr style={{ color: dim, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontSize: 8 }}>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Bill ID</th>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Date</th>
                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Amount</th>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {sampleData.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${sep}` }}>
                    <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontSize: 9, color: accent }}>{r.billId}</td>
                    <td style={{ padding: '4px 6px', color: sub, whiteSpace: 'nowrap' as const }}>{fmtDate(r.paymentDate)}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright, fontWeight: 600 }}>{fmtMoney(r.amount)}</td>
                    <td style={{ padding: '4px 6px', color: dim, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={r.description}>{r.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 6px 2px', fontSize: 10, fontWeight: 700, color: bright }}>
              Total: {fmtMoney(sampleData.totalAmount)}
            </div>
          </div>
        ) : (
          <div style={{ padding: 12, color: dim, fontSize: 10 }}>Failed to load sample</div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 2,
      overflow: 'hidden',
    }}>

      {/* ─── Layer 1: Confidence Strip ─── */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${sep}`,
      }}>
        <Icon iconName="Shield" style={{ fontSize: 12, color: statusColor }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: bright, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
          {label || (isCollected ? 'Collected' : 'WIP')}
        </span>
        <span style={{ fontSize: 10, color: dim }}>{period}</span>

        {/* Confidence message */}
        {loading ? (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Spinner size={SpinnerSize.xSmall} />
            <span style={{ fontSize: 10, color: dim }}>{loadingMessage}</span>
          </div>
        ) : confidence && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: confidence.tone === 'good' ? (isDarkMode ? '#4ade80' : '#166534')
                : confidence.tone === 'bad' ? (isDarkMode ? '#f87171' : '#991b1b')
                : dim,
            }}>
              {confidence.text}
            </span>
            {lastCheck && (
              <span style={{ fontSize: 9, color: dim }}>· checked {lastCheck}</span>
            )}
          </div>
        )}
      </div>

      {/* ─── Metrics Row ─── */}
      {data && !loading && (
        <div style={{ padding: '0 14px' }}>
          <div style={{
            display: 'flex', gap: 0, margin: '10px 0',
            background: recessBg,
            border: `1px solid ${subtleBorder}`,
            borderRadius: 2, overflow: 'hidden',
          }}>
            {/* Total */}
            <div style={{
              flex: 1, padding: '8px 12px', minWidth: 0,
              borderRight: `1px solid ${subtleBorder}`,
            }}>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5, marginBottom: 2 }}>Total</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: bright }}>{fmtMoney(data.sqlSum)}</div>
              <div style={{ fontSize: 9, color: dim, marginTop: 1 }}>
                {data.uniqueIds.toLocaleString()} {isCollected ? 'payments' : 'activities'}{splitCount > 0 ? ` · ${splitCount.toLocaleString()} splits` : ''}{!isCollected && data.hours ? ` · ${data.hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h` : ''}
              </div>
            </div>

            {/* Kind Breakdown */}
            {data.kindBreakdown && data.kindBreakdown.length > 0 && (
              <div style={{
                flex: 2, padding: '8px 12px', minWidth: 0,
                borderRight: `1px solid ${subtleBorder}`,
              }}>
                <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5, marginBottom: 4 }}>Breakdown</div>
                <div style={{ display: 'flex', gap: 0 }}>
                  {data.kindBreakdown.map((k, i) => {
                    const pct = data.sqlSum ? Math.round((k.total / data.sqlSum) * 100) : 0;
                    return (
                      <div key={k.kind} style={{
                        flex: 1, minWidth: 0,
                        borderRight: i < data.kindBreakdown!.length - 1 ? `1px solid ${subtleBorder}` : 'none',
                        paddingRight: i < data.kindBreakdown!.length - 1 ? 10 : 0,
                        paddingLeft: i > 0 ? 10 : 0,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: bright }}>{fmtMoney(k.total)}</span>
                          <span style={{ fontSize: 8, fontWeight: 600, color: dim }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: 8, color: dim, marginTop: 1 }}>
                          {k.kind} · {k.payments.toLocaleString()}{k.hours ? ` · ${k.hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Last Sync */}
            <div style={{ flex: 1, padding: '8px 12px', minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5, marginBottom: 2 }}>Last Sync</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: bright }}>{data.lastRun ? fmtLogTime(data.lastRun.ts) : 'Never'}</div>
              <div style={{ fontSize: 8, color: dim, marginTop: 2 }}>
                {data.dataSource === 'api' ? 'via Activities API' : isCollected ? 'via Reports API' : ''}
              </div>
            </div>
          </div>

          {/* Clio verification (only after deep validation) */}
          {data.clioSum !== null && data.sqlSum !== null && (() => {
            const diff = Math.abs((data.sqlSum || 0) - (data.clioSum || 0));
            const match = diff < 0.01;
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', marginBottom: 8,
                background: match
                  ? (isDarkMode ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)')
                  : (isDarkMode ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.03)'),
                border: `1px solid ${match
                  ? (isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')
                  : (isDarkMode ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.1)')}`,
                borderRadius: 2, fontSize: 9,
              }}>
                <Icon iconName={match ? 'CheckMark' : 'Warning'} style={{ fontSize: 10, color: match ? '#22c55e' : '#ef4444' }} />
                <span style={{ fontWeight: 600, color: match ? (isDarkMode ? '#4ade80' : '#166534') : (isDarkMode ? '#f87171' : '#991b1b') }}>
                  {match ? 'Verified' : `${fmtMoney(diff)} discrepancy`}
                </span>
                <span style={{ color: dim }}>
                  {fmtMoney(data.sqlSum)} synced{match ? '' : ` vs ${fmtMoney(data.clioSum)} in Clio`}
                </span>
              </div>
            );
          })()}

          {/* Spot checks */}
          {data.spotChecks && data.spotChecks.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10 }}>
              {data.spotChecks.map((sc, i) => {
                const hasClio = sc.clioRows !== undefined && sc.clioRows !== null;
                const rowMatch = hasClio && sc.rows === sc.clioRows;
                const sumMatchSc = hasClio && Math.abs(sc.total - (sc.clioTotal || 0)) < 0.01;
                const isOk = hasClio && rowMatch && sumMatchSc;
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 0,
                    background: recessBg, border: `1px solid ${subtleBorder}`,
                    borderRadius: 2, fontSize: 10, overflow: 'hidden',
                  }}>
                    <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, borderRight: `1px solid ${subtleBorder}` }}>
                      <Icon iconName="Contact" style={{ fontSize: 9, color: accent, opacity: 0.7 }} />
                      <span style={{ fontWeight: 600, color: bright }}>{sc.name}</span>
                    </div>
                    <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontWeight: 600, color: bright, fontSize: 9 }}>{sc.rows} · {fmtMoney(sc.total)}</span>
                      {hasClio && (
                        isOk
                          ? <Icon iconName="CheckMark" style={{ fontSize: 10, color: isDarkMode ? '#4ade80' : '#166534' }} />
                          : <span style={{ fontSize: 8, fontWeight: 600, color: isDarkMode ? '#f87171' : '#991b1b' }}>
                              ±{fmtMoney(Math.abs(sc.total - (sc.clioTotal || 0)))}
                            </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Action Row ─── */}
      {data && !loading && (
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 4, alignItems: 'center' }}>
          <FlatButton text="Activity" icon="TimelineProgress" active={logOpen} onClick={() => setLogOpen(!logOpen)} />

          <div style={{ flex: 1 }} />

          <FlatButton text="Analyse" icon="AnalyticsView" active={explainOpen} onClick={() => { setExplainOpen(!explainOpen); if (explainOpen) setExplainData(null); }} activeColor={accent} />
          <FlatButton
            text="Deep Validate"
            icon="Sync"
            onClick={() => runValidation(true)}
            disabled={loading}
          />
        </div>
      )}

      {/* ─── Layer 2: Activity Timeline + Live Processing (side-by-side) ─── */}
      {logOpen && (
        <div style={{
          borderTop: `1px solid ${sep}`,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : '#fafbfc',
          padding: '8px 12px',
        }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {/* ── Left column: Audit Trail (DB-persisted) ── */}
            <div style={{ flex: 3, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <Icon iconName="TimelineProgress" style={{ fontSize: 9, color: dim }} />
                <span style={{ fontSize: 8, fontWeight: 700, color: dim, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
                  Audit Trail
                </span>
                <span style={{ fontSize: 7, color: isDarkMode ? '#334155' : '#d1d5db' }}>
                  {logEntries.length} {logEntries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' as const }}>
                {logEntries.length === 0 ? (
                  <div style={{ color: dim, padding: 8, textAlign: 'center' as const, fontSize: 10 }}>
                    No operations logged yet
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {logEntries.map((entry, i) => {
                      const isCompleted = entry.status === 'completed';
                      const isRawError = entry.status === 'error';
                      const isStarted = entry.status === 'started';
                      const isValidated = entry.status === 'validated';
                      // Detect "no data from Clio" — either the new 'no-data' status or legacy error entries with the timeout message
                      const isNoData = entry.status === 'no-data' || (isRawError && (entry.message || '').includes('timed out with no data'));
                      const isError = isRawError && !isNoData;
                      const source = entry.triggeredBy || 'manual';
                      const isAuto = source === 'timer' || source === 'scheduler' || source === 'auto' || source === 'system';

                      const dotColor = isValidated ? '#22c55e' : isCompleted ? '#22c55e' : isNoData ? '#f59e0b' : isError ? '#ef4444' : isStarted ? '#3b82f6' : '#94a3b8';

                      const statusLabel = isValidated ? '✓ validated' : isCompleted ? '✓ completed' : isNoData ? '○ no data' : isError ? '✕ error' : isStarted ? '○ started' : entry.status;
                      const sColor = isValidated ? (isDarkMode ? '#4ade80' : '#15803d')
                        : isCompleted ? (isDarkMode ? '#4ade80' : '#166534')
                        : isNoData ? (isDarkMode ? '#fbbf24' : '#b45309')
                        : isError ? (isDarkMode ? '#f87171' : '#991b1b')
                        : isStarted ? (isDarkMode ? '#38bdf8' : '#0369a1')
                        : dim;

                      const opRaw = entry.operation || '';
                      const isWipOp = opRaw.toLowerCase().includes('wip');
                      const opEntity = isWipOp ? 'WIP' : 'Collected';

                      let dateRange = '';
                      if (entry.startDate && entry.endDate) {
                        const s = entry.startDate.slice(0, 10);
                        const e = entry.endDate.slice(0, 10);
                        const fmtShort = (d: string) => {
                          const dt = new Date(d + 'T00:00:00');
                          return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                        };
                        dateRange = `${fmtShort(s)} → ${fmtShort(e)}`;
                      } else if (entry.message) {
                        const dateMatch = entry.message.match(/(\d{4}-\d{2}-\d{2})\s*→\s*(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) {
                          const fmtShort = (d: string) => {
                            const dt = new Date(d + 'T00:00:00');
                            return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
                          };
                          dateRange = `${fmtShort(dateMatch[1])} → ${fmtShort(dateMatch[2])}`;
                        }
                      }

                      let outcome = '';
                      if (isValidated) {
                        outcome = entry.message || '';
                      } else if (isCompleted) {
                        const parts: string[] = [];
                        if (entry.deletedRows != null && entry.deletedRows > 0) parts.push(`−${entry.deletedRows.toLocaleString()}`);
                        if (entry.insertedRows != null) parts.push(`+${entry.insertedRows.toLocaleString()} rows`);
                        if (entry.durationMs) parts.push(`${(entry.durationMs / 1000).toFixed(1)}s`);
                        outcome = parts.join(' · ') || entry.message || '';
                      } else if (isNoData) {
                        outcome = 'Clio returned no data for this range';
                      } else if (isError) {
                        outcome = entry.message || 'Unknown error';
                      } else if (isStarted) {
                        const modeMatch = entry.message?.match(/\((replace|insert|delete)\)/);
                        outcome = modeMatch ? modeMatch[1] : '';
                      }

                      const invoker = entry.invokedBy || (isAuto ? 'system' : '');

                      return (
                        <div key={entry.id || i} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 0,
                          padding: '5px 0',
                          borderBottom: i < logEntries.length - 1 ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'}` : 'none',
                        }}>
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: dotColor, flexShrink: 0,
                            boxShadow: `0 0 4px ${dotColor}40`,
                            marginTop: 4, marginRight: 6,
                          }} />
                          <div style={{ minWidth: 100, maxWidth: 100, flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{
                                fontSize: 7, fontWeight: 800,
                                textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                                color: isAuto ? (isDarkMode ? '#38bdf8' : '#0369a1') : (isDarkMode ? '#f87171' : '#b91c1c'),
                              }}>
                                {isAuto ? 'AUTO' : 'USER'}
                              </span>
                              {invoker && (
                                <span style={{
                                  fontSize: 8, fontWeight: 500,
                                  color: isDarkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                                  maxWidth: 60,
                                }} title={invoker}>
                                  {invoker.split(' ')[0]}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 8, color: isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
                              {fmtLogTime(entry.ts)}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' as const }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: sColor }}>
                                {statusLabel}
                              </span>
                              <span style={{
                                fontSize: 7, fontWeight: 700, letterSpacing: '0.4px',
                                color: isWipOp ? '#14b8a6' : '#3b82f6',
                                background: isWipOp
                                  ? (isDarkMode ? 'rgba(20,184,166,0.12)' : 'rgba(20,184,166,0.08)')
                                  : (isDarkMode ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.08)'),
                                padding: '1px 4px', borderRadius: 2,
                                textTransform: 'uppercase' as const,
                              }}>
                                {opEntity}
                              </span>
                              {dateRange && (
                                <span style={{ fontSize: 8, color: dim, fontWeight: 500, fontFamily: 'monospace' }}>
                                  {dateRange}
                                </span>
                              )}
                            </div>
                            {outcome && (
                              <div style={{
                                fontSize: 9, color: sub, marginTop: 1,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                              }} title={entry.message || ''}>
                                {outcome}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column: Live Processing (in-memory) ── */}
            <div style={{
              flex: 2, minWidth: 0,
              borderLeft: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
              paddingLeft: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                {isSyncing && (
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#3b82f6',
                    boxShadow: '0 0 8px rgba(59,130,246,0.6)',
                    animation: 'ops-pulse 1.5s infinite',
                    flexShrink: 0,
                  }} />
                )}
                <Icon iconName="Processing" style={{ fontSize: 9, color: isSyncing ? (isDarkMode ? '#93c5fd' : '#3b82f6') : dim }} />
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: isSyncing ? (isDarkMode ? '#93c5fd' : '#3b82f6') : dim,
                  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                }}>
                  {isSyncing ? 'Live' : 'Processing'}
                </span>
                <span style={{ fontSize: 7, color: isDarkMode ? '#334155' : '#d1d5db' }}>
                  {liveLog.length} {liveLog.length === 1 ? 'step' : 'steps'}
                </span>
              </div>
              <div
                ref={(el) => { if (el && isSyncing) el.scrollTop = el.scrollHeight; }}
                style={{
                  maxHeight: 260, overflowY: 'auto' as const,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                }}
              >
                {liveLog.length === 0 ? (
                  <div style={{ color: dim, padding: 8, textAlign: 'center' as const, fontSize: 10 }}>
                    {isSyncing ? 'Waiting for server…' : 'No processing steps'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {liveLog.slice(0, 15).map((op, idx) => {
                      const isLatest = idx === 0;
                      const isProgress = op.status === 'progress';
                      const isError = op.status === 'error';
                      const isComplete = op.status === 'completed';
                      return (
                        <div
                          key={op.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 6,
                            padding: '3px 6px',
                            background: isLatest && isSyncing
                              ? (isDarkMode ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)')
                              : 'transparent',
                            borderLeft: isLatest && isSyncing
                              ? '2px solid rgba(59,130,246,0.5)'
                              : '2px solid transparent',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <span style={{
                            fontSize: 9, fontWeight: 500,
                            color: isDarkMode ? '#475569' : '#94a3b8',
                            flexShrink: 0, minWidth: 48,
                          }}>
                            {new Date(op.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, flexShrink: 0, width: 10, textAlign: 'center' as const,
                            color: isComplete ? '#22c55e' : isError ? '#ef4444' : isProgress ? (isDarkMode ? '#93c5fd' : '#3b82f6') : (isDarkMode ? '#64748b' : '#94a3b8'),
                          }}>
                            {isComplete ? '✓' : isError ? '✗' : isProgress ? '›' : '·'}
                          </span>
                          <span style={{
                            flex: 1, fontSize: 9,
                            color: isError ? '#fca5a5'
                              : isProgress && isLatest ? (isDarkMode ? '#bfdbfe' : '#2563eb')
                              : (isDarkMode ? '#64748b' : '#9ca3af'),
                            whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
                            fontStyle: isProgress ? 'italic' : 'normal',
                          }}>
                            {op.message || op.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Layer 3: Explain Panel ─── */}
      {explainOpen && (
        <div style={{
          borderTop: `1px solid ${isDarkMode ? 'rgba(54,144,206,0.2)' : 'rgba(54,144,206,0.15)'}`,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.5)' : '#f8fafc',
          padding: '12px 14px',
          maxHeight: 600, overflowY: 'auto' as const,
        }}>
          {explainLoading ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: dim, padding: '8px 0' }}>
              <Spinner size={SpinnerSize.xSmall} />
              <span style={{ fontSize: 10, fontWeight: 500 }}>Analysing data pipeline…</span>
            </div>
          ) : explainData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

              {/* ── Collapsible Section Header Component ── */}
              {(() => {
                const SectionToggle: React.FC<{
                  icon: string; text: string; open: boolean; onToggle: () => void;
                  count?: number; color?: string; summary?: string;
                }> = ({ icon, text, open: isOpen, onToggle, count, color: sColor, summary }) => (
                  <button
                    onClick={onToggle}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 0', border: 'none', background: 'none', cursor: 'pointer',
                      borderBottom: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}`,
                      textAlign: 'left' as const,
                    }}
                  >
                    <Icon iconName={isOpen ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 8, color: dim, flexShrink: 0 }} />
                    <Icon iconName={icon} style={{ fontSize: 9, color: sColor || accent }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: sColor || accent, textTransform: 'uppercase' as const, letterSpacing: '0.6px' }}>{text}</span>
                    {count !== undefined && (
                      <span style={{ fontSize: 8, fontWeight: 700, color: dim, background: recessBg, padding: '1px 5px', borderRadius: 2 }}>{count}</span>
                    )}
                    {summary && !isOpen && (
                      <span style={{ fontSize: 9, color: dim, marginLeft: 'auto', fontWeight: 400 }}>{summary}</span>
                    )}
                  </button>
                );

                return (
                  <>
                    {/* ── Pipeline ── */}
                    <SectionToggle
                      icon="Flow" text="Pipeline" open={pipelineOpen} onToggle={() => setPipelineOpen(p => !p)}
                      count={explainData.pipeline.length}
                    />
                    {pipelineOpen && (
                      <div style={{ padding: '4px 0 8px 18px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          {explainData.pipeline.map((p, i) => (
                            <div key={i} style={{
                              display: 'flex', gap: 10, alignItems: 'flex-start',
                              padding: '5px 0',
                              borderBottom: i < explainData.pipeline.length - 1 ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'}` : 'none',
                            }}>
                              <span style={{
                                fontSize: 8, fontWeight: 800, color: accent,
                                background: `${accent}15`, padding: '2px 5px', borderRadius: 2,
                                minWidth: 16, textAlign: 'center' as const, flexShrink: 0,
                              }}>{p.step}</span>
                              <div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: bright }}>{p.label}</div>
                                <div style={{ fontSize: 9, color: dim, marginTop: 1 }}>{p.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── Sum Impact ── */}
                    <SectionToggle
                      icon={explainData.sumComparison.warning ? 'Warning' : 'CheckMark'}
                      text="Dedup impact"
                      open={sumImpactOpen} onToggle={() => setSumImpactOpen(p => !p)}
                      color={explainData.sumComparison.warning ? '#f59e0b' : '#22c55e'}
                      summary={explainData.sumComparison.difference > 0.01 ? `−${fmtMoney(explainData.sumComparison.difference)}` : 'clean'}
                    />
                    {sumImpactOpen && (
                      <div style={{
                        padding: '8px 12px', margin: '4px 0 8px 18px',
                        background: explainData.sumComparison.warning
                          ? (isDarkMode ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.05)')
                          : (isDarkMode ? 'rgba(34,197,94,0.06)' : 'rgba(34,197,94,0.03)'),
                        border: `1px solid ${explainData.sumComparison.warning
                          ? (isDarkMode ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.15)')
                          : (isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)')}`,
                        borderRadius: 2,
                      }}>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const }}>
                          <div>
                            <div style={{ fontSize: 8, fontWeight: 700, color: dim, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>All rows</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: bright }}>{fmtMoney(explainData.sumComparison.sumAllRows)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 8, fontWeight: 700, color: dim, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Deduped</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: bright }}>{fmtMoney(explainData.sumComparison.sumDistinctIds)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 8, fontWeight: 700, color: dim, textTransform: 'uppercase' as const, letterSpacing: '0.5px' }}>Delta</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: explainData.sumComparison.difference > 0.01 ? '#ef4444' : '#22c55e' }}>
                              {explainData.sumComparison.difference > 0.01 ? fmtMoney(explainData.sumComparison.difference) : '£0.00'}
                            </div>
                          </div>
                        </div>
                        {explainData.sumComparison.warning && (
                          <div style={{ fontSize: 9, color: isDarkMode ? '#fbbf24' : '#92400e', marginTop: 8, fontWeight: 600 }}>
                            Split allocations — don't dedup.
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Distribution ── */}
                    {explainData.duplicateDistribution.length > 0 && (
                      <>
                        <SectionToggle
                          icon="BulletedList" text="Distribution"
                          open={distributionOpen} onToggle={() => setDistributionOpen(p => !p)}
                          count={explainData.duplicateDistribution.length}
                        />
                        {distributionOpen && (
                          <div style={{ padding: '4px 0 8px 18px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 }}>
                              <thead>
                                <tr style={{ color: dim, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontSize: 8 }}>
                                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Rows per Clio ID</th>
                                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>IDs</th>
                                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Total Rows</th>
                                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Share</th>
                                </tr>
                              </thead>
                              <tbody>
                                {explainData.duplicateDistribution.map((d, i) => {
                                  const pct = explainData.summary.totalRows > 0
                                    ? ((d.totalRows / explainData.summary.totalRows) * 100).toFixed(1) : '0';
                                  const isMulti = d.occurrences > 1;
                                  return (
                                    <tr key={i} style={{ borderBottom: `1px solid ${sep}` }}>
                                      <td style={{ padding: '4px 6px', color: isMulti ? '#f59e0b' : bright, fontWeight: isMulti ? 700 : 500 }}>
                                        {d.occurrences === 1 ? '1×' : `${d.occurrences}×`}
                                      </td>
                                      <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright }}>{d.distinctIds.toLocaleString()}</td>
                                      <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright }}>{d.totalRows.toLocaleString()}</td>
                                      <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: dim }}>{pct}%</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Split Allocations ── */}
                    {explainData.topMultiRowIds.length > 0 && (
                      <>
                        <SectionToggle
                          icon="DocumentSearch" text="Splits"
                          open={splitsOpen} onToggle={() => setSplitsOpen(p => !p)}
                          count={explainData.topMultiRowIds.length} color="#f59e0b"
                        />
                        {splitsOpen && (
                          <div style={{ padding: '4px 0 8px 18px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 }}>
                              <thead>
                                <tr style={{ color: dim, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontSize: 8 }}>
                                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Clio ID</th>
                                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Rows</th>
                                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Total</th>
                                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>User</th>
                                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Description</th>
                                </tr>
                              </thead>
                              <tbody>
                                {explainData.topMultiRowIds.map((d, i) => {
                                  const isSelected = sampleId === d.id;
                                  return (
                                    <React.Fragment key={i}>
                                      <tr
                                        onClick={() => {
                                          if (isSelected) { setSampleId(null); setSampleData(null); }
                                          else fetchSample(d.id);
                                        }}
                                        style={{
                                          borderBottom: `1px solid ${sep}`,
                                          cursor: 'pointer',
                                          background: isSelected ? `${accent}08` : 'transparent',
                                          transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = `${accent}06`; }}
                                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                                      >
                                        <td style={{ padding: '4px 6px', color: accent, fontFamily: 'monospace', fontSize: 9, fontWeight: 600 }}>
                                          <Icon iconName={isSelected ? 'ChevronDown' : 'ChevronRight'} style={{ fontSize: 8, marginRight: 3 }} />
                                          {d.id}
                                        </td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: '#f59e0b', fontWeight: 700 }}>{d.rowCount}×</td>
                                        <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright, fontWeight: 600 }}>{fmtMoney(d.totalAmount)}</td>
                                        <td style={{ padding: '4px 6px', color: sub }}>{d.userName}</td>
                                        <td style={{ padding: '4px 6px', color: dim, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={d.matterDesc}>{d.matterDesc}</td>
                                      </tr>
                                      {isSelected && (
                                        <tr><td colSpan={5} style={{ padding: 0 }}>{renderSamplePanel()}</td></tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Per-User Breakdown ── */}
                    <SectionToggle
                      icon="People" text="Per user"
                      open={perUserOpen} onToggle={() => setPerUserOpen(p => !p)}
                      count={explainData.perUser.length}
                      summary={fmtMoney(explainData.summary.totalSum || explainData.perUser.reduce((a, u) => a + u.sum, 0))}
                    />
                    {perUserOpen && (
                      <div style={{ padding: '4px 0 8px 18px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 }}>
                          <thead>
                            <tr style={{ color: dim, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontSize: 8 }}>
                              <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Name</th>
                              <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Rows</th>
                              <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Payments</th>
                              <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Splits</th>
                              <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {explainData.perUser.map((u, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${sep}` }}>
                                <td style={{ padding: '4px 6px', color: bright, fontWeight: 600 }}>{u.name}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright }}>{u.totalRows.toLocaleString()}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright }}>{u.uniqueIds.toLocaleString()}</td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: u.extraRows > 0 ? '#f59e0b' : dim, fontWeight: u.extraRows > 0 ? 700 : 400 }}>
                                  {u.extraRows > 0 ? `+${u.extraRows}` : '—'}
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'right' as const, color: bright, fontWeight: 600 }}>{fmtMoney(u.sum)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ── Queries ── */}
                    <SectionToggle
                      icon="CodeEdit" text="Queries"
                      open={queriesOpen} onToggle={() => setQueriesOpen(p => !p)}
                      count={explainData.queries.length}
                    />
                    {queriesOpen && (
                      <div style={{ padding: '4px 0 8px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {explainData.queries.map((q, i) => (
                          <div key={i} style={{
                            background: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                            borderRadius: 2, padding: '6px 10px',
                          }}>
                            <div style={{ fontSize: 8, fontWeight: 700, color: dim, textTransform: 'uppercase' as const, letterSpacing: '0.5px', marginBottom: 3 }}>{q.label}</div>
                            <code style={{
                              fontSize: 9, color: isDarkMode ? '#93c5fd' : '#1e40af',
                              fontFamily: 'Consolas, "Courier New", monospace',
                              lineHeight: 1.5, whiteSpace: 'pre-wrap' as const,
                              wordBreak: 'break-all' as const, display: 'block',
                            }}>
                              {q.sql}
                            </code>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── Footer ── */}
                    <div style={{
                      fontSize: 9, color: dim,
                      borderTop: `1px solid ${sep}`, paddingTop: 6, marginTop: 4,
                      display: 'flex', gap: 16, flexWrap: 'wrap' as const,
                    }}>
                      <span>Table: <strong style={{ color: sub }}>{explainData.table}</strong></span>
                      <span>Date column: <strong style={{ color: sub }}>{explainData.dateRange.dateColumn}</strong></span>
                      <span>Users: <strong style={{ color: sub }}>{explainData.summary.uniqueUsers}</strong></span>
                      <span>Matters: <strong style={{ color: sub }}>{explainData.summary.uniqueMatters}</strong></span>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            <div style={{ color: dim, padding: 8, textAlign: 'center' as const, fontSize: 10 }}>
              Failed to load — check server connection
            </div>
          )}
        </div>
      )}
    </div>
  );
};
