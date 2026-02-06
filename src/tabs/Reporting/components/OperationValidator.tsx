import React, { useEffect, useState, useCallback } from 'react';
import { Spinner, SpinnerSize, Icon } from '@fluentui/react';
import { useTheme } from '../../../app/functionality/ThemeContext';

interface Props {
  operation: string;
  startDate?: string;
  endDate?: string;
  label?: string;
  accentColor?: string;
  onValidationComplete?: (isValid: boolean) => void;
}

interface SpotCheck {
  name: string;
  userId: number;
  rows: number;
  total: number;
  clioRows?: number;
  clioTotal?: number;
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
}

const fmtMoney = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '—';
  return `£${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (iso: string | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

export const OperationValidator: React.FC<Props> = ({ operation, startDate, endDate, label, accentColor }) => {
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [deepLoading, setDeepLoading] = useState(false);
  const [data, setData] = useState<ValidateData | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Validating period...');
  const [logEntries, setLogEntries] = useState<OpsLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);

  const isCollected = operation?.includes('Collected');
  const accent = accentColor || (isCollected ? '#3b82f6' : '#14b8a6');

  const runValidation = useCallback(async (deep = false) => {
    if (!startDate || !endDate) {
      setData(null);
      return;
    }
    if (deep) {
      setDeepLoading(true);
      setLoadingMessage(isCollected ? 'Generating Clio report — this takes 30-60s…' : 'Counting Clio activities…');
    } else {
      setLoadingMessage('Validating…');
    }
    setLoading(true);
    try {
      const s = typeof startDate === 'string' ? startDate : (startDate as any).toISOString();
      const e = typeof endDate === 'string' ? endDate : (endDate as any).toISOString();
      const deepParam = deep ? '&deep=true' : '';
      const res = await fetch(`/api/data-operations/validate?operation=${operation}&startDate=${s}&endDate=${e}${deepParam}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setDeepLoading(false);
    }
  }, [operation, startDate, endDate, isCollected]);

  const fetchLog = useCallback(async () => {
    try {
      const opPrefix = operation?.includes('Collected') ? 'syncCollectedTime' :
                       operation?.includes('Wip') ? 'syncWip' : operation;
      const res = await fetch(`/api/data-operations/ops-log?operation=${opPrefix}&limit=15`);
      if (res.ok) {
        const json = await res.json();
        setLogEntries(json.entries || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [operation]);

  useEffect(() => {
    if (!startDate || !endDate) { setData(null); return; }
    const t = setTimeout(() => runValidation(false), 600);
    return () => clearTimeout(t);
  }, [operation, startDate, endDate, runValidation]);

  useEffect(() => { if (logOpen) fetchLog(); }, [logOpen, fetchLog]);

  if (!startDate || !endDate) return null;

  const hasDupes = data ? data.totalRows > data.uniqueIds : false;
  const countDiff = data?.clioCount !== null && data?.clioCount !== undefined
    ? Math.abs((data?.sqlCount || 0) - (data?.clioCount || 0))
    : null;
  const sumDiff = data?.sqlSum !== null && data?.clioSum !== null && data?.sqlSum !== undefined && data?.clioSum !== undefined
    ? Math.abs((data.sqlSum || 0) - (data.clioSum || 0))
    : null;
  const isHealthy = data?.match === true && !hasDupes;

  const dim = isDarkMode ? '#94a3b8' : '#64748b';
  const bright = isDarkMode ? '#f1f5f9' : '#0f172a';
  const sub = isDarkMode ? '#cbd5e1' : '#475569';
  const cardBg = isDarkMode ? '#1e293b' : '#fff';
  const borderCol = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const sep = isDarkMode ? 'rgba(148, 163, 184, 0.15)' : '#f1f5f9';
  const recessBg = isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.8)';

  const statusColor = loading ? '#94a3b8' : !data ? '#e2e8f0' : isHealthy ? '#22c55e' : hasDupes ? '#f59e0b' : (data.clioCount !== null && !data.match) ? '#ef4444' : '#f59e0b';

  const Badge: React.FC<{ bg: string; color: string; text: string }> = ({ bg, color: c, text }) => (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: bg, color: c, whiteSpace: 'nowrap' as const }}>{text}</span>
  );

  const period = `${fmtDate(startDate)} → ${fmtDate(endDate)}`;

  return (
    <div style={{
      background: cardBg,
      border: `1px solid ${borderCol}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderBottom: `1px solid ${sep}`,
      }}>
        <Icon iconName="Shield" style={{ fontSize: 12, color: accent }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: bright, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
          {label || (isCollected ? 'Collected Integrity' : 'WIP Integrity')}
        </span>
        <span style={{ fontSize: 10, color: dim, fontWeight: 400 }}>{period}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {/* Badges */}
          {data && isHealthy && <Badge bg={isDarkMode ? 'rgba(34,197,94,0.2)' : '#dcfce7'} color={isDarkMode ? '#4ade80' : '#166534'} text="Synced" />}
          {data && hasDupes && <Badge bg={isDarkMode ? 'rgba(245,158,11,0.15)' : '#fef3c7'} color={isDarkMode ? '#fbbf24' : '#92400e'} text={`${(data.totalRows - data.uniqueIds).toLocaleString()} dupes`} />}
          {countDiff !== null && countDiff > 0 && <Badge bg={isDarkMode ? 'rgba(239,68,68,0.2)' : '#fee2e2'} color={isDarkMode ? '#f87171' : '#991b1b'} text={`Diff: ${countDiff.toLocaleString()}`} />}
          {sumDiff !== null && sumDiff > 0.01 && <Badge bg={isDarkMode ? 'rgba(239,68,68,0.15)' : '#fef2f2'} color={isDarkMode ? '#f87171' : '#991b1b'} text={`£ ${fmtMoney(sumDiff)}`} />}
          {data && data.clioCount === null && data.sqlCount > 0 && <Badge bg={isDarkMode ? 'rgba(245,158,11,0.15)' : '#fef3c7'} color={isDarkMode ? '#fbbf24' : '#92400e'} text="SQL only" />}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 14px' }}>
        {loading ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: dim, padding: '6px 0' }}>
            <Spinner size={SpinnerSize.xSmall} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 500, fontSize: 11 }}>{loadingMessage}</span>
              {deepLoading && isCollected && (
                <span style={{ fontSize: 10, opacity: 0.7 }}>Requesting invoice_payments_v2 report from Clio</span>
              )}
            </div>
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Metrics row */}
            <div style={{
              display: 'flex',
              gap: 0,
              background: recessBg,
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
              borderRadius: 2,
              overflow: 'hidden',
            }}>
              {[
                { label: 'SQL Rows', value: data.sqlCount?.toLocaleString() || '0', sub: hasDupes ? `${data.totalRows.toLocaleString()} raw` : undefined },
                { label: 'Clio Lines', value: data.clioCount !== null ? data.clioCount.toLocaleString() : '—' },
                ...(data.sqlSum !== null ? [{ label: 'SQL £', value: fmtMoney(data.sqlSum) }] : []),
                ...(data.clioSum !== null ? [{ label: 'Clio £', value: fmtMoney(data.clioSum) }] : []),
                { label: 'Last Run', value: data.lastRun ? new Date(data.lastRun.ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + new Date(data.lastRun.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never' },
              ].map((m, i) => (
                <div key={i} style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRight: i < 4 ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` : 'none',
                  minWidth: 0,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5, marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: bright, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.value}</div>
                  {m.sub && <div style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600, marginTop: 1 }}>{m.sub}</div>}
                </div>
              ))}
            </div>

            {/* Spot checks */}
            {data.spotChecks && data.spotChecks.length > 0 && (
              <div style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap' as const,
              }}>
                {data.spotChecks.map((sc, i) => {
                  const hasCliо = sc.clioRows !== undefined && sc.clioRows !== null;
                  const rowMatch = hasCliо && sc.rows === sc.clioRows;
                  const sumMatch = hasCliо && Math.abs(sc.total - (sc.clioTotal || 0)) < 0.01;
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0,
                      background: recessBg,
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                      borderRadius: 2,
                      fontSize: 10,
                      overflow: 'hidden',
                    }}>
                      {/* Name */}
                      <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5, borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                        <Icon iconName="Contact" style={{ fontSize: 10, color: accent, opacity: 0.7 }} />
                        <span style={{ fontWeight: 600, color: bright }}>{sc.name}</span>
                      </div>
                      {/* SQL */}
                      <div style={{ padding: '4px 10px', borderRight: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5 }}>SQL</div>
                        <div style={{ fontWeight: 600, color: bright }}>{sc.rows} rows · {fmtMoney(sc.total)}</div>
                      </div>
                      {/* Clio */}
                      <div style={{ padding: '4px 10px', borderRight: hasCliо ? `1px solid ${isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` : 'none' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase' as const, color: dim, letterSpacing: 0.5 }}>Clio</div>
                        <div style={{ fontWeight: 600, color: hasCliо ? bright : dim }}>
                          {hasCliо ? `${sc.clioRows} rows · ${fmtMoney(sc.clioTotal)}` : <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Validate</span>}
                        </div>
                      </div>
                      {/* Status */}
                      {hasCliо && (
                        <div style={{ padding: '4px 8px' }}>
                          {rowMatch && sumMatch ? (
                            <Icon iconName="CheckMark" style={{ fontSize: 12, color: isDarkMode ? '#4ade80' : '#166534' }} />
                          ) : (
                            <span style={{ fontSize: 9, fontWeight: 700, color: isDarkMode ? '#f87171' : '#991b1b' }}>
                              {!rowMatch ? `±${Math.abs(sc.rows - (sc.clioRows || 0))}` : ''}{!rowMatch && !sumMatch ? ' · ' : ''}{!sumMatch ? `£${Math.abs(sc.total - (sc.clioTotal || 0)).toFixed(2)}` : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button
                onClick={() => setLogOpen(!logOpen)}
                title="View ops log"
                style={{
                  background: 'none',
                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'}`,
                  borderRadius: 3,
                  padding: '4px 8px',
                  fontSize: 9,
                  fontWeight: 700,
                  color: logOpen ? bright : dim,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = isDarkMode ? '#94a3b8' : '#94a3b8'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'; }}
              >
                <Icon iconName="TimelineProgress" style={{ fontSize: 9 }} />
                Log
              </button>

              <div style={{ flex: 1 }} />

              <button
                onClick={() => runValidation(true)}
                disabled={loading}
                title={isCollected ? 'Deep validate — generates Clio report (30-60s)' : 'Re-check counts from Clio API'}
                style={{
                  background: 'none',
                  border: `1px solid ${isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'}`,
                  borderRadius: 3,
                  padding: '4px 10px',
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.04em',
                  color: dim,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.borderColor = isDarkMode ? '#94a3b8' : '#94a3b8'; e.currentTarget.style.color = bright; } }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isDarkMode ? 'rgba(148,163,184,0.3)' : '#e2e8f0'; e.currentTarget.style.color = dim; }}
              >
                <Icon iconName="Sync" style={{ fontSize: 9 }} />
                Validate
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Ops Log panel */}
      {logOpen && (
        <div style={{
          borderTop: `1px dashed ${sep}`,
          background: isDarkMode ? 'rgba(15, 23, 42, 0.3)' : '#fafbfc',
          padding: '8px 10px',
          maxHeight: 200,
          overflowY: 'auto' as const,
        }}>
          {logEntries.length === 0 ? (
            <div style={{ color: dim, fontStyle: 'italic', padding: 8, textAlign: 'center' as const, fontSize: 10 }}>No log entries</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 10 }}>
              <thead>
                <tr style={{ color: dim, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, fontSize: 8 }}>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Time</th>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Op</th>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Status</th>
                  <th style={{ textAlign: 'left' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Message</th>
                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Del</th>
                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Ins</th>
                  <th style={{ textAlign: 'right' as const, padding: '3px 6px', borderBottom: `1px solid ${sep}` }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.map((entry, i) => {
                  const sColor = entry.status === 'completed' ? (isDarkMode ? '#4ade80' : '#166534') :
                                 entry.status === 'error' ? (isDarkMode ? '#f87171' : '#991b1b') :
                                 entry.status === 'started' ? (isDarkMode ? '#38bdf8' : '#0369a1') : dim;
                  const ts = new Date(entry.ts);
                  return (
                    <tr key={entry.id || i} style={{ borderBottom: `1px solid ${sep}` }}>
                      <td style={{ padding: '3px 6px', color: dim, whiteSpace: 'nowrap' as const }} title={ts.toLocaleString()}>
                        {ts.toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td style={{ padding: '3px 6px', color: bright, fontFamily: 'monospace', fontSize: 9 }}>
                        {(entry.operation || '').replace('syncCollectedTime', 'coll').replace('syncWip', 'wip')}
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <span style={{ color: sColor, fontWeight: 600 }}>{entry.status}</span>
                      </td>
                      <td style={{ padding: '3px 6px', color: sub, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={entry.message}>
                        {entry.message || '—'}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' as const, color: entry.deletedRows ? (isDarkMode ? '#fbbf24' : '#92400e') : dim }}>
                        {entry.deletedRows ?? '—'}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' as const, color: entry.insertedRows ? (isDarkMode ? '#4ade80' : '#166534') : dim }}>
                        {entry.insertedRows ?? '—'}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right' as const, color: dim, whiteSpace: 'nowrap' as const }}>
                        {entry.durationMs ? `${(entry.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
